"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { register, ROLE_HOME, type AuthUser } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { AUTH_USER_QUERY_KEY } from "@/lib/hooks/use-stored-user";

const inputClass =
  "h-12 rounded-xl border-[#e8e8e3] bg-[#fdfdfa] px-4 text-[15px] text-black shadow-none placeholder:text-[#9a9a9a] hover:border-[#d7dbd2] focus-visible:border-black focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10";

export function RegisterForm({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const birthYearRaw = String(formData.get("birthYear") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    const birthYear = Number(birthYearRaw);
    if (!fullName || !email || !birthYearRaw || !password) {
      setError("Vui lòng điền đầy đủ thông tin.");
      return;
    }
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > new Date().getFullYear()) {
      setError("Năm sinh không hợp lệ.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await register(fullName, email, password, birthYear);
      const user: AuthUser = result.user;
      queryClient.setQueryData(AUTH_USER_QUERY_KEY, user);
      const destination = ROLE_HOME.student;
      router.prefetch(destination);
      router.replace(destination);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Đăng ký thất bại — vui lòng thử lại.",
      );
      setPending(false);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="register-name" className="text-[13px] font-semibold text-[#2a2a2a]">
            Họ và tên <span className="text-destructive">*</span></Label>
          <Input
            id="register-name"
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            required
            maxLength={150}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-birth-year" className="text-[13px] font-semibold text-[#2a2a2a]">
            Năm sinh <span className="text-destructive">*</span>
          </Label>
          <Input
            id="register-birth-year"
            name="birthYear"
            type="number"
            inputMode="numeric"
            min={1900}
            max={new Date().getFullYear()}
            placeholder="2005"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-email" className="text-[13px] font-semibold text-[#2a2a2a]">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="register-email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="ban@truong.edu.vn"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-password" className="text-[13px] font-semibold text-[#2a2a2a]">
            Mật khẩu <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="register-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Tối thiểu 8 ký tự"
              required
              minLength={8}
              className={cn(inputClass, "pr-12")}
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

        <div className="space-y-2">
          <Label htmlFor="register-confirm" className="text-[13px] font-semibold text-[#2a2a2a]">
            Nhập lại mật khẩu <span className="text-destructive">*</span>
          </Label>
          <Input
            id="register-confirm"
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            required
            minLength={8}
            className={inputClass}
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
          {pending ? "Đang tạo tài khoản…" : "Đăng ký"}
        </Button>
      </form>
    </div>
  );
}

