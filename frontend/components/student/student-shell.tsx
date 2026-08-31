'use client';

// components/student/student-shell.tsx — Shell chung khu vực học viên (navbar).
// Chỉ dùng cho nhóm route (dashboard); trang học bài (viewer) giữ toàn màn hình.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import { BrandLogo } from '@/components/ui/brand-logo';
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
    <div className="min-h-screen bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
          <Link href="/student/my-courses" className="flex h-10 items-center" aria-label="GazeEdu">
            <BrandLogo variant="icon" className="h-8 sm:hidden" priority />
            <BrandLogo variant="light" className="hidden h-8 sm:block" priority />
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + '/');
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-accent hover:text-primary focus-visible:bg-accent focus-visible:text-primary focus-visible:ring-3 focus-visible:ring-ring/20'
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
              avatarUrl={profile?.avatarUrl}
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
