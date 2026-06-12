import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SetSubscriptionDto } from './dto/admin.dto';

/**
 * Panel super-admin (§7): activar/extender/suspender suscripciones tras
 * recibir la transferencia. v1 = cobro manual.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listOrganizations() {
    return this.prisma.organization.findMany({
      include: {
        plan: { select: { nombre: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setSubscription(orgId: string, actorUserId: string, dto: SetSubscriptionDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organización no encontrada');

    const plan = await this.prisma.plan.findUnique({ where: { nombre: dto.planNombre } });
    if (!plan) throw new NotFoundException(`Plan no encontrado: ${dto.planNombre}`);

    const subscription = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscription.create({
        data: {
          organizationId: orgId,
          planId: plan.id,
          estado: dto.estado,
          inicio: dto.inicio ? new Date(dto.inicio) : new Date(),
          fin: dto.fin ? new Date(dto.fin) : null,
          metodoPago: dto.metodoPago ?? 'transferencia',
        },
      });
      await tx.organization.update({
        where: { id: orgId },
        data: { planId: plan.id, estadoSuscripcion: dto.estado },
      });
      return created;
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'admin.set_subscription',
      entidad: 'subscription',
      entidadId: subscription.id,
      datos: { plan: plan.nombre, estado: dto.estado, fin: dto.fin ?? null },
    });
    return subscription;
  }

  listSubscriptions(orgId: string) {
    return this.prisma.subscription.findMany({
      where: { organizationId: orgId },
      include: { plan: { select: { nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
