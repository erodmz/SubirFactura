import { BadRequestException, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DgiiService } from './dgii.service';
import { PadronService } from './padron.service';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

const PERIODO_REGEX = /^\d{6}$/;

@Controller('organizations/:orgId/dgii')
export class DgiiController {
  constructor(
    private readonly dgii: DgiiService,
    private readonly padron: PadronService,
  ) {}

  /** Estado del padrón RNC: cuántos registros y cuándo se actualizó. */
  @Get('padron/status')
  @OrgRoles('org_admin', 'contador')
  padronStatus() {
    return this.padron.status();
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
}
