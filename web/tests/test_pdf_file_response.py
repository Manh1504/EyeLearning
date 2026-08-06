import tempfile
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.responses import FileResponse

sys.modules.setdefault("pypdf", types.SimpleNamespace(PdfReader=object))

from web.services.pdf_lesson_service import pdf_file_response


class PdfFileResponseTest(unittest.TestCase):
    def test_serves_file_inside_pdf_upload_root(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "pdf_lessons"
            pdf_path = root / "C001" / "lesson.pdf"
            pdf_path.parent.mkdir(parents=True)
            pdf_path.write_bytes(b"%PDF-1.4\n")

            with patch("web.services.pdf_lesson_service.PDF_UPLOAD_DIR", root):
                response = pdf_file_response("C001/lesson.pdf")

        self.assertIsInstance(response, FileResponse)

    def test_rejects_path_traversal_storage_key(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "pdf_lessons"
            root.mkdir()
            secret = Path(tmpdir) / "secret.txt"
            secret.write_text("secret")

            with patch("web.services.pdf_lesson_service.PDF_UPLOAD_DIR", root):
                with self.assertRaises(HTTPException) as ctx:
                    pdf_file_response("../secret.txt")

        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
