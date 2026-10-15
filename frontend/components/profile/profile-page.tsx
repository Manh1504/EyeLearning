"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyProfile, useUpdateMyProfile } from "@/hooks/use-profile";
import type { GenderCode, MyProfile } from "@/lib/types/domain";
import { initialsOf } from "@/lib/utils";

const GENDERS: { value: GenderCode; label: string }[] = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
];

interface FormState {
  fullName: string;
  dateOfBirth: string;
  gender: GenderCode | "";
  phone: string;
  avatarUrl: string;
  program: string;
  department: string;
}

function toForm(data: MyProfile): FormState {
  return {
    fullName: data.fullName,
    dateOfBirth: data.dateOfBirth ?? "",
    gender: data.gender ?? "",
    phone: data.phone ?? "",
    avatarUrl: data.avatarUrl ?? "",
    program: data.role === "student" ? data.program ?? "" : "",
    department: data.role === "teacher" ? data.department ?? "" : "",
  };
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
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
    <div className="border-t border-border/70 py-4 first:border-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="size-3.5 shrink-0 text-muted-foreground" />
        <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      </div>
      <div className="min-w-0">
        <dd className="mt-1.5 truncate text-sm font-semibold text-foreground" title={value}>
          {value || "—"}
        </dd>
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </div>
    </div>
  );
}

function ProfileForm({ data }: { data: MyProfile }) {
  const mutation = useUpdateMyProfile();
  const initial = React.useMemo(() => toForm(data), [data]);
  const [form, setForm] = React.useState<FormState>(initial);
  const [showAvatarEditor, setShowAvatarEditor] = React.useState(false);

  const isDirty = React.useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  );

  const set = (key: keyof FormState, value: string) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const isStudent = data.role === "student";
  const code = isStudent ? data.studentCode : data.teacherCode;
  const roleTag = isStudent ? "Sinh viên" : "Giảng viên";

  const handleSave = () => {
    mutation.mutate({
      fullName: form.fullName.trim(),
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || null,
      phone: form.phone.trim() || null,
      avatarUrl: form.avatarUrl.trim() || null,
      ...(isStudent
        ? { program: form.program.trim() || null }
        : { department: form.department.trim() || null }),
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="rounded-[18px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:flex sm:items-center sm:gap-5 sm:p-5">
        <Avatar className="size-16 border border-border text-xl sm:size-18">
          {form.avatarUrl ? <AvatarImage src={form.avatarUrl} alt={form.fullName} /> : null}
          <AvatarFallback className="text-xl">{initialsOf(form.fullName)}</AvatarFallback>
        </Avatar>
        <div className="mt-4 min-w-0 flex-1 sm:mt-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Hồ sơ cá nhân</p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-[-0.035em] text-foreground">
            {form.fullName || data.fullName}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {roleTag} / {code}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAvatarEditor((v) => !v)}
          aria-expanded={showAvatarEditor}
          aria-controls="avatar-editor"
          className="mt-4 w-full sm:mt-0 sm:w-auto"
        >
          <Icon name="ri-image-line" />
          Thay ảnh
        </Button>
      </div>

      {mutation.isSuccess && (
        <Alert variant="success" title="Đã lưu thay đổi" />
      )}
      {mutation.isError && (
        <Alert variant="destructive" title="Không lưu được">
          Vui lòng thử lại.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
        <section className="overflow-hidden rounded-[18px] border border-[#eeeee9] bg-white shadow-xs">
          <div className="border-b border-border/70 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Thông tin có thể chỉnh sửa</p>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            {showAvatarEditor && (
              <div id="avatar-editor" className="flex flex-col gap-4 rounded-2xl border border-[#dfe9dc] bg-[#e8f1e6] p-4 sm:flex-row sm:items-end">
                <Avatar className="size-14">
                  {form.avatarUrl ? <AvatarImage src={form.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="text-base">{initialsOf(form.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="avatarUrl">Liên kết ảnh đại diện</Label>
                  <Input
                    id="avatarUrl"
                    value={form.avatarUrl}
                    onChange={(e) => set("avatarUrl", e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  placeholder="Họ và tên"
                  aria-invalid={!form.fullName.trim()}
                />
                {!form.fullName.trim() && (
                  <p className="text-xs text-destructive">Họ và tên không được để trống.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dob">Ngày sinh</Label>
                <Input
                  id="dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gender">Giới tính</Label>
                <select
                  id="gender"
                  value={form.gender}
                  onChange={(e) => set("gender", e.target.value)}
                   className="flex h-10 w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">Chọn giới tính</option>
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="Số điện thoại"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={isStudent ? "program" : "department"}>
                  {isStudent ? "Chương trình / Lớp" : "Khoa"}
                </Label>
                <Input
                  id={isStudent ? "program" : "department"}
                  value={isStudent ? form.program : form.department}
                  onChange={(e) => set(isStudent ? "program" : "department", e.target.value)}
                  placeholder={isStudent ? "VD: Công nghệ thông tin K46" : "VD: Khoa Công nghệ thông tin"}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="self-start rounded-[18px] border border-[#dfe9dc] bg-[#e8f1e6] p-5 shadow-xs sm:p-6">
          <div className="mb-7 flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Định danh tài khoản</p>
            <span className="size-2 rounded-full bg-success" title="Tài khoản đang hoạt động" />
          </div>
            <dl>
              <ReadOnlyItem icon="ri-mail-line" label="Email" value={data.email} helper="Không thể thay đổi" />
              <ReadOnlyItem icon="ri-calendar-line" label="Ngày tham gia" value={formatDate(data.createdAt)} />
              <ReadOnlyItem icon="ri-user-line" label="Vai trò" value={roleTag} />
              <ReadOnlyItem
                icon="ri-id-card-line"
                label={isStudent ? "Mã sinh viên" : "Mã giảng viên"}
                value={code}
              />
            </dl>
        </section>
      </div>

      <div className="sticky bottom-3 flex flex-col-reverse gap-2 rounded-[18px] border border-[#eeeee9] bg-white/95 p-2 shadow-lg backdrop-blur sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setForm(initial);
            setShowAvatarEditor(false);
            mutation.reset();
          }}
          disabled={mutation.isPending}
        >
          Hủy
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending || !form.fullName.trim() || !isDirty}
        >
          {mutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </div>
    </div>
  );
}

export function ProfilePage({ role }: { role: "student" | "teacher" }) {
  const { data, isLoading, isError, error, refetch } = useMyProfile();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center gap-5">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Không tải được hồ sơ"
        description={error instanceof Error ? error.message : "Vui lòng kiểm tra kết nối và thử lại."}
        onRetry={() => refetch()}
      />
    );
  }

  return <ProfileForm key={`${role}:${data.email}`} data={data} />;
}
