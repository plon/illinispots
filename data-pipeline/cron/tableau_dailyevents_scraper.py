import os
import random
import time
from io import StringIO
from dotenv import load_dotenv, find_dotenv
from supabase.client import create_client
import pandas as pd
from curl_cffi import requests
from utils.buildingnames import alias_map
from sentry_monitor import emit_gauges


TABLEAU_CSV_URL = "https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents.csv"
TABLEAU_REQUEST_ATTEMPTS = 10
TABLEAU_REQUEST_TIMEOUT = 60
TABLEAU_RETRY_BACKOFF_SECONDS = 5
TABLEAU_RETRY_MAX_BACKOFF_SECONDS = 240
ROOM_QUERY_PAGE_SIZE = 1000


def get_supabase_client():
    """Initialize and return Supabase client.

    Returns:
        Client: Supabase client instance.
        
    Raises:
        ValueError: If Supabase URL or Key are not set.
    """
    load_dotenv(find_dotenv('.env.local'))
    
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SECRET_KEY")
    
    if not supabase_url or not supabase_key:
        raise ValueError("Supabase URL and SUPABASE_SECRET_KEY must be set in .env.local")
    return create_client(supabase_url, supabase_key)


def get_events_df():
    """Fetch events data from a Tableau dashboard and processes it into a pandas DataFrame.

    Returns:
        DataFrame: Pandas DataFrame representing all events found in the Tableau
            dashboard with these columns: start_time, end_time, building, customer,
            customer_contact, event_name, room.
    """

    for attempt in range(1, TABLEAU_REQUEST_ATTEMPTS + 1):
        try:
            response = requests.get(
                TABLEAU_CSV_URL,
                impersonate="chrome124",
                timeout=TABLEAU_REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            csv_data = response.text
            break
        except requests.exceptions.RequestException as exc:
            if attempt == TABLEAU_REQUEST_ATTEMPTS:
                raise RuntimeError(
                    f"Unable to fetch Tableau daily events after "
                    f"{TABLEAU_REQUEST_ATTEMPTS} attempts"
                ) from exc

            delay = min(
                TABLEAU_RETRY_BACKOFF_SECONDS * (2 ** (attempt - 1)),
                TABLEAU_RETRY_MAX_BACKOFF_SECONDS,
            )
            sleep_for = random.uniform(delay / 2, delay)
            print(
                f"Tableau request failed (attempt {attempt}/"
                f"{TABLEAU_REQUEST_ATTEMPTS}): {exc}. "
                f"Retrying in {sleep_for:.0f} seconds"
            )
            time.sleep(sleep_for)

    print("Fetched data from Tableau")

    df = pd.read_csv(StringIO(csv_data))

    # Fix EndTime column, delete old one
    df["end_time"] = pd.to_datetime(
        df["EndTime"],
        format="%m/%d/%Y %I:%M:%S %p",
        errors="coerce",  # Convert invalid dates to NaT
    ).dt.tz_localize("America/Chicago", ambiguous="infer")

    # Create the 'start_time' attribute by combining 'StartDate' and 'StartTime'
    start_clock = df["StartTime"].map(
        lambda value: value.split(" ", 1)[1]
        if isinstance(value, str) and " " in value
        else value
    )
    df["start_time"] = pd.to_datetime(
        df["StartDate"].astype(str) + " " + start_clock,
        format="%m/%d/%Y %I:%M:%S %p",
        errors="coerce",  # Convert invalid dates to NaT
    ).dt.tz_localize("America/Chicago", ambiguous="infer")

    # Remove rows with invalid timestamps
    initial_count = len(df)
    df = df.dropna(subset=["start_time", "end_time"])
    dropped_count = initial_count - len(df)
    if dropped_count > 0:
        print(f"Dropped {dropped_count} rows with invalid timestamps")

    df = df.drop(
        columns=[
            "EndTime",
            "Measure Values",
            "Open/Close",
            "CustomerContact",
            "Measure Names",
            "StartDate",
            "StartTime",
        ]
    )

    df = df.rename(
        columns={
            "Building": "building_name",
            "Customer": "occupant",
            # "CustomerContact": "customer_contact",
            "EventName": "event_name",
            "Room": "room_number",
        }
    )

    # Normalize building names using alias map
    df["building_name"] = df["building_name"].map(
        lambda name: alias_map.get(str(name), str(name))
    )
    df.attrs["tableau_rows"] = initial_count
    df.attrs["invalid_timestamp_events"] = dropped_count

    print("Finished processing data")

    return df


def load_to_postgres(df):
    """Loads the events data into a PostgreSQL database.

    Args:
        df (DataFrame): Pandas DataFrame containing events data.

    Returns:
        dict | bool: Inserted and unloadable event counts, or False when no
            events were inserted.
    """
    supabase = get_supabase_client()

    # PostgREST caps response pages. Fetch every room so a growing room catalog
    # cannot silently make otherwise valid events look unloadable.
    valid_rooms = set()
    offset = 0
    while True:
        result = (
            supabase.table("rooms")
            .select("building_name,room_number")
            .order("building_name")
            .order("room_number")
            .range(offset, offset + ROOM_QUERY_PAGE_SIZE - 1)
            .execute()
        )
        valid_rooms.update(
            (room["building_name"], room["room_number"]) for room in result.data
        )
        if len(result.data) < ROOM_QUERY_PAGE_SIZE:
            break
        offset += ROOM_QUERY_PAGE_SIZE

    events_to_insert = []
    invalid_event_count = 0

    event_columns = [
        "building_name",
        "room_number",
        "event_name",
        "start_time",
        "end_time",
        "occupant",
    ]
    for (
        building_name,
        room_number,
        event_name,
        start_time,
        end_time,
        occupant,
    ) in df[event_columns].itertuples(index=False, name=None):
        # Check for missing or invalid data
        if pd.isna(start_time) or pd.isna(end_time):
            invalid_event_count += 1
            continue

        if pd.isna(building_name) or pd.isna(room_number) or pd.isna(event_name):
            invalid_event_count += 1
            continue

        # Check if room exists in database
        if (building_name, room_number) not in valid_rooms:
            print(f"Skipping room not in database: {building_name} - {room_number}")
            invalid_event_count += 1
            continue

        # Convert pandas timestamps to ISO format strings for Supabase
        try:
            start_time_str = start_time.isoformat()
            end_time_str = end_time.isoformat()
        except (ValueError, AttributeError):
            invalid_event_count += 1
            continue

        events_to_insert.append(
            {
                "building_name": str(building_name),
                "room_number": str(room_number),
                "event_name": str(event_name),
                "start_time": start_time_str,
                "end_time": end_time_str,
                "occupant": str(occupant) if pd.notna(occupant) else "",
            }
        )

    if invalid_event_count:
        print(f"Skipped {invalid_event_count} invalid events")

    # Replace the snapshot atomically in PostgreSQL. The RPC returns a tiny
    # status value instead of echoing every inserted row over the network. An
    # empty validated snapshot must still clear yesterday's events.
    try:
        response = supabase.rpc(
            "update_daily_events", {"events_data": events_to_insert}
        ).execute()
        expected_status = f"SUCCESS:{len(events_to_insert)}"
        if response.data != expected_status:
            raise RuntimeError(f"Database rejected daily events: {response.data}")

        if events_to_insert:
            print(f"Successfully inserted {len(events_to_insert)} events")
            return {
                "inserted_events": len(events_to_insert),
                "unloadable_events": invalid_event_count,
            }

        print("No valid events to insert")
        return False
    except Exception as e:
        print(f"Error inserting events: {str(e)}")
        return False


def main():
    """Main function to scrape daily events and load them to PostgreSQL.

    Returns:
        str: Confirmation message.
    """

    print("Step 1: Process data from Tableau dashboard")
    
    events = get_events_df()
    print("Finished Step 1")
    

    print("Step 2: Load data to PostgreSQL")
    load_counts = load_to_postgres(events)
    if not load_counts:
        raise RuntimeError("Failed Step 2: No valid events were inserted")

    print("Finished Step 2")
    
    print("Step 3: Refresh Room Availability Cache")
    try:
        supabase = get_supabase_client()
        supabase.rpc('refresh_room_availability_cache', {}).execute()
        print("Finished Step 3: Cache refreshed")
    except Exception as e:
        print(f"Failed Step 3: Cache refresh error: {e}")
        raise

    invalid_timestamp_events = events.attrs.get("invalid_timestamp_events", 0)
    unloadable_events = load_counts["unloadable_events"]
    emit_gauges(
        {
            "pipeline.data.tableau_rows": events.attrs.get("tableau_rows", len(events)),
            "pipeline.data.valid_timestamp_events": len(events),
            "pipeline.database.daily_events": load_counts["inserted_events"],
            "pipeline.data.invalid_timestamp_events": invalid_timestamp_events,
            "pipeline.data.unloadable_events": unloadable_events,
            "pipeline.data.skipped_events": (
                invalid_timestamp_events + unloadable_events
            ),
        },
        {"pipeline": "tableau-daily-events"},
    )

    print("Job complete!")

    return "Updated data"


if __name__ == "__main__":
    main()
