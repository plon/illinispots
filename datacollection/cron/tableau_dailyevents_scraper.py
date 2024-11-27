import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from seleniumbase import SB
import time
import traceback
import gzip
from utils.tableauparser import TableauDataParser
import json
import re
from supabase.client import create_client
from dotenv import load_dotenv
import os

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

load_dotenv()

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

def wait_for_specific_request(sb, timeout: int = 30) -> bool:
    start_time = time.time()
    target_url_pattern = 'DailyEventSummary/v/DailyEvents/bootstrapSession/sessions/'

    while time.time() - start_time < timeout:
        for request in sb.driver.requests:
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

            with SB(wire=True, test=False, headless=True) as sb:
                sb.driver.get("https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents")
                if wait_for_specific_request(sb, timeout):
                    for request in sb.driver.requests:
                        if 'vizql/w/DailyEventSummary/v/DailyEvents/bootstrapSession/sessions/' in request.url:
                            if request.response and request.response.headers:
                                for header_name, header_value in request.response.headers.items():
                                    if 'x-session-id' in header_name.lower():
                                        return request

                logging.warning(f"Session ID not found in attempt {attempt + 1}")

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

                print(json.dumps(all_data, indent=4, ensure_ascii=False))

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
