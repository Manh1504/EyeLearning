// lib/hooks/use-stored-user.ts — 2a: không còn localStorage, lấy user từ /api/me/profile
// Giữ tên hook để không vỡ import, nhưng giờ là TanStack Query + cookie.
'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMyProfile } from '@/lib/api/profile';
import { subscribeAuthChange } from '@/lib/api/auth';
import type { AuthUser } from '@/lib/api/auth';
import { useEffect, useState } from 'react';

function profileToAuthUser(profile: Awaited<ReturnType<typeof fetchMyProfile>> | undefined): AuthUser | null {
  if (!profile) return null;
  // MyProfile không có id — lấy từ email làm id fallback, role từ profile.role
  // Backend _build_profile không trả id, nên derive từ email; nếu cần id chuẩn thì mở rộng ProfileOut
  return {
    id: profile.email, // fallback id
    email: profile.email,
    roles: [profile.role as AuthUser['roles'][number]],
    fullName: profile.fullName ?? null,
  };
}

export function useStoredUser(): AuthUser | null {
  // đăng ký auth-change để refetch khi login/logout
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const unsub = subscribeAuthChange(() => setTick((v) => v + 1));
    return unsub;
  }, []);

  const { data: profile } = useQuery({
    queryKey: ['auth', 'profile', tick],
    queryFn: () => fetchMyProfile(),
    retry: false,
    staleTime: 30_000,
    throwOnError: false,
  });

  // nếu 401, profile undefined → trả null (chưa đăng nhập)
  return profileToAuthUser(profile);
}
