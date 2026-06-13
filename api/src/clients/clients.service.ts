import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { validateTaxId } from '@facturard/shared';
import { Prisma, type Membership } from '@facturard/shared/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { CreateClientDto, UpdateClientDto } from './dto/clients.dto';

/**
 * CRUD de clientes finales. client_profiles está bajo RLS, por lo que todas
 * las operaciones usan prisma.forOrg(orgId) — la doble barrera del §8.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async create(orgId: string, actorUserId: string, dto: CreateClientDto) {
    const taxId = validateTaxId(dto.rncOCedula);
    if (!taxId.valid) {
      throw new BadRequestException(taxId.error ?? 'RNC o cédula inválido');
    }
    const limitWarning = await this.planLimits.ensureCanAddCliente(orgId);

    const existing = await this.prisma.forOrg(orgId).clientProfile.findFirst({
      where: { rncOCedula: taxId.normalized },
    });
    if (existing) throw new ConflictException('Ya existe un cliente con ese RNC/cédula');

    const client = await this.prisma.forOrg(orgId).clientProfile.create({
      data: {
        organizationId: orgId,
        rncOCedula: taxId.normalized!,
        razonSocial: dto.razonSocial,
        userId: dto.userId,
      },
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'client.create',
      entidad: 'client_profile',
      entidadId: client.id,
    });
    return {
      ...client,
      limitWarning: limitWarning ? 'Estás cerca del límite de clientes de tu plan' : undefined,
    };
  }

  /** org_admin ve todos; contador solo asignados; cliente solo donde es miembro (§4). */
  async list(orgId: string, membership: Membership) {
    if (membership.rol === 'cliente') {
      const links = await this.prisma.clientMember.findMany({
        where: { userId: membership.userId },
        select: { clientProfileId: true },
      });
      return this.prisma.forOrg(orgId).clientProfile.findMany({
        where: { id: { in: links.map((l) => l.clientProfileId) } },
        orderBy: { razonSocial: 'asc' },
      });
    }
    if (membership.rol === 'contador') {
      const assignments = await this.prisma.assignment.findMany({
        where: { contadorMembershipId: membership.id },
        select: { clientProfileId: true },
      });
      return this.prisma.forOrg(orgId).clientProfile.findMany({
        where: { id: { in: assignments.map((a) => a.clientProfileId) } },
        orderBy: { razonSocial: 'asc' },
      });
    }
    return this.prisma.forOrg(orgId).clientProfile.findMany({ orderBy: { razonSocial: 'asc' } });
  }

  async get(orgId: string, clientId: string) {
    const client = await this.prisma.forOrg(orgId).clientProfile.findUnique({
      where: { id: clientId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const assignments = await this.prisma.assignment.findMany({
      where: { clientProfileId: clientId },
      include: {
        contadorMembership: {
          include: { user: { select: { id: true, nombre: true, email: true } } },
        },
      },
    });
    return { ...client, contadores: assignments.map((a) => a.contadorMembership) };
  }

  async update(orgId: string, clientId: string, actorUserId: string, dto: UpdateClientDto) {
    await this.get(orgId, clientId);
    const client = await this.prisma.forOrg(orgId).clientProfile.update({
      where: { id: clientId },
      data: { razonSocial: dto.razonSocial ?? undefined, userId: dto.userId },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'client.update',
      entidad: 'client_profile',
      entidadId: clientId,
      datos: dto as object,
    });
    return client;
  }

  async remove(orgId: string, clientId: string, actorUserId: string) {
    await this.get(orgId, clientId);
    const invoices = await this.prisma.forOrg(orgId).invoice.count({
      where: { clientProfileId: clientId },
    });
    if (invoices > 0) {
      throw new ConflictException(
        'El cliente tiene facturas registradas; no puede eliminarse (datos fiscales)',
      );
    }
    await this.prisma.assignment.deleteMany({ where: { clientProfileId: clientId } });
    await this.prisma.forOrg(orgId).clientProfile.delete({ where: { id: clientId } });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'client.delete',
      entidad: 'client_profile',
      entidadId: clientId,
    });
  }

  async assign(orgId: string, clientId: string, contadorMembershipId: string, actorUserId: string) {
    await this.get(orgId, clientId);
    const membership = await this.prisma.membership.findUnique({
      where: { id: contadorMembershipId },
    });
    if (!membership || membership.organizationId !== orgId || membership.rol !== 'contador') {
      throw new BadRequestException('El miembro indicado no es un contador de esta organización');
    }
    const existing = await this.prisma.assignment.findUnique({
      where: {
        contadorMembershipId_clientProfileId: {
          contadorMembershipId,
          clientProfileId: clientId,
        },
      },
    });
    if (existing) throw new ConflictException('El contador ya está asignado a este cliente');

    const assignment = await this.prisma.assignment.create({
      data: { contadorMembershipId, clientProfileId: clientId },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'client.assign_contador',
      entidad: 'assignment',
      entidadId: `${contadorMembershipId}:${clientId}`,
    });
    return assignment;
  }

  async unassign(
    orgId: string,
    clientId: string,
    contadorMembershipId: string,
    actorUserId: string,
  ) {
    await this.get(orgId, clientId);
    await this.prisma.assignment.deleteMany({
      where: { contadorMembershipId, clientProfileId: clientId },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'client.unassign_contador',
      entidad: 'assignment',
      entidadId: `${contadorMembershipId}:${clientId}`,
    });
  }

  // ── Usuarios que suben facturas del cliente (muchos a muchos) ──────────────

  /** Lista los usuarios habilitados para subir facturas de este cliente. */
  async listMembers(orgId: string, clientId: string) {
    await this.get(orgId, clientId);
    const links = await this.prisma.clientMember.findMany({
      where: { clientProfileId: clientId },
      include: { user: { select: { id: true, nombre: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => l.user);
  }

  /** Habilita a un usuario (ya miembro de la organización) a subir facturas del cliente. */
  async addMember(orgId: string, clientId: string, userId: string, actorUserId: string) {
    await this.get(orgId, clientId);
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!membership) {
      throw new BadRequestException(
        'Ese usuario no es miembro de la organización; invítalo primero desde Equipo',
      );
    }
    try {
      await this.prisma.clientMember.create({ data: { clientProfileId: clientId, userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('El usuario ya está habilitado para este cliente');
      }
      throw err;
    }
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'client.add_member',
      entidad: 'client_member',
      entidadId: `${clientId}:${userId}`,
    });
  }

  async removeMember(orgId: string, clientId: string, userId: string, actorUserId: string) {
    await this.get(orgId, clientId);
    await this.prisma.clientMember.deleteMany({
      where: { clientProfileId: clientId, userId },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'client.remove_member',
      entidad: 'client_member',
      entidadId: `${clientId}:${userId}`,
    });
  }
}
