from unittest.mock import MagicMock

from storage import FileStorage


def test_r2_object_key_uses_normalized_bucket_env(monkeypatch):
    monkeypatch.setenv("R2_BUCKET_NAME", "course-slides")
    storage = FileStorage.__new__(FileStorage)
    storage.provider = "r2"
    storage._load_object = MagicMock(return_value=b"slide")

    assert storage.load("lessons/slide-1.png") == b"slide"
    storage._load_object.assert_called_once_with(
        "r2", "course-slides", "lessons/slide-1.png"
    )


def test_local_media_url_resolves_inside_mounted_root(monkeypatch, tmp_path):
    slide = tmp_path / "lessons" / "slide.png"
    slide.parent.mkdir()
    slide.write_bytes(b"slide")
    monkeypatch.setenv("STORAGE_PROVIDER", "local")
    monkeypatch.setenv("LOCAL_MEDIA_DIR", str(tmp_path))
    storage = FileStorage()
    try:
        assert storage.load("/media/lessons/slide.png") == b"slide"
    finally:
        storage.http.close()


def test_storage_rejects_untrusted_http_and_file_urls(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCAL_MEDIA_DIR", str(tmp_path))
    storage = FileStorage()
    try:
        for source in ("http://127.0.0.1/private", "https://example.com/slide", "file:///etc/passwd"):
            try:
                storage.load(source)
            except ValueError:
                pass
            else:
                raise AssertionError(f"Expected source to be rejected: {source}")
    finally:
        storage.http.close()
