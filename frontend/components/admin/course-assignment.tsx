'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  assignTeachers,
  fetchCourseTeachers,
  fetchTeachers,
  unassignTeacher,
  type CourseTeacher,
} from '@/lib/api/admin';
import { useTeacherCourses } from '@/hooks/use-teacher';
import { STATUS_LABEL } from '@/lib/mock/teacher';
import type { CourseStatus } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

type Filter = CourseStatus | 'all';

const STATUS_OPTIONS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'published', label: 'Đã xuất bản' },
  { value: 'draft', label: 'Bản nháp' },
  { value: 'archived', label: 'Lưu trữ' },
];

const STATUS_CLASS: Record<CourseStatus, string> = {
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  archived: 'border-border bg-muted text-muted-foreground',
};

function AssignmentPanel({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState('');
  const [notice, setNotice] = useState('');

  const teachersQuery = useQuery({
    queryKey: ['admin', 'teachers'],
    queryFn: () => fetchTeachers(),
  });
  const assignedQuery = useQuery({
    queryKey: ['admin', 'course-teachers', courseId],
    queryFn: () => fetchCourseTeachers(courseId),
  });

  const assigned = assignedQuery.data ?? [];
  const assignedIds = new Set(assigned.map((teacher) => teacher.teacherId));
  const available = (teachersQuery.data ?? []).filter((teacher) => !assignedIds.has(teacher.id));

  const refresh = () => queryClient.invalidateQueries({
    queryKey: ['admin', 'course-teachers', courseId],
  });

  const assign = useMutation({
    mutationFn: () => assignTeachers(courseId, [teacherId]),
    onSuccess: () => {
      setTeacherId('');
      setNotice('Đã phân công giảng viên.');
      refresh();
    },
    onError: () => setNotice(''),
  });
  const unassign = useMutation({
    mutationFn: (teacher: CourseTeacher) => unassignTeacher(courseId, teacher.teacherId),
    onSuccess: () => {
      setNotice('Đã gỡ giảng viên khỏi khóa học.');
      refresh();
    },
    onError: () => setNotice(''),
  });

  const queryError = assignedQuery.error ?? teachersQuery.error;
  const actionError = assign.error ?? unassign.error;

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-4 sm:px-6 sm:py-6">
      {assignedQuery.isLoading || teachersQuery.isLoading ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">Đang tải phân công…</p>
      ) : queryError ? (
        <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          {queryError instanceof Error ? queryError.message : 'Không tải được dữ liệu phân công.'}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <section aria-labelledby={`assigned-${courseId}`}>
            <h3 id={`assigned-${courseId}`} className="text-sm font-semibold text-foreground">
              Giảng viên hiện tại
            </h3>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
              {assigned.length === 0 ? (
                <li className="px-4 py-4 text-sm text-muted-foreground">Chưa có giảng viên được phân công.</li>
              ) : assigned.map((teacher) => (
                <li key={teacher.teacherId} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <UserAvatar name={teacher.name} className="h-9 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{teacher.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {teacher.code}{teacher.email ? ` · ${teacher.email}` : ''}
                    </span>
                  </span>
                  {teacher.isOwner ? (
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                      Chủ khóa học
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={unassign.isPending}
                      onClick={() => unassign.mutate(teacher)}
                      aria-label={`Gỡ ${teacher.name} khỏi khóa học`}
                    >
                      Gỡ
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              setNotice('');
              if (teacherId) assign.mutate();
            }}
            aria-labelledby={`add-teacher-${courseId}`}
          >
            <h3 id={`add-teacher-${courseId}`} className="text-sm font-semibold text-foreground">
              Thêm giảng viên
            </h3>
            <label htmlFor={`teacher-${courseId}`} className="mt-3 block text-sm font-medium text-foreground">
              Chọn từ danh mục
            </label>
            <select
              id={`teacher-${courseId}`}
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              disabled={available.length === 0 || assign.isPending}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              <option value="">{available.length === 0 ? 'Không còn giảng viên để gán' : 'Chọn giảng viên'}</option>
              {available.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.code}</option>
              ))}
            </select>
            <Button type="submit" disabled={!teacherId || assign.isPending} className="mt-3 w-full">
              {assign.isPending ? 'Đang phân công…' : 'Phân công giảng viên'}
            </Button>
            <div aria-live="polite" className="mt-3 min-h-5 text-sm">
              {actionError ? (
                <p role="alert" className="text-destructive">
                  {actionError instanceof Error ? actionError.message : 'Không thực hiện được thao tác.'}
                </p>
              ) : null}
              {notice ? <p className="text-emerald-700">{notice}</p> : null}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function CourseAssignment() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const coursesQuery = useTeacherCourses();
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);

  const visibleCourses = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi');
    return courses.filter((course) => {
      const matchesStatus = filter === 'all' || course.status === filter;
      const matchesQuery = !keyword || [course.title, course.id, course.description]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(keyword);
      return matchesStatus && matchesQuery;
    });
  }, [courses, filter, query]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quản trị</p>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Phân công giảng viên
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
          Chọn một khóa học để xem chủ sở hữu, thêm giảng viên hỗ trợ hoặc gỡ phân công hiện tại.
        </p>
      </header>

      <section aria-label="Tìm và lọc khóa học" className="grid gap-3 py-6 sm:grid-cols-[minmax(0,1fr)_240px]">
        <label className="relative block">
          <span className="sr-only">Tìm khóa học</span>
          <Icon name="ri-search-line" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc mã khóa học" className="h-11 pl-10" />
        </label>
        <label>
          <span className="sr-only">Lọc theo trạng thái</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
          >
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </section>

      <section aria-labelledby="course-list-heading" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <h2 id="course-list-heading" className="text-base font-semibold text-foreground">Khóa học</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{visibleCourses.length} / {courses.length}</span>
        </div>

        {coursesQuery.isLoading ? (
          <div aria-busy="true" aria-live="polite" className="space-y-3 p-4 sm:p-6">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 rounded-lg bg-muted" />)}
          </div>
        ) : coursesQuery.isError ? (
          <div role="alert" className="p-6 text-sm text-destructive">
            {coursesQuery.error instanceof Error ? coursesQuery.error.message : 'Không tải được danh sách khóa học.'}
          </div>
        ) : visibleCourses.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Icon name="ri-book-open-line" className="mx-auto text-2xl text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-base font-semibold text-foreground">Không có khóa học phù hợp</h2>
            <p className="mt-2 text-sm text-muted-foreground">Thử thay đổi từ khóa hoặc trạng thái.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleCourses.map((course) => {
              const expanded = expandedId === course.id;
              return (
                <article key={course.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`assignment-${course.id}`}
                    onClick={() => setExpandedId(expanded ? null : course.id)}
                    className={cn(
                      'flex min-h-20 w-full items-center gap-3 px-4 py-4 text-left outline-none transition hover:bg-muted/60 focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/25 sm:px-6',
                      expanded && 'bg-accent/60',
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                      <Icon name="ri-book-open-line" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-foreground">{course.title}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{course.id} · {course.students} học viên</span>
                    </span>
                    <span className={cn('hidden rounded-full border px-2 py-1 text-xs font-medium sm:inline-flex', STATUS_CLASS[course.status])}>
                      {STATUS_LABEL[course.status]}
                    </span>
                    <Icon name="ri-arrow-down-s-line" className={cn('shrink-0 text-xl text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden />
                  </button>
                  {expanded ? <div id={`assignment-${course.id}`}><AssignmentPanel courseId={course.id} /></div> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
