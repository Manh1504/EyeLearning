"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMyProfile } from "@/lib/api/profile";
import type { AuthUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export const AUTH_USER_QUERY_KEY = ["auth", "user"] as const;

function profileToAuthUser(
  profile: Awaited<ReturnType<typeof fetchMyProfile>> | undefined,
): AuthUser | null {
  if (!profile) return null;
  return {
    id: profile.email,
    email: profile.email,
    roles: [profile.role as AuthUser["roles"][number]],
    fullName: profile.fullName ?? null,
    avatarUrl: profile.avatarUrl ?? null,
  };
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSessionExpired: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAuthState(): AuthState {
  const { data: user = null, error, isLoading, refetch } = useQuery({
    queryKey: AUTH_USER_QUERY_KEY,
    queryFn: async () => profileToAuthUser(await fetchMyProfile()),
    retry: false,
    staleTime: 30_000,
    throwOnError: false,
  });

  const isSessionExpired = error instanceof ApiError && error.status === 401;
  return {
    user,
    isLoading,
    isAuthenticated: !isSessionExpired && (user !== null || error !== null),
    isSessionExpired,
    error,
    refetch: () => {
      void refetch();
    },
  };
}

export function useStoredUser(): AuthUser | null {
  return useAuthState().user;
}
