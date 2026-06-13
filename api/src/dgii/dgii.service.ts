import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  CATEGORIAS_606,
  generateFormato606,
  validateTaxId,
  type Formato606Detail,
  type Formato606Result,
} from '@facturard/shared';
import type { Invoice } from '@facturard/shared/db';
import type { PadronValidation } from '@facturard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PadronService } from './padron.service';

const CATEGORIA_NOMBRE = new Map<string, string>(
  CATEGORIAS_606.map((c) => [c.codigo, c.nombre]),
);

/** Estados cuyas facturas entran al 606 de un período. */
const REPORTABLE = ['validada', 'incluida_en_606', 'reportada'] as const;

export interface Generate606Result extends Formato606Result {
  /** Facturas del período que no se pudieron incluir y por qué. */
  omitidas: { id: string; razon: string }[];
  /** Avisos del padrón RNC (no bloquean): RNC ausente, inactivo o razón social que no cuadra. */
  advertencias: PadronValidation[];
}

@Injectable()
export class DgiiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly padron: PadronService,
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

  /** Reúne los detalles mapeados del período (compartido por TXT y Excel). */
  private async collect(orgId: string, periodo: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (!org.rnc) {
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
    const validables: { rnc: string; razonSocial: string | null }[] = [];
    for (const inv of invoices) {
      const mapped = this.toDetail(inv);
      if ('error' in mapped) {
        omitidas.push({ id: inv.id, razon: mapped.error });
      } else {
        detalles.push(mapped);
        validables.push({ rnc: mapped.rncCedula, razonSocial: inv.razonSocialProveedor });
      }
    }
    return { rnc: org.rnc, detalles, omitidas, validables };
  }

  /** Avisos del padrón RNC; vacío si el padrón aún no se ha importado. */
  private async advertenciasPadron(
    validables: { rnc: string; razonSocial: string | null }[],
  ): Promise<PadronValidation[]> {
    const { count } = await this.padron.status();
    if (count === 0) return []; // validación inactiva sin padrón cargado
    return this.padron.findProblems(validables);
  }

  /** Genera el 606 sin modificar estados (vista previa / descarga). */
  async generate606(orgId: string, periodo: string): Promise<Generate606Result> {
    const { rnc, detalles, omitidas, validables } = await this.collect(orgId, periodo);
    const file = generateFormato606({ rncInformante: rnc, periodo, detalles });
    return { ...file, omitidas, advertencias: await this.advertenciasPadron(validables) };
  }

  /** Exporta el 606 a Excel (.xlsx) — para contadores que ajustan a mano (§6). */
  async generate606Excel(orgId: string, periodo: string): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const { rnc, detalles } = await this.collect(orgId, periodo);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FacturaRD';
    const ws = wb.addWorksheet(`606_${periodo}`);
    ws.columns = [
      { header: 'RNC/Cédula', key: 'rnc', width: 14 },
      { header: 'Tipo Id', key: 'tipoId', width: 8 },
      { header: 'Tipo Bienes/Servicios', key: 'tipo', width: 32 },
      { header: 'NCF', key: 'ncf', width: 16 },
      { header: 'NCF Modificado', key: 'ncfMod', width: 16 },
      { header: 'Fecha Comprobante', key: 'fecha', width: 16 },
      { header: 'Fecha Pago', key: 'fechaPago', width: 14 },
      { header: 'Monto Servicios', key: 'serv', width: 16 },
      { header: 'Monto Bienes', key: 'bienes', width: 16 },
      { header: 'Total Facturado', key: 'total', width: 16 },
      { header: 'ITBIS Facturado', key: 'itbis', width: 16 },
      { header: 'ITBIS Retenido', key: 'itbisRet', width: 16 },
      { header: 'Impuesto Selectivo', key: 'isc', width: 16 },
      { header: 'Propina Legal', key: 'propina', width: 14 },
      { header: 'Forma de Pago', key: 'formaPago', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const d of detalles) {
      const serv = d.montoServicios ?? 0;
      const bienes = d.montoBienes ?? 0;
      ws.addRow({
        rnc: d.rncCedula,
        tipoId: d.tipoId,
        tipo: `${d.tipoBienesServicios} — ${CATEGORIA_NOMBRE.get(d.tipoBienesServicios) ?? ''}`,
        ncf: d.ncf,
        ncfMod: d.ncfModificado ?? '',
        fecha: d.fechaComprobante,
        fechaPago: d.fechaPago ?? '',
        serv,
        bienes,
        total: serv + bienes,
        itbis: d.itbisFacturado ?? 0,
        itbisRet: d.itbisRetenido ?? 0,
        isc: d.impuestoSelectivo ?? 0,
        propina: d.propinaLegal ?? 0,
        formaPago: d.formaPago ?? '',
      });
    }
    ['serv', 'bienes', 'total', 'itbis', 'itbisRet', 'isc', 'propina'].forEach((k) => {
      ws.getColumn(k).numFmt = '#,##0.00';
    });

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, nombreArchivo: `DGII_F_606_${rnc}_${periodo}.xlsx` };
  }

  /**
   * Cierre de período: genera el 606 y marca las facturas incluidas como
   * `incluida_en_606`. Idempotente sobre las ya incluidas.
   */
  async cerrarPeriodo606(orgId: string, periodo: string, actorUserId: string) {
    const result = await this.generate606(orgId, periodo);

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
