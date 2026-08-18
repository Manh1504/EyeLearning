'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  RiArrowRightLine,
  RiBookOpenLine,
  RiCheckboxCircleFill,
  RiPlayCircleLine,
  RiSearchLine,
  RiStackLine,
  RiUserLine,
} from '@remixicon/react';

import { buttonVariants } from '@/components/ui/button';
import { useMyEnrollments } from '@/hooks/use-student';
import { LEVEL_LABEL } from '@/lib/mock/student';
import type { EnrolledCourse } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

type TabKey = 'all' | 'active' | 'completed';

function getCourseHref(enrollment: EnrolledCourse) {
  return `/student/courses/${enrollment.course.id}/prepare`;
}

function CourseMark({ completed = false }: { completed?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
        completed
          ? 'border-cyan-100 bg-cyan-50 text-cyan-700'
          : 'border-slate-200 bg-slate-50 text-slate-600',
      )}
    >
      {completed ? (
        <RiCheckboxCircleFill className="h-5 w-5" />
      ) : (
        <RiBookOpenLine className="h-5 w-5" />
      )}
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-cyan-700 transition-[width] duration-500"
        style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
      />
    </div>
  );
}

export default function MyCoursesPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const { data: enrollments = [] } = useMyEnrollments();

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

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi');

    return visibleEnrollments.filter((enrollment) => {
      const matchesTab = tab === 'all' || enrollment.status === tab;
      const matchesQuery =
        keyword.length === 0 ||
        enrollment.course.title.toLocaleLowerCase('vi').includes(keyword) ||
        enrollment.course.teacherName.toLocaleLowerCase('vi').includes(keyword);

      return matchesTab && matchesQuery;
    });
  }, [query, tab, visibleEnrollments]);

  const showContinueCourse =
    Boolean(continueCourse) &&
    query.trim().length === 0 &&
    (tab === 'all' || tab === 'active');

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'all', label: 'Tất cả', count: counts.all },
    { key: 'active', label: 'Đang học', count: counts.active },
    { key: 'completed', label: 'Đã hoàn thành', count: counts.completed },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-6 sm:py-9 lg:py-10">
      {/* Header */}
      <section className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]">
            Khóa học của tôi
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            {counts.active} khóa đang học
            <span className="mx-2 text-slate-300">·</span>
            {counts.completed} khóa đã hoàn thành
          </p>
        </div>

        <label className="relative block w-full lg:w-[300px]">
          <span className="sr-only">Tìm khóa học</span>
          <RiSearchLine className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm khóa học"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-cyan-600 focus:ring-3 focus:ring-cyan-600/10"
          />
        </label>
      </section>

      {/* Continue learning — compact, no fake thumbnail */}
      {showContinueCourse && continueCourse && (
        <section className="pt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Tiếp tục học</h2>

          <article className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3.5">
                <CourseMark />

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>{LEVEL_LABEL[continueCourse.course.level]}</span>
                    <span className="text-slate-300">·</span>
                    <span>{continueCourse.course.teacherName}</span>
                  </div>

                  <h3 className="mt-1 truncate text-base font-bold text-slate-950 sm:text-lg">
                    {continueCourse.course.title}
                  </h3>

                  <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                    <span>{continueCourse.course.moduleCount} chương</span>
                    <span>{continueCourse.course.lessonCount} bài học</span>
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1 lg:max-w-[320px]">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Tiến độ</span>
                  <span className="font-semibold tabular-nums text-slate-700">
                    {continueCourse.progress}%
                  </span>
                </div>
                <ProgressBar progress={continueCourse.progress} />
              </div>

              <Link
                href={getCourseHref(continueCourse)}
                className={cn(buttonVariants({ size: 'default' }), 'shrink-0 lg:ml-2')}
              >
                <RiPlayCircleLine data-icon="inline-start" />
                {continueCourse.progress > 0 ? 'Tiếp tục học' : 'Bắt đầu học'}
              </Link>
            </div>
          </article>
        </section>
      )}

      {/* Library */}
      <section className={showContinueCourse ? 'pt-8' : 'pt-6'}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Danh sách khóa học</h2>
            <p className="mt-1 text-sm text-slate-500">
              {query.trim()
                ? `${filtered.length} kết quả phù hợp`
                : `${counts.all} khóa học`}
            </p>
          </div>

          <div role="tablist" aria-label="Lọc khóa học" className="flex border-b border-slate-200">
            {tabs.map((item) => {
              const active = item.key === tab;

              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'relative -mb-px flex h-9 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition',
                    active
                      ? 'border-cyan-700 text-cyan-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900',
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      active ? 'text-cyan-700' : 'text-slate-400',
                    )}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((enrollment) => {
              const completed = enrollment.status === 'completed';

              return (
                <Link
                  key={enrollment.enrollmentId}
                  href={getCourseHref(enrollment)}
                  className="group block rounded-xl border border-slate-200 bg-white outline-none transition hover:border-slate-300 hover:shadow-sm focus-visible:border-cyan-600 focus-visible:ring-3 focus-visible:ring-cyan-600/10"
                >
                  <article className="flex min-h-[248px] flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <CourseMark completed={completed} />

                      <span
                        className={cn(
                          'mt-0.5 text-xs font-medium',
                          completed ? 'text-cyan-700' : 'text-slate-500',
                        )}
                      >
                        {completed ? 'Hoàn thành' : LEVEL_LABEL[enrollment.course.level]}
                      </span>
                    </div>

                    <div className="mt-4 min-w-0">
                      <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] font-bold leading-[1.4] text-slate-900 transition-colors group-hover:text-cyan-700">
                        {enrollment.course.title}
                      </h3>

                      <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
                        <RiUserLine className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate">{enrollment.course.teacherName}</span>
                      </p>
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <RiStackLine className="h-3.5 w-3.5" />
                        {enrollment.course.moduleCount} chương
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <RiBookOpenLine className="h-3.5 w-3.5" />
                        {enrollment.course.lessonCount} bài
                      </span>
                    </div>

                    <div className="mt-auto pt-5">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-500">
                          {completed ? 'Đã hoàn thành' : 'Tiến độ'}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-700">
                          {enrollment.progress}%
                        </span>
                      </div>

                      <ProgressBar progress={enrollment.progress} />

                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5">
                        <span className="text-sm font-semibold text-slate-700 group-hover:text-cyan-700">
                          {completed
                            ? 'Xem lại'
                            : enrollment.progress > 0
                              ? 'Tiếp tục học'
                              : 'Bắt đầu học'}
                        </span>
                        <RiArrowRightLine className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-700" />
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <RiBookOpenLine className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">Không tìm thấy khóa học</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Thử đổi từ khóa tìm kiếm hoặc chọn trạng thái khóa học khác.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
