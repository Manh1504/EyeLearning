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

type View = 'content' | 'students' | 'overview';

function statusDot(status: string) {
  if (status === 'published') return 'bg-emerald-500';
  if (status === 'draft') return 'bg-amber-500';
  return 'bg-muted-foreground';
}

function SegmentedNav({
  isNew,
  courseId,
  view,
}: {
  isNew: boolean;
  courseId: string;
  view: View;
}) {
  const base = `/teacher/courses/${isNew ? 'c-new' : courseId}`;
  const queryFor = (key: View) => {
    const suffix = `?tab=${key}`;
    return isNew ? `${base}?new=1` : `${base}${suffix}`;
  };

  const items: { key: View; label: string }[] = [
    { key: 'content', label: 'Nội dung' },
    { key: 'students', label: 'Học viên' },
    { key: 'overview', label: 'Tổng quan' },
  ];

  return (
    <nav className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {items.map((item) => {
        if (isNew && item.key !== 'content') return null;
        const active = view === item.key;
        return (
          <Link
            key={item.key}
            href={queryFor(item.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function TeacherCourseWorkspace() {
  const searchParams = useSearchParams();
  const params = useParams();
  const courseId = String(params?.courseId ?? 'c1');
  const isNew = searchParams.get('new') === '1';
  const tab = searchParams.get('tab');
  const view: View =
    tab === 'students'
      ? 'students'
      : tab === 'overview'
        ? 'overview'
        : 'content';

  const { data: courses = [] } = useTeacherCourses();
  const course: TeacherCourse | undefined = useMemo(() => {
    if (isNew) return undefined;
    return courses.find((c) => c.id === courseId);
  }, [courses, courseId, isNew]);

  const displayTitle = isNew ? 'Khóa học mới' : (course?.title ?? 'Khóa học');
  const displayStatus = isNew ? 'draft' : (course?.status ?? 'draft');
  const canManage = isNew || (course?.isOwner ?? true);

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-muted">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/teacher/courses"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Quay lại danh sách khóa học"
          >
            <Icon name="ri-arrow-left-line" />
          </Link>

          <div className="flex min-w-0 flex-[1_1_0] flex-col justify-center">
            <p className="truncate text-sm font-semibold text-foreground">{displayTitle}</p>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(displayStatus)}`} />
              {STATUS_LABEL[displayStatus]}
              {!isNew && (
                <span className="truncate">
                  {LEVEL_LABEL[course?.level ?? 'beginner']} · {course?.students ?? 0} học viên
                </span>
              )}
            </div>
          </div>

          {!isNew && <SegmentedNav isNew={false} courseId={courseId} view={view} />}
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          {view === 'overview' && <OverviewTab isNew={false} />}

          {view === 'students' && (
            <StudentsTab isNew={false} embed canManage={canManage} />
          )}

          {view === 'content' && (
            <>
              <ContentTab isNew={isNew} embed />

              {isNew && (
                <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-6">
                  <Icon name="ri-group-line" className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Học viên</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Lưu khóa học trước để có thể thêm học viên ngay trên trang này.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
