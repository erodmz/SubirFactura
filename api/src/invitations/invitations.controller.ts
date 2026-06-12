import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateInvitationDto } from './dto/invitations.dto';

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('organizations/:orgId/invitations')
  @OrgRoles('org_admin')
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(orgId, user.userId, dto);
  }

  @Public()
  @Get('invitations/:token')
  getPublic(@Param('token') token: string) {
    return this.invitations.getPublic(token);
  }

  @Post('invitations/:token/accept')
  accept(@Param('token') token: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invitations.accept(token, user);
  }
}
