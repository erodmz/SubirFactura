import { Module } from '@nestjs/common';
import { DgiiController } from './dgii.controller';
import { DgiiService } from './dgii.service';
import { PadronService } from './padron.service';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [ClientsModule],
  controllers: [DgiiController],
  providers: [DgiiService, PadronService],
})
export class DgiiModule {}
