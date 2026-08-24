import json
import re
import signal
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup, SoupStrainer
from course_explorer_client import CourseExplorerClient
from pipeline_io import write_json_snapshot

VALID_TERMS = {'spring', 'summer', 'fall', 'winter'}
TERM_TABLE_ONLY = SoupStrainer(id="schedule-term-table")
SUBJECT_TABLE_ONLY = SoupStrainer(id="schedule-subject-table")
COURSE_TABLE_ONLY = SoupStrainer(id="schedule-course-table")

# Global flag for graceful shutdown
_shutdown_requested = False

def _signal_handler(signum, frame):
    global _shutdown_requested
    _shutdown_requested = True
    print("\n[Shutdown requested, finishing current operation...]")

signal.signal(signal.SIGINT, _signal_handler)

@dataclass
class TimeSlot:
    start: str  # e.g. "09:30"
    end: str    # e.g. "10:50"

@dataclass
class Location:
    building: str  # e.g. "Siebel Center"
    room: str     # e.g. "1404"

@dataclass
class Section:
    time: TimeSlot
    location: Location
    days: List[str]  # e.g. ["M", "W", "F"]
    start_date: str # e.g. "2024-01-15"
    end_date: str # e.g. "2024-05-10"

@dataclass
class Course:
    number: str  # e.g. "CS 173"
    title: str   # e.g. "Discrete Structures"
    sections: List[Section] = field(default_factory=list)

@dataclass
class Subject:
    code: str # e.g. "CS"
    name: str # e.g. "Computer Science"
    courses: List[Course] = field(default_factory=list)


@dataclass(frozen=True)
class ScrapeOptions:
    year: Optional[int] = None
    term: Optional[str] = None
    verbose: bool = False
    proxy: Optional[str] = None
    proxy_http: Optional[str] = None
    proxy_https: Optional[str] = None
    proxy_file: Optional[str] = None
    rotate_every: int = 1
    proxy_retries: int = 3
    request_timeout: int = 30
    request_delay: float = 0
    proxy_schemes: Optional[List[str]] = None
    insecure: bool = False
    proxy_try_all: bool = False
    max_proxy_failures: int = 2
    proxy_shuffle: bool = False
    skip_errors: bool = True
    resume: bool = True
    fresh: bool = False
    request_workers: int = 4


def scrape_subjects(html_content) -> List[Subject]:
    soup = BeautifulSoup(
        html_content, "html.parser", parse_only=TERM_TABLE_ONLY
    )
    subjects = []

    rows = soup.find_all('tr')

    for row in rows:
        cols = row.find_all('td')
        if len(cols) >= 2:  # Ensure we have both code and name
            code = cols[0].text.strip()
            name = cols[1].text.strip()
            if code and name:
                subjects.append(Subject(code=code, name=name))

    return subjects


def resolve_active_schedule(
    calendar_path: Optional[Path] = None,
    current_date: Optional[date] = None,
) -> tuple[int, str]:
    """Resolve the active UIUC term from the local academic calendar."""
    if calendar_path is None:
        calendar_path = Path(__file__).parent / "data" / "academic_calendar.json"
    if current_date is None:
        current_date = datetime.now(ZoneInfo("America/Chicago")).date()

    with open(calendar_path, "r") as calendar_file:
        calendar_entries = json.load(calendar_file)

    term_ranges = {}
    for entry in calendar_entries:
        term = entry["term"].lower()
        if term not in VALID_TERMS:
            continue

        key = (entry["academic_year"], term)
        start_date = date.fromisoformat(entry["start_date"])
        end_date = date.fromisoformat(entry["end_date"])

        if key not in term_ranges:
            term_ranges[key] = [start_date, end_date]
        else:
            term_ranges[key][0] = min(term_ranges[key][0], start_date)
            term_ranges[key][1] = max(term_ranges[key][1], end_date)

    active_terms = [
        (start_date, end_date, term)
        for (_, term), (start_date, end_date) in term_ranges.items()
        if start_date <= current_date <= end_date
    ]
    if active_terms:
        start_date, _, term = max(active_terms, key=lambda item: item[0])
        return start_date.year, term

    upcoming_terms = [
        (start_date, term)
        for (_, term), (start_date, _) in term_ranges.items()
        if start_date > current_date
    ]
    if upcoming_terms:
        start_date, term = min(upcoming_terms, key=lambda item: item[0])
        return start_date.year, term

    raise ValueError(f"No active or upcoming term found for {current_date}")

def scrape_courses(html_content) -> List[Course]:
    soup = BeautifulSoup(
        html_content, "html.parser", parse_only=SUBJECT_TABLE_ONLY
    )
    courses = []

    rows = soup.find_all('tr')

    for row in rows:
        cols = row.find_all('td')
        if len(cols) >= 2:  # Ensure we have both number and title
            number = cols[0].text.strip()
            title = cols[1].text.strip()
            if number and title:
                courses.append(Course(number=number, title=title))

    return courses

def parse_days(day_str: str) -> List[str]:
    if day_str.lower() in ['n.a.', 'arranged', '']:
        return []

    valid_days = {'M', 'T', 'W', 'R', 'F', 'S', 'U'}
    return [char for char in day_str if char in valid_days]

def parse_location(location_str: str) -> Location:
    """Split location into room and building
    Example: "3039 Campus Instructional Facility" -> room="3039", building="Campus Instructional Facility"
    """
    room, building = location_str.split(' ', 1)
    return Location(room=room, building=building)

def parse_time(time_str: str) -> TimeSlot:
    """Convert a Course Explorer time range to 24-hour format."""
    match = re.fullmatch(
        r"\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*"
        r"(\d{1,2}:\d{2}\s*(?:AM|PM))\s*",
        time_str,
        re.IGNORECASE,
    )
    if not match:
        raise ValueError(f"Invalid time range: {time_str}")

    start, end = (value.replace(" ", "").upper() for value in match.groups())
    start_24 = datetime.strptime(start, '%I:%M%p').strftime('%H:%M')
    end_24 = datetime.strptime(end, '%I:%M%p').strftime('%H:%M')

    return TimeSlot(start=start_24, end=end_24)


def _meeting_values(cell) -> List[str]:
    meetings = [
        meeting.get_text(" ", strip=True)
        for meeting in cell.select(".app-meeting")
    ]
    if meetings:
        return meetings

    value = cell.get_text(" ", strip=True)
    return [value] if value else []


def _section_date_range(details_cell) -> Optional[tuple[str, str]]:
    for label in details_cell.find_all("dt"):
        if label.get_text(" ", strip=True).rstrip(":").lower() != "date range":
            continue

        value = label.find_next_sibling("dd")
        if value is None:
            return None

        match = re.fullmatch(
            r"\s*(\d{2}/\d{2}/(?:\d{2}|\d{4}))\s*-\s*"
            r"(\d{2}/\d{2}/(?:\d{2}|\d{4}))\s*",
            value.get_text(" ", strip=True),
        )
        if not match:
            return None

        parsed_dates = []
        for raw_date in match.groups():
            date_format = "%m/%d/%Y" if len(raw_date.rsplit("/", 1)[1]) == 4 else "%m/%d/%y"
            parsed_dates.append(
                datetime.strptime(raw_date, date_format).strftime("%Y-%m-%d")
            )
        return parsed_dates[0], parsed_dates[1]

    return None


def scrape_sections(html_content: str) -> List[Section]:
    """Scrape meeting details from Course Explorer's section table."""
    soup = BeautifulSoup(
        html_content, "html.parser", parse_only=COURSE_TABLE_ONLY
    )
    table = soup.select_one("#schedule-course-table")
    if table is None:
        return []

    table_body = table.find("tbody")
    if table_body is None:
        return []

    unique_sections_keys = set()
    sections = []
    invalid_full_loc_day_indicators = {'n.a.', 'arranged', 'location pending', ''}

    for row in table_body.find_all("tr", recursive=False):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 11:
            continue

        times = _meeting_values(cells[6])
        days = _meeting_values(cells[7])
        locations = _meeting_values(cells[8])
        date_range = _section_date_range(cells[10])

        if (
            not date_range
            or not times
            or len(times) != len(days)
            or len(times) != len(locations)
        ):
            continue

        start_date, end_date = date_range

        for time_str, location_str, day_str in zip(times, locations, days):
            time_norm = time_str.strip().upper()
            loc_norm = location_str.strip().lower()
            day_norm = day_str.strip().lower()

            if (time_norm == 'ARRANGED' or
                loc_norm in invalid_full_loc_day_indicators or
                day_norm in invalid_full_loc_day_indicators):
                continue

            try:
                time_obj = parse_time(time_str)
                location_obj = parse_location(location_str)
                days_list = parse_days(day_str)

                if not days_list:
                    continue
                if location_obj.room.lower() == 'arr':
                    continue

                section_key = (
                    time_obj.start, time_obj.end,
                    location_obj.building, location_obj.room,
                    tuple(sorted(days_list)),
                    start_date, end_date
                )

                if section_key not in unique_sections_keys:
                    unique_sections_keys.add(section_key)
                    sections.append(Section(
                        time=time_obj,
                        location=location_obj,
                        days=days_list,
                        start_date=start_date,
                        end_date=end_date
                    ))

            except Exception as e:
                print(
                    f"Error processing meeting ({time_str}, {location_str}, "
                    f"{day_str}): {str(e)}. Skipping meeting."
                )
                continue

    return sections

def get_progress_file(year: int, term: str) -> Path:
    """Get path to the progress file for tracking resumability."""
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(exist_ok=True)
    return data_dir / f"progress_{year}_{term}.json"

def load_progress(year: int, term: str) -> dict:
    """Load existing progress from disk if available."""
    progress_file = get_progress_file(year, term)
    if progress_file.exists():
        with open(progress_file, "r") as f:
            return json.load(f)
    return {"completed_subjects": {}, "last_updated": None}

def save_progress(year: int, term: str, completed_subjects: dict):
    """Save progress to disk for resumability."""
    progress_file = get_progress_file(year, term)
    data = {
        "last_updated": datetime.now().isoformat(),
        "year": year,
        "term": term,
        "completed_subjects": completed_subjects
    }
    write_json_snapshot(progress_file, data)

def clear_progress(year: int, term: str):
    """Remove progress file after successful completion."""
    progress_file = get_progress_file(year, term)
    if progress_file.exists():
        progress_file.unlink()

def save_subject_data(subjects: List[Subject], year: int, term: str):
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(exist_ok=True)

    data = {
        "last_updated": datetime.now().isoformat(),
        "year": year,
        "term": term,
        "subjects": [asdict(subject) for subject in subjects]
    }

    output_file = data_dir / "subjects.json"

    write_json_snapshot(output_file, data)


def restore_subject_courses(subject: Subject, saved_subject: dict) -> None:
    subject.courses = [
        Course(
            number=course["number"],
            title=course["title"],
            sections=[
                Section(
                    time=TimeSlot(
                        start=section["time"]["start"],
                        end=section["time"]["end"],
                    ),
                    location=Location(
                        building=section["location"]["building"],
                        room=section["location"]["room"],
                    ),
                    days=section["days"],
                    start_date=section["start_date"],
                    end_date=section["end_date"],
                )
                for section in course["sections"]
            ],
        )
        for course in saved_subject["courses"]
    ]


def scrape_subject(
    subject: Subject,
    subject_index: int,
    total_subjects: int,
    year: int,
    term: str,
    client: CourseExplorerClient,
    executor: ThreadPoolExecutor,
    options: ScrapeOptions,
) -> bool:
    """Populate one subject and report whether it is safe to checkpoint."""
    print(f"Processing subject {subject_index}/{total_subjects}: {subject.code}")
    try:
        response = client.fetch(
            f"https://courses.illinois.edu/schedule/{year}/{term}/{subject.code}"
        )
    except Exception as error:
        if options.skip_errors:
            print(f"  Failed to fetch subject page for {subject.code}: {error}")
            return False
        raise

    courses = scrape_courses(response.text)
    if options.verbose:
        print(f"  Found {len(courses)} courses in {subject.code}")

    failed_courses = 0
    for batch_start in range(0, len(courses), client.worker_count):
        if _shutdown_requested:
            print(
                "\n  Shutdown requested mid-subject, "
                "will retry this subject next run..."
            )
            return False

        batch = courses[batch_start : batch_start + client.worker_count]
        pending_courses = []
        for offset, course in enumerate(batch):
            number_parts = course.number.split()
            if len(number_parts) < 2:
                message = f"Unparsable course number: {course.number}"
                if not options.skip_errors:
                    raise ValueError(message)
                print(f"    Skipping course: {message}")
                failed_courses += 1
                continue
            course_number = number_parts[1]
            course_url = (
                f"https://courses.illinois.edu/schedule/{year}/{term}/"
                f"{subject.code}/{course_number}"
            )
            if options.verbose:
                print(
                    f"    Processing course {batch_start + offset + 1}/"
                    f"{len(courses)}: {course.number}"
                )
            pending_courses.append(
                (
                    course,
                    datetime.now(),
                    executor.submit(
                        lambda url=course_url: scrape_sections(client.fetch(url).text)
                    ),
                )
            )

        for course, course_start, pending_course in pending_courses:
            try:
                sections = pending_course.result()
            except Exception as error:
                if not options.skip_errors:
                    raise
                print(f"    Skipping course {course.number}: {error}")
                failed_courses += 1
                continue

            if not sections:
                continue
            course.sections = sections
            subject.courses.append(course)
            if options.verbose:
                duration = datetime.now() - course_start
                print(
                    f"      Found {len(sections)} sections "
                    f"({duration.total_seconds():.1f}s)"
                )

    if failed_courses:
        print(
            f"  WARNING: {subject.code} had {failed_courses}/{len(courses)} "
            "failed courses, NOT marking as complete"
        )
        return False
    return True


def scrape_all_data(options: ScrapeOptions) -> List[Subject]:
    start_time = datetime.now()

    client = CourseExplorerClient(
        worker_count=options.request_workers,
        proxy=options.proxy,
        proxy_http=options.proxy_http,
        proxy_https=options.proxy_https,
        proxy_file=options.proxy_file,
        rotate_every=options.rotate_every,
        proxy_retries=options.proxy_retries,
        request_timeout=options.request_timeout,
        request_delay=options.request_delay,
        proxy_schemes=options.proxy_schemes,
        insecure=options.insecure,
        proxy_try_all=options.proxy_try_all,
        max_proxy_failures=options.max_proxy_failures,
        proxy_shuffle=options.proxy_shuffle,
        verbose=options.verbose,
    )
    course_executor = ThreadPoolExecutor(max_workers=client.worker_count)

    try:
        active_year, active_term = resolve_active_schedule()
        year = options.year if options.year is not None else active_year
        term = options.term if options.term is not None else active_term
        term = term.lower()
        if term not in VALID_TERMS:
            raise ValueError(f"Invalid term: {term}. Must be one of: {VALID_TERMS}")

        print(f"Using Course Explorer schedule: {term} {year}")

        # Handle resumability
        if options.fresh:
            clear_progress(year, term)
            progress = {"completed_subjects": {}}
            print(f"Starting fresh scrape for {term} {year}...")
        elif options.resume:
            progress = load_progress(year, term)
            if progress["completed_subjects"]:
                print(f"Resuming scrape for {term} {year} ({len(progress['completed_subjects'])} subjects already completed)...")
            else:
                print(f"Starting scrape for {term} {year}...")
        else:
            progress = {"completed_subjects": {}}
            print(f"Starting scrape for {term} {year}...")

        completed_subjects = progress["completed_subjects"]

        print(f"Fetching subjects for {term} {year}...")
        r = client.fetch(f"https://courses.illinois.edu/schedule/{year}/{term}")
        subjects = scrape_subjects(r.text)
        total_subjects = len(subjects)
    
        final_subjects: List[Subject] = []
        for subject in subjects:
            saved_subject = completed_subjects.get(subject.code)
            if saved_subject is None:
                continue
            restore_subject_courses(subject, saved_subject)
            if subject.courses:
                final_subjects.append(subject)

        for subject_index, subject in enumerate(subjects, 1):
            if _shutdown_requested:
                print("\nShutdown requested, saving progress...")
                break

            if subject.code in completed_subjects:
                if options.verbose:
                    print(
                        f"Skipping subject {subject_index}/{total_subjects}: "
                        f"{subject.code} (already completed)"
                    )
                continue

            subject_start = datetime.now()
            if not scrape_subject(
                subject,
                subject_index,
                total_subjects,
                year,
                term,
                client,
                course_executor,
                options,
            ):
                continue

            if subject.courses:
                final_subjects.append(subject)
            completed_subjects[subject.code] = {
                "name": subject.name,
                "courses": [asdict(course) for course in subject.courses],
            }
            save_progress(year, term, completed_subjects)

            if options.verbose:
                duration = datetime.now() - subject_start
                total_courses = sum(len(item.courses) for item in final_subjects)
                total_sections = sum(
                    len(course.sections)
                    for item in final_subjects
                    for course in item.courses
                )
                print(
                    f"  Completed {subject.code} in "
                    f"{duration.total_seconds():.1f}s"
                )
                print(
                    f"  Running totals: {total_courses} courses, "
                    f"{total_sections} sections\n"
                )

        subjects = [subject for subject in final_subjects if len(subject.courses) > 0]
        parsed_section_count = sum(
            len(course.sections)
            for subject in subjects
            for course in subject.courses
        )
        if parsed_section_count == 0:
            raise RuntimeError(
                "Course Explorer scrape produced no sections; refusing to replace data"
            )

        save_subject_data(subjects, year=year, term=term)
    
        # Clear progress file on successful completion
        if len(completed_subjects) >= total_subjects:
            clear_progress(year, term)
            print("Scrape complete, progress file cleared.")

        total_duration = datetime.now() - start_time
        print(f"\nTotal time: {total_duration.total_seconds():.1f}s")
        return subjects
    finally:
        course_executor.shutdown(wait=True, cancel_futures=True)
        client.close()

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Scrape UIUC course data')
    parser.add_argument(
        '--year',
        type=int,
        default=None,
        help="Schedule year (defaults to the active academic-calendar term)",
    )
    parser.add_argument(
        '--term',
        type=str,
        default=None,
        help="Schedule term (defaults to the active academic-calendar term)",
    )
    parser.add_argument('-v', '--verbose', action='store_true', help='Show verbose output')
    parser.add_argument('--proxy', type=str, default=None,
                        help='Proxy URL for both HTTP and HTTPS (e.g., http://user:pass@host:port or socks5h://host:port)')
    parser.add_argument('--proxy-http', type=str, default=None,
                        help='Proxy URL for HTTP only (overrides --proxy for HTTP if both provided)')
    parser.add_argument('--proxy-https', type=str, default=None,
                        help='Proxy URL for HTTPS only (overrides --proxy for HTTPS if both provided)')
    parser.add_argument('--proxy-file', type=str, default=None,
                        help='Path or URL to a newline-delimited proxy list file. Each line like host:port or scheme://host:port')
    parser.add_argument('--rotate-every', type=int, default=1,
                        help='Rotate to the next proxy after this many requests (default: 1)')
    parser.add_argument('--proxy-retries', type=int, default=3,
                        help='Maximum attempts per request (default: 3)')
    parser.add_argument('--timeout', type=int, default=30,
                        help='Per-request timeout in seconds (default: 30)')
    parser.add_argument(
        '--request-delay',
        type=float,
        default=0,
        help='Minimum delay between requests in seconds (default: 0)',
    )
    parser.add_argument(
        '--workers',
        type=int,
        default=4,
        help='Concurrent course request workers (default: 4)',
    )
    parser.add_argument('--proxy-schemes', type=str, default='http,socks5,socks5h,socks4',
                        help='Comma-separated list of allowed proxy schemes to load from --proxy-file (default: http,socks5,socks5h,socks4)')
    parser.add_argument('--insecure', action='store_true',
                        help='Disable TLS certificate verification for target sites (may help with some proxies)')
    parser.add_argument('--proxy-try-all', action='store_true',
                        help='On each request, try every available proxy at most once before failing')
    parser.add_argument('--max-proxy-failures', type=int, default=2,
                        help='Remove a proxy from rotation after this many consecutive failures (default: 2)')
    parser.add_argument('--proxy-shuffle', action='store_true',
                        help='Shuffle proxy list order on load')
    parser.add_argument('--no-skip-errors', dest='skip_errors', action='store_false',
                        help='Fail fast on errors instead of skipping subjects/courses')
    parser.add_argument('--no-resume', dest='resume', action='store_false',
                        help='Disable resumability (start fresh without loading progress)')
    parser.add_argument('--fresh', action='store_true',
                        help='Clear any existing progress and start fresh')

    args = parser.parse_args()

    print("Starting scraper...")
    print("Press Ctrl+C at any time to stop and save partial results")

    subjects = scrape_all_data(
        ScrapeOptions(
            year=args.year,
            term=args.term,
            verbose=args.verbose,
            proxy=args.proxy,
            proxy_http=args.proxy_http,
            proxy_https=args.proxy_https,
            proxy_file=args.proxy_file,
            rotate_every=args.rotate_every,
            proxy_retries=args.proxy_retries,
            request_timeout=args.timeout,
            request_delay=args.request_delay,
            request_workers=args.workers,
            proxy_schemes=[
                scheme.strip()
                for scheme in args.proxy_schemes.split(",")
                if scheme.strip()
            ],
            insecure=args.insecure,
            proxy_try_all=args.proxy_try_all,
            max_proxy_failures=args.max_proxy_failures,
            proxy_shuffle=args.proxy_shuffle,
            skip_errors=args.skip_errors,
            resume=args.resume,
            fresh=args.fresh,
        )
    )
    print("\nScraping complete!")
    print(f"Scraped {len(subjects)} subjects")
    print(f"Total courses: {sum(len(subject.courses) for subject in subjects)}")
