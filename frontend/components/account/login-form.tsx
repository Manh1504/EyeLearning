"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { login, primaryRole, ROLE_HOME, type AuthUser, type Role } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { AUTH_USER_QUERY_KEY } from "@/hooks/use-stored-user";

const PROTECTED = ["/student", "/teacher", "/admin"] as const;

function isProtected(path: string | null): path is string {
  if (!path) return false;
  return PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
}

function resolveRedirect(user: AuthUser, next: string | null): string {
  const roles = user.roles ?? [];
  // Ưu tiên role khớp với ?next để tránh redirect chéo role
  if (isProtected(next)) {
    const zone = next.split("/")[1] as Role;
    if (roles.includes(zone)) return next;
  }
  return ROLE_HOME[primaryRole(roles)];
}

export function LoginForm({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) return;

    setPending(true);
    setError(null);
    try {
      const result = await login(email, password);
      const next =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const destination = resolveRedirect(result.user, next);
      queryClient.setQueryData(AUTH_USER_QUERY_KEY, result.user);
      router.prefetch(destination);
      router.replace(destination);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Đăng nhập thất bại — vui lòng thử lại.",
      );
      setPending(false);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="login-email" className="text-[13px] font-semibold text-[#2a2a2a]">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="ban@truong.edu.vn"
            required
            className="h-12 rounded-xl border-[#e8e8e3] bg-[#fdfdfa] px-4 text-[15px] text-black shadow-none placeholder:text-[#9a9a9a] hover:border-[#d7dbd2] focus-visible:border-black focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10"
            aria-invalid={error ? true : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password" className="text-[13px] font-semibold text-[#2a2a2a]">
            Mật khẩu <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              required
              className="h-12 rounded-xl border-[#e8e8e3] bg-[#fdfdfa] px-4 pr-12 text-[15px] text-black shadow-none placeholder:text-[#9a9a9a] hover:border-[#d7dbd2] focus-visible:border-black focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10"
              aria-invalid={error ? true : undefined}
            />
            <button
              type="button"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#777777] transition-colors hover:bg-[#e8f1e6] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              <Icon name={showPassword ? "ri-eye-off-line" : "ri-eye-line"} className="size-4" />
            </button>
          </div>
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
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
    </div>
  );
}
