import os
import unittest
from unittest.mock import patch

from web.dev.seed_pdf_teacher_analytics import ensure_seed_allowed


class SeedPdfTeacherAnalyticsGuardTest(unittest.TestCase):
    def test_allows_non_production(self):
        with patch.dict(os.environ, {"APP_ENV": "development"}, clear=False):
            ensure_seed_allowed()

    def test_blocks_production_without_override(self):
        with patch.dict(os.environ, {"APP_ENV": "production"}, clear=False):
            with self.assertRaises(RuntimeError):
                ensure_seed_allowed()

    def test_allows_production_with_override(self):
        with patch.dict(os.environ, {"APP_ENV": "production", "ALLOW_PRODUCTION_DEV_SEED": "true"}, clear=False):
            ensure_seed_allowed()
