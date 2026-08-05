const FALLBACK_RETURN_TO = "/courses";

const ALLOWED_RETURN_PATTERNS = [
  /^\/camera-check(?:[?#].*)?$/,
  /^\/courses(?:[/?#].*)?$/,
];

export function currentInternalReturnTo(locationLike) {
  const pathname = locationLike?.pathname || "";
  const search = locationLike?.search || "";
  const hash = locationLike?.hash || "";
  return `${pathname}${search}${hash}` || FALLBACK_RETURN_TO;
}

export function validateCalibrationProfileReturnTo(value) {
  if (typeof value !== "string" || !value.trim()) return FALLBACK_RETURN_TO;
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return FALLBACK_RETURN_TO;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return FALLBACK_RETURN_TO;
  if (ALLOWED_RETURN_PATTERNS.some((pattern) => pattern.test(decoded))) return decoded;
  return FALLBACK_RETURN_TO;
}

export function calibrationProfileReturnTo({ locationState, search } = {}) {
  const stateReturnTo = validateCalibrationProfileReturnTo(locationState?.returnTo);
  if (stateReturnTo !== FALLBACK_RETURN_TO) return stateReturnTo;
  const params = new URLSearchParams(search || "");
  return validateCalibrationProfileReturnTo(params.get("returnTo"));
}
