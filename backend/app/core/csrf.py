import secrets

from fastapi import HTTPException, Request, status


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def verify_csrf(request: Request) -> None:
    """Double-submit + Origin check cho state-changing khi auth qua cookie.

    - Nếu có Authorization header → coi như auth qua memory token → bỏ qua CSRF (header không tự gửi cross-site).
    - Nếu chỉ có cookie access_token → yêu cầu header X-CSRF-Token == cookie csrf_token và Origin/Referer thuộc CORS whitelist.
    """
    method = request.method.upper()
    if method in ("GET", "HEAD", "OPTIONS"):
        return
    has_auth_header = bool(request.headers.get("authorization"))
    has_cookie = bool(request.cookies.get("access_token") or request.cookies.get("refresh_token"))
    if not has_cookie or has_auth_header:
        return
    # Chỉ khi auth thuần cookie mới cần CSRF
    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("x-csrf-token") or request.headers.get("X-CSRF-Token")
    if not cookie_token or not header_token or cookie_token != header_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token không hợp lệ")
    # Origin check — nếu có Origin thì phải thuộc whitelist
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    from app.core.config import settings

    allowed = set(settings.cors_origin_list)
    if origin and origin not in allowed:
        # cho phép referer fallback nếu origin missing (form post)
        if not referer or not any(referer.startswith(o) for o in allowed):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin không hợp lệ")
