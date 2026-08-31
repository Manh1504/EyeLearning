'use client';

// components/ui/user-menu.tsx — Menu người dùng (avatar + tên) trong navbar:
// dropdown gồm "Hồ sơ" và "Đăng xuất". Đóng khi bấm ra ngoài hoặc nhấn Escape.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { logout as apiLogout } from '@/lib/api/auth';

export function UserMenu({
  name,
  initials,
  avatarUrl,
  profileHref,
  roleLabel,
}: {
  name: string;
  initials: string;
  avatarUrl?: string | null;
  profileHref: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const logout = () => {
    void apiLogout();
    router.replace('/account/login');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-10 items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        <UserAvatar src={avatarUrl} name={name || initials} alt="" className="h-8 w-8" />
        <span className="hidden text-sm font-medium text-foreground sm:block">{name}</span>
        <Icon
          name="ri-arrow-down-s-line"
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <Link
            href={profileHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground outline-none transition hover:bg-accent hover:text-primary focus-visible:bg-accent focus-visible:text-primary"
          >
            <Icon name="ri-user-line" className="h-4 w-4 text-muted-foreground" />
            Hồ sơ
          </Link>
          <button
            role="menuitem"
            onClick={logout}
            className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-sm font-medium text-destructive outline-none transition hover:bg-destructive/10"
          >
            <Icon name="ri-logout-box-r-line" className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}