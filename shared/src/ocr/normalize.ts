// Post-proceso determinístico de la extracción del OCR (ESPECIFICACION §5.4):
// lo que un validador puede comprobar, no se le cree al modelo. Dos reglas:
//
//   1. NCF: normalizar (mayúsculas, sin espacios/guiones) y, si la estructura
//      falla por UN cero de más o de menos en el relleno de la parte secuencial
//      (el error de lectura más común: B0100004521 → B01000004521), proponer la
//      corrección canónica con confianza penalizada para que se revise.
//   2. RNC/cédula: si no pasa el dígito verificador, la confianza se degrada
//      por debajo de cualquier umbral razonable — un identificador
//      estructuralmente inválido JAMÁS debe viajar con confianza alta (el OCR
//      llegó a reportar 0.9 sobre un RNC de 8 dígitos).

import type { InvoiceExtraction } from '../types';
import { validateNcf } from '../validators/ncf';
import { validateTaxId } from '../validators/rnc';

/** Confianza máxima de un valor corregido/dudoso: siempre bajo el umbral (0.90). */
const CONFIANZA_CORREGIDO = 0.7;
const CONFIANZA_INVALIDO = 0.5;

export interface NcfNormalization {
  /** NCF normalizado (o corregido si hubo arreglo inequívoco). */
  value: string;
  /** true si se aplicó una corrección (quitar/añadir un cero de relleno). */
  corrected: boolean;
  /** ¿La estructura final es válida? */
  valid: boolean;
}

/**
 * Normaliza un NCF leído por OCR. Solo corrige el caso inequívoco: un cero de
 * relleno de más o de menos inmediatamente después del tipo (B01 0000 4521).
 * Cualquier otra falla se deja intacta para revisión humana.
 */
export function normalizeNcf(raw: string): NcfNormalization {
  const cleaned = raw.trim().toUpperCase().replace(/[\s.-]/g, '');
  if (validateNcf(cleaned).valid) return { value: cleaned, corrected: false, valid: true };

  const m = cleaned.match(/^([BE])(\d+)$/);
  if (m) {
    const [, serie, digits] = m as unknown as [string, 'B' | 'E', string];
    const expected = serie === 'B' ? 10 : 12; // tipo (2) + secuencial (8 | 10)
    // Un dígito de más y hay ceros de relleno → probar quitando UN cero tras el tipo.
    if (digits.length === expected + 1 && digits[2] === '0') {
      const fixed = serie + digits.slice(0, 2) + digits.slice(3);
      if (validateNcf(fixed).valid) return { value: fixed, corrected: true, valid: true };
    }
    // Un dígito de menos → probar añadiendo UN cero de relleno tras el tipo.
    if (digits.length === expected - 1) {
      const fixed = serie + digits.slice(0, 2) + '0' + digits.slice(2);
      if (validateNcf(fixed).valid) return { value: fixed, corrected: true, valid: true };
    }
  }
  return { value: cleaned, corrected: false, valid: false };
}

/** ¿Distancia de edición ≤ 1? (inserción, borrado o sustitución de UN carácter) */
export function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (largo.length - corto.length > 1) return false;

  if (corto.length === largo.length) {
    // misma longitud: a lo sumo UNA sustitución
    let diffs = 0;
    for (let i = 0; i < corto.length; i++) if (corto[i] !== largo[i]) diffs++;
    return diffs <= 1;
  }
  // longitud ±1: a lo sumo UNA inserción
  let i = 0;
  let j = 0;
  let saltos = 0;
  while (i < corto.length && j < largo.length) {
    if (corto[i] === largo[j]) {
      i++;
      j++;
    } else {
      if (++saltos > 1) return false;
      j++; // saltar el carácter extra del largo
    }
  }
  return true;
}

/**
 * Sanea la extracción EN SITIO y devuelve los ajustes aplicados (para log y
 * trazabilidad en confianzaPorCampo). Llamar después de fusionar los datos del
 * QR (que son oficiales y ya vienen con confianza 1).
 */
export function sanitizeExtraction(extraction: InvoiceExtraction): string[] {
  const ajustes: string[] = [];

  // ── NCF ──
  const ncf = extraction.ncf;
  if (ncf.valor) {
    const norm = normalizeNcf(ncf.valor);
    if (norm.corrected) {
      ajustes.push(`NCF corregido de "${ncf.valor}" a "${norm.value}" (cero de relleno)`);
      ncf.valor = norm.value;
      ncf.confianza = Math.min(ncf.confianza, CONFIANZA_CORREGIDO);
    } else if (!norm.valid && ncf.confianza > CONFIANZA_INVALIDO) {
      ajustes.push(`NCF "${ncf.valor}" con estructura inválida: confianza degradada`);
      ncf.valor = norm.value; // al menos normalizado (mayúsculas, sin separadores)
      ncf.confianza = CONFIANZA_INVALIDO;
    } else {
      ncf.valor = norm.value;
    }
  }

  // ── RNC/cédula (proveedor y comprador) ──
  for (const campo of ['rnc_proveedor', 'rnc_comprador'] as const) {
    const f = extraction[campo];
    if (!f.valor) continue;
    const limpio = f.valor.replace(/[\s.-]/g, '');
    f.valor = limpio;
    if (!validateTaxId(limpio).valid && f.confianza > CONFIANZA_INVALIDO) {
      ajustes.push(`${campo} "${limpio}" no pasa el dígito verificador: confianza degradada`);
      f.confianza = CONFIANZA_INVALIDO;
    }
  }

  return ajustes;
}
