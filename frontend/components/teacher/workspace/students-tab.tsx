'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Card, ConfirmDialog, EmptyState } from './workspace-ui';
import { useCourseStudents, useCourseTree } from '@/hooks/use-teacher';
import {
  addCourseStudents,
  fetchStudentDirectory,
  removeCourseStudent,
  type StudentDirectoryEntry,
} from '@/lib/api/teacher';
import { ENROLL_LABEL } from '@/lib/mock/teacher';
import type { EnrollStatus, StudentRow } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | EnrollStatus;
type SortMode = 'recent' | 'progress' | 'name';

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
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'dropped') return 'bg-muted text-muted-foreground';
  return 'bg-accent text-primary';
}

function activityText(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : '—';
}

function ProgressBar({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
      className={`h-1.5 overflow-hidden rounded-full bg-muted ${className}`}
    >
      <div
        className="h-full rounded-full bg-brand-cyan transition-[width]"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

function RemoveStudentButton({
  student,
  onRemove,
  canManage,
}: {
  student: StudentRow;
  onRemove: () => void;
  canManage: boolean;
}) {
  if (!canManage || student.status === 'dropped') return null;

  return (
    <button
      type="button"
      title="Gỡ khỏi khóa học"
      aria-label={`Gỡ ${student.name} khỏi khóa học`}
      onClick={() => onRemove()}
      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-destructive/20"
    >
      <Icon name="ri-delete-bin-line" className="text-base" aria-hidden />
    </button>
  );
}

export function StudentsTab({
  isNew,
  embed = false,
  canManage = true,
}: {
  isNew: boolean;
  embed?: boolean;
  canManage?: boolean;
}) {
  const params = useParams();
  const courseId = String(params?.courseId ?? 'c1');
  const queryClient = useQueryClient();

  const {
    data: studentsData = [],
    isLoading: studentsLoading,
    isError: studentsError,
    error: studentsErrorValue,
    isFetched: studentsFetched,
  } = useCourseStudents(isNew ? '' : courseId);
  const { data: tree = [] } = useCourseTree(isNew ? '' : courseId);
  const {
    data: directory = [],
    isLoading: directoryLoading,
    isError: directoryError,
  } = useQuery({
    queryKey: ['teacher', 'student-directory'],
    queryFn: () => fetchStudentDirectory(),
  });

  const [studentsState, setStudentsState] = useState<{
    source: StudentRow[] | null;
    rows: StudentRow[];
  }>({ source: null, rows: [] });
  const students = studentsState.rows;
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [studentToRemove, setStudentToRemove] = useState<StudentRow | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  // Đồng bộ danh sách khi query trả dữ liệu mới, bao gồm avatar/profile vừa cập nhật.
  // Điều chỉnh state ngay trong render (pattern «adjusting state when props change»).
  if (!isNew && studentsFetched && studentsState.source !== studentsData) {
    setStudentsState({ source: studentsData, rows: studentsData });
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
  const hasActiveSearch = query.trim().length > 0 || statusFilter !== 'all';
  const resetFilters = () => {
    setQuery('');
    setStatusFilter('all');
  };

  const lessonTitle = (id: string) =>
    tree.flatMap((module) => module.lessons).find((lesson) => lesson.id === id)?.title ?? id;

  const enrolledIds = new Set(students.map((student) => student.id));
  const candidates = directory.filter((candidate) => {
    if (enrolledIds.has(candidate.id) && !justAdded.includes(candidate.id)) return false;
    const q = addQuery.trim().toLowerCase();
    return (
      !q ||
      candidate.name.toLowerCase().includes(q) ||
      candidate.code.toLowerCase().includes(q)
    );
  });

  const addStudent = async (candidate: StudentDirectoryEntry) => {
    if (enrolledIds.has(candidate.id)) return;
    setAddError(null);
    try {
      if (!isNew) {
        await addCourseStudents(courseId, [candidate.id]);
        queryClient.invalidateQueries({ queryKey: ['teacher', 'course-students', courseId] });
        queryClient.invalidateQueries({ queryKey: ['teacher', 'courses'] });
      }
      setStudentsState((prev) => ({
        ...prev,
        rows: [
          ...prev.rows,
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
        ],
      }));
      setJustAdded((prev) => [...prev, candidate.id]);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Không thêm được học viên');
    }
  };

  // Xóa mềm: enrollments.status = 'dropped' (giữ lịch sử học)
  const removeStudent = async (id: string) => {
    setStudentsState((prev) => ({
      ...prev,
      rows: prev.rows.filter((student) => student.id !== id),
    }));
    if (openId === id) setOpenId(null);
    if (isNew) return;
    try {
      await removeCourseStudent(courseId, id);
      queryClient.invalidateQueries({ queryKey: ['teacher', 'course-students', courseId] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'courses'] });
    } catch {
      setAddError('Không gỡ được học viên khỏi khóa học');
    }
  };

  return (
    <div className={embed ? '' : 'mx-auto max-w-6xl'}>
      {!embed && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">Học viên</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {students.length === 0
                ? 'Chưa có học viên nào trong khóa học.'
                : `${activeCount} đang học · ${completedCount} hoàn thành`}
            </p>
          </div>

          {canManage && (
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <Icon name="ri-user-add-line" className="text-base" />
              Thêm học viên
            </Button>
          )}
        </div>
      )}

      {addError && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <Icon name="ri-error-warning-line" className="text-base" />
          <span className="flex-1">{addError}</span>
          <button
            type="button"
            onClick={() => setAddError(null)}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            aria-label="Đóng thông báo lỗi"
          >
            <Icon name="ri-close-line" className="text-sm" />
          </button>
        </div>
      )}

      <Card className={embed ? 'overflow-visible rounded-xl border border-border bg-card shadow-none' : 'mt-5 overflow-visible rounded-xl border border-border bg-card shadow-none'}>
        {embed && (
          <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">Học viên</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {students.length === 0
                  ? 'Chưa có học viên nào trong khóa học.'
                  : `${students.length} học viên đang tham gia khóa học · ${activeCount} đang học · ${completedCount} hoàn thành`}
              </p>
            </div>
            {canManage && (
              <Button onClick={() => setShowAdd(true)} className="w-full gap-2 sm:w-auto">
                <Icon name="ri-user-add-line" className="text-base" />
                Thêm học viên
              </Button>
          )}
        </div>
      )}

        {studentsLoading ? (
          <div aria-live="polite" aria-busy="true" className="grid gap-2 px-4 py-5 sm:px-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
                <div className="h-9 w-9 rounded-full bg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-40 max-w-full rounded bg-muted" />
                  <div className="mt-2 h-3 w-24 rounded bg-muted" />
                </div>
                <div className="hidden h-4 w-24 rounded bg-muted sm:block" />
              </div>
            ))}
          </div>
        ) : studentsError ? (
          <EmptyState
            className="py-16"
            icon={<Icon name="ri-error-warning-line" className="text-2xl text-destructive" />}
            title="Không tải được danh sách học viên"
            desc={studentsErrorValue instanceof Error ? studentsErrorValue.message : 'Vui lòng thử lại sau.'}
          />
        ) : students.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={<Icon name="ri-group-line" className="text-2xl text-muted-foreground" />}
            title="Chưa có học viên"
            desc={canManage ? 'Thêm học viên vào khóa học để bắt đầu theo dõi tiến độ.' : 'Bạn chưa có quyền quản lý danh sách học viên của khóa học này.'}
          >
            {canManage && (
              <Button onClick={() => setShowAdd(true)} className="mt-4 gap-2">
                <Icon name="ri-user-add-line" />
                Thêm học viên
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Search + filter + sort */}
            <div className="flex flex-col gap-3 border-b border-border bg-card px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <label htmlFor="student-search" className="sr-only">Tìm học viên</label>
                <Icon
                  name="ri-search-line"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                />
                <Input
                  id="student-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm theo tên hoặc mã sinh viên"
                  className="pl-9 pr-3"
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
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
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
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                >
                  <option value="recent">Hoạt động gần nhất</option>
                  <option value="progress">Tiến độ cao → thấp</option>
                  <option value="name">Tên A → Z</option>
                </select>
                {hasActiveSearch && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'col-span-2 sm:col-span-1')}
                  >
                    Xóa lọc
                  </button>
                )}
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-sm text-foreground">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-left text-sm font-semibold text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Học viên</th>
                    <th className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 font-semibold">Tiến độ</th>
                    <th className="px-4 py-3 font-semibold">Hoạt động gần nhất</th>
                    <th className="w-[220px] px-4 py-3 text-center font-semibold">Hành động</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <p className="text-sm font-medium text-foreground">Không tìm thấy học viên phù hợp</p>
                        {hasActiveSearch && (
                          <button
                            type="button"
                            onClick={resetFilters}
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}
                          >
                            Xóa từ khóa và bộ lọc
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    rows.map((student) => (
                      <tr
                        key={student.id}
                        className="group transition hover:bg-muted/30"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar src={student.avatarUrl} name={student.name} className="h-9 w-9" />
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-foreground">{student.name}</p>
                              <p className="mt-0.5 text-sm font-normal text-muted-foreground">{student.code}</p>
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
                            <ProgressBar value={student.progress} label={`Tiến độ của ${student.name}`} className="w-24" />
                            <span className="w-9 text-right text-sm font-normal tabular-nums text-muted-foreground">
                              {student.progress}%
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm font-normal text-muted-foreground">{activityText(student.lastActive)}</td>

                        <td className="w-[220px] px-4 py-3 text-center">
                          <div className="inline-flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenId(student.id)}
                              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-w-[104px]')}
                            >
                              Xem tiến độ
                            </button>
                            <RemoveStudentButton
                              student={student}
                              canManage={canManage}
                              onRemove={() => setStudentToRemove(student)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-border md:hidden">
              {rows.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">Không tìm thấy học viên phù hợp</p>
                  {hasActiveSearch && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}
                    >
                      Xóa từ khóa và bộ lọc
                    </button>
                  )}
                </div>
              ) : (
                rows.map((student) => (
                  <article
                    key={student.id}
                    className="px-4 py-4 transition active:bg-muted/50"
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar src={student.avatarUrl} name={student.name} className="h-10 w-10" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-foreground">{student.name}</p>
                            <p className="mt-0.5 text-sm font-normal text-muted-foreground">{student.code}</p>
                          </div>
                          <RemoveStudentButton
                            student={student}
                            canManage={canManage}
                            onRemove={() => setStudentToRemove(student)}
                          />
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(student.status)}`}
                          >
                            {student.status === 'dropped' ? 'Đã gỡ' : ENROLL_LABEL[student.status]}
                          </span>
                          <span className="text-sm text-muted-foreground">{activityText(student.lastActive)}</span>
                        </div>

                        <div className="mt-3">
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Tiến độ</span>
                            <span className="font-medium tabular-nums text-foreground">{student.progress}%</span>
                          </div>
                          <ProgressBar value={student.progress} label={`Tiến độ của ${student.name}`} />
                        </div>

                        <button
                          type="button"
                          onClick={() => setOpenId(student.id)}
                          className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'mt-3 w-full')}
                        >
                          Xem tiến độ
                        </button>
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
        title={studentToRemove ? `Gỡ ${studentToRemove.name} khỏi khóa học?` : 'Gỡ học viên khỏi khóa học?'}
        description={
          studentToRemove ? (
            <>
              <span className="font-medium text-foreground">{studentToRemove.name}</span> ({studentToRemove.code}) sẽ không còn nằm
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
            className="absolute inset-0 cursor-default bg-brand-dark/40"
            onClick={() => setShowAdd(false)}
          />

          <section className="relative flex max-h-[min(680px,calc(100dvh-32px))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-semibold text-foreground">Thêm học viên vào khóa học</h3>
                <p className="mt-1 text-xs text-muted-foreground">Tìm học viên theo tên hoặc mã sinh viên rồi thêm vào khóa học hiện tại.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Đóng"
              >
                <Icon name="ri-close-line" className="text-lg" />
              </button>
            </header>

            <div className="border-b border-border px-5 py-3 sm:px-6">
              <div className="relative">
                <label htmlFor="add-student-search" className="sr-only">Tìm học viên để thêm</label>
                <Icon
                  name="ri-search-line"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  id="add-student-search"
                  autoFocus
                  value={addQuery}
                  onChange={(event) => setAddQuery(event.target.value)}
                  placeholder="Nhập tên hoặc mã sinh viên"
                  className="h-10 w-full rounded-lg border border-border pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {directoryLoading ? (
                <div aria-live="polite" aria-busy="true" className="space-y-2 p-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                      <div className="h-9 w-9 rounded-full bg-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="h-4 w-40 max-w-full rounded bg-muted" />
                        <div className="mt-2 h-3 w-20 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : directoryError ? (
                <div role="alert" className="px-4 py-10 text-center text-sm text-destructive">
                  Không tải được danh mục học viên.
                </div>
              ) : candidates.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">Không tìm thấy sinh viên phù hợp.</div>
              ) : (
                <ul>
                  {candidates.map((candidate) => {
                    const added = enrolledIds.has(candidate.id);
                    return (
                      <li
                        key={candidate.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-muted"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {initials(candidate.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{candidate.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{candidate.code}</p>
                        </div>

                        {added ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary">
                            <Icon name="ri-check-line" className="text-sm" />
                            Đã thêm
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addStudent(candidate)}
                            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-ring hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
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
            className="absolute inset-0 cursor-default bg-brand-dark/40"
            onClick={() => setOpenId(null)}
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
            <header className="border-b border-border px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <UserAvatar src={open.avatarUrl} name={open.name} className="h-11 w-11 text-sm" />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{open.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{open.code}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Đóng"
                >
                  <Icon name="ri-close-line" className="text-lg" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-muted/60 py-3">
                <div className="px-3 text-center">
                  <p className="text-xs text-muted-foreground">Tiến độ</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{open.progress}%</p>
                </div>
                <div className="px-3 text-center">
                  <p className="text-xs text-muted-foreground">Quan sát</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                    {open.attention === null ? '—' : `${open.attention}%`}
                  </p>
                </div>
                <div className="px-3 text-center">
                  <p className="text-xs text-muted-foreground">Trạng thái</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">
                    {open.status === 'dropped' ? 'Đã gỡ' : ENROLL_LABEL[open.status]}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">Hoạt động gần nhất: {activityText(open.lastActive)}</p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Tiến độ từng bài</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Chọn một bài để mở heatmap của học viên.</p>
                </div>
              </div>

              {open.lessons.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Học viên chưa bắt đầu bài nào.
                </div>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {open.lessons.map((lesson) => {
                    const pct = lesson.total > 0 ? Math.round((lesson.viewed / lesson.total) * 100) : 0;

                    return (
                      <li key={lesson.lessonId}>
                        <Link
                          href={`/teacher/courses/${courseId}/lessons/${lesson.lessonId}/heatmap?student=${open.id}`}
                          className="group flex items-center gap-3 px-3.5 py-3 transition first:rounded-t-xl last:rounded-b-xl hover:bg-muted"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
                                {lessonTitle(lesson.lessonId)}
                              </p>
                              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{pct}%</span>
                            </div>

                            <ProgressBar value={pct} label={`Tiến độ bài ${lessonTitle(lesson.lessonId)} của ${open.name}`} className="mt-2" />

                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                              <span>
                                {lesson.viewed}/{lesson.total} trang
                              </span>
                              <span>
                                Quan sát {lesson.attention === null ? '—' : `${lesson.attention}%`}
                              </span>
                            </div>
                          </div>

                          <Icon name="ri-arrow-right-s-line" className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
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
