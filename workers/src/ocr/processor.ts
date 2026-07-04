// Pipeline OCR completo (ESPECIFICACION.md §5): MinIO → Claude → reglas de
// confianza → validaciones determinísticas → estado de la factura.

import type { Job } from 'bullmq';
import {
  buildFiscalValidation,
  CATEGORIAS_606,
  DEFAULT_CONFIDENCE_THRESHOLD,
  evaluateExtraction,
  fechaToPeriodoFiscal,
  validateTaxId,
} from '@facturard/shared';
import { prisma, Prisma } from '@facturard/shared/db';
import { getImageBase64 } from '../storage';
import { extractInvoice } from './extract';
import { decodeEcfQr } from './qr';

export interface OcrJobData {
  invoiceId: string;
  organizationId: string;
}

const FINAL_STATES = new Set(['validada', 'incluida_en_606', 'reportada', 'duplicada']);
const CATEGORIA_CODES = new Set<string>(CATEGORIAS_606.map((c) => c.codigo));

/** Coteja NCF/RNC contra estructura y padrón DGII (solo RNC de 9 dígitos). */
async function runFiscalValidation(ncf: string | null, rnc: string | null, razonSocial: string | null) {
  const normalized = rnc ? rnc.replace(/[-\s]/g, '') : null;
  const isRnc = !!normalized && /^\d{9}$/.test(normalized);
  const padronEntry = isRnc
    ? await prisma.rncPadron.findUnique({ where: { rnc: normalized! } })
    : null;
  const padronLoaded = isRnc
    ? padronEntry != null || (await prisma.rncPadron.findFirst({ select: { rnc: true } })) != null
    : false;
  return buildFiscalValidation({
    ncf,
    rnc,
    razonSocial,
    padronEntry: padronEntry
      ? { rnc: padronEntry.rnc, razonSocial: padronEntry.razonSocial, estado: padronEntry.estado }
      : null,
    padronConsultado: padronLoaded,
  });
}

export async function processOcrJob(job: Job<OcrJobData>) {
  const { invoiceId, organizationId } = job.data;

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.organizationId !== organizationId) {
    console.warn(`[ocr] factura ${invoiceId} no encontrada, descartando trabajo`);
    return { skipped: true };
  }
  if (FINAL_STATES.has(invoice.estado)) {
    console.log(`[ocr] factura ${invoiceId} ya está en estado ${invoice.estado}, sin reprocesar`);
    return { skipped: true };
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data: { estado: 'procesando' } });

  // Todas las páginas del comprobante (1 = imagenUrl, 2+ = invoice_images)
  const extraImages = await prisma.invoiceImage.findMany({
    where: { invoiceId },
    orderBy: { orderIndex: 'asc' },
    select: { key: true },
  });
  const keys = [invoice.imagenUrl, ...extraImages.map((i) => i.key)];
  const images = await Promise.all(keys.map((k) => getImageBase64(k)));
  const extraction = await extractInvoice(images);

  // QR de e-CF: si existe, sus datos son OFICIALES (DGII) y sobreescriben lo que
  // leyó la IA para esos campos, con confianza máxima (§4, Fase 3).
  const qr = await decodeEcfQr(images).catch((e) => {
    console.warn(`[ocr] no se pudo decodificar QR de ${invoiceId}: ${e}`);
    return null;
  });
  if (qr) {
    if (qr.ncf) extraction.ncf = { valor: qr.ncf, confianza: 1 };
    if (qr.rncEmisor) extraction.rnc_proveedor = { valor: qr.rncEmisor, confianza: 1 };
    if (qr.montoTotal != null) extraction.monto_total = { valor: qr.montoTotal, confianza: 1 };
    if (qr.fechaEmision) extraction.fecha = { valor: qr.fechaEmision, confianza: 1 };
    console.log(`[ocr] factura ${invoiceId}: QR e-CF leído (${qr.ncf ?? 'sin NCF'})`);
  }

  const threshold = Number(process.env.OCR_CONFIDENCE_THRESHOLD ?? DEFAULT_CONFIDENCE_THRESHOLD);
  const evaluation = evaluateExtraction(extraction, threshold);

  const rnc = extraction.rnc_proveedor.valor
    ? validateTaxId(extraction.rnc_proveedor.valor)
    : null;
  const categoria = extraction.categoria_606_sugerida.valor;
  const fecha = extraction.fecha.valor;

  const ncfFinal = extraction.ncf.valor?.trim().toUpperCase() ?? null;
  const rncFinal = rnc?.normalized ?? extraction.rnc_proveedor.valor ?? null;
  const validacionDgii = await runFiscalValidation(
    ncfFinal,
    rncFinal,
    extraction.razon_social.valor ?? null,
  );

  // Normaliza los campos 606 sugeridos por la IA (solo valores válidos).
  const formaPago = /^[1-7]$/.test(extraction.forma_pago.valor ?? '')
    ? extraction.forma_pago.valor
    : null;
  const tipoBienServicio =
    extraction.tipo_bien_servicio.valor === 'bienes' ||
    extraction.tipo_bien_servicio.valor === 'servicios'
      ? extraction.tipo_bien_servicio.valor
      : null;
  const ncfModificado = extraction.ncf_modificado.valor?.trim().toUpperCase() || null;

  try {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ncf: ncfFinal,
        rncProveedor: rncFinal,
        razonSocialProveedor: extraction.razon_social.valor,
        fecha: fecha && fechaToPeriodoFiscal(fecha) ? new Date(fecha) : null,
        montoFacturado: extraction.monto_facturado.valor,
        itbis: extraction.itbis.valor,
        propinaLegal: extraction.propina_legal.valor,
        categoria606: categoria && CATEGORIA_CODES.has(categoria) ? categoria : null,
        tipoComprobante: extraction.tipo_comprobante.valor,
        periodoFiscal: fecha ? fechaToPeriodoFiscal(fecha) : null,
        // Campos 606 sugeridos por la IA (Fase 3)
        impuestoSelectivo: extraction.impuesto_selectivo.valor,
        otrosImpuestos: extraction.otros_impuestos.valor,
        formaPago,
        tipoBienServicio,
        ncfModificado,
        confianzaPorCampo: { extraction, evaluation, qr } as object,
        validacionDgii: validacionDgii as object,
        estado: evaluation.estado,
      },
    });
  } catch (err) {
    // Unicidad (org, rnc_proveedor, ncf): la misma factura fiscal ya existe (§4)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          estado: 'duplicada',
          confianzaPorCampo: { extraction, evaluation } as object,
        },
      });
      console.log(`[ocr] factura ${invoiceId} marcada duplicada (mismo NCF + RNC en la org)`);
      return { estado: 'duplicada' };
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      organizationId,
      accion: 'invoice.ocr_processed',
      entidad: 'invoice',
      entidadId: invoiceId,
      datos: {
        estado: evaluation.estado,
        camposBajaConfianza: evaluation.camposBajaConfianza,
        erroresValidacion: evaluation.erroresValidacion,
      },
    },
  });

  console.log(
    `[ocr] factura ${invoiceId} → ${evaluation.estado}` +
      (evaluation.camposBajaConfianza.length
        ? ` (dudosos: ${evaluation.camposBajaConfianza.join(', ')})`
        : ''),
  );
  return { estado: evaluation.estado };
}

/**
 * Tras agotar los reintentos, la factura cae a revisión con captura manual
 * como respaldo: nunca se pierde una factura (§5.5).
 */
export async function handleOcrFailure(job: Job<OcrJobData> | undefined, error: Error) {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? 1;
  console.error(
    `[ocr] intento ${job.attemptsMade}/${maxAttempts} falló para factura ${job.data.invoiceId}: ${error.message}`,
  );
  if (job.attemptsMade < maxAttempts) return;

  try {
    await prisma.invoice.update({
      where: { id: job.data.invoiceId },
      data: {
        estado: 'en_revision',
        confianzaPorCampo: {
          error: `OCR falló tras ${maxAttempts} intentos: ${error.message}`,
          capturaManual: true,
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: job.data.organizationId,
        accion: 'invoice.ocr_failed',
        entidad: 'invoice',
        entidadId: job.data.invoiceId,
        datos: { error: error.message },
      },
    });
  } catch (updateErr) {
    console.error('[ocr] no se pudo marcar la factura para captura manual:', updateErr);
  }
}
