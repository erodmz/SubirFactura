export interface Me {
  userId: string;
  email: string;
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

export interface AdminOrg {
  id: string;
  nombre: string;
  rnc: string | null;
  estadoSuscripcion: string | null;
  plan: { nombre: string } | null;
  _count: { memberships: number };
  createdAt: string;
}
