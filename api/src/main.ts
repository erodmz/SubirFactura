import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
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
  const esProd = process.env.NODE_ENV === 'production';
  if (esProd && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
  // CORS abierto (?? true) en producción reflejaría cualquier origen: fallar
  // cerrado. En dev sí se permite todo para no estorbar.
  if (esProd && !process.env.WEB_ORIGIN) {
    throw new Error('WEB_ORIGIN es obligatorio en producción');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // El body ya lo limita cada @UseInterceptors de subida; este es el tope
    // global para JSON, contra payloads gigantes en cualquier endpoint.
    bodyParser: true,
  });

  // Detrás de Caddy, la IP real viene en X-Forwarded-For. Sin confiar en UN
  // salto, el throttler ve la IP del proxy: o todos comparten cubo, o el XFF es
  // falsificable y el rate-limit anti fuerza-bruta se evade. 1 = solo Caddy.
  app.set('trust proxy', 1);

  // Cabeceras de seguridad. nosniff evita que un archivo subido (guardado con
  // el mimetype declarado por el cliente) sea interpretado como HTML/JS y
  // sirva un XSS almacenado desde el propio origen del API.
  app.use(
    helmet({
      // El API sirve JSON e imágenes, no HTML propio: la CSP por defecto de
      // helmet no aplica y podría estorbar; el resto de cabeceras sí van.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

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
