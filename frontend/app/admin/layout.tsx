'use client';

import { type ReactNode } from 'react';
import { TeacherAdminHeader } from '@/components/teacher/teacher-admin-header';
import { useStoredUser } from '@/lib/hooks/use-stored-user';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const user = useStoredUser();
  const name = user?.fullName ?? 'Quản trị viên';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'AD';

  return (
    <div className="min-h-screen bg-slate-50">
      <TeacherAdminHeader
        showAdminLink
        user={{ name, initials, profileHref: '/account/login', roleLabel: 'Quản trị viên' }}
      />
      {children}
    </div>
  );
}
