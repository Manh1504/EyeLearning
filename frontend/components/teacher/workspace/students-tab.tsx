'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Icon } from '@/components/ui/icon';
import { Card, ConfirmDialog, EmptyState, PrimaryBtn } from './workspace-ui';
import { useCourseStudents, useCourseTree } from '@/hooks/use-teacher';
import { ENROLL_LABEL } from '@/lib/mock/teacher';
import type { EnrollStatus, StudentRow } from '@/lib/types/domain';

interface DirectoryStudent {
  id: string;
  name: string;
  code: string;
  color: string;
}

type StatusFilter = 'all' | EnrollStatus;
type SortMode = 'recent' | 'progress' | 'name';

const STUDENT_DIRECTORY: DirectoryStudent[] = [
  { id: 'd1', name: 'Nguyễn Văn An', code: 'SV2024201', color: 'from-cyan-500 to-sky-500' },
  { id: 'd2', name: 'Trần Bảo Ngọc', code: 'SV2024202', color: 'from-rose-500 to-red-500' },
  { id: 'd3', name: 'Lê Minh Tuấn', code: 'SV2024203', color: 'from-amber-500 to-yellow-500' },
  { id: 'd4', name: 'Phạm Thu Trang', code: 'SV2024204', color: 'from-violet-500 to-fuchsia-500' },
  { id: 'd5', name: 'Hoàng Đức Anh', code: 'SV2024205', color: 'from-emerald-500 to-lime-500' },
  { id: 'd6', name: 'Võ Thị Kim Chi', code: 'SV2024206', color: 'from-blue-500 to-indigo-500' },
  { id: 'd7', name: 'Đinh Công Thành', code: 'SV2024207', color: 'from-teal-500 to-green-500' },
  { id: 'd8', name: 'Tạ Hồng Nhung', code: 'SV2024208', color: 'from-pink-500 to-rose-500' },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function relativeMinutes(value: string) {
  const text = value.toLowerCase();
  if (text.includes('vừa')) return 0;

  const amount = Number(text.match(/\d+/)?.[0] ?? 999999);
  if (text.includes('phút')) return amount;
  if (text.includes('giờ')) return amount * 60;
  if (text.includes('ngày')) return amount * 60 * 24;
  if (text.includes('tuần')) return amount * 60 * 24 * 7;
  return 999999;
}

function statusClasses(status: EnrollStatus) {
  if (status === 'completed') return 'bg-cyan-50 text-cyan-700';
  if (status === 'dropped') return 'bg-slate-100 text-slate-500';
  return 'bg-slate-100 text-slate-600';
}

function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className="h-full rounded-full bg-cyan-600 transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function StudentActions({
  student,
  onOpen,
  onRemove,
}: {
  student: StudentRow;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary
        aria-label={`Thao tác với ${student.name}`}
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>

      <div className="absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.closest('details')?.removeAttribute('open');
            onOpen();
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
        >
          <Icon name="ri-eye-line" className="text-base text-slate-400" />
          Xem chi tiết
        </button>

        {student.status !== 'dropped' && (
          <>
            <div className="mx-3 my-1 border-t border-slate-100" />
            <button
              type="button"
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                onRemove();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
            >
              <Icon name="ri-delete-bin-line" className="text-base" />
              Gỡ khỏi khóa học
            </button>
          </>
        )}
      </div>
    </details>
  );
}

export function StudentsTab({ isNew }: { isNew: boolean }) {
  const params = useParams();
  const courseId = String(params?.courseId ?? 'c1');

  const { data: studentsData = [] } = useCourseStudents(isNew ? '' : courseId);
  const { data: tree = [] } = useCourseTree(isNew ? '' : courseId);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [studentToRemove, setStudentToRemove] = useState<StudentRow | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hiện thực danh sách học viên từ backend một lần khi tải xong.
  // Điều chỉnh state ngay trong render (pattern «adjusting state when props change»).
  if (!isNew && !hydrated && studentsData.length > 0) {
    setHydrated(true);
    setStudents(studentsData);
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = students.filter((student) => {
      const matchesQuery =
        !q ||
        student.name.toLowerCase().includes(q) ||
        student.code.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || student.status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'progress') return b.progress - a.progress;
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'vi');
      return relativeMinutes(a.lastActive) - relativeMinutes(b.lastActive);
    });
  }, [query, sortMode, statusFilter, students]);

  const open = students.find((student) => student.id === openId) ?? null;

  const activeCount = students.filter((student) => student.status === 'active').length;
  const completedCount = students.filter((student) => student.status === 'completed').length;

  const lessonTitle = (id: string) =>
    tree.flatMap((module) => module.lessons).find((lesson) => lesson.id === id)?.title ?? id;

  const enrolledIds = new Set(students.map((student) => student.id));
  const candidates = STUDENT_DIRECTORY.filter((candidate) => {
    if (enrolledIds.has(candidate.id) && !justAdded.includes(candidate.id)) return false;
    const q = addQuery.trim().toLowerCase();
    return !q || candidate.name.toLowerCase().includes(q) || candidate.code.toLowerCase().includes(q);
  });

  const addStudent = (candidate: DirectoryStudent) => {
    if (enrolledIds.has(candidate.id)) return;

    setStudents((prev) => [
      ...prev,
      {
        id: candidate.id,
        name: candidate.name,
        code: candidate.code,
        color: candidate.color,
        progress: 0,
        attention: null,
        lastActive: 'Vừa thêm',
        status: 'active',
        lessons: [],
      },
    ]);
    setJustAdded((prev) => [...prev, candidate.id]);
  };

  // Prod: UPDATE enrollments SET status = 'dropped' (soft-remove, giữ lịch sử)
  const removeStudent = (id: string) => {
    setStudents((prev) => prev.filter((student) => student.id !== id));
    if (openId === id) setOpenId(null);
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Học viên</h2>
          <p className="mt-1 text-sm text-slate-500">
            {students.length === 0
              ? 'Chưa có học viên nào trong khóa học.'
              : `${activeCount} đang học · ${completedCount} hoàn thành`}
          </p>
        </div>

        <PrimaryBtn onClick={() => setShowAdd(true)} className="flex items-center justify-center gap-2">
          <Icon name="ri-user-add-line" className="text-base" />
          Thêm học viên
        </PrimaryBtn>
      </div>

      <Card className="mt-5 overflow-visible">
        {students.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={<Icon name="ri-group-line" className="text-2xl text-slate-400" />}
            title="Chưa có học viên"
            desc="Thêm học viên vào khóa học để bắt đầu theo dõi tiến độ."
          >
            <PrimaryBtn onClick={() => setShowAdd(true)} className="mt-4 flex items-center gap-2">
              <Icon name="ri-user-add-line" />
              Thêm học viên
            </PrimaryBtn>
          </EmptyState>
        ) : (
          <>
            {/* Search + filter + sort */}
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Icon
                  name="ri-search-line"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm theo tên hoặc mã sinh viên"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <label className="sr-only" htmlFor="student-status-filter">
                  Lọc trạng thái
                </label>
                <select
                  id="student-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="active">Đang học</option>
                  <option value="completed">Hoàn thành</option>
                  <option value="dropped">Đã gỡ</option>
                </select>

                <label className="sr-only" htmlFor="student-sort">
                  Sắp xếp học viên
                </label>
                <select
                  id="student-sort"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="recent">Hoạt động gần nhất</option>
                  <option value="progress">Tiến độ cao → thấp</option>
                  <option value="name">Tên A → Z</option>
                </select>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                    <th className="px-5 py-3 font-medium">Học viên</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 font-medium">Tiến độ</th>
                    <th className="px-4 py-3 font-medium">Hoạt động gần nhất</th>
                    <th className="w-12 px-4 py-3" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                        Không tìm thấy học viên phù hợp.
                      </td>
                    </tr>
                  ) : (
                    rows.map((student) => (
                      <tr
                        key={student.id}
                        onClick={() => setOpenId(student.id)}
                        className="group cursor-pointer transition hover:bg-slate-50/80"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                              {initials(student.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{student.name}</p>
                              <p className="mt-0.5 text-xs text-slate-400">{student.code}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(student.status)}`}
                          >
                            {student.status === 'dropped' ? 'Đã gỡ' : ENROLL_LABEL[student.status]}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex min-w-[138px] items-center gap-2.5">
                            <ProgressBar value={student.progress} className="w-24" />
                            <span className="w-9 text-right text-xs font-medium tabular-nums text-slate-500">
                              {student.progress}%
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-500">{student.lastActive}</td>

                        <td className="px-4 py-3 text-right">
                          <StudentActions
                            student={student}
                            onOpen={() => setOpenId(student.id)}
                            onRemove={() => setStudentToRemove(student)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {rows.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-400">
                  Không tìm thấy học viên phù hợp.
                </div>
              ) : (
                rows.map((student) => (
                  <article
                    key={student.id}
                    onClick={() => setOpenId(student.id)}
                    className="cursor-pointer px-4 py-4 transition active:bg-slate-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {initials(student.name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{student.code}</p>
                          </div>
                          <StudentActions
                            student={student}
                            onOpen={() => setOpenId(student.id)}
                            onRemove={() => setStudentToRemove(student)}
                          />
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(student.status)}`}
                          >
                            {student.status === 'dropped' ? 'Đã gỡ' : ENROLL_LABEL[student.status]}
                          </span>
                          <span className="text-xs text-slate-400">{student.lastActive}</span>
                        </div>

                        <div className="mt-3">
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-slate-400">Tiến độ</span>
                            <span className="font-medium tabular-nums text-slate-600">{student.progress}%</span>
                          </div>
                          <ProgressBar value={student.progress} />
                        </div>

                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={studentToRemove !== null}
        title="Gỡ học viên khỏi khóa học?"
        description={
          studentToRemove ? (
            <>
              <span className="font-medium text-slate-700">{studentToRemove.name}</span> ({studentToRemove.code}) sẽ không còn nằm
              trong danh sách học viên đang học. Lịch sử học và dữ liệu đã ghi nhận vẫn được giữ lại.
            </>
          ) : null
        }
        confirmLabel="Gỡ học viên"
        onClose={() => setStudentToRemove(null)}
        onConfirm={() => {
          if (studentToRemove) removeStudent(studentToRemove.id);
        }}
      />

      {/* Add-student modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Đóng cửa sổ thêm học viên"
            className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setShowAdd(false)}
          />

          <section className="relative flex max-h-[min(680px,calc(100dvh-32px))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-semibold text-slate-900">Thêm học viên</h3>
                <p className="mt-1 text-xs text-slate-400">Tìm theo tên hoặc mã sinh viên.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Đóng"
              >
                <Icon name="ri-close-line" className="text-lg" />
              </button>
            </header>

            <div className="border-b border-slate-100 px-5 py-3 sm:px-6">
              <div className="relative">
                <Icon
                  name="ri-search-line"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  autoFocus
                  value={addQuery}
                  onChange={(event) => setAddQuery(event.target.value)}
                  placeholder="Nhập tên hoặc mã sinh viên"
                  className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {candidates.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">Không tìm thấy sinh viên phù hợp.</div>
              ) : (
                <ul>
                  {candidates.map((candidate) => {
                    const added = enrolledIds.has(candidate.id);
                    return (
                      <li
                        key={candidate.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {initials(candidate.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{candidate.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{candidate.code}</p>
                        </div>

                        {added ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-cyan-700">
                            <Icon name="ri-check-line" className="text-sm" />
                            Đã thêm
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addStudent(candidate)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                          >
                            Thêm
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Student detail drawer */}
      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Đóng chi tiết học viên"
            className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setOpenId(null)}
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
            <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                  {initials(open.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{open.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{open.code}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Đóng"
                >
                  <Icon name="ri-close-line" className="text-lg" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 py-3">
                <div className="px-3 text-center">
                  <p className="text-xs text-slate-400">Tiến độ</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{open.progress}%</p>
                </div>
                <div className="px-3 text-center">
                  <p className="text-xs text-slate-400">Quan sát</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                    {open.attention === null ? '—' : `${open.attention}%`}
                  </p>
                </div>
                <div className="px-3 text-center">
                  <p className="text-xs text-slate-400">Trạng thái</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                    {open.status === 'dropped' ? 'Đã gỡ' : ENROLL_LABEL[open.status]}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-400">Hoạt động gần nhất: {open.lastActive}</p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Tiến độ từng bài</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Chọn một bài để mở heatmap của học viên.</p>
                </div>
              </div>

              {open.lessons.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  Học viên chưa bắt đầu bài nào.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {open.lessons.map((lesson) => {
                    const pct = lesson.total > 0 ? Math.round((lesson.viewed / lesson.total) * 100) : 0;

                    return (
                      <li key={lesson.lessonId}>
                        <Link
                          href={`/teacher/courses/${courseId}/lessons/${lesson.lessonId}/heatmap?student=${open.id}`}
                          className="group flex items-center gap-3 px-3.5 py-3 transition first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="truncate text-sm font-medium text-slate-800 group-hover:text-slate-950">
                                {lessonTitle(lesson.lessonId)}
                              </p>
                              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">{pct}%</span>
                            </div>

                            <ProgressBar value={pct} className="mt-2" />

                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                              <span>
                                {lesson.viewed}/{lesson.total} trang
                              </span>
                              <span>
                                Quan sát {lesson.attention === null ? '—' : `${lesson.attention}%`}
                              </span>
                            </div>
                          </div>

                          <Icon name="ri-arrow-right-s-line" className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
