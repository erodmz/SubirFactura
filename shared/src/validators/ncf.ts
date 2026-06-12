// Validación estructural del NCF (ESPECIFICACION.md §5.4):
// Serie B + 2 dígitos de tipo + 8 secuenciales (11 chars), o e-CF serie E + 2 + 10 (13 chars).

const NCF_REGEX = /^B(\d{2})(\d{8})$/;
const ECF_REGEX = /^E(\d{2})(\d{10})$/;

// Tipos de comprobante vigentes según la DGII (tabla de referencia; revisar norma al codificar el 606)
export const NCF_TIPOS_VALIDOS = new Set([
  '01', // Crédito fiscal
  '02', // Consumo
  '03', // Notas de débito
  '04', // Notas de crédito
  '11', // Proveedores informales
  '12', // Registro único de ingresos
  '13', // Gastos menores
  '14', // Regímenes especiales
  '15', // Gubernamental
  '16', // Exportaciones
  '17', // Pagos al exterior
]);

export const ECF_TIPOS_VALIDOS = new Set([
  '31', // Factura de crédito fiscal electrónica
  '32', // Factura de consumo electrónica
  '33', // Nota de débito electrónica
  '34', // Nota de crédito electrónica
  '41', // Compras electrónico
  '43', // Gastos menores electrónico
  '44', // Regímenes especiales electrónico
  '45', // Gubernamental electrónico
  '46', // Exportaciones electrónico
  '47', // Pagos al exterior electrónico
]);

export interface NcfValidationResult {
  valid: boolean;
  esECF?: boolean;
  tipo?: string;
  error?: string;
}

export function validateNcf(raw: string): NcfValidationResult {
  const ncf = raw.trim().toUpperCase();

  const ncfMatch = ncf.match(NCF_REGEX);
  if (ncfMatch) {
    const tipo = ncfMatch[1]!;
    if (!NCF_TIPOS_VALIDOS.has(tipo)) {
      return { valid: false, esECF: false, tipo, error: `Tipo de comprobante desconocido: ${tipo}` };
    }
    return { valid: true, esECF: false, tipo };
  }

  const ecfMatch = ncf.match(ECF_REGEX);
  if (ecfMatch) {
    const tipo = ecfMatch[1]!;
    if (!ECF_TIPOS_VALIDOS.has(tipo)) {
      return { valid: false, esECF: true, tipo, error: `Tipo de e-CF desconocido: ${tipo}` };
    }
    return { valid: true, esECF: true, tipo };
  }

  return {
    valid: false,
    error: 'Estructura inválida: se espera B+2 dígitos de tipo+8 secuenciales, o E+2+10 (e-CF)',
  };
}
