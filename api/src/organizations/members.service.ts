import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MembershipRole } from '@facturard/shared/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(orgId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, email: true, nombre: true, telefono: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getInOrg(orgId: string, membershipId: string) {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.organizationId !== orgId) {
      throw new NotFoundException('Miembro no encontrado en esta organización');
    }
    return membership;
  }

  private async assertNotLastAdmin(orgId: string, membershipId: string) {
    const admins = await this.prisma.membership.findMany({
      where: { organizationId: orgId, rol: 'org_admin' },
    });
    if (admins.length === 1 && admins[0]!.id === membershipId) {
      throw new BadRequestException('La organización debe conservar al menos un administrador');
    }
  }

  async updateRole(orgId: string, membershipId: string, rol: MembershipRole, actorUserId: string) {
    const membership = await this.getInOrg(orgId, membershipId);
    if (membership.rol === 'org_admin' && rol !== 'org_admin') {
      await this.assertNotLastAdmin(orgId, membershipId);
    }
    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { rol },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'membership.update_role',
      entidad: 'membership',
      entidadId: membershipId,
      datos: { de: membership.rol, a: rol },
    });
    return updated;
  }

  async remove(orgId: string, membershipId: string, actorUserId: string) {
    const membership = await this.getInOrg(orgId, membershipId);
    if (membership.rol === 'org_admin') {
      await this.assertNotLastAdmin(orgId, membershipId);
    }
    await this.prisma.$transaction([
      this.prisma.assignment.deleteMany({ where: { contadorMembershipId: membershipId } }),
      this.prisma.membership.delete({ where: { id: membershipId } }),
    ]);
    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'membership.remove',
      entidad: 'membership',
      entidadId: membershipId,
    });
  }
}
