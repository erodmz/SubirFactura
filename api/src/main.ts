import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { traducirMensajeValidacion } from './common/validation-es';

/** Aplana los errores de class-validator y traduce los defaults en inglés. */
function mensajesEnEspanol(errors: ValidationError[]): string[] {
  const out: string[] = [];
  const walk = (errs: ValidationError[]) => {
    for (const e of errs) {
      for (const msg of Object.values(e.constraints ?? {})) {
        out.push(traducirMensajeValidacion(msg));
      }
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);
  return out;
}

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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // La UI es en español (ESPECIFICACION §10): nunca dejar escapar los
      // mensajes default en inglés de class-validator ("password should not
      // be empty" llegó hasta el login del móvil en las pruebas).
      exceptionFactory: (errors) => new BadRequestException(mensajesEnEspanol(errors)),
    }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`SubirFactura API escuchando en puerto ${port}`);
}

void bootstrap();
