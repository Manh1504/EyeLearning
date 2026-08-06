import unittest

from pydantic import ValidationError

from web.routers.sessions import ClosePdfSessionRequest, _clamped_page


class SessionLifecycleTest(unittest.TestCase):
    def test_close_request_allows_only_complete_or_exit(self):
        self.assertEqual(
            ClosePdfSessionRequest(
                action="complete",
                last_page_number=3,
                max_page_number_seen=5,
            ).action,
            "complete",
        )
        with self.assertRaises(ValidationError):
            ClosePdfSessionRequest(
                action="finish",
                last_page_number=3,
                max_page_number_seen=5,
            )

    def test_page_numbers_are_clamped_to_pdf_bounds(self):
        self.assertEqual(_clamped_page(0, 10), 1)
        self.assertEqual(_clamped_page(99, 10), 10)
        self.assertEqual(_clamped_page(5, 10), 5)


if __name__ == "__main__":
    unittest.main()
