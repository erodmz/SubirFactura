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
# Dos detalles que rompían el build de producción:
#   1. --ignore-scripts: el postinstall de la raíz llama `prisma generate`, y
#      `prisma` es devDependency — en un deploy --prod no existe ("prisma: not
#      found"). El cliente se genera explícitamente abajo con pnpm dlx.
#   2. El generate corre DENTRO de node_modules/@facturard/shared: con pnpm,
#      @prisma/client se enlaza en el contexto de shared (quien lo importa), no
#      en la raíz del deploy. Desde /out/api, prisma no lo encontraba e intentaba
#      instalarlo solo, fallando el build.
RUN pnpm --filter @facturard/api --prod deploy --legacy --ignore-scripts /out/api \
 && pnpm --filter @facturard/workers --prod deploy --legacy --ignore-scripts /out/workers \
 && cd /out/api/node_modules/@facturard/shared && pnpm dlx prisma@6 generate --schema=prisma/schema.prisma \
 && cd /out/workers/node_modules/@facturard/shared && pnpm dlx prisma@6 generate --schema=prisma/schema.prisma

# ── Runtime: API ──────────────────────────────────────────────────────────────
FROM node:23-alpine AS api
# poppler-utils = pdfinfo + pdftoppm: el API rasteriza los PDF subidos a
# imágenes de página al recibirlos (invoices/pdf.ts). Sin esto, subir un PDF
# falla en producción.
RUN apk add --no-cache poppler-utils
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
