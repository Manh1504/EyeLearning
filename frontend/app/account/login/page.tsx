import type { Metadata } from "next";
import { AuthLayout } from "@/components/account/auth-layout";
import { LoginForm } from "@/components/account/login-form";
import { DemoLoginLinks } from "@/components/account/demo-login-links";

export const metadata: Metadata = {
  title: "Đăng nhập – GazeEdu",
};

export default function LoginPage() {
  const demo = process.env.NEXT_PUBLIC_DEMO === "1";
  return (
    <AuthLayout>
      <div className="mb-6 space-y-1.5 text-center lg:text-left">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-foreground">
          Chào mừng trở lại
        </h1>
        <p className="text-sm text-muted-foreground">Đăng nhập để tiếp tục sử dụng GazeEdu.</p>
      </div>
      <LoginForm />
      {demo && <DemoLoginLinks />}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Gặp sự cố đăng nhập? Liên hệ quản trị viên trường của bạn.
      </p>
    </AuthLayout>
  );
}
