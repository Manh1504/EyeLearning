// lib/api/client.ts — Fetch wrapper cho backend.
//   - Gọi /api/* (relative) — Next.js rewrite -> backend
//   - 2a hybrid: accessToken lưu memory-only, refreshToken httpOnly cookie
//   - Gửi credentials:'include' để cookie httpOnly được gửi kèm
//   - Khi 401 → tự refresh qua cookie rồi retry 1 lần

function normalizeApiUrl(url: string): string {
  if (url.startsWith('/')) return url;
  if (url.startsWith('http')) return url;
  return `https://${url}`;
}

export const API_BASE_URL = normalizeApiUrl(
  process.env.NEXT_PUBLIC_API_URL ?? 'server.nmhieu.online'
);

export function resolveMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `${API_BASE_URL}${raw}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`;

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: ApiRequestOptions['params']) {
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

// ── 2a: memory-only access token ──────────────────────────────
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
  if (typeof document === 'undefined') return {};
  const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  const token = m ? decodeURIComponent(m[1]) : null;
  return token ? { 'X-CSRF-Token': token } : {};
}

// Dọn localStorage cũ (migration từ bản trước) — chạy 1 lần khi module load ở client
if (typeof window !== 'undefined') {
  try {
    for (const k of ['auth_token', 'refresh_token', 'auth_user', 'gaze_params']) {
      if (globalThis.localStorage?.getItem(k) !== null) {
        // chỉ xóa token/user cũ, giữ gaze_session_* và device fingerprint
        if (k === 'auth_token' || k === 'refresh_token' || k === 'auth_user') {
          globalThis.localStorage.removeItem(k);
        }
      }
    }
  } catch { /* ignore */ }
}

// POST /api/auth/refresh — đọc refresh_token từ httpOnly cookie
async function tryRefresh(): Promise<boolean> {
  try {
    const csrf = (() => {
      if (typeof document === 'undefined') return {};
      const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
      return m ? { 'X-CSRF-Token': decodeURIComponent(m[1]) } : {};
    })();
    const res = await fetch(`/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrf as Record<string, string>) },
      body: JSON.stringify({}), // body rỗng — server đọc cookie
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.accessToken) {
      memoryAccessToken = data.accessToken;
    } else if (data?.access_token) {
      memoryAccessToken = data.access_token;
    }
    // refresh_token mới đã được Set-Cookie bởi server, không cần lưu JS
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

function notifyAuthChange(): void {
  globalThis.window?.dispatchEvent(new Event('gaze-auth-change'));
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, signal } = options;

  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path, params), {
      method,
      signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
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
      const data = (await res.json()) as { detail?: string; message?: string };
      message = data.detail ?? data.message ?? message;
    } catch { /* body không phải JSON */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function apiFetchMultipart<T>(
  path: string,
  form: FormData,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST',
): Promise<T> {
  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path), {
      method,
      credentials: 'include',
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
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string; message?: string };
      message = data.detail ?? data.message ?? message;
    } catch { /* body không phải JSON */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function apiFetchBlob(
  path: string,
  params?: ApiRequestOptions['params'],
): Promise<Blob> {
  const doFetch = (): Promise<Response> =>
    fetch(buildUrl(path, params), {
      credentials: 'include',
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
