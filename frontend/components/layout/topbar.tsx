"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { Spinner } from "@/components/ui/spinner";
import type { AuthUser, Role } from "@/lib/api/auth";

const SECTION_LABEL: Record<string, string> = {
  student: "Học viên",
  teacher: "Giảng viên",
  admin: "Quản trị",
};

export function Topbar({
  role,
  user,
}: {
  role: Role;
  user: AuthUser | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const section = SECTION_LABEL[segments[0] ?? role] ?? "GazeEdu";
  const showSearch = pathname === `/${role}` && role !== "admin";

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-3 bg-[#f5f6f2]/95 px-4 backdrop-blur-sm sm:px-6 lg:px-0 lg:pr-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Mở menu"
      >
        <Icon name="ri-menu-line" className="size-5" />
      </Button>

      <div className="lg:hidden">
        <BrandLogo variant="light" className="h-6 w-auto grayscale" />
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        {showSearch ? (
          <button
            type="button"
            onClick={() => document.getElementById("page-search")?.focus()}
            className="flex h-9 w-64 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-xs text-muted-foreground shadow-xs transition hover:border-foreground/15"
          >
            <Icon name="ri-search-line" className="size-4" />
            Tìm kiếm
          </button>
        ) : (
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {section}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" className="hidden border border-border bg-surface sm:inline-flex" asChild>
          <a href="mailto:support@eyelearning.id.vn">
            <Icon name="ri-question-line" className="size-4" />
            <span className="sr-only">Trợ giúp</span>
          </a>
        </Button>
        <Button variant="ghost" size="icon-sm" className="hidden border border-border bg-surface sm:inline-flex" aria-label="Thông báo">
          <Icon name="ri-inbox-line" className="size-4" />
        </Button>
        {user ? <UserMenu user={user} role={role} /> : <Spinner className="text-muted-foreground" />}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="max-w-64 border-none bg-background p-0">
          <SheetTitle className="sr-only">Điều hướng</SheetTitle>
          <Sidebar role={role} expanded onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
