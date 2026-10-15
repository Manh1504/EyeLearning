import { apiFetch } from "./client";
import type { MyProfile, ProfileUpdate } from "@/lib/types/domain";

export const MY_PROFILE_QUERY_KEY = ["me", "profile"] as const;

export function fetchMyProfile(): Promise<MyProfile> {
  return apiFetch<MyProfile>("/api/me/profile");
}

export function updateMyProfile(data: ProfileUpdate): Promise<MyProfile> {
  return apiFetch<MyProfile>("/api/me/profile", { method: "PATCH", body: data });
}
