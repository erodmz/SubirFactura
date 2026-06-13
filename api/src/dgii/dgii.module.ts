import { Module } from '@nestjs/common';
import { DgiiController } from './dgii.controller';
import { DgiiService } from './dgii.service';
import { PadronService } from './padron.service';

@Module({
  controllers: [DgiiController],
  providers: [DgiiService, PadronService],
})
export class DgiiModule {}
