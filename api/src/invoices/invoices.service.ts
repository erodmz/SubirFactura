import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Membership, Prisma } from '@facturard/shared/db';
import { fechaToPeriodoFiscal, validateInvoiceFields } from '@facturard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrQueueService } from '../queue/ocr-queue.service';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { ListInvoicesQueryDto, ReviewInvoiceDto } from './dto/invoices.dto';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const ALLOWED_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocrQueue: OcrQueueService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /** Sube la imagen a MinIO, crea la factura en `subida` y encola el OCR (§5.1). */
  async upload(
    orgId: string,
    user: AuthenticatedUser,
    membership: Membership,
    clientProfileId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const ext = ALLOWED_MIME.get(file.mimetype);
    if (!ext) {
      throw new BadRequestException('Formato no soportado: se aceptan JPEG, PNG o WebP');
    }

    const client = await this.prisma.forOrg(orgId).clientProfile.findUnique({
      where: { id: clientProfileId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (membership.rol === 'cliente') {
      const link = await this.prisma.clientMember.findUnique({
        where: { clientProfileId_userId: { clientProfileId, userId: user.userId } },
      });
      if (!link) {
        throw new ForbiddenException('No estás habilitado para subir facturas de este cliente');
      }
    }

    const limitWarning = await this.planLimits.ensureCanAddFactura(orgId);

    // Detección de duplicados por hash exacto de la imagen (§4).
    // TODO Fase 4: hash perceptual para fotos re-tomadas de la misma factura.
    const imageHash = createHash('sha256').update(new Uint8Array(file.buffer)).digest('hex');
    const duplicate = await this.prisma.forOrg(orgId).invoice.findFirst({
      where: { imagenPhash: imageHash },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Esta imagen ya fue subida (factura duplicada)');
    }

    const key = `invoices/${orgId}/${randomUUID()}.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);

    const invoice = await this.prisma.forOrg(orgId).invoice.create({
      data: {
        organizationId: orgId,
        clientProfileId,
        estado: 'subida',
        imagenUrl: key,
        imagenPhash: imageHash,
      },
    });

    await this.ocrQueue.enqueueExtraction({ invoiceId: invoice.id, organizationId: orgId });
    await this.audit.log({
      organizationId: orgId,
      userId: user.userId,
      accion: 'invoice.upload',
      entidad: 'invoice',
      entidadId: invoice.id,
    });

    return {
      ...invoice,
      limitWarning: limitWarning
        ? 'Estás cerca del límite de facturas mensuales de tu plan'
        : undefined,
    };
  }

  /** org_admin ve todo; contador solo clientes asignados; cliente solo su perfil (§4). */
  async list(orgId: string, user: AuthenticatedUser, membership: Membership, query: ListInvoicesQueryDto) {
    const where: Prisma.InvoiceWhereInput = {
      estado: query.estado,
      periodoFiscal: query.periodoFiscal,
      clientProfileId: query.clientProfileId,
    };

    if (membership.rol === 'contador') {
      const assignments = await this.prisma.assignment.findMany({
        where: { contadorMembershipId: membership.id },
        select: { clientProfileId: true },
      });
      const allowed = assignments.map((a) => a.clientProfileId);
      where.clientProfileId = query.clientProfileId
        ? allowed.includes(query.clientProfileId)
          ? query.clientProfileId
          : '__none__'
        : { in: allowed };
    } else if (membership.rol === 'cliente') {
      const links = await this.prisma.clientMember.findMany({
        where: { userId: user.userId },
        select: { clientProfileId: true },
      });
      where.clientProfileId = { in: links.map((l) => l.clientProfileId) };
    }

    return this.prisma.forOrg(orgId).invoice.findMany({
      where,
      include: { clientProfile: { select: { id: true, razonSocial: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(orgId: string, invoiceId: string) {
    const invoice = await this.prisma.forOrg(orgId).invoice.findUnique({
      where: { id: invoiceId },
      include: { clientProfile: { select: { id: true, razonSocial: true, rncOCedula: true } } },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return {
      ...invoice,
      imageUrl: await this.storage.presignedGetUrl(invoice.imagenUrl),
    };
  }

  /**
   * Edición campo a campo desde la cola de revisión. Si las validaciones
   * determinísticas pasan y los campos críticos están completos → `validada`.
   */
  async review(orgId: string, invoiceId: string, user: AuthenticatedUser, dto: ReviewInvoiceDto) {
    const invoice = await this.prisma.forOrg(orgId).invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.estado === 'reportada' || invoice.estado === 'incluida_en_606') {
      throw new ConflictException('La factura ya fue incluida en un reporte; no puede editarse');
    }

    const merged = {
      ncf: dto.ncf ?? invoice.ncf,
      rncProveedor: dto.rncProveedor ?? invoice.rncProveedor,
      fecha: dto.fecha ?? invoice.fecha?.toISOString().slice(0, 10) ?? null,
      montoFacturado: dto.montoFacturado ?? (invoice.montoFacturado?.toNumber() ?? null),
      itbis: dto.itbis ?? (invoice.itbis?.toNumber() ?? null),
      otrosImpuestos: dto.otrosImpuestos ?? (invoice.otrosImpuestos?.toNumber() ?? null),
      propinaLegal: dto.propinaLegal ?? (invoice.propinaLegal?.toNumber() ?? null),
      montoTotal: dto.montoTotal ?? null,
    };

    const errores = validateInvoiceFields(merged);
    if (errores.length > 0) {
      throw new BadRequestException({ message: errores, error: 'Validación fiscal' });
    }

    const criticosCompletos =
      merged.ncf != null &&
      merged.rncProveedor != null &&
      merged.fecha != null &&
      merged.montoFacturado != null &&
      merged.itbis != null;

    const updated = await this.prisma.forOrg(orgId).invoice.update({
      where: { id: invoiceId },
      data: {
        ncf: merged.ncf,
        rncProveedor: merged.rncProveedor,
        razonSocialProveedor: dto.razonSocialProveedor ?? invoice.razonSocialProveedor,
        fecha: merged.fecha ? new Date(merged.fecha) : null,
        montoFacturado: merged.montoFacturado,
        itbis: merged.itbis,
        otrosImpuestos: merged.otrosImpuestos,
        propinaLegal: merged.propinaLegal,
        categoria606: dto.categoria606 ?? invoice.categoria606,
        tipoComprobante: dto.tipoComprobante ?? invoice.tipoComprobante,
        periodoFiscal: merged.fecha ? fechaToPeriodoFiscal(merged.fecha) : invoice.periodoFiscal,
        estado: criticosCompletos ? 'validada' : 'en_revision',
      },
    });

    await this.audit.log({
      organizationId: orgId,
      userId: user.userId,
      accion: 'invoice.review',
      entidad: 'invoice',
      entidadId: invoiceId,
      datos: dto as object,
    });
    return updated;
  }

  /** Re-encola el OCR (p.ej. tras un fallo). */
  async retry(orgId: string, invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.forOrg(orgId).invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (!['subida', 'en_revision', 'procesando'].includes(invoice.estado)) {
      throw new ConflictException(`No se puede reprocesar una factura en estado ${invoice.estado}`);
    }
    await this.ocrQueue.enqueueExtraction({ invoiceId, organizationId: orgId });
    await this.audit.log({
      organizationId: orgId,
      userId: user.userId,
      accion: 'invoice.retry_ocr',
      entidad: 'invoice',
      entidadId: invoiceId,
    });
    return { queued: true };
  }
}
