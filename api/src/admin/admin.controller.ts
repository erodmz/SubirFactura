import { Body, Controller, Delete, Get, Param, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AdminCreateOrganizationDto, RejectOrganizationDto, SetSubscriptionDto } from './dto/admin.dto';

@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('organizations')
  listOrganizations() {
    return this.admin.listOrganizations();
  }

  @Post('organizations')
  createOrganization(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdminCreateOrganizationDto) {
    return this.admin.createOrganization(user.userId, dto);
  }

  /** Documento KYC subido por la empresa (se abre desde el panel para revisarlo). */
  @Get('organizations/:orgId/verificacion')
  async verificationDoc(@Param('orgId') orgId: string): Promise<StreamableFile> {
    const { body, contentType, contentLength } = await this.admin.verificationDocBytes(orgId);
    return new StreamableFile(body, {
      type: contentType,
      disposition: 'inline',
      length: contentLength,
    });
  }

  @Post('organizations/:orgId/aprobar')
  approveOrganization(@Param('orgId') orgId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.admin.approveOrganization(orgId, user.userId);
  }

  @Post('organizations/:orgId/rechazar')
  rejectOrganization(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectOrganizationDto,
  ) {
    return this.admin.rejectOrganization(orgId, user.userId, dto.motivo);
  }

  @Delete('organizations/:orgId')
  softDeleteOrganization(@Param('orgId') orgId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.admin.softDeleteOrganization(orgId, user.userId);
  }

  @Post('organizations/:orgId/restore')
  restoreOrganization(@Param('orgId') orgId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.admin.restoreOrganization(orgId, user.userId);
  }

  @Get('organizations/:orgId/subscriptions')
  listSubscriptions(@Param('orgId') orgId: string) {
    return this.admin.listSubscriptions(orgId);
  }

  @Post('organizations/:orgId/subscriptions')
  setSubscription(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetSubscriptionDto,
  ) {
    return this.admin.setSubscription(orgId, user.userId, dto);
  }
}
