import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { hashToken } from '../auth/auth.service';
import { CreateInvitationDto } from './dto/invitations.dto';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const INVITATION_TTL_MS = 7 * 86_400_000; // 7 días

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /**
   * v1 sin correo saliente: devuelve el enlace para compartirlo manualmente
   * (WhatsApp es el canal real de los contadores dominicanos).
   */
  async create(orgId: string, inviterUserId: string, dto: CreateInvitationDto) {
    let warning = false;
    if (dto.rol === 'contador') {
      warning = await this.planLimits.ensureCanAddContador(orgId);
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_organizationId: { userId: existingUser.id, organizationId: orgId } },
      });
      if (membership) throw new ConflictException('Ese usuario ya es miembro de la organización');
    }

    // El negocio vinculado solo aplica a clientes y debe pertenecer a ESTA org.
    let clientProfile: { id: string; razonSocial: string } | null = null;
    if (dto.clientProfileId) {
      if (dto.rol !== 'cliente') {
        throw new BadRequestException('Solo las invitaciones de cliente llevan un negocio vinculado');
      }
      clientProfile = await this.prisma.forOrg(orgId).clientProfile.findFirst({
        where: { id: dto.clientProfileId, organizationId: orgId },
        select: { id: true, razonSocial: true },
      });
      if (!clientProfile) throw new BadRequestException('El negocio indicado no existe en esta empresa');
    }

    const token = randomBytes(32).toString('hex');
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: orgId,
        email: dto.email,
        rol: dto.rol,
        clientProfileId: clientProfile?.id ?? null,
        tokenHash: hashToken(token),
        invitedById: inviterUserId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    await this.audit.log({
      organizationId: orgId,
      userId: inviterUserId,
      accion: 'invitation.create',
      entidad: 'invitation',
      entidadId: invitation.id,
      datos: { email: dto.email, rol: dto.rol, clientProfileId: clientProfile?.id },
    });

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return {
      id: invitation.id,
      email: invitation.email,
      rol: invitation.rol,
      negocio: clientProfile?.razonSocial,
      expiresAt: invitation.expiresAt,
      inviteUrl: `${baseUrl}/invitations/${token}`,
      limitWarning: warning
        ? 'Estás cerca del límite de contadores de tu plan'
        : undefined,
    };
  }

  private async findByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { id: true, nombre: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    return invitation;
  }

  /** Información pública para la pantalla de aceptación. */
  async getPublic(token: string) {
    const invitation = await this.findByToken(token);
    // client_profiles tiene RLS: en esta ruta pública no hay org en sesión, así
    // que el nombre del negocio se lee con el cliente org-scoped explícito.
    const negocio = invitation.clientProfileId
      ? await this.prisma
          .forOrg(invitation.organizationId)
          .clientProfile.findUnique({
            where: { id: invitation.clientProfileId },
            select: { razonSocial: true },
          })
      : null;
    return {
      organization: invitation.organization.nombre,
      email: invitation.email,
      rol: invitation.rol,
      negocio: negocio?.razonSocial ?? null,
      estado: invitation.acceptedAt
        ? 'aceptada'
        : invitation.expiresAt < new Date()
          ? 'expirada'
          : 'pendiente',
    };
  }

  async accept(token: string, user: AuthenticatedUser) {
    const invitation = await this.findByToken(token);
    if (invitation.acceptedAt) throw new ConflictException('La invitación ya fue usada');
    if (invitation.expiresAt < new Date()) throw new ForbiddenException('La invitación expiró');
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('La invitación es para otro correo electrónico');
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      const created = await tx.membership.create({
        data: {
          userId: user.userId,
          organizationId: invitation.organizationId,
          rol: invitation.rol,
        },
      });
      // Invitación de cliente con negocio vinculado: el client_member se crea
      // aquí mismo — sin el 2.º paso manual en "Gestionar" que nadie descubría.
      if (invitation.rol === 'cliente' && invitation.clientProfileId) {
        await tx.clientMember.upsert({
          where: {
            clientProfileId_userId: {
              clientProfileId: invitation.clientProfileId,
              userId: user.userId,
            },
          },
          create: { clientProfileId: invitation.clientProfileId, userId: user.userId },
          update: {},
        });
      }
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    await this.audit.log({
      organizationId: invitation.organizationId,
      userId: user.userId,
      accion: 'invitation.accept',
      entidad: 'membership',
      entidadId: membership.id,
    });
    return membership;
  }
}
