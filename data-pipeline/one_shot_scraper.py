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

def scrape_sections(html_content) -> List[Section]:
    section_data_match = re.search(r'var sectionDataObj = (\[.*?\]);', html_content, re.DOTALL)
    if not section_data_match:
        return []
    section_data = json.loads(section_data_match.group(1))

    unique_sections = set()
    sections = []

    for data in section_data:
        times = re.findall(r'<div class="app-meeting">(.*?)</div>', data['time'])
        locations = re.findall(r'<div class="app-meeting">(.*?)</div>', data['location'])
        days = re.findall(r'<div class="app-meeting">(.*?)</div>', data['day'])

        # If no matches found with div tags, try getting the raw strings
        if not times:
            time_str = re.sub(r'<[^>]+>', '', data['time']).strip()
            if time_str:
                times = [time_str]

        if not locations:
            location_str = re.sub(r'<[^>]+>', '', data['location']).strip()
            if location_str:
                locations = [location_str]

        if not days:
            day_str = re.sub(r'<[^>]+>', '', data['day']).strip()
            if day_str:
                days = [day_str]

        if not times or not locations or not days:
            continue

        invalid_meeting = False
        for time_str, location_str, day_str in zip(times, locations, days):
            if (time_str.upper() == 'ARRANGED' or
                location_str.lower() in ['n.a.', 'arranged', 'arr', 'location pending'] or
                day_str.lower() in ['n.a.', 'arranged', '', 'arr']):
                invalid_meeting = True
                break

        if invalid_meeting:
            continue

        date_range = data['sectionDateRange'].split('-')
        start_date = datetime.strptime(date_range[0].replace('Meets ', '').strip(), '%m/%d/%y').strftime('%Y-%m-%d')
        end_date = datetime.strptime(date_range[1].strip(), '%m/%d/%y').strftime('%Y-%m-%d')

        for time_str, location_str, day_str in zip(times, locations, days):
            try:
                time_obj = parse_time(time_str)
                location_obj = parse_location(location_str)
                days_list = parse_days(day_str)

                section_key = (
                    time_obj.start,
                    time_obj.end,
                    location_obj.building,
                    location_obj.room,
                    tuple(sorted(days_list)),
                    start_date,
                    end_date
                )

                if section_key not in unique_sections:
                    unique_sections.add(section_key)
                    sections.append(Section(
                        time=time_obj,
                        location=location_obj,
                        days=days_list,
                        start_date=start_date,
                        end_date=end_date
                    ))

            except Exception as e:
                print(f"Error parsing section: {str(e)}")
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

def scrape_all_data(year: Optional[int] = None, term: Optional[str] = None) -> List[Subject]:
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

    try:
        for i, subject in enumerate(subjects, 1):
            print(f"Processing subject {i}/{total_subjects}: {subject.code}")

            r = requests.get(f"https://courses.illinois.edu/schedule/{year}/{term}/{subject.code}")
            courses = scrape_courses(r.text)

            for course in courses:
                course_number = course.number.split()[1]
                course_url = f"https://courses.illinois.edu/schedule/{year}/{term}/{subject.code}/{course_number}"
                course_response = requests.get(course_url)
                sections = scrape_sections(course_response.text)

                if len(sections) > 0:
                    course.sections = sections
                    subject.courses.append(course)

    except KeyboardInterrupt:
        print("\nScraping interrupted, saving partial results...")

    subjects = [subject for subject in subjects if len(subject.courses) > 0]
    save_subject_data(subjects, year=year, term=term)
    return subjects

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Scrape UIUC course data')
    parser.add_argument('--year', type=int, default=2025)
    parser.add_argument('--term', type=str, default="spring")

    args = parser.parse_args()

    print("Starting scraper...")
    print("Press Ctrl+C at any time to stop and save partial results")

    subjects = scrape_all_data(year=args.year, term=args.term)
    print("\nScraping complete!")
    print(f"Scraped {len(subjects)} subjects")
    print(f"Total courses: {sum(len(subject.courses) for subject in subjects)}")
