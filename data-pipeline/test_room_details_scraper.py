import unittest
from unittest.mock import patch

from room_details_scraper import (
    RoomIndex,
    parse_answers_building_page,
    parse_answers_room_number,
    parse_answers_room_page,
    scrape_answers_details,
    validate_answers_for_load,
)


def registrar_room(building_name: str, building_code: str, room_number: str) -> dict:
    return {
        "building_name": building_name,
        "building_code": building_code,
        "room_number": room_number,
    }


class AnswersParsingTests(unittest.TestCase):
    def test_building_page_only_returns_classroom_documents(self) -> None:
        html = """
        <div class="doc-body">
          <a href="page.php?id=10">Technology Enhanced Classrooms, Armory 101</a>
          <a href="page.php?id=11">IT Service Desk, FAA Calls and Classrooms</a>
          <a href="page.php?id=12">Technology Enhanced Presentation Space, Steps</a>
        </div>
        """

        self.assertEqual(
            parse_answers_building_page(html),
            [
                (
                    "Technology Enhanced Classrooms, Armory 101",
                    "https://answers.uillinois.edu/illinois/page.php?id=10",
                )
            ],
        )

    def test_room_number_preserves_ground_floor_prefix_and_drops_description(self) -> None:
        self.assertEqual(
            parse_answers_room_number(
                "Technology Enhanced Classrooms, LCLB G-18"
            ),
            "G-18",
        )
        self.assertEqual(
            parse_answers_room_number(
                "Technology Enhanced Classrooms, Lincoln Hall 1053 (Theater)"
            ),
            "1053",
        )

    def test_equipment_list_can_follow_intervening_markup(self) -> None:
        html = """
        <div class="doc-body">
          <h2>Equipment in this Technology Enhanced Classroom</h2>
          <p>Provided for instructors.</p>
          <ul><li>PC</li><li>HDMI</li></ul>
        </div>
        """

        self.assertEqual(
            parse_answers_room_page(html, "https://example.test/room")["equipment"],
            ["PC", "HDMI"],
        )

    def test_equipment_supports_legacy_bullet_paragraphs(self) -> None:
        html = """
        <div class="doc-body">
          <h2>Equipment in this Technology Enhanced Classroom</h2>
          <p>• PC</p><p>• HDMI</p>
          <h2>Useful links</h2><p>• Not equipment</p>
        </div>
        """

        self.assertEqual(
            parse_answers_room_page(html, "https://example.test/room")["equipment"],
            ["PC", "HDMI"],
        )

    def test_missing_equipment_list_is_a_parse_failure(self) -> None:
        with self.assertRaisesRegex(ValueError, "equipment list"):
            parse_answers_room_page(
                '<div class="doc-body"><h2>Useful links</h2></div>',
                "https://example.test/room",
            )


class RoomIndexTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rooms = [
            registrar_room("Materials Science & Eng Bld", "1MSEB", "100"),
            registrar_room("Literatures, Cultures, & Ling", "1LCLB", "G18"),
            registrar_room("Noyes Laboratory", "1NOYES", "157"),
            registrar_room("Foellinger Auditorium", "1FA", "AUD"),
            registrar_room("Lincoln Hall", "1LH", "THEAT"),
            registrar_room("Speech & Hearing Science Building", "1SHS", "110"),
        ]
        self.index = RoomIndex.from_rooms(self.rooms)

    def assert_resolves_to(
        self, expected_index: int, building_label: str, room_label: str
    ) -> None:
        self.assertIs(
            self.index.resolve(building_label, room_label), self.rooms[expected_index]
        )

    def test_prefers_answers_building_acronym(self) -> None:
        self.assert_resolves_to(
            0, "Materials Science and Engineering Building (MSEB)", "100"
        )
        self.assert_resolves_to(
            1, "Literature, Cultures, and Linguistics Building (LCLB)", "G-18"
        )

    def test_handles_explicit_source_aliases(self) -> None:
        self.assert_resolves_to(2, "Noyes Laboratory of Chemistry", "157")
        self.assert_resolves_to(3, "Foellinger Auditorium", "Auditorium")
        self.assert_resolves_to(4, "Lincoln Hall", "1053")
        self.assert_resolves_to(
            5, "Speech and Hearing Sciences Building (SHSB)", "110"
        )


class AnswersLoadValidationTests(unittest.TestCase):
    @patch("room_details_scraper.time.sleep")
    @patch("room_details_scraper.fetch_url")
    def test_failed_room_is_reported_and_left_unmodified(
        self, fetch_url, _sleep
    ) -> None:
        room = registrar_room("Armory", "1ARMRY", "101")
        room.update({"equipment": [], "photo_urls": [], "answers_url": None})
        fetch_url.side_effect = [
            '<div class="doc-body"><a href="100">Armory</a></div>',
            '<div class="doc-body"><a href="page.php?id=200">'
            "Technology Enhanced Classrooms, Armory 101</a></div>",
            RuntimeError("temporary failure"),
        ]

        stats = scrape_answers_details([room], request_delay=0)

        self.assertEqual(stats["failed_rooms"], 1)
        self.assertIsNone(room["answers_url"])
        with self.assertRaisesRegex(RuntimeError, "incomplete Answers crawl"):
            validate_answers_for_load(stats)

    def test_rejects_skipped_enrichment(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "without Answers enrichment"):
            validate_answers_for_load(None)

    def test_rejects_partial_enrichment(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "incomplete Answers crawl"):
            validate_answers_for_load(
                {"failed_buildings": 1, "failed_rooms": 2}
            )

    def test_accepts_complete_enrichment(self) -> None:
        validate_answers_for_load({"failed_buildings": 0, "failed_rooms": 0})


if __name__ == "__main__":
    unittest.main()
