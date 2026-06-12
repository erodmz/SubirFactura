import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }

  const app = await NestFactory.create(AppModule);
  // El panel web y la app móvil consumen todo bajo /api; /health queda en la
  // raíz para los healthchecks de Docker/Caddy
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`FacturaRD API escuchando en puerto ${port}`);
}

void bootstrap();
