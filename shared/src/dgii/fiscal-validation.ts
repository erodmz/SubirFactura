// Validación fiscal consolidada para una factura: estructura del NCF, dígito
// verificador del RNC/cédula y cotejo contra el padrón de la DGII. El resultado
// se guarda en invoice.validacionDgii y se muestra al contador en la revisión,
// para atajar errores ANTES de que la DGII rechace el 606 (ESPECIFICACION §5.4/§6).

import { validateNcf } from '../validators/ncf';
import { validateTaxId } from '../validators/rnc';
import { validateAgainstPadron, type PadronEntry } from './padron';
import type { EcfVerificacion } from './ecf-verificacion';

export interface FiscalValidation {
  ncf: { ok: boolean; esECF?: boolean; tipo?: string; error?: string };
  rnc: { ok: boolean; kind?: 'rnc' | 'cedula'; error?: string };
  padron: {
    consultado: boolean;
    existe: boolean;
    activo: boolean;
    razonSocialCoincide: boolean;
    razonSocialOficial?: string;
  };
  /** Verificación en vivo del comprobante contra la DGII (e-CF o serie B), si se hizo. */
  ecf?: {
    verificado: boolean;
    aceptado: boolean;
    estado: string | null;
    /** 'E' = e-CF; 'B' = comprobante tradicional. Determina el texto de la alerta. */
    serie?: 'E' | 'B' | null;
    /** Fecha "válido hasta" de la autorización del NCF (serie B), tal cual la DGII. */
    vigenciaHasta?: string | null;
  };
  /** No hay alertas: todo coincide y es válido. */
  ok: boolean;
  /** Mensajes legibles para mostrar al contador (vacío = todo bien). */
  alertas: string[];
}

export interface FiscalValidationInput {
  ncf: string | null;
  rnc: string | null;
  razonSocial: string | null;
  /** Registro del padrón para el RNC (null si no se consultó o no existe). */
  padronEntry: PadronEntry | null;
  /** ¿Se consultó el padrón? (false si no hay padrón cargado en el sistema) */
  padronConsultado?: boolean;
  /** Fecha de la factura (ISO o Date). Se usa para avisar si un NCF serie B con
   *  autorización vencida se usó en una factura posterior a esa vigencia. */
  fecha?: string | Date | null;
  /** Verificación en vivo del comprobante (e-CF serie E o NCF serie B). Basta con
   *  estado/aceptado (el objeto completo de la consulta o el ya guardado en
   *  validacionDgii sirven); `serie` ajusta el texto de la alerta y `vigenciaHasta`
   *  permite detectar autorizaciones vencidas. */
  ecf?:
    | (Pick<EcfVerificacion, 'aceptado' | 'estado'> & {
        serie?: 'E' | 'B' | null;
        vigenciaHasta?: string | null;
      })
    | null;
}

/** Parsea una fecha "DD/MM/YYYY" (formato de la DGII) a Date UTC; null si no cuadra. */
function parseDgiiDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Normaliza la fecha de la factura (ISO string o Date) a Date; null si no cuadra. */
function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const dt = v instanceof Date ? v : new Date(v);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function buildFiscalValidation(input: FiscalValidationInput): FiscalValidation {
  const alertas: string[] = [];

  // NCF
  const ncfRes = input.ncf ? validateNcf(input.ncf) : { valid: false, error: 'Falta el NCF' };
  if (!ncfRes.valid) alertas.push(`NCF: ${ncfRes.error ?? 'inválido'}`);

  // RNC / cédula
  const rncRes = input.rnc
    ? validateTaxId(input.rnc)
    : { valid: false, error: 'Falta el RNC/cédula del proveedor' };
  if (!rncRes.valid) alertas.push(`RNC: ${rncRes.error ?? 'inválido'}`);

  // Padrón DGII
  const consultado = input.padronConsultado ?? input.padronEntry != null;
  const padronRes = validateAgainstPadron(
    input.rnc ?? '',
    input.razonSocial,
    input.padronEntry,
  );
  if (consultado && rncRes.valid) {
    if (!padronRes.existe) {
      alertas.push('El RNC no aparece en el padrón de la DGII');
    } else {
      if (!padronRes.activo) alertas.push('El RNC figura como inactivo/suspendido en la DGII');
      if (!padronRes.razonSocialCoincide && padronRes.razonSocialOficial) {
        alertas.push(`La razón social no coincide con el padrón (oficial: ${padronRes.razonSocialOficial})`);
      }
    }
  }

  // Verificación en vivo del e-CF (Fase 4): si se consultó y la DGII no lo
  // reporta como Aceptado, es una alerta fuerte.
  let ecf: FiscalValidation['ecf'];
  if (input.ecf !== undefined) {
    const verificado = input.ecf != null;
    const serie = input.ecf?.serie ?? null;
    const vigenciaHasta = input.ecf?.vigenciaHasta ?? null;
    ecf = {
      verificado,
      aceptado: input.ecf?.aceptado ?? false,
      estado: input.ecf?.estado ?? null,
      ...(serie ? { serie } : {}),
      ...(vigenciaHasta ? { vigenciaHasta } : {}),
    };
    if (verificado && !ecf.aceptado) {
      alertas.push(
        serie === 'B'
          ? 'La DGII no reconoce este NCF (serie B) para el RNC del proveedor'
          : `La DGII no reporta este e-CF como Aceptado (estado: ${ecf.estado ?? 'desconocido'})`,
      );
    } else if (verificado && ecf.aceptado && serie === 'B' && /vencid/i.test(ecf.estado ?? '')) {
      // Serie B válida pero con autorización VENCIDA: solo es problema si la
      // factura es posterior a la vigencia (una factura antigua legítima puede
      // usar un NCF que hoy figura vencido). Si no hay fecha, se avisa igual.
      const vig = parseDgiiDate(vigenciaHasta);
      const factura = toDate(input.fecha);
      const hasta = vigenciaHasta ?? 'fecha no informada';
      if (factura && vig && factura.getTime() > vig.getTime()) {
        alertas.push(
          `El NCF tiene autorización VENCIDA (válida hasta ${hasta}) y la factura es posterior — la DGII puede rechazarlo en el 606`,
        );
      } else if (!factura) {
        alertas.push(
          `El NCF figura con autorización VENCIDA (válida hasta ${hasta}); verifica que la fecha de la factura sea de esa fecha o anterior`,
        );
      }
    }
  }

  return {
    ncf: { ok: ncfRes.valid, esECF: ncfRes.esECF, tipo: ncfRes.tipo, error: ncfRes.error },
    rnc: { ok: rncRes.valid, kind: rncRes.kind, error: rncRes.error },
    padron: {
      consultado,
      existe: padronRes.existe,
      activo: padronRes.activo,
      razonSocialCoincide: padronRes.razonSocialCoincide,
      razonSocialOficial: padronRes.razonSocialOficial,
    },
    ...(ecf ? { ecf } : {}),
    ok: alertas.length === 0,
    alertas,
  };
}
