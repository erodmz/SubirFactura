# Imagen multi-etapa para API y worker (mismo repo, procesos separados — §3)
FROM node:23-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /app

# ── Dependencias ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY api/package.json api/
COPY workers/package.json workers/
COPY shared/package.json shared/
COPY shared/prisma shared/prisma
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared shared
COPY api api
COPY workers workers
RUN pnpm db:generate && pnpm -r build
RUN pnpm --filter @facturard/api --prod deploy --legacy /out/api \
 && pnpm --filter @facturard/workers --prod deploy --legacy /out/workers \
 && cd /out/api && npx prisma@6 generate --schema=node_modules/@facturard/shared/prisma/schema.prisma \
 && cd /out/workers && npx prisma@6 generate --schema=node_modules/@facturard/shared/prisma/schema.prisma

# ── Runtime: API ──────────────────────────────────────────────────────────────
FROM node:23-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api .
EXPOSE 3000
CMD ["node", "dist/main.js"]

# ── Runtime: Worker ───────────────────────────────────────────────────────────
FROM node:23-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/workers .
CMD ["node", "dist/main.js"]
