// Contrato JSON que devuelve el worker de OCR con Claude API (ESPECIFICACION.md §5)

export interface ExtractedField<T> {
  valor: T | null;
  confianza: number;
}

export interface InvoiceExtraction {
  ncf: ExtractedField<string>;
  rnc_proveedor: ExtractedField<string>;
  razon_social: ExtractedField<string>;
  fecha: ExtractedField<string>; // ISO AAAA-MM-DD
  monto_facturado: ExtractedField<number>;
  itbis: ExtractedField<number>;
  propina_legal: ExtractedField<number>;
  categoria_606_sugerida: ExtractedField<string>;
  tipo_comprobante: ExtractedField<string>;
  es_legible: boolean;
  notas: string;
}

// Campos críticos: si alguno baja del umbral, la factura cae a `en_revision`
export const CRITICAL_FIELDS = [
  'ncf',
  'rnc_proveedor',
  'fecha',
  'monto_facturado',
  'itbis',
] as const satisfies readonly (keyof InvoiceExtraction)[];

export type CriticalField = (typeof CRITICAL_FIELDS)[number];

/** Devuelve los campos críticos cuya confianza está por debajo del umbral. */
export function lowConfidenceFields(
  extraction: InvoiceExtraction,
  threshold: number,
): CriticalField[] {
  return CRITICAL_FIELDS.filter((field) => {
    const value = extraction[field] as ExtractedField<unknown>;
    return value.valor === null || value.confianza < threshold;
  });
}
