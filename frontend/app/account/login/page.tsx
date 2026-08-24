import { LoginForm } from "@/components/account/login-form"

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-5 py-8">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-cyan/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#e8f9fd_0,transparent_34%)]" />
      <div className="relative w-full max-w-[420px]">
        <LoginForm />
      </div>
    </div>
  )
}
