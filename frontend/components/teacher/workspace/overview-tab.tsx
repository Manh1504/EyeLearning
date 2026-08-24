'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { buttonVariants } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useCourseStudents, useCourseTree, useTeacherCourses } from '@/hooks/use-teacher';
import { STATUS_LABEL } from '@/lib/mock/teacher';
import { cn } from '@/lib/utils';
import type { EnrollStatus } from '@/lib/types/domain';

function displayValue(value: number | string | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function activityText(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : '—';
}

function statusText(status: EnrollStatus) {
  if (status === 'active') return 'Đang học';
  if (status === 'completed') return 'Đã hoàn thành';
  return 'Đã gỡ';
}

function statusClass(status: EnrollStatus) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'dropped') return 'bg-slate-100 text-slate-500';
  return 'bg-cyan-50 text-cyan-700';
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>
    </div>
  );
}

function DistributionRow({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">
          {count} học viên{percent !== null ? ` · ${percent}%` : ''}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${count} học viên${percent !== null ? `, ${percent}%` : ''}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className="h-full rounded-full bg-cyan-700"
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function OverviewTab({ isNew }: { isNew: boolean }) {
  const params = useParams();
  const courseId = String(params?.courseId ?? 'c1');

  const { data: courses = [], isLoading: coursesLoading, isError: coursesError } = useTeacherCourses();
  const course = useMemo(
    () => courses.find((item) => item.id === courseId),
    [courses, courseId],
  );
  const { data: modules = [], isLoading: modulesLoading, isError: modulesError } = useCourseTree(isNew ? '' : courseId);
  const { data: students = [], isLoading: studentsLoading, isError: studentsError } = useCourseStudents(isNew ? '' : courseId);

  if (isNew) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center sm:py-24">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <Icon name="ri-book-open-line" className="text-xl" />
        </div>

        <h2 className="mt-5 text-xl font-semibold text-slate-900">
          Bắt đầu bằng nội dung khóa học
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Sau khi lưu khóa học và có học viên tham gia, phần tổng quan sẽ hiển thị tiến độ tại đây.
        </p>

        <Link
          href="/teacher/courses/c-new?tab=content&new=1"
          className={cn(buttonVariants(), 'mt-6')}
        >
          <Icon name="ri-add-line" data-icon="inline-start" />
          Thêm nội dung đầu tiên
        </Link>
      </div>
    );
  }

  const loading = coursesLoading || modulesLoading || studentsLoading;
  const hasError = coursesError || modulesError || studentsError;

  const lessons = modules.flatMap((module) => module.lessons);
  const lessonsWithPdf = lessons.filter((lesson) => lesson.slides > 0).length;
  const totalStudents = students.length;
  const notStarted = students.filter(
    (student) => student.status === 'active' && student.progress <= 0,
  ).length;
  const inProgress = students.filter(
    (student) => student.status === 'active' && student.progress > 0,
  ).length;
  const completed = students.filter((student) => student.status === 'completed').length;
  const visibleStudents = students.filter((student) => student.status !== 'dropped').slice(0, 5);

  if (loading) {
    return (
      <div aria-live="polite" aria-busy="true" className="grid gap-4">
        <div className="h-24 rounded-xl border border-slate-200 bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-5 py-6 text-rose-700">
        <h2 className="text-sm font-semibold">Không tải được tổng quan khóa học</h2>
        <p className="mt-1 text-sm leading-6">Vui lòng thử lại sau. Điều hướng workspace vẫn được giữ nguyên.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Tổng quan khóa học
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Tóm tắt tiến độ học viên và tình trạng nội dung của khóa học.
          </p>
        </div>

        <p className="text-xs text-slate-400">
          Cập nhật {displayValue(course?.updatedAt)}
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Tổng học viên"
          value={displayValue(course?.students ?? totalStudents)}
          note="Số học viên đang được trả về cho khóa học"
        />
        <MetricCard
          label="Đang học"
          value={displayValue(inProgress)}
          note="Học viên active có tiến độ lớn hơn 0%"
        />
        <MetricCard
          label="Đã hoàn thành"
          value={displayValue(completed)}
          note="Theo trạng thái enrollment hiện có"
        />
        <MetricCard
          label="Tiến độ trung bình"
          value={displayValue(course?.completion, '%')}
          note="Giá trị từ API khóa học"
        />
      </div>

      {totalStudents === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Icon name="ri-group-line" className="text-xl" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Khóa học chưa có học viên</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-slate-500">
            Thêm học viên hoặc mở tab Học viên để quản lý danh sách tham gia khóa học.
          </p>
          <Link
            href={`/teacher/courses/${courseId}?tab=students`}
            className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
          >
            Xem tab Học viên
          </Link>
        </section>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Phân bố tiến độ</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Phân loại theo trạng thái và tiến độ hiện có của học viên.
              </p>
            </div>
            <div className="space-y-5 px-5 py-5">
              <DistributionRow label="Chưa bắt đầu" count={notStarted} total={totalStudents} />
              <DistributionRow label="Đang học" count={inProgress} total={totalStudents} />
              <DistributionRow label="Đã hoàn thành" count={completed} total={totalStudents} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Tiến độ học viên</h3>
                <p className="mt-0.5 text-xs text-slate-500">Danh sách học viên từ dữ liệu hiện có.</p>
              </div>
              <Link
                href={`/teacher/courses/${courseId}?tab=students`}
                className="shrink-0 text-xs font-semibold text-cyan-700 hover:text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
              >
                Xem tất cả
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {visibleStudents.map((student) => (
                <div key={student.id} className="flex items-center gap-3 px-5 py-3.5">
                  <UserAvatar src={student.avatarUrl} name={student.name} className="h-9 w-9 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{student.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {student.code} · {activityText(student.lastActive)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums text-slate-700">{student.progress}%</p>
                    <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${statusClass(student.status)}`}>
                      {statusText(student.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
              <Link
                href={`/teacher/courses/${courseId}?tab=students`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
              >
                Xem tiến độ học viên
              </Link>
            </div>
          </section>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Tình trạng nội dung</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Dữ liệu lấy từ cấu trúc chương và bài học hiện có.
            </p>
          </div>
          <Link
            href={`/teacher/courses/${courseId}?tab=content`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full sm:w-auto')}
          >
            Quản lý nội dung
          </Link>
        </div>
        <div className="grid border-t border-slate-100 sm:grid-cols-4">
          <div className="px-5 py-4">
            <p className="text-lg font-semibold text-slate-950">{modules.length}</p>
            <p className="text-xs text-slate-500">Chương</p>
          </div>
          <div className="border-t border-slate-100 px-5 py-4 sm:border-l sm:border-t-0">
            <p className="text-lg font-semibold text-slate-950">{lessons.length}</p>
            <p className="text-xs text-slate-500">Bài học</p>
          </div>
          <div className="border-t border-slate-100 px-5 py-4 sm:border-l sm:border-t-0">
            <p className="text-lg font-semibold text-slate-950">{lessonsWithPdf}</p>
            <p className="text-xs text-slate-500">Bài có PDF</p>
          </div>
          <div className="border-t border-slate-100 px-5 py-4 sm:border-l sm:border-t-0">
            <p className="text-lg font-semibold text-slate-950">
              {course?.status ? STATUS_LABEL[course.status] : '—'}
            </p>
            <p className="text-xs text-slate-500">Trạng thái</p>
          </div>
        </div>
      </section>
    </div>
  );
}
