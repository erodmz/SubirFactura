import { Global, Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { PlansController } from './plans.controller';

@Global()
@Module({
  controllers: [PlansController],
  providers: [PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlansModule {}
