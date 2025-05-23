from pathlib import Path
from supabase import create_client
import json
from typing import List, Dict, Set
from datetime import datetime
import os
from dotenv import load_dotenv,find_dotenv

load_dotenv(find_dotenv('.env.local'))

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

CHUNK_SIZE = 1000

class DataValidationError(Exception):
    pass

def validate_json_structure(json_data: Dict) -> None:
    if 'buildings' not in json_data:
        raise DataValidationError("Missing 'buildings' key in JSON")

    required_building_keys = {'hours', 'coordinates', 'rooms'}
    required_hours_keys = {'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'}
    required_class_keys = {'course', 'title', 'time', 'days', 'start_date', 'end_date'}

    for building_name, building_data in json_data['buildings'].items():
        missing_keys = required_building_keys - set(building_data.keys())
        if missing_keys:
            raise DataValidationError(f"Building '{building_name}' missing keys: {missing_keys}")

        missing_days = required_hours_keys - set(building_data['hours'].keys())
        if missing_days:
            raise DataValidationError(f"Building '{building_name}' missing hours for days: {missing_days}")

        for room_number, classes in building_data['rooms'].items():
            if not isinstance(classes, list):
                raise DataValidationError(f"Room '{room_number}' in '{building_name}' classes should be a list")

            for class_info in classes:
                missing_class_keys = required_class_keys - set(class_info.keys())
                if missing_class_keys:
                    raise DataValidationError(
                        f"Class in room '{room_number}', building '{building_name}' missing keys: {missing_class_keys}"
                    )

def validate_academic_terms_structure(terms_data: List[Dict]) -> None:
    required_keys = {'academic_year', 'term', 'part_of_term', 'start_date', 'end_date'}
    valid_parts_of_term = {'A', 'B'}

    for term in terms_data:
        missing_keys = required_keys - set(term.keys())
        if missing_keys:
            raise DataValidationError(f"Academic term missing keys: {missing_keys}")

        if term['part_of_term'] not in valid_parts_of_term:
            raise DataValidationError(f"Invalid part_of_term: {term['part_of_term']}")

        try:
            start_date = datetime.strptime(term['start_date'], '%Y-%m-%d').date()
            end_date = datetime.strptime(term['end_date'], '%Y-%m-%d').date()
            if end_date <= start_date:
                raise DataValidationError(f"End date must be after start date for term: {term}")
        except ValueError as e:
            raise DataValidationError(f"Invalid date format in term: {term}") from e

def prepare_and_validate_data(json_data: Dict) -> tuple[List[Dict], List[Dict], List[Dict]]:
    buildings = []
    rooms = []
    schedules = []

    building_names = set()
    room_keys = set()

    for name, data in json_data['buildings'].items():
        building = {
            'name': name,
            'latitude': data['coordinates']['latitude'],
            'longitude': data['coordinates']['longitude'],
            'monday_open': data['hours']['monday']['open'],
            'monday_close': data['hours']['monday']['close'],
            'tuesday_open': data['hours']['tuesday']['open'],
            'tuesday_close': data['hours']['tuesday']['close'],
            'wednesday_open': data['hours']['wednesday']['open'],
            'wednesday_close': data['hours']['wednesday']['close'],
            'thursday_open': data['hours']['thursday']['open'],
            'thursday_close': data['hours']['thursday']['close'],
            'friday_open': data['hours']['friday']['open'],
            'friday_close': data['hours']['friday']['close'],
            'saturday_open': data['hours']['saturday']['open'],
            'saturday_close': data['hours']['saturday']['close'],
            'sunday_open': data['hours']['sunday']['open'],
            'sunday_close': data['hours']['sunday']['close']
        }
        buildings.append(building)
        building_names.add(name)

        for room_number, classes in data['rooms'].items():
            room_key = (name, room_number)
            if room_key in room_keys:
                raise DataValidationError(f"Duplicate room found: {room_number} in {name}")

            room_keys.add(room_key)
            rooms.append({
                'building_name': name,
                'room_number': room_number
            })

            for class_info in classes:
                for day in class_info['days']:
                    schedules.append({
                        'building_name': name,
                        'room_number': room_number,
                        'course_code': class_info['course'],
                        'course_title': class_info['title'],
                        'start_time': class_info['time']['start'],
                        'end_time': class_info['time']['end'],
                        'day_of_week': day,
                        'start_date': class_info['start_date'],
                        'end_date': class_info['end_date']
                    })

    return buildings, rooms, schedules

def verify_data_counts(json_data: Dict, buildings: List[Dict], rooms: List[Dict], schedules: List[Dict]) -> None:
    expected_buildings = len(json_data['buildings'])
    expected_rooms = sum(len(b['rooms']) for b in json_data['buildings'].values())
    expected_schedules = sum(
        sum(len(class_info['days']) for class_info in classes)
        for building in json_data['buildings'].values()
        for classes in building['rooms'].values()
    )

    if len(buildings) != expected_buildings:
        raise DataValidationError(f"Building count mismatch. Expected: {expected_buildings}, Got: {len(buildings)}")
    if len(rooms) != expected_rooms:
        raise DataValidationError(f"Room count mismatch. Expected: {expected_rooms}, Got: {len(rooms)}")
    if len(schedules) != expected_schedules:
        raise DataValidationError(f"Schedule count mismatch. Expected: {expected_schedules}, Got: {len(schedules)}")

def bulk_insert(table_name: str, records: List[Dict], upsert: bool = False) -> Set:
    inserted_ids = set()
    failed_chunks = []

    for i in range(0, len(records), CHUNK_SIZE):
        chunk = records[i:i + CHUNK_SIZE]
        chunk_num = i // CHUNK_SIZE + 1
        total_chunks = (len(records) + CHUNK_SIZE - 1) // CHUNK_SIZE

        try:
            if upsert:
                response = supabase.table(table_name).upsert(chunk).execute()
                print(f"Processed (upsert) chunk {chunk_num}/{total_chunks} for {table_name}")
            else:
                response = supabase.table(table_name).insert(chunk).execute()
                print(f"Inserted chunk {chunk_num}/{total_chunks} into {table_name}")

            current_count = supabase.table(table_name).select('*', count='exact').execute().count
            print(f"Current total count in {table_name} after chunk: {current_count}")

            for record in chunk:
                if table_name == 'buildings':
                    key = record['name']
                elif table_name == 'rooms':
                    key = f"{record['building_name']}_{record['room_number']}"
                elif table_name == 'academic_terms':
                    key = f"{record['academic_year']}_{record['term']}_{record['start_date']}_{record['end_date']}"
                else:  # class_schedule
                    key = f"{record['building_name']}_{record['room_number']}_{record['day_of_week']}_{record['start_time']}_{record['start_date']}_{record['end_date']}"
                inserted_ids.add(key)

        except Exception as e:
            print(f"Error processing chunk {chunk_num}/{total_chunks} for {table_name} (Operation: {'upsert' if upsert else 'insert'})")
            print(f"Error details: {str(e)}")
            failed_chunks.append((i, chunk))

    if failed_chunks:
        raise DataValidationError(f"Failed to process {len(failed_chunks)} chunks for {table_name}")

    final_db_count_for_table = supabase.table(table_name).select('*', count='exact').execute().count

    if upsert:
        print(f"Successfully processed (upserted) {len(records)} records from the current batch for {table_name}. Final table count: {final_db_count_for_table}")
    else:
        # For insert-only (cleared tables), final count should match len(records).
        if final_db_count_for_table != len(records):
            raise DataValidationError(
                f"Final count mismatch in {table_name} (cleared table). Expected: {len(records)}, Got: {final_db_count_for_table}"
            )
        print(f"Successfully inserted and verified {final_db_count_for_table} records in {table_name}")

    return inserted_ids

def verify_database_contents(buildings: List[Dict], rooms: List[Dict], schedules: List[Dict]) -> None:
    db_buildings_count_response = supabase.table('buildings').select('*', count='exact').execute()
    actual_building_count_in_db = db_buildings_count_response.count
    # For buildings, we expect AT LEAST the number of buildings from the current dataset to be present,
    # as buildings are preserved across loads.
    if actual_building_count_in_db < len(buildings):
        raise DataValidationError(
            f"Building count issue in database. Expected at least: {len(buildings)} (from current data), Got: {actual_building_count_in_db}"
        )
    print(f"Verified buildings count in DB: {actual_building_count_in_db} (current dataset has {len(buildings)} buildings)")

    db_rooms_count_response = supabase.table('rooms').select('*', count='exact').execute()
    actual_room_count_in_db = db_rooms_count_response.count
    # For rooms, we expect AT LEAST the number of rooms from the current dataset to be present,
    # as rooms are preserved across loads.
    if actual_room_count_in_db < len(rooms):
        raise DataValidationError(
            f"Room count issue in database. Expected at least: {len(rooms)} (from current data), Got: {actual_room_count_in_db}"
        )
    print(f"Verified rooms count in DB: {actual_room_count_in_db} (current dataset has {len(rooms)} rooms)")

    db_schedules_count = supabase.table('class_schedule').select('*', count='exact').execute()
    schedule_count = db_schedules_count.count
    if schedule_count != len(schedules):
        raise DataValidationError(
            f"Schedule count mismatch in database. Expected: {len(schedules)}, Got: {schedule_count}"
        )
    print(f"Verified schedules count: {schedule_count}")

    print("All count verifications passed successfully!")

def clear_table(table_name: str) -> None:
    """Clear all records from a table safely."""
    primary_keys = {
        'daily_events': 'id',
        'buildings': 'name',
        'rooms': 'building_name',
        'class_schedule': 'building_name',
        'academic_terms': 'academic_year'
    }

    try:
        # Delete all records where primary key is not null
        key = primary_keys[table_name]
        supabase.table(table_name).delete().not_.is_(key, 'null').execute()

        count = supabase.table(table_name).select('*', count='exact').execute().count
        if count != 0:
            raise DataValidationError(f"Failed to clear table {table_name}. {count} records remaining.")
        print(f"Successfully cleared table {table_name}")
    except Exception as e:
        print(f"Error clearing table {table_name}: {str(e)}")
        raise

def main():
    try:
        data_dir = Path(__file__).parent / "data"
        print("Warning: This script will clear all data in the database.")
        print("Loading and validating JSON data...")

        with open(data_dir / 'filtered_buildings.json', 'r') as f:
            json_data = json.load(f)

        with open(data_dir / 'academic_calendar.json', 'r') as f:
            academic_terms_data = json.load(f)

        validate_json_structure(json_data)
        validate_academic_terms_structure(academic_terms_data)
        print("JSON structures validated successfully")

        print("\nPreparing and validating data...")
        buildings, rooms, schedules = prepare_and_validate_data(json_data)
        verify_data_counts(json_data, buildings, rooms, schedules)
        print("Data preparation validated successfully")

        print("\nClearing existing data...")
        # Clear tables and verify
        # 'buildings' and 'rooms' are not cleared to preserve them across updates.
        # Rooms are upserted. Buildings will also be upserted.
        tables_to_clear = ['daily_events', 'class_schedule', 'academic_terms']
        for table in tables_to_clear:
            clear_table(table)
        print("Relevant tables cleared successfully (buildings and rooms preserved)")

        print("\nInserting and verifying data...")

        academic_terms_ids = bulk_insert('academic_terms', academic_terms_data)
        print(f"Inserted {len(academic_terms_ids)} academic terms")

        building_ids = bulk_insert('buildings', buildings, upsert=True)
        print(f"Processed {len(building_ids)} buildings from current data (upserted)")

        room_ids = bulk_insert('rooms', rooms, upsert=True)
        print(f"Processed {len(room_ids)} rooms from current data (upserted)")

        schedule_ids = bulk_insert('class_schedule', schedules)
        print(f"Inserted {len(schedule_ids)} schedules")

        print("\nPerforming final database verification...")
        verify_database_contents(buildings, rooms, schedules)

        db_terms_count = supabase.table('academic_terms').select('*', count='exact').execute()
        if db_terms_count.count != len(academic_terms_data):
            raise DataValidationError(
                f"Academic terms count mismatch. Expected: {len(academic_terms_data)}, Got: {db_terms_count.count}"
            )
        print(f"Verified academic terms count: {db_terms_count.count}")

        print("\nFinal Summary:")
        print(f"Academic terms inserted and verified: {len(academic_terms_ids)}")
        print(f"Buildings from current data processed (upserted): {len(building_ids)}")
        print(f"Rooms from current data processed (upserted): {len(room_ids)}")
        print(f"Class schedules inserted and verified: {len(schedule_ids)}")
        print("\nAll data has been successfully processed and relevant tables verified!")

    except DataValidationError as e:
        print(f"\nData Validation Error: {str(e)}")
    except Exception as e:
        print(f"\nUnexpected Error: {str(e)}")
        raise e

if __name__ == "__main__":
    main()
