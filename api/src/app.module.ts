import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { parseDuration } from './auth/auth.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { PlansModule } from './plans/plans.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ClientsModule } from './clients/clients.module';
import { AdminModule } from './admin/admin.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { OrgRolesGuard } from './common/guards/org-roles.guard';

// Monolito modular (ESPECIFICACION.md §3). Pendientes: invoices/ocr (Fase 2),
// dgii (Fase 3), billing con pasarela (Fase 5).
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: parseDuration(process.env.JWT_EXPIRES_IN ?? '15m') / 1000 },
      }),
    }),
    PrismaModule,
    AuditModule,
    PlansModule,
    AuthModule,
    OrganizationsModule,
    InvitationsModule,
    ClientsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Autenticación global (token JWT salvo @Public) y autorización por
    // membresía/rol en rutas con :orgId (§8)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: OrgRolesGuard },
  ],
})
export class AppModule {}
