"""Kiểm thử lấy IP thật cho rate-limit (chống giả mạo X-Forwarded-For)."""

from app.core import ratelimit


class _Client:
    def __init__(self, host: str):
        self.host = host


class _Req:
    def __init__(self, peer: str | None, headers: dict[str, str] | None = None):
        self.client = _Client(peer) if peer is not None else None
        self.headers = headers or {}


def _with_trusted(monkeypatch, cidrs: str):
    """Gán lại _TRUSTED_NETWORKS theo đúng logic _trusted_networks()."""
    from ipaddress import ip_network

    monkeypatch.setattr(
        ratelimit,
        "_TRUSTED_NETWORKS",
        [ip_network(c.strip(), strict=False) for c in cidrs.split(",") if c.strip()],
    )


def test_client_spoofed_header_ignored_when_peer_untrusted(monkeypatch):
    """Peer ngoài dải tin cậy gửi X-Forwarded-For giả → KHÔNG được tin."""
    _with_trusted(monkeypatch, "172.16.0.0/12")
    req = _Req("8.8.8.8", {"x-forwarded-for": "1.2.3.4"})
    assert ratelimit._real_ip(req) == "8.8.8.8"


def test_header_trusted_from_trusted_proxy(monkeypatch):
    """Peer trong dải tin cậy (nginx) → lấy IP thật từ X-Forwarded-For."""
    _with_trusted(monkeypatch, "172.16.0.0/12")
    req = _Req("172.18.0.5", {"x-forwarded-for": "203.0.113.7"})
    assert ratelimit._real_ip(req) == "203.0.113.7"


def test_first_ip_wins_in_forwarded_chain(monkeypatch):
    """Chuỗi XFF nhiều IP → lấy IP đầu tiên (client thật do nginx ghi đè)."""
    _with_trusted(monkeypatch, "172.16.0.0/12")
    req = _Req("172.18.0.5", {"x-forwarded-for": "203.0.113.7, 172.18.0.5"})
    assert ratelimit._real_ip(req) == "203.0.113.7"


def test_no_trusted_networks_never_trusts_header(monkeypatch):
    """Không cấu hình dải tin cậy → không bao giờ tin header (an toàn mặc định)."""
    _with_trusted(monkeypatch, "")
    req = _Req("8.8.8.8", {"x-forwarded-for": "1.2.3.4"})
    assert ratelimit._real_ip(req) == "8.8.8.8"


def test_falls_back_to_peer_without_header(monkeypatch):
    _with_trusted(monkeypatch, "172.16.0.0/12")
    req = _Req("172.18.0.5", {})
    assert ratelimit._real_ip(req) == "172.18.0.5"


def test_unknown_when_no_client(monkeypatch):
    _with_trusted(monkeypatch, "172.16.0.0/12")
    req = _Req(None, {})
    assert ratelimit._real_ip(req) == "unknown"


def test_malformed_header_kept_only_via_trusted(monkeypatch):
    """Peer tin cậy gửi XFF rỗng/khoảng trắng → vẫn lấy phần tử đầu, strip()."""
    _with_trusted(monkeypatch, "10.0.0.0/8")
    req = _Req("10.1.2.3", {"x-forwarded-for": "  198.51.100.9  "})
    assert ratelimit._real_ip(req) == "198.51.100.9"
