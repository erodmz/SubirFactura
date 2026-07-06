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
  /** Verificación en vivo del e-CF contra ecf.dgii.gov.do (Fase 4), si se hizo. */
  ecf?: {
    verificado: boolean;
    aceptado: boolean;
    estado: string | null;
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
  /** Verificación en vivo del e-CF (Fase 4). Basta con estado/aceptado (el objeto
   *  completo de la consulta o el ya guardado en validacionDgii sirven). */
  ecf?: Pick<EcfVerificacion, 'aceptado' | 'estado'> | null;
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
    ecf = {
      verificado,
      aceptado: input.ecf?.aceptado ?? false,
      estado: input.ecf?.estado ?? null,
    };
    if (verificado && !ecf.aceptado) {
      alertas.push(`La DGII no reporta este e-CF como Aceptado (estado: ${ecf.estado ?? 'desconocido'})`);
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
