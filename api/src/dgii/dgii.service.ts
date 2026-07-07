import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  /** Cliente (contribuyente) informante del 606. */
  cliente: { id: string; razonSocial: string; rnc: string };
  /** Facturas del período que no se pudieron incluir y por qué. */
  omitidas: { id: string; razon: string }[];
  /** Avisos del padrón RNC (no bloquean): RNC ausente, inactivo o razón social que no cuadra. */
  advertencias: PadronValidation[];
}

export interface CierreEstado {
  periodo: string;
  fechaLimite: string; // AAAA-MM-DD (día 15 del mes siguiente)
  diasRestantes: number;
  vencido: boolean;
  semaforo: 'verde' | 'amarillo' | 'rojo' | 'vacio';
  listoParaCerrar: boolean;
  totales: {
    total: number;
    enProceso: number;
    enRevision: number;
    reportables: number;
    rechazadas: number;
    duplicadas: number;
    conAlertasDgii: number;
    sinDatos606: number;
    /** Facturas del período sin asignar a ningún cliente (no entran a ningún 606). */
    sinAsignar: number;
  };
  /** Qué impide cerrar (bloqueos duros). */
  bloqueos: string[];
  /** Avisos que no bloquean pero conviene revisar. */
  avisos: string[];
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

    const n = (d: { toNumber(): number } | null) => (d == null ? undefined : d.toNumber());

    // Bienes/servicios: usar el desglose si el contador lo capturó; si no,
    // enrutar el subtotal a una columna según el tipo (por defecto, bienes).
    let montoBienes = n(invoice.montoBienes);
    let montoServicios = n(invoice.montoServicios);
    if (montoBienes === undefined && montoServicios === undefined) {
      const sub = n(invoice.montoFacturado) ?? 0;
      if (invoice.tipoBienServicio === 'servicios') {
        montoServicios = sub;
        montoBienes = 0;
      } else {
        montoBienes = sub;
        montoServicios = 0;
      }
    }

    return {
      rncCedula: taxId.normalized!,
      tipoId: (invoice.tipoIdProveedor as '1' | '2' | null) ?? (taxId.kind === 'cedula' ? '2' : '1'),
      tipoBienesServicios: invoice.categoria606,
      ncf: invoice.ncf,
      ncfModificado: invoice.ncfModificado,
      fechaComprobante: this.toFechaDgii(invoice.fecha)!,
      fechaPago: this.toFechaDgii(invoice.fechaPago),
      montoServicios,
      montoBienes,
      itbisFacturado: n(invoice.itbis),
      itbisRetenido: n(invoice.itbisRetenido),
      itbisProporcionalidad: n(invoice.itbisProporcionalidad),
      itbisCosto: n(invoice.itbisCosto),
      itbisPercibido: n(invoice.itbisPercibido),
      tipoRetencionISR: invoice.tipoRetencionIsr,
      montoRetencionRenta: n(invoice.montoRetencionRenta),
      isrPercibido: n(invoice.isrPercibido),
      impuestoSelectivo: n(invoice.impuestoSelectivo),
      otrosImpuestos: n(invoice.otrosImpuestos),
      propinaLegal: n(invoice.propinaLegal),
      formaPago: invoice.formaPago ?? '1',
    };
  }

  /**
   * El 606 lo presenta CADA contribuyente (cliente del despacho) con su propio
   * RNC — nunca la organización, que solo agrupa. Resuelve y valida el cliente
   * informante de un reporte.
   */
  private async clienteInformante(orgId: string, clientId: string) {
    const cliente = await this.prisma.forOrg(orgId).clientProfile.findFirst({
      where: { id: clientId, organizationId: orgId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const taxId = validateTaxId(cliente.rncOCedula);
    if (!taxId.valid) {
      throw new BadRequestException(
        `El RNC/cédula del cliente "${cliente.razonSocial}" es inválido (${taxId.error}); corrígelo antes de generar el 606`,
      );
    }
    return { id: cliente.id, razonSocial: cliente.razonSocial, rnc: taxId.normalized! };
  }

  /** Reúne los detalles mapeados del período de UN cliente (compartido por TXT y Excel). */
  private async collect(orgId: string, periodo: string, clientId: string) {
    const cliente = await this.clienteInformante(orgId, clientId);

    const invoices = await this.prisma.forOrg(orgId).invoice.findMany({
      where: {
        periodoFiscal: periodo,
        estado: { in: [...REPORTABLE] },
        clientProfileId: clientId,
      },
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
    return { cliente, detalles, omitidas, validables };
  }

  /** Avisos del padrón RNC; vacío si el padrón aún no se ha importado. */
  private async advertenciasPadron(
    validables: { rnc: string; razonSocial: string | null }[],
  ): Promise<PadronValidation[]> {
    const { count } = await this.padron.status();
    if (count === 0) return []; // validación inactiva sin padrón cargado
    return this.padron.findProblems(validables);
  }

  /**
   * Semáforo de cierre del 606: qué falta para reportar el período y cuánto
   * tiempo queda (la DGII recibe el 606 hasta el día 15 del mes siguiente).
   * Con `clientId` evalúa el cierre de ESE contribuyente; sin él, da la vista
   * global del despacho (todas las facturas del período).
   */
  async cierreEstado(orgId: string, periodo: string, clientId?: string): Promise<CierreEstado> {
    if (clientId) await this.clienteInformante(orgId, clientId); // valida cliente + RNC
    const invoices = await this.prisma.forOrg(orgId).invoice.findMany({
      where: { periodoFiscal: periodo, ...(clientId ? { clientProfileId: clientId } : {}) },
    });
    // Facturas del período aún sin cliente: no entran a NINGÚN 606, así que se
    // vigilan siempre a nivel de despacho (aunque se esté mirando un cliente).
    const sinAsignar = await this.prisma.forOrg(orgId).invoice.count({
      where: { periodoFiscal: periodo, clientProfileId: null },
    });

    const t = {
      total: invoices.length,
      enProceso: 0,
      enRevision: 0,
      reportables: 0,
      rechazadas: 0,
      duplicadas: 0,
      conAlertasDgii: 0,
      sinDatos606: 0,
      sinAsignar,
    };
    for (const inv of invoices) {
      if (inv.estado === 'subida' || inv.estado === 'procesando') t.enProceso++;
      else if (inv.estado === 'en_revision' || inv.estado === 'extraida') t.enRevision++;
      else if (inv.estado === 'rechazada') t.rechazadas++;
      else if (inv.estado === 'duplicada') t.duplicadas++;
      else if ((REPORTABLE as readonly string[]).includes(inv.estado)) {
        t.reportables++;
        if ('error' in this.toDetail(inv)) t.sinDatos606++;
        const val = inv.validacionDgii as { ok?: boolean } | null;
        if (val && val.ok === false) t.conAlertasDgii++;
      }
    }

    const fechaLimite = this.fechaLimite606(periodo);
    const hoy = new Date();
    const diasRestantes = Math.ceil(
      (Date.UTC(fechaLimite.getUTCFullYear(), fechaLimite.getUTCMonth(), fechaLimite.getUTCDate()) -
        Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) /
        86_400_000,
    );

    const bloqueos: string[] = [];
    if (t.enProceso > 0) bloqueos.push(`${t.enProceso} factura(s) aún procesándose`);
    if (t.enRevision > 0) bloqueos.push(`${t.enRevision} factura(s) en revisión`);
    if (t.sinDatos606 > 0) bloqueos.push(`${t.sinDatos606} validada(s) sin datos completos para el 606`);

    const avisos: string[] = [];
    if (t.conAlertasDgii > 0) avisos.push(`${t.conAlertasDgii} con alertas de la DGII (RNC/padrón)`);
    if (sinAsignar > 0) {
      // Bloqueo en la vista global (hay que repartirlas antes de cerrar);
      // aviso al mirar un cliente (podrían pertenecerle y quedarse fuera).
      const msg = `${sinAsignar} factura(s) del período sin asignar a ningún cliente`;
      if (clientId) avisos.push(`${msg} — revísalas: podrían pertenecer a este contribuyente`);
      else bloqueos.push(msg);
    }

    const listoParaCerrar = bloqueos.length === 0 && t.reportables > 0;
    let semaforo: CierreEstado['semaforo'];
    if (t.total === 0) semaforo = 'vacio';
    else if (bloqueos.length > 0) semaforo = 'rojo';
    else if (avisos.length > 0) semaforo = 'amarillo';
    else semaforo = 'verde';

    return {
      periodo,
      fechaLimite: fechaLimite.toISOString().slice(0, 10),
      diasRestantes,
      vencido: diasRestantes < 0,
      semaforo,
      listoParaCerrar,
      totales: t,
      bloqueos,
      avisos,
    };
  }

  /** Día 15 del mes siguiente al período AAAAMM (fecha límite del 606 ante la DGII). */
  private fechaLimite606(periodo: string): Date {
    const year = Number(periodo.slice(0, 4));
    const month = Number(periodo.slice(4, 6)); // 1-12
    const ny = month === 12 ? year + 1 : year;
    const nm = month === 12 ? 1 : month + 1; // 1-12
    return new Date(Date.UTC(ny, nm - 1, 15));
  }

  /** Genera el 606 de un cliente sin modificar estados (vista previa / descarga). */
  async generate606(orgId: string, periodo: string, clientId: string): Promise<Generate606Result> {
    const { cliente, detalles, omitidas, validables } = await this.collect(orgId, periodo, clientId);
    const file = generateFormato606({ rncInformante: cliente.rnc, periodo, detalles });
    return { ...file, cliente, omitidas, advertencias: await this.advertenciasPadron(validables) };
  }

  /** Exporta el 606 de un cliente a Excel (.xlsx) — para contadores que ajustan a mano (§6). */
  async generate606Excel(
    orgId: string,
    periodo: string,
    clientId: string,
  ): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const { cliente, detalles } = await this.collect(orgId, periodo, clientId);
    const rnc = cliente.rnc;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SubirFactura';
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
    return { buffer, nombreArchivo: `${periodo}_${rnc}_F_606.xlsx` };
  }

  /**
   * Cierre de período de UN cliente: genera su 606 y marca sus facturas
   * incluidas como `incluida_en_606`. Idempotente sobre las ya incluidas.
   */
  async cerrarPeriodo606(orgId: string, periodo: string, clientId: string, actorUserId: string) {
    const result = await this.generate606(orgId, periodo, clientId);

    const updated = await this.prisma.forOrg(orgId).invoice.updateMany({
      where: { periodoFiscal: periodo, estado: 'validada', clientProfileId: clientId },
      data: { estado: 'incluida_en_606' },
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actorUserId,
      accion: 'dgii.cerrar_periodo_606',
      entidad: 'periodo_fiscal',
      entidadId: periodo,
      datos: {
        clientProfileId: clientId,
        cliente: result.cliente.razonSocial,
        rncInformante: result.cliente.rnc,
        incluidas: updated.count,
        omitidas: result.omitidas.length,
      },
    });

    return {
      periodo,
      cliente: result.cliente,
      cantidadRegistros: result.cantidadRegistros,
      incluidas: updated.count,
      omitidas: result.omitidas,
      nombreArchivo: result.nombreArchivo,
    };
  }
}
