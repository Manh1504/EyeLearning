'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { useCourseStudents, useCourseTree, useTeacherCourses } from '@/hooks/use-teacher';
import { formatShortDate } from '@/lib/utils';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.slice(-2).map((part) => part[0]).join('').toUpperCase();
}

function gazeTone(value: number | null) {
  if (value === null) return 'text-slate-400';
  if (value < 50) return 'text-rose-600';
  if (value < 65) return 'text-amber-600';
  return 'text-slate-700';
}

export function OverviewTab({ isNew }: { isNew: boolean }) {
  const params = useParams();
  const courseId = String(params?.courseId ?? 'c1');

  const { data: courses = [] } = useTeacherCourses();
  const course = useMemo(
    () => courses.find((c) => c.id === courseId),
    [courses, courseId],
  );
  const { data: modules = [] } = useCourseTree(isNew ? '' : courseId);
  const { data: students = [] } = useCourseStudents(isNew ? '' : courseId);

  if (isNew) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center sm:py-24">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <Icon name="ri-file-list-3-line" className="text-xl" />
        </div>

        <h2 className="mt-5 text-xl font-semibold text-slate-900">
          Bắt đầu bằng nội dung khóa học
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Khi khóa học có bài học và học viên bắt đầu học, phần tổng quan sẽ hiển thị tiến độ và dữ liệu quan sát tại đây.
        </p>

        <Link
          href="/teacher/courses/c-new?tab=content&new=1"
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-800"
        >
          <Icon name="ri-add-line" />
          Thêm nội dung đầu tiên
        </Link>
      </div>
    );
  }

  const lessons = modules.flatMap((module) =>
    module.lessons.map((lesson) => ({ ...lesson, module: module.title })),
  );

  const reviewLessons = lessons
    .filter((lesson) => lesson.attention !== null)
    .sort((a, b) => (a.attention ?? 100) - (b.attention ?? 100))
    .slice(0, 4);

  const studentsToWatch = [...students]
    .filter((student) => student.status === 'active')
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 4);

  const activeStudents = students.filter((student) => student.status === 'active').length;
  const completedStudents = students.filter((student) => student.status === 'completed').length;

  return (
    <div>
      {/* Page heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Tổng quan khóa học
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Những thông tin cần xem trước khi bạn chỉnh nội dung hoặc hỗ trợ học viên.
          </p>
        </div>

        <p className="text-xs text-slate-400">
          Cập nhật {formatShortDate(course?.updatedAt) || '—'}
        </p>
      </div>

      {/* Snapshot — one surface, not four KPI cards */}
      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-2 md:grid-cols-4">
          <div className="px-5 py-4 md:border-r md:border-slate-100">
            <p className="text-xs font-medium text-slate-500">Học viên</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">
                {course?.students ?? 0}
              </span>
              <span className="text-xs text-slate-400">đã ghi danh</span>
            </div>
          </div>

          <div className="border-l border-slate-100 px-5 py-4 md:border-l-0 md:border-r">
            <p className="text-xs font-medium text-slate-500">Hoàn thành trung bình</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">
                {course?.completion ?? 0}%
              </span>
              <span className="text-xs text-slate-400">toàn khóa</span>
            </div>
          </div>

          <div className="border-t border-slate-100 px-5 py-4 md:border-r md:border-t-0">
            <p className="text-xs font-medium text-slate-500">Phiên học</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">
                {course?.sessions ?? 0}
              </span>
              <span className="text-xs text-slate-400">phiên</span>
            </div>
          </div>

          <div className="border-l border-t border-slate-100 px-5 py-4 md:border-l-0 md:border-t-0">
            <p className="text-xs font-medium text-slate-500">Chỉ số quan sát TB</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-2xl font-semibold tracking-tight ${gazeTone(course?.attention ?? null)}`}>
                {course?.attention ?? '—'}{course?.attention != null ? '%' : ''}
              </span>
              <span className="text-xs text-slate-400">từ gaze</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main actionable areas */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        {/* Lessons */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Bài học nên xem lại</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Ưu tiên từ tín hiệu gaze thấp trong các bài đã có dữ liệu.
              </p>
            </div>
            <Icon name="ri-arrow-right-up-line" className="text-slate-300" />
          </div>

          <div className="divide-y divide-slate-100">
            {reviewLessons.map((lesson, index) => (
              <Link
                key={lesson.id}
                href={`/teacher/courses/${courseId}/lessons/${lesson.id}/heatmap`}
                className="group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"
              >
                <span className="text-xs font-semibold tabular-nums text-slate-300">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 group-hover:text-cyan-800">
                    {lesson.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {lesson.module} · {lesson.slides} trang · {lesson.completion}% hoàn thành
                  </p>
                </div>

                <div className="flex items-center gap-3 pl-2">
                  <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${gazeTone(lesson.attention)}`}>
                      {lesson.attention}%
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">gaze</p>
                  </div>
                  <Icon name="ri-arrow-right-s-line" className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </div>
              </Link>
            ))}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            <p className="text-xs leading-5 text-slate-500">
              Mở heatmap để kiểm tra vùng nội dung người học thực sự quan sát trước khi quyết định chỉnh bài.
            </p>
          </div>
        </section>

        {/* Students */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Học viên cần theo dõi</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Đang học nhưng có tiến độ thấp nhất.
                </p>
              </div>

              <Link
                href={`/teacher/courses/${courseId}?tab=students`}
                className="shrink-0 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
              >
                Xem tất cả
              </Link>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {studentsToWatch.map((student) => (
              <Link
                key={student.id}
                href={`/teacher/courses/${courseId}?tab=students`}
                className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                  {initials(student.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {student.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {student.lastActive}
                  </p>
                </div>

                <div className="w-20 shrink-0">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Tiến độ</span>
                    <span className={`font-semibold tabular-nums ${student.progress < 40 ? 'text-rose-600' : 'text-slate-600'}`}>
                      {student.progress}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${student.progress < 40 ? 'bg-rose-500' : 'bg-cyan-600'}`}
                      style={{ width: `${student.progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/70">
            <div className="px-5 py-3">
              <p className="text-lg font-semibold text-slate-900">{activeStudents}</p>
              <p className="text-[11px] text-slate-400">Đang học</p>
            </div>
            <div className="border-l border-slate-100 px-5 py-3">
              <p className="text-lg font-semibold text-slate-900">{completedStudents}</p>
              <p className="text-[11px] text-slate-400">Đã hoàn thành</p>
            </div>
          </div>
        </section>
      </div>

      {/* Metric disclaimer */}
      <div className="mt-5 flex gap-2.5 rounded-lg bg-slate-100/70 px-4 py-3 text-xs leading-5 text-slate-500">
        <Icon name="ri-information-line" className="mt-0.5 shrink-0 text-slate-400" />
        <p>
          Chỉ số quan sát được tổng hợp từ dữ liệu gaze và chỉ dùng để hỗ trợ phân tích hành vi xem nội dung; không nên được diễn giải trực tiếp là mức độ tập trung hay năng lực học tập.
        </p>
      </div>
    </div>
  );
}
