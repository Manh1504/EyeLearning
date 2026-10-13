import logging
import re
import uuid
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageError(RuntimeError):
    pass


@lru_cache
def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )


def _safe_local_path(key: str) -> Path:
    path = settings.media_path / key
    try:
        path.resolve().relative_to(settings.media_path.resolve())
    except ValueError as exc:
        raise StorageError("Đường dẫn media không hợp lệ") from exc
    return path


def public_url(key: str) -> str:
    if settings.r2_enabled:
        return f'{settings.r2_public_url.rstrip("/")}/{quote(key, safe="/")}'
    return f"/media/{quote(key, safe='/')}"


def put_bytes(key: str, data: bytes, content_type: str) -> str:
    if not settings.r2_enabled:
        target = _safe_local_path(key)
        temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary.write_bytes(data)
            temporary.replace(target)
        except OSError as exc:
            temporary.unlink(missing_ok=True)
            raise StorageError("Không thể lưu tệp vào volume") from exc
        return public_url(key)

    cache_control = (
        "public, max-age=31536000, immutable"
        if content_type.startswith("image/")
        else "public, max-age=3600"
    )
    try:
        _r2_client().put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl=cache_control,
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("Không thể tải tệp lên R2") from exc
    return public_url(key)


def _r2_keys(prefix: str) -> list[dict]:
    objects: list[dict] = []
    try:
        paginator = _r2_client().get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.r2_bucket_name, Prefix=prefix):
            objects.extend(page.get("Contents", []))
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("Không thể đọc danh sách tệp trên R2") from exc
    return objects


def _delete_r2_keys(keys: list[str]) -> None:
    try:
        for start in range(0, len(keys), 1000):
            batch = keys[start : start + 1000]
            if batch:
                response = _r2_client().delete_objects(
                    Bucket=settings.r2_bucket_name,
                    Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
                )
                if response.get("Errors"):
                    raise StorageError("R2 không xóa được một số tệp")
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("Không thể xóa tệp trên R2") from exc


def delete_prefix(prefix: str) -> None:
    if settings.r2_enabled:
        _delete_r2_keys([item["Key"] for item in _r2_keys(prefix)])
    local = _safe_local_path(prefix)
    try:
        if local.is_dir():
            from shutil import rmtree

            rmtree(local)
        elif local.is_file():
            local.unlink(missing_ok=True)
    except OSError as exc:
        raise StorageError("Không thể xóa tệp khỏi volume") from exc


def clear_lesson(lesson_id: str) -> None:
    delete_prefix(f"lessons/{lesson_id}/")


def cleanup_version(lesson_id: str, version: str) -> None:
    delete_prefix(f"lessons/{lesson_id}/{version}/")


def prune_lesson_versions(lesson_id: str, keep_version: str) -> None:
    prefix = f"lessons/{lesson_id}/"
    keep_prefix = f"{prefix}{keep_version}/"
    if settings.r2_enabled:
        stale = [item["Key"] for item in _r2_keys(prefix) if not item["Key"].startswith(keep_prefix)]
        _delete_r2_keys(stale)

    lesson_dir = _safe_local_path(prefix)
    if lesson_dir.is_dir():
        from shutil import rmtree

        try:
            for child in lesson_dir.iterdir():
                if child.is_dir() and child.name != keep_version:
                    rmtree(child)
        except OSError as exc:
            raise StorageError("Không thể dọn version cũ khỏi volume") from exc


def _get_r2_bytes(key: str) -> bytes | None:
    try:
        response = _r2_client().get_object(Bucket=settings.r2_bucket_name, Key=key)
        return response["Body"].read()
    except ClientError as exc:
        if str(exc.response.get("Error", {}).get("Code")) in {"NoSuchKey", "404"}:
            return None
        raise StorageError("Không thể đọc tệp từ R2") from exc
    except BotoCoreError as exc:
        raise StorageError("Không thể đọc tệp từ R2") from exc


def load_source_pdf(lesson_id: str, version: str | None = None) -> bytes | None:
    prefix = f"lessons/{lesson_id}/"
    if settings.r2_enabled:
        if version is not None:
            source = _get_r2_bytes(f"{prefix}{version}/source.pdf")
            if source is not None:
                return source

    lesson_dir = _safe_local_path(prefix)
    if version is not None:
        exact = lesson_dir / version / "source.pdf"
        if exact.is_file():
            try:
                return exact.read_bytes()
            except OSError as exc:
                raise StorageError("Không thể đọc PDF nguồn từ volume") from exc
        return None
    if settings.r2_enabled:
        candidates = [
            item for item in _r2_keys(prefix) if item["Key"].endswith("/source.pdf")
        ]
        if candidates:
            latest = max(candidates, key=lambda item: item["LastModified"])
            return _get_r2_bytes(latest["Key"])
    if not lesson_dir.is_dir():
        return None
    candidates = [path for path in lesson_dir.rglob("source.pdf") if path.is_file()]
    if not candidates:
        return None
    candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    try:
        return candidates[0].read_bytes()
    except OSError as exc:
        raise StorageError("Không thể đọc PDF nguồn từ volume") from exc


def key_from_url(url: str) -> str | None:
    if url.startswith("/media/"):
        return unquote(url.removeprefix("/media/"))
    if settings.r2_enabled:
        public = urlparse(settings.r2_public_url)
        parsed = urlparse(url)
        if parsed.scheme == public.scheme and parsed.netloc == public.netloc:
            return unquote(parsed.path.lstrip("/"))
    return None


def version_from_url(url: str, lesson_id: str) -> str | None:
    key = key_from_url(url)
    if key is None:
        return None
    match = re.fullmatch(
        rf"lessons/{re.escape(lesson_id)}/([0-9a-f]{{12}})/slide_\d{{3}}\.jpg",
        key,
    )
    return match.group(1) if match else None


def log_cleanup_failure(action: str, exc: Exception) -> None:
    logger.warning("Media cleanup failed during %s: %s", action, type(exc).__name__)
