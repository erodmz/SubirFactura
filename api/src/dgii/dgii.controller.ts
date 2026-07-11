import { BadRequestException, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Membership } from '@facturard/shared/db';
import { DgiiService } from './dgii.service';
import { PadronService } from './padron.service';
import { ClientsService } from '../clients/clients.service';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

const PERIODO_REGEX = /^\d{6}$/;

@Controller('organizations/:orgId/dgii')
export class DgiiController {
  constructor(
    private readonly dgii: DgiiService,
    private readonly padron: PadronService,
    private readonly clients: ClientsService,
  ) {}

  /** Estado del padrón RNC: cuántos registros y cuándo se actualizó. */
  @Get('padron/status')
  @OrgRoles('org_admin', 'contador')
  padronStatus() {
    return this.padron.status();
  }

  /**
   * Lookup de un RNC/cédula para autocompletar la razón social al crear un
   * cliente (fuente: DGII en vivo, respaldo padrón). Throttle estricto: es una
   * consulta externa que se dispara al teclear.
   */
  @Get('rnc/:rnc')
  @OrgRoles('org_admin', 'contador')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  lookupRnc(@Param('rnc') rnc: string) {
    return this.padron.lookupRnc(rnc);
  }

  private assertPeriodo(periodo?: string): string {
    if (!periodo || !PERIODO_REGEX.test(periodo)) {
      throw new BadRequestException('Indica el período en formato AAAAMM (ej. 202605)');
    }
    return periodo;
  }

  /** El 606 lo presenta cada contribuyente: todo lo que genera archivo exige el cliente. */
  private assertCliente(clientId?: string): string {
    if (!clientId) {
      throw new BadRequestException('Selecciona el cliente (contribuyente) del reporte 606');
    }
    return clientId;
  }

  /**
   * Semáforo de cierre del período: qué falta y cuánto tiempo queda.
   * Con `clientId` evalúa ese contribuyente; sin él, la vista global del despacho.
   */
  @Get('606/cierre')
  @OrgRoles('org_admin', 'contador')
  async cierre(
    @Param('orgId') orgId: string,
    @Query('periodo') periodo?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.dgii.cierreEstado(orgId, this.assertPeriodo(periodo), clientId || undefined);
  }

  /** Vista previa: resumen + facturas omitidas, sin modificar estados. */
  @Get('606/preview')
  @OrgRoles('org_admin', 'contador')
  async preview(
    @Param('orgId') orgId: string,
    @Query('periodo') periodo?: string,
    @Query('clientId') clientId?: string,
  ) {
    const result = await this.dgii.generate606(
      orgId,
      this.assertPeriodo(periodo),
      this.assertCliente(clientId),
    );
    return {
      cliente: result.cliente,
      nombreArchivo: result.nombreArchivo,
      cantidadRegistros: result.cantidadRegistros,
      omitidas: result.omitidas,
      advertencias: result.advertencias,
    };
  }

  /** Descarga el archivo .TXT del 606 de un cliente (sin modificar estados). */
  @Get('606')
  @OrgRoles('org_admin', 'contador')
  async download(
    @Param('orgId') orgId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('periodo') periodo?: string,
    @Query('clientId') clientId?: string,
  ) {
    const result = await this.dgii.generate606(
      orgId,
      this.assertPeriodo(periodo),
      this.assertCliente(clientId),
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.nombreArchivo}"`);
    return result.contenido;
  }

  /** Descarga el 606 de un cliente en Excel (.xlsx). */
  @Get('606/excel')
  @OrgRoles('org_admin', 'contador')
  async excel(
    @Param('orgId') orgId: string,
    @Res() res: Response,
    @Query('periodo') periodo?: string,
    @Query('clientId') clientId?: string,
  ) {
    const { buffer, nombreArchivo } = await this.dgii.generate606Excel(
      orgId,
      this.assertPeriodo(periodo),
      this.assertCliente(clientId),
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  }

  /** Cierre de período de un cliente: marca sus facturas como incluidas en el 606. */
  @Post('606/cerrar')
  @OrgRoles('org_admin', 'contador')
  async cerrar(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodo') periodo?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.dgii.cerrarPeriodo606(
      orgId,
      this.assertPeriodo(periodo),
      this.assertCliente(clientId),
      user.userId,
    );
  }

  /**
   * Panel de cierre del despacho: el 606 del período para cada cliente en
   * alcance (el contador solo ve sus asignados; el admin, todos).
   */
  @Get('606/panel')
  @OrgRoles('org_admin', 'contador')
  async panel(
    @Param('orgId') orgId: string,
    @Req() req: { membership: Membership },
    @Query('periodo') periodo?: string,
  ) {
    const clientes = await this.clients.list(orgId, req.membership);
    return this.dgii.panelCierre(
      orgId,
      this.assertPeriodo(periodo),
      clientes.map((c) => ({ id: c.id, razonSocial: c.razonSocial, rncOCedula: c.rncOCedula })),
    );
  }

  /** Historial de cierres del 606 (quién cerró qué y cuándo). */
  @Get('606/historial')
  @OrgRoles('org_admin', 'contador')
  async historial(@Param('orgId') orgId: string, @Req() req: { membership: Membership }) {
    // El contador solo ve el historial de sus clientes asignados; el admin, todo.
    const clientIds =
      req.membership.rol === 'contador'
        ? (await this.clients.list(orgId, req.membership)).map((c) => c.id)
        : undefined;
    return this.dgii.historialCierres(orgId, clientIds);
  }

  /** Descarga en un ZIP el 606 (.txt) de todos los clientes del período. */
  @Get('606/zip')
  @OrgRoles('org_admin', 'contador')
  async zip(
    @Param('orgId') orgId: string,
    @Req() req: { membership: Membership },
    @Res() res: Response,
    @Query('periodo') periodo?: string,
  ) {
    const clientes = await this.clients.list(orgId, req.membership);
    const { buffer, nombreArchivo } = await this.dgii.generar606Zip(
      orgId,
      this.assertPeriodo(periodo),
      clientes.map((c) => c.id),
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  }
}
