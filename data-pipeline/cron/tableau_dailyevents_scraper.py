import os
from io import StringIO
from dotenv import load_dotenv, find_dotenv
from supabase.client import create_client
import pandas as pd
from curl_cffi import requests
from utils.buildingnames import alias_map


def get_supabase_client():
    """Initialize and return Supabase client.

    Returns:
        Client: Supabase client instance.
        
    Raises:
        ValueError: If Supabase URL or Key are not set.
    """
    load_dotenv(find_dotenv('.env.local'))
    
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    
    if not supabase_url or not supabase_key:
        raise ValueError("Supabase URL and Key must be set in .env.local")
    
    return create_client(supabase_url, supabase_key)


def get_events_df():
    """Fetch events data from a Tableau dashboard and processes it into a pandas DataFrame.

    Returns:
        DataFrame: Pandas DataFrame representing all events found in the Tableau
            dashboard with these columns: start_time, end_time, building, customer,
            customer_contact, event_name, room.
    """

    csv_url = "https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents.csv"

    response = requests.get(csv_url, impersonate='chrome124')
    csv_data = response.text
    print("Fetched data from Tableau")

    df = pd.read_csv(StringIO(csv_data))

    # Fix EndTime column, delete old one
    df["end_time"] = pd.to_datetime(
        df["EndTime"],
        format="%m/%d/%Y %I:%M:%S %p",
        errors='coerce'  # Convert invalid dates to NaT
    ).dt.tz_localize("America/Chicago", ambiguous='infer')
    df = df.drop("EndTime", axis=1)
    df = df.drop("Measure Values", axis=1)
    df = df.drop("Open/Close", axis=1)
    df = df.drop("CustomerContact", axis=1)
    df = df.drop("Measure Names", axis=1)
    
    # Create the 'start_time' attribute by combining 'StartDate' and 'StartTime'
    df["start_time"] = pd.to_datetime(
        df["StartDate"].astype(str) + " " + df["StartTime"].map(lambda s: s.split(" ", 1)[1] if isinstance(s, str) and " " in s else s),
        format="%m/%d/%Y %I:%M:%S %p",
        errors='coerce'  # Convert invalid dates to NaT
    ).dt.tz_localize("America/Chicago", ambiguous='infer')

    # Remove rows with invalid timestamps
    initial_count = len(df)
    df = df.dropna(subset=['start_time', 'end_time'])
    dropped_count = initial_count - len(df)
    if dropped_count > 0:
        print(f"Dropped {dropped_count} rows with invalid timestamps")

    df = df.drop(columns=["StartDate", "StartTime"])

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
    df["building_name"] = df["building_name"].map(lambda name: alias_map.get(str(name), str(name)))

    print("Finished processing data")

    return df


def load_to_postgres(df):
    """Loads the events data into a PostgreSQL database.

    Args:
        df (DataFrame): Pandas DataFrame containing events data.
    """
    supabase = get_supabase_client()

    # Get valid rooms from the database
    result = supabase.table('rooms').select('building_name,room_number').execute()
    valid_rooms = {(room['building_name'], room['room_number']) for room in result.data}

    events_to_insert = []
    invalid_events = []

    # Clear existing events
    try:
        supabase.table('daily_events').delete().gte('id', 0).execute()
        print("Cleared existing events")
    except Exception as e:
        print(f"Error clearing existing events: {str(e)}")

    for index, row in df.iterrows():
        building_name = row['building_name']
        room_number = row['room_number']
        event_name = row['event_name']
        start_time = row['start_time']
        end_time = row['end_time']
        occupant = row['occupant']
        
        # Check for missing or invalid data
        if pd.isna(start_time) or pd.isna(end_time):
            invalid_events.append({
                'building_name': building_name,
                'room_number': room_number,
                'event_name': event_name,
                'reason': 'Invalid timestamp'
            })
            continue
            
        if pd.isna(building_name) or pd.isna(room_number) or pd.isna(event_name):
            invalid_events.append({
                'building_name': str(building_name),
                'room_number': str(room_number),
                'event_name': str(event_name),
                'reason': 'Missing required fields'
            })
            continue
        
        # Check if room exists in database
        if (building_name, room_number) not in valid_rooms:
            print(f"Skipping room not in database: {building_name} - {room_number}")
            invalid_events.append({
                'building_name': building_name,
                'room_number': room_number,
                'event_name': event_name,
                'reason': 'Room not in database'
            })
            continue
        
        # Convert pandas timestamps to ISO format strings for Supabase
        try:
            start_time_str = start_time.isoformat()
            end_time_str = end_time.isoformat()
        except (ValueError, AttributeError) as e:
            invalid_events.append({
                'building_name': building_name,
                'room_number': room_number,
                'event_name': event_name,
                'reason': f'Timestamp conversion error: {e}'
            })
            continue
        
        events_to_insert.append({
            'building_name': str(building_name),
            'room_number': str(room_number),
            'event_name': str(event_name),
            'start_time': start_time_str,
            'end_time': end_time_str,
            'occupant': str(occupant) if pd.notna(occupant) else ''
        })

    if invalid_events:
        print(f"Skipped {len(invalid_events)} invalid events")

    # Insert events in batches
    if events_to_insert:
        try:
            supabase.table('daily_events').insert(events_to_insert).execute()
            print(f"Successfully inserted {len(events_to_insert)} events")
            return True
        except Exception as e:
            print(f"Error inserting events: {str(e)}")
            return False
    else:
        print("No valid events to insert")
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
    success = load_to_postgres(events)
    if not success:
        print("Failed Step 2: No valid events to insert")
    else:
        print("Finished Step 2")
    
    print("Step 3: Refresh Room Availability Cache")
    try:
        supabase = get_supabase_client()
        supabase.rpc('refresh_room_availability_cache', {}).execute()
        print("Finished Step 3: Cache refreshed")
    except Exception as e:
        print(f"Failed Step 3: Cache refresh error: {e}")
        # Don't fail the whole job if cache refresh fails, just log it

    print("Job complete!")

    return "Updated data"


if __name__ == "__main__":
    main()
