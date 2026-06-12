import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@facturard/shared/db';

export const ORG_ROLES_KEY = 'orgRoles';

/**
 * Exige que el usuario tenga membresía en la organización del parámetro
 * de ruta `:orgId` con alguno de los roles indicados.
 */
export const OrgRoles = (...roles: MembershipRole[]) => SetMetadata(ORG_ROLES_KEY, roles);
