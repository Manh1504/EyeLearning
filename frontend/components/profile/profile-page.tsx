'use client';

// components/profile/profile-page.tsx — Trang hồ sơ dùng chung cho học viên & giảng viên.
// Đọc user_profiles (+ student_profiles/teacher_profiles) và cho phép sửa thông tin cá nhân.

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-profile';
import type { GenderCode, MyProfile } from '@/lib/types/domain';
import { RiMailLine, RiCalendarLine, RiUserLine, RiIdCardLine, RiImageEditLine, RiCheckLine, RiErrorWarningLine } from '@remixicon/react';

const GENDERS: { value: GenderCode; label: string }[] = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

const labelCls = 'mb-1.5 block text-sm font-semibold text-foreground';
const selectCls =
  'h-10 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

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
  icon: IconComp,
  label,
  value,
  helper,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm border border-border">
        <IconComp className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="mt-1 truncate text-sm font-medium text-foreground" title={value}>
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
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div className="flex items-center gap-5">
          <UserAvatar
            src={form.avatarUrl || data.avatarUrl}
            name={form.fullName || data.fullName}
            className="h-20 w-20 text-2xl shadow-sm border border-border"
          />
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">
              {form.fullName || data.fullName}
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {roleTag}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {code}
              </span>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAvatarEditor((current) => !current)}
          aria-expanded={showAvatarEditor}
          aria-controls="avatar-editor"
          className="w-full sm:w-auto rounded-full"
        >
          <RiImageEditLine className="mr-2 h-4 w-4" />
          Thay ảnh đại diện
        </Button>
      </section>

      {mutation.isSuccess && (
        <div role="status" className="mb-8 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm animate-in fade-in zoom-in-95">
          <RiCheckLine className="h-5 w-5" aria-hidden />
          Hồ sơ của bạn đã được cập nhật thành công.
        </div>
      )}
      {mutation.isError && (
        <div role="alert" className="mb-8 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive shadow-sm animate-in fade-in zoom-in-95">
          <RiErrorWarningLine className="h-5 w-5" aria-hidden />
          Đã có lỗi xảy ra khi lưu thay đổi. Vui lòng thử lại.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Thông tin cá nhân</CardTitle>
            <CardDescription>Cập nhật thông tin hiển thị của bạn trên hệ thống.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {showAvatarEditor && (
              <div id="avatar-editor" className="rounded-xl border border-border bg-muted/40 p-5 animate-in slide-in-from-top-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <UserAvatar src={form.avatarUrl} name={form.fullName || data.fullName} className="h-16 w-16 text-xl shadow-sm border border-border" />
                  <div className="min-w-0 flex-1">
                    <label htmlFor="avatarUrl" className={labelCls}>
                      Liên kết URL ảnh đại diện
                    </label>
                    <Input
                      id="avatarUrl"
                      value={form.avatarUrl}
                      onChange={(event) => set('avatarUrl', event.target.value)}
                      placeholder="https://..."
                      className="rounded-xl"
                    />
                  </div>
                  <Button type="button" variant="ghost" onClick={closeAvatarEditor} className="rounded-full">
                    Đóng
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="fullName">Họ và tên</label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(event) => set('fullName', event.target.value)}
                  placeholder="Nhập họ và tên đầy đủ"
                  aria-invalid={!form.fullName.trim()}
                  className="rounded-xl"
                />
                {!form.fullName.trim() && (
                  <p className="mt-1.5 text-xs text-destructive">Họ và tên không được để trống.</p>
                )}
              </div>

              <div>
                <label className={labelCls} htmlFor="dob">Ngày sinh</label>
                <Input
                  id="dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) => set('dateOfBirth', event.target.value)}
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="gender">Giới tính</label>
                <select
                  id="gender"
                  className={selectCls}
                  value={form.gender}
                  onChange={(event) => set('gender', event.target.value as GenderCode | '')}
                >
                  <option value="">Chưa chọn</option>
                  {GENDERS.map((gender) => (
                    <option key={gender.value} value={gender.value}>{gender.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls} htmlFor="phone">Số điện thoại</label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  placeholder="Số điện thoại liên hệ"
                  className="rounded-xl"
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor={profileExtraKey}>{profileExtraLabel}</label>
                <Input
                  id={profileExtraKey}
                  value={isStudent ? form.program : form.department}
                  onChange={(event) => set(profileExtraKey, event.target.value)}
                  placeholder={isStudent ? 'VD: Công nghệ thông tin K46' : 'VD: Khoa Công nghệ thông tin'}
                  className="rounded-xl"
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="border-t bg-muted/10 px-6 py-4 flex flex-col sm:flex-row justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={mutation.isPending || !isDirty}
              className="w-full sm:w-auto rounded-full"
            >
              Hủy thay đổi
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={mutation.isPending || !form.fullName.trim() || !isDirty}
              className="w-full sm:w-auto rounded-full"
            >
              {mutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </CardFooter>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Tài khoản bảo mật</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <ReadOnlyItem icon={RiMailLine} label="Email đăng nhập" value={data.email} helper="Liên hệ quản trị để thay đổi" />
                <ReadOnlyItem icon={RiIdCardLine} label={codeLabel} value={code} />
                <ReadOnlyItem icon={RiCalendarLine} label="Ngày tham gia" value={formatDate(data.createdAt)} />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default function ProfilePage({ role }: { role: 'student' | 'teacher' }) {
  const { data, isLoading } = useMyProfile(role);

  if (isLoading || !data) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm font-medium">Đang tải hồ sơ...</p>
        </div>
      </main>
    );
  }

  return <ProfileForm data={data} role={role} />;
}
