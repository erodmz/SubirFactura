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
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @facturard/web
COPY web web
RUN pnpm --filter @facturard/web build

FROM node:23-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./web/.next/static
EXPOSE 3000
CMD ["node", "web/server.js"]
