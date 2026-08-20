'use client';

// components/admin/course-assignment.tsx — Admin: phân công giảng viên cho khóa học.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  assignTeachers,
  fetchCourseTeachers,
  fetchTeachers,
  unassignTeacher,
} from '@/lib/api/admin';
import { useTeacherCourses } from '@/hooks/use-teacher';

const SELECT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100';

export default function CourseAssignment() {
  const queryClient = useQueryClient();
  const { data: courses = [], isLoading } = useTeacherCourses();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chosen, setChosen] = useState('');
  const activeId = selectedId ?? courses[0]?.id ?? null;

  const { data: teachers = [] } = useQuery({
    queryKey: ['admin', 'teachers'],
    queryFn: () => fetchTeachers(),
  });

  const { data: assigned = [] } = useQuery({
    queryKey: ['admin', 'course-teachers', activeId],
    queryFn: () => fetchCourseTeachers(activeId!),
    enabled: Boolean(activeId),
  });

  const assign = useMutation({
    mutationFn: ({ courseId, teacherId }: { courseId: string; teacherId: string }) =>
      assignTeachers(courseId, [teacherId]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'course-teachers', activeId] }),
  });

  const unassign = useMutation({
    mutationFn: ({ courseId, teacherId }: { courseId: string; teacherId: string }) =>
      unassignTeacher(courseId, teacherId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'course-teachers', activeId] }),
  });

  const available = teachers.filter((t) => !assigned.some((a) => a.teacherId === t.id));
  const current = courses.find((c) => c.id === activeId);
  const error = assign.error ?? unassign.error;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Phân công giảng viên</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gán thêm giảng viên vào khóa học — giảng viên được phân công có thể xem nội dung và heatmap dù chưa có dữ liệu học viên.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Course list */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Khóa học</h2>
          </div>
          {isLoading ? (
            <p className="px-5 py-8 text-sm text-slate-400">Đang tải…</p>
          ) : courses.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400">Chưa có khóa học nào.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {courses.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50 ${
                      activeId === c.id ? 'bg-violet-50/60' : ''
                    }`}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ background: c.gradient || '#6366f1' }}
                    >
                      {c.title.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{c.title}</p>
                      <p className="truncate text-xs text-slate-400">{c.students} học viên</p>
                    </div>
                    <Icon name="ri-arrow-right-s-line" className="text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Assignment panel */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Giảng viên {current ? `· ${current.title}` : ''}
            </h2>
          </div>

          <div className="space-y-5 px-5 py-5">
            {error && (
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {(error as Error).message || 'Thao tác thất bại.'}
              </div>
            )}

            {/* Assigned list */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Đã phân công</p>
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {assigned.length === 0 ? (
                  <li className="px-3.5 py-3 text-sm text-slate-400">Chưa có giảng viên.</li>
                ) : (
                  assigned.map((t) => (
                    <li key={t.teacherId} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
                        {t.name.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{t.name}</p>
                        <p className="truncate text-xs text-slate-400">{t.code}{t.email ? ` · ${t.email}` : ''}</p>
                      </div>
                      {t.isOwner ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Chủ khóa học
                        </span>
                      ) : (
                        <button
                          onClick={() => activeId && unassign.mutate({ courseId: activeId, teacherId: t.teacherId })}
                          disabled={unassign.isPending}
                          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                        >
                          Gỡ
                        </button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Assign form */}
            <div>
              <label htmlFor="add-teacher" className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Thêm giảng viên
              </label>
              <div className="mt-2 flex gap-2">
                <select
                  id="add-teacher"
                  value={chosen}
                  onChange={(e) => setChosen(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Chọn giảng viên…</option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  onClick={() => {
                    if (activeId && chosen) {
                      assign.mutate({ courseId: activeId, teacherId: chosen });
                      setChosen('');
                    }
                  }}
                  disabled={!chosen || assign.isPending}
                  className="shrink-0"
                >
                  Gán
                </Button>
              </div>
              {available.length === 0 && assigned.length > 0 && (
                <p className="mt-2 text-xs text-slate-400">Tất cả giảng viên đã được phân công.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}