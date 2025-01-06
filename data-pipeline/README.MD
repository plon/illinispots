# IlliniSpots Data Collection

This directory contains scripts for collecting and processing UIUC course and building data. The process is split into multiple stages to collect, transform, and load the data.

## Scripts & Data Flow

1. **one_shot_scraper.py**
   - Scrapes all course data from courses.illinois.edu
   - Output: `subjects.json`

2. **subject_to_buildings.py**
   - Transforms subject-sorted data into building-sorted data
   - Input: `subjects.json`
   - Output: `buildings.json`

3. **building_eligibility_filter.py**
   - Filters buildings based on criteria (minimum rooms, exclusion list)
   - Input: `buildings.json`
   - Output: `filtered_buildings.json`

4. **add_building_hours.py**
   - Adds operating hours to each building
   - Input: `filtered_buildings.json`, `building_hours.json`
   - Updates: `filtered_buildings.json`

5. **add_building_coordinates.py**
   - Adds geographical coordinates to each building
   - Input: `filtered_buildings.json`, `uiuc_buildings.geojson`
   - Updates: `filtered_buildings.json`

6. **load_to_postgres.py**
   - Loads the final data into PostgreSQL database
   - Input: `filtered_buildings.json`
   - Creates and populates database tables

7. **tableau_dailyevents_scraper.py**
   - Scrapes daily event data from [Tableau](https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents) and loads it into PostgreSQL
   - Updates the `daily_events` table with current day's events
   - **Note:** This script is intended to run as a cron job daily to keep the `daily_events` table up-to-date.

## Data Flow Diagram
```
Web Data → subjects.json → buildings.json → filtered_buildings.json
                                                        ↓
                                          [+ building hours & coordinates]
                                                        ↓
                                                  Database Load
                                                        ↓
                                          [+ daily events from Tableau]
                                                        ↓
                                                  Database Update
```

## Setup

1. Install required packages:
```bash
pip install curl-cffi==0.7.3 beautifulsoup4==4.12.3 supabase==1.0.4 python-dotenv==1.0.0 selenium==4.27.1 selenium-wire==5.1.0
```

2. Run the scripts in sequence:
```bash
python3 one_shot_scraper.py
python3 subject_to_buildings.py
python3 building_eligibility_filter.py
python3 add_building_hours.py
python3 add_building_coordinates.py
python3 load_to_postgres.py
```

## Building Filtering Criteria

- Minimum 7 rooms per building
- Certain buildings explicitly excluded (see [`building_eligibility_filter.py`](data-pipeline/building_eligibility_filter.py))

## Database Schema

- See [`tables.sql`](database/schema/tables.sql)

## Required Input Files

- `building_hours.json`: Building operating hours
- `uiuc_buildings.geojson`: Building coordinate data

## Output Files

- `subjects.json`: Raw course data organized by subject
- `buildings.json`: Data reorganized by building and room
- `filtered_buildings.json`: Final processed building data including hours and coordinates
