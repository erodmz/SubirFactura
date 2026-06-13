import { BadRequestException, Injectable } from '@nestjs/common';
import {
  generateFormato606,
  validateTaxId,
  type Formato606Detail,
  type Formato606Result,
} from '@facturard/shared';
import type { Invoice } from '@facturard/shared/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Estados cuyas facturas entran al 606 de un período. */
const REPORTABLE = ['validada', 'incluida_en_606', 'reportada'] as const;

export interface Generate606Result extends Formato606Result {
  /** Facturas del período que no se pudieron incluir y por qué. */
  omitidas: { id: string; razon: string }[];
}

@Injectable()
export class DgiiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** AAAA-MM-DD (Date) → AAAAMMDD para el formato DGII. */
  private toFechaDgii(fecha: Date | null): string | null {
    if (!fecha) return null;
    return fecha.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private toDetail(invoice: Invoice): Formato606Detail | { error: string } {
    if (!invoice.rncProveedor) return { error: 'sin RNC del proveedor' };
    if (!invoice.ncf) return { error: 'sin NCF' };
    if (!invoice.fecha) return { error: 'sin fecha del comprobante' };
    if (!invoice.categoria606) return { error: 'sin categoría 606 confirmada' };

    const taxId = validateTaxId(invoice.rncProveedor);
    if (!taxId.valid) return { error: `RNC/cédula inválido: ${taxId.error}` };

    return {
      rncCedula: taxId.normalized!,
      tipoId: taxId.kind === 'cedula' ? '2' : '1',
      tipoBienesServicios: invoice.categoria606,
      ncf: invoice.ncf,
      fechaComprobante: this.toFechaDgii(invoice.fecha)!,
      // No distinguimos bienes/servicios en la captura: todo va a bienes por
      // defecto. El contador puede ajustarlo en la herramienta oficial si aplica.
      montoBienes: invoice.montoFacturado?.toNumber() ?? 0,
      itbisFacturado: invoice.itbis?.toNumber() ?? undefined,
      impuestoSelectivo: invoice.otrosImpuestos?.toNumber() ?? undefined,
      propinaLegal: invoice.propinaLegal?.toNumber() ?? undefined,
      // Forma de pago no se captura aún en la app; efectivo por defecto.
      formaPago: '1',
    };
  }

  private async buildResult(
    orgId: string,
    periodo: string,
    informanteRnc: string | null,
  ): Promise<Generate606Result> {
    if (!informanteRnc) {
      throw new BadRequestException(
        'La organización no tiene RNC configurado; requerido para generar el 606',
      );
    }

    const invoices = await this.prisma.forOrg(orgId).invoice.findMany({
      where: { periodoFiscal: periodo, estado: { in: [...REPORTABLE] } },
      orderBy: { fecha: 'asc' },
    });

    const detalles: Formato606Detail[] = [];
    const omitidas: { id: string; razon: string }[] = [];
    for (const inv of invoices) {
      const mapped = this.toDetail(inv);
      if ('error' in mapped) {
        omitidas.push({ id: inv.id, razon: mapped.error });
      } else {
        detalles.push(mapped);
      }
    }

    const file = generateFormato606({ rncInformante: informanteRnc, periodo, detalles });
    return { ...file, omitidas };
  }

  /** Genera el 606 sin modificar estados (vista previa / descarga). */
  async generate606(orgId: string, periodo: string): Promise<Generate606Result> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    return this.buildResult(orgId, periodo, org.rnc);
  }

  /**
   * Cierre de período: genera el 606 y marca las facturas incluidas como
   * `incluida_en_606`. Idempotente sobre las ya incluidas.
   */
  async cerrarPeriodo606(orgId: string, periodo: string, actorUserId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const result = await this.buildResult(orgId, periodo, org.rnc);

    const updated = await this.prisma.forOrg(orgId).invoice.updateMany({
      where: { periodoFiscal: periodo, estado: 'validada' },
      data: { estado: 'incluida_en_606' },
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'dgii.cerrar_periodo_606',
      entidad: 'periodo_fiscal',
      entidadId: periodo,
      datos: { incluidas: updated.count, omitidas: result.omitidas.length },
    });

    return {
      periodo,
      cantidadRegistros: result.cantidadRegistros,
      incluidas: updated.count,
      omitidas: result.omitidas,
      nombreArchivo: result.nombreArchivo,
    };
  }
}
