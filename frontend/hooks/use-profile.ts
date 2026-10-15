"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileUpdate } from "@/lib/types/domain";
import { fetchMyProfile, MY_PROFILE_QUERY_KEY, updateMyProfile } from "@/lib/api/profile";

export function useMyProfile() {
  return useQuery({
    queryKey: MY_PROFILE_QUERY_KEY,
    queryFn: () => fetchMyProfile(),
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileUpdate) => updateMyProfile(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(MY_PROFILE_QUERY_KEY, updated);
    },
  });
}
