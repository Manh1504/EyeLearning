import type { Metadata } from "next";
import { AuthLayout } from "@/components/account/auth-layout";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export const metadata: Metadata = {
  title: "Đổi mật khẩu – GazeEdu",
};

export default function ChangePasswordPage() {
  return (
    <AuthLayout>
      <div className="mb-6 space-y-1.5 text-center lg:text-left">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-foreground">
          Đổi mật khẩu
        </h1>
        <p className="text-sm text-muted-foreground">
          Tài khoản của bạn cần đổi mật khẩu trước khi tiếp tục sử dụng GazeEdu.
        </p>
      </div>
      <ChangePasswordForm />
    </AuthLayout>
  );
}
