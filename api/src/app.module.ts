import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

// Monolito modular (ESPECIFICACION.md §3). Los módulos auth, tenants, clients,
// invoices, ocr, dgii, billing y admin se agregan en las fases 1–3.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
