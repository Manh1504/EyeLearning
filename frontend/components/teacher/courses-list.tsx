'use client';

// components/teacher/courses-list.tsx — Danh sách khóa học của giảng viên.
// "Tạo khóa học mới" → chuyển thẳng sang editor (?tab=content&new=1), không qua modal.
// Data: useTeacherCourses → lib/api/teacher.ts (mock hiện tại, sẽ là GET /teacher/courses?status=&q=)

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';

import { CourseCover } from '@/components/course/course-cover';
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
  archived: 'border-border bg-muted text-muted-foreground',
};

const CREATE_HREF = '/teacher/courses/c-new?tab=content&new=1';
const courseTableGrid =
  'md:grid-cols-[minmax(0,1fr)_8.5rem_7rem_11rem_9rem_8rem] md:gap-4';

function courseHref(course: TeacherCourse) {
  return `/teacher/courses/${course.id}?tab=content`;
}

function courseAction() {
  return 'Quản lý';
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const progress = Math.min(Math.max(value, 0), 100);

  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-label={`Hoàn thành ${progress}%`}
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-brand-cyan transition-[width] duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className="mt-5 flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center"
    >
      <div className="max-w-sm">
        <div
          className={cn(
            'mx-auto flex h-10 w-10 items-center justify-center rounded-lg',
            tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon
            name={tone === 'danger' ? 'ri-error-warning-line' : 'ri-book-open-line'}
            className="text-xl"
          />
        </div>
        <h2 className="mt-3 text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  );
}

function CourseSkeleton() {
  return (
    <div className={cn('grid min-h-20 grid-cols-1 gap-3 border-b border-border bg-card px-4 py-4 md:items-center', courseTableGrid)}>
      <div className="flex items-center gap-3">
        <div className="aspect-video w-[104px] rounded-lg bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="mt-2 h-3 w-28 rounded bg-muted" />
        </div>
      </div>
      <div className="mx-auto h-6 w-24 rounded bg-muted" />
      <div className="mx-auto h-4 w-16 rounded bg-muted" />
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="mx-auto h-4 w-20 rounded bg-muted" />
      <div className="ml-auto h-4 w-16 rounded bg-muted" />
    </div>
  );
}

export default function TeacherCoursesPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const {
    data: courses = [],
    isLoading,
    isError,
    error,
  } = useTeacherCourses();

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
        course.title.toLocaleLowerCase('vi').includes(keyword) ||
        course.description.toLocaleLowerCase('vi').includes(keyword);

      return matchFilter && matchQuery;
    });
  }, [courses, filter, query]);

  const totalStudents = courses.reduce((sum, course) => sum + course.students, 0);
  const hasCourses = courses.length > 0;
  const hasActiveSearch = query.trim().length > 0 || filter !== 'all';
  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-bold leading-[1.2] tracking-tight text-foreground sm:text-[2rem]">
            Khóa học
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            Quản lý nội dung và theo dõi các khóa học của bạn.
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {counts.all} khóa học
            {counts.all > 0 && (
              <>
                <span className="mx-2 text-border">·</span>
                {totalStudents} học viên
              </>
            )}
          </p>
        </div>

        <Link href={CREATE_HREF} className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}>
          <Icon name="ri-add-line" data-icon="inline-start" />
          Tạo khóa học mới
        </Link>
      </section>

      {isLoading && (
        <section aria-live="polite" aria-busy="true" className="pt-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Đang tải khóa học</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {Array.from({ length: 5 }).map((_, index) => (
              <CourseSkeleton key={index} />
            ))}
          </div>
        </section>
      )}

      {isError && (
        <EmptyState
          tone="danger"
          title="Không tải được danh sách khóa học"
          description={
            error instanceof Error
              ? error.message
              : 'Vui lòng kiểm tra kết nối và thử tải lại trang.'
          }
        />
      )}

      {!isLoading && !isError && (
      <section className="pt-6">
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block w-full lg:max-w-[360px]">
              <span className="sr-only">Tìm theo tên hoặc mô tả khóa học</span>
              <Icon
                name="ri-search-line"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên hoặc mô tả..."
                className="pl-10 pr-3"
              />
            </label>

            <div
              role="tablist"
              aria-label="Lọc trạng thái khóa học"
              className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1"
            >
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
                      'flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none transition focus-visible:ring-3 focus-visible:ring-ring/20',
                      active
                        ? 'bg-card text-primary shadow-sm'
                        : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                    )}
                  >
                    {item.label}
                    <span className={cn('text-xs tabular-nums', active ? 'text-primary' : 'text-muted-foreground')}>
                      {counts[item.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!hasCourses ? (
          <EmptyState
            title="Chưa có khóa học nào"
            description="Tạo khóa học đầu tiên để bắt đầu quản lý nội dung học tập."
            action={
              <Link href={CREATE_HREF} className={cn(buttonVariants(), 'mt-4')}>
                <Icon name="ri-add-line" data-icon="inline-start" />
                Tạo khóa học mới
              </Link>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Không tìm thấy khóa học phù hợp"
            description="Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc."
            action={
              hasActiveSearch ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
                >
                  Xóa tìm kiếm và bộ lọc
                </button>
              ) : null
            }
          />
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
            <div className={cn('hidden border-b border-border bg-muted/60 px-4 py-3 text-sm font-semibold text-muted-foreground md:grid', courseTableGrid)}>
              <span>Khóa học</span>
              <span className="text-center">Trạng thái</span>
              <span className="text-center">Học viên</span>
              <span>Tiến độ TB</span>
              <span className="text-center">Cập nhật</span>
              <span className="text-right">Hành động</span>
            </div>

            <div className="divide-y divide-border">
              {visible.map((course) => {
                const completion = Math.min(Math.max(course.completion, 0), 100);

                return (
                  <article
                    key={course.id}
                    className={cn(
                      'grid gap-3 bg-card px-4 py-4 transition hover:bg-muted/30 md:min-h-[84px] md:items-center',
                      courseTableGrid,
                      course.status === 'archived' && 'opacity-80',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <CourseCover course={course} className="w-[96px] shrink-0 rounded-lg sm:w-[104px] md:w-[104px]" />
                      <div className="min-w-0">
                        <h2 title={course.title} className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground sm:text-base">
                          {course.title}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {LEVEL_LABEL[course.level]}
                        </p>
                      </div>
                    </div>

                    <div className="flex md:justify-center">
                      <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-semibold', STATUS_BADGE[course.status])}>
                        {STATUS_LABEL[course.status]}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground md:justify-center md:text-center md:text-foreground">
                      <span className="md:hidden">Học viên</span>
                      <span className="font-medium tabular-nums">{course.students}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground md:hidden">Tiến độ TB</span>
                        <span className="font-semibold tabular-nums text-foreground">{completion}%</span>
                      </div>
                      <ProgressBar value={completion} className="w-full md:w-24" />
                    </div>

                    <div className="hidden text-center text-sm text-muted-foreground md:block">
                      {course.updatedAt}
                    </div>

                    <div className="flex justify-end">
                      <Link
                        href={courseHref(course)}
                        aria-label={`Quản lý khóa học ${course.title}`}
                        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-0 hover:bg-transparent md:px-2')}
                      >
                        {courseAction()}
                        <Icon name="ri-arrow-right-line" data-icon="inline-end" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
      )}
    </main>
  );
}
