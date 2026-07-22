import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Membership } from '@facturard/shared/db';
import { ClientsService } from './clients.service';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  AddClientMemberDto,
  CreateAssignmentDto,
  CreateClientDto,
  UpdateClientDto,
} from './dto/clients.dto';

@Controller('organizations/:orgId/clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  @OrgRoles('org_admin', 'contador')
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: CreateClientDto,
  ) {
    return this.clients.create(orgId, user.userId, dto, req.membership);
  }

  @Get()
  @OrgRoles('org_admin', 'contador', 'cliente')
  list(@Param('orgId') orgId: string, @Req() req: { membership: Membership }) {
    return this.clients.list(orgId, req.membership);
  }

  @Get(':clientId')
  @OrgRoles('org_admin', 'contador')
  get(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @Req() req: { membership: Membership },
  ) {
    return this.clients.get(orgId, clientId, req.membership);
  }

  @Post(':clientId/logo')
  @OrgRoles('org_admin', 'contador')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadLogo(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new Error('Falta el archivo del logo (campo "file")');
    return this.clients.uploadLogo(orgId, clientId, user.userId, req.membership, file);
  }

  /**
   * @Public por la misma razón que el logo de la empresa: <img src> no puede
   * mandar Authorization, el logo es la marca del negocio (no un dato fiscal)
   * y los ids son UUID no adivinables.
   */
  @Public()
  @Get(':clientId/logo')
  async logo(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
  ): Promise<StreamableFile> {
    const { body, contentType, contentLength } = await this.clients.logoBytes(orgId, clientId);
    return new StreamableFile(body, {
      type: contentType,
      disposition: 'inline',
      length: contentLength,
    });
  }

  @Patch(':clientId')
  @OrgRoles('org_admin', 'contador')
  update(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(orgId, clientId, user.userId, dto, req.membership);
  }

  @Delete(':clientId')
  @HttpCode(204)
  @OrgRoles('org_admin')
  remove(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.remove(orgId, clientId, user.userId);
  }

  @Post(':clientId/assignments')
  @OrgRoles('org_admin')
  assign(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.clients.assign(orgId, clientId, dto.contadorMembershipId, user.userId);
  }

  @Delete(':clientId/assignments/:contadorMembershipId')
  @HttpCode(204)
  @OrgRoles('org_admin')
  unassign(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @Param('contadorMembershipId') contadorMembershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.unassign(orgId, clientId, contadorMembershipId, user.userId);
  }

  // ── Usuarios que suben facturas del cliente ────────────────────────────────

  @Get(':clientId/members')
  @OrgRoles('org_admin', 'contador')
  listMembers(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @Req() req: { membership: Membership },
  ) {
    return this.clients.listMembers(orgId, clientId, req.membership);
  }

  @Post(':clientId/members')
  @OrgRoles('org_admin', 'contador')
  addMember(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
    @Body() dto: AddClientMemberDto,
  ) {
    return this.clients.addMember(orgId, clientId, dto.userId, user.userId, req.membership);
  }

  @Delete(':clientId/members/:userId')
  @HttpCode(204)
  @OrgRoles('org_admin', 'contador')
  removeMember(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { membership: Membership },
  ) {
    return this.clients.removeMember(orgId, clientId, userId, user.userId, req.membership);
  }
}
