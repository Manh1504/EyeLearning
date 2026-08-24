'use client';

// components/profile/profile-page.tsx — Trang hồ sơ dùng chung cho học viên & giảng viên.
// Đọc user_profiles (+ student_profiles/teacher_profiles) và cho phép sửa thông tin cá nhân.
// Email + mật khẩu chưa cho đổi → hiển thị read-only.

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-profile';
import type { GenderCode, MyProfile } from '@/lib/types/domain';

const GENDERS: { value: GenderCode; label: string }[] = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

const labelCls = 'mb-1.5 block text-sm font-semibold text-foreground';
const selectCls =
  'h-10 w-full rounded-lg border border-input bg-background px-3 py-1 text-base text-foreground outline-none transition hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground md:text-sm';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

interface FormState {
  fullName: string;
  dateOfBirth: string;
  gender: GenderCode | '';
  phone: string;
  avatarUrl: string;
  program: string;
  department: string;
}

function toForm(data: MyProfile): FormState {
  return {
    fullName: data.fullName,
    dateOfBirth: data.dateOfBirth ?? '',
    gender: data.gender ?? '',
    phone: data.phone ?? '',
    avatarUrl: data.avatarUrl ?? '',
    program: data.role === 'student' ? data.program ?? '' : '',
    department: data.role === 'teacher' ? data.department ?? '' : '',
  };
}

function ReadOnlyItem({
  icon,
  label,
  value,
  helper,
}: {
  icon: string;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-muted/45 px-3 py-3">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 truncate text-sm font-semibold text-foreground" title={value}>
          {value || '—'}
        </dd>
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </div>
    </div>
  );
}

function ProfileForm({ data, role }: { data: MyProfile; role: 'student' | 'teacher' }) {
  const mutation = useUpdateMyProfile(role);
  const [form, setForm] = useState<FormState>(() => toForm(data));
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);

  const initialForm = useMemo(() => toForm(data), [data]);
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  const set = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    mutation.mutate({
      fullName: form.fullName.trim(),
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || null,
      phone: form.phone.trim() || null,
      avatarUrl: form.avatarUrl.trim() || null,
      ...(role === 'student'
        ? { program: form.program.trim() || null }
        : { department: form.department.trim() || null }),
    });
  };

  const handleReset = () => {
    setForm(toForm(data));
    setShowAvatarEditor(false);
    mutation.reset();
  };

  const closeAvatarEditor = () => {
    setShowAvatarEditor(false);
  };

  const isStudent = data.role === 'student';
  const code = isStudent ? data.studentCode : data.teacherCode;
  const codeLabel = isStudent ? 'Mã sinh viên' : 'Mã giảng viên';
  const roleTag = isStudent ? 'Sinh viên' : 'Giảng viên';
  const profileExtraLabel = isStudent ? 'Chương trình / Lớp' : 'Khoa';
  const profileExtraKey = isStudent ? 'program' : 'department';

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <UserAvatar
            src={form.avatarUrl || data.avatarUrl}
            name={form.fullName || data.fullName}
            className="h-18 w-18 text-xl sm:h-20 sm:w-20"
          />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
              {form.fullName || data.fullName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {roleTag} · {code}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAvatarEditor((current) => !current)}
          aria-expanded={showAvatarEditor}
          aria-controls="avatar-editor"
          className="w-full sm:w-auto"
        >
          <Icon name="ri-image-edit-line" data-icon="inline-start" />
          Thay ảnh
        </Button>
      </section>

      {mutation.isSuccess && (
        <div role="status" className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <Icon name="ri-check-line" className="h-4 w-4" aria-hidden />
          Đã lưu thay đổi.
        </div>
      )}
      {mutation.isError && (
        <div role="alert" className="mt-6 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Không lưu được. Vui lòng thử lại.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base font-semibold text-foreground">
              Thông tin cá nhân
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            {showAvatarEditor && (
              <div id="avatar-editor" className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <UserAvatar src={form.avatarUrl} name={form.fullName || data.fullName} className="h-14 w-14 text-base" />
                  <div className="min-w-0 flex-1">
                    <label htmlFor="avatarUrl" className={labelCls}>
                      Liên kết ảnh đại diện
                    </label>
                    <Input
                      id="avatarUrl"
                      value={form.avatarUrl}
                      onChange={(event) => set('avatarUrl', event.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <Button type="button" variant="ghost" onClick={closeAvatarEditor}>
                    Đóng
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="fullName">
                  Họ và tên
                </label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(event) => set('fullName', event.target.value)}
                  placeholder="Họ và tên"
                  aria-invalid={!form.fullName.trim()}
                />
                {!form.fullName.trim() && (
                  <p className="mt-1.5 text-sm text-destructive">Họ và tên không được để trống.</p>
                )}
              </div>

              <div>
                <label className={labelCls} htmlFor="dob">
                  Ngày sinh
                </label>
                <Input
                  id="dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) => set('dateOfBirth', event.target.value)}
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="gender">
                  Giới tính
                </label>
                <select
                  id="gender"
                  className={selectCls}
                  value={form.gender}
                  onChange={(event) => set('gender', event.target.value as GenderCode | '')}
                >
                  <option value="">Chọn giới tính</option>
                  {GENDERS.map((gender) => (
                    <option key={gender.value} value={gender.value}>
                      {gender.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls} htmlFor="phone">
                  Số điện thoại
                </label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  placeholder="Số điện thoại"
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor={profileExtraKey}>
                  {profileExtraLabel}
                </label>
                <Input
                  id={profileExtraKey}
                  value={isStudent ? form.program : form.department}
                  onChange={(event) => set(profileExtraKey, event.target.value)}
                  placeholder={isStudent ? 'VD: Công nghệ thông tin K46' : 'VD: Khoa Công nghệ thông tin'}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-3 border-t sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={mutation.isPending}
              className="w-full sm:w-auto"
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={mutation.isPending || !form.fullName.trim() || !isDirty}
              className="w-full sm:w-auto"
            >
              {mutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </CardFooter>
        </Card>

        <Card size="sm" className="self-start">
          <CardHeader>
            <CardTitle className="font-sans text-base font-semibold text-foreground">
              Thông tin tài khoản
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <ReadOnlyItem
                icon="ri-mail-line"
                label="Email"
                value={data.email}
                helper="Không thể thay đổi"
              />
              <ReadOnlyItem
                icon="ri-calendar-line"
                label="Ngày tham gia"
                value={formatDate(data.createdAt)}
              />
              <ReadOnlyItem icon="ri-user-line" label="Vai trò" value={roleTag} />
              <ReadOnlyItem icon="ri-id-card-line" label={codeLabel} value={code} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function ProfilePage({ role }: { role: 'student' | 'teacher' }) {
  const { data, isLoading } = useMyProfile(role);

  if (isLoading || !data) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Đang tải hồ sơ...
        </div>
      </main>
    );
  }

  return <ProfileForm data={data} role={role} />;
}
