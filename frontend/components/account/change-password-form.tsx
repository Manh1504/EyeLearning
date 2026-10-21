"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { changePassword, primaryRole, ROLE_HOME, type Role } from "@/lib/api/auth";
import { fetchMyProfile } from "@/lib/api/profile";
import { AUTH_USER_QUERY_KEY } from "@/hooks/use-stored-user";
import { cn } from "@/lib/utils";

const inputClass =
  "h-12 rounded-xl border-[#e8e8e3] bg-[#fdfdfa] px-4 text-[15px] text-black shadow-none placeholder:text-[#9a9a9a] hover:border-[#d7dbd2] focus-visible:border-black focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10";

export function ChangePasswordForm({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [show, setShow] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get("current") ?? "");
    const newPassword = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Xác nhận mật khẩu không khớp.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      // Đổi xong, /api/me/profile truy cập được → dùng role để điều hướng đúng khu vực.
      try {
        const profile = await fetchMyProfile();
        const role = profile.role as Role;
        queryClient.setQueryData(AUTH_USER_QUERY_KEY, {
          id: profile.email,
          email: profile.email,
          roles: [role],
          fullName: profile.fullName ?? null,
          avatarUrl: profile.avatarUrl ?? null,
        });
        router.replace(ROLE_HOME[primaryRole([role])]);
      } catch {
        router.replace("/account/login");
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Đổi mật khẩu thất bại — vui lòng thử lại.",
      );
      setPending(false);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="current-password" className="text-[13px] font-semibold text-[#2a2a2a]">
            Mật khẩu hiện tại <span className="text-destructive">*</span>
          </Label>
          <Input
            id="current-password"
            name="current"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Mật khẩu đang dùng"
            required
            className={inputClass}
            aria-invalid={error ? true : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-[13px] font-semibold text-[#2a2a2a]">
            Mật khẩu mới <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              name="next"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Ít nhất 8 ký tự"
              required
              className={cn(inputClass, "pr-12")}
              aria-invalid={error ? true : undefined}
            />
            <button
              type="button"
              aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#777777] transition-colors hover:bg-[#e8f1e6] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              <Icon name={show ? "ri-eye-off-line" : "ri-eye-line"} className="size-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-[13px] font-semibold text-[#2a2a2a]">
            Xác nhận mật khẩu mới <span className="text-destructive">*</span>
          </Label>
          <Input
            id="confirm-password"
            name="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
            required
            className={inputClass}
            aria-invalid={error ? true : undefined}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-[#eadbd8] bg-[#fbf4f2] px-3.5 py-3 text-sm leading-5 text-[#8b2c25]"
          >
            <Icon name="ri-error-warning-line" className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="h-12 w-full rounded-full bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary-hover active:bg-primary-active"
          disabled={pending}
        >
          {pending && <Spinner />}
          {pending ? "Đang lưu…" : "Đổi mật khẩu"}
        </Button>
      </form>
    </div>
  );
}
