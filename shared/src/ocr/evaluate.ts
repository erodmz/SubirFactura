// Reglas de confianza y validaciones determinísticas post-extracción
// (ESPECIFICACION.md §5.3–5.4). Lógica pura: la comparten el worker de OCR
// y el endpoint de revisión manual del API.

import { CRITICAL_FIELDS, type CriticalField, type InvoiceExtraction } from '../types';
import { validateNcf } from '../validators/ncf';
import { validateTaxId } from '../validators/rnc';
import { checkInvoiceArithmetic, toCents } from '../validators/arithmetic';
import { PERIODO_FISCAL_REGEX } from '../constants';

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.9;

export interface ExtractionEvaluation {
  /** extraida: pasa directo a confirmación de categoría; en_revision: requiere corrección humana */
  estado: 'extraida' | 'en_revision';
  esLegible: boolean;
  /** Campos críticos con confianza < umbral — la UI los marca para corrección */
  camposBajaConfianza: CriticalField[];
  /** Fallos de las validaciones determinísticas, en español para la UI */
  erroresValidacion: string[];
}

const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Validación estructural de los campos fiscales; reutilizable para la revisión manual. */
export function validateInvoiceFields(
  fields: {
    ncf?: string | null;
    rncProveedor?: string | null;
    fecha?: string | null;
    montoFacturado?: number | null;
    itbis?: number | null;
    propinaLegal?: number | null;
    otrosImpuestos?: number | null;
    montoTotal?: number | null;
  },
  options: { validarAritmetica?: boolean } = {},
): string[] {
  const { validarAritmetica = true } = options;
  const errores: string[] = [];

  if (fields.ncf != null) {
    const ncf = validateNcf(fields.ncf);
    if (!ncf.valid) errores.push(`NCF inválido: ${ncf.error}`);
  }
  if (fields.rncProveedor != null) {
    const rnc = validateTaxId(fields.rncProveedor);
    if (!rnc.valid) errores.push(`RNC del proveedor inválido: ${rnc.error}`);
  }
  if (fields.fecha != null && !ISO_DATE_REGEX.test(fields.fecha)) {
    errores.push('Fecha inválida: se espera formato AAAA-MM-DD');
  }
  if (fields.montoFacturado != null && fields.montoFacturado < 0) {
    errores.push('El monto facturado no puede ser negativo');
  }

  // Coherencia aritmética solo cuando hay subtotal y total (§5.4) y el toggle está activo
  if (validarAritmetica && fields.montoFacturado != null && fields.montoTotal != null) {
    const result = checkInvoiceArithmetic({
      subtotal: toCents(fields.montoFacturado),
      itbis: fields.itbis != null ? toCents(fields.itbis) : 0,
      propinaLegal: fields.propinaLegal != null ? toCents(fields.propinaLegal) : 0,
      otrosImpuestos: fields.otrosImpuestos != null ? toCents(fields.otrosImpuestos) : 0,
      total: toCents(fields.montoTotal),
    });
    if (!result.ok) {
      errores.push(
        `Los montos no cuadran: subtotal + impuestos = ${(result.expectedTotal / 100).toFixed(2)}, ` +
          `pero el total es ${fields.montoTotal.toFixed(2)}`,
      );
    }
  }

  return errores;
}

export function evaluateExtraction(
  extraction: InvoiceExtraction,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD,
): ExtractionEvaluation {
  if (!extraction.es_legible) {
    return {
      estado: 'en_revision',
      esLegible: false,
      camposBajaConfianza: [...CRITICAL_FIELDS],
      erroresValidacion: ['La imagen no es legible: pedir al cliente re-tomar la foto'],
    };
  }

  const camposBajaConfianza = CRITICAL_FIELDS.filter((field) => {
    const value = extraction[field];
    return value.valor === null || value.confianza < threshold;
  });

  const erroresValidacion = validateInvoiceFields({
    ncf: extraction.ncf.valor,
    rncProveedor: extraction.rnc_proveedor.valor,
    fecha: extraction.fecha.valor,
    montoFacturado: extraction.monto_facturado.valor,
    itbis: extraction.itbis.valor,
    propinaLegal: extraction.propina_legal.valor,
    montoTotal: extraction.monto_total.valor,
  });

  return {
    estado: camposBajaConfianza.length === 0 && erroresValidacion.length === 0
      ? 'extraida'
      : 'en_revision',
    esLegible: true,
    camposBajaConfianza,
    erroresValidacion,
  };
}

/** Fecha ISO (AAAA-MM-DD) → período fiscal AAAAMM. */
export function fechaToPeriodoFiscal(fechaIso: string): string | null {
  if (!ISO_DATE_REGEX.test(fechaIso)) return null;
  const periodo = fechaIso.slice(0, 7).replace('-', '');
  return PERIODO_FISCAL_REGEX.test(periodo) ? periodo : null;
}
