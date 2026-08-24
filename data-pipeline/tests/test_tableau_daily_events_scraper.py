import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1] / "cron"))
from tableau_dailyevents_scraper import load_to_postgres


class FakeRpcResponse:
    def __init__(self, data):
        self.data = data


class FakeRpcCall:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return FakeRpcResponse(self.data)


class FakeSupabase:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def rpc(self, procedure, parameters):
        self.calls.append((procedure, parameters))
        return FakeRpcCall(self.result)


class DailyEventLoadTests(unittest.TestCase):
    def test_empty_snapshot_is_a_successful_replacement(self):
        events = pd.DataFrame(
            columns=[
                "building_name",
                "room_number",
                "event_name",
                "start_time",
                "end_time",
                "occupant",
            ]
        )
        supabase = FakeSupabase(
            {"inserted_events": 0, "unloadable_events": 0}
        )

        result = load_to_postgres(events, supabase)

        self.assertEqual(
            result,
            {"inserted_events": 0, "unloadable_events": 0},
        )
        self.assertEqual(
            supabase.calls,
            [("replace_daily_events", {"events_data": []})],
        )


if __name__ == "__main__":
    unittest.main()
