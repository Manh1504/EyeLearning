import mimetypes
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from pypdf import PdfReader
from web.config import DATA_DIR

PDF_UPLOAD_DIR = DATA_DIR / "uploads" / "pdf_lessons"
MAX_PDF_BYTES = 100 * 1024 * 1024
PDF_MIME_TYPES = {"application/pdf", "application/x-pdf"}


def _safe_name(name: str) -> str:
    return "".join(char if char.isalnum() or char in "._-" else "_" for char in name).strip("._") or "lesson.pdf"


def validate_pdf_upload(upload: UploadFile, file_bytes: bytes) -> None:
    filename = upload.filename or ""
    extension = Path(filename).suffix.lower()
    content_type = (upload.content_type or "").lower()
    guessed_type = mimetypes.guess_type(filename)[0]

    if extension == ".pptx":
        raise HTTPException(status_code=400, detail="Please export the PowerPoint file as PDF before uploading.")
    if extension != ".pdf":
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file PDF.")
    if content_type and content_type not in PDF_MIME_TYPES:
        raise HTTPException(status_code=400, detail="MIME type không hợp lệ. Chỉ chấp nhận PDF.")
    if guessed_type and guessed_type not in PDF_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Phần mở rộng file không khớp với PDF.")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File PDF rỗng.")
    if len(file_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="File PDF vượt quá giới hạn 100MB.")
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Nội dung file không phải PDF hợp lệ.")


def extract_pdf_page_count(path: Path) -> int:
    with path.open("rb") as handle:
        reader = PdfReader(handle)
        return len(reader.pages)


def store_pdf_file(course_id: str, upload: UploadFile, file_bytes: bytes) -> tuple[str, Path]:
    safe_original = _safe_name(upload.filename or "lesson.pdf")
    storage_key = f"{course_id}/{uuid4().hex}_{safe_original}"
    path = PDF_UPLOAD_DIR / storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(file_bytes)
    return storage_key, path


def replace_pdf_file(storage_key: str, upload: UploadFile, file_bytes: bytes) -> Path:
    safe_original = _safe_name(upload.filename or "lesson.pdf")
    path = PDF_UPLOAD_DIR / storage_key
    replacement = path.with_name(f"{path.stem}_{safe_original}")
    replacement.parent.mkdir(parents=True, exist_ok=True)
    replacement.write_bytes(file_bytes)
    if path.exists():
        path.unlink()
    replacement.rename(path)
    return path


def pdf_file_response(storage_key: str) -> FileResponse:
    path = (PDF_UPLOAD_DIR / storage_key).resolve()
    root = PDF_UPLOAD_DIR.resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="PDF file not found")
    return FileResponse(path, media_type="application/pdf", filename=path.name)
