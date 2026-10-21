"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { Spinner } from "@/components/ui/spinner";
import { NAV_BY_ROLE } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { AuthUser, Role } from "@/lib/api/auth";

export function Topbar({
  role,
  user,
}: {
  role: Role;
  user: AuthUser | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  // "Hồ sơ" đã nằm trong menu tài khoản (avatar) nên chỉ hiện nav chính.
  // Logo đã là link về trang chính của role (`/{role}`) nên bỏ luôn pill trùng
  // đích đứng cạnh logo cho đỡ rối: "Khóa học" (học viên/giảng viên), "Phân công" (admin).
  const primaryItems = (NAV_BY_ROLE[role] ?? []).filter(
    (item) => !item.href.endsWith("/profile") && item.href !== `/${role}`,
  );

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-3 bg-[#f5f6f2]/95 px-4 backdrop-blur-sm sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Mở menu"
      >
        <Icon name="ri-menu-line" className="size-5" />
      </Button>

      <Link href={`/${role}`} aria-label="GazeEdu" className="flex items-center">
        <BrandLogo variant="light" className="h-6 w-auto" priority />
      </Link>

      {primaryItems.length > 0 && (
        <nav className="ml-3 hidden items-center gap-1 lg:flex" aria-label="Điều hướng chính">
          {primaryItems.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon name={item.icon} className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">
        {user ? <UserMenu user={user} role={role} /> : <Spinner className="text-muted-foreground" />}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="max-w-64 border-none bg-background p-0">
          <SheetTitle className="sr-only">Điều hướng</SheetTitle>
          <Sidebar role={role} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
