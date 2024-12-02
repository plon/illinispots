from pathlib import Path
import json
from dataclasses import asdict
from datetime import datetime
from typing import Dict, List

class SubjectToBuildingsProcessor:
    def __init__(self):
        self.data_dir = Path(__file__).parent / "data"
        self.input_file = self.data_dir / "subject_data.json"
        self.output_file = self.data_dir / "building_data.json"

    def load_subject_data(self) -> Dict:
        """Load the subject data JSON created by oneshotscraper"""
        with open(self.input_file, 'r') as f:
            return json.load(f)

    def process_to_buildings(self, subject_data: Dict) -> Dict:
        """Convert subject-sorted data to building-sorted data"""
        buildings = {}

        # Process each subject
        for subject in subject_data['subjects']:
            for course in subject['courses']:
                for section in course['sections']:
                    building_name = section['location']['building']
                    room = section['location']['room']

                    # Initialize building if not seen before
                    if building_name not in buildings:
                        buildings[building_name] = {
                            'rooms': {},
                            'total_sections': 0
                        }

                    # Initialize room if not seen before
                    if room not in buildings[building_name]['rooms']:
                        buildings[building_name]['rooms'][room] = {
                            'sections': []
                        }

                    # Add section info
                    section_info = {
                        'course': f"{course['number']}" if course['number'].startswith(subject['code']) else f"{subject['code']} {course['number']}",
                        'time': section['time'],
                        'days': section['days']
                    }
                    buildings[building_name]['rooms'][room]['sections'].append(section_info)
                    buildings[building_name]['total_sections'] += 1

        return {
            'last_updated': datetime.now().isoformat(),
            'buildings': buildings
        }

    def save_building_data(self, building_data: Dict):
        """Save the processed building data to JSON"""
        with open(self.output_file, 'w') as f:
            json.dump(building_data, f, indent=2)

    def process(self):
        print("Loading subject data...")
        subject_data = self.load_subject_data()

        print("Processing subjects into building data...")
        building_data = self.process_to_buildings(subject_data)

        print("Saving building data...")
        self.save_building_data(building_data)

        # Print summary
        num_buildings = len(building_data['buildings'])
        total_sections = sum(b['total_sections'] for b in building_data['buildings'].values())
        print(f"\nProcessing complete!")
        print(f"Processed {num_buildings} buildings")
        print(f"Total sections: {total_sections}")

def main():
    processor = SubjectToBuildingsProcessor()
    processor.process()

if __name__ == "__main__":
    main()