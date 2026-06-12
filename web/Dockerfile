# Panel web del contador (Next.js standalone)
FROM node:23-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /app

FROM base AS build
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
