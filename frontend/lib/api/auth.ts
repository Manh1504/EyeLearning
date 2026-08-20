// lib/api/auth.ts — Xác thực (JWT) với backend FastAPI.
//   POST /api/auth/login    -> TokenPair (access + refresh + user)
//   POST /api/auth/logout   -> thu hồi refresh token
// Token access lưu vào localStorage dưới khóa 'auth_token' — lib/api/client.ts
// tự gắn Authorization header cho mọi request khi có token.

import { apiFetch } from './client';

export const AUTH_TOKEN_KEY = 'auth_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const AUTH_USER_KEY = 'auth_user';

export type Role = 'student' | 'teacher' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  roles: Role[];
  fullName: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export function getStoredUser(): AuthUser | null {
  const raw = globalThis.localStorage?.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

const AUTH_CHANGE_EVENT = 'gaze-auth-change';

let cachedRaw: string | null = null;
let cachedUser: AuthUser | null = null;

// Snapshot ổn định (cache theo chuỗi raw) để dùng với useSyncExternalStore —
// tránh hydration mismatch khi đọc localStorage trong lúc render.
export function getStoredAuthUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = globalThis.localStorage.getItem(AUTH_USER_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedUser = raw ? (() => {
      try {
        return JSON.parse(raw) as AuthUser;
      } catch {
        return null;
      }
    })() : null;
  }
  return cachedUser;
}

export function subscribeAuthChange(callback: () => void): () => void {
  const fire = () => callback();
  globalThis.window?.addEventListener(AUTH_CHANGE_EVENT, fire);
  globalThis.window?.addEventListener('storage', fire);
  return () => {
    globalThis.window?.removeEventListener(AUTH_CHANGE_EVENT, fire);
    globalThis.window?.removeEventListener('storage', fire);
  };
}

function notifyAuthChange(): void {
  globalThis.window?.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getStoredTokens(): { access: string | null; refresh: string | null } {
  return {
    access: globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? null,
    refresh: globalThis.localStorage?.getItem(REFRESH_TOKEN_KEY) ?? null,
  };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const data = await apiFetch<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, data.accessToken);
  globalThis.localStorage?.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  globalThis.localStorage?.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
  notifyAuthChange();
  return data;
}

export async function logout(): Promise<void> {
  const { refresh } = getStoredTokens();
  if (refresh) {
    try {
      await apiFetch<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
        body: { refreshToken: refresh },
      });
    } catch {
      // Không bắt buộc phải thu hồi server — vẫn xoá token local.
    }
  }
  clearAuth();
}

export function clearAuth(): void {
  globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
  globalThis.localStorage?.removeItem(REFRESH_TOKEN_KEY);
  globalThis.localStorage?.removeItem(AUTH_USER_KEY);
  globalThis.localStorage?.removeItem('gaze_params');
  globalThis.localStorage?.removeItem('gaze_calibrated_at');
  notifyAuthChange();
}
