// lib/api/auth.ts — Xác thực (JWT) với backend FastAPI.
//   POST /api/auth/login    -> TokenPair (user + cookies httpOnly)
//   POST /api/auth/logout   -> thu hồi refresh token cookie
//   2a hybrid: accessToken memory-only (client.ts), refreshToken httpOnly cookie
//   Không còn lưu token/user trong localStorage.

import { apiFetch, setMemoryAccessToken, clearMemoryToken } from './client';

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

export const AUTH_CHANGE_EVENT = 'gaze-auth-change';

function notifyAuthChange(): void {
  globalThis.window?.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function subscribeAuthChange(callback: () => void): () => void {
  const fire = () => callback();
  globalThis.window?.addEventListener(AUTH_CHANGE_EVENT, fire);
  // storage event không còn cần cho token, giữ để sync giữa tab khi logout
  globalThis.window?.addEventListener('storage', fire);
  return () => {
    globalThis.window?.removeEventListener(AUTH_CHANGE_EVENT, fire);
    globalThis.window?.removeEventListener('storage', fire);
  };
}

// ── legacy shims (giữ để không vỡ import cũ, nhưng không đọc localStorage nữa) ─
export const AUTH_TOKEN_KEY = 'auth_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const AUTH_USER_KEY = 'auth_user';

export function getStoredUser(): AuthUser | null {
  return null;
}

export function getStoredAuthUser(): AuthUser | null {
  return null;
}

export function getStoredTokens(): { access: string | null; refresh: string | null } {
  return { access: null, refresh: null };
}

// ── primary API ──────────────────────────────────────────────
export async function login(email: string, password: string): Promise<LoginResult> {
  const data = await apiFetch<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  // server đã Set-Cookie httpOnly; lưu accessToken vào memory
  if (data?.accessToken) setMemoryAccessToken(data.accessToken);
  else if ((data as unknown as { access_token?: string })?.access_token) {
    setMemoryAccessToken((data as unknown as { access_token: string }).access_token);
  }
  // user trả về để redirect theo role, không persist
  notifyAuthChange();
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: {},
    });
  } catch {
    // vẫn clear local dù server lỗi
  }
  clearAuth();
}

export function clearAuth(): void {
  clearMemoryToken();
  // dọn localStorage cũ nếu còn sót (migration)
  try {
    globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
    globalThis.localStorage?.removeItem(REFRESH_TOKEN_KEY);
    globalThis.localStorage?.removeItem(AUTH_USER_KEY);
    globalThis.localStorage?.removeItem('gaze_params');
    globalThis.localStorage?.removeItem('gaze_calibrated_at');
  } catch { /* ignore */ }
  notifyAuthChange();
}

// Alias cho client.ts gọi khi refresh fail
export { notifyAuthChange as _notifyAuthChange };
