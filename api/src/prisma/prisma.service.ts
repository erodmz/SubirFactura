import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@facturard/shared/db';

/**
 * Cliente Prisma para NestJS.
 *
 * - Conexión perezosa: el API arranca aunque la BD no esté disponible todavía.
 * - Si APP_DATABASE_URL está definida se conecta con el rol `facturard_app`
 *   (sin BYPASSRLS), de modo que las políticas de row-level security aplican.
 * - `forOrg(orgId)` devuelve un cliente que fija `app.current_org` en cada
 *   operación: la RLS filtra cualquier consulta que olvide el organization_id.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasourceUrl: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    if (!process.env.APP_DATABASE_URL) {
      this.logger.warn(
        'APP_DATABASE_URL no definida: usando DATABASE_URL (la RLS no aplica a roles dueños/superusuario)',
      );
    }
  }

  forOrg(orgId: string) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // El callback de la extensión necesita el cliente base para abrir la transacción
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const base = this;
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.current_org', ${orgId}, TRUE)`,
              query(args) as any,
            ]);
            return result;
          },
        },
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export type OrgScopedClient = ReturnType<PrismaService['forOrg']>;
