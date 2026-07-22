export interface Me {
  userId: string;
  email: string;
  nombre: string | null;
  isSuperAdmin: boolean;
  emailVerified?: boolean;
  memberships: {
    membershipId: string;
    rol: 'org_admin' | 'contador' | 'cliente';
    puedeValidar?: boolean;
    puedeVerReportes?: boolean;
    organization: {
      id: string;
      nombre: string;
      estadoSuscripcion: string | null;
      logoUrl?: string | null;
    };
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
  puedeValidar?: boolean;
  puedeVerReportes?: boolean;
  user: { id: string; email: string; nombre: string; telefono: string | null };
}

export interface Client {
  id: string;
  rncOCedula: string;
  razonSocial: string;
  userId: string | null;
  contadores?: Member[];
  _count?: { assignments: number; members: number; invoices: number };
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
  // Campos del Formato 606 (Fase 2)
  tipoIdProveedor?: string | null;
  ncfModificado?: string | null;
  fechaPago?: string | null;
  tipoBienServicio?: string | null;
  montoServicios?: number | string | null;
  montoBienes?: number | string | null;
  itbisRetenido?: number | string | null;
  itbisProporcionalidad?: number | string | null;
  itbisCosto?: number | string | null;
  itbisPercibido?: number | string | null;
  tipoRetencionIsr?: string | null;
  montoRetencionRenta?: number | string | null;
  isrPercibido?: number | string | null;
  impuestoSelectivo?: number | string | null;
  formaPago?: string | null;
  clientProfile?: { id: string; razonSocial: string };
  confianzaPorCampo?: {
    evaluation?: { camposBajaConfianza?: string[]; erroresValidacion?: string[] };
    /** Extracción cruda del OCR; usamos el nombre impreso para contrastarlo con el legal. */
    extraction?: { razon_social?: { valor?: string | null }; rnc_comprador?: { valor?: string | null } };
    /** Datos leídos del QR e-CF oficial (si el comprobante lo traía). */
    qr?: { ncf?: string | null } | null;
    /** Correcciones determinísticas aplicadas tras el OCR (trazabilidad). */
    ajustes?: string[];
    /** Cliente cuyo RNC casi coincide con el comprador leído (sugerencia, no auto-asignación). */
    sugerenciaCliente?: { id: string; razonSocial: string; rnc: string };
    error?: string;
  } | null;
  validacionDgii?: {
    ok: boolean;
    alertas: string[];
    ncf?: { ok: boolean };
    rnc?: { ok: boolean };
    padron?: {
      consultado: boolean;
      existe: boolean;
      activo: boolean;
      razonSocialCoincide: boolean;
      razonSocialOficial?: string;
    };
    ecf?: {
      verificado: boolean;
      aceptado: boolean;
      estado: string | null;
      serie?: 'E' | 'B' | null;
      vigenciaHasta?: string | null;
    };
  } | null;
}

export interface PadronAdvertencia {
  rnc: string;
  existe: boolean;
  activo: boolean;
  razonSocialCoincide: boolean;
  razonSocialOficial?: string;
}

export interface Omitida {
  id: string;
  razon: string;
  proveedor: string | null;
  monto: number | null;
}

export interface Preview606 {
  /** Cliente (contribuyente) informante del reporte. */
  cliente: { id: string; razonSocial: string; rnc: string };
  nombreArchivo: string;
  cantidadRegistros: number;
  omitidas: Omitida[];
  advertencias: PadronAdvertencia[];
}

export interface DashboardData {
  periodo: string;
  hoy: string; // AAAA-MM-DD
  total: number;
  kpis: { subidasMes: number; reportablesMes: number; montoMes: number; itbisMes: number };
  valor: { leidasMes: number; duplicadosEvitadosMes: number; minutosAhorrados: number };
  kpisPrev: { subidas: number; monto: number };
  records: {
    subidas: { valor: number; periodo: string } | null;
    monto: { valor: number; periodo: string } | null;
  };
  actividad: { dia: string; n: number }[];
  tendencia: { periodo: string; subidas: number; monto: number }[];
  porEstado: { estado: string; n: number }[];
  categorias: { codigo: string; nombre: string; n: number; monto: number }[];
  clientes: { id: string; razonSocial: string; n: number; monto: number }[];
  ultimaSubidaPorCliente: Record<string, string>;
}

export interface PanelClienteCierre {
  clienteId: string;
  razonSocial: string;
  rnc: string;
  rncValido: boolean;
  semaforo: CierreEstado['semaforo'];
  listoParaCerrar: boolean;
  totales: CierreEstado['totales'];
  bloqueos: string[];
}

export interface PanelCierre {
  periodo: string;
  fechaLimite: string;
  diasRestantes: number;
  vencido: boolean;
  sinAsignar: number;
  clientes: PanelClienteCierre[];
}

export interface CierreHistorial {
  periodo: string;
  clientProfileId: string | null;
  cliente: string | null;
  rnc: string | null;
  incluidas: number | null;
  fecha: string;
  usuario: string | null;
}

export interface CierreEstado {
  periodo: string;
  fechaLimite: string;
  diasRestantes: number;
  vencido: boolean;
  semaforo: 'verde' | 'amarillo' | 'rojo' | 'vacio';
  listoParaCerrar: boolean;
  totales: {
    total: number;
    enProceso: number;
    enRevision: number;
    reportables: number;
    rechazadas: number;
    duplicadas: number;
    conAlertasDgii: number;
    sinDatos606: number;
    /** Reportables a las que solo les falta la forma de pago (arreglable en lote). */
    sinFormaPago: number;
    /** Facturas del período sin asignar a ningún cliente (no entran a ningún 606). */
    sinAsignar: number;
  };
  bloqueos: string[];
  avisos: string[];
}

export interface ResumenGastos {
  totalGastado: number;
  totalItbis: number;
  cantidad: number;
  porCategoria: { codigo: string; nombre: string; total: number; cantidad: number }[];
  porMes: { periodo: string; total: number; itbis: number; cantidad: number }[];
  topProveedores: { razonSocial: string; total: number; cantidad: number }[];
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

/** Catálogo de planes (GET /api/plans) — la verdad vive en la BD. */
export interface PlanInfo {
  nombre: string;
  maxContadores: number;
  maxClientes: number;
  maxFacturasMes: number;
  precio: string; // Decimal serializado, ej. "1995.00"
}

export interface AdminOrg {
  id: string;
  nombre: string;
  rnc: string | null;
  estadoSuscripcion: string | null;
  plan: { nombre: string } | null;
  _count: { memberships: number };
  createdAt: string;
  deletedAt: string | null;
}

/** Respuesta de POST /api/admin/organizations (crear empresa llave en mano). */
export interface AdminCreatedOrg {
  id: string;
  nombre: string;
  plan: { nombre: string };
  invitation: {
    email: string;
    rol: string;
    expiresAt: string;
    inviteUrl: string;
  } | null;
}
