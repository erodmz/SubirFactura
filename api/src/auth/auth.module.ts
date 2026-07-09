import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { StorageModule } from '../storage/storage.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [StorageModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
