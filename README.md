# IlliniSpots

IlliniSpots is a web application that helps UIUC students find available study spaces and classrooms across campus in real-time. The app shows building availability on an interactive map and provides detailed room status information.

## Features

- Interactive campus map showing buildings with available rooms
- Real-time room availability status
- Detailed information for each building including:
  - Number of available/occupied rooms
  - Current classes in session
  - Upcoming class schedules
  - Room availability times
- Responsive design for both desktop and mobile

## Technology Stack

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui (Radix UI components)
- MapLibre GL JS (with special thanks to [openfreemap](https://openfreemap.org/) and its creator [Zsolt Ero](https://x.com/hyperknot) for providing free map tiles)

### Backend
- Supabase (PostgreSQL database)
- Next.js API Routes
- PostgreSQL Functions (for `get_current_building_status`, defined in datacollection/get_current_building_status.pgsql)

## Core Algorithm

The application's availability logic is handled by a PostgreSQL function that processes building and room status through three main stages:

1. **State Detection**
- **How**: Uses a series of CTEs that join current time against class_schedule table
- **Implementation**: First maps day codes (M-U) to hours via CASE statements, then performs time window overlap with check_time
```
current time (3:15 PM) → finds active classes → determines if room occupied
Example: Room 101 has class 3:00-4:00 PM = occupied
```

2. **Gap Analysis**
- **How**: Recursive CTE traverses chronologically sorted class times
- **Implementation**: For each room:
    1. Starts at first available time
    2. Checks interval to next class
    3. If gap >= minimum_useful_minutes, marks as available period
    4. Repeats until finding valid gap or reaching building close
```
Example: 3:00-4:00, 5:00-6:00
Gap found: 4:00-5:00 (60min) = valid gap > minimum_useful_minutes
```

3. **Duration Calculation**
- **How**: Epoch time arithmetic between current_time and next constraint
- **Implementation**: Takes earliest of:
    - Next class start time
    - Building closure time
    - End of current gap
```
Example: Current 3:15, Next class 4:00
Duration = (4:00 - 3:15) = 45 minutes available
```

### Return structure
```json
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
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
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
