import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { AuthController } from './auth.controller';
import { StorageModule } from '../storage/storage.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [StorageModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, OAuthService],
  exports: [AuthService],
})
export class AuthModule {}
