import json
import unittest

from pipeline_io import iter_json_chunks


class JsonChunkTests(unittest.TestCase):
    def test_chunks_preserve_rows_and_encoded_size_limit(self):
        rows = [{"value": "x" * 20, "index": index} for index in range(5)]

        chunks = list(iter_json_chunks(rows, max_bytes=90))

        self.assertEqual(
            [row for chunk in chunks for row in chunk],
            rows,
        )
        for chunk in chunks:
            encoded = json.dumps(chunk, separators=(",", ":")).encode("utf-8")
            self.assertLessEqual(len(encoded), 90)

    def test_rejects_a_row_larger_than_the_limit(self):
        with self.assertRaises(ValueError):
            list(iter_json_chunks([{"value": "x" * 100}], max_bytes=20))


if __name__ == "__main__":
    unittest.main()
