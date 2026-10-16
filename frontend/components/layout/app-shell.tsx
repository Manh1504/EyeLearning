"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthState } from "@/lib/hooks/use-stored-user";
import { ErrorState } from "@/components/ui/error-state";
import type { Role } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  role: Role;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

export function AppShell({
  role,
  title,
  description,
  actions,
  children,
  contentClassName,
}: AppShellProps) {
  const { user, isLoading, isSessionExpired } = useAuthState();
  const router = useRouter();
  const displayTitle =
    role === "student" && title === "Khóa học của tôi" && user?.fullName
      ? `Chào mừng trở lại, ${user.fullName.trim().split(/\s+/).at(-1)}`
      : title;

  return (
    <div className="flex min-h-screen bg-[#f5f6f2]">
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <Sidebar role={role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pr-3">
        <Topbar role={role} user={isLoading ? null : user} />

        <main className={cn("flex-1 px-4 pb-4 sm:px-6 lg:px-0", contentClassName)}>
          <div className="premium-canvas mx-auto min-h-[calc(100vh-84px)] w-full max-w-[1440px] rounded-t-[28px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
            {(displayTitle || actions) && (
              <div className="mb-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  {displayTitle && (
                    <div className="space-y-2">
                      <h1 className="font-display text-balance text-3xl leading-tight text-foreground sm:text-[2.35rem]">
                        {displayTitle}
                      </h1>
                      {description && (
                        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                          {description}
                        </p>
                      )}
                    </div>
                  )}
                  {actions && (
                    <div className="flex shrink-0 items-center gap-2">{actions}</div>
                  )}
                </div>
              </div>
            )}

            {isSessionExpired ? (
              <ErrorState
                title="Phiên đăng nhập đã hết hạn"
                description="Vui lòng đăng nhập lại để tiếp tục."
                onRetry={() => {
                  router.push("/account/login");
                }}
                retryLabel="Đăng nhập"
              />
            ) : children}
          </div>
        </main>
      </div>
    </div>
  );
}
