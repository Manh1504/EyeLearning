"""Upload media hiện có lên R2 và đổi image_url từ /media sang public URL.

Chạy thử:
    python -m app.scripts.migrate_media_to_r2

Thực thi:
    python -m app.scripts.migrate_media_to_r2 --apply
"""

import argparse
import asyncio
import mimetypes
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.course import LessonContent
from app.services import media_storage


def _local_files() -> list[Path]:
    if not settings.media_path.is_dir():
        return []
    files = [path for path in settings.media_path.rglob("*") if path.is_file()]
    return sorted(files, key=lambda path: path.stat().st_mtime)


def _upload_file(path: Path) -> str:
    key = path.relative_to(settings.media_path).as_posix()
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    media_storage.put_bytes(key, path.read_bytes(), content_type)
    return key


def _key_for_legacy_url(url: str, uploaded: set[str]) -> str | None:
    key = media_storage.key_from_url(url)
    if key in uploaded:
        return key
    if key is None:
        return None

    parts = key.split("/")
    if len(parts) == 3 and parts[0] == "lessons":
        lesson_id, filename = parts[1], parts[2]
        suffix = f"/{filename}"
        candidates = [
            item
            for item in uploaded
            if item.startswith(f"lessons/{lesson_id}/") and item.endswith(suffix)
        ]
        if candidates:
            candidates.sort(
                key=lambda item: (settings.media_path / item).stat().st_mtime,
                reverse=True,
            )
            return candidates[0]
    return None


async def _update_image_urls(uploaded: set[str]) -> int:
    updated = 0
    async with SessionLocal() as db:
        contents = (
            (
                await db.execute(
                    select(LessonContent).where(LessonContent.image_url.like("/media/%"))
                )
            )
            .scalars()
            .all()
        )
        for content in contents:
            key = _key_for_legacy_url(content.image_url, uploaded)
            if key is not None:
                content.image_url = media_storage.public_url(key)
                updated += 1
        await db.commit()
    return updated


async def run(apply: bool) -> None:
    if not settings.r2_enabled:
        raise SystemExit("R2 chưa được cấu hình đầy đủ")

    files = _local_files()
    if not apply:
        print(f"Dry run: {len(files)} tệp sẽ được tải lên R2")
        print("Chạy lại với --apply để thực thi; tệp local sẽ không bị xóa")
        return

    uploaded: set[str] = set()
    for index, path in enumerate(files, start=1):
        key = await asyncio.to_thread(_upload_file, path)
        uploaded.add(key)
        if index % 25 == 0 or index == len(files):
            print(f"Đã tải {index}/{len(files)} tệp")

    updated = await _update_image_urls(uploaded)
    print(f"Hoàn tất: {len(uploaded)} tệp, cập nhật {updated} URL slide")
    print("Tệp local vẫn được giữ để rollback")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.apply))


if __name__ == "__main__":
    main()
