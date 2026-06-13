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
} from '@nestjs/common';
import type { Membership } from '@facturard/shared/db';
import { ClientsService } from './clients.service';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateAssignmentDto, CreateClientDto, UpdateClientDto } from './dto/clients.dto';

@Controller('organizations/:orgId/clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  @OrgRoles('org_admin', 'contador')
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateClientDto,
  ) {
    return this.clients.create(orgId, user.userId, dto);
  }

  @Get()
  @OrgRoles('org_admin', 'contador', 'cliente')
  list(@Param('orgId') orgId: string, @Req() req: { membership: Membership }) {
    return this.clients.list(orgId, req.membership);
  }

  @Get(':clientId')
  @OrgRoles('org_admin', 'contador')
  get(@Param('orgId') orgId: string, @Param('clientId') clientId: string) {
    return this.clients.get(orgId, clientId);
  }

  @Patch(':clientId')
  @OrgRoles('org_admin', 'contador')
  update(
    @Param('orgId') orgId: string,
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(orgId, clientId, user.userId, dto);
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
}
