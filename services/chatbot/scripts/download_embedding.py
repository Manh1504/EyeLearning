"""Tải weights embedding local (Qwen3-Embedding-0.6B) vào EMBEDDING_MODEL_PATH.

Chạy khi `EMBEDDING_NAME=local` (entrypoint gọi `scripts.prepare_models`).
Idempotent: nếu thư mục đã có model hợp lệ thì bỏ qua (không gọi mạng).

Chạy trực tiếp khi cần:
    python -m scripts.download_embedding
"""

import os
import sys
from pathlib import Path

# Cho phép chạy trực tiếp file script (khi đó sys.path[0] là scripts/).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.settings import embedding_model_path  # noqa: E402

DEFAULT_REPO = "Qwen/Qwen3-Embedding-0.6B"


def _ready(dest: Path) -> bool:
    """Có config.json + ít nhất 1 file trọng số -> coi như đã tải xong."""
    if not (dest / "config.json").is_file():
        return False
    return any(dest.glob("*.safetensors")) or any(dest.glob("*.bin"))


def ensure_embedding() -> None:
    dest = Path(embedding_model_path())
    if _ready(dest):
        print(f"[embedding] {dest}: đã có sẵn")
        return

    # Import muộn để script khác (không cần tải) không phải kéo huggingface_hub.
    from huggingface_hub import snapshot_download

    repo = os.getenv("EMBEDDING_HF_REPO", DEFAULT_REPO).strip()
    token = os.getenv("HF_TOKEN") or None
    print(f"[embedding] tải {repo} -> {dest} ...", flush=True)
    dest.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo_id=repo, local_dir=str(dest), token=token)

    if not _ready(dest):
        raise RuntimeError(f"tải xong nhưng thiếu file model trong {dest}")
    print(f"[embedding] xong: {dest}", flush=True)


def main() -> int:
    ensure_embedding()
    return 0


if __name__ == "__main__":
    sys.exit(main())
