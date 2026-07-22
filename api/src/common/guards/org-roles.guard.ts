import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@facturard/shared/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';
import { ALLOW_PENDING_ORG_KEY } from '../decorators/allow-pending-org.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Autorización por membresía y rol en cada endpoint con :orgId (§8).
 * Adjunta `request.membership` para que los controllers conozcan el rol.
 */
@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    const orgId: string | undefined = request.params?.orgId;
    if (!user) throw new ForbiddenException('No autenticado');
    if (!orgId) throw new BadRequestException('Falta el parámetro de organización');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.userId, organizationId: orgId } },
      include: { organization: { select: { deletedAt: true, estadoAprobacion: true } } },
    });
    // Una org con borrado lógico deja de existir para sus miembros.
    if (!membership || membership.organization.deletedAt || !roles.includes(membership.rol)) {
      throw new ForbiddenException('No tienes permiso en esta organización');
    }

    // KYC: hasta que el super-admin apruebe, la empresa solo puede ver su
    // estado y subir el documento de verificación (@AllowPendingOrg).
    if (membership.organization.estadoAprobacion !== 'aprobada') {
      const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_ORG_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowPending) {
        throw new ForbiddenException(
          'Tu empresa está en revisión. Te avisaremos en cuanto quede aprobada.',
        );
      }
    }

    request.membership = membership;
    return true;
  }
}
