# illiniSpots

illiniSpots is a web application that helps UIUC students find available study spaces and classrooms across campus in real-time. The app shows building availability on an interactive map and provides detailed room status information.

## Features (how would i udpate this?)

- **Interactive Map & List View:** Visualize building availability across campus or browse a searchable list.
- **Real-Time & Future Availability:** Check room status for the current moment or use the **Date/Time Selector** to view availability for _any_ point in the past or future.
- **Comprehensive Room Coverage:** Includes Academic Classrooms and reservable Library Study Rooms (Grainger, Funk ACES, Main Library).
- **Accurate Availability:**
  - Considers official **Class Schedules**.
  - Integrates **Live University Event Data** for a more accurate picture of actual room usage.
- **Detailed Room Information:**
  - **Academic Rooms:** See current/next class or event, availability duration, and view the **Full Daily Schedule** (classes + events) for the selected date.
  - **Library Rooms:** View reservation timelines, direct reservation links, and room photos (where available).
- **Progressive Web App (PWA):** Installable on your phone's home screen for easy access.
- **Search/Filter:** Find a specific building or library by typing its name into the search bar.
- **Responsive Design:** Works seamlessly on desktop and mobile devices.

## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- MapLibre GL JS (with special thanks to [openfreemap](https://openfreemap.org/) and its creator [Zsolt Ero](https://x.com/hyperknot) for providing free map tiles)

### Backend

- Supabase (PostgreSQL database)
- Next.js API Routes
- PostgreSQL Functions (for `get_spots`, `get_room_schedule`)

## Data Source

All data used for calculating room availability is sourced from the University of Illinois at Urbana-Champaign's official resources:

- **Class Data**: Sourced from the [Course Explorer](https://courses.illinois.edu/). This includes information about when classes meet, which is used to determine room occupancy. For more details on the data collection process, please refer to the [data-pipeline README](data-pipeline/README.MD).
- **Building Hours**: Sourced from the [Facility Scheduling and Resources](https://operations.illinois.edu/facility-scheduling-and-resources/daily-event-summaries/).
- **Library Data**: Sourced from UIUC Library's [Room Reservation System](https://uiuc.libcal.com/allspaces).

To provide availability information that is more accurate than static class schedules alone, illiniSpots incorporates data for other university-booked events. This data is fetched and updated periodically.

- **Daily Events**: Sourced from the [Tableau Daily Event Summary](https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents).

## Core Algorithm

### [get_spots.sql](database/functions/get_spots.sql)

The availability logic is handled by a PostgreSQL function that processes building and room status through three main stages:

1. **State Detection**

- **How**: Uses a series of CTEs that join current time against class_schedule and daily_events tables
- **Implementation**: First extracts day code (M-U) from input date, maps to hours via CASE statements, then performs time window overlap with check_time and date range validation

```
input (2024-01-23 3:15 PM) →
    1. converts to day 'W'
    2. checks if date falls within class date ranges
    3. finds active classes/events → determines if room occupied
Example: Room 101 has class 3:00-4:00 PM on Wednesdays in Spring 2024 part of term B = unoccupied
```

2. **Gap Analysis**

- **How**: Recursive CTE traverses chronologically sorted class/event times
- **Implementation**: For each room:
  1. Starts at first available time
  2. Checks interval to next class/event
  3. If gap >= minimum_useful_minutes (configured at 30), marks as available period
  4. Repeats until finding valid gap or reaching building close

```
Example: 3:00-4:00, 5:00-6:00
Gap found: 4:00-5:00 (60min) = valid gap > minimum_useful_minutes
```

3. **Duration Calculation**

- **How**: Epoch time arithmetic between check_time and next constraint
- **Implementation**: Takes earliest of:
  - Next class/event start time
  - Building closure time
  - End of current gap

```
Example: Current 3:15, Next class 4:00
Duration = (4:00 - 3:15) = 45 minutes available
```

### [get_room_schedule.sql](database/functions/get_room_schedule.sql)

This function retrieves the raw chronological schedule for a _single specified academic room_ on a given date, including both classes and booked events.

- **Purpose**: To provide the front-end with all known scheduled occupancies for a specific room and day.
- **Data Sources**: Queries `class_schedule` and the periodically updated `daily_events` tables.
- **Output**: Returns an ordered array of schedule blocks, each containing start/end times, status (`class` or `event`), and details (course/event info).
- **Usage**: This raw data is fetched by the `/api/room-schedule` endpoint, which then processes it for display in the detailed room view (e.g., calculating availability gaps).

## Library Availability System

The library availability system operates through a three-stage pipeline handling UIUC's LibCal reservation data:

1. **Room Data Extraction**

- Scrapes LibCal's client-side JavaScript resource declarations using regex pattern matching
- Extracts embedded room metadata including IDs, capacities, and asset URLs
- Maps rooms to their parent libraries using facility IDs

2. **Reservation Status Collection**

- Sends concurrent POST requests to LibCal's availability grid endpoint for each library
- Special case for Funk ACES (room reservation closes at 2 AM): Retrieves 48hr window vs standard 24hr
- Accumulates slot data chronologically with booking status flags

3. **Availability Processing**

- Links room metadata with current reservation states
- Calculates real-time metrics per room:
  - Current occupancy status
  - Time until next available slot
  - Duration of current available period
  - Chronological sequence of free/busy periods
- Aggregates library-level statistics (total rooms, currently available)

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:

```bash
git clone https://github.com/plon/illinispots
```

2. Install dependencies:

```bash
cd illinispots
npm install
```

3. Set up environment variables:
   Create a `.env.local` file with the following:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Important Notes

- Building/room access may be restricted to specific colleges or departments
- Displayed availability only reflects official class schedules
- Rooms may be occupied by unofficial meetings or study groups
- Different schedules may apply during exam periods

## Inspiration

This project was inspired by [Spots](https://spots.aksharbarot.com/), a similar service for University of Waterloo students.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
