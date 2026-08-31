import { LoginForm } from "@/components/account/login-form"
import { BrandLogo } from "@/components/ui/brand-logo"
import Link from "next/link"

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-5 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="GazeEdu — Trang chủ">
          <BrandLogo variant="light" className="h-10" priority />
        </Link>
        <p className="mt-3 text-sm text-muted-foreground">
          Nền tảng học tập phân tích điểm nhìn bằng webcam.
        </p>
      </div>

      <div className="w-full max-w-[420px]">
        <LoginForm />
      </div>
    </div>
  )
}