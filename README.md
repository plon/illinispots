# illiniSpots

illiniSpots is a web application that helps UIUC students find available study spaces and classrooms across campus. The app shows live building availability on an interactive map and provides detailed room status information.

## Features

- Interactive map and list: Visualize building availability or browse a searchable list.
- Real-time and time travel: check now or any date/time.
- Coverage: Academic classrooms and reservable library study rooms (Grainger, Funk ACES, Main Library).
- Room details:
  - **Academic Rooms:** See current/next class or event, availability duration, and view the full daily schedule (classes + events) for the selected date.
  - **Library Rooms:** View reservation timelines, direct reservation links, and room photos (where available).
- PWA: install on your phone as an app for quick access.  
    [Need help? See this guide on installing PWAs.](https://www.installpwa.com/from/illinispots.com)
- Search and filters: find buildings and libraries fast.

## How It Works

- Combines official class schedules with daily university event data to determine whether a room is in use at a specific date/time.
- Academic rooms: a room is unavailable if any class or daily event overlaps the selected time; otherwise it’s available. Availability ends at the earliest of the next class/event or building close. Very short gaps (< ~30 minutes) are not surfaced as “available” to avoid unusable slivers.
- Library rooms: uses the UIUC LibCal reservation grid; a room is available if the current slot is free, and the duration lasts until the next booking or closing time.
- Time travel: daily events are included for past dates and for future dates up to 14 days ahead; for dates further in the future, only class schedules and building hours are used.
- Timezone: all times are evaluated in campus local time (America/Chicago), handling DST.

## Accuracy & Reliability

- Sources: class data from Course Explorer, daily events from the university Tableau feed, building hours from Facilities, and library reservations from LibCal (links below).
- Freshness: library reservations are read live; daily events are scraped and updated regularly via a cron job; class/building data is refreshed via the data pipeline.
- Deterministic rules: availability for academic rooms is computed in SQL ([`get_spots` migration](supabase/migrations/20260819000100_optimize_get_spots.sql)), using only official schedules + events and building hours.
- Known limitations:
  - Unofficial use (study groups, ad‑hoc meetings) and last‑minute changes may not be reflected.
  - Departmental access restrictions can make an “available” room unusable.
  - Special schedules (exams/holidays), maintenance closures, or data source outages can reduce accuracy.
  - Short “micro‑gaps” are intentionally filtered out (< ~30 minutes) to avoid noise.
  - Future dates exclude daily events; academic availability for future times uses class schedules + building hours only (events are only available per-day as they are published).

## Data Sources

- Class data: [Course Explorer](https://courses.illinois.edu/). See the data flow in [`data-pipeline/README.MD`](data-pipeline/README.MD).
- Daily events: [Tableau Daily Event Summary](https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents).
- Building hours: [Facility Scheduling and Resources](https://operations.illinois.edu/facility-scheduling-and-resources/daily-event-summaries/).
- Library reservations: [UIUC LibCal](https://libcal.library.illinois.edu/allspaces).

## Tech Stack

- Frontend: React 19, Vite 8, TanStack Router, TanStack Query, TypeScript, Tailwind CSS, shadcn/ui, and Mapbox.
- Backend: Hono on Bun, Supabase (PostgreSQL), and SQL functions (`database/functions`).
- Observability: Sentry for the React client, Bun server, API dependencies, and scheduled data pipelines.

### Application Architecture

The Vite client and Hono API live in one package and are deployed as one
same-origin application:

```text
src/client/          React entrypoint, providers, routes, and browser telemetry
src/server/routes/   HTTP validation and response contracts
src/server/services/ availability, Supabase, and LibCal domain services
src/components/      shared React UI
src/types/           shared API and UI types
```

During development Vite runs on port 5173 and proxies `/api/*` to Hono on port
3000. In production Hono serves the built Vite assets and the API from the same
port. The two public data endpoints remain `/api/facilities` and
`/api/room-schedule`.

## Getting Started

### Prerequisites

- Bun 1.4+
- Supabase project (PostgreSQL)

### Setup

1) Install dependencies

```bash
git clone https://github.com/plon/illinispots
cd illinispots
bun install
```

2) Supabase database

- Create a database (e.g., via Supabase).
- Link the project with `bunx supabase link --project-ref <project-ref>`.
- Apply the versioned schema and security policies with `bunx supabase db push`.
- The files under [`database/`](database) remain readable references for the
  current tables and functions; [`supabase/migrations`](supabase/migrations) is
  the deployment source of truth.

3) Environment

Copy `.env.example` to `.env.local` and provide:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
VITE_MAPBOX_ACCESS_TOKEN=your_public_mapbox_token
VITE_MAPBOX_STYLE_URL=mapbox://styles/<user>/<style-id>
```

`SUPABASE_KEY` is server-only. The public Mapbox configuration is supplied directly to the client via Vite environment variables.

4) Run locally

```bash
bun run dev
```

Open http://localhost:5173. Hono continues to listen on http://localhost:3000
for direct API access.

### Verification

```bash
bun run check
```

This runs ESLint, Bun's route and service tests, the Vite production build, and
TypeScript validation.

### Production

The existing Vercel project deploys the Vite build as static assets and the
Hono API as a Bun 1.4 Vercel Function. This retains Vercel preview deployments,
CDN delivery, autoscaling, and the existing domain. Vercel requires the same
environment variables shown above for Production, Preview, and Development
deployments.

Preview deployments are created from pull requests. The `/api/*` contract stays
same-origin, so previews and the production domain do not need CORS
configuration.

For a container deployment, build and run directly:

```bash
bun run build
bun run start
```

Or use the included image:

```bash
docker build -t illinispots .
docker run --env-file .env.local -p 3000:3000 illinispots
```

### Optional: Data Pipeline

For collecting and loading source data, see [`data-pipeline/README.MD`](data-pipeline/README.MD) for Python setup, script order, and outputs (including the daily events job).

## License

MIT — see [`LICENSE`](LICENSE).
