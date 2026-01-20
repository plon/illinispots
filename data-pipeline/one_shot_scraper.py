from bs4 import BeautifulSoup
from pathlib import Path
import re
from curl_cffi import requests
from dataclasses import dataclass, field, asdict
from datetime import datetime
import json
import signal
from typing import List, Optional

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

    valid_days = {'M', 'T', 'W', 'R', 'F'}
    return [char for char in day_str if char in valid_days]

def parse_location(location_str: str) -> Location:
    """Split location into room and building
    Example: "3039 Campus Instructional Facility" -> room="3039", building="Campus Instructional Facility"
    """
    room, building = location_str.split(' ', 1)
    return Location(room=room, building=building)

def parse_time(time_str: str) -> TimeSlot:
    """Convert '09:30AM - 10:50AM' to 24-hour format"""
    start, end = time_str.split(' - ')

    start_24 = datetime.strptime(start, '%I:%M%p').strftime('%H:%M')
    end_24 = datetime.strptime(end, '%I:%M%p').strftime('%H:%M')

    return TimeSlot(start=start_24, end=end_24)

def scrape_sections(html_content: str) -> List[Section]:
    """
    Scrapes section details from the course page HTML content.
    """
    section_data_match = re.search(r'var sectionDataObj = (\[.*?\]);', html_content, re.DOTALL)
    if not section_data_match:
        print("Warning: 'sectionDataObj' not found in HTML content.")
        return []

    try:
        section_data = json.loads(section_data_match.group(1))
    except json.JSONDecodeError as e:
        print(f"Error decoding section JSON data: {e}")
        return []

    unique_sections_keys = set()
    sections = []

    meeting_regex = re.compile(r'<div class="app-meeting">(.*?)</div>')
    strip_tags_regex = re.compile(r'<[^>]+>')

    invalid_full_loc_day_indicators = {'n.a.', 'arranged', 'location pending', ''}

    for data in section_data:
        # Extract meeting details, preferring div content, fallback to raw text
        times = meeting_regex.findall(data.get('time', ''))
        locations = meeting_regex.findall(data.get('location', ''))
        days = meeting_regex.findall(data.get('day', ''))

        if not times and data.get('time'):
            time_str = strip_tags_regex.sub('', data['time']).strip()
            if time_str: times = [time_str]
        if not locations and data.get('location'):
            location_str = strip_tags_regex.sub('', data['location']).strip()
            if location_str: locations = [location_str]
        if not days and data.get('day'):
            day_str = strip_tags_regex.sub('', data['day']).strip()
            if day_str: days = [day_str]

        # Ensure consistent number of meeting parts found
        if not (times and locations and days and len(times) == len(locations) == len(days)):
            continue # Skip if data is inconsistent for meetings

        try:
            date_range_str = data.get('sectionDateRange', '')
            date_parts = date_range_str.split('-')
            if len(date_parts) != 2:
                 raise ValueError("Date range format error")
            start_date_str = date_parts[0].replace('Meets ', '').strip()
            end_date_str = date_parts[1].strip()
            start_date = datetime.strptime(start_date_str, '%m/%d/%y').strftime('%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%m/%d/%y').strftime('%Y-%m-%d')
        except (ValueError, AttributeError, IndexError) as e:
            print(f"Error parsing date range '{date_range_str}': {e}. Skipping section data.")
            continue

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

                # Unique key to prevent duplicate section entries
                section_key = (
                    time_obj.start, time_obj.end,
                    location_obj.building, location_obj.room,
                    tuple(sorted(days_list)), # Sort days for consistent key
                    start_date, end_date
                )

                # Add the section if its key hasn't been seen before
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
                print(f"Error processing meeting ({time_str}, {location_str}, {day_str}): {str(e)}. Skipping meeting.")
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
        json.dump(data, f, indent=2)

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
                    proxy_schemes: Optional[List[str]] = None,
                    insecure: bool = False,
                    proxy_try_all: bool = False,
                    max_proxy_failures: int = 2,
                    proxy_shuffle: bool = False,
                    skip_errors: bool = True,
                    resume: bool = True,
                    fresh: bool = False) -> List[Subject]:
    start_time = datetime.now()

    if year is None:
        year = 2024
    if term is None:
        term = "fall"

    term_lower = term.lower()
    if term_lower not in VALID_TERMS:
        raise ValueError(f"Invalid term: {term}. Must be one of: {VALID_TERMS}")

    # Build proxies: if a list is provided, use rotator; otherwise static proxies
    proxies = _build_proxies(proxy=proxy, proxy_http=proxy_http, proxy_https=proxy_https)
    proxy_list: List[dict] = []
    rotator: Optional[ProxyRotator] = None
    if proxy_file:
        proxy_list = _load_proxy_list(proxy_file, allowed_schemes=proxy_schemes)
        if proxy_list:
            rotator = ProxyRotator(proxy_list, rotate_every=rotate_every, max_failures=max_proxy_failures, shuffle=proxy_shuffle)

    def fetch(url: str):
        last_exc = None
        if rotator:
            if rotator.size() == 0:
                raise RuntimeError("No proxies left in rotation")
            attempts = max(1, rotator.size()) if proxy_try_all else max(1, int(proxy_retries))
        else:
            attempts = 1
        for attempt in range(1, attempts + 1):
            # Peek current proxy; only advance on success or explicit failure handling
            use_proxies = rotator.peek() if rotator else proxies
            try:
                r = requests.get(
                    url,
                    impersonate='chrome123',
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
                if verbose:
                    print(f"  Request failed (attempt {attempt}/{attempts}): {e}")
                # try next proxy on next iteration
                if rotator:
                    rotator.mark_failure_current()
                continue
        # Exhausted attempts
        raise last_exc if last_exc else RuntimeError("Unknown error during request")

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
    r = fetch("https://courses.illinois.edu/schedule/DEFAULT/DEFAULT")
    r.raise_for_status()
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
    skipped_count = len([s for s in subjects if s.code in completed_subjects])

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

    subjects = [subject for subject in final_subjects if len(subject.courses) > 0]
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
    parser.add_argument('--year', type=int, default=2025)
    parser.add_argument('--term', type=str, default="spring")
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
                        help='When using --proxy-file, how many attempts per request to try different proxies (default: 3)')
    parser.add_argument('--timeout', type=int, default=30,
                        help='Per-request timeout in seconds (default: 30)')
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
