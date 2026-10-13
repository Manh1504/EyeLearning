import os

from app.core.config import settings
from app.scripts.migrate_media_to_r2 import _key_for_legacy_url


def test_legacy_url_resolves_to_newest_uploaded_version(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    lesson_id = "11111111-1111-1111-1111-111111111111"
    old_key = f"lessons/{lesson_id}/aaaaaaaaaaaa/slide_001.jpg"
    new_key = f"lessons/{lesson_id}/bbbbbbbbbbbb/slide_001.jpg"

    old_path = tmp_path / old_key
    new_path = tmp_path / new_key
    old_path.parent.mkdir(parents=True)
    new_path.parent.mkdir(parents=True)
    old_path.write_bytes(b"old")
    new_path.write_bytes(b"new")
    os.utime(old_path, (1, 1))
    os.utime(new_path, (2, 2))

    resolved = _key_for_legacy_url(
        f"/media/lessons/{lesson_id}/slide_001.jpg", {old_key, new_key}
    )

    assert resolved == new_key
