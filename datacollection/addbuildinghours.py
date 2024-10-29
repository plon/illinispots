from pathlib import Path
import json
from datetime import datetime
from typing import Dict, Any, Optional

class BuildingHoursProcessor:
    def __init__(self):
        self.data_dir = Path(__file__).parent / "data"
        self.buildings_file = self.data_dir / "filtered_buildings.json"
        self.hours_file = self.data_dir / "buildinghours.json"
        self.days_mapping = {
            "M-TH": ["monday", "tuesday", "wednesday", "thursday"],
            "F": ["friday"],
            "SAT": ["saturday"],
            "SUN": ["sunday"]
        }

    def load_data(self) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """Load building data and hours data from JSON files."""
        with open(self.buildings_file, 'r') as f:
            buildings_data = json.load(f)

        with open(self.hours_file, 'r') as f:
            hours_data = json.load(f)

        return buildings_data, hours_data

    def save_data(self, data: Dict[str, Any]) -> None:
        """Save updated building data to JSON file."""
        with open(self.buildings_file, 'w') as f:
            json.dump(data, f, indent=2)

    def convert_time_format(self, time_str: str) -> Optional[str]:
        """Convert time string to 24-hour format."""
        if time_str == "LOCKED":
            return None

        time_str = time_str.strip()

        try:
            if ':' in time_str:
                return datetime.strptime(time_str, '%I:%M%p').strftime('%H:%M')
            return datetime.strptime(time_str, '%I%p').strftime('%H:%M')
        except ValueError as e:
            print(f"Error converting time: {time_str}")
            raise e

    def parse_building_hours(self, hours_dict: Dict[str, str]) -> Dict[str, Dict[str, Optional[str]]]:
        """Parse building hours into standardized format."""
        formatted_hours = {}

        for day_group, hours in hours_dict.items():
            if hours == "LOCKED":
                for day in self.days_mapping[day_group]:
                    formatted_hours[day] = {"open": None, "close": None}
                continue

            parts = hours.rsplit('-', 1)
            if len(parts) != 2:
                print(f"Invalid hours format: {hours}")
                continue

            start_time, end_time = parts
            start_time_24h = self.convert_time_format(start_time)
            end_time_24h = self.convert_time_format(end_time)

            for day in self.days_mapping[day_group]:
                formatted_hours[day] = {
                    "open": start_time_24h,
                    "close": end_time_24h
                }

        return formatted_hours

    def process(self) -> None:
        """Main process to add building hours."""
        # Load data
        buildings_data, hours_data = self.load_data()

        # Process each building
        buildings_updated = 0
        for building_name in buildings_data['buildings']:
            if building_name in hours_data:
                buildings_data['buildings'][building_name]['hours'] = \
                    self.parse_building_hours(hours_data[building_name])
                buildings_updated += 1
                print(f"Updated hours for: {building_name}")

        # Save updated data
        self.save_data(buildings_data)

        # Print summary
        print(f"\nProcessing complete!")
        print(f"Updated hours for {buildings_updated} buildings")

def main():
    processor = BuildingHoursProcessor()
    processor.process()

if __name__ == "__main__":
    main()
