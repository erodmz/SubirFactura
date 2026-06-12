// Categorías de gasto del Formato 606 (Norma DGII). Se siembran en la BD;
// esta copia existe para validación y tests sin tocar la base de datos.
export const CATEGORIAS_606 = [
  { codigo: '01', nombre: 'Gastos de personal' },
  { codigo: '02', nombre: 'Gastos por trabajos, suministros y servicios' },
  { codigo: '03', nombre: 'Arrendamientos' },
  { codigo: '04', nombre: 'Gastos de activos fijos' },
  { codigo: '05', nombre: 'Gastos de representación' },
  { codigo: '06', nombre: 'Otras deducciones admitidas' },
  { codigo: '07', nombre: 'Gastos financieros' },
  { codigo: '08', nombre: 'Gastos extraordinarios' },
  { codigo: '09', nombre: 'Compras y gastos que formarán parte del costo de venta' },
  { codigo: '10', nombre: 'Adquisiciones de activos' },
  { codigo: '11', nombre: 'Gastos de seguros' },
] as const;

export type Categoria606Codigo = (typeof CATEGORIAS_606)[number]['codigo'];

export const INVOICE_STATUSES = [
  'subida',
  'procesando',
  'extraida',
  'en_revision',
  'validada',
  'incluida_en_606',
  'reportada',
  'rechazada',
  'duplicada',
] as const;

export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

// Nombres de colas BullMQ — compartidos entre API (productor) y workers (consumidor)
export const QUEUE_OCR = 'ocr';

// Período fiscal AAAAMM
export const PERIODO_FISCAL_REGEX = /^(19|20)\d{2}(0[1-9]|1[0-2])$/;
