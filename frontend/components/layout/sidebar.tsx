"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { NAV_BY_ROLE } from "@/lib/nav";
import { type Role } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

export function Sidebar({
  role,
  onNavigate,
  expanded = false,
}: {
  role: Role;
  onNavigate?: () => void;
  expanded?: boolean;
}) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role] ?? [];
  const primaryItems = items.filter((item) => !item.href.endsWith("/profile"));
  const accountItems = items.filter((item) => item.href.endsWith("/profile"));

  const renderItems = (entries: typeof items) =>
    entries.map((item) => {
      const active = item.match(pathname);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={item.label}
          className={cn(
            "group relative flex h-11 items-center rounded-full transition-colors",
            expanded ? "gap-3 px-3.5" : "justify-center",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
              : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon name={item.icon} className="size-5 shrink-0" />
          {expanded && <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>}
        </Link>
      );
    });

  return (
    <div
      className={cn(
        "flex flex-col border border-sidebar-border bg-white text-sidebar-foreground shadow-sm",
        expanded
          ? "h-full w-64"
          : "m-3 h-[calc(100%-1.5rem)] w-[82px] rounded-[30px]",
      )}
    >
      <Link
        href={`/${role}`}
        onClick={onNavigate}
        className={cn("flex shrink-0 items-center gap-3", expanded ? "h-20 px-5" : "h-[104px] flex-col justify-center gap-1.5")}
        aria-label="GazeEdu"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eef3eb] text-[#52654f]">
          <Icon name="ri-eye-line" className="size-5" />
        </span>
        {expanded ? (
          <span className="font-display whitespace-nowrap text-lg text-foreground">EyeLearning</span>
        ) : (
          <span className="text-[9px] font-semibold tracking-tight text-foreground">EyeLearning</span>
        )}
      </Link>

      <nav
        className={cn(
          "flex flex-col gap-2 p-2",
          expanded ? "mx-3 rounded-[22px]" : "mx-auto w-[60px]",
        )}
        aria-label="Điều hướng chính"
      >
        {renderItems(primaryItems)}
      </nav>

      {accountItems.length > 0 && (
        <nav
          className={cn(
            "mt-auto flex flex-col gap-2 p-2",
            expanded ? "mx-3 mb-3 rounded-[22px]" : "mx-auto mb-3 w-[60px]",
          )}
          aria-label="Tài khoản"
        >
          {renderItems(accountItems)}
        </nav>
      )}

      {expanded && (
        <p className="mt-auto px-6 pb-6 text-[11px] leading-relaxed text-muted-foreground">
          GazeEdu · Eye-Tracking
        </p>
      )}
    </div>
  );
}
