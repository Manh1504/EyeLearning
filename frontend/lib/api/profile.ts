// lib/api/profile.ts — Hồ sơ người dùng (users + user_profiles + student_profiles/teacher_profiles).
//   GET   /api/me/profile   -> MyProfile
//   PATCH /api/me/profile   -> ProfileUpdate (email + mật khẩu không đổi được)
// Backend trả role thực từ DB; tham số `role` chỉ để giữ chữ ký hook ổn định.

import { apiFetch } from './client';
import type { MyProfile, ProfileUpdate } from '@/lib/types/domain';

export function fetchMyProfile(): Promise<MyProfile> {
  return apiFetch<MyProfile>('/api/me/profile');
}

export function updateMyProfile(data: ProfileUpdate): Promise<MyProfile> {
  return apiFetch<MyProfile>('/api/me/profile', { method: 'PATCH', body: data });
}
