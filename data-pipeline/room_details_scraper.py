"""Scrape General Assignment classroom details from the Registrar and Tech Services.

Registrar source: https://registrar.illinois.edu/faculty-staff/course-catalog-and-scheduling/classroom-capacities/
TablePress table `tablepress-60` with columns:
  Building Name | Building Code | Room Number | Room Capacity | Room Type

Tech Services source: https://answers.uillinois.edu/illinois/57128
(Technology Enhanced Classrooms, Building List) -> per-building room lists ->
per-room pages with an "Equipment in this ..." list and room photos. Equipment enriches the Registrar rows it matches.

Output: `data/room_details.json` with one row per physical room, plus an
upsert into the `room_details` Supabase table when credentials are present.

Registrar building names differ slightly from Course Explorer canonical names
(e.g. "Siebel Center for Computer Science" vs "Siebel Center for Comp Sci"),
so known mappings are applied and both names are stored. Combined labels like
"0027/1025" denote a single physical room and are kept verbatim.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from cron.utils.buildingnames import alias_map
from curl_cffi import requests
from dotenv import find_dotenv, load_dotenv

try:
    from sentry_monitor import emit_gauges
except ImportError:  # allow running without the monitor helper

    def emit_gauges(values, attributes):  # type: ignore[no-redef]
        print(f"Skipping Sentry gauges (sentry_monitor unavailable): {values}")


SOURCE_URL = "https://registrar.illinois.edu/faculty-staff/course-catalog-and-scheduling/classroom-capacities/"
TABLE_ID = "tablepress-60"

ANSWERS_BASE = "https://answers.uillinois.edu/illinois/"
ANSWERS_BUILDING_LIST_URL = urljoin(ANSWERS_BASE, "57128")

REQUEST_ATTEMPTS = 5
REQUEST_TIMEOUT = 60
RETRY_BACKOFF_SECONDS = 5
RETRY_MAX_BACKOFF_SECONDS = 120

ANSWERS_REQUEST_ATTEMPTS = 3
MAX_PHOTO_URLS = 6

DATA_DIR = Path(__file__).parent / "data"
DEFAULT_OUTPUT = DATA_DIR / "room_details.json"

# Registrar building name -> Course Explorer canonical name (building_hours.json keys).
# Unmapped names fall back to the Registrar name verbatim.
REGISTRAR_TO_COURSE_EXPLORER = {
    "Henry Administration Building": "Henry Administration Bldg",
    "Literatures, Cultures & Linguistics Building": "Literatures, Cultures, & Ling",
    "Loomis Laboratory of Physics": "Loomis Laboratory",
    "Materials Science & Engineering Building": "Materials Science & Eng Bld",
    "School of Information Sciences Building": "Sch of Info Sciences Bldg",
    "Sidney Lu Mechanical Engineering Building": "Sidney Lu Mech Engr Bldg",
    "Siebel Center for Computer Science": "Siebel Center for Comp Sci",
}

# Extra Answers.uillinois.edu building labels -> Course Explorer names, applied
# after stripping parenthetical suffixes like " (DCL)". Lookup is
# case-insensitive; anything unmapped falls back to the stripped label.
ANSWERS_TO_COURSE_EXPLORER = {
    "digital computer lab": "Digital Computer Laboratory",
    "literature, cultures, and linguistics building": "Literatures, Cultures, & Ling",
    "main library": "Library",
    "noyes laboratory of chemistry": "Noyes Laboratory",
}

# Answers usually includes the campus building acronym in parentheses. Prefer
# that stable identifier over display-name matching, with only genuine source
# disagreements represented here.
ANSWERS_BUILDING_CODE_ALIASES = {
    "SHSB": "SHS",
}

# A small number of Answers room labels use a descriptive or facilities-system
# identifier instead of the Registrar's room number.
ANSWERS_ROOM_NUMBER_ALIASES = {
    ("FA", "AUDITORIUM"): "AUD",
    ("LH", "1053"): "THEAT",
}

_BUILDING_LOOKUP = {
    key.lower(): value
    for key, value in {
        **alias_map,
        **REGISTRAR_TO_COURSE_EXPLORER,
        **ANSWERS_TO_COURSE_EXPLORER,
    }.items()
}

_PAREN_SUFFIX = re.compile(r"\s*\(([^)]*)\)\s*$")
_TRAILING_ROOM = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9-]*(?:\s*/\s*[A-Za-z0-9][A-Za-z0-9-]*)*)\s*$"
)
_TECH_CLASSROOM_PREFIX = "technology enhanced classrooms,"


def map_building_name(raw_label: str) -> str:
    """Map a Registrar/Answers building label to the Course Explorer name."""
    cleaned = _PAREN_SUFFIX.sub("", html.unescape(raw_label)).strip()
    return _BUILDING_LOOKUP.get(cleaned.lower(), cleaned)


def normalize_building_code(raw_code: str) -> str:
    """Normalize Registrar codes such as `1MSEB` to Answers' `MSEB`."""
    return re.sub(r"^\d+", "", raw_code).upper()


def answers_building_code(raw_label: str) -> str | None:
    """Extract and normalize an Answers building acronym when one is present."""
    match = _PAREN_SUFFIX.search(html.unescape(raw_label))
    if match is None:
        return None
    code = match.group(1).strip().upper()
    return ANSWERS_BUILDING_CODE_ALIASES.get(code, code)


def normalize_room_number(raw_room: str) -> str:
    """Normalize source formatting while preserving the room's identity."""
    return re.sub(r"[\s-]+", "", raw_room).upper()


def parse_answers_room_number(raw_label: str) -> str | None:
    """Return a room number only for Technology Enhanced Classroom documents."""
    label = html.unescape(raw_label).strip()
    if not label.lower().startswith(_TECH_CLASSROOM_PREFIX):
        return None
    label = _PAREN_SUFFIX.sub("", label).strip()
    match = _TRAILING_ROOM.search(label)
    return match.group(1).strip() if match else None


@dataclass
class RoomIndex:
    """Resolve Answers rooms to Registrar rows without joining on display text."""

    by_name: dict[tuple[str, str], dict]
    by_code: dict[tuple[str, str], dict]
    code_by_name: dict[str, str]

    @classmethod
    def from_rooms(cls, rooms: list[dict]) -> RoomIndex:
        by_name: dict[tuple[str, str], dict] = {}
        by_code: dict[tuple[str, str], dict] = {}
        code_by_name: dict[str, str] = {}
        for room in rooms:
            building_name = room["building_name"]
            building_code = normalize_building_code(room["building_code"])
            room_number = normalize_room_number(room["room_number"])
            by_name[(building_name, room_number)] = room
            by_code[(building_code, room_number)] = room
            code_by_name[building_name] = building_code
        return cls(by_name=by_name, by_code=by_code, code_by_name=code_by_name)

    def resolve(self, building_label: str, room_label: str) -> dict | None:
        building_name = map_building_name(building_label)
        building_code = answers_building_code(building_label)
        if building_code is None:
            building_code = self.code_by_name.get(building_name)

        room_number = normalize_room_number(room_label)
        if building_code is not None:
            room_number = ANSWERS_ROOM_NUMBER_ALIASES.get(
                (building_code, room_number), room_number
            )
            room = self.by_code.get((building_code, room_number))
            if room is not None:
                return room
        return self.by_name.get((building_name, room_number))


def fetch_url(url: str, label: str, attempts: int = REQUEST_ATTEMPTS) -> str:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(
                url,
                impersonate="chrome",
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            return response.text
        except Exception as exc:  # noqa: BLE001 - retry transient network errors
            last_error = exc
            if attempt == attempts:
                break
            delay = min(
                RETRY_BACKOFF_SECONDS * (2 ** (attempt - 1)),
                RETRY_MAX_BACKOFF_SECONDS,
            )
            sleep_for = random.uniform(delay / 2, delay)
            print(
                f"{label} request failed (attempt {attempt}/{attempts}): "
                f"{exc}. Retrying in {sleep_for:.0f}s"
            )
            time.sleep(sleep_for)
    raise RuntimeError(
        f"Unable to fetch {label} after {attempts} attempts"
    ) from last_error


def fetch_registrar_html() -> str:
    return fetch_url(SOURCE_URL, "Registrar")


def parse_registrar_html(html_text: str) -> list[dict]:
    """Parse the TablePress capacities table into normalized room rows."""
    soup = BeautifulSoup(html_text, "html.parser")
    table = soup.find("table", id=TABLE_ID)
    if table is None:
        raise ValueError(f"Could not find table #{TABLE_ID} on Registrar page")

    body = table.find("tbody") or table
    rooms: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for row in body.find_all("tr"):
        cols = row.find_all("td")
        if len(cols) < 5:
            continue
        registrar_building = html.unescape(cols[0].get_text(" ", strip=True))
        building_code = html.unescape(cols[1].get_text(" ", strip=True))
        raw_room = html.unescape(cols[2].get_text(" ", strip=True))
        raw_capacity = html.unescape(cols[3].get_text(" ", strip=True))
        room_type = html.unescape(cols[4].get_text(" ", strip=True))

        if not registrar_building or not raw_room:
            continue
        try:
            capacity = int(raw_capacity.replace(",", ""))
        except ValueError:
            print(f"Skipping row with non-numeric capacity: {raw_room}={raw_capacity!r}")
            continue

        building_name = map_building_name(registrar_building)
        # Combined labels (e.g. "0027/1025") denote a single physical room.
        room_number = raw_room.strip()
        key = (building_name, room_number)
        if key in seen:
            continue
        seen.add(key)
        rooms.append(
            {
                "building_name": building_name,
                "registrar_building": registrar_building,
                "building_code": building_code,
                "room_number": room_number,
                "capacity": capacity,
                "room_type": room_type,
                "equipment": [],
                "photo_urls": [],
                "answers_url": None,
            }
        )

    if not rooms:
        raise ValueError("Registrar scrape produced no rooms; refusing to replace data")
    return rooms


def parse_answers_building_list(html_text: str) -> list[tuple[str, str]]:
    """Parse doc 57128 into (building label, absolute building URL) pairs."""
    soup = BeautifulSoup(html_text, "html.parser")
    body = soup.select_one("div.doc-body") or soup
    buildings: list[tuple[str, str]] = []
    seen: set[str] = set()
    for link in body.find_all("a", href=True):
        href = str(link["href"]).strip()
        if not re.fullmatch(r"\d+", href):
            continue
        url = urljoin(ANSWERS_BASE, href)
        if url in seen:
            continue
        seen.add(url)
        label = html.unescape(link.get_text(" ", strip=True))
        if label:
            buildings.append((label, url))
    if not buildings:
        raise ValueError("Answers building list produced no buildings")
    return buildings


def parse_answers_building_page(html_text: str) -> list[tuple[str, str]]:
    """Parse a building room list into (room label, absolute room URL) pairs."""
    soup = BeautifulSoup(html_text, "html.parser")
    body = soup.select_one("div.doc-body") or soup
    rooms: list[tuple[str, str]] = []
    seen: set[str] = set()
    for link in body.find_all("a", href=True):
        href = str(link["href"]).strip()
        match = re.search(r"page\.php\?id=(\d+)", href)
        if not match:
            continue
        label = html.unescape(link.get_text(" ", strip=True))
        if parse_answers_room_number(label) is None:
            continue
        url = urljoin(ANSWERS_BASE, f"page.php?id={match.group(1)}")
        if url in seen:
            continue
        seen.add(url)
        rooms.append((label, url))
    return rooms


def parse_answers_room_page(html_text: str, page_url: str) -> dict:
    """Extract equipment and photos from a room page."""
    soup = BeautifulSoup(html_text, "html.parser")
    body = soup.select_one("div.doc-body") or soup

    equipment_heading = None
    for heading in body.find_all(["h2", "h3"]):
        if "equipment in this" in heading.get_text(" ", strip=True).lower():
            equipment_heading = heading
            break
    if equipment_heading is None:
        raise ValueError(f"Could not find an equipment list on {page_url}")

    equipment: list[str] = []
    for candidate in equipment_heading.find_all_next(
        ["li", "p", "div", "h2", "h3"]
    ):
        if candidate.name in {"h2", "h3"}:
            break
        text = html.unescape(candidate.get_text(" ", strip=True))
        if candidate.name in {"p", "div"}:
            if candidate.find(["li", "p", "div"], recursive=False) is not None:
                continue
            if not text.startswith("•"):
                continue
            text = text.removeprefix("•").strip()
        if text:
            equipment.append(text)
    if not equipment:
        raise ValueError(f"Could not find an equipment list on {page_url}")

    photo_urls: list[str] = []
    for figure in body.find_all("figure", class_="roomphoto"):
        if len(photo_urls) >= MAX_PHOTO_URLS:
            break
        image = figure.find("img", src=True)
        if image is None:
            continue
        url = urljoin(page_url, str(image["src"]))
        if url not in photo_urls:
            photo_urls.append(url)

    return {
        "equipment": equipment,
        "photo_urls": photo_urls,
    }


def scrape_answers_details(
    rooms: list[dict],
    request_delay: float,
) -> dict:
    """Crawl the Answers building/room pages and enrich matching Registrar rows."""
    room_index = RoomIndex.from_rooms(rooms)
    stats = {
        "buildings": 0,
        "room_pages": 0,
        "enriched": 0,
        "unmatched": 0,
        "unmatched_sample": [],
        "failed_buildings": 0,
        "failed_rooms": 0,
        "failure_sample": [],
    }

    building_entries = parse_answers_building_list(
        fetch_url(ANSWERS_BUILDING_LIST_URL, "Answers building list")
    )
    stats["buildings"] = len(building_entries)
    print(f"Found {len(building_entries)} Answers buildings")
    time.sleep(request_delay)

    for building_label, building_url in building_entries:
        try:
            room_entries = parse_answers_building_page(
                fetch_url(
                    building_url,
                    f"Answers building {building_label}",
                    attempts=ANSWERS_REQUEST_ATTEMPTS,
                )
            )
        except (RuntimeError, ValueError) as exc:
            print(f"Skipping Answers building {building_label}: {exc}")
            stats["failed_buildings"] += 1
            if len(stats["failure_sample"]) < 10:
                stats["failure_sample"].append(building_label)
            continue
        finally:
            time.sleep(request_delay)

        building_name = map_building_name(building_label)
        for room_label, room_url in room_entries:
            room_number = parse_answers_room_number(room_label)
            if room_number is None:
                continue
            room = room_index.resolve(building_label, room_number)
            if room is None:
                stats["unmatched"] += 1
                if len(stats["unmatched_sample"]) < 10:
                    stats["unmatched_sample"].append(
                        f"{building_name} {room_number}"
                    )
                continue
            try:
                details = parse_answers_room_page(
                    fetch_url(
                        room_url,
                        f"Answers room {room_label}",
                        attempts=ANSWERS_REQUEST_ATTEMPTS,
                    ),
                    room_url,
                )
            except (RuntimeError, ValueError) as exc:
                print(f"Skipping Answers room {room_label}: {exc}")
                stats["failed_rooms"] += 1
                if len(stats["failure_sample"]) < 10:
                    stats["failure_sample"].append(room_label)
                continue
            finally:
                time.sleep(request_delay)

            stats["room_pages"] += 1
            stats["enriched"] += 1
            room["equipment"] = details["equipment"]
            room["photo_urls"] = details["photo_urls"]
            room["answers_url"] = room_url

    print(
        f"Answers crawl: {stats['room_pages']} room pages, "
        f"{stats['enriched']} Registrar rows enriched, "
        f"{stats['unmatched']} unmatched, "
        f"{stats['failed_buildings']} building failures, "
        f"{stats['failed_rooms']} room failures"
    )
    return stats


def write_json_output(
    rooms: list[dict], output_path: Path, answers_stats: dict | None = None
) -> dict:
    payload = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "source_url": SOURCE_URL,
        "answers_source_url": ANSWERS_BUILDING_LIST_URL,
        "rooms": rooms,
    }
    if answers_stats is not None:
        payload["answers_stats"] = answers_stats
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as output_file:
        json.dump(payload, output_file, indent=2)
    print(f"Wrote {len(rooms)} rooms to {output_path}")
    return payload


def write_github_summary(
    total_rooms: int,
    mapped_rooms: int,
    enriched_rooms: int,
    answers_stats: dict | None,
    output_path: Path,
) -> None:
    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    with open(summary_path, "a") as summary:
        summary.write("\n## Room details\n\n")
        summary.write(
            f"✅ Scraped {total_rooms} room(s) from the Registrar "
            f"({mapped_rooms} mapped to Course Explorer names, "
            f"{enriched_rooms} enriched with Tech Services equipment).\n\n"
        )
        summary.write(f"Source: {SOURCE_URL}\n")
        summary.write(f"Equipment source: {ANSWERS_BUILDING_LIST_URL}\n")
        summary.write(f"Output: `{output_path}`\n")
        if answers_stats and answers_stats.get("unmatched_sample"):
            sample = ", ".join(f"`{item}`" for item in answers_stats["unmatched_sample"])
            summary.write(
                f"\n⚠️ {answers_stats['unmatched']} Answers room(s) had no "
                f"Registrar match (e.g. {sample}).\n"
            )


def validate_answers_for_load(answers_stats: dict | None) -> None:
    """Refuse to publish empty enrichment when the Answers crawl was incomplete."""
    if answers_stats is None:
        raise RuntimeError(
            "Refusing to load without Answers enrichment; use --no-load with "
            "--skip-answers"
        )
    failed_buildings = answers_stats.get("failed_buildings", 0)
    failed_rooms = answers_stats.get("failed_rooms", 0)
    if failed_buildings or failed_rooms:
        raise RuntimeError(
            "Refusing to load an incomplete Answers crawl "
            f"({failed_buildings} building failure(s), {failed_rooms} room failure(s))"
        )


def load_to_postgres(rooms: list[dict], answers_stats: dict | None) -> int:
    """Upsert room details. Returns row count, or -1 when credentials are absent."""
    load_dotenv(find_dotenv(".env.local"))
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SECRET_KEY")
    if not supabase_url or not supabase_key:
        print("SUPABASE_URL / SUPABASE_SECRET_KEY not set; skipping database load")
        return -1
    validate_answers_for_load(answers_stats)

    from supabase import create_client

    supabase = create_client(supabase_url, supabase_key)
    # Set explicitly (rather than relying on the column default) so repeat
    # upserts refresh the timestamp instead of leaving the first-seen value.
    updated_at = datetime.now(timezone.utc).isoformat()
    records = [
        {
            "building_name": room["building_name"],
            "room_number": room["room_number"],
            "registrar_building": room["registrar_building"],
            "building_code": room["building_code"],
            "capacity": room["capacity"],
            "room_type": room["room_type"],
            "updated_at": updated_at,
            "equipment": room.get("equipment") or [],
            "photo_urls": room.get("photo_urls") or [],
            "answers_url": room.get("answers_url"),
        }
        for room in rooms
    ]

    chunk_size = 500
    for index in range(0, len(records), chunk_size):
        chunk = records[index : index + chunk_size]
        chunk_num = index // chunk_size + 1
        total_chunks = (len(records) + chunk_size - 1) // chunk_size
        supabase.table("room_details").upsert(chunk).execute()
        print(f"Upserted chunk {chunk_num}/{total_chunks} into room_details")

    count = supabase.table("room_details").select("*", count="exact").execute().count
    print(f"room_details table now holds {count} row(s)")
    return count if count is not None else len(records)


def main() -> str:
    parser = argparse.ArgumentParser(description="Scrape Registrar room details")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Where to write room_details.json",
    )
    parser.add_argument(
        "--no-load",
        action="store_true",
        help="Write JSON only; skip the Supabase upsert",
    )
    parser.add_argument(
        "--html-file",
        type=Path,
        default=None,
        help="Parse a saved HTML file instead of fetching (for debugging)",
    )
    parser.add_argument(
        "--skip-answers",
        action="store_true",
        help="Skip Answers for Registrar-only JSON (requires --no-load)",
    )
    parser.add_argument(
        "--answers-delay",
        type=float,
        default=0.4,
        help="Delay in seconds between Answers requests (default: 0.4)",
    )
    args = parser.parse_args()
    if args.skip_answers and not args.no_load:
        parser.error("--skip-answers requires --no-load to preserve stored enrichment")

    print("Step 1: Fetch Registrar classroom capacities")
    if args.html_file:
        html_text = args.html_file.read_text()
    else:
        html_text = fetch_registrar_html()
    rooms = parse_registrar_html(html_text)
    print(f"Finished Step 1: {len(rooms)} rooms parsed")

    answers_stats: dict | None = None
    if not args.skip_answers:
        print("Step 2: Crawl Answers equipment pages")
        answers_stats = scrape_answers_details(rooms, args.answers_delay)
        print("Finished Step 2")
    else:
        print("Step 2 skipped (--skip-answers)")

    print("Step 3: Write JSON output")
    write_json_output(rooms, args.output, answers_stats)
    print("Finished Step 3")

    db_count = -1
    if not args.no_load:
        print("Step 4: Load data to PostgreSQL")
        db_count = load_to_postgres(rooms, answers_stats)
        print("Finished Step 4")
    else:
        print("Step 4 skipped (--no-load)")

    mapped_rooms = sum(
        1 for room in rooms if room["building_name"] != room["registrar_building"]
    )
    enriched_rooms = sum(1 for room in rooms if room.get("answers_url"))
    write_github_summary(
        len(rooms), mapped_rooms, enriched_rooms, answers_stats, args.output
    )
    emit_gauges(
        {
            "pipeline.data.room_detail_rows": len(rooms),
            "pipeline.data.room_detail_mapped_rows": mapped_rooms,
            "pipeline.data.room_detail_enriched_rows": enriched_rooms,
            "pipeline.data.answers_room_pages": (answers_stats or {}).get("room_pages", 0),
            "pipeline.data.answers_unmatched_rooms": (answers_stats or {}).get(
                "unmatched", 0
            ),
            "pipeline.database.room_details": db_count,
        },
        {"pipeline": "room-details"},
    )

    print("Job complete!")
    return "Updated room details"


if __name__ == "__main__":
    main()
