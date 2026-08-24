'use client';

// components/teacher/teacher-shell.tsx — Shell chung khu vực giảng viên
// (navbar + bọc nội dung). Chỉ dùng cho nhóm route (dashboard);
// các trang fullscreen (heatmap) không dùng để giữ màn hình tối gọn.

import { type ReactNode } from 'react';
import { TeacherAdminHeader } from '@/components/teacher/teacher-admin-header';
import { useMyProfile } from '@/hooks/use-profile';
import { useStoredUser } from '@/lib/hooks/use-stored-user';

export function TeacherShell({ children }: { children: ReactNode }) {
  const user = useStoredUser();
  const isAdmin = user?.roles.includes('admin');
  const { data: profile } = useMyProfile('teacher');
  const name = profile?.fullName ?? 'Tài khoản';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-slate-50">
      <TeacherAdminHeader
        showAdminLink={Boolean(isAdmin)}
        user={{ name, initials, avatarUrl: profile?.avatarUrl, profileHref: '/teacher/profile', roleLabel: 'Giảng viên' }}
      />
      {children}
    </div>
  );
}
