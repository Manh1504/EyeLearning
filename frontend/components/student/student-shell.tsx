'use client';

// components/student/student-shell.tsx — Shell chung khu vực học viên (navbar).
// Chỉ dùng cho nhóm route (dashboard); trang học bài (viewer) giữ toàn màn hình.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { UserMenu } from '@/components/ui/user-menu';
import { useMyProfile } from '@/hooks/use-profile';

const NAV = [
  { href: '/student/my-courses', label: 'Khóa học của tôi', icon: 'ri-book-open-line' },
];

export function StudentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: profile } = useMyProfile('student');
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
          <Link href="/student/my-courses" className="flex items-center gap-2 font-bold text-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-800 text-white">
              <Icon name="ri-eye-line" className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline">Gaze<span className="text-cyan-700">Edu</span></span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + '/');
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon name={n.icon} className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto">
            <UserMenu
              name={name}
              initials={initials}
              profileHref="/student/profile"
              roleLabel="Học sinh"
            />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
