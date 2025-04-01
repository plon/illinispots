from bs4 import BeautifulSoup
from pathlib import Path
import re
from curl_cffi import requests
from dataclasses import dataclass, field, asdict
from datetime import datetime
import json
from typing import List, Optional

VALID_TERMS = {'spring', 'summer', 'fall', 'winter'}

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

def scrape_all_data(year: Optional[int] = None, term: Optional[str] = None, verbose: bool = False) -> List[Subject]:
    start_time = datetime.now()

    if year is None:
        year = 2024
    if term is None:
        term = "fall"

    term_lower = term.lower()
    if term_lower not in VALID_TERMS:
        raise ValueError(f"Invalid term: {term}. Must be one of: {VALID_TERMS}")

    print(f"Fetching subjects for {term} {year}...")
    r = requests.get("https://courses.illinois.edu/schedule/DEFAULT/DEFAULT")
    subjects = scrape_subjects(r.text)
    total_subjects = len(subjects)
    total_courses = 0
    total_sections = 0

    try:
        for i, subject in enumerate(subjects, 1):
            subject_start = datetime.now()
            print(f"Processing subject {i}/{total_subjects}: {subject.code}")

            r = requests.get(f"https://courses.illinois.edu/schedule/{year}/{term}/{subject.code}")
            courses = scrape_courses(r.text)

            if verbose:
                print(f"  Found {len(courses)} courses in {subject.code}")

            for j, course in enumerate(courses, 1):
                course_start = datetime.now()
                course_number = course.number.split()[1]
                course_url = f"https://courses.illinois.edu/schedule/{year}/{term}/{subject.code}/{course_number}"

                if verbose:
                    print(f"    Processing course {j}/{len(courses)}: {course.number}")

                course_response = requests.get(course_url)
                sections = scrape_sections(course_response.text)

                if len(sections) > 0:
                    course.sections = sections
                    subject.courses.append(course)
                    total_sections += len(sections)

                    if verbose:
                        course_duration = datetime.now() - course_start
                        print(f"      Found {len(sections)} sections ({course_duration.total_seconds():.1f}s)")

            total_courses += len(subject.courses)
            if verbose:
                subject_duration = datetime.now() - subject_start
                print(f"  Completed {subject.code} in {subject_duration.total_seconds():.1f}s")
                print(f"  Running totals: {total_courses} courses, {total_sections} sections")
                print()

    except KeyboardInterrupt:
        print("\nScraping interrupted, saving partial results...")

    subjects = [subject for subject in subjects if len(subject.courses) > 0]
    save_subject_data(subjects, year=year, term=term)

    total_duration = datetime.now() - start_time
    print(f"\nTotal time: {total_duration.total_seconds():.1f}s")
    return subjects

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Scrape UIUC course data')
    parser.add_argument('--year', type=int, default=2025)
    parser.add_argument('--term', type=str, default="spring")
    parser.add_argument('-v', '--verbose', action='store_true', help='Show verbose output')

    args = parser.parse_args()

    print("Starting scraper...")
    print("Press Ctrl+C at any time to stop and save partial results")

    subjects = scrape_all_data(year=args.year, term=args.term, verbose=args.verbose)
    print("\nScraping complete!")
    print(f"Scraped {len(subjects)} subjects")
    print(f"Total courses: {sum(len(subject.courses) for subject in subjects)}")
