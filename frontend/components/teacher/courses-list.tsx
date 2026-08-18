'use client';

// components/teacher/courses-list.tsx — Danh sách khóa học của giảng viên.
// "Tạo khóa học mới" → chuyển thẳng sang editor (?tab=content&new=1), không qua modal.
// Data: useTeacherCourses → lib/api/teacher.ts (mock hiện tại, sẽ là GET /teacher/courses?status=&q=)

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { useTeacherCourses } from '@/hooks/use-teacher';
import { LEVEL_LABEL, STATUS_LABEL } from '@/lib/mock/teacher';
import type { CourseStatus, TeacherCourse } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

type Filter = CourseStatus | 'all';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'published', label: 'Đã xuất bản' },
  { key: 'draft', label: 'Nháp' },
  { key: 'archived', label: 'Lưu trữ' },
];

const STATUS_BADGE: Record<CourseStatus, string> = {
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-600',
};

const CREATE_HREF = '/teacher/courses/c-new?tab=content&new=1';

function courseHref(course: TeacherCourse) {
  return `/teacher/courses/${course.id}?tab=content`;
}

function courseAction(course: TeacherCourse) {
  if (course.status === 'draft') return 'Chỉnh sửa';
  return 'Xem khóa học';
}

export default function TeacherCoursesPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const { data: courses = [] } = useTeacherCourses();

  const counts = useMemo(() => ({
    all: courses.length,
    published: courses.filter((course) => course.status === 'published').length,
    draft: courses.filter((course) => course.status === 'draft').length,
    archived: courses.filter((course) => course.status === 'archived').length,
  }), [courses]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi');

    return courses.filter((course) => {
      const matchFilter = filter === 'all' || course.status === filter;
      const matchQuery =
        keyword.length === 0 ||
        course.title.toLocaleLowerCase('vi').includes(keyword);

      return matchFilter && matchQuery;
    });
  }, [courses, filter, query]);

  const totalStudents = courses.reduce((sum, course) => sum + course.students, 0);
  const hasCourses = courses.length > 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-6 sm:py-9 lg:py-10">
      <section className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]">
            Khóa học của tôi
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            {counts.all} khóa học đang quản lý
            <span className="mx-2 text-slate-300">·</span>
            {totalStudents} học viên
          </p>
        </div>

        <Link href={CREATE_HREF} className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}>
          <Icon name="ri-add-line" data-icon="inline-start" />
          Tạo khóa học mới
        </Link>
      </section>

      <section className="pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div role="tablist" aria-label="Lọc trạng thái khóa học" className="flex border-b border-slate-200">
            {FILTER_TABS.map((item) => {
              const active = item.key === filter;

              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    'relative -mb-px flex h-9 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition',
                    active
                      ? 'border-cyan-700 text-cyan-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900',
                  )}
                >
                  {item.label}
                  <span className={cn('text-xs tabular-nums', active ? 'text-cyan-700' : 'text-slate-400')}>
                    {counts[item.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="relative block w-full lg:w-[300px]">
            <span className="sr-only">Tìm theo tên khóa học</span>
            <Icon name="ri-search-line" className="pointer-events-none absolute left-3.5 top-1/2 text-lg text-slate-400 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên khóa học..."
              className="h-10 rounded-lg border-slate-200 bg-white pl-10 pr-3"
            />
          </label>
        </div>

        {!hasCourses ? (
          <div className="mt-10 flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name="ri-book-open-line" className="text-xl" />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-slate-900">Chưa có khóa học nào</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Tạo khóa học đầu tiên để bắt đầu quản lý nội dung học tập.
              </p>
              <Link href={CREATE_HREF} className={cn(buttonVariants(), 'mt-4')}>
                <Icon name="ri-add-line" data-icon="inline-start" />
                Tạo khóa học mới
              </Link>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-10 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name="ri-inbox-line" className="text-xl" />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-slate-900">Không tìm thấy khóa học phù hợp</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((course) => (
              <Link
                key={course.id}
                href={courseHref(course)}
                className={cn(
                  'group flex min-h-[220px] flex-col rounded-xl border border-slate-200 bg-white p-4 outline-none transition hover:border-slate-300 hover:shadow-sm focus-visible:border-cyan-600 focus-visible:ring-3 focus-visible:ring-cyan-600/10',
                  course.status === 'archived' && 'opacity-75',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={cn('rounded-md border px-2 py-1 text-xs font-medium', STATUS_BADGE[course.status])}>
                    {STATUS_LABEL[course.status]}
                  </span>
                  <span className="text-xs font-medium text-slate-400">{LEVEL_LABEL[course.level]}</span>
                </div>

                <h2
                  title={course.title}
                  className="mt-4 line-clamp-2 min-h-[2.75rem] text-[15px] font-bold leading-[1.4] text-slate-900 transition-colors group-hover:text-cyan-700"
                >
                  {course.title}
                </h2>

                <div className="mt-4 space-y-2 text-sm text-slate-500">
                  <p className="flex items-center gap-1.5">
                    <Icon name="ri-group-line" className="text-base text-slate-400" />
                    {course.students > 0 ? `${course.students} học viên` : 'Chưa có học viên'}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Icon name="ri-calendar-line" className="text-sm" />
                    Cập nhật {course.updatedAt}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3.5">
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-cyan-700">
                    {courseAction(course)}
                  </span>
                  <Icon name="ri-arrow-right-line" className="text-base text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-700" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
