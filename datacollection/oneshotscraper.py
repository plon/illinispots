from bs4 import BeautifulSoup
from pathlib import Path
import re
from curl_cffi import requests
from dataclasses import dataclass, field, asdict
from datetime import datetime, date
import json
from typing import List

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

    # Find all rows that contain subject codes and names
    rows = soup.find_all('tr')

    for row in rows:
        cols = row.find_all('td')
        if len(cols) >= 2:  # Ensure we have both code and name
            code = cols[0].text.strip()
            name = cols[1].text.strip()
            if code and name:  # Only add if both values exist
                subjects.append(Subject(code=code, name=name))

    return subjects

def scrape_courses(html_content) -> List[Course]:
    soup = BeautifulSoup(html_content, 'html.parser')
    courses = []

    # Find all rows that contain course info
    rows = soup.find_all('tr')

    for row in rows:
        cols = row.find_all('td')
        if len(cols) >= 2:  # Ensure we have both number and title
            number = cols[0].text.strip()
            title = cols[1].text.strip()
            if number and title:  # Only add if both values exist
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

    # Convert to 24-hour format
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

    current_date = date.today()

    for data in section_data:
        # Check section date range
        if 'sectionDateRange' in data:
            try:
                # Extract end date from the range string (format: "Meets MM/DD/YY-MM/DD/YY")
                end_date_str = data['sectionDateRange'].split('-')[1].strip()
                end_date = datetime.strptime(end_date_str, '%m/%d/%y').date()

                # Skip if the section has already ended
                if end_date < current_date:
                    continue
            except Exception as e:
                print(f"Error parsing date range: {str(e)}")
                # If we can't parse the date, we'll include the section to be safe
                pass

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

        # Skip if any required data is missing
        if not times or not locations or not days:
            continue

        # Create a section for each meeting time
        for time_str, location_str, day_str in zip(times, locations, days):
            if (time_str.upper() == 'ARRANGED' or
                location_str.lower() == 'n.a.' or
                'arr' in location_str.lower() or
                day_str.lower() in ['n.a.', 'arranged', '', 'arr']):
                continue

            try:
                # Create time and location objects for comparison
                time_obj = parse_time(time_str)
                location_obj = parse_location(location_str)
                days_list = parse_days(day_str)

                # Create a tuple of the unique identifying components
                section_key = (
                    time_obj.start,
                    time_obj.end,
                    location_obj.building,
                    location_obj.room,
                    tuple(sorted(days_list))  # Convert list to tuple for hashing
                )

                # Only add if this combination hasn't been seen before
                if section_key not in unique_sections:
                    unique_sections.add(section_key)
                    sections.append(Section(
                        time=time_obj,
                        location=location_obj,
                        days=days_list
                    ))

            except Exception as e:
                print(f"Error parsing section: {str(e)}")
                continue

    return sections

def save_subject_data(subjects: List[Subject]):
    data_dir = Path(__file__).parent / "data"
    # Convert all dataclasses to dictionaries
    data = {
        "last_updated": datetime.now().isoformat(),
        "subjects": [asdict(subject) for subject in subjects]
    }

    # Save to file
    output_file = data_dir / "subject_data.json"
    with open(output_file, "w") as f:
        json.dump(data, f, indent=2)

def scrape_all_data():
    # Get all subjects first
    print("Fetching subjects...")
    r = requests.get("https://courses.illinois.edu/schedule/DEFAULT/DEFAULT")
    subjects = scrape_subjects(r.text)

    total_subjects = len(subjects)

    # For each subject, get all courses
    for i, subject in enumerate(subjects, 1):
        print(f"Processing subject {i}/{total_subjects}: {subject.code}")

        try:
            # Get courses for this subject
            r = requests.get(f"https://courses.illinois.edu/schedule/2024/fall/{subject.code}")
            courses = scrape_courses(r.text)

            # For each course, get sections
            for j, course in enumerate(courses):
                try:
                    course_number = course.number.split()[1]
                    course_url = f"https://courses.illinois.edu/schedule/2024/fall/{subject.code}/{course_number}"
                    course_response = requests.get(course_url)
                    sections = scrape_sections(course_response.text)

                    if len(sections) > 0:
                        course.sections = sections
                        subject.courses.append(course)

                except Exception as e:
                    print(f"Error processing course {course.number}: {str(e)}")
                    continue

        except Exception as e:
            print(f"Error processing subject {subject.code}: {str(e)}")
            continue

    # Remove subjects with no courses
    subjects = [subject for subject in subjects if len(subject.courses) > 0]

    # Save the data
    save_subject_data(subjects)

    return subjects

if __name__ == "__main__":
    print("Starting scraper...")
    subjects = scrape_all_data()
    print("\nScraping complete!")
    print(f"Scraped {len(subjects)} subjects")
    total_courses = sum(len(subject.courses) for subject in subjects)
    print(f"Total courses: {total_courses}")
