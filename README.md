# FacturaRD

Plataforma SaaS multi-tenant para que contadores de República Dominicana recolecten,
digitalicen y reporten facturas de gastos de sus clientes ante la DGII (Formatos 606/607).

La especificación completa está en [ESPECIFICACION.md](./ESPECIFICACION.md).

## Estructura del monorepo

| Paquete | Descripción |
|---|---|
| `api/` | API NestJS — monolito modular (auth, tenants, invoices, dgii, …) |
| `workers/` | Workers BullMQ — pipeline OCR con Claude API, trabajos de lote |
| `shared/` | Esquema Prisma, validadores fiscales (NCF, RNC, aritmética), tipos y constantes |

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

pnpm dev:api                  # API en http://localhost:3000 (GET /health)
pnpm dev:worker               # worker BullMQ
```

## Comandos

| Comando | Acción |
|---|---|
| `pnpm build` | Compila todos los paquetes |
| `pnpm test` | Tests (vitest) — validadores fiscales con cobertura completa |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` / `db:deploy` / `db:seed` | Prisma migrate dev / deploy / seeds |

## Despliegue (servidor Ubuntu propio)

```bash
cp .env.example .env          # secretos reales + APP_DOMAIN
docker compose up -d --build  # migra, siembra y levanta todo detrás de Caddy (TLS automático)
```

**Seguridad (§8):** en el servidor, eliminar los mapeos `127.0.0.1:*` del compose;
`ufw` solo 22 (llaves SSH) y 443; backups diarios externos de PostgreSQL y MinIO.

## Estado del proyecto

- [x] **Fase 0 — Fundación**: monorepo pnpm, Docker Compose, Prisma + seeds, CI, validadores fiscales
- [ ] Fase 1 — Núcleo multi-tenant (auth, memberships, RLS, panel contador, super-admin)
- [ ] Fase 2 — Captura y OCR (app Flutter + pipeline Claude API)
- [ ] Fase 3 — DGII (padrón RNC, generadores 606/607, cierre de período)
- [ ] Fase 4 — Pulido y lanzamiento
