'use client';

// components/ui/user-menu.tsx — Menu người dùng (avatar + tên) trong navbar:
// dropdown gồm "Hồ sơ" và "Đăng xuất". Đóng khi bấm ra ngoài hoặc nhấn Escape.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { logout as apiLogout } from '@/lib/api/auth';

export function UserMenu({
  name,
  initials,
  profileHref,
  roleLabel,
}: {
  name: string;
  initials: string;
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
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-500/40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
          {initials}
        </span>
        <span className="hidden text-sm font-medium text-slate-700 sm:block">{name}</span>
        <Icon
          name="ri-arrow-down-s-line"
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
          <Link
            href={profileHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="ri-user-line" className="h-4 w-4 text-slate-400" />
            Hồ sơ
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            <Icon name="ri-logout-box-r-line" className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
