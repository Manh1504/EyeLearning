"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthState } from "@/lib/hooks/use-stored-user";
import { ROLE_LABEL } from "@/lib/api/auth";
import { initialsOf } from "@/lib/utils";

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-t border-border/70 py-4 first:border-0 first:pt-0 last:pb-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground" title={value}>
          <Icon name={icon} className="size-4 shrink-0 text-muted-foreground" />
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export function AdminProfile() {
  const { user, isLoading, isSessionExpired, error, refetch } = useAuthState();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorState
        title="Không tải được hồ sơ"
        description={
          isSessionExpired
            ? "Phiên đăng nhập không hợp lệ."
            : error instanceof Error
              ? error.message
              : "Vui lòng thử lại."
        }
        onRetry={isSessionExpired ? undefined : refetch}
      />
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 md:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.28fr)]">
      <section className="rounded-[18px] border border-[#dfe9dc] bg-[#e8f1e6] p-5 text-foreground shadow-xs sm:p-6">
        <Avatar className="size-16 border border-white">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName ?? user.email} /> : null}
          <AvatarFallback className="bg-white text-lg text-foreground">{initialsOf(user.fullName ?? user.email)}</AvatarFallback>
        </Avatar>
        <div className="mt-8 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Hồ sơ hệ thống</p>
          <h1 className="mt-2 break-words text-2xl font-bold tracking-[-0.035em] text-foreground">
            {user.fullName ?? user.email}
          </h1>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge className="border-white bg-white text-foreground">{ROLE_LABEL.admin}</Badge>
          </div>
        </div>
        <p className="mt-8 text-xs leading-5 text-muted-foreground">Tài khoản có quyền quản trị và cấu hình toàn hệ thống.</p>
      </section>

      <section className="rounded-[18px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-6">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Tài khoản</p>
              <h2 className="mt-2 text-lg font-bold tracking-[-0.02em] text-foreground">Thông tin định danh</h2>
            </div>
            <span className="rounded-full bg-success/10 px-3 py-1 text-[10px] font-bold text-success">ĐANG HOẠT ĐỘNG</span>
          </div>
          <dl>
            <InfoItem icon="ri-mail-line" label="Email" value={user.email} />
            <InfoItem icon="ri-user-line" label="Vai trò" value={ROLE_LABEL.admin} />
          </dl>
          <p className="mt-8 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
            Tài khoản quản trị viên không có hồ sơ cá nhân để chỉnh sửa. Liên hệ bộ phận kỹ thuật nếu cần
            thay đổi thông tin.
          </p>
      </section>
    </div>
  );
}
