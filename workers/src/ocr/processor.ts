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
  type EcfVerificacion,
  type PadronEntry,
} from '@facturard/shared';
import { prisma, Prisma } from '@facturard/shared/db';
import { getImageBase64 } from '../storage';
import { extractInvoice } from './extract';
import { decodeEcfQr } from './qr';
import { verifyEcfLive } from './ecf-live';
import { consultarRncLive, consultarNcfLive } from './dgii-consulta';

export interface OcrJobData {
  invoiceId: string;
  organizationId: string;
}

const FINAL_STATES = new Set(['validada', 'incluida_en_606', 'reportada', 'duplicada']);
const CATEGORIA_CODES = new Set<string>(CATEGORIAS_606.map((c) => c.codigo));

interface FiscalValidationArgs {
  ncf: string | null;
  rnc: string | null;
  razonSocial: string | null;
  /** RNC del comprador (para la consulta de e-CF). */
  rncComprador?: string | null;
  /** Código de seguridad del e-CF (del QR); requerido por la consulta de NCF. */
  codigoSeguridad?: string | null;
  /** Verificación e-CF ya obtenida por el QR (ecf.dgii.gov.do), como respaldo. */
  ecf?: Pick<EcfVerificacion, 'aceptado' | 'estado'> | null;
}

/**
 * Coteja NCF/RNC contra la DGII. Fuente primaria: consulta EN VIVO de la DGII
 * (ConsultasWeb2). Si no responde a tiempo, respaldo con el padrón local. Para
 * e-CF (serie E con código de seguridad) valida además el NCF en vivo.
 */
async function runFiscalValidation(args: FiscalValidationArgs) {
  const { ncf, rnc, razonSocial } = args;
  const normalized = rnc ? rnc.replace(/[-\s]/g, '') : null;
  const isRnc = !!normalized && /^\d{9}$/.test(normalized);
  const liveEnabled = process.env.DGII_LIVE_CONSULTA !== '0';
  const timeout = Number(process.env.DGII_CONSULTA_TIMEOUT_MS ?? 5000);

  // ── RNC: primero en vivo contra la DGII; si no responde, padrón local ──
  let padronEntry: PadronEntry | null = null;
  let padronConsultado = false;
  let fuenteRnc: 'dgii' | 'padron' | 'ninguna' = 'ninguna';

  if (isRnc && liveEnabled) {
    const live = await consultarRncLive(normalized!, timeout);
    if (live) {
      fuenteRnc = 'dgii';
      padronConsultado = true;
      padronEntry = live.encontrado
        ? { rnc: normalized!, razonSocial: live.razonSocial ?? '', estado: live.estado }
        : null;
    }
  }
  if (isRnc && fuenteRnc === 'ninguna') {
    const entry = await prisma.rncPadron.findUnique({ where: { rnc: normalized! } });
    const anyPadron =
      entry != null || (await prisma.rncPadron.findFirst({ select: { rnc: true } })) != null;
    padronEntry = entry
      ? { rnc: entry.rnc, razonSocial: entry.razonSocial, estado: entry.estado }
      : null;
    padronConsultado = anyPadron;
    fuenteRnc = anyPadron ? 'padron' : 'ninguna';
  }

  // ── NCF (e-CF): validez en vivo. Solo serie E (tiene código de seguridad). ──
  let ecf = args.ecf;
  if (liveEnabled && ncf && isRnc && args.codigoSeguridad) {
    const ncfLive = await consultarNcfLive(
      {
        rncEmisor: normalized!,
        ncf,
        rncComprador: args.rncComprador,
        codigoSeguridad: args.codigoSeguridad,
      },
      timeout,
    );
    if (ncfLive?.encontrado) ecf = { aceptado: ncfLive.aceptado, estado: ncfLive.estado };
  }

  console.log(
    `[dgii] validación ${ncf ?? 's/ncf'}: RNC vía ${fuenteRnc}` +
      (padronEntry ? ` (${padronEntry.estado ?? '?'})` : padronConsultado ? ' (no hallado)' : '') +
      (ecf ? `, e-CF ${ecf.estado ?? '?'}` : ''),
  );

  return buildFiscalValidation({ ncf, rnc, razonSocial, padronEntry, padronConsultado, ecf });
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

  // Verificación en vivo del e-CF contra la DGII (Fase 4), detrás de un flag.
  // undefined = no se intentó; null = se intentó y falló; objeto = verificado.
  let ecfVerif: EcfVerificacion | null | undefined;
  if (process.env.DGII_LIVE_VERIFICATION === '1' && qr?.url) {
    const timeout = Number(process.env.DGII_LIVE_TIMEOUT_MS ?? 5000);
    ecfVerif = await verifyEcfLive(qr.url, timeout);
    console.log(
      `[ocr] factura ${invoiceId}: verificación e-CF en vivo → ${
        ecfVerif ? `estado ${ecfVerif.estado}` : 'sin respuesta'
      }`,
    );
  }

  // Auto-asignación de empresa: si se subió sin elegir (p.ej. Share Extension),
  // resolvemos por el RNC del comprador. Preferimos el del QR e-CF (oficial); si
  // el QR no se pudo leer, usamos el que extrajo la IA (con confianza alta). Si
  // no coincide con ningún cliente, queda "sin asignar" para resolver a mano.
  let clientProfileId = invoice.clientProfileId;
  if (!clientProfileId) {
    const rncComprador =
      qr?.rncComprador ??
      (extraction.rnc_comprador.valor && extraction.rnc_comprador.confianza >= 0.8
        ? extraction.rnc_comprador.valor
        : null);
    if (rncComprador) {
      const normalizado = rncComprador.replace(/[-\s]/g, '');
      const match = await prisma.clientProfile.findFirst({
        where: { organizationId, rncOCedula: normalizado },
        select: { id: true },
      });
      if (match) {
        clientProfileId = match.id;
        const via = qr?.rncComprador ? 'QR' : 'IA';
        console.log(`[ocr] factura ${invoiceId}: empresa asignada por RNC comprador ${normalizado} (${via})`);
      }
    }
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
  const validacionDgii = await runFiscalValidation({
    ncf: ncfFinal,
    rnc: rncFinal,
    razonSocial: extraction.razon_social.valor ?? null,
    rncComprador: qr?.rncComprador ?? extraction.rnc_comprador.valor ?? null,
    codigoSeguridad: qr?.codigoSeguridad ?? null,
    ecf: ecfVerif,
  });

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
        clientProfileId,
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
