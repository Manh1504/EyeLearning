import { LoginForm } from "@/components/account/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-5 py-8">
      <div className="w-full max-w-[420px]">
        <LoginForm />
      </div>
    </div>
  )
}
