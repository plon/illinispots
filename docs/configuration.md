# Environment configuration

Copy [`.env.example`](../.env.example) to `.env.local` for local development. Bun loads the server environment, and Vite reads `VITE_*` values for the development client.

## Required settings

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: Publishable or anonymous key used by the Hono server for read-only queries.
- `VITE_MAPBOX_ACCESS_TOKEN`: Public Mapbox token.
- `VITE_MAPBOX_STYLE_URL`: Mapbox style URL.

The [data pipeline](../data-pipeline/README.MD) uses `SUPABASE_SECRET_KEY` for database writes. This service-role key belongs in the pipeline environment and must never use a `VITE_` prefix.

## Optional settings

### Browser analytics

Set both values to enable PostHog:

```env
VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=your_posthog_project_token
VITE_PUBLIC_POSTHOG_HOST=https://your-posthog-host
```

### Observability

Sentry reports browser and server errors, API dependency failures, and scheduled pipeline failures:

```env
SENTRY_DSN=your_sentry_dsn
VITE_SENTRY_DSN=your_sentry_dsn
```

`SENTRY_AUTH_TOKEN` is needed only to upload source maps during a production build. Set `SENTRY_DISABLE_AUTO_UPLOAD=true` for verification builds that should skip uploads.

Use `APP_ENV` and `VITE_APP_ENV` to label the environment explicitly. See [`.env.example`](../.env.example) for the full template and the [pipeline observability notes](../data-pipeline/README.MD#scheduled-run-observability) for scheduled jobs.

## Production configuration

Set runtime values as Fly secrets for each app. Hono injects public browser configuration into the served HTML at runtime. Mapbox also accepts `MAPBOX_ACCESS_TOKEN` and `MAPBOX_STYLE_URL`, which take precedence over their `VITE_` equivalents. The browser Sentry DSN uses `SENTRY_DSN` first, then `VITE_SENTRY_DSN`.

See [deployment](deployment.md) for production, staging, and local container commands.
