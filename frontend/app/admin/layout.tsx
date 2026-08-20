// app/admin/layout.tsx — Shell khu vực quản trị viên (phân công giảng viên).
'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { UserMenu } from '@/components/ui/user-menu';
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
          <Link href="/admin/courses" className="flex items-center gap-2 font-bold text-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-violet-800 text-white">
              <Icon name="ri-shield-user-line" className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline">Gaze<span className="text-violet-700">Edu</span> · Quản trị</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/admin/courses"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50"
            >
              <Icon name="ri-git-repository-line" className="h-4 w-4" />
              Phân công giảng viên
            </Link>
            <Link
              href="/teacher/courses"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <Icon name="ri-book-open-line" className="h-4 w-4" />
              Quản lý khóa học
            </Link>
          </nav>

          <div className="ml-auto">
            <UserMenu name={name} initials={initials} profileHref="/account/login" roleLabel="Quản trị viên" />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}