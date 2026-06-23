// Validación fiscal consolidada para una factura: estructura del NCF, dígito
// verificador del RNC/cédula y cotejo contra el padrón de la DGII. El resultado
// se guarda en invoice.validacionDgii y se muestra al contador en la revisión,
// para atajar errores ANTES de que la DGII rechace el 606 (ESPECIFICACION §5.4/§6).

import { validateNcf } from '../validators/ncf';
import { validateTaxId } from '../validators/rnc';
import { validateAgainstPadron, type PadronEntry } from './padron';

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
    ok: alertas.length === 0,
    alertas,
  };
}
