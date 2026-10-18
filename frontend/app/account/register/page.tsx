import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/account/auth-layout";
import { RegisterForm } from "@/components/account/register-form";

export const metadata: Metadata = {
  title: "Đăng ký – GazeEdu",
};

export default function RegisterPage() {
  return (
    <AuthLayout>
      <div className="mb-6 space-y-1.5 text-center lg:text-left">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-foreground">
          Tạo tài khoản
        </h1>
        <p className="text-sm text-muted-foreground">
          Đăng ký tài khoản học viên để bắt đầu học tập.
        </p>
      </div>
      <RegisterForm />
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Đã có tài khoản?{" "}
        <Link href="/account/login" className="font-semibold text-foreground underline underline-offset-2">
          Đăng nhập
        </Link>
      </p>
    </AuthLayout>
  );
}
