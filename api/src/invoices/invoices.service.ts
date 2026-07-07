import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Membership, Prisma } from '@facturard/shared/db';
import {
  buildFiscalValidation,
  CATEGORIAS_606,
  fechaToPeriodoFiscal,
  validateInvoiceFields,
} from '@facturard/shared';
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

  /**
   * Sube una o varias fotos (páginas) como UNA factura, crea en `subida` y
   * encola el OCR (§5.1). Útil para comprobantes largos en varias fotos.
   */
  async upload(
    orgId: string,
    user: AuthenticatedUser,
    membership: Membership,
    clientProfileId: string | undefined,
    files: { buffer: Buffer; mimetype: string; size: number }[],
  ) {
    const [primaryFile, ...restFiles] = files;
    if (!primaryFile) {
      throw new BadRequestException('No se recibió ninguna imagen');
    }
    for (const f of files) {
      if (!ALLOWED_MIME.has(f.mimetype)) {
        throw new BadRequestException('Formato no soportado: se aceptan JPEG, PNG o WebP');
      }
    }

    if (clientProfileId) {
      // Se indicó la empresa: validar que exista y (si es cliente) que la maneje.
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
    } else if (membership.rol === 'cliente') {
      // Un cliente siempre sube a su propia empresa.
      throw new BadRequestException('Indica a qué empresa pertenece la factura');
    }
    // Contador/admin sin empresa: se auto-asigna por RNC del comprador en el worker.

    const limitWarning = await this.planLimits.ensureCanAddFactura(orgId);

    // Duplicados por hash exacto de la primera página (§4).
    const imageHash = createHash('sha256')
      .update(new Uint8Array(primaryFile.buffer))
      .digest('hex');
    const duplicate = await this.prisma.forOrg(orgId).invoice.findFirst({
      where: { imagenPhash: imageHash },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Esta imagen ya fue subida (factura duplicada)');
    }

    // Sube cada página a MinIO
    const upload = async (f: { buffer: Buffer; mimetype: string }) => {
      const ext = ALLOWED_MIME.get(f.mimetype)!;
      const key = `invoices/${orgId}/${randomUUID()}.${ext}`;
      await this.storage.putObject(key, f.buffer, f.mimetype);
      return key;
    };
    const primaryKey = await upload(primaryFile);
    const additionalKeys: string[] = [];
    for (const f of restFiles) {
      additionalKeys.push(await upload(f));
    }

    const invoice = await this.prisma.forOrg(orgId).invoice.create({
      data: {
        organizationId: orgId,
        clientProfileId: clientProfileId ?? null,
        estado: 'subida',
        imagenUrl: primaryKey,
        imagenPhash: imageHash,
        images: {
          create: additionalKeys.map((key, i) => ({ key, orderIndex: i + 1 })),
        },
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

  /**
   * Alcance por rol sobre facturas (misma regla que list()): org_admin sin
   * restricción (null); contador solo sus clientes asignados + las "sin
   * asignar" (para resolverlas); cliente solo sus negocios.
   */
  private async invoiceScope(
    user: AuthenticatedUser,
    membership: Membership,
  ): Promise<{ ids: string[]; incluyeSinAsignar: boolean } | null> {
    if (membership.rol === 'contador') {
      const assignments = await this.prisma.assignment.findMany({
        where: { contadorMembershipId: membership.id },
        select: { clientProfileId: true },
      });
      return { ids: assignments.map((a) => a.clientProfileId), incluyeSinAsignar: true };
    }
    if (membership.rol === 'cliente') {
      const links = await this.prisma.clientMember.findMany({
        where: { userId: user.userId },
        select: { clientProfileId: true },
      });
      return { ids: links.map((l) => l.clientProfileId), incluyeSinAsignar: false };
    }
    return null; // org_admin
  }

  /**
   * La RLS aísla ENTRE organizaciones; esto aísla DENTRO de la organización:
   * una factura fuera del alcance del usuario se responde como inexistente
   * (404, sin revelar que el id existe).
   */
  private assertInvoiceInScope(
    invoice: { clientProfileId: string | null },
    scope: { ids: string[]; incluyeSinAsignar: boolean } | null,
  ) {
    if (!scope) return;
    if (invoice.clientProfileId == null) {
      if (scope.incluyeSinAsignar) return;
    } else if (scope.ids.includes(invoice.clientProfileId)) {
      return;
    }
    throw new NotFoundException('Factura no encontrada');
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
      if (query.clientProfileId) {
        where.clientProfileId = allowed.includes(query.clientProfileId)
          ? query.clientProfileId
          : '__none__';
      } else {
        // Sus clientes asignados + las facturas aún "sin asignar" (para resolverlas).
        where.clientProfileId = undefined;
        where.OR = [{ clientProfileId: { in: allowed } }, { clientProfileId: null }];
      }
    } else if (membership.rol === 'cliente') {
      const links = await this.prisma.clientMember.findMany({
        where: { userId: user.userId },
        select: { clientProfileId: true },
      });
      const allowed = links.map((l) => l.clientProfileId);
      // Si pide un negocio concreto, respétalo (si está permitido); si no, todos los suyos.
      where.clientProfileId = query.clientProfileId
        ? allowed.includes(query.clientProfileId)
          ? query.clientProfileId
          : '__none__'
        : { in: allowed };
    }

    return this.prisma.forOrg(orgId).invoice.findMany({
      where,
      include: { clientProfile: { select: { id: true, razonSocial: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Resumen de gastos para analítica (valor para el cliente): total, ITBIS,
   * desglose por categoría 606, comparativo mensual y top proveedores.
   * Respeta el alcance por rol igual que list().
   */
  async resumen(
    orgId: string,
    user: AuthenticatedUser,
    membership: Membership,
    query: { clientProfileId?: string; meses?: number },
  ) {
    const where: Prisma.InvoiceWhereInput = {
      estado: { in: ['validada', 'incluida_en_606', 'reportada'] },
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
      const allowed = links.map((l) => l.clientProfileId);
      where.clientProfileId = query.clientProfileId
        ? allowed.includes(query.clientProfileId)
          ? query.clientProfileId
          : '__none__'
        : { in: allowed };
    } else if (query.clientProfileId) {
      where.clientProfileId = query.clientProfileId;
    }

    const invoices = await this.prisma.forOrg(orgId).invoice.findMany({
      where,
      select: {
        montoFacturado: true,
        itbis: true,
        categoria606: true,
        periodoFiscal: true,
        razonSocialProveedor: true,
      },
    });

    const num = (d: Prisma.Decimal | null) => (d ? d.toNumber() : 0);
    let totalGastado = 0;
    let totalItbis = 0;
    const catMap = new Map<string, { total: number; cantidad: number }>();
    const mesMap = new Map<string, { total: number; itbis: number; cantidad: number }>();
    const provMap = new Map<string, { total: number; cantidad: number }>();

    for (const inv of invoices) {
      const monto = num(inv.montoFacturado);
      const itbis = num(inv.itbis);
      totalGastado += monto;
      totalItbis += itbis;

      const cat = inv.categoria606 ?? 'sin';
      const c = catMap.get(cat) ?? { total: 0, cantidad: 0 };
      catMap.set(cat, { total: c.total + monto, cantidad: c.cantidad + 1 });

      if (inv.periodoFiscal) {
        const m = mesMap.get(inv.periodoFiscal) ?? { total: 0, itbis: 0, cantidad: 0 };
        mesMap.set(inv.periodoFiscal, {
          total: m.total + monto,
          itbis: m.itbis + itbis,
          cantidad: m.cantidad + 1,
        });
      }

      const prov = inv.razonSocialProveedor ?? 'Sin nombre';
      const p = provMap.get(prov) ?? { total: 0, cantidad: 0 };
      provMap.set(prov, { total: p.total + monto, cantidad: p.cantidad + 1 });
    }

    const nombreCat = new Map<string, string>(CATEGORIAS_606.map((c) => [c.codigo, c.nombre]));
    const porCategoria = [...catMap.entries()]
      .map(([codigo, v]) => ({
        codigo,
        nombre: codigo === 'sin' ? 'Sin categoría' : nombreCat.get(codigo) ?? codigo,
        ...v,
      }))
      .sort((a, b) => b.total - a.total);

    const meses = query.meses && query.meses > 0 ? query.meses : 6;
    const porMes = [...mesMap.entries()]
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .slice(-meses);

    const topProveedores = [...provMap.entries()]
      .map(([razonSocial, v]) => ({ razonSocial, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      totalGastado,
      totalItbis,
      cantidad: invoices.length,
      porCategoria,
      porMes,
      topProveedores,
    };
  }

  async get(orgId: string, invoiceId: string, user: AuthenticatedUser, membership: Membership) {
    const invoice = await this.prisma.forOrg(orgId).invoice.findUnique({
      where: { id: invoiceId },
      include: {
        clientProfile: { select: { id: true, razonSocial: true, rncOCedula: true } },
        images: { orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    this.assertInvoiceInScope(invoice, await this.invoiceScope(user, membership));
    const keys = [invoice.imagenUrl, ...invoice.images.map((i) => i.key)];
    const imageUrls = await Promise.all(keys.map((k) => this.storage.presignedGetUrl(k)));
    return {
      ...invoice,
      imageUrl: imageUrls[0], // compat
      imageUrls,
    };
  }

  /**
   * Edición campo a campo desde la cola de revisión. Si las validaciones
   * determinísticas pasan y los campos críticos están completos → `validada`.
   */
  async review(
    orgId: string,
    invoiceId: string,
    user: AuthenticatedUser,
    membership: Membership,
    dto: ReviewInvoiceDto,
  ) {
    const invoice = await this.prisma.forOrg(orgId).invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    this.assertInvoiceInScope(invoice, await this.invoiceScope(user, membership));
    if (invoice.estado === 'reportada' || invoice.estado === 'incluida_en_606') {
      throw new ConflictException('La factura ya fue incluida en un reporte; no puede editarse');
    }
    // La reasignación solo puede apuntar a un cliente de ESTA organización.
    if (dto.clientProfileId && membership.rol !== 'cliente') {
      const destino = await this.prisma.forOrg(orgId).clientProfile.findFirst({
        where: { id: dto.clientProfileId, organizationId: orgId },
        select: { id: true },
      });
      if (!destino) throw new BadRequestException('El cliente destino no existe en esta empresa');
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

    const criticosCompletos =
      merged.ncf != null &&
      merged.rncProveedor != null &&
      merged.fecha != null &&
      merged.montoFacturado != null &&
      merged.itbis != null;

    // Solo al VALIDAR se exigen las validaciones determinísticas; al solo GUARDAR
    // se persiste el avance del contador aunque falten datos (botones §5).
    let nuevoEstado: string = invoice.estado === 'validada' ? 'validada' : 'en_revision';
    if (dto.validar) {
      // Un cliente solo valida si el contador se lo habilitó (confianza, §perfil usuario).
      if (membership.rol === 'cliente' && !membership.puedeValidar) {
        throw new ForbiddenException(
          'No tienes permiso para validar facturas. Tu contador debe habilitarlo.',
        );
      }
      const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
      const errores = validateInvoiceFields(merged, {
        validarAritmetica: org.requiereValidacionAritmetica,
      });
      if (errores.length > 0) {
        throw new BadRequestException({ message: errores, error: 'Validación fiscal' });
      }
      if (!criticosCompletos) {
        throw new BadRequestException({
          message: ['Faltan campos críticos (NCF, RNC, fecha, monto e ITBIS) para validar'],
          error: 'Validación fiscal',
        });
      }
      nuevoEstado = 'validada';
    }

    // Recotejo NCF/RNC/padrón con los valores ya corregidos por el contador.
    const razonSocial = dto.razonSocialProveedor ?? invoice.razonSocialProveedor;
    // Preserva la verificación e-CF en vivo que hizo el worker (si la hubo).
    const priorEcf =
      (invoice.validacionDgii as { ecf?: { aceptado: boolean; estado: string | null } } | null)
        ?.ecf ?? undefined;
    const validacionDgii = await this.runFiscalValidation(
      merged.ncf,
      merged.rncProveedor,
      razonSocial,
      priorEcf,
    );

    const updated = await this.prisma.forOrg(orgId).invoice.update({
      where: { id: invoiceId },
      data: {
        // Reasignar empresa (solo contador/admin; el cliente no cambia la suya).
        clientProfileId:
          dto.clientProfileId && membership.rol !== 'cliente'
            ? dto.clientProfileId
            : invoice.clientProfileId,
        ncf: merged.ncf,
        rncProveedor: merged.rncProveedor,
        razonSocialProveedor: razonSocial,
        fecha: merged.fecha ? new Date(merged.fecha) : null,
        montoFacturado: merged.montoFacturado,
        itbis: merged.itbis,
        otrosImpuestos: merged.otrosImpuestos,
        propinaLegal: merged.propinaLegal,
        categoria606: dto.categoria606 ?? invoice.categoria606,
        tipoComprobante: dto.tipoComprobante ?? invoice.tipoComprobante,
        periodoFiscal: merged.fecha ? fechaToPeriodoFiscal(merged.fecha) : invoice.periodoFiscal,
        // Campos del Formato 606 (Fase 2)
        tipoIdProveedor: dto.tipoIdProveedor ?? invoice.tipoIdProveedor,
        ncfModificado: dto.ncfModificado ?? invoice.ncfModificado,
        fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : invoice.fechaPago,
        tipoBienServicio: dto.tipoBienServicio ?? invoice.tipoBienServicio,
        montoServicios: dto.montoServicios ?? invoice.montoServicios,
        montoBienes: dto.montoBienes ?? invoice.montoBienes,
        itbisRetenido: dto.itbisRetenido ?? invoice.itbisRetenido,
        itbisProporcionalidad: dto.itbisProporcionalidad ?? invoice.itbisProporcionalidad,
        itbisCosto: dto.itbisCosto ?? invoice.itbisCosto,
        itbisPercibido: dto.itbisPercibido ?? invoice.itbisPercibido,
        tipoRetencionIsr: dto.tipoRetencionIsr ?? invoice.tipoRetencionIsr,
        montoRetencionRenta: dto.montoRetencionRenta ?? invoice.montoRetencionRenta,
        isrPercibido: dto.isrPercibido ?? invoice.isrPercibido,
        impuestoSelectivo: dto.impuestoSelectivo ?? invoice.impuestoSelectivo,
        formaPago: dto.formaPago ?? invoice.formaPago,
        validacionDgii: validacionDgii as object,
        estado: nuevoEstado as typeof invoice.estado,
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

  /**
   * Cambia el estado de una factura manualmente (corregir errores; p.ej. una
   * factura validada por error se regresa a revisión). No se pueden mover las
   * que ya entraron a un reporte 606.
   */
  async changeStatus(
    orgId: string,
    invoiceId: string,
    estado: string,
    user: AuthenticatedUser,
    membership: Membership,
  ) {
    const invoice = await this.prisma.forOrg(orgId).invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    this.assertInvoiceInScope(invoice, await this.invoiceScope(user, membership));
    if (invoice.estado === 'reportada' || invoice.estado === 'incluida_en_606') {
      throw new ConflictException(
        'La factura ya fue incluida en un reporte; reabre el período para cambiarla',
      );
    }
    const updated = await this.prisma.forOrg(orgId).invoice.update({
      where: { id: invoiceId },
      data: { estado: estado as typeof invoice.estado },
    });
    await this.audit.log({
      organizationId: orgId,
      userId: user.userId,
      accion: 'invoice.change_status',
      entidad: 'invoice',
      entidadId: invoiceId,
      datos: { de: invoice.estado, a: estado },
    });
    return updated;
  }

  /** Coteja NCF/RNC contra estructura y padrón DGII (solo RNC de 9 dígitos). */
  private async runFiscalValidation(
    ncf: string | null,
    rnc: string | null,
    razonSocial: string | null,
    ecf?: { aceptado: boolean; estado: string | null } | null,
  ) {
    const normalized = rnc ? rnc.replace(/[-\s]/g, '') : null;
    const isRnc = !!normalized && /^\d{9}$/.test(normalized);
    const padronEntry = isRnc
      ? await this.prisma.rncPadron.findUnique({ where: { rnc: normalized! } })
      : null;
    const padronLoaded = isRnc
      ? padronEntry != null ||
        (await this.prisma.rncPadron.findFirst({ select: { rnc: true } })) != null
      : false;
    return buildFiscalValidation({
      ncf,
      rnc,
      razonSocial,
      padronEntry: padronEntry
        ? { rnc: padronEntry.rnc, razonSocial: padronEntry.razonSocial, estado: padronEntry.estado }
        : null,
      padronConsultado: padronLoaded,
      ecf,
    });
  }

  /** Re-encola el OCR (p.ej. tras un fallo). */
  async retry(orgId: string, invoiceId: string, user: AuthenticatedUser, membership: Membership) {
    const invoice = await this.prisma.forOrg(orgId).invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    this.assertInvoiceInScope(invoice, await this.invoiceScope(user, membership));
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
