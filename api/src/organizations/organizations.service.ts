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

// El documento de verificación admite además PDF (registro mercantil, factura).
const VERIF_MIME = new Map([...LOGO_MIME, ['application/pdf', 'pdf']]);

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
    // El autoservicio nace pendiente de aprobación (KYC): avisar SIEMPRE al
    // operador; si además eligió plan pago, ese detalle va en el mensaje.
    await notifyBusinessEvent(
      'Nueva empresa pendiente de aprobación',
      `"${org.nombre}" se registró con el plan ${plan.nombre}${Number(plan.precio) > 0 ? ' (pago)' : ''}. Revisa su documento y apruébala en el panel.`,
    );
    return org;
  }

  /**
   * Documento de verificación KYC (org_admin, mientras está pendiente o
   * rechazada): una factura del negocio, registro mercantil, etc. Reemplaza el
   * anterior si se sube de nuevo (caso rechazo → corregir → reintentar).
   */
  async uploadVerificationDoc(
    orgId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string },
  ) {
    const ext = VERIF_MIME.get(file.mimetype);
    if (!ext) {
      throw new BadRequestException('Formato no válido (usa PDF, PNG, JPG o WebP)');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (org.estadoAprobacion === 'aprobada') {
      throw new BadRequestException('La empresa ya está aprobada');
    }
    const key = `verificaciones/${orgId}/${randomUUID()}.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    await this.prisma.organization.update({
      where: { id: orgId },
      // Reintento tras rechazo: vuelve a pendiente y limpia el motivo.
      data: { verificacionDocKey: key, estadoAprobacion: 'pendiente', motivoRechazo: null },
    });
    await this.audit.log({
      organizationId: orgId,
      userId,
      accion: 'organization.upload_verificacion',
      entidad: 'organization',
      entidadId: orgId,
    });
    await notifyBusinessEvent(
      'Documento de verificación recibido',
      `"${org.nombre}" subió su documento. Revísalo y aprueba o rechaza en el panel.`,
    );
    return { ok: true, estadoAprobacion: 'pendiente' };
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

    // Cobro manual (§7): un plan PAGO no se activa solo. El autoservicio antes
    // ponía la suscripción "activa" al instante, así que cualquiera se subía a
    // Empresarial sin pagar. Ahora un plan pago es una SOLICITUD: se avisa al
    // operador para coordinar el cobro y el plan efectivo NO cambia hasta que
    // el super-admin lo confirme en el panel. Solo el plan gratis (bajar a
    // Básico) se aplica en el acto — no hay nada que cobrar.
    if (Number(plan.precio) > 0) {
      await this.audit.log({
        organizationId: orgId,
        userId,
        accion: 'organization.request_plan',
        entidad: 'organization',
        entidadId: orgId,
        datos: { de: org.plan?.nombre ?? null, solicita: plan.nombre },
      });
      await notifyBusinessEvent(
        'Solicitud de plan pago',
        `"${org.nombre}" solicita ${plan.nombre} (tenía ${org.plan?.nombre ?? 'sin plan'}). ` +
          `Coordina el pago y actívalo en el panel.`,
      );
      return {
        plan: { nombre: org.plan?.nombre ?? plan.nombre },
        solicitudPendiente: true,
        planSolicitado: plan.nombre,
      };
    }

    // Bajar de plan no borra clientes ni contadores ya creados: simplemente el
    // límite pasa a ser menor. Avisamos si quedan POR ENCIMA del nuevo tope —
    // no podrán añadir más de esa categoría hasta bajar el conteo. Antes esto
    // pasaba en silencio y luego "no puedo crear clientes" no tenía explicación.
    const [contadores, clientes] = await Promise.all([
      this.prisma.membership.count({
        where: { organizationId: orgId, rol: { in: ['contador', 'org_admin'] }, deletedAt: null },
      }),
      this.prisma.forOrg(orgId).clientProfile.count(),
    ]);
    const excesos: string[] = [];
    if (contadores > plan.maxContadores)
      excesos.push(`${contadores} contadores (el nuevo plan permite ${plan.maxContadores})`);
    if (clientes > plan.maxClientes)
      excesos.push(`${clientes} clientes (el nuevo plan permite ${plan.maxClientes})`);

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
    return {
      plan: { nombre: plan.nombre },
      solicitudPendiente: false,
      advertencia: excesos.length
        ? `Tienes ${excesos.join(' y ')}. No podrás añadir más hasta quedar dentro del límite.`
        : undefined,
    };
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
