import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Membership } from '@facturard/shared/db';
import { InvoicesService } from './invoices.service';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  BulkFormaPagoDto,
  ChangeStatusDto,
  CreateManualInvoiceDto,
  ListInvoicesQueryDto,
  ReviewInvoiceDto,
  UploadInvoiceDto,
} from './dto/invoices.dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // la app comprime a ~1–2 MB (§5.1)

@Controller('organizations/:orgId/invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @OrgRoles('org_admin', 'contador', 'cliente')
  // Acepta 'file' (1 foto) o 'files' (varias páginas) en multipart/form-data
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_SIZE, files: 10 } }))
  upload(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: UploadInvoiceDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new Error('Falta el archivo: enviar multipart/form-data con el campo "file" o "files"');
    }
    return this.invoices.upload(orgId, user, req.membership, dto.clientProfileId, files);
  }

  /** Registro manual de un gasto sin foto (¿hay foto? mejor súbela: la IA la lee). */
  @Post('manual')
  @OrgRoles('org_admin', 'contador', 'cliente')
  createManual(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: CreateManualInvoiceDto,
  ) {
    return this.invoices.createManual(orgId, user, req.membership, dto);
  }

  // Ruta literal ANTES de las rutas con :invoiceId para que Nest no la capture
  // como un id. Destraba el cierre del 606 asignando la forma de pago en lote.
  @Patch('forma-pago-lote')
  @OrgRoles('org_admin', 'contador')
  bulkFormaPago(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: BulkFormaPagoDto,
  ) {
    return this.invoices.bulkFormaPago(
      orgId,
      dto.clientProfileId,
      dto.periodoFiscal,
      dto.formaPago,
      user,
      req.membership,
    );
  }

  @Get()
  @OrgRoles('org_admin', 'contador', 'cliente')
  list(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoices.list(orgId, user, req.membership, query);
  }

  /** Resumen de gastos (analítica para el cliente y el contador). */
  @Get('resumen')
  @OrgRoles('org_admin', 'contador', 'cliente')
  resumen(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Query('clientProfileId') clientProfileId?: string,
    @Query('meses') meses?: string,
  ) {
    return this.invoices.resumen(orgId, user, req.membership, {
      clientProfileId,
      meses: meses ? Number(meses) : undefined,
    });
  }

  /** KPIs, récords y actividad para el dashboard del despacho. */
  @Get('dashboard')
  @OrgRoles('org_admin', 'contador')
  dashboard(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Query('periodo') periodo?: string,
    @Query('clientProfileId') clientProfileId?: string,
  ) {
    return this.invoices.dashboard(orgId, user, req.membership, { periodo, clientProfileId });
  }

  @Get(':invoiceId')
  @OrgRoles('org_admin', 'contador', 'cliente')
  get(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
  ) {
    return this.invoices.get(orgId, invoiceId, user, req.membership);
  }

  /**
   * Sirve la imagen de la factura por el propio API (proxy hacia MinIO). El
   * móvil usa esto en vez de la URL firmada porque el host de MinIO no es
   * alcanzable desde el teléfono; el host del API sí. `i` = índice de página.
   */
  @Get(':invoiceId/image')
  @OrgRoles('org_admin', 'contador', 'cliente')
  async image(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Query('i') i?: string,
  ): Promise<StreamableFile> {
    const index = Math.max(0, Number(i) || 0);
    const { body, contentType, contentLength } = await this.invoices.imageBytes(
      orgId,
      invoiceId,
      index,
      user,
      req.membership,
    );
    return new StreamableFile(body, {
      type: contentType,
      disposition: 'inline',
      length: contentLength,
    });
  }

  @Patch(':invoiceId/review')
  @OrgRoles('org_admin', 'contador', 'cliente')
  review(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: ReviewInvoiceDto,
  ) {
    return this.invoices.review(orgId, invoiceId, user, req.membership, dto);
  }

  @Patch(':invoiceId/estado')
  @OrgRoles('org_admin', 'contador')
  changeStatus(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: ChangeStatusDto,
  ) {
    return this.invoices.changeStatus(orgId, invoiceId, dto.estado, user, req.membership);
  }

  // El cliente también puede reintentar SUS facturas atascadas (el service ya
  // limita el alcance con assertInvoiceInScope); reintentar el OCR es inocuo.
  @Post(':invoiceId/retry')
  @OrgRoles('org_admin', 'contador', 'cliente')
  retry(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
  ) {
    return this.invoices.retry(orgId, invoiceId, user, req.membership);
  }

  /** Historial de trazabilidad de la factura (quién hizo qué y cuándo). */
  @Get(':invoiceId/historial')
  @OrgRoles('org_admin', 'contador', 'cliente')
  historial(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
  ) {
    return this.invoices.historial(orgId, invoiceId, user, req.membership);
  }

  /** Eliminar factura — solo administrador de la organización. */
  @Delete(':invoiceId')
  @OrgRoles('org_admin')
  remove(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.delete(orgId, invoiceId, user);
  }
}
