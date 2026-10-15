"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMyProfile, MY_PROFILE_QUERY_KEY } from "@/lib/api/profile";
import type { AuthUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

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
  const { data: profile, error, isLoading, refetch } = useQuery({
    queryKey: MY_PROFILE_QUERY_KEY,
    queryFn: () => fetchMyProfile(),
    retry: false,
    staleTime: 30_000,
    throwOnError: false,
  });

  const user = profileToAuthUser(profile);
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
