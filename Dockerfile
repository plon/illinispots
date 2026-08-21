FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
ARG VITE_MAPBOX_ACCESS_TOKEN
ARG VITE_MAPBOX_STYLE_URL
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG SENTRY_AUTH_TOKEN
ENV VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN \
    VITE_MAPBOX_STYLE_URL=$VITE_MAPBOX_STYLE_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

COPY . .
RUN bun run build

FROM oven/bun:1.4.0-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --chown=bun:bun package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production

COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun src ./src

EXPOSE 3000
USER bun

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "const response = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health'); process.exit(response.ok ? 0 : 1)"

CMD ["bun", "src/server/index.ts"]
