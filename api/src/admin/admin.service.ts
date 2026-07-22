import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { validateTaxId } from '@facturard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { hashToken } from '../auth/auth.service';
import { AdminCreateOrganizationDto, SetSubscriptionDto } from './dto/admin.dto';

const INVITATION_TTL_MS = 7 * 86_400_000; // 7 días

/**
 * Panel super-admin (§7): el gestor de la plataforma. Crea empresas contadoras
 * (con plan e invitación a su org_admin), activa/extiende/suspende
 * suscripciones tras la transferencia (v1 = cobro manual) y borra empresas
 * (borrado lógico: los datos fiscales se conservan).
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
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

  /**
   * Crea una empresa contadora "llave en mano": org + plan elegido +
   * invitación al contador que será su org_admin (enlace para compartir por
   * WhatsApp, igual que las demás invitaciones). El super-admin NO queda como
   * miembro: gestiona desde fuera.
   */
  async createOrganization(actorUserId: string, dto: AdminCreateOrganizationDto) {
    if (dto.rnc && !validateTaxId(dto.rnc).valid) {
      throw new BadRequestException('RNC inválido');
    }
    if (dto.rnc) {
      const dup = await this.prisma.organization.findUnique({ where: { rnc: dto.rnc } });
      if (dup) throw new BadRequestException(`Ya existe una empresa con el RNC ${dto.rnc}: ${dup.nombre}`);
    }
    const planNombre = dto.planNombre ?? 'Básico';
    const plan = await this.prisma.plan.findUnique({ where: { nombre: planNombre } });
    if (!plan) throw new NotFoundException(`Plan no encontrado: ${planNombre}`);

    const token = dto.adminEmail ? randomBytes(32).toString('hex') : null;

    const { org, invitation } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          nombre: dto.nombre,
          rnc: dto.rnc,
          planId: plan.id,
          estadoSuscripcion: 'activa',
          // La crea el propio operador: no pasa por el embudo KYC.
          estadoAprobacion: 'aprobada',
        },
      });
      await tx.subscription.create({
        data: {
          organizationId: created.id,
          planId: plan.id,
          estado: 'activa',
          inicio: new Date(),
          metodoPago: 'manual',
        },
      });
      // La invitación se crea con rol org_admin directamente (el DTO público de
      // invitaciones no lo permite; esta ruta es solo del super-admin).
      const inv = token
        ? await tx.invitation.create({
            data: {
              organizationId: created.id,
              email: dto.adminEmail!,
              rol: 'org_admin',
              tokenHash: hashToken(token),
              invitedById: actorUserId,
              expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
            },
          })
        : null;
      return { org: created, invitation: inv };
    });

    await this.audit.log({
      organizationId: org.id,
      userId: actorUserId,
      accion: 'admin.create_organization',
      entidad: 'organization',
      entidadId: org.id,
      datos: { plan: plan.nombre, adminEmail: dto.adminEmail ?? null },
    });

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return {
      ...org,
      plan: { nombre: plan.nombre },
      invitation:
        invitation && token
          ? {
              email: invitation.email,
              rol: invitation.rol,
              expiresAt: invitation.expiresAt,
              inviteUrl: `${baseUrl}/invitations/${token}`,
            }
          : null,
    };
  }

  /** Documento de verificación KYC de una empresa (lo revisa el super-admin). */
  async verificationDocBytes(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { verificacionDocKey: true },
    });
    if (!org?.verificacionDocKey) {
      throw new NotFoundException('Esta empresa no ha subido documento de verificación');
    }
    return this.storage.getObject(org.verificacionDocKey);
  }

  /** Aprueba la empresa (KYC): desbloquea el uso del app para sus miembros. */
  async approveOrganization(orgId: string, actorUserId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (org.estadoAprobacion === 'aprobada') {
      throw new BadRequestException('La empresa ya está aprobada');
    }
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { estadoAprobacion: 'aprobada', motivoRechazo: null },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'admin.approve_organization',
      entidad: 'organization',
      entidadId: orgId,
    });
    return updated;
  }

  /** Rechaza la empresa con motivo; el org_admin puede corregir y resubir. */
  async rejectOrganization(orgId: string, actorUserId: string, motivo: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { estadoAprobacion: 'rechazada', motivoRechazo: motivo },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'admin.reject_organization',
      entidad: 'organization',
      entidadId: orgId,
      datos: { motivo },
    });
    return updated;
  }

  /** Borrado lógico: la org desaparece para sus miembros; los datos quedan. */
  async softDeleteOrganization(orgId: string, actorUserId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (org.deletedAt) throw new BadRequestException('La organización ya está borrada');

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'admin.delete_organization',
      entidad: 'organization',
      entidadId: orgId,
    });
    return updated;
  }

  /** Deshace el borrado lógico. */
  async restoreOrganization(orgId: string, actorUserId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (!org.deletedAt) throw new BadRequestException('La organización no está borrada');

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { deletedAt: null },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'admin.restore_organization',
      entidad: 'organization',
      entidadId: orgId,
    });
    return updated;
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
