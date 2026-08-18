// lib/api/client.ts — Fetch wrapper cho backend.
// Hiện tại chưa dùng đến (các hàm lib/api/* trả mock), nhưng đây là nơi
// duy nhất cần sửa khi nối FastAPI:
//   1. Đặt NEXT_PUBLIC_API_URL trong .env.local (mặc định http://localhost:8001)
//   2. Gắn Authorization header sau khi có auth (token từ login)
//   3. Xử lý lỗi tập trung tại đây

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001';

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

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, signal } = options;
  const res = await fetch(buildUrl(path, params), {
    method,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(globalThis.localStorage?.getItem('auth_token')
        ? { Authorization: `Bearer ${globalThis.localStorage.getItem('auth_token')}` }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

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
