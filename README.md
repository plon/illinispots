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
    [Need help? See this guide on installing PWAs.](https://www.installpwa.com/from/illinispots.vercel.app)
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
- Deterministic rules: availability for academic rooms is computed in SQL ([`database/functions/get_spots.sql`](database/functions/get_spots.sql)), using only official schedules + events and building hours.
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
- Library reservations: [UIUC LibCal](https://uiuc.libcal.com/allspaces).

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Mapbox.
- Backend: Supabase (PostgreSQL), Next.js API Routes, SQL functions (`database/functions`).

## Getting Started

### Prerequisites

- Node.js 18.17+
- npm or yarn
- Supabase project (PostgreSQL)

### Setup

1) Install dependencies

```bash
git clone https://github.com/plon/illinispots
cd illinispots
npm install
```

2) Supabase database

- Create a database (e.g., via Supabase).
- Apply schema: run [`database/schema/tables.sql`](database/schema/tables.sql) in the SQL editor.
- Add functions: run [`database/functions/get_spots.sql`](database/functions/get_spots.sql) and [`database/functions/get_room_schedule.sql`](database/functions/get_room_schedule.sql).

3) Environment

Create `.env.local` with:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token
NEXT_PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/<user>/<style-id>
```

4) Run locally

```bash
npm run dev
```

Open http://localhost:3000.

### Optional: Data Pipeline

For collecting and loading source data, see [`data-pipeline/README.MD`](data-pipeline/README.MD) for Python setup, script order, and outputs (including the daily events job).

## License

MIT — see [`LICENSE`](LICENSE).
