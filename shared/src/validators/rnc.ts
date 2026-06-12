// Validación de RNC (9 dígitos) y cédula (11 dígitos) con dígito verificador
// (ESPECIFICACION.md §5.4).

const RNC_WEIGHTS = [7, 9, 8, 6, 5, 4, 3, 2];

/** Dígito verificador del RNC: módulo 11 sobre los primeros 8 dígitos. */
export function computeRncCheckDigit(first8: string): number {
  if (!/^\d{8}$/.test(first8)) {
    throw new Error('Se esperan exactamente 8 dígitos');
  }
  const sum = RNC_WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(first8[i]), 0);
  const rest = sum % 11;
  if (rest === 0) return 2;
  if (rest === 1) return 1;
  return 11 - rest;
}

export function isValidRnc(raw: string): boolean {
  const rnc = raw.replace(/[-\s]/g, '');
  if (!/^\d{9}$/.test(rnc)) return false;
  return computeRncCheckDigit(rnc.slice(0, 8)) === Number(rnc[8]);
}

/** Dígito verificador de la cédula: algoritmo de Luhn sobre los primeros 10 dígitos. */
export function computeCedulaCheckDigit(first10: string): number {
  if (!/^\d{10}$/.test(first10)) {
    throw new Error('Se esperan exactamente 10 dígitos');
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let product = Number(first10[i]) * (i % 2 === 0 ? 1 : 2);
    if (product > 9) product -= 9;
    sum += product;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidCedula(raw: string): boolean {
  const cedula = raw.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(cedula)) return false;
  return computeCedulaCheckDigit(cedula.slice(0, 10)) === Number(cedula[10]);
}

export interface TaxIdValidationResult {
  valid: boolean;
  kind?: 'rnc' | 'cedula';
  normalized?: string;
  error?: string;
}

/** Acepta RNC de 9 dígitos o cédula de 11, con o sin guiones. */
export function validateTaxId(raw: string): TaxIdValidationResult {
  const digits = raw.replace(/[-\s]/g, '');
  if (/^\d{9}$/.test(digits)) {
    return isValidRnc(digits)
      ? { valid: true, kind: 'rnc', normalized: digits }
      : { valid: false, kind: 'rnc', error: 'Dígito verificador del RNC inválido' };
  }
  if (/^\d{11}$/.test(digits)) {
    return isValidCedula(digits)
      ? { valid: true, kind: 'cedula', normalized: digits }
      : { valid: false, kind: 'cedula', error: 'Dígito verificador de la cédula inválido' };
  }
  return { valid: false, error: 'Se espera RNC de 9 dígitos o cédula de 11' };
}
