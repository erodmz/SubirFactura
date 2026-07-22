import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { notifyBusinessEvent, validateTaxId } from '@facturard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organizations.dto';

const LOGO_MIME = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

/**
 * Ruta del logo servida por el propio API, RELATIVA a la base del API — el
 * cliente la antepone con la suya (en producción, mismo origen tras Caddy: '').
 *
 * Se sirve por el API y no con una URL firmada de MinIO porque así el almacén
 * nunca queda expuesto a internet. La ruta es pública (ver el controller): el
 * logo es la marca del propio despacho —la imprime en sus documentos—, no es un
 * dato de terceros, y el id de la organización es un UUID no adivinable. Esto
 * permite usarlo directo en <img src>, que no puede mandar el header de
 * Authorization.
 */
export function logoPath(orgId: string, logoKey: string | null): string | null {
  return logoKey ? `/api/organizations/${orgId}/logo` : null;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Crea la empresa contable y al creador como org_admin, con el plan elegido
   * en el onboarding (default Básico) y suscripción activa. Cobro manual en
   * v1 (§7): elegir un plan pago notifica al operador para gestionar el pago.
   */
  async create(userId: string, dto: CreateOrganizationDto) {
    if (dto.rnc && !validateTaxId(dto.rnc).valid) {
      throw new BadRequestException('RNC inválido');
    }
    if (dto.rnc) {
      const dup = await this.prisma.organization.findUnique({ where: { rnc: dto.rnc } });
      if (dup) throw new BadRequestException('Ya existe una empresa registrada con ese RNC');
    }
    const planNombre = dto.planNombre ?? 'Básico';
    const plan = await this.prisma.plan.findUnique({ where: { nombre: planNombre } });
    if (!plan) throw new BadRequestException(`Plan no válido: ${planNombre}`);

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          nombre: dto.nombre,
          rnc: dto.rnc,
          planId: plan.id,
          estadoSuscripcion: 'activa',
        },
      });
      await tx.membership.create({
        data: { userId, organizationId: created.id, rol: 'org_admin' },
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
      return created;
    });

    await this.audit.log({
      organizationId: org.id,
      userId,
      accion: 'organization.create',
      entidad: 'organization',
      entidadId: org.id,
      datos: { plan: plan.nombre },
    });
    if (Number(plan.precio) > 0) {
      await notifyBusinessEvent(
        'Nueva empresa con plan pago',
        `"${org.nombre}" se registró con el plan ${plan.nombre}. Coordina el pago.`,
      );
    }
    return org;
  }

  /**
   * Cambio de plan por el propio org_admin (autoservicio). Se aplica al
   * instante; el cobro sigue siendo manual, así que todo cambio a plan pago
   * notifica al operador de la plataforma.
   */
  async changePlan(orgId: string, userId: string, planNombre: string) {
    const plan = await this.prisma.plan.findUnique({ where: { nombre: planNombre } });
    if (!plan) throw new BadRequestException(`Plan no válido: ${planNombre}`);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { plan: { select: { nombre: true } } },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (org.planId === plan.id) {
      throw new BadRequestException(`Ya estás en el plan ${plan.nombre}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.create({
        data: {
          organizationId: orgId,
          planId: plan.id,
          estado: 'activa',
          inicio: new Date(),
          metodoPago: 'manual',
        },
      });
      await tx.organization.update({
        where: { id: orgId },
        data: { planId: plan.id, estadoSuscripcion: 'activa' },
      });
    });

    await this.audit.log({
      organizationId: orgId,
      userId,
      accion: 'organization.change_plan',
      entidad: 'organization',
      entidadId: orgId,
      datos: { de: org.plan?.nombre ?? null, a: plan.nombre },
    });
    if (Number(plan.precio) > 0) {
      await notifyBusinessEvent(
        'Cambio a plan pago',
        `"${org.nombre}" cambió de ${org.plan?.nombre ?? 'sin plan'} a ${plan.nombre}. Coordina el pago.`,
      );
    }
    return { plan: { nombre: plan.nombre } };
  }

  async get(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { plan: true },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return { ...org, logoUrl: logoPath(org.id, org.logoKey) };
  }

  /** Bytes del logo para servirlo por el propio API (ver logoPath). */
  async logoBytes(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { logoKey: true },
    });
    if (!org?.logoKey) throw new NotFoundException('Esta organización no tiene logo');
    return this.storage.getObject(org.logoKey);
  }

  async update(orgId: string, userId: string, dto: UpdateOrganizationDto) {
    if (dto.rnc && !validateTaxId(dto.rnc).valid) {
      throw new BadRequestException('RNC inválido');
    }
    if (dto.rnc) {
      const dup = await this.prisma.organization.findUnique({ where: { rnc: dto.rnc } });
      if (dup && dup.id !== orgId) {
        throw new BadRequestException('Ya existe una empresa registrada con ese RNC');
      }
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

  /** Sube/reemplaza el logo de la empresa (lo muestra la lista de empresas). */
  async uploadLogo(
    orgId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string },
  ) {
    const ext = LOGO_MIME.get(file.mimetype);
    if (!ext) {
      throw new BadRequestException('Formato de logo no válido (usa PNG, JPG o WebP)');
    }
    const key = `logos/${orgId}/${randomUUID()}.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    await this.prisma.organization.update({ where: { id: orgId }, data: { logoKey: key } });
    await this.audit.log({
      organizationId: orgId,
      userId,
      accion: 'organization.upload_logo',
      entidad: 'organization',
      entidadId: orgId,
    });
    return { logoUrl: logoPath(orgId, key) };
  }
}
