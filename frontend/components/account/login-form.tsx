'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { login, type Role } from '@/lib/api/auth';
import { cn } from '@/lib/utils';

function primaryRole(roles: Role[]): Role {
  for (const code of ['teacher', 'student', 'admin'] as const) {
    if (roles.includes(code)) return code;
  }
  return roles[0] ?? 'student';
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('username') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    if (!email || !password) return;

    setPending(true);
    setError(null);
    try {
      const result = await login(email, password);
      const role = primaryRole(result.user.roles);
      const target =
        role === 'student'
          ? '/student/my-courses'
          : role === 'admin'
            ? '/admin/courses'
            : '/teacher/courses';
      router.replace(target);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Đăng nhập thất bại — vui lòng thử lại.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cn('w-full', className)} {...props}>
      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card px-6 py-8 sm:px-8 sm:py-9">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Icon name="ri-eye-line" className="text-xl" />
            </span>
            <span className="text-base font-semibold text-slate-900">
              Gaze<span className="text-primary">Edu</span>
            </span>
          </div>

          <h1 className="mt-7 text-2xl font-bold tracking-tight text-slate-900">
            Chào mừng trở lại
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Đăng nhập để tiếp tục sử dụng GazeEdu.
          </p>
        </div>

        <FieldGroup className="mt-8 gap-5">
          <Field>
            <FieldLabel htmlFor="login-identifier" className="text-sm font-medium text-slate-700">
              Email
            </FieldLabel>
            <Input
              id="login-identifier"
              name="username"
              type="email"
              autoComplete="username"
              pattern="[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"
              placeholder="Nhập email"
              title="Vui lòng nhập email hợp lệ"
              required
              onInvalid={(event) => {
                event.currentTarget.setCustomValidity('Vui lòng nhập email hợp lệ');
              }}
              onInput={(event) => {
                event.currentTarget.setCustomValidity('');
              }}
              className="h-11 rounded-lg bg-background px-3"
            />
          </Field>

          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="login-password" className="text-sm font-medium text-slate-700">
                Mật khẩu
              </FieldLabel>
              {/* Route will be implemented in the forgot-password page task. */}
              <Link
                href="/account/forgot-password"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>

            <div className="relative">
              <Input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                required
                className="h-11 rounded-lg bg-background px-3 pr-11"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <Icon name={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
              </button>
            </div>
          </Field>

          <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
            {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </FieldGroup>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">
            <Icon name="ri-error-warning-line" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </form>
    </div>
  );
}
