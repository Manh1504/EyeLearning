"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { logout, ROLE_LABEL, type AuthUser, type Role } from "@/lib/api/auth";
import { PROFILE_HREF } from "@/lib/nav";
import { cn, initialsOf } from "@/lib/utils";

export function UserMenu({ user, role, className }: { user: AuthUser; role: Role; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await logout();
    router.replace("/account/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-full border border-border bg-surface p-0.5 pr-2.5 text-sm shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label="Menu tài khoản"
      >
        <Avatar className="size-8">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName ?? user.email} /> : null}
          <AvatarFallback>{initialsOf(user.fullName ?? user.email)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate font-medium text-foreground sm:block">
          {user.fullName ?? user.email}
        </span>
        <Icon name="ri-arrow-down-s-line" className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-semibold text-foreground">
            {user.fullName ?? user.email}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-1 inline-flex w-fit rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
            {ROLE_LABEL[role]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={PROFILE_HREF[role]}>
            <Icon name="ri-user-line" />
            Hồ sơ của tôi
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive disabled={pending} onSelect={handleLogout}>
          <Icon name="ri-logout-box-r-line" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
