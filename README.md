# illiniSpots

Find available classrooms and library study rooms at the University of Illinois Urbana-Champaign.

**[Open illiniSpots](https://illinispots.com)**

Campus room availability is spread across class schedules, university events, building hours, and library reservation systems. illiniSpots brings these sources into one map and schedule view so students can find a place to study.

## Features

- Browse campus buildings on an interactive map or search the list.
- Check availability now or select another date and time.
- View classroom schedules, current and upcoming classes or events, and how long a room is available.
- Browse reservable rooms at Grainger, Funk ACES, and Main Library, with reservation links and room photos where available.
- Install the app on your phone using the [PWA installation guide](https://www.installpwa.com/from/illinispots.com).

Availability is based on published schedules, building hours, and library reservations. Unofficial use, access restrictions, and last-minute changes may not be reflected. See [availability and data sources](docs/architecture.md#availability-and-data-sources) for details.

## Tech stack

React, TypeScript, Vite, TanStack Router and Query, Tailwind CSS, and Mapbox on the frontend; Hono on Bun and Supabase PostgreSQL on the backend; Python for data collection. The app runs on Fly.io, with GitHub Actions for CI, deployment, and scheduled data pipelines.

See [architecture](docs/architecture.md) for code organization and availability rules.

## Run locally

You need Bun 1.4.2 or later, a Supabase project, and a public Mapbox token and style URL.

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/plon/illinispots
   cd illinispots
   bun install
   ```

2. Link your Supabase project and apply the schema:

   ```bash
   bunx supabase link --project-ref <project-ref>
   bunx supabase db push
   ```

   Migrations create the schema and security policies. To populate academic buildings and schedules, follow the [data pipeline guide](data-pipeline/README.MD).

3. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

   Set these values in `.env.local`:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your_publishable_anon_key
   VITE_MAPBOX_ACCESS_TOKEN=your_public_mapbox_token
   VITE_MAPBOX_STYLE_URL=mapbox://styles/your-user/your-style
   ```

   See [configuration](docs/configuration.md) for optional analytics and observability settings.

4. Start the app:

   ```bash
   bun run dev
   ```

   Open [localhost:5173](http://localhost:5173). Vite proxies API requests to the Hono server on port 3000.

## Verify changes

```bash
bun run check
```

This runs Oxlint, Bun tests, the Vite production build, and TypeScript validation.

Run the Chromium navigation tests separately:

```bash
bunx playwright install --with-deps chromium
bun run test:e2e
```

The browser tests use fixed campus time and intercepted API responses, so no database or deployment credentials are required. GitHub Actions uploads the report and traces when a browser test fails.

## Project documentation

- [Architecture, availability rules, and data sources](docs/architecture.md)
- [Environment configuration](docs/configuration.md)
- [Production and staging deployment](docs/deployment.md)
- [Data collection and loading](data-pipeline/README.MD)

## License

[MIT](LICENSE)
