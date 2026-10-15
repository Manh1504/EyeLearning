function normalizeApiUrl(url: string): string {
  if (url.startsWith("/")) return url;
  if (url.startsWith("http")) return url;
  return `https://${url}`;
}

export const API_BASE_URL = normalizeApiUrl(
  process.env.NEXT_PUBLIC_API_URL?.trim() || "https://server.nmhieu.online",
);

export function resolveMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `${API_BASE_URL}${raw}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`;

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  keepalive?: boolean;
}

function buildUrl(path: string, params?: ApiRequestOptions["params"]) {
  let url = path;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) searchParams.set(k, String(v));
    }
    const queryString = searchParams.toString();
    url = queryString ? `${path}?${queryString}` : path;
  }
  return url;
}

let memoryAccessToken: string | null = null;

export function setMemoryAccessToken(token: string | null): void {
  memoryAccessToken = token;
}

export function getMemoryAccessToken(): string | null {
  return memoryAccessToken;
}

export function clearMemoryToken(): void {
  memoryAccessToken = null;
}

function getAuthHeader(): Record<string, string> {
  return memoryAccessToken ? { Authorization: `Bearer ${memoryAccessToken}` } : {};
}

function getCsrfHeader(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  const token = m ? decodeURIComponent(m[1]) : null;
  return token ? { "X-CSRF-Token": token } : {};
}

// One-time migration from versions that persisted credentials in browser storage.
if (typeof window !== "undefined") {
  try {
    for (const key of ["auth_token", "refresh_token", "auth_user"]) {
      globalThis.localStorage?.removeItem(key);
    }
  } catch {
    /* Storage may be unavailable or blocked. */
  }
}

async function tryRefresh(): Promise<boolean> {
  try {
    const csrf = (() => {
      if (typeof document === "undefined") return {};
      const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
      return m ? { "X-CSRF-Token": decodeURIComponent(m[1]) } : {};
    })();
    const res = await fetch(`/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(csrf as Record<string, string>) },
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.accessToken) {
      memoryAccessToken = data.accessToken;
    } else if (data?.access_token) {
      memoryAccessToken = data.access_token;
    }
    return true;
  } catch {
    return false;
  }
}

let inFlightRefresh: Promise<boolean> | null = null;
function refreshAccessToken(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = tryRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export const AUTH_CHANGE_EVENT = "gaze-auth-change";

function notifyAuthChange(): void {
  globalThis.window?.dispatchEvent(
    new CustomEvent(AUTH_CHANGE_EVENT, { detail: "session-expired" }),
  );
}

function extractError(status: number, data: unknown): string {
  const d = data as { detail?: string; message?: string } | null;
  return d?.detail ?? d?.message ?? `HTTP ${status}`;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, params, signal, keepalive } = options;

  // Chế độ demo: trả dữ liệu giả, không gọi backend.
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    const { isDemoMode, demoResponse } = await import("@/lib/demo");
    if (isDemoMode()) {
      const data = demoResponse(path, method, body);
      if (data !== undefined) {
        await new Promise((r) => setTimeout(r, 120));
        return data as T;
      }
    }
  }

  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path, params), {
      method,
      signal,
      keepalive,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
        ...getCsrfHeader(),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearMemoryToken();
      notifyAuthChange();
    }
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      message = extractError(res.status, await res.json());
    } catch {
      /* body không phải JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function apiFetchMultipart<T>(
  path: string,
  form: FormData,
  method: "POST" | "PUT" | "PATCH" = "POST",
): Promise<T> {
  {
    const { isDemoMode, demoResponse } = await import("@/lib/demo");
    if (isDemoMode()) {
      const data = demoResponse(path, method);
      if (data !== undefined) {
        await new Promise((r) => setTimeout(r, 200));
        return data as T;
      }
    }
  }

  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path), {
      method,
      credentials: "include",
      headers: { ...getAuthHeader(), ...getCsrfHeader() },
      body: form,
    });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearMemoryToken();
      notifyAuthChange();
    }
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiError(413, `File tải lên vượt quá ${MAX_UPLOAD_LABEL} cho phép.`);
    }
    // Cloudflare cắt request xử lý quá lâu: 524. Xử lý đồng bộ ở backend nên
    // file quá lớn/nhiều trang có thể vượt ngưỡng ~100s → báo rõ để chia nhỏ.
    if (res.status === 524 || res.status === 504) {
      throw new ApiError(
        res.status,
        "Xử lý tệp mất quá nhiều thời gian (quá tải hoặc file quá lớn). " +
          "Vui lòng thử lại với file nhỏ hơn hoặc ít trang hơn.",
      );
    }
    let message = `HTTP ${res.status}`;
    try {
      message = extractError(res.status, await res.json());
    } catch {
      /* body không phải JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function apiFetchBlob(
  path: string,
  params?: ApiRequestOptions["params"],
): Promise<Blob> {
  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path, params), {
      credentials: "include",
      headers: { ...getAuthHeader(), ...getCsrfHeader() },
    });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearMemoryToken();
      notifyAuthChange();
    }
  }

  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return res.blob();
}
