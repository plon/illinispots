# illiniSpots Data Collection

This directory contains scripts for collecting and processing UIUC course and building data. The process is split into multiple stages to collect, transform, and load the data.

## Scripts & Data Flow

1. **one_shot_scraper.py**

   - Scrapes all course data from courses.illinois.edu
   - Output: `subjects.json`
   - Proxy support: pass `--proxy`, `--proxy-http`, or `--proxy-https`
     - Example (single proxy for both): `python3 one_shot_scraper.py --proxy http://127.0.0.1:8080`
     - Example (SOCKS): `python3 one_shot_scraper.py --proxy socks5h://127.0.0.1:1080`
     - Example (per-scheme): `python3 one_shot_scraper.py --proxy-http http://proxy:8080 --proxy-https http://secure-proxy:8443`
   - Large proxy lists: pass `--proxy-file PATH_OR_URL` for rotation
     - Accepts a local path or an `http(s)://` URL (e.g., a raw GitHub URL)
     - File format: one proxy per line; supports `host:port`, `http://user:pass@host:port`, `socks5h://host:port`
     - Filter schemes: `--proxy-schemes http,socks5,socks5h,socks4` (default excludes `https` proxies, which often fail due to cert issues)
     - Allow insecure TLS (target): `--insecure` (use only if you understand the risks)
     - Try entire list per request: `--proxy-try-all`
     - Drop consistently failing proxies: `--max-proxy-failures 2`
     - Shuffle proxy order on load: `--proxy-shuffle`
     - Rotate every request: `python3 one_shot_scraper.py --proxy-file proxies.txt`
     - Rotate every N requests: `python3 one_shot_scraper.py --proxy-file proxies.txt --rotate-every 5`
     - Retry across proxies on failures: `--proxy-retries 5` (default 3)
     - Set per-request timeout: `--timeout 30`

2. **subject_to_buildings.py**

   - Transforms subject-sorted data into building-sorted data
   - Input: `subjects.json`
   - Output: `buildings_derived.json`

3. **filter_buildings.py**

   - Filters buildings based on criteria (minimum rooms, exclusion list)
   - Input: `buildings_derived.json`
   - Output: `buildings_filtered.json`

4. **add_building_hours.py**

   - Adds operating hours to each building
   - Input: `buildings_filtered.json`, `building_hours.json`
   - Updates: `buildings_filtered.json`

5. **add_building_coordinates.py**

   - Adds geographical coordinates to each building
   - Input: `buildings_filtered.json`, `uiuc_buildings.geojson`
   - Output: `buildings_enriched.json`

6. **load_to_postgres.py**

   - Loads the final data into PostgreSQL database
   - Input: `buildings_enriched.json`
   - Creates and populates database tables

7. **tableau_dailyevents_scraper.py**
   - Scrapes daily event data from [Tableau](https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents) and loads it into PostgreSQL
   - Updates the `daily_events` table with current day's events
   - **Note:** This script is intended to run as a cron job daily to keep the `daily_events` table up-to-date.

## Data Flow Diagram

```
Web Data → subjects.json → buildings_derived.json → buildings_filtered.json
                                                       ↓
                                         [+ building hours & coordinates]
                                                       ↓
                                          buildings_enriched.json
                                                       ↓
                                                 Database Load
                                                       ↓
                                         [+ daily events from Tableau]
                                                       ↓
                                                 Database Update
```

## Environment

- Python 3.11+
- Install dependencies: `pip install -r requirements.txt`
- `.env.local` with `SUPABASE_URL` and `SUPABASE_KEY` (needed for `load_to_postgres.py` and the Tableau cache refresh)

## Quick run

1) Scrape subjects → `subjects.json`  
`python3 one_shot_scraper.py`

2) Derive buildings → `buildings_derived.json`  
`python3 subject_to_buildings.py`

3) Filter buildings → `buildings_filtered.json`  
`python3 filter_buildings.py`

4) Add hours (in place) → `buildings_filtered.json`  
`python3 add_building_hours.py`

5) Add coordinates → `buildings_enriched.json` (canonical), also copied to `buildings.json` for convenience  
`python3 add_building_coordinates.py`

6) Load to Postgres (reads `buildings_enriched.json`)  
`python3 load_to_postgres.py`

## Building Filtering Criteria

- Minimum 5 rooms per building
- Certain buildings explicitly excluded (see [`filter_buildings.py`](filter_buildings.py))

## Database Schema

- See [`tables.sql`](database/schema/tables.sql)

## Required Input Files

- `building_hours.json`: Building operating hours
- `uiuc_buildings.geojson`: Building coordinate data

## Output Files

- `subjects.json`: Raw course data organized by subject
- `buildings_derived.json`: Data reorganized by building and room
- `buildings_filtered.json`: Filtered building data (exclusions/min rooms), also enriched with hours
- `buildings_enriched.json`: Final processed building data including hours and coordinates
