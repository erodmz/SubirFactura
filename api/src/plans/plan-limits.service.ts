import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const WARNING_THRESHOLD = 0.8;

export interface LimitUsage {
  used: number;
  max: number;
  warning: boolean; // >= 80% del límite (§7)
}

export interface OrgUsage {
  plan: { id: string; nombre: string } | null;
  estadoSuscripcion: string | null;
  contadores: LimitUsage | null;
  clientes: LimitUsage | null;
  facturasMes: LimitUsage | null;
}

/**
 * Enforcement de límites de plan en el API (§7): al invitar contador, crear
 * cliente o subir factura se valida contra el plan. Al 80% → aviso; al 100%
 * → bloqueo suave con CTA de upgrade.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private usage(used: number, max: number): LimitUsage {
    return { used, max, warning: max > 0 && used / max >= WARNING_THRESHOLD };
  }

  async getUsage(orgId: string): Promise<OrgUsage> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      include: { plan: true },
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [contadores, clientes, facturasMes] = await Promise.all([
      // El org_admin también hace de contador y ocupa un asiento: cuenta.
      // (Antes daba "0/1" para un despacho de una sola persona, y dejaba
      // invitar un contador de más sobre el límite del plan.)
      this.prisma.membership.count({
        // Las membresías inactivas (miembro "quitado") no ocupan asiento.
        where: { organizationId: orgId, rol: { in: ['contador', 'org_admin'] }, deletedAt: null },
      }),
      // client_profiles e invoices están bajo RLS: contar con contexto de tenant
      this.prisma.forOrg(orgId).clientProfile.count(),
      this.prisma.forOrg(orgId).invoice.count({ where: { createdAt: { gte: monthStart } } }),
    ]);

    return {
      plan: org.plan ? { id: org.plan.id, nombre: org.plan.nombre } : null,
      estadoSuscripcion: org.estadoSuscripcion,
      contadores: org.plan ? this.usage(contadores, org.plan.maxContadores) : null,
      clientes: org.plan ? this.usage(clientes, org.plan.maxClientes) : null,
      facturasMes: org.plan ? this.usage(facturasMes, org.plan.maxFacturasMes) : null,
    };
  }

  private assertActive(usage: OrgUsage): void {
    if (!usage.plan || usage.estadoSuscripcion !== 'activa') {
      throw new ForbiddenException(
        'La suscripción no está activa. Contacta al administrador para activarla.',
      );
    }
  }

  private assertUnderLimit(limit: LimitUsage, recurso: string): void {
    if (limit.used >= limit.max) {
      throw new ForbiddenException(
        `Alcanzaste el límite de ${recurso} de tu plan (${limit.max}). Mejora tu plan para continuar.`,
      );
    }
  }

  /** @returns true si tras el alta se alcanza el 80% del límite (aviso). */
  async ensureCanAddContador(orgId: string): Promise<boolean> {
    const usage = await this.getUsage(orgId);
    this.assertActive(usage);
    this.assertUnderLimit(usage.contadores!, 'contadores');
    const { used, max } = usage.contadores!;
    return (used + 1) / max >= WARNING_THRESHOLD;
  }

  async ensureCanAddCliente(orgId: string): Promise<boolean> {
    const usage = await this.getUsage(orgId);
    this.assertActive(usage);
    this.assertUnderLimit(usage.clientes!, 'clientes');
    const { used, max } = usage.clientes!;
    return (used + 1) / max >= WARNING_THRESHOLD;
  }

  async ensureCanAddFactura(orgId: string): Promise<boolean> {
    const usage = await this.getUsage(orgId);
    this.assertActive(usage);
    this.assertUnderLimit(usage.facturasMes!, 'facturas este mes');
    const { used, max } = usage.facturasMes!;
    return (used + 1) / max >= WARNING_THRESHOLD;
  }
}
