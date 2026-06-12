import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { MembersService } from './members.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, MembersService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
