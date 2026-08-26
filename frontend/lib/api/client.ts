// lib/api/client.ts — Fetch wrapper cho backend.
//   - Gọi /api/* (relative) — Next.js rewrite -> backend
//   - Tự gắn Authorization header từ localStorage (khóa 'auth_token')
//   - Khi access token hết hạn (401) → tự refresh bằng refresh token rồi retry 1 lần

function normalizeApiUrl(url: string): string {
  // Nếu đã là relative path (bắt đầu với /) thì giữ nguyên
  if (url.startsWith('/')) return url;
  // Nếu đã có protocol thì giữ nguyên
  if (url.startsWith('http')) return url;
  // Không thì thêm https://
  return `https://${url}`;
}

export const API_BASE_URL = normalizeApiUrl(
  process.env.NEXT_PUBLIC_API_URL ?? 'server.nmhieu.online'
);

// Resolve đường dẫn file media (ảnh slide render từ PDF) về URL có thể dùng cho <img>.
// - URL tuyệt đối http(s): giữ nguyên.
// - Đường dẫn tương đối bắt đầu bằng "/" (vd /media/...): đi qua Next.js rewrite (/media/:path*)
//   nên dùng nguyên dạng, không ghép API_BASE_URL.
// - Các dạng khác: ghép API_BASE_URL.
export function resolveMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `${API_BASE_URL}${raw}`;
}

const TOKEN_KEY = 'auth_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'auth_user';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Giới hạn upload (phải khớp với client_max_body_size của nginx).
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`;

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: ApiRequestOptions['params']) {
  // Use relative path for API calls — Next.js rewrite sẽ handle
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

function getToken(): string | null {
  return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
}

function clearAuthStorage(): void {
  for (const key of [TOKEN_KEY, REFRESH_KEY, USER_KEY, 'gaze_params', 'gaze_calibrated_at']) {
    globalThis.localStorage?.removeItem(key);
  }
}

// POST /api/auth/refresh — trả TokenPair (accessToken, refreshToken, user)
async function tryRefresh(): Promise<boolean> {
  const refreshToken = globalThis.localStorage?.getItem(REFRESH_KEY) ?? null;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    globalThis.localStorage?.setItem(TOKEN_KEY, data.accessToken);
    globalThis.localStorage?.setItem(REFRESH_KEY, data.refreshToken);
    globalThis.localStorage?.setItem(USER_KEY, JSON.stringify(data.user));
    return true;
  } catch {
    return false;
  }
}

// Dùng chung một lần refresh khi nhiều request cùng 401 để tránh refresh chồng nhau.
let inFlightRefresh: Promise<boolean> | null = null;
function refreshAccessToken(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = tryRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, signal } = options;

  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path, params), {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let res = await doFetch();

  // Access token hết hạn → refresh 1 lần rồi retry.
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearAuthStorage();
    }
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string; message?: string };
      message = data.detail ?? data.message ?? message;
    } catch { /* body không phải JSON */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// apiFetch dạng multipart/form-data (tự gắn Authorization, refresh 1 lần khi 401).
// KHÔNG đặt header Content-Type — browser tự set boundary với FormData.
export async function apiFetchMultipart<T>(
  path: string,
  form: FormData,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST',
): Promise<T> {
  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path), {
      method,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      body: form,
    });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearAuthStorage();
    }
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiError(413, `File tải lên vượt quá ${MAX_UPLOAD_LABEL} cho phép.`);
    }
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string; message?: string };
      message = data.detail ?? data.message ?? message;
    } catch { /* body không phải JSON */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// GET trả về Blob (file .ubj) — có Authorization + refresh 1 lần.
export async function apiFetchBlob(
  path: string,
  params?: ApiRequestOptions['params'],
): Promise<Blob> {
  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path, params), {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearAuthStorage();
    }
  }

  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return res.blob();
}
