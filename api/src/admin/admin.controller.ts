import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SetSubscriptionDto } from './dto/admin.dto';

@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('organizations')
  listOrganizations() {
    return this.admin.listOrganizations();
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
