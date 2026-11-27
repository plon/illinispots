import unittest
from unittest.mock import Mock, patch

import pandas as pd

from cron import tableau_dailyevents_scraper as scraper


class TableauDailyEventsTest(unittest.TestCase):
    def test_empty_csv_snapshot_clears_events_and_refreshes_cache(self):
        response = Mock(
            status_code=200,
            headers={"Content-Type": "text/csv; charset=utf-8"},
            text="\r\n",
        )
        supabase = Mock()
        supabase.table.return_value.select.return_value.execute.return_value.data = []
        with (
            patch.object(scraper.requests, "get", side_effect=[response, response]) as get,
            patch.object(scraper.time, "sleep"),
            patch.object(scraper, "get_supabase_client", return_value=supabase),
            patch.object(scraper, "write_github_summary") as summary,
            patch.object(scraper, "emit_gauges"),
        ):
            scraper.main()

        self.assertEqual(get.call_count, 2)
        supabase.table.return_value.delete.return_value.gte.return_value.execute.assert_called_once()
        supabase.table.return_value.insert.assert_not_called()
        supabase.rpc.assert_called_once_with("refresh_room_availability_cache", {})
        summary.assert_called_once_with(0, 0, 0, 0, 0, 0)

    def test_transient_empty_csv_uses_data_from_retry(self):
        empty = Mock(status_code=200, headers={"Content-Type": "text/csv"}, text="\r\n")
        populated = Mock(
            status_code=200,
            headers={"Content-Type": "text/csv"},
            text=(
                "EndTime,Measure Values,Open/Close,CustomerContact,Measure Names,"
                "StartDate,StartTime,Building,Customer,EventName,Room\n"
                "11/26/2026 02:00:00 PM,,,,,11/26/2026,11/26/2026 01:00:00 PM,Armory,,Meeting,101\n"
            ),
        )
        with (
            patch.object(scraper.requests, "get", side_effect=[empty, populated]),
            patch.object(scraper.time, "sleep") as sleep,
        ):
            events = scraper.get_events_df()

        self.assertEqual(events["event_name"].tolist(), ["Meeting"])
        sleep.assert_called_once()

    def test_unrecognized_empty_responses_fail(self):
        for status, content_type, body in [
            (200, "text/csv", ""),
            (200, "text/html", "\r\n"),
            (204, "text/csv", "\r\n"),
        ]:
            with self.subTest(status=status, content_type=content_type, body=body):
                response = Mock(
                    status_code=status,
                    headers={"Content-Type": content_type},
                    text=body,
                )
                with patch.object(scraper.requests, "get", return_value=response):
                    with self.assertRaises(pd.errors.EmptyDataError):
                        scraper.get_events_df()
