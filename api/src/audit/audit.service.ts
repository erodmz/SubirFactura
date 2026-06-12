import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@facturard/shared/db';
import { PrismaService } from '../prisma/prisma.service';

/**
 * audit_log: quién hizo qué y cuándo — crítico para datos fiscales (§8).
 * Nunca rompe el flujo principal: un fallo de auditoría se loguea y sigue.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    organizationId?: string | null;
    userId?: string | null;
    accion: string;
    entidad: string;
    entidadId?: string | null;
    datos?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId ?? null,
          userId: entry.userId ?? null,
          accion: entry.accion,
          entidad: entry.entidad,
          entidadId: entry.entidadId ?? null,
          datos: entry.datos,
        },
      });
    } catch (err) {
      this.logger.error(`No se pudo registrar auditoría (${entry.accion})`, err);
    }
  }
}
