import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { MembersService } from './members.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  CreateOrganizationDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './dto/organizations.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly members: MembersService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(user.userId, dto);
  }

  @Get(':orgId')
  @OrgRoles('org_admin', 'contador', 'cliente')
  get(@Param('orgId') orgId: string) {
    return this.organizations.get(orgId);
  }

  @Patch(':orgId')
  @OrgRoles('org_admin')
  update(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(orgId, user.userId, dto);
  }

  /** Uso vs límites del plan, con avisos al 80% (§7). */
  @Get(':orgId/usage')
  @OrgRoles('org_admin', 'contador')
  usage(@Param('orgId') orgId: string) {
    return this.planLimits.getUsage(orgId);
  }

  @Get(':orgId/members')
  @OrgRoles('org_admin', 'contador')
  listMembers(@Param('orgId') orgId: string) {
    return this.members.list(orgId);
  }

  @Patch(':orgId/members/:membershipId')
  @OrgRoles('org_admin')
  updateMemberRole(
    @Param('orgId') orgId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.members.updateRole(orgId, membershipId, dto.rol, user.userId);
  }

  @Delete(':orgId/members/:membershipId')
  @HttpCode(204)
  @OrgRoles('org_admin')
  removeMember(
    @Param('orgId') orgId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.members.remove(orgId, membershipId, user.userId);
  }
}
