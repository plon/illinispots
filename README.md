# IlliniSpots

IlliniSpots is a web application that helps UIUC students find available study spaces and classrooms across campus in real-time. The app shows building availability on an interactive map and provides detailed room status information.

## Features

- Interactive campus map showing buildings with available rooms
- Real-time room availability status
- Detailed information for each building including:
  - Number of available/occupied rooms
  - Current classes in session
  - Upcoming class schedules
  - Room availability times and length
- Integration of updated daily events for a comprehensive and up-to-date view of room usage
- Library-specific features:
  - Real-time study room availability
  - Reservation slot visualization
  - Direct reservation links
  - Room images and details
- Responsive design for both desktop and mobile

## Tech Stack

### Frontend
- Next.js
- React (memo, hooks)
- TypeScript
- Tailwind CSS
- shadcn/ui
- MapLibre GL JS (with special thanks to [openfreemap](https://openfreemap.org/) and its creator [Zsolt Ero](https://x.com/hyperknot) for providing free map tiles)

### Backend
- Supabase (PostgreSQL database)
- Next.js API Routes
- PostgreSQL Functions (for `get_spots`)

## Data Source

All data used for calculating room availability is sourced from the University of Illinois at Urbana-Champaign's official resources:

- **Class Data**: Sourced from the [Course Explorer](https://courses.illinois.edu/). This includes  information about when classes meet, which is used to determine room occupancy. For more details on the data collection process, please refer to the [data-pipeline README](data-pipeline/README.MD).
- **Building Hours**: Sourced from the [Facility Scheduling and Resources](https://operations.illinois.edu/facility-scheduling-and-resources/daily-event-summaries/).
- **Library Data**: Sourced from UIUC Library's [Room Reservation System](https://uiuc.libcal.com/allspaces).
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

### Return structure
```
{
    "timestamp": "2024-10-29T14:30:00Z",
    "buildings": {
        "David Kinley Hall": {
            "name": "David Kinley Hall",
            "coordinates": {
                "latitude": 40.10361941,
                "longitude": -88.22835896
            },
            "hours": {
                "open": "07:00:00",
                "close": "23:59:00"
            },
            "isOpen": true,
            "roomCounts": {
                "available": 15,
                "total": 28
            },
            "rooms": {
                "106": {
                    "status": "occupied" | "available",
                    "available": false,
                    "currentClass": {
                        "course": "PS 318",
                        "title": "Interests Grps & Soc Movements",
                        "time": {
                            "start": "11:00:00",
                            "end": "12:20:00"
                        }
                    },
                    "nextClass": {
                        // same structure as currentClass
                    },
                    "passingPeriod": false,
                    "availableAt": "15:30",
                    "availableFor": 60,      // minutes
                    "availableUntil": "16:30"
                }
                // ... more rooms
            }
        }
        // ... more buildings
    }
}
```

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
