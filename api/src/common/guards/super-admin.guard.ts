import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/** Protege el panel /admin (gestión manual de suscripciones — §7). */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user;
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Requiere privilegios de super-admin');
    }
    return true;
  }
}
