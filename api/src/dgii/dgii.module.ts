import { Module } from '@nestjs/common';
import { DgiiController } from './dgii.controller';
import { DgiiService } from './dgii.service';

@Module({
  controllers: [DgiiController],
  providers: [DgiiService],
})
export class DgiiModule {}
