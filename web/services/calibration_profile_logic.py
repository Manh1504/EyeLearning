from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


MODEL_VERSION = "svr:v1"
VIEWPORT_TOLERANCE_RATIO = 0.08
DPR_TOLERANCE = 0.05
VALIDATION_LEASE_MINUTES = 45
QUICK_VALIDATION_PASS_MEDIAN_NORM = 0.08
QUICK_VALIDATION_RETRY_MEDIAN_NORM = 0.14
QUICK_VALIDATION_MIN_VALID_RATIO = 0.6


@dataclass(frozen=True)
class CompatibilityResult:
    status: str
    reasons: tuple[str, ...]


def _ratio_delta(a: float | int | None, b: float | int | None) -> float:
    if not a or not b:
        return 1.0
    return abs(float(a) - float(b)) / max(float(a), float(b), 1.0)


def evaluate_compatibility(profile_env: dict[str, Any] | None, current_env: dict[str, Any] | None, model_version: str | None) -> CompatibilityResult:
    reasons: list[str] = []
    if model_version and model_version != MODEL_VERSION:
        reasons.append("model_version")
    profile_env = profile_env or {}
    if current_env is None:
        if reasons:
            return CompatibilityResult("incompatible", tuple(reasons))
        return CompatibilityResult("unknown", ("metadata_unavailable",))
    current_env = current_env or {}
    if profile_env.get("camera_label") and current_env.get("camera_label") and profile_env.get("camera_label") != current_env.get("camera_label"):
        reasons.append("camera")
    if _ratio_delta(profile_env.get("viewport_w"), current_env.get("viewport_w")) > VIEWPORT_TOLERANCE_RATIO:
        reasons.append("viewport_width")
    if _ratio_delta(profile_env.get("viewport_h"), current_env.get("viewport_h")) > VIEWPORT_TOLERANCE_RATIO:
        reasons.append("viewport_height")
    if abs(float(profile_env.get("device_pixel_ratio") or 1) - float(current_env.get("device_pixel_ratio") or 1)) > DPR_TOLERANCE:
        reasons.append("device_pixel_ratio")
    if profile_env.get("is_fullscreen") is not None and current_env.get("is_fullscreen") is not None:
        if bool(profile_env.get("is_fullscreen")) != bool(current_env.get("is_fullscreen")):
            reasons.append("fullscreen_mode")
    if reasons:
        return CompatibilityResult("incompatible", tuple(reasons))
    return CompatibilityResult("compatible", ())


def validation_status(metrics: dict[str, Any]) -> str:
    valid_ratio = float(metrics.get("valid_sample_ratio") or 0)
    median_error = metrics.get("median_error_norm")
    if valid_ratio < QUICK_VALIDATION_MIN_VALID_RATIO or median_error is None:
        return "retry"
    median_error = float(median_error)
    if median_error <= QUICK_VALIDATION_PASS_MEDIAN_NORM:
        return "passed"
    if median_error <= QUICK_VALIDATION_RETRY_MEDIAN_NORM:
        return "retry"
    return "failed"


def validation_lease_valid(issued_at: datetime | None, env_changed: bool = False) -> bool:
    if env_changed or not issued_at:
        return False
    now = datetime.now(timezone.utc)
    if issued_at.tzinfo is None:
        issued_at = issued_at.replace(tzinfo=timezone.utc)
    return now - issued_at <= timedelta(minutes=VALIDATION_LEASE_MINUTES)
