from datetime import datetime, timedelta, timezone
from io import BytesIO

from botocore.exceptions import ClientError

from app.core.config import settings
from app.services import media_storage


class _Paginator:
    def __init__(self, client):
        self.client = client

    def paginate(self, Bucket, Prefix):
        contents = [
            {"Key": key, "LastModified": value["modified"]}
            for key, value in self.client.objects.items()
            if key.startswith(Prefix)
        ]
        yield {"Contents": contents}


class _FakeR2:
    def __init__(self):
        self.objects = {}
        self.sequence = 0

    def put_object(self, Bucket, Key, Body, ContentType, CacheControl):
        self.sequence += 1
        self.objects[Key] = {
            "body": Body,
            "modified": datetime(2026, 1, 1, tzinfo=timezone.utc)
            + timedelta(seconds=self.sequence),
        }

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return _Paginator(self)

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey", "Message": "missing"}},
                "GetObject",
            )
        return {"Body": BytesIO(self.objects[Key]["body"])}

    def delete_objects(self, Bucket, Delete):
        for item in Delete["Objects"]:
            self.objects.pop(item["Key"], None)
        return {}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)


def _enable_r2(monkeypatch):
    values = {
        "r2_account_id": "account",
        "r2_bucket_name": "bucket",
        "r2_access_key_id": "access",
        "r2_secret_access_key": "secret",
        "r2_public_url": "https://slides.example.test",
    }
    for name, value in values.items():
        monkeypatch.setattr(settings, name, value)
    fake = _FakeR2()
    monkeypatch.setattr(media_storage, "_r2_client", lambda: fake)
    return fake


def test_r2_version_lifecycle(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    fake = _enable_r2(monkeypatch)
    lesson_id = "11111111-1111-1111-1111-111111111111"

    old_source = f"lessons/{lesson_id}/aaaaaaaaaaaa/source.pdf"
    new_source = f"lessons/{lesson_id}/bbbbbbbbbbbb/source.pdf"
    new_slide = f"lessons/{lesson_id}/bbbbbbbbbbbb/slide_001.jpg"
    media_storage.put_bytes(old_source, b"old", "application/pdf")
    media_storage.put_bytes(new_source, b"new", "application/pdf")
    url = media_storage.put_bytes(new_slide, b"jpeg", "image/jpeg")

    assert url == f"https://slides.example.test/{new_slide}"
    assert media_storage.key_from_url(url) == new_slide
    assert media_storage.load_source_pdf(lesson_id, "bbbbbbbbbbbb") == b"new"
    assert media_storage.load_source_pdf(lesson_id, "cccccccccccc") is None

    media_storage.prune_lesson_versions(lesson_id, "bbbbbbbbbbbb")
    assert old_source not in fake.objects
    assert new_source in fake.objects
    assert new_slide in fake.objects

    media_storage.clear_lesson(lesson_id)
    assert fake.objects == {}


def test_partial_r2_configuration_is_rejected(monkeypatch):
    for name in (
        "r2_account_id",
        "r2_bucket_name",
        "r2_access_key_id",
        "r2_secret_access_key",
        "r2_public_url",
    ):
        monkeypatch.setattr(settings, name, "")
    monkeypatch.setattr(settings, "r2_bucket_name", "bucket")

    try:
        settings.r2_enabled
    except RuntimeError as exc:
        assert "R2" in str(exc)
    else:
        raise AssertionError("Partial R2 configuration must fail")
