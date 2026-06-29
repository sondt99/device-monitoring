# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build
RUN pnpm deploy --filter @device-monitoring/api --prod /prod/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache iputils tini \
  && addgroup -S device-monitoring \
  && adduser -S device-monitoring -G device-monitoring \
  && mkdir -p /data /app/public \
  && chown -R device-monitoring:device-monitoring /data /app
COPY --from=build --chown=device-monitoring:device-monitoring /prod/api/ ./
COPY --from=build --chown=device-monitoring:device-monitoring /app/apps/web/dist ./public
USER device-monitoring
EXPOSE 3000
VOLUME ["/data"]
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/device-monitoring.sqlite STATIC_DIR=/app/public
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
