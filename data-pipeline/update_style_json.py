# illinispots/data-pipeline/update_style_json.py

import json
from pathlib import Path

def update_style_json_source():
    """
    Updates the 'uiuc_buildings' source data in style.json
    using the content from uiuc_buildings.geojson.
    """
    try:
        script_dir = Path(__file__).parent
        project_root = script_dir.parent

        geojson_path = script_dir / "data" / "uiuc_buildings.geojson"
        style_json_path = project_root / "public" / "map" / "style.json"

        print(f"Source GeoJSON: {geojson_path.resolve()}")
        print(f"Target Style JSON: {style_json_path.resolve()}")

        if not geojson_path.exists():
            print(f"Error: Source GeoJSON file not found at {geojson_path}")
            return

        with open(geojson_path, 'r', encoding='utf-8') as f_geojson:
            source_data = json.load(f_geojson)
        print("Successfully loaded source GeoJSON.")

        if not style_json_path.exists():
            print(f"Error: Target style JSON file not found at {style_json_path}")
            return

        with open(style_json_path, 'r', encoding='utf-8') as f_style:
            style_data = json.load(f_style)
        print("Successfully loaded target style JSON.")

        if 'sources' not in style_data:
            print("Error: 'sources' key not found in style.json.")
            return
        if 'uiuc_buildings' not in style_data['sources']:
            print("Error: 'uiuc_buildings' source not found in style.json sources.")
            return
        if 'data' not in style_data['sources']['uiuc_buildings']:
            print("Error: 'data' key not found within 'uiuc_buildings' source in style.json.")
            return

        style_data['sources']['uiuc_buildings']['data'] = source_data
        print("Updated 'uiuc_buildings' source data in style JSON object.")

        if 'features' in source_data:
            print("Buildings being added:")
            for feature in source_data['features']:
                if 'properties' in feature and 'name' in feature['properties']:
                    print(f"  - {feature['properties']['name']}")
                else:
                    print("  - (Unnamed building)")

        with open(style_json_path, 'w', encoding='utf-8') as f_style:
            json.dump(style_data, f_style, indent=4)
        print(f"Successfully updated and saved {style_json_path.name}")

    except FileNotFoundError as e:
        print(f"Error: File not found - {e}")
    except json.JSONDecodeError as e:
        print(f"Error: Could not decode JSON - {e}")
    except KeyError as e:
        print(f"Error: Missing expected key in JSON structure - {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise

if __name__ == "__main__":
    print("Running update_style_json.py...")
    update_style_json_source()
    print("Script finished.")
