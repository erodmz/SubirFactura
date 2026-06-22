// Pipeline OCR completo (ESPECIFICACION.md §5): MinIO → Claude → reglas de
// confianza → validaciones determinísticas → estado de la factura.

import type { Job } from 'bullmq';
import {
  CATEGORIAS_606,
  DEFAULT_CONFIDENCE_THRESHOLD,
  evaluateExtraction,
  fechaToPeriodoFiscal,
  validateTaxId,
} from '@facturard/shared';
import { prisma, Prisma } from '@facturard/shared/db';
import { getImageBase64 } from '../storage';
import { extractInvoice } from './extract';

export interface OcrJobData {
  invoiceId: string;
  organizationId: string;
}

const FINAL_STATES = new Set(['validada', 'incluida_en_606', 'reportada', 'duplicada']);
const CATEGORIA_CODES = new Set<string>(CATEGORIAS_606.map((c) => c.codigo));

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

  const threshold = Number(process.env.OCR_CONFIDENCE_THRESHOLD ?? DEFAULT_CONFIDENCE_THRESHOLD);
  const evaluation = evaluateExtraction(extraction, threshold);

  const rnc = extraction.rnc_proveedor.valor
    ? validateTaxId(extraction.rnc_proveedor.valor)
    : null;
  const categoria = extraction.categoria_606_sugerida.valor;
  const fecha = extraction.fecha.valor;

  try {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ncf: extraction.ncf.valor?.trim().toUpperCase() ?? null,
        rncProveedor: rnc?.normalized ?? extraction.rnc_proveedor.valor,
        razonSocialProveedor: extraction.razon_social.valor,
        fecha: fecha && fechaToPeriodoFiscal(fecha) ? new Date(fecha) : null,
        montoFacturado: extraction.monto_facturado.valor,
        itbis: extraction.itbis.valor,
        propinaLegal: extraction.propina_legal.valor,
        categoria606: categoria && CATEGORIA_CODES.has(categoria) ? categoria : null,
        tipoComprobante: extraction.tipo_comprobante.valor,
        periodoFiscal: fecha ? fechaToPeriodoFiscal(fecha) : null,
        confianzaPorCampo: { extraction, evaluation } as object,
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
