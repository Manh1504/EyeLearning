// hooks/use-profile.ts — TanStack Query hooks cho hồ sơ người dùng.
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileUpdate } from '@/lib/types/domain';
import { fetchMyProfile, updateMyProfile } from '@/lib/api/profile';

export function useMyProfile(role: 'student' | 'teacher') {
  return useQuery({
    queryKey: ['me', 'profile', role],
    queryFn: () => fetchMyProfile(),
  });
}

export function useUpdateMyProfile(role: 'student' | 'teacher') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileUpdate) => updateMyProfile(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me', 'profile', role], updated);
    },
  });
}
