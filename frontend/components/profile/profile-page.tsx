'use client';

// components/profile/profile-page.tsx — Trang hồ sơ dùng chung cho học viên & giảng viên.
// Đọc user_profiles (+ student_profiles/teacher_profiles) và cho phép sửa thông tin cá nhân.
// Email + mật khẩu chưa cho đổi → hiển thị read-only.

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-profile';
import type { GenderCode, MyProfile } from '@/lib/types/domain';

const GENDERS: { value: GenderCode; label: string }[] = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20';
const readOnlyCls =
  'flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500';

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

function ProfileForm({ data, role }: { data: MyProfile; role: 'student' | 'teacher' }) {
  const mutation = useUpdateMyProfile(role);
  const [form, setForm] = useState<FormState>(() => toForm(data));

  const initials = useMemo(
    () =>
      form.fullName.trim().split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?',
    [form.fullName],
  );

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
    mutation.reset();
  };

  const isStudent = data.role === 'student';
  const code = isStudent ? data.studentCode : data.teacherCode;
  const codeLabel = isStudent ? 'Mã sinh viên' : 'Mã giảng viên';
  const roleTitle = isStudent ? 'Thông tin sinh viên' : 'Thông tin giảng viên';
  const roleTag = isStudent ? 'Sinh viên' : 'Giảng viên';

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        {data.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.avatarUrl}
            alt={data.fullName}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xl font-bold text-white">
            {initials}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900">{data.fullName}</h1>
          <p className="text-sm text-slate-500">
            {roleTag} · {code}
          </p>
        </div>
      </div>

      {mutation.isSuccess && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <Icon name="ri-check-line" className="h-4 w-4" />
          Đã lưu thay đổi.
        </div>
      )}
      {mutation.isError && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Không lưu được — vui lòng thử lại.
        </div>
      )}

      {/* Thông tin đăng nhập (read-only) */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-bold text-slate-900">Thông tin đăng nhập</h2>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <Icon name="ri-lock-line" className="h-3.5 w-3.5" />
          Email và mật khẩu hiện chưa thể thay đổi.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="email">Email</label>
            <div id="email" className={`mt-1 ${readOnlyCls}`}>
              <Icon name="ri-mail-line" className="h-4 w-4 shrink-0" />
              {data.email}
            </div>
          </div>
          <div>
            <label className={labelCls}>Tham gia từ</label>
            <div className={`mt-1 ${readOnlyCls}`}>
              <Icon name="ri-calendar-line" className="h-4 w-4 shrink-0" />
              {data.createdAt}
            </div>
          </div>
        </div>
      </section>

      {/* Thông tin cá nhân (sửa được) */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-bold text-slate-900">Thông tin cá nhân</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="fullName">Họ và tên</label>
            <input
              id="fullName"
              className={`mt-1 ${inputCls}`}
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              placeholder="Họ và tên"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="dob">Ngày sinh</label>
            <input
              id="dob"
              type="date"
              className={`mt-1 ${inputCls}`}
              value={form.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="gender">Giới tính</label>
            <select
              id="gender"
              className={`mt-1 ${inputCls}`}
              value={form.gender}
              onChange={(e) => set('gender', e.target.value as GenderCode | '')}
            >
              <option value="">— Chọn —</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">Số điện thoại</label>
            <input
              id="phone"
              type="tel"
              className={`mt-1 ${inputCls}`}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="Số điện thoại"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="avatarUrl">Ảnh đại diện (URL)</label>
            <input
              id="avatarUrl"
              className={`mt-1 ${inputCls}`}
              value={form.avatarUrl}
              onChange={(e) => set('avatarUrl', e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
      </section>

      {/* Thông tin chuyên môn */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-bold text-slate-900">{roleTitle}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{codeLabel}</label>
            <div className={`mt-1 ${readOnlyCls}`}>
              <Icon name="ri-id-card-line" className="h-4 w-4 shrink-0" />
              {code}
            </div>
          </div>
          {isStudent ? (
            <div>
              <label className={labelCls} htmlFor="program">Chương trình / Lớp</label>
              <input
                id="program"
                className={`mt-1 ${inputCls}`}
                value={form.program}
                onChange={(e) => set('program', e.target.value)}
                placeholder="VD: Công nghệ thông tin K46"
              />
            </div>
          ) : (
            <div>
              <label className={labelCls} htmlFor="department">Khoa</label>
              <input
                id="department"
                className={`mt-1 ${inputCls}`}
                value={form.department}
                onChange={(e) => set('department', e.target.value)}
                placeholder="VD: Khoa Công nghệ thông tin"
              />
            </div>
          )}
        </div>
      </section>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={handleReset}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          onClick={handleSave}
          disabled={mutation.isPending || !form.fullName.trim()}
          className="rounded-lg bg-cyan-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage({ role }: { role: 'student' | 'teacher' }) {
  const { data, isLoading } = useMyProfile(role);

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-slate-500">Đang tải hồ sơ…</p>
      </div>
    );
  }

  return <ProfileForm data={data} role={role} />;
}
