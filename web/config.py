import importlib.util
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"
DATA_DIR = PROJECT_ROOT / "data"

load_dotenv(ENV_PATH)

DEFAULT_AI_HTTP_URL = "http://127.0.0.1:9000"
DEFAULT_AI_WS_URL = "ws://127.0.0.1:9000/inference"
DEFAULT_BACKEND_AI_HTTP_URL = "http://host.docker.internal:9000"


def _present(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


def app_env() -> str:
    return os.getenv("APP_ENV", "development").strip().lower() or "development"


def is_production_env() -> bool:
    return app_env() == "production"


def is_cloudinary_package_available() -> bool:
    return importlib.util.find_spec("cloudinary") is not None


def is_cloudinary_configured() -> bool:
    if _present("CLOUDINARY_URL"):
        return True
    return all(
        _present(name)
        for name in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET")
    )


def client_config() -> dict[str, object]:
    ai_http_url = os.getenv("AI_HTTP_URL", DEFAULT_AI_HTTP_URL).strip().rstrip("/")
    ai_ws_url = os.getenv("AI_WS_URL", DEFAULT_AI_WS_URL).strip()
    if ai_ws_url and not ai_ws_url.rstrip("/").endswith("/inference"):
        ai_ws_url = f"{ai_ws_url.rstrip('/')}/inference"
    return {
        "ai_http_url": ai_http_url,
        "ai_ws_url": ai_ws_url or DEFAULT_AI_WS_URL,
        "enable_dev_tools": os.getenv("ENABLE_DEV_TOOLS", "").strip().lower() == "true",
        "enable_mouse_simulation": os.getenv("ENABLE_MOUSE_SIMULATION", "").strip().lower() == "true",
    }


def backend_ai_http_url() -> str:
    return os.getenv("AI_BACKEND_HTTP_URL", DEFAULT_BACKEND_AI_HTTP_URL).strip().rstrip("/")


def cloudinary_status() -> dict[str, bool]:
    return {
        "configured": is_cloudinary_configured(),
        "cloud_name_present": _present("CLOUDINARY_CLOUD_NAME") or _cloud_name_from_url_present(),
        "api_key_present": _present("CLOUDINARY_API_KEY") or _api_key_from_url_present(),
        "api_secret_present": _present("CLOUDINARY_API_SECRET") or _api_secret_from_url_present(),
        "package_available": is_cloudinary_package_available(),
    }


def configure_cloudinary():
    import cloudinary

    cloudinary_url = os.getenv("CLOUDINARY_URL", "").strip()
    if cloudinary_url:
        parsed = urlparse(cloudinary_url)
        if parsed.scheme == "cloudinary" and parsed.hostname and parsed.username and parsed.password:
            cloudinary.config(
                cloud_name=parsed.hostname,
                api_key=parsed.username,
                api_secret=parsed.password,
                secure=True,
            )
        else:
            cloudinary.config(secure=True)
        return

    cloudinary.config(
        cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
        api_key=os.environ["CLOUDINARY_API_KEY"],
        api_secret=os.environ["CLOUDINARY_API_SECRET"],
        secure=True,
    )


def _parsed_cloudinary_url():
    value = os.getenv("CLOUDINARY_URL", "").strip()
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "cloudinary":
        return None
    return parsed


def _cloud_name_from_url_present() -> bool:
    parsed = _parsed_cloudinary_url()
    return bool(parsed and parsed.hostname)


def _api_key_from_url_present() -> bool:
    parsed = _parsed_cloudinary_url()
    return bool(parsed and parsed.username)


def _api_secret_from_url_present() -> bool:
    parsed = _parsed_cloudinary_url()
    return bool(parsed and parsed.password)
