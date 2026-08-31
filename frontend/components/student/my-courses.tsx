'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  RiArrowRightLine,
  RiBookOpenLine,
  RiPlayCircleLine,
  RiSearchLine,
  RiStackLine,
  RiUserLine,
} from '@remixicon/react';

import { CourseCover } from '@/components/course/course-cover';
import { buttonVariants } from '@/components/ui/button';
import { useMyEnrollments } from '@/hooks/use-student';
import { LEVEL_LABEL } from '@/lib/mock/student';
import type { EnrolledCourse } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

type TabKey = 'all' | 'active' | 'completed';

function getCourseHref(enrollment: EnrolledCourse) {
  return `/student/courses/${enrollment.course.id}/prepare`;
}

function ProgressBar({ progress }: { progress: number }) {
  const value = Math.min(Math.max(progress, 0), 100);

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={`Tiến độ ${value}%`}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-brand-cyan transition-[width] duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function courseStatusLabel(enrollment: EnrolledCourse) {
  return enrollment.status === 'completed' ? 'Hoàn thành' : 'Đang học';
}

function courseActionLabel(enrollment: EnrolledCourse) {
  if (enrollment.status === 'completed') return 'Xem lại';
  return enrollment.progress > 0 ? 'Tiếp tục học' : 'Bắt đầu học';
}

export default function MyCoursesPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const { data: enrollments = [], isError, isLoading } = useMyEnrollments();

  const visibleEnrollments = useMemo(
    () => enrollments.filter((enrollment) => enrollment.status !== 'dropped'),
    [enrollments],
  );

  const counts = useMemo(() => {
    const active = visibleEnrollments.filter((enrollment) => enrollment.status === 'active').length;
    const completed = visibleEnrollments.filter(
      (enrollment) => enrollment.status === 'completed',
    ).length;

    return {
      all: visibleEnrollments.length,
      active,
      completed,
    };
  }, [visibleEnrollments]);

  const continueCourse = useMemo(
    () =>
      visibleEnrollments.find(
        (enrollment) => enrollment.status === 'active' && enrollment.progress > 0,
      ) ?? visibleEnrollments.find((enrollment) => enrollment.status === 'active'),
    [visibleEnrollments],
  );

  const showControls = visibleEnrollments.length >= 6;
  const effectiveTab = showControls ? tab : 'all';
  const effectiveQuery = showControls ? query : '';

  const filtered = useMemo(() => {
    const keyword = effectiveQuery.trim().toLocaleLowerCase('vi');

    return visibleEnrollments.filter((enrollment) => {
      const matchesTab = effectiveTab === 'all' || enrollment.status === effectiveTab;
      const matchesQuery =
        keyword.length === 0 ||
        enrollment.course.title.toLocaleLowerCase('vi').includes(keyword) ||
        enrollment.course.teacherName.toLocaleLowerCase('vi').includes(keyword);

      return matchesTab && matchesQuery;
    });
  }, [effectiveQuery, effectiveTab, visibleEnrollments]);

  const sortedFiltered = useMemo(() => {
    const order = { active: 0, completed: 1, dropped: 2 };
    return [...filtered].sort((a, b) => order[a.status] - order[b.status]);
  }, [filtered]);

  const showContinueCourse =
    Boolean(continueCourse) &&
    effectiveQuery.trim().length === 0 &&
    (effectiveTab === 'all' || effectiveTab === 'active');

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'all', label: 'Tất cả', count: counts.all },
    { key: 'active', label: 'Đang học', count: counts.active },
    { key: 'completed', label: 'Đã hoàn thành', count: counts.completed },
  ];

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
        <h1 className="text-[1.75rem] font-bold leading-[1.2] tracking-tight text-foreground sm:text-[2rem]">
          Khóa học của tôi
        </h1>
        <div role="status" className="mt-8 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Đang tải khóa học...
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
        <h1 className="text-[1.75rem] font-bold leading-[1.2] tracking-tight text-foreground sm:text-[2rem]">
          Khóa học của tôi
        </h1>
        <div role="alert" className="mt-8 rounded-xl border border-destructive/25 bg-destructive/10 p-5 text-sm font-medium text-destructive">
          Không tải được danh sách khóa học. Vui lòng thử lại.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section>
        <h1 className="text-[1.75rem] font-bold leading-[1.2] tracking-tight text-foreground sm:text-[2rem]">
          Khóa học của tôi
        </h1>
      </section>

      {showContinueCourse && continueCourse && (
        <section className="pt-8">
          <h2 className="flex items-center gap-3 text-lg font-bold text-foreground sm:text-xl">
            <span className="h-6 w-[3px] rounded-full bg-brand-cyan" aria-hidden="true" />
            Tiếp tục học
          </h2>

          <article className="mt-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm lg:p-6">
            <div className="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)] md:items-center xl:grid-cols-[320px_minmax(0,1fr)_320px] xl:gap-8">
              <CourseCover course={continueCourse.course} className="w-full lg:w-[320px]" />

              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-primary">
                  <span className="h-2 w-2 rounded-full bg-brand-cyan" aria-hidden="true" />
                  {courseStatusLabel(continueCourse)}
                </span>

                <h3 className="mt-4 line-clamp-2 text-xl font-bold leading-snug text-foreground lg:text-2xl">
                  {continueCourse.course.title}
                </h3>

                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p className="flex min-w-0 items-center gap-2">
                    <RiUserLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">Giáo viên: {continueCourse.course.teacherName}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <RiBookOpenLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>{LEVEL_LABEL[continueCourse.course.level]}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{continueCourse.course.moduleCount} chương</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{continueCourse.course.lessonCount} bài học</span>
                  </p>
                </div>
              </div>

              <div className="min-w-0 md:col-start-2 xl:col-start-auto">
                <div className="mb-3 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-foreground">Tiến độ hiện tại</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {Math.min(Math.max(continueCourse.progress, 0), 100)}%
                  </span>
                </div>
                <ProgressBar progress={continueCourse.progress} />

                <div className="mt-6 flex justify-end">
                  <Link
                    href={getCourseHref(continueCourse)}
                    className={cn(buttonVariants({ size: 'lg' }), 'w-full md:w-[180px]')}
                  >
                    <RiPlayCircleLine data-icon="inline-start" className="h-5 w-5" aria-hidden="true" />
                    {courseActionLabel(continueCourse)}
                  </Link>
                </div>
              </div>
            </div>
          </article>
        </section>
      )}

      <section className={showContinueCourse ? 'pt-10' : 'pt-8'}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-3 text-lg font-bold text-foreground sm:text-xl">
              <span className="h-6 w-[3px] rounded-full bg-brand-cyan" aria-hidden="true" />
              Tất cả khóa học
            </h2>
            <p className="mt-1.5 pl-4 text-sm text-muted-foreground">
              {effectiveQuery.trim() ? `${sortedFiltered.length} kết quả phù hợp` : `${counts.all} khóa học`}
            </p>
          </div>

          {showControls && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block w-full sm:w-[280px]">
                <span className="sr-only">Tìm khóa học</span>
                <RiSearchLine className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm khóa học"
                  className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-ring/60 focus:border-ring focus:ring-3 focus:ring-ring/20"
                />
              </label>

              <div role="tablist" aria-label="Lọc khóa học" className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-card p-1">
                {tabs.filter((item) => item.key === 'all' || item.count > 0).map((item) => {
                  const active = item.key === tab;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(item.key)}
                      className={cn(
                        'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                        active
                          ? 'bg-accent text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {item.label}
                      <span className="text-xs tabular-nums text-muted-foreground">{item.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {sortedFiltered.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sortedFiltered.map((enrollment) => {
              const completed = enrollment.status === 'completed';
              const progress = Math.min(Math.max(enrollment.progress, 0), 100);

              return (
                <Link
                  key={enrollment.enrollmentId}
                  href={getCourseHref(enrollment)}
                  className="group flex min-h-full flex-col rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm outline-none transition hover:border-ring/50 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                >
                  <CourseCover course={enrollment.course} className="w-full" />

                  <div className="mt-3 flex flex-1 flex-col">
                    <span
                      className={cn(
                        'inline-flex w-fit items-center gap-1.5 text-xs font-semibold',
                        completed ? 'text-emerald-600' : 'text-primary',
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          completed ? 'bg-emerald-500' : 'bg-brand-cyan',
                        )}
                        aria-hidden="true"
                      />
                      {courseStatusLabel(enrollment)}
                    </span>

                    <h3 className="mt-2.5 line-clamp-2 text-lg font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
                      {enrollment.course.title}
                    </h3>

                    <div className="mt-2.5 space-y-2 text-sm text-muted-foreground">
                      <p className="flex min-w-0 items-center gap-2">
                        <RiUserLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">{enrollment.course.teacherName}</span>
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <RiStackLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span>{enrollment.course.moduleCount} chương</span>
                        <span className="text-muted-foreground">·</span>
                        <span>{enrollment.course.lessonCount} bài học</span>
                      </p>
                    </div>

                    <div className="mt-auto pt-4">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">Tiến độ</span>
                        <span className="font-semibold tabular-nums text-foreground">{progress}%</span>
                      </div>
                      <ProgressBar progress={progress} />

                      <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors group-hover:text-primary-hover">
                        {courseActionLabel(enrollment)}
                        <RiArrowRightLine className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <RiBookOpenLine className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">
                {visibleEnrollments.length === 0 ? 'Chưa có khóa học' : 'Không tìm thấy khóa học'}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {visibleEnrollments.length === 0
                  ? 'Tài khoản của bạn chưa được ghi danh vào khóa học nào.'
                  : 'Thử đổi từ khóa tìm kiếm hoặc chọn trạng thái khóa học khác.'}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
