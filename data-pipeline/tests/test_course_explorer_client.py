import unittest

from course_explorer_client import ProxyRotator


class ProxyRotatorTests(unittest.TestCase):
    def test_rotates_after_configured_uses_and_removes_failed_proxy(self):
        first = {"http": "http://first", "https": "http://first"}
        second = {"http": "http://second", "https": "http://second"}
        rotator = ProxyRotator(
            [first, second],
            rotate_every=2,
            max_failures=1,
        )

        self.assertEqual(rotator.peek(), first)
        rotator.record_use()
        self.assertEqual(rotator.peek(), first)
        rotator.record_use()
        self.assertEqual(rotator.peek(), second)

        rotator.mark_failure_current()

        self.assertEqual(rotator.size(), 1)
        self.assertEqual(rotator.peek(), first)


if __name__ == "__main__":
    unittest.main()
