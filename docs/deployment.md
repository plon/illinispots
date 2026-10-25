# Deployment

illiniSpots runs as a long-lived Bun server in Docker containers on Fly.io Machines. Hono serves the Vite production build and `/api/*` on port 3000. Health checks use `/api/health`.

## Deploy to Fly

Configure the required [environment settings](configuration.md) as Fly secrets for the target app before deploying.

Production uses [`fly.toml`](../fly.toml), rolling deploys, and at least two running Machines:

```bash
flyctl deploy --config fly.toml
```

Staging uses [`fly.staging.toml`](../fly.staging.toml), immediate deploys, and at least one running Machine:

```bash
flyctl deploy --config fly.staging.toml
```

The [production workflow](../.github/workflows/deploy-production.yml) deploys pushes to `main`. The [staging workflow](../.github/workflows/deploy-staging.yml) deploys pull requests when the `deploy:staging` label is applied or the labeled branch is updated. Both workflows also support manual runs with an optional ref.

GitHub Actions uses the `FLY_API_TOKEN` repository secret for deployment and passes the optional `SENTRY_AUTH_TOKEN` as a build argument for source map uploads.

## Run the production server locally

With `.env.local` configured, build and start the app:

```bash
bun run build
bun run start
```

Open [localhost:3000](http://localhost:3000).

To run the Docker image instead:

```bash
docker build -t illinispots .
docker run --env-file .env.local -p 3000:3000 illinispots
```

## Vercel entrypoint

The repository also contains a serverless Hono entrypoint at [`api/[...route].ts`](../api/%5B...route%5D.ts). The current [`vercel.json`](../vercel.json) redirects incoming traffic to `illinispots.com`; Fly is the primary deployment.
