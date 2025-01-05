from pathlib import Path
import json
from typing import Dict, Any

class BuildingDataFilter:
    def __init__(self):
        self.data_dir = Path(__file__).parent / "data"
        self.input_file = self.data_dir / "buildings.json"
        self.output_file = self.data_dir / "filtered_buildings.json"
        self.excluded_buildings = {
            "Temple Hoyne Buell Hall",
            "Krannert Center for Perf Arts"
        }
        self.min_rooms = 7

    def load_data(self) -> Dict[str, Any]:
        with open(self.input_file, 'r') as f:
            return json.load(f)

    def save_data(self, data: Dict[str, Any]) -> None:
        with open(self.output_file, 'w') as f:
            json.dump(data, f, indent=2)

    def filter_buildings(self, data: Dict[str, Any]) -> Dict[str, Any]:
        filtered_data = {
            "last_updated": data["last_updated"],
            "buildings": {}
        }

        for building, building_data in data['buildings'].items():
            if (len(building_data['rooms']) > self.min_rooms and
                building not in self.excluded_buildings):
                filtered_data['buildings'][building] = building_data
                print(f"Added {building} to filtered data")

        return filtered_data

    def process(self) -> None:
        data = self.load_data()

        filtered_data = self.filter_buildings(data)

        self.save_data(filtered_data)

        print(f"\nTotal buildings in filtered file: {len(filtered_data['buildings'])}")

def main():
    filter_processor = BuildingDataFilter()
    filter_processor.process()

if __name__ == "__main__":
    main()
