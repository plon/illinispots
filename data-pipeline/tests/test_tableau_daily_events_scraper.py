import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1] / "cron"))
from tableau_dailyevents_scraper import load_to_postgres, parse_events_df


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


class TableauEventParsingTests(unittest.TestCase):
    @staticmethod
    def source_row(start_time):
        return {
            "EndTime": "01/05/2026 11:00:00 AM",
            "StartDate": "01/05/2026",
            "StartTime": start_time,
            "Measure Values": "",
            "Open/Close": "",
            "CustomerContact": "",
            "Measure Names": "",
            "Building": "Siebel Center",
            "Customer": "CS",
            "EventName": "Talk",
            "Room": "1404",
        }

    def test_accepts_clock_only_and_date_prefixed_start_times(self):
        source = pd.DataFrame(
            [
                self.source_row("10:00:00 AM"),
                self.source_row("01/05/2026 10:00:00 AM"),
            ]
        )

        events = parse_events_df(source)

        self.assertEqual(len(events), 2)
        self.assertEqual(
            [timestamp.hour for timestamp in events["start_time"]],
            [10, 10],
        )

    def test_rejects_a_nonempty_all_invalid_snapshot(self):
        source = pd.DataFrame([self.source_row("not a time")])

        with self.assertRaisesRegex(RuntimeError, "All Tableau rows"):
            parse_events_df(source)


class DailyEventLoadTests(unittest.TestCase):
    @staticmethod
    def event(**overrides):
        event = {
            "building_name": "Siebel Center",
            "room_number": "1404",
            "event_name": "Talk",
            "start_time": pd.Timestamp("2026-01-05T10:00:00-06:00"),
            "end_time": pd.Timestamp("2026-01-05T11:00:00-06:00"),
            "occupant": "CS",
        }
        event.update(overrides)
        return event

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

    def test_inconsistent_database_counts_fail_the_load(self):
        events = pd.DataFrame([self.event()])
        supabase = FakeSupabase(
            {"inserted_events": 5, "unloadable_events": 0}
        )

        self.assertFalse(load_to_postgres(events, supabase))

    def test_combines_invalid_and_unknown_room_counts(self):
        events = pd.DataFrame(
            [
                self.event(building_name=None),
                self.event(room_number="9999"),
            ]
        )
        supabase = FakeSupabase(
            {"inserted_events": 0, "unloadable_events": 1}
        )

        self.assertEqual(
            load_to_postgres(events, supabase),
            {"inserted_events": 0, "unloadable_events": 2},
        )


if __name__ == "__main__":
    unittest.main()
