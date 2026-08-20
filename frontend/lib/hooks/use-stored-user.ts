// lib/hooks/use-stored-user.ts — Đọc người dùng từ localStorage an toàn với SSR:
// server + lần render hydration đều trả null (fallback), sau mount mới hiện tên thật,
// tránh hydration mismatch mà vẫn cập nhật khi đăng nhập/đăng xuất.
'use client';

import { useSyncExternalStore } from 'react';
import { getStoredAuthUser, subscribeAuthChange } from '@/lib/api/auth';
import type { AuthUser } from '@/lib/api/auth';

export function useStoredUser(): AuthUser | null {
  return useSyncExternalStore(subscribeAuthChange, getStoredAuthUser, () => null);
}