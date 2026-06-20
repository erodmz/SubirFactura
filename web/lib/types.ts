export interface Me {
  userId: string;
  email: string;
  nombre: string | null;
  isSuperAdmin: boolean;
  memberships: {
    membershipId: string;
    rol: 'org_admin' | 'contador' | 'cliente';
    organization: { id: string; nombre: string; estadoSuscripcion: string | null };
  }[];
}

export interface LimitUsage {
  used: number;
  max: number;
  warning: boolean;
}

export interface OrgUsage {
  plan: { id: string; nombre: string } | null;
  estadoSuscripcion: string | null;
  contadores: LimitUsage | null;
  clientes: LimitUsage | null;
  facturasMes: LimitUsage | null;
}

export interface Member {
  id: string;
  rol: 'org_admin' | 'contador' | 'cliente';
  user: { id: string; email: string; nombre: string; telefono: string | null };
}

export interface Client {
  id: string;
  rncOCedula: string;
  razonSocial: string;
  userId: string | null;
  contadores?: Member[];
  limitWarning?: string;
}

export interface Invoice {
  id: string;
  estado: string;
  ncf: string | null;
  rncProveedor: string | null;
  razonSocialProveedor: string | null;
  fecha: string | null;
  montoFacturado: number | string | null;
  itbis: number | string | null;
  propinaLegal: number | string | null;
  otrosImpuestos: number | string | null;
  categoria606: string | null;
  tipoComprobante: string | null;
  periodoFiscal: string | null;
  clientProfile?: { id: string; razonSocial: string };
  confianzaPorCampo?: {
    evaluation?: { camposBajaConfianza?: string[]; erroresValidacion?: string[] };
    error?: string;
  } | null;
}

export interface PadronAdvertencia {
  rnc: string;
  existe: boolean;
  activo: boolean;
  razonSocialCoincide: boolean;
  razonSocialOficial?: string;
}

export interface Preview606 {
  nombreArchivo: string;
  cantidadRegistros: number;
  omitidas: { id: string; razon: string }[];
  advertencias: PadronAdvertencia[];
}

/** Las 11 categorías de gasto del Formato 606. */
export const CATEGORIAS_606: Record<string, string> = {
  '01': 'Gastos de personal',
  '02': 'Trabajos, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Gastos de activos fijos',
  '05': 'Gastos de representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Compras y gastos del costo de venta',
  '10': 'Adquisiciones de activos',
  '11': 'Gastos de seguros',
};

export const ESTADO_LABELS: Record<string, string> = {
  subida: 'Subida',
  procesando: 'Procesando',
  extraida: 'Extraída',
  en_revision: 'En revisión',
  validada: 'Validada',
  incluida_en_606: 'En 606',
  reportada: 'Reportada',
  rechazada: 'Rechazada',
  duplicada: 'Duplicada',
};

export interface AdminOrg {
  id: string;
  nombre: string;
  rnc: string | null;
  estadoSuscripcion: string | null;
  plan: { nombre: string } | null;
  _count: { memberships: number };
  createdAt: string;
}
