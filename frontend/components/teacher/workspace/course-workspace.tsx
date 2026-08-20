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

// Khóa học được chỉnh sửa trên MỘT trang duy nhất:
//   Thông tin + nội dung (ContentTab embed) và Học viên (StudentsTab embed).
// '?tab=overview' vẫn hiển thị bảng tổng quan cho khóa học đã có dữ liệu.
type View = 'edit' | 'overview';

function statusDot(status: string) {
  if (status === 'published') return 'bg-emerald-500';
  if (status === 'draft') return 'bg-amber-500';
  return 'bg-slate-400';
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
    return isNew ? `${base}?new=1${key === 'edit' ? '' : suffix}` : `${base}${suffix}`;
  };

  const items: { key: View; label: string }[] = [
    { key: 'edit', label: 'Chỉnh sửa' },
    { key: 'overview', label: 'Tổng quan' },
  ];

  return (
    <nav className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {items.map((item) => {
        if (item.key === 'overview' && isNew) return null;
        const active = view === item.key;
        return (
          <Link
            key={item.key}
            href={queryFor(item.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
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
  const view: View = searchParams.get('tab') === 'overview' ? 'overview' : 'edit';

  const { data: courses = [] } = useTeacherCourses();
  const course: TeacherCourse | undefined = useMemo(() => {
    if (isNew) return undefined;
    return courses.find((c) => c.id === courseId);
  }, [courses, courseId, isNew]);

  const displayTitle = isNew ? 'Khóa học mới' : (course?.title ?? 'Khóa học');
  const displayStatus = isNew ? 'draft' : (course?.status ?? 'draft');
  const canManage = isNew || (course?.isOwner ?? true);

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/teacher/courses"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Quay lại danh sách khóa học"
          >
            <Icon name="ri-arrow-left-line" />
          </Link>

          <div className="flex min-w-0 flex-[1_1_0] flex-col justify-center">
            <p className="truncate text-sm font-semibold text-slate-900">{displayTitle}</p>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(displayStatus)}`} />
              {STATUS_LABEL[displayStatus]}
              {!isNew && (
                <span className="truncate">
                  {LEVEL_LABEL[course?.level ?? 'beginner']} · {course?.students ?? 0} học viên
                </span>
              )}
            </div>
          </div>

          {!isNew && (
            <SegmentedNav isNew={false} courseId={courseId} view={view} />
          )}
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          {view === 'overview' ? (
            <OverviewTab isNew={isNew} />
          ) : (
            <>
              <ContentTab isNew={isNew} embed />

              {isNew ? (
                <div className="flex items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6">
                  <Icon name="ri-group-line" className="mt-0.5 shrink-0 text-slate-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Học viên</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Lưu khóa học trước để có thể thêm học viên ngay trên trang này.
                    </p>
                  </div>
                </div>
              ) : (
                <StudentsTab isNew={false} embed canManage={canManage} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}