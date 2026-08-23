import os
import random
import time
from io import StringIO

import pandas as pd
from curl_cffi import requests
from dotenv import find_dotenv, load_dotenv
from sentry_monitor import emit_gauges
from supabase.client import create_client
from utils.buildingnames import alias_map

TABLEAU_CSV_URL = "https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents.csv"
TABLEAU_REQUEST_ATTEMPTS = 10
TABLEAU_REQUEST_TIMEOUT = 60
TABLEAU_RETRY_BACKOFF_SECONDS = 5
TABLEAU_RETRY_MAX_BACKOFF_SECONDS = 240


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


def load_to_postgres(df, supabase=None):
    """Loads the events data into a PostgreSQL database.

    Args:
        df (DataFrame): Pandas DataFrame containing events data.

    Returns:
        dict | bool: Inserted and unloadable event counts, or False when no
            events were inserted.
    """
    if supabase is None:
        supabase = get_supabase_client()

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

    # Validate room references and replace the snapshot in one database call.
    # An empty validated snapshot must still clear yesterday's events.
    try:
        response = supabase.rpc(
            "replace_daily_events", {"events_data": events_to_insert}
        ).execute()
        database_counts = response.data
        if not isinstance(database_counts, dict):
            raise RuntimeError(f"Database returned invalid counts: {database_counts}")

        inserted_event_count = database_counts.get("inserted_events")
        unknown_room_count = database_counts.get("unloadable_events")
        if (
            not isinstance(inserted_event_count, int)
            or not isinstance(unknown_room_count, int)
            or inserted_event_count + unknown_room_count != len(events_to_insert)
        ):
            raise RuntimeError(f"Database returned invalid counts: {database_counts}")

        unloadable_event_count = invalid_event_count + unknown_room_count
        if unknown_room_count:
            print(f"Skipped {unknown_room_count} events for rooms not in database")

        if inserted_event_count:
            print(f"Successfully inserted {inserted_event_count} events")
            return {
                "inserted_events": inserted_event_count,
                "unloadable_events": unloadable_event_count,
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
    supabase = get_supabase_client()
    load_counts = load_to_postgres(events, supabase)
    if not load_counts:
        raise RuntimeError("Failed Step 2: No valid events were inserted")

    print("Finished Step 2")
    
    print("Step 3: Refresh Room Availability Cache")
    try:
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
