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
            patch.object(scraper.requests, "get", return_value=response),
            patch.object(scraper, "get_supabase_client", return_value=supabase),
            patch.object(scraper, "write_github_summary") as summary,
            patch.object(scraper, "emit_gauges"),
        ):
            scraper.main()

        supabase.table.return_value.delete.return_value.gte.return_value.execute.assert_called_once()
        supabase.table.return_value.insert.assert_not_called()
        supabase.rpc.assert_called_once_with("refresh_room_availability_cache", {})
        summary.assert_called_once_with(0, 0, 0, 0, 0, 0)

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
