# Architecture

illiniSpots uses React, Vite, TanStack Router, TanStack Query, TypeScript, Tailwind CSS, shadcn/ui, and Mapbox. The API runs on Hono and Bun, with Supabase PostgreSQL for academic schedules and building data.

The client and API share one package and deploy as one application:

```text
src/client/          React entrypoint, providers, routes, and browser telemetry
src/server/routes/   HTTP validation and response contracts
src/server/services/ Availability, Supabase, and LibCal services
src/components/      Shared React UI
src/types/           Shared API and UI types
```

During development, Vite listens on port 5173 and proxies `/api/*` to Hono on port 3000. In production, Hono serves the built client and API from the same origin on Fly.io and injects public browser configuration at runtime. Availability and schedules are exposed through `/api/facilities` and `/api/room-schedule`.

The [Supabase migrations](../supabase/migrations) are the deployment source of truth. Files under [database](../database) provide readable schema and function references.

## Availability and data sources

All times use campus local time, `America/Chicago`, including daylight saving changes.

Academic availability combines class schedules, loaded university events, and building hours. The API queries the SQL function `get_cached_spots`, which uses cached daily schedules and precomputed room segments when present and falls back to `get_spots` for uncached dates. The app uses a 30-minute minimum useful interval to filter short gaps between activities.

Library availability uses the LibCal reservation grid and library hours. The app shows free time until the next booking or closing time, with links to reserve rooms.

Sources and refresh schedules are:

- Classes: [Course Explorer](https://courses.illinois.edu/), loaded by the [weekly workflow](../.github/workflows/course-explorer-weekly.yml).
- University events: [Tableau Daily Event Summary](https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents), loaded by the [daily workflow](../.github/workflows/tableau-daily-events.yml).
- Building hours: [Facility Scheduling and Resources](https://operations.illinois.edu/facility-scheduling-and-resources/daily-event-summaries/), maintained in the data pipeline's building metadata.
- Library reservations: [UIUC LibCal](https://libcal.library.illinois.edu/allspaces), fetched when the API requests library availability.

The event scraper replaces the loaded event snapshot on each run. Events affect a selected date only when they are present in that snapshot; historical and future event coverage is not guaranteed. Dates without loaded events use class schedules and building hours.

Published availability does not guarantee physical access. Unofficial study groups, departmental restrictions, last-minute changes, exam and holiday schedules, maintenance closures, and source outages can affect accuracy.

See the [data pipeline guide](../data-pipeline/README.MD) for collection and loading instructions.

## Data quality and verification

Python pipelines collect and load university data through scheduled GitHub Actions workflows. Before loading buildings, the pipeline audits hours and coordinates, excludes incomplete buildings, and reports issues in workflow summaries.

[Continuous integration](../.github/workflows/web-checks.yml) runs lint, type checks, unit and API tests, production builds, and Playwright browser tests. Sentry provides browser and server error reporting and scheduled pipeline monitoring.

See [deployment](deployment.md) for production and staging operations.
