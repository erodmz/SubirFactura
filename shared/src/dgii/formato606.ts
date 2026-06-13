// Generador del Formato de Envío 606 de la DGII (compras de bienes y servicios).
//
// Estructura tomada del Instructivo oficial "Llenado y Remisión del Formato de
// Envío 606" — Norma General 07-2018 y 05-2019, versión 2025 (dgii.gov.do).
//
// Archivo de texto separado por pipe (|):
//   Encabezado:  606|<RNC informante>|<AAAAMM>|<cantidad de registros>
//   Detalle:     23 columnas por comprobante (orden y semántica del instructivo)
//
// Montos: punto decimal con 2 posiciones (ej. 10.18). Fechas: AAAAMMDD.
// Campos calculados por la herramienta oficial y replicados aquí:
//   col. 10 Total Monto Facturado = servicios + bienes
//   col. 15 ITBIS por Adelantar   = ITBIS facturado − ITBIS llevado al costo

import { PERIODO_FISCAL_REGEX } from '../constants';

export type TipoIdentificacion = '1' | '2'; // 1 = RNC, 2 = Cédula

/** Forma de pago (col. 23). */
export const FORMAS_PAGO_606 = {
  efectivo: '1',
  cheque_transferencia: '2',
  tarjeta: '3',
  credito: '4',
  permuta: '5',
  nota_credito: '6',
  mixto: '7',
} as const;

/** Un comprobante de compra (una línea del detalle). */
export interface Formato606Detail {
  rncCedula: string;
  tipoId: TipoIdentificacion;
  /** Tipo de bienes y servicios comprados: '01'..'11' (categoría 606). */
  tipoBienesServicios: string;
  ncf: string;
  ncfModificado?: string | null;
  /** AAAAMMDD */
  fechaComprobante: string;
  /** AAAAMMDD; en blanco si no se ha pagado. */
  fechaPago?: string | null;
  montoServicios?: number;
  montoBienes?: number;
  itbisFacturado?: number;
  itbisRetenido?: number;
  itbisProporcionalidad?: number;
  itbisCosto?: number;
  itbisPercibido?: number;
  /** Tipo de retención en ISR: '1'..'9'; en blanco si no aplica. */
  tipoRetencionISR?: string | null;
  montoRetencionRenta?: number;
  isrPercibido?: number;
  impuestoSelectivo?: number;
  otrosImpuestos?: number;
  propinaLegal?: number;
  /** Forma de pago: '1'..'7'. */
  formaPago?: string;
}

export interface Formato606Input {
  /** RNC o cédula del contribuyente que reporta. */
  rncInformante: string;
  /** Período fiscal AAAAMM. */
  periodo: string;
  detalles: Formato606Detail[];
}

const FECHA_REGEX = /^\d{8}$/; // AAAAMMDD

/** Monto → "0.00"; null/undefined → "" (campo en blanco entre pipes). */
function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) throw new Error(`Monto inválido: ${value}`);
  return value.toFixed(2);
}

function assertFecha(label: string, value: string): void {
  if (!FECHA_REGEX.test(value)) {
    throw new Error(`${label} debe tener formato AAAAMMDD: recibido "${value}"`);
  }
}

/** Construye una línea de detalle (23 columnas) en el orden del instructivo. */
function buildDetailLine(d: Formato606Detail): string {
  assertFecha('Fecha comprobante', d.fechaComprobante);
  if (d.fechaPago) assertFecha('Fecha de pago', d.fechaPago);

  const totalFacturado = (d.montoServicios ?? 0) + (d.montoBienes ?? 0);
  // ITBIS por adelantar solo cuando hay ITBIS facturado (col. 15 calculada)
  const itbisPorAdelantar =
    d.itbisFacturado !== undefined ? d.itbisFacturado - (d.itbisCosto ?? 0) : undefined;

  return [
    d.rncCedula, // 1
    d.tipoId, // 2
    d.tipoBienesServicios, // 3
    d.ncf, // 4
    d.ncfModificado ?? '', // 5
    d.fechaComprobante, // 6
    d.fechaPago ?? '', // 7
    money(d.montoServicios), // 8
    money(d.montoBienes), // 9
    money(totalFacturado), // 10 (calculada)
    money(d.itbisFacturado), // 11
    money(d.itbisRetenido), // 12
    money(d.itbisProporcionalidad), // 13
    money(d.itbisCosto), // 14
    money(itbisPorAdelantar), // 15 (calculada)
    money(d.itbisPercibido), // 16
    d.tipoRetencionISR ?? '', // 17
    money(d.montoRetencionRenta), // 18
    money(d.isrPercibido), // 19
    money(d.impuestoSelectivo), // 20
    money(d.otrosImpuestos), // 21
    money(d.propinaLegal), // 22
    d.formaPago ?? '', // 23
  ].join('|');
}

export interface Formato606Result {
  /** Contenido del archivo .TXT, líneas separadas por CRLF. */
  contenido: string;
  /** Nombre sugerido: DGII_F_606_<RNC>_<AAAAMM>.TXT */
  nombreArchivo: string;
  cantidadRegistros: number;
}

const MAX_REGISTROS = 10000; // límite de la DGII por archivo

/**
 * Genera el archivo 606. Lanza si el período es inválido o se excede el límite
 * de registros. La validación fiscal de cada comprobante (NCF, RNC, aritmética)
 * se hace antes, en el pipeline; aquí solo se serializa el formato.
 */
export function generateFormato606(input: Formato606Input): Formato606Result {
  if (!PERIODO_FISCAL_REGEX.test(input.periodo)) {
    throw new Error(`Período fiscal inválido (AAAAMM): "${input.periodo}"`);
  }
  if (input.detalles.length > MAX_REGISTROS) {
    throw new Error(
      `El 606 admite máximo ${MAX_REGISTROS} registros por archivo (recibidos ${input.detalles.length})`,
    );
  }

  const rnc = input.rncInformante.replace(/[-\s]/g, '');
  const cantidad = input.detalles.length;
  const header = `606|${rnc}|${input.periodo}|${cantidad}`;
  const lines = [header, ...input.detalles.map(buildDetailLine)];

  return {
    contenido: lines.join('\r\n'),
    nombreArchivo: `DGII_F_606_${rnc}_${input.periodo}.TXT`,
    cantidadRegistros: cantidad,
  };
}
