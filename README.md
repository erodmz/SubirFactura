# FacturaRD

Plataforma SaaS multi-tenant para que contadores de República Dominicana recolecten,
digitalicen y reporten facturas de gastos de sus clientes ante la DGII (Formatos 606/607).

La especificación completa está en [ESPECIFICACION.md](./ESPECIFICACION.md).

## Estructura del monorepo

| Paquete | Descripción |
|---|---|
| `api/` | API NestJS — monolito modular (auth, tenants, invoices, dgii, …), servido bajo `/api` |
| `workers/` | Workers BullMQ — pipeline OCR con Claude API, trabajos de lote |
| `shared/` | Esquema Prisma, validadores fiscales (NCF, RNC, aritmética), tipos y constantes |
| `web/` | Panel web del contador (Next.js): empresas, clientes, equipo, suscripciones |
| `app_flutter/` | App móvil del cliente final: captura con guías, cola offline-first, revisión |

La app móvil Flutter vivirá en un repositorio/carpeta aparte (`app_flutter`).

## Requisitos

- Node.js ≥ 22 y pnpm ≥ 10 (`npm i -g pnpm`)
- Docker Desktop (PostgreSQL, Redis, MinIO, Caddy)

## Desarrollo local

```bash
cp .env.example .env          # ajustar secretos
pnpm install                  # instala y genera el cliente Prisma

# Infraestructura (solo postgres/redis/minio para desarrollo)
docker compose up -d postgres redis minio

pnpm db:migrate               # crea/aplica migraciones (desarrollo)
pnpm db:seed                  # planes + categorías 606

pnpm dev:api                  # API en http://localhost:3000 (rutas bajo /api, GET /health)
pnpm dev:worker               # worker BullMQ
pnpm dev:web                  # panel en http://localhost:3001 (crear web/.env.local con
                              # NEXT_PUBLIC_API_URL=http://localhost:3000)
```

## Comandos

| Comando | Acción |
|---|---|
| `pnpm build` | Compila todos los paquetes |
| `pnpm test` | Tests (vitest) — validadores fiscales con cobertura completa |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` / `db:deploy` / `db:seed` | Prisma migrate dev / deploy / seeds |
| `pnpm --filter @facturard/shared exec tsx scripts/make-super-admin.ts <email>` | Promueve un usuario a super-admin |

## Despliegue (servidor Ubuntu propio)

```bash
cp .env.example .env          # secretos reales + APP_DOMAIN
docker compose up -d --build  # migra, siembra y levanta todo detrás de Caddy (TLS automático)
```

**Seguridad (§8):** en el servidor, eliminar los mapeos `127.0.0.1:*` del compose;
`ufw` solo 22 (llaves SSH) y 443; backups diarios externos de PostgreSQL y MinIO.

## Estado del proyecto

- [x] **Fase 0 — Fundación**: monorepo pnpm, Docker Compose, Prisma + seeds, CI, validadores fiscales
- [x] **Fase 1 — Núcleo multi-tenant**: auth JWT + refresh rotado, memberships multi-empresa,
      invitaciones por enlace, clientes + asignaciones, límites de plan, RLS, panel super-admin,
      y panel web del contador (Next.js) detrás de Caddy
- [x] **Fase 2 — Pipeline OCR (backend)**: subida de facturas a MinIO, cola BullMQ, worker con
      Claude API (visión + structured outputs), reglas de confianza (80/100%), validaciones
      determinísticas, detección de duplicados, cola de revisión con edición campo a campo,
      y respaldo de captura manual tras 3 reintentos
- [x] **Fase 2 — App Flutter**: login multi-empresa, captura con guías, cola de subida
      offline-first con reintentos, estados en vivo y revisión campo a campo
- [ ] Fase 3 — DGII (en curso): **606 TXT + cierre de período listos**; pendientes padrón RNC, 607, Excel
- [ ] Fase 4 — Pulido y lanzamiento
