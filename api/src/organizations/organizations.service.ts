import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { validateTaxId } from '@facturard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organizations.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Crea la empresa contable y al creador como org_admin. Arranca en el plan
   * Básico con suscripción activa; el super-admin la ajusta tras el pago (§7).
   */
  async create(userId: string, dto: CreateOrganizationDto) {
    if (dto.rnc && !validateTaxId(dto.rnc).valid) {
      throw new BadRequestException('RNC inválido');
    }
    const planBasico = await this.prisma.plan.findUnique({ where: { nombre: 'Básico' } });

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          nombre: dto.nombre,
          rnc: dto.rnc,
          planId: planBasico?.id,
          estadoSuscripcion: planBasico ? 'activa' : null,
        },
      });
      await tx.membership.create({
        data: { userId, organizationId: created.id, rol: 'org_admin' },
      });
      if (planBasico) {
        await tx.subscription.create({
          data: {
            organizationId: created.id,
            planId: planBasico.id,
            estado: 'activa',
            inicio: new Date(),
            metodoPago: 'manual',
          },
        });
      }
      return created;
    });

    await this.audit.log({
      organizationId: org.id,
      userId,
      accion: 'organization.create',
      entidad: 'organization',
      entidadId: org.id,
    });
    return org;
  }

  async get(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { plan: true },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  async update(orgId: string, userId: string, dto: UpdateOrganizationDto) {
    if (dto.rnc && !validateTaxId(dto.rnc).valid) {
      throw new BadRequestException('RNC inválido');
    }
    const org = await this.prisma.organization.update({ where: { id: orgId }, data: dto });
    await this.audit.log({
      organizationId: orgId,
      userId,
      accion: 'organization.update',
      entidad: 'organization',
      entidadId: orgId,
      datos: dto as object,
    });
    return org;
  }
}
