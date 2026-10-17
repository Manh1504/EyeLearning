import os
from pathlib import Path
from urllib.parse import urlparse, unquote

import boto3
import httpx


class FileStorage:
    """Đọc file slide từ local, S3, Cloudflare R2 hoặc URL http(s).

    Chỉ cần gọi `load(source)` — hàm tự nhận diện nguồn dựa vào scheme/URL.
    """

    # Provider -> tên biến môi trường chứa bucket tương ứng
    BUCKET_ENV = {"s3": "S3_BUCKET", "r2": "R2_BUCKET"}

    def __init__(self):
        self.provider = os.getenv("STORAGE_PROVIDER", "local").lower()
        # Tái sử dụng 1 client để tận dụng connection pooling
        self.http = httpx.Client(timeout=60, follow_redirects=True)
        self._clients = {}

    def load(self, source: str) -> bytes:
        """Trả về bytes của file từ bất kỳ nguồn nào."""
        parsed = urlparse(source)

        # s3://bucket/key hoặc r2://bucket/key
        if parsed.scheme in ("s3", "r2"):
            return self._load_object(
                parsed.scheme,
                parsed.netloc,
                unquote(parsed.path.lstrip("/")),
            )

        # URL công khai hoặc presigned URL
        if parsed.scheme in ("http", "https"):
            return self.http.get(source).content

        # file:///duong/dan
        if parsed.scheme == "file":
            return Path(unquote(parsed.path)).read_bytes()

        # Không có scheme -> đường dẫn local hoặc object key (theo provider)
        if self.provider == "local":
            return Path(source).read_bytes()

        return self._load_object(
            self.provider,
            os.environ[self.BUCKET_ENV[self.provider]],
            source.lstrip("/"),
        )

    # Tạo client boto3 một lần cho mỗi provider
    def _get_client(self, provider: str):
        if provider not in self._clients:
            if provider == "s3":
                self._clients[provider] = boto3.client("s3")

            else:  # r2
                endpoint = os.getenv("R2_ENDPOINT") or (
                    f"https://{os.environ['R2_ACCOUNT_ID']}"
                    ".r2.cloudflarestorage.com"
                )
                self._clients[provider] = boto3.client(
                    "s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                    region_name="auto",
                )

        return self._clients[provider]

    # Đọc object từ S3 / R2
    def _load_object(self, provider: str, bucket: str, key: str) -> bytes:
        body = self._get_client(provider).get_object(
            Bucket=bucket,
            Key=key,
        )["Body"]

        try:
            return body.read()
        finally:
            body.close()