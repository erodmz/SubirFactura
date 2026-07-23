# Panel web del contador (Next.js standalone)
FROM node:23-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /app

FROM base AS build
# El client id de Google es PÚBLICO (aparece en el navegador), pero Next inyecta
# las NEXT_PUBLIC_* en tiempo de BUILD, así que entra como build-arg. Vacío =
# el botón "Entrar con Google" no se muestra.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
# Vacío = el panel llama a /api relativo, que es lo correcto detrás de Caddy
# (mismo origen). Se fija aquí, y no solo en el .dockerignore, porque un
# NEXT_PUBLIC_* mal horneado no falla el build: el panel compila feliz y en
# producción pide a la máquina equivocada.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# URL canónica para SEO (robots.txt, sitemap, og:url). Es la LANDING, no el
# panel: lo que se indexa es la página pública.
ARG NEXT_PUBLIC_SITE_URL="https://www.subirfactura.com"
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @facturard/web
COPY web web
RUN pnpm --filter @facturard/web build

FROM node:23-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/web/.next/standalone ./
# El `standalone` de Next NO incluye ni los estáticos ni public/: hay que
# copiarlos a mano. Sin la segunda línea, las fotos de la landing dan 404 en
# producción y en local no se nota (el dev server sirve public/ solo).
COPY --from=build /app/web/.next/static ./web/.next/static
COPY --from=build /app/web/public ./web/public
EXPOSE 3000
CMD ["node", "web/server.js"]
