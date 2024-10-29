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

The `get_current_building_status` PostgreSQL function that efficiently determines room availability:

### Room Availability Logic

1. **Current Status Calculation**
   - A room is considered "occupied" if:
     - There is an ongoing class at check time
     - The next class starts within the minimum useful time window (default 30 min)
   - Otherwise, the room is marked as "available"

2. **Time Windows**
   - `availableAt`: When an occupied room becomes available (current class end time)
   - `availableUntil`: When an available room becomes occupied (next class start time or building closing time)

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

## Inspiration & Attribution

This project was inspired by [Spots](https://spots.aksharbarot.com/), created by [Akshar Barot](https://github.com/notAkki/spots). Spots provides a similar service for University of Waterloo students.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
