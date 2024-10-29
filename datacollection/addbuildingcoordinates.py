from pathlib import Path
import json
from typing import Dict, Any, List, Tuple

class BuildingCoordinateProcessor:
    def __init__(self):
        self.data_dir = Path(__file__).parent / "data"
        self.geojson_file = self.data_dir / "uiuc_buildings.geojson"
        self.buildings_file = self.data_dir / "filtered_buildings.json"

    def load_data(self) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """Load GeoJSON and building data from files."""
        with open(self.geojson_file, 'r') as f:
            geojson_data = json.load(f)

        with open(self.buildings_file, 'r') as f:
            building_data = json.load(f)

        return geojson_data, building_data

    def save_data(self, data: Dict[str, Any]) -> None:
        """Save updated building data to JSON file."""
        with open(self.buildings_file, 'w') as f:
            json.dump(data, f, indent=2)

    def create_coordinates_map(self, geojson_data: Dict[str, Any]) -> Dict[str, List[float]]:
        """Create mapping of building names to their coordinates."""
        coordinates_map = {}
        for feature in geojson_data['features']:
            building_name = feature['properties']['name']
            coordinates = feature['geometry']['coordinates']
            coordinates_map[building_name] = coordinates
        return coordinates_map

    def add_coordinates_to_buildings(
        self,
        building_data: Dict[str, Any],
        coordinates_map: Dict[str, List[float]]
    ) -> Tuple[Dict[str, Any], int]:
        """Add coordinates to building data."""
        buildings_updated = 0

        for building_name in building_data['buildings']:
            if building_name in coordinates_map:
                building_data['buildings'][building_name]['coordinates'] = {
                    'longitude': coordinates_map[building_name][0],
                    'latitude': coordinates_map[building_name][1]
                }
                buildings_updated += 1
                print(f"Added coordinates for: {building_name}")

        return building_data, buildings_updated

    def process(self) -> None:
        """Main process to add building coordinates."""
        # Load data
        geojson_data, building_data = self.load_data()

        # Create coordinates mapping
        coordinates_map = self.create_coordinates_map(geojson_data)

        # Add coordinates to buildings
        updated_data, buildings_updated = self.add_coordinates_to_buildings(
            building_data,
            coordinates_map
        )

        # Save updated data
        self.save_data(updated_data)

        # Print summary
        print(f"\nProcessing complete!")
        print(f"Added coordinates to {buildings_updated} buildings")

        # Print buildings without coordinates
        missing_coordinates = [
            name for name in building_data['buildings']
            if name not in coordinates_map
        ]
        if missing_coordinates:
            print("\nBuildings missing coordinates:")
            for name in missing_coordinates:
                print(f"- {name}")

def main():
    processor = BuildingCoordinateProcessor()
    processor.process()

if __name__ == "__main__":
    main()
