# IlliniSpots Data Collection

This directory contains scripts for collecting and processing UIUC course and building data. The process is split into multiple stages to collect, transform, and load the data.

## Scripts & Data Flow

1. **oneshotscraper.py**
   - Scrapes all course data from courses.illinois.edu (currently only scraping 2024 fall potB in person courses with fixed meeting location and times)
   - Output: `subject_data.json`

2. **subject_to_buildings.py**
   - Transforms subject-sorted data into building-sorted data
   - Input: `subject_data.json`
   - Output: `building_data.json`

3. **filterbuildings.py**
   - Filters buildings based on criteria (minimum rooms, exclusion list)
   - Input: `building_data.json`
   - Output: `filtered_buildings.json`

4. **addbuildinghours.py**
   - Adds operating hours to each building
   - Input: `filtered_buildings.json`, `buildinghours.json`
   - Updates: `filtered_buildings.json`

5. **addbuildingcoordinates.py**
   - Adds geographical coordinates to each building
   - Input: `filtered_buildings.json`, `uiuc_buildings.geojson`
   - Updates: `filtered_buildings.json`

6. **load_to_postgres.py**
   - Loads the final data into PostgreSQL database
   - Input: `filtered_buildings.json`
   - Creates and populates database tables

## Data Flow Diagram
```
Web Data → subject_data.json → building_data.json → filtered_buildings.json
                                                          ↓
                                            [+ building hours & coordinates]
                                                          ↓
                                                    Database Load
```

## Setup

1. Install required packages:
```bash
pip install curl-cffi==0.7.3 beautifulsoup4==4.12.3 supabase==1.0.4 python-dotenv==1.0.0
```

2. Run the scripts in sequence:
```bash
python3 oneshotscraper.py
python3 subject_to_buildings.py
python3 filterbuildings.py
python3 addbuildinghours.py
python3 addbuildingcoordinates.py
python3 load_to_postgres.py
```

## Building Filtering Criteria

- Minimum 7 rooms per building
- Certain buildings explicitly excluded (see filterbuildings.py)

## Database Schema

```sql
CREATE TABLE buildings (
    name TEXT PRIMARY KEY,
    latitude DECIMAL(10,8),
    longitude DECIMAL(10,8),
    monday_open TIME,
    monday_close TIME,
    ...
    sunday_open TIME,
    sunday_close TIME
);

CREATE TABLE rooms (
    building_name TEXT REFERENCES buildings(name),
    room_number TEXT,
    PRIMARY KEY (building_name, room_number)
);

CREATE TABLE class_schedule (
    building_name TEXT,
    room_number TEXT,
    course_code TEXT NOT NULL,
    course_title TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    day_of_week CHAR(1) NOT NULL,
    FOREIGN KEY (building_name, room_number) REFERENCES rooms(building_name, room_number)
);
```

## Required Input Files

- `buildinghours.json`: Building operating hours
- `uiuc_buildings.geojson`: Building coordinate data

## Output Files

- `subject_data.json`: Raw course data organized by subject
- `building_data.json`: Data reorganized by building and room
- `filtered_buildings.json`: Final processed building data including hours and coordinates
