// Contrato JSON que devuelve el worker de OCR con Claude API (ESPECIFICACION.md §5)

export interface ExtractedField<T> {
  valor: T | null;
  confianza: number;
}

export interface InvoiceExtraction {
  ncf: ExtractedField<string>;
  rnc_proveedor: ExtractedField<string>;
  // Comprador/receptor: no es campo crítico, pero permite auto-asignar la
  // factura a su cliente cuando se sube sin elegir (Share Extension).
  rnc_comprador: ExtractedField<string>;
  razon_social: ExtractedField<string>;
  fecha: ExtractedField<string>; // ISO AAAA-MM-DD
  monto_facturado: ExtractedField<number>; // subtotal sin impuestos
  itbis: ExtractedField<number>;
  propina_legal: ExtractedField<number>;
  // Extra sobre el contrato del spec: el total impreso permite la
  // validación aritmética determinística (§5.4)
  monto_total: ExtractedField<number>;
  categoria_606_sugerida: ExtractedField<string>;
  tipo_comprobante: ExtractedField<string>;
  // Campos adicionales del 606 (Fase 3): mejoran el autollenado del contador.
  impuesto_selectivo: ExtractedField<number>; // ISC (col. 20)
  otros_impuestos: ExtractedField<number>; // suma de cargos sin campo propio (col. 21)
  forma_pago: ExtractedField<string>; // '1'..'7' (col. 23)
  tipo_bien_servicio: ExtractedField<string>; // 'bienes' | 'servicios'
  ncf_modificado: ExtractedField<string>; // NCF referenciado en notas créd./déb. (col. 5)
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
