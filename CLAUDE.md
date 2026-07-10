# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

**SubirFactura** (antes FacturaRD — los identificadores de código siguen siendo `@facturard/*`):
SaaS multi-tenant para que contadores dominicanos recolecten facturas de gastos de sus
clientes (foto desde app móvil), las digitalicen con Claude Vision y generen el
Formato 606/607 de la DGII. La especificación completa y las decisiones ya tomadas
(no re-discutir) están en [ESPECIFICACION.md](ESPECIFICACION.md). El estado real del
proyecto y lo pendiente están en [docs/PROGRESO.md](docs/PROGRESO.md). La evaluación
estratégica (consejo de 5 asesores, jul-2026) está en `docs/consejo-2026-07/`.

## Comandos

```bash
./scripts/dev.sh              # TODO el entorno con un comando (Docker + migraciones + seeds + api/worker/web)
./scripts/stop.sh             # baja todo, incluida la infra Docker

# Individuales
docker compose up -d postgres redis minio
pnpm dev:api                  # NestJS en :3000 (rutas bajo /api; GET /health en raíz)
pnpm dev:worker               # worker BullMQ (OCR)
pnpm dev:web                  # panel Next.js en :3001

pnpm build                    # compila todos los paquetes
pnpm lint                     # ESLint (raíz)
pnpm test                     # vitest en todos los paquetes

# Un solo archivo de test (los tests fiscales viven en shared/)
pnpm --filter @facturard/shared exec vitest run src/dgii/formato606.test.ts

# Prisma (el esquema vive en shared/prisma/schema.prisma)
pnpm db:migrate               # migrate dev
pnpm db:deploy                # migrate deploy
pnpm db:seed                  # planes + categorías 606
pnpm db:generate              # regenerar cliente (corre solo en postinstall)

# Utilidades
pnpm --filter @facturard/shared exec tsx scripts/make-super-admin.ts <email>
pnpm --filter @facturard/shared exec tsx scripts/import-padron-rnc.ts  # padrón RNC de la DGII
```

App Flutter (NO es workspace de pnpm; vive en `app_flutter/`):

```bash
cd app_flutter
flutter run --dart-define=API_URL=http://localhost:3000       # simulador iOS (cámara → galería)
flutter run --dart-define=API_URL=http://10.0.2.2:3000        # emulador Android
flutter run --release --dart-define=API_URL=http://<IP_LAN>:3000  # iPhone físico: SIEMPRE --release
flutter analyze && flutter test
```

## Entorno local (particularidades no obvias)

- **PostgreSQL está mapeado al puerto 5433 del host** (el 5432 lo ocupa el Postgres
  local de la máquina). El `.env` real ya lo refleja; `.env.example` muestra 5432.
- Cuenta de prueba: `elmer.test@facturard.do` / `clave-segura-123` (org_admin de
  "Contadores Unidos SRL"). `dev.sh` la crea si no existe.
- Sin `ANTHROPIC_API_KEY` el worker no extrae: las facturas caen a `en_revision`
  para captura manual (comportamiento esperado, no un bug). Modelo por env var
  `ANTHROPIC_MODEL` (default `claude-haiku-4-5`), nunca hardcodear.
- `S3_PUBLIC_URL` debe ser la IP LAN de la Mac (no localhost) para que las URLs
  firmadas de MinIO funcionen desde el teléfono; `dev.sh` lo fija solo.
- iOS Share Extension: es **autónoma con código embebido**; NO usar la vía SPM del
  plugin (genera paquete duplicado).

## Arquitectura

Monorepo pnpm: `api` (NestJS) + `workers` (BullMQ) + `shared` (Prisma y núcleo fiscal)
+ `web` (Next.js 15 App Router) + `app_flutter` (fuera del workspace).

**Flujo principal**: la app/web sube la imagen al API → se guarda en MinIO y se
encola en BullMQ → `workers/src/ocr/processor.ts` la procesa: lee el QR e-CF si
existe (`qr.ts` — datos oficiales de la DGII, mejor que OCR), llama a Claude Vision
con structured outputs (`extract.ts`), aplica reglas de confianza (campos críticos
≥ 0.90 → `extraida`; si no → `en_revision` marcando los campos dudosos) y
validaciones determinísticas de `shared` → el contador revisa/valida en el panel →
cierre de período y generación del 606 TXT/Excel.

- **`shared/` es el núcleo fiscal** consumido por api y workers: validadores NCF/RNC/
  aritmética (`src/validators/`), generador 606, padrón RNC y verificación e-CF
  (`src/dgii/`), reglas de confianza OCR (`src/ocr/evaluate.ts`), esquema Prisma y
  seeds. Los validadores fiscales exigen cobertura de tests completa. `api` y
  `workers` importan `@facturard/shared` **compilado** — tras cambiar `shared/src`,
  correr `pnpm --filter @facturard/shared build`.
- **Multi-tenant con doble barrera**: autorización por membresía/rol en cada endpoint
  (guards globales `JwtAuthGuard` + `OrgRolesGuard`) y row-level security de Postgres
  como segunda capa. `PrismaService.forOrg(orgId)` ([api/src/prisma/prisma.service.ts](api/src/prisma/prisma.service.ts))
  fija `app.current_org` en cada operación; la RLS solo aplica si `APP_DATABASE_URL`
  apunta al rol `facturard_app` (sin BYPASSRLS). Dentro de una misma org, los
  endpoints de facturas filtran además por clientes asignados
  (`invoiceScope()`/`assertInvoiceInScope()` en `invoices.service.ts`) — no quitar
  ese filtro: cerró un IDOR intra-tenant real.
- **El 606 se genera POR CLIENTE** (cada contribuyente con su propio RNC), nunca
  agregado bajo el RNC de la organización — un 606 mezclado es fiscalmente inválido.
  Los endpoints de `dgii/` exigen `clientId`.
- **Estados de factura**: `subida → procesando → extraida → en_revision → validada →
  incluida_en_606 → reportada` (+ `rechazada`, `duplicada`). Duplicados por unicidad
  (org, rnc_proveedor, ncf). Si Claude falla 3 veces → `en_revision` con captura
  manual; una factura nunca se pierde.
- **Rate limiting**: throttler global 120/min; `@Throttle` más estricto en auth
  (login/register 10/min). No aflojar sin razón.
- Verificación e-CF en vivo contra ecf.dgii.gov.do detrás del flag
  `DGII_LIVE_VERIFICATION` (apagado por defecto).

## Convenciones (ESPECIFICACION.md §10)

- TypeScript estricto; español en UI y mensajes al usuario, inglés en código e
  identificadores.
- Dinero: `NUMERIC(14,2)` o BIGINT en centavos — nunca float. Fechas en UTC en BD;
  `America/Santo_Domingo` solo en presentación y cortes de período fiscal.
- Commits convencionales (en español); una rama por fase (`fase-1`, `fase-2`, …).
- Cada módulo nuevo arranca con migración + seed + test antes de la UI.
- Las 11 categorías del 606 y los planes viven en la BD (seeds), no hardcodeados.
