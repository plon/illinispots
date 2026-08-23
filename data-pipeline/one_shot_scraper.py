from bs4 import BeautifulSoup
from pathlib import Path
import re
from curl_cffi import requests
from dataclasses import dataclass, field, asdict
from datetime import date, datetime
import json
import random
import signal
import time
from typing import List, Optional
from zoneinfo import ZoneInfo

VALID_TERMS = {'spring', 'summer', 'fall', 'winter'}

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

def scrape_subjects(html_content) -> List[Subject]:
    soup = BeautifulSoup(html_content, 'html.parser')
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
    soup = BeautifulSoup(html_content, 'html.parser')
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
    soup = BeautifulSoup(html_content, "html.parser")
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
    with open(progress_file, "w") as f:
        # This file is machine-owned and rewritten after every subject. Compact
        # JSON substantially reduces cumulative serialization and disk I/O.
        json.dump(data, f, separators=(",", ":"))

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

    with open(output_file, "w") as f:
        json.dump(data, f, indent=2)

def _normalize_proxy_url(url: str) -> str:
    """Ensure proxy URL has a scheme. Defaults to http:// if missing."""
    if not url:
        return url
    # If user passes host:port, default to http://
    if '://' not in url:
        return f"http://{url}"
    return url


def _build_proxies(proxy: Optional[str] = None,
                   proxy_http: Optional[str] = None,
                   proxy_https: Optional[str] = None) -> Optional[dict]:
    """Create a requests-compatible proxies dict from CLI args.

    - If `proxy` is provided, use it for both http and https.
    - Otherwise, use `proxy_http` and `proxy_https` individually when provided.
    - Returns None if no proxies were specified.
    """
    if proxy:
        p = _normalize_proxy_url(proxy)
        return {"http": p, "https": p}

    proxies = {}
    if proxy_http:
        proxies["http"] = _normalize_proxy_url(proxy_http)
    if proxy_https:
        proxies["https"] = _normalize_proxy_url(proxy_https)

    return proxies or None


def _load_proxy_list(path: str, allowed_schemes: Optional[List[str]] = None) -> List[dict]:
    """Load a newline-delimited proxy list file.

    - Lines may be formats like:
        host:port
        http://host:port
        http://user:pass@host:port
        socks5h://host:port
    - Blank lines and lines starting with '#' are ignored.
    - Each entry is turned into {"http": url, "https": url} using `_normalize_proxy_url`.
    """
    proxies: List[dict] = []
    try:
        if path.startswith('http://') or path.startswith('https://'):
            try:
                r = requests.get(path, impersonate='chrome123', timeout=30)
                r.raise_for_status()
                lines = r.text.splitlines()
            except Exception as e:
                print(f"Warning: failed to fetch proxy list from URL '{path}': {e}")
                lines = []
        else:
            with open(path, 'r') as f:
                lines = f.readlines()

        for raw in lines:
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            if ',' in line:
                line = line.split(',', 1)[0].strip()
            if ' ' in line:
                line = line.split()[0].strip()
            if not line:
                continue
            url = _normalize_proxy_url(line)
            if url.startswith('socks5://'):
                url = 'socks5h://' + url[len('socks5://'):]
            if allowed_schemes is not None:
                scheme = url.split('://', 1)[0] if '://' in url else 'http'
                if scheme not in allowed_schemes:
                    continue
            proxies.append({"http": url, "https": url})
    except FileNotFoundError:
        print(f"Warning: proxy list file not found: {path}")
    except Exception as e:
        print(f"Warning: error loading proxy list '{path}': {e}")
    return proxies


class ProxyRotator:
    """Round-robin proxy rotator with stickiness and failure culling."""
    def __init__(self, proxies: List[dict], rotate_every: int = 1, max_failures: int = 2, shuffle: bool = False):
        if shuffle:
            try:
                import random
                random.shuffle(proxies)
            except Exception:
                pass
        self.proxies = proxies
        self.failures = [0] * len(proxies)
        self.rotate_every = max(1, int(rotate_every))
        self.max_failures = max(1, int(max_failures))
        self._idx = 0
        self._count = 0

    def peek(self) -> Optional[dict]:
        if not self.proxies:
            return None
        return self.proxies[self._idx]

    def advance(self):
        if not self.proxies:
            return
        self._idx = (self._idx + 1) % len(self.proxies)
        self._count = 0

    def size(self) -> int:
        return len(self.proxies)

    def _remove_current(self):
        if not self.proxies:
            return
        del self.proxies[self._idx]
        del self.failures[self._idx]
        if self._idx >= len(self.proxies):
            self._idx = 0
        self._count = 0

    def mark_failure_current(self):
        if not self.proxies:
            return
        self.failures[self._idx] += 1
        if self.failures[self._idx] >= self.max_failures:
            self._remove_current()
        else:
            self.advance()

    def use(self) -> Optional[dict]:
        """Get current proxy and apply stickiness accounting.

        After this call, internal counter increases. When it reaches
        `rotate_every`, we advance to the next proxy.
        """
        proxy = self.peek()
        if proxy is None:
            return None
        self._count += 1
        if self._count >= self.rotate_every:
            self.advance()
        return proxy


def scrape_all_data(year: Optional[int] = None,
                    term: Optional[str] = None,
                    verbose: bool = False,
                    proxy: Optional[str] = None,
                    proxy_http: Optional[str] = None,
                    proxy_https: Optional[str] = None,
                    proxy_file: Optional[str] = None,
                    rotate_every: int = 1,
                    proxy_retries: int = 3,
                    request_timeout: int = 30,
                    request_delay: float = 0,
                    proxy_schemes: Optional[List[str]] = None,
                    insecure: bool = False,
                    proxy_try_all: bool = False,
                    max_proxy_failures: int = 2,
                    proxy_shuffle: bool = False,
                    skip_errors: bool = True,
                    resume: bool = True,
                    fresh: bool = False) -> List[Subject]:
    start_time = datetime.now()

    # Build proxies: if a list is provided, use rotator; otherwise static proxies
    proxies = _build_proxies(proxy=proxy, proxy_http=proxy_http, proxy_https=proxy_https)
    proxy_list: List[dict] = []
    rotator: Optional[ProxyRotator] = None
    if proxy_file:
        proxy_list = _load_proxy_list(proxy_file, allowed_schemes=proxy_schemes)
        if proxy_list:
            rotator = ProxyRotator(proxy_list, rotate_every=rotate_every, max_failures=max_proxy_failures, shuffle=proxy_shuffle)

    # Course Explorer requires thousands of requests for a full term. Reusing a
    # session preserves HTTP connections and avoids repeating TLS setup.
    http_session = requests.Session(impersonate="chrome123")

    def fetch(url: str):
        last_exc = None
        if rotator:
            if rotator.size() == 0:
                raise RuntimeError("No proxies left in rotation")
            attempts = max(1, rotator.size()) if proxy_try_all else max(1, int(proxy_retries))
        else:
            attempts = max(1, int(proxy_retries))
        for attempt in range(1, attempts + 1):
            # Peek current proxy; only advance on success or explicit failure handling
            use_proxies = rotator.peek() if rotator else proxies

            if request_delay > 0:
                time.sleep(request_delay + random.uniform(0, request_delay * 0.25))

            try:
                r = http_session.get(
                    url,
                    proxies=use_proxies,
                    timeout=request_timeout,
                    verify=not insecure,
                )
                r.raise_for_status()
                if rotator:
                    # Count this as a successful use for rotation stickiness
                    rotator.use()
                return r
            except KeyboardInterrupt:
                raise
            except Exception as e:
                last_exc = e
                response = getattr(e, "response", None)
                status_code = getattr(response, "status_code", None)
                if verbose or status_code in {403, 429}:
                    print(
                        f"  Request failed (attempt {attempt}/{attempts}, "
                        f"status {status_code or 'unknown'}): {e}"
                    )

                # try next proxy on next iteration
                if rotator:
                    rotator.mark_failure_current()

                if attempt < attempts:
                    retry_after = getattr(response, "headers", {}).get("Retry-After")
                    try:
                        backoff = float(retry_after)
                    except (TypeError, ValueError):
                        backoff = min(60, 2 ** attempt)
                    time.sleep(backoff + random.uniform(0, 1))
                continue
        # Exhausted attempts
        raise last_exc if last_exc else RuntimeError("Unknown error during request")

    active_year, active_term = resolve_active_schedule()

    if year is None:
        year = active_year
    if term is None:
        term = active_term

    term = term.lower()
    if term not in VALID_TERMS:
        raise ValueError(f"Invalid term: {term}. Must be one of: {VALID_TERMS}")

    print(f"Using Course Explorer schedule: {term} {year}")

    # Handle resumability
    if fresh:
        clear_progress(year, term)
        progress = {"completed_subjects": {}}
        print(f"Starting fresh scrape for {term} {year}...")
    elif resume:
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
    r = fetch(f"https://courses.illinois.edu/schedule/{year}/{term}")
    subjects = scrape_subjects(r.text)
    total_subjects = len(subjects)
    
    # Rebuild subjects list from progress for already completed ones
    final_subjects: List[Subject] = []
    for subject in subjects:
        if subject.code in completed_subjects:
            # Reconstruct from saved progress
            saved_data = completed_subjects[subject.code]
            subject.courses = [
                Course(
                    number=c["number"],
                    title=c["title"],
                    sections=[
                        Section(
                            time=TimeSlot(start=s["time"]["start"], end=s["time"]["end"]),
                            location=Location(building=s["location"]["building"], room=s["location"]["room"]),
                            days=s["days"],
                            start_date=s["start_date"],
                            end_date=s["end_date"]
                        )
                        for s in c["sections"]
                    ]
                )
                for c in saved_data["courses"]
            ]
            if subject.courses:
                final_subjects.append(subject)
    
    total_courses = sum(len(s.courses) for s in final_subjects)
    total_sections = sum(sum(len(c.sections) for c in s.courses) for s in final_subjects)

    for i, subject in enumerate(subjects, 1):
        # Check for shutdown request
        if _shutdown_requested:
            print("\nShutdown requested, saving progress...")
            break
            
        # Skip already completed subjects
        if subject.code in completed_subjects:
            if verbose:
                print(f"Skipping subject {i}/{total_subjects}: {subject.code} (already completed)")
            continue
            
        subject_start = datetime.now()
        print(f"Processing subject {i}/{total_subjects}: {subject.code}")

        try:
            r = fetch(f"https://courses.illinois.edu/schedule/{year}/{term}/{subject.code}")
            r.raise_for_status()
        except Exception as e:
            msg = f"  Failed to fetch subject page for {subject.code}: {e}"
            if skip_errors:
                print(msg)
                continue
            else:
                raise

        courses = scrape_courses(r.text)

        if verbose:
            print(f"  Found {len(courses)} courses in {subject.code}")

        failed_courses = 0
        for j, course in enumerate(courses, 1):
            # Check for shutdown request
            if _shutdown_requested:
                print("\n  Shutdown requested mid-subject, will retry this subject next run...")
                failed_courses = len(courses)  # Force subject to not be marked complete
                break
                
            course_start = datetime.now()
            course_number = course.number.split()[1]
            course_url = f"https://courses.illinois.edu/schedule/{year}/{term}/{subject.code}/{course_number}"

            if verbose:
                print(f"    Processing course {j}/{len(courses)}: {course.number}")

            try:
                course_response = fetch(course_url)
                course_response.raise_for_status()
            except Exception as e:
                msg = f"    Skipping course {course.number}: {e}"
                if skip_errors:
                    print(msg)
                    failed_courses += 1
                    continue
                else:
                    raise

            sections = scrape_sections(course_response.text)

            if len(sections) > 0:
                course.sections = sections
                subject.courses.append(course)
                total_sections += len(sections)

                if verbose:
                    course_duration = datetime.now() - course_start
                    print(f"      Found {len(sections)} sections ({course_duration.total_seconds():.1f}s)")

        total_courses += len(subject.courses)
        
        # Only mark subject as complete if no courses failed
        if failed_courses > 0:
            print(f"  WARNING: {subject.code} had {failed_courses}/{len(courses)} failed courses, NOT marking as complete")
            continue
        
        # Save progress after each subject
        if subject.courses:
            final_subjects.append(subject)
        completed_subjects[subject.code] = {
            "name": subject.name,
            "courses": [asdict(c) for c in subject.courses]
        }
        save_progress(year, term, completed_subjects)
        
        if verbose:
            subject_duration = datetime.now() - subject_start
            print(f"  Completed {subject.code} in {subject_duration.total_seconds():.1f}s")
            print(f"  Running totals: {total_courses} courses, {total_sections} sections")
            print()

    http_session.close()

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
        proxy_schemes=[s.strip() for s in args.proxy_schemes.split(',') if s.strip()],
        insecure=args.insecure,
        proxy_try_all=args.proxy_try_all,
        max_proxy_failures=args.max_proxy_failures,
        proxy_shuffle=args.proxy_shuffle,
        skip_errors=args.skip_errors,
        resume=args.resume,
        fresh=args.fresh,
    )
    print("\nScraping complete!")
    print(f"Scraped {len(subjects)} subjects")
    print(f"Total courses: {sum(len(subject.courses) for subject in subjects)}")
