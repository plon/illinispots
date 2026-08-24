import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from dotenv import find_dotenv, load_dotenv
from sentry_monitor import emit_gauges

from supabase import create_client

load_dotenv(find_dotenv(".env.local"))

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SECRET_KEY")
if not supabase_url or not supabase_key:
    raise ValueError("Supabase URL and SUPABASE_SECRET_KEY must be set in .env.local")

supabase = create_client(supabase_url, supabase_key)


class DataValidationError(Exception):
    pass


def validate_json_structure(json_data: Dict) -> None:
    if "buildings" not in json_data:
        raise DataValidationError("Missing 'buildings' key in JSON")

    required_building_keys = {"hours", "coordinates", "rooms"}
    required_hours_keys = {
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    }
    required_class_keys = {"course", "title", "time", "days", "start_date", "end_date"}

    for building_name, building_data in json_data["buildings"].items():
        missing_keys = required_building_keys - set(building_data.keys())
        if missing_keys:
            raise DataValidationError(
                f"Building '{building_name}' missing keys: {missing_keys}"
            )

        missing_days = required_hours_keys - set(building_data["hours"].keys())
        if missing_days:
            raise DataValidationError(
                f"Building '{building_name}' missing hours for days: {missing_days}"
            )

        for room_number, classes in building_data["rooms"].items():
            if not isinstance(classes, list):
                raise DataValidationError(
                    f"Room '{room_number}' in '{building_name}' classes should be a list"
                )

            for class_info in classes:
                missing_class_keys = required_class_keys - set(class_info.keys())
                if missing_class_keys:
                    raise DataValidationError(
                        f"Class in room '{room_number}', building '{building_name}' missing keys: {missing_class_keys}"
                    )


def validate_academic_terms_structure(terms_data: List[Dict]) -> None:
    required_keys = {"academic_year", "term", "part_of_term", "start_date", "end_date"}
    valid_parts_of_term = {"A", "B"}

    for term in terms_data:
        missing_keys = required_keys - set(term.keys())
        if missing_keys:
            raise DataValidationError(f"Academic term missing keys: {missing_keys}")

        if term["part_of_term"] not in valid_parts_of_term:
            raise DataValidationError(f"Invalid part_of_term: {term['part_of_term']}")

        try:
            start_date = datetime.strptime(term["start_date"], "%Y-%m-%d").date()
            end_date = datetime.strptime(term["end_date"], "%Y-%m-%d").date()
            if end_date <= start_date:
                raise DataValidationError(
                    f"End date must be after start date for term: {term}"
                )
        except ValueError as e:
            raise DataValidationError(f"Invalid date format in term: {term}") from e


def prepare_and_validate_data(
    json_data: Dict,
) -> tuple[List[Dict], List[Dict], List[Dict]]:
    buildings = []
    rooms = []
    schedules = []

    room_keys = set()

    for name, data in json_data["buildings"].items():
        building = {
            "name": name,
            "latitude": data["coordinates"]["latitude"],
            "longitude": data["coordinates"]["longitude"],
            "monday_open": data["hours"]["monday"]["open"],
            "monday_close": data["hours"]["monday"]["close"],
            "tuesday_open": data["hours"]["tuesday"]["open"],
            "tuesday_close": data["hours"]["tuesday"]["close"],
            "wednesday_open": data["hours"]["wednesday"]["open"],
            "wednesday_close": data["hours"]["wednesday"]["close"],
            "thursday_open": data["hours"]["thursday"]["open"],
            "thursday_close": data["hours"]["thursday"]["close"],
            "friday_open": data["hours"]["friday"]["open"],
            "friday_close": data["hours"]["friday"]["close"],
            "saturday_open": data["hours"]["saturday"]["open"],
            "saturday_close": data["hours"]["saturday"]["close"],
            "sunday_open": data["hours"]["sunday"]["open"],
            "sunday_close": data["hours"]["sunday"]["close"],
        }
        buildings.append(building)

        for room_number, classes in data["rooms"].items():
            room_key = (name, room_number)
            if room_key in room_keys:
                raise DataValidationError(
                    f"Duplicate room found: {room_number} in {name}"
                )

            room_keys.add(room_key)
            rooms.append({"building_name": name, "room_number": room_number})

            for class_info in classes:
                for day in class_info["days"]:
                    schedules.append(
                        {
                            "building_name": name,
                            "room_number": room_number,
                            "course_code": class_info["course"],
                            "course_title": class_info["title"],
                            "start_time": class_info["time"]["start"],
                            "end_time": class_info["time"]["end"],
                            "day_of_week": day,
                            "start_date": class_info["start_date"],
                            "end_date": class_info["end_date"],
                        }
                    )

    return buildings, rooms, schedules


def verify_data_counts(
    json_data: Dict, buildings: List[Dict], rooms: List[Dict], schedules: List[Dict]
) -> None:
    expected_buildings = len(json_data["buildings"])
    expected_rooms = sum(len(b["rooms"]) for b in json_data["buildings"].values())
    expected_schedules = sum(
        sum(len(class_info["days"]) for class_info in classes)
        for building in json_data["buildings"].values()
        for classes in building["rooms"].values()
    )

    if len(buildings) != expected_buildings:
        raise DataValidationError(
            f"Building count mismatch. Expected: {expected_buildings}, Got: {len(buildings)}"
        )
    if len(rooms) != expected_rooms:
        raise DataValidationError(
            f"Room count mismatch. Expected: {expected_rooms}, Got: {len(rooms)}"
        )
    if len(schedules) != expected_schedules:
        raise DataValidationError(
            f"Schedule count mismatch. Expected: {expected_schedules}, Got: {len(schedules)}"
        )


def get_metric_attributes(data_dir: Path) -> Dict[str, object]:
    """Read optional schedule dimensions without making metrics block a load."""
    attributes: Dict[str, object] = {"pipeline": "course-explorer-weekly"}
    try:
        with open(data_dir / "subjects.json", "r") as subject_file:
            subject_metadata = json.load(subject_file)
        attributes["academic_year"] = subject_metadata.get("year", "unknown")
        attributes["term"] = subject_metadata.get("term", "unknown")
    except (OSError, AttributeError, json.JSONDecodeError) as error:
        print(f"Unable to read metric dimensions from subjects.json: {error}")
    return attributes


def main():
    try:
        data_dir = Path(__file__).parent / "data"
        print("Warning: This script will clear all data in the database.")
        print("Loading and validating JSON data...")

        with open(data_dir / "buildings_enriched.json", "r") as f:
            json_data = json.load(f)

        with open(data_dir / "academic_calendar.json", "r") as f:
            academic_terms_data = json.load(f)

        validate_json_structure(json_data)
        validate_academic_terms_structure(academic_terms_data)
        print("JSON structures validated successfully")

        print("\nPreparing and validating data...")
        buildings, rooms, schedules = prepare_and_validate_data(json_data)
        if not buildings or not rooms or not schedules:
            raise DataValidationError(
                "Generated course dataset is empty; refusing to clear database tables"
            )
        verify_data_counts(json_data, buildings, rooms, schedules)
        print("Data preparation validated successfully")

        print("\nAtomically replacing course data...")
        response = supabase.rpc(
            "replace_course_data",
            {
                "buildings_data": buildings,
                "rooms_data": rooms,
                "schedules_data": schedules,
                "academic_terms_data": academic_terms_data,
            },
        ).execute()
        database_counts = response.data
        if not isinstance(database_counts, dict):
            raise DataValidationError(
                f"Database returned an invalid load result: {database_counts}"
            )

        expected_counts = {
            "class_schedule_rows": len(schedules),
            "academic_terms": len(academic_terms_data),
        }
        for field, expected_count in expected_counts.items():
            if database_counts.get(field) != expected_count:
                raise DataValidationError(
                    f"Database count mismatch for {field}. Expected: "
                    f"{expected_count}, Got: {database_counts.get(field)}"
                )
        if database_counts.get("buildings", 0) < len(buildings):
            raise DataValidationError("Database contains fewer buildings than the load")
        if database_counts.get("rooms", 0) < len(rooms):
            raise DataValidationError("Database contains fewer rooms than the load")
        print("Course data replaced and count-verified in one transaction")

        print("\nFinal Summary:")
        print(f"Academic terms inserted and verified: {len(academic_terms_data)}")
        print(f"Buildings from current data processed (upserted): {len(buildings)}")
        print(f"Rooms from current data processed (upserted): {len(rooms)}")
        print(f"Class schedules inserted and verified: {len(schedules)}")
        print(
            "\nAll data has been successfully processed and relevant tables verified!"
        )

        emit_gauges(
            {
                "pipeline.database.buildings": database_counts["buildings"],
                "pipeline.database.rooms": database_counts["rooms"],
                "pipeline.database.class_schedule_rows": database_counts[
                    "class_schedule_rows"
                ],
                "pipeline.database.academic_terms": database_counts[
                    "academic_terms"
                ],
                "pipeline.load.buildings": len(buildings),
                "pipeline.load.rooms": len(rooms),
                "pipeline.load.class_schedule_rows": len(schedules),
                "pipeline.load.academic_terms": len(academic_terms_data),
            },
            get_metric_attributes(data_dir),
        )

    except DataValidationError as e:
        print(f"\nData Validation Error: {str(e)}")
        raise
    except Exception as e:
        print(f"\nUnexpected Error: {str(e)}")
        raise


if __name__ == "__main__":
    main()
