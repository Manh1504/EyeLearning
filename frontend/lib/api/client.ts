// lib/api/client.ts — Fetch wrapper cho backend.
//   - Đặt NEXT_PUBLIC_API_URL trong .env.local (mặc định http://localhost:8001)
//   - Tự gắn Authorization header từ localStorage (khóa 'auth_token')
//   - Khi access token hết hạn (401) → tự refresh bằng refresh token rồi retry 1 lần

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001';

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

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: ApiRequestOptions['params']) {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
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
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
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
