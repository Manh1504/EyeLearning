'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { OverviewTab } from './overview-tab';
import { ContentTab } from './content-tab';
import { StudentsTab } from './students-tab';
import { useTeacherCourses } from '@/hooks/use-teacher';
import { LEVEL_LABEL, STATUS_LABEL } from '@/lib/mock/teacher';
import type { TeacherCourse } from '@/lib/types/domain';

type Tab = 'overview' | 'content' | 'students';

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Tổng quan', icon: 'ri-dashboard-line' },
  { key: 'content', label: 'Nội dung', icon: 'ri-book-open-line' },
  { key: 'students', label: 'Học viên', icon: 'ri-group-line' },
];

function statusDot(status: string) {
  if (status === 'published') return 'bg-emerald-500';
  if (status === 'draft') return 'bg-amber-500';
  return 'bg-slate-400';
}

export default function TeacherCourseWorkspace() {
  const searchParams = useSearchParams();
  const params = useParams();
  const courseId = String(params?.courseId ?? 'c1');
  const tab = (searchParams.get('tab') as Tab) || 'overview';
  const isNew = searchParams.get('new') === '1';

  const { data: courses = [] } = useTeacherCourses();
  const course: TeacherCourse | undefined = useMemo(() => {
    if (isNew) return undefined;
    return courses.find((c) => c.id === courseId);
  }, [courses, courseId, isNew]);

  const displayTitle = isNew ? 'Khóa học mới' : (course?.title ?? 'Khóa học');
  const displayStatus = isNew ? 'draft' : (course?.status ?? 'draft');

  const hrefFor = (key: Tab) =>
    `/teacher/courses/${isNew ? 'c-new' : courseId}?tab=${key}${isNew ? '&new=1' : ''}`;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] bg-slate-50">
      {/* Desktop workspace navigation */}
      <aside className="sticky top-0 hidden h-[calc(100dvh-56px)] w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 pb-5 pt-5">
          <Link
            href="/teacher/courses"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <Icon name="ri-arrow-left-line" className="text-base" />
            Khóa học của tôi
          </Link>

          <div className="mt-6">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${statusDot(displayStatus)}`} />
              <span>{STATUS_LABEL[displayStatus]}</span>
            </div>

            <h1 className="mt-2 text-[17px] font-semibold leading-6 text-slate-900">
              {displayTitle}
            </h1>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              {isNew
                ? 'Khóa học chưa được xuất bản'
                : `${LEVEL_LABEL[course?.level ?? 'beginner']} · ${course?.students ?? 0} học viên`}
            </p>
          </div>
        </div>

        <div className="mx-5 border-t border-slate-100" />

        <nav className="mt-3 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = tab === item.key;

            return (
              <Link
                key={item.key}
                href={hrefFor(item.key)}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition ${
                  active
                    ? 'bg-cyan-50 font-semibold text-cyan-700'
                    : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`text-lg ${active ? 'text-cyan-700' : 'text-slate-400'}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile course header */}
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link
              href="/teacher/courses"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
              aria-label="Quay lại danh sách khóa học"
            >
              <Icon name="ri-arrow-left-line" />
            </Link>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {displayTitle}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(displayStatus)}`} />
                {STATUS_LABEL[displayStatus]}
              </div>
            </div>
          </div>

          <nav className="flex h-10 items-end gap-6 overflow-x-auto px-4">
            {NAV.map((item) => {
              const active = tab === item.key;

              return (
                <Link
                  key={item.key}
                  href={hrefFor(item.key)}
                  className={`relative flex h-10 shrink-0 items-center gap-1.5 text-sm font-medium ${
                    active ? 'text-cyan-700' : 'text-slate-500'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-700" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">
            {tab === 'overview' && <OverviewTab isNew={isNew} />}
            {tab === 'content' && <ContentTab isNew={isNew} />}
            {tab === 'students' && <StudentsTab isNew={isNew} />}
          </div>
        </main>
      </div>
    </div>
  );
}
