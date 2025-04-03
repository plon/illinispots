import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from seleniumwire import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
import time
import traceback
import gzip
from utils.tableauparser import TableauDataParser
import json
import re
from supabase import create_client
import os
from dotenv import load_dotenv, find_dotenv

log_dir = Path(__file__).parent / "logs"
log_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_dir / f'tableau_scraper_{datetime.now(timezone.utc).strftime("%Y%m%d")}.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

load_dotenv(find_dotenv('.env.local'))

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

def wait_for_specific_request(driver, timeout: int = 30) -> bool:
    start_time = time.time()
    target_url_pattern = 'DailyEventSummary/v/DailyEvents/bootstrapSession/sessions/'

    while time.time() - start_time < timeout:
        for request in driver.requests:
            if target_url_pattern in request.url:
                if request.response and request.response.headers:
                    logging.info("Found target request!")
                    return True
        time.sleep(0.5)

    logging.warning(f"Target request not found within {timeout} seconds")
    return False

def get_tableau_session(max_retries: int = 3, timeout: int = 30):
    """
    Attempts to get Tableau session information and returns the request object
    """
    for attempt in range(max_retries):
        try:
            logging.info(f"Attempt {attempt + 1} of {max_retries}")

            options = Options()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.binary_location = "/usr/bin/chromium-browser"
            service = Service('/usr/bin/chromedriver')

            driver = webdriver.Chrome(
                service=service,
                options=options,
                seleniumwire_options={}
            )

            try:
                driver.get("https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents")
                if wait_for_specific_request(driver, timeout):
                    for request in driver.requests:
                        if 'vizql/w/DailyEventSummary/v/DailyEvents/bootstrapSession/sessions/' in request.url:
                            if request.response and request.response.headers:
                                for header_name, header_value in request.response.headers.items():
                                    if 'x-session-id' in header_name.lower():
                                        return request
                logging.warning(f"Session ID not found in attempt {attempt + 1}")
            finally:
                driver.quit()

        except Exception as e:
            logging.error(f"Error in attempt {attempt + 1}: {str(e)}")
            logging.error(traceback.format_exc())

        if attempt < max_retries - 1:
            sleep_time = (attempt + 1) * 5
            logging.info(f"Waiting {sleep_time} seconds before next attempt...")
            time.sleep(sleep_time)

    return None

def decompress_response(request) -> str:
    try:
        if not request or not request.response:
            logging.error("No valid response in request object")
            return ""

        content_encoding = request.response.headers.get('content-encoding', '').lower()

        if content_encoding == 'gzip':
            try:
                decompressed_content = gzip.decompress(request.response.body).decode('utf-8')
                logging.debug("Successfully decompressed gzipped content")
                return decompressed_content
            except Exception as e:
                logging.error(f"Failed to decompress gzipped content: {str(e)}")
                raise
        else:
            return request.response.body.decode('utf-8')

    except Exception as e:
        logging.error(f"Error processing response: {str(e)}")
        logging.error(traceback.format_exc())
        raise

def load_events_to_db(event_data):
    result = supabase.table('rooms').select('building_name,room_number').execute()
    valid_rooms = {(room['building_name'], room['room_number']) for room in result.data}

    events_to_insert = []
    invalid_events = []
    today_str = datetime.now(timezone.utc).date().isoformat()

    try:
        delete_result = supabase.table('daily_events').delete().neq('event_name', 'dummy_value_to_avoid_error_on_empty_delete').execute()
        logging.info(f"Cleared existing events (Result: {delete_result})")
    except Exception as e:
        logging.error(f"Error clearing existing events: {str(e)}")
        logging.error(traceback.format_exc())

    skipped_rooms = set()

    for building_name, building_data in event_data.get('buildings', {}).items():
        for room_number, events in building_data.get('rooms', {}).items():
            if (building_name, room_number) in valid_rooms:
                for event in events:
                    start_str = event.get('time', {}).get('start') # Expected format: HH:MM
                    end_str = event.get('time', {}).get('end')     # Expected format: HH:MM

                    if not start_str or not end_str:
                        logging.warning(f"Skipping event due to missing start/end time in {building_name} room {room_number}: {event.get('event_name')}")
                        invalid_events.append({
                            'building_name': building_name,
                            'room_number': room_number,
                            'event_name': event.get('event_name', 'N/A'),
                            'occupant': event.get('occupant', 'N/A'),
                            'start_time': start_str or 'Missing',
                            'end_time': end_str or 'Missing',
                            'event_date': today_str,
                            'reason': 'Missing time data'
                        })
                        continue

                    try:
                        start_time_obj = datetime.strptime(start_str, '%H:%M').time()
                        end_time_obj = datetime.strptime(end_str, '%H:%M').time()

                        event_payload = {
                            'building_name': building_name,
                            'room_number': room_number,
                            'event_name': event.get('event_name'),
                            'occupant': event.get('occupant'),
                            'start_time': start_str, # Store as HH:MM
                            'end_time': end_str,     # Store as HH:MM
                            'event_date': today_str
                        }

                        if start_time_obj < end_time_obj:
                            events_to_insert.append(event_payload)
                        else:
                            logging.warning(f"Skipping event with start time not before end time in {building_name} room {room_number}: {event.get('event_name')} ({start_str} - {end_str})")
                            event_payload['reason'] = 'Start time not before end time'
                            invalid_events.append(event_payload)

                    except ValueError as e:
                        logging.error(f"Invalid time format for event in {building_name} room {room_number}: {str(e)}")
                        logging.error(f"Problematic time strings: start='{start_str}', end='{end_str}'")
                        invalid_events.append({
                            'building_name': building_name,
                            'room_number': room_number,
                            'event_name': event.get('event_name', 'N/A'),
                            'occupant': event.get('occupant', 'N/A'),
                            'start_time': start_str,
                            'end_time': end_str,
                            'event_date': today_str,
                            'reason': f'Time parsing error: {e}'
                        })
            else:
                if (building_name, room_number) not in skipped_rooms:
                     logging.warning(f"Skipping room not in database: {building_name} - {room_number}")
                     skipped_rooms.add((building_name, room_number))

    if invalid_events:
        logging.warning(f"Skipped {len(invalid_events)} invalid or problematic events:")
        for event in invalid_events:
             logging.warning(
                f"- {event['building_name']}, Room {event['room_number']}: "
                f"{event.get('event_name', 'N/A')} ({event.get('start_time', 'N/A')} - {event.get('end_time', 'N/A')}) "
                f"Reason: {event.get('reason', 'Unknown')}"
            )

    successful_inserts = 0
    failed_inserts = []

    if events_to_insert:
        logging.info(f"Attempting to insert {len(events_to_insert)} valid events...")
        try:
            insert_result = supabase.table('daily_events').insert(events_to_insert).execute()
            successful_inserts = len(events_to_insert)
            logging.info(f"Successfully inserted {successful_inserts} events.")

        except Exception as e:
            logging.error(f"Batch insert failed: {str(e)}")
            logging.error(traceback.format_exc())
            failed_inserts = [(event, str(e)) for event in events_to_insert]

        if failed_inserts:
             logging.warning(f"Failed to insert {len(failed_inserts)} events:")
             for event, error in failed_inserts:
                 logging.warning(
                     f"- {event['building_name']}, Room {event['room_number']}: "
                     f"{event['event_name']} ({event['start_time']} - {event['end_time']})"
                     f"\n  Error: {error}"
                 )
             successful_inserts = len(events_to_insert) - len(failed_inserts)

        logging.info(f"Database upload summary: {successful_inserts} successful, {len(failed_inserts)} failed.")
        return successful_inserts > 0
    else:
        logging.info("No valid events found to insert.")
        return False

if __name__ == "__main__":
    try:
        logging.info("Starting Tableau session scraper")
        request = get_tableau_session()

        if request:
            logging.info("Successfully retrieved request:")
            logging.info(f"URL: {request.url}")
            logging.info(f"Session ID: {request.response.headers.get('x-session-id')}")

            content = decompress_response(request)
            dataReg = re.search(r"\d+;({.*})\d+;({.*})", content, re.MULTILINE)
            if dataReg:
                data = dataReg.group(2)
            else:
                logging.error("Failed to find data pattern in content")
                sys.exit(1)
            try:
                json_data = json.loads(data)
                parser = TableauDataParser(json_data)
                all_data = parser.to_dict()

                logging.info("Parsed data successfully, attempting database upload...")

                if load_events_to_db(all_data):
                    logging.info("Successfully uploaded events to database")
                else:
                    logging.error("Failed to upload events to database")
                    sys.exit(1)

                logging.info(f"Final parsed data:\n{json.dumps(all_data, indent=4, ensure_ascii=False)}")

            except json.JSONDecodeError as e:
                logging.error(f"Failed to parse JSON content: {str(e)}")
                sys.exit(1)

        else:
            logging.error("Failed to retrieve session info after all attempts")
            sys.exit(1)

    except Exception as e:
        logging.error(f"Critical error in main execution: {str(e)}")
        logging.error(traceback.format_exc())
        sys.exit(1)
