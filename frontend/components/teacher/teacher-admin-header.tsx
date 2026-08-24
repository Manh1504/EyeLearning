'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Icon } from '@/components/ui/icon';
import { UserMenu } from '@/components/ui/user-menu';
import { cn } from '@/lib/utils';

type HeaderUser = {
  name: string;
  initials: string;
  avatarUrl?: string | null;
  profileHref: string;
  roleLabel: string;
};

export function TeacherAdminHeader({
  user,
  showAdminLink,
}: {
  user: HeaderUser;
  showAdminLink: boolean;
}) {
  const pathname = usePathname();

  const items = [
    { href: '/teacher/courses', label: 'Khóa học', icon: 'ri-stack-line', active: pathname.startsWith('/teacher') },
    ...(showAdminLink
      ? [{ href: '/admin/courses', label: 'Quản trị', icon: 'ri-shield-user-line', active: pathname.startsWith('/admin') }]
      : []),
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
        <Link href="/teacher/courses" className="flex h-10 items-center" aria-label="GazeEdu">
          <BrandLogo variant="icon" className="h-8 sm:hidden" priority />
          <BrandLogo variant="light" className="hidden h-8 sm:block" priority />
        </Link>

        <nav className="flex min-w-0 items-center gap-1" aria-label="Điều hướng chính">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:ring-3 focus-visible:ring-ring/20',
                item.active
                  ? 'bg-accent text-primary'
                  : 'text-slate-600 hover:bg-accent hover:text-primary focus-visible:bg-accent focus-visible:text-primary',
              )}
            >
              <Icon name={item.icon} className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="ml-auto">
          <UserMenu
            name={user.name}
            initials={user.initials}
            avatarUrl={user.avatarUrl}
            profileHref={user.profileHref}
            roleLabel={user.roleLabel}
          />
        </div>
      </div>
    </header>
  );
}
