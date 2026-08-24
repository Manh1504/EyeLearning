'use client';

// components/admin/course-assignment.tsx — Admin: phân công giảng viên cho khóa học.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  assignTeachers,
  fetchCourseTeachers,
  fetchTeachers,
  unassignTeacher,
  type CourseTeacher,
  type TeacherDirectory,
} from '@/lib/api/admin';
import { useTeacherCourses } from '@/hooks/use-teacher';
import { STATUS_LABEL } from '@/lib/mock/teacher';
import type { CourseStatus, TeacherCourse } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

type Filter = CourseStatus | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'published', label: 'Đã xuất bản' },
  { key: 'draft', label: 'Nháp' },
  { key: 'archived', label: 'Lưu trữ' },
];

const STATUS_BADGE: Record<CourseStatus, string> = {
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-600',
};

function getAssignedTeachers(assigned: CourseTeacher[]) {
  return assigned.filter((teacher) => !teacher.isOwner);
}

function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center"
    >
      <div className="max-w-sm">
        <div
          className={cn(
            'mx-auto flex h-10 w-10 items-center justify-center rounded-lg',
            tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500',
          )}
        >
          <Icon name={icon} className="text-xl" aria-hidden />
        </div>
        <h2 className="mt-3 text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>
        {action}
      </div>
    </div>
  );
}

function TeacherPicker({
  teachers,
  value,
  onChange,
  disabled,
  loading,
}: {
  teachers: TeacherDirectory[];
  value: string;
  onChange: (teacherId: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = teachers.find((teacher) => teacher.id === value);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi');
    if (!keyword) return teachers;

    return teachers.filter((teacher) =>
      [teacher.name, teacher.code, teacher.email ?? '', teacher.department ?? '']
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(keyword),
    );
  }, [query, teachers]);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      if (!trigger) return;

      const width = Math.min(Math.max(trigger.width, 320), window.innerWidth - 24);
      const left = Math.min(Math.max(12, trigger.left), window.innerWidth - width - 12);
      const spaceBelow = window.innerHeight - trigger.bottom;
      const menuHeight = Math.min(360, Math.max(180, 72 + filtered.length * 52));
      const opensUp = spaceBelow < menuHeight + 12 && trigger.top > spaceBelow;

      setMenuStyle({
        position: 'fixed',
        left,
        top: opensUp ? Math.max(12, trigger.top - menuHeight - 8) : trigger.bottom + 8,
        width,
        maxHeight: menuHeight,
        zIndex: 80,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [filtered.length, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm outline-none transition hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <span className="min-w-0 truncate">
          {loading ? 'Đang tải giảng viên...' : selected ? `${selected.name} · ${selected.code}` : 'Chọn giảng viên'}
        </span>
        <Icon name="ri-arrow-down-s-line" className="shrink-0 text-slate-400" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/12"
          >
            <div className="border-b border-slate-100 p-2">
              <label className="relative block">
                <span className="sr-only">Tìm giảng viên</span>
                <Icon
                  name="ri-search-line"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                  placeholder="Tìm tên, email hoặc mã..."
                  className="h-9 pl-9"
                />
              </label>
            </div>
            <div role="listbox" aria-label="Danh sách giảng viên" className="p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Không có giảng viên phù hợp.</p>
              ) : (
                filtered.map((teacher) => (
                  <button
                    key={teacher.id}
                    type="button"
                    role="option"
                    aria-selected={teacher.id === value}
                    onClick={() => {
                      onChange(teacher.id);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition hover:bg-slate-50 focus-visible:bg-accent',
                      teacher.id === value && 'bg-accent text-primary',
                    )}
                  >
                    <UserAvatar name={teacher.name} className="h-8 w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{teacher.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {teacher.code}{teacher.email ? ` · ${teacher.email}` : ''}
                      </span>
                    </span>
                    {teacher.id === value && (
                      <Icon name="ri-check-line" className="shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function CourseAssignment() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chosen, setChosen] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [success, setSuccess] = useState('');

  const {
    data: courses = [],
    isLoading,
    isError,
    error: coursesError,
  } = useTeacherCourses();

  const {
    data: teachers = [],
    isLoading: teachersLoading,
    isError: teachersIsError,
    error: teachersError,
  } = useQuery({
    queryKey: ['admin', 'teachers'],
    queryFn: () => fetchTeachers(),
  });

  const {
    data: assigned = [],
    isLoading: assignedLoading,
    isError: assignedIsError,
    error: assignedError,
  } = useQuery({
    queryKey: ['admin', 'course-teachers', selectedId],
    queryFn: () => fetchCourseTeachers(selectedId!),
    enabled: Boolean(selectedId),
  });

  const selectedCourse = courses.find((course) => course.id === selectedId) ?? null;
  const owner = assigned.find((teacher) => teacher.isOwner);
  const assignedTeachers = getAssignedTeachers(assigned);
  const assignedIds = new Set(assigned.map((teacher) => teacher.teacherId));
  const available = teachers.filter((teacher) => !assignedIds.has(teacher.id));
  const selectedTeacher = teachers.find((teacher) => teacher.id === chosen);

  const assign = useMutation({
    mutationFn: ({ courseId, teacherId }: { courseId: string; teacherId: string }) =>
      assignTeachers(courseId, [teacherId]),
    onSuccess: () => {
      setSuccess('Đã gán giảng viên cho khóa học.');
      setChosen('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'course-teachers', selectedId] });
    },
    onError: () => setSuccess(''),
  });

  const unassign = useMutation({
    mutationFn: ({ courseId, teacherId }: { courseId: string; teacherId: string }) =>
      unassignTeacher(courseId, teacherId),
    onSuccess: () => {
      setSuccess('Đã gỡ giảng viên khỏi khóa học.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'course-teachers', selectedId] });
    },
    onError: () => setSuccess(''),
  });

  const visibleCourses = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi');

    return courses.filter((course) => {
      const matchQuery =
        keyword.length === 0 ||
        course.title.toLocaleLowerCase('vi').includes(keyword) ||
        course.id.toLocaleLowerCase('vi').includes(keyword) ||
        course.description.toLocaleLowerCase('vi').includes(keyword);
      const matchFilter =
        filter === 'all' ||
        course.status === filter;

      return matchQuery && matchFilter;
    });
  }, [courses, filter, query]);

  const counts = useMemo(() => ({
    all: courses.length,
    published: courses.filter((course) => course.status === 'published').length,
    draft: courses.filter((course) => course.status === 'draft').length,
    archived: courses.filter((course) => course.status === 'archived').length,
  }), [courses]);

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const selectCourse = (course: TeacherCourse) => {
    setSelectedId(course.id);
    setChosen('');
    setSuccess('');
    assign.reset();
    unassign.reset();
  };

  const closeCourseDetails = () => {
    setSelectedId(null);
    setChosen('');
    setSuccess('');
    assign.reset();
    unassign.reset();
  };

  const actionError = assign.error ?? unassign.error;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:py-10">
      <section className="border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]">
          Phân công giảng viên
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
          Chọn khóa học để xem chủ sở hữu và quản lý giảng viên được phân công.
        </p>
      </section>

      <section className="pt-6">
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block w-full lg:max-w-[420px]">
              <span className="sr-only">Tìm theo tên hoặc mã khóa học</span>
              <Icon
                name="ri-search-line"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-slate-400"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên hoặc mã khóa học..."
                className="pl-10"
              />
            </label>

            <div
              role="tablist"
              aria-label="Lọc khóa học"
              className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1"
            >
              {FILTERS.map((item) => {
                const active = filter === item.key;
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
                        ? 'bg-white text-primary shadow-sm'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-900',
                    )}
                  >
                    {item.label}
                    <span className={cn('text-xs tabular-nums', active ? 'text-primary' : 'text-slate-400')}>
                      {counts[item.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card className="min-w-0 gap-0 py-0">
          <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Danh sách khóa học</h2>
              <p className="text-xs text-slate-500">
                {visibleCourses.length} / {courses.length} khóa học
              </p>
            </div>
            {query.trim() || filter !== 'all' ? (
              <button
                type="button"
                onClick={resetFilters}
                className="self-start rounded-lg px-2 py-1 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/20 sm:self-auto"
              >
                Xóa lọc
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <div aria-live="polite" aria-busy="true" className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-slate-100 p-4">
                  <div className="h-5 w-2/3 rounded bg-slate-100" />
                  <div className="mt-3 h-4 w-1/2 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-4">
              <EmptyState
                tone="danger"
                icon="ri-error-warning-line"
                title="Không tải được khóa học"
                description={coursesError instanceof Error ? coursesError.message : 'Vui lòng thử lại sau.'}
              />
            </div>
          ) : courses.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon="ri-book-open-line"
                title="Chưa có khóa học"
                description="Hiện chưa có khóa học nào để phân công giảng viên."
              />
            </div>
          ) : visibleCourses.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon="ri-search-line"
                title="Không có kết quả phù hợp"
                description="Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc."
                action={
                  <Button type="button" variant="outline" onClick={resetFilters} className="mt-4">
                    Xóa tìm kiếm và bộ lọc
                  </Button>
                }
              />
            </div>
          ) : (
            <>
            <div className="grid gap-3 p-3 md:hidden">
              {visibleCourses.map((course) => {
                const selected = course.id === selectedId;
                const courseAssignedTeachers = selected ? assignedTeachers : [];
                const assignedLabel = selected
                  ? assignedLoading
                    ? 'Đang tải...'
                    : courseAssignedTeachers.length > 0
                      ? courseAssignedTeachers.map((teacher) => teacher.name).join(', ')
                      : 'Chưa phân công'
                  : 'Chọn để xem';

                return (
                  <article
                    key={course.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    data-selected={selected ? 'true' : undefined}
                    onClick={() => selectCourse(course)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectCourse(course);
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-xl border bg-white p-4 outline-none transition hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-ring/20',
                      selected ? 'border-brand-cyan/60 bg-accent ring-2 ring-ring/20' : 'border-slate-200',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                          selected
                            ? 'border-primary bg-primary text-white'
                            : 'border-slate-300 bg-white text-transparent',
                        )}
                        aria-hidden
                      >
                        <Icon name="ri-check-line" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-semibold text-slate-900">{course.title}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{course.id} · {course.students} học viên</p>
                      </div>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_BADGE[course.status])}>
                        {STATUS_LABEL[course.status]}
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-slate-500">Chủ khóa học</dt>
                        <dd className="min-w-0 text-right text-slate-700">
                          {selected && owner ? owner.name : course.isOwner ? 'Chủ sở hữu' : 'Chọn để xem'}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-slate-500">Giảng viên</dt>
                        <dd className={cn('min-w-0 text-right', assignedLabel === 'Chưa phân công' ? 'font-medium text-amber-700' : 'text-slate-700')}>
                          {assignedLabel}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>

            <div className="hidden md:block">
              <table className="min-w-full table-fixed divide-y divide-slate-100">
                <thead className="bg-slate-50 text-left text-sm font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-[44%] px-4 py-3">Khóa học</th>
                    <th scope="col" className="w-[16%] px-4 py-3">Trạng thái</th>
                    <th scope="col" className="w-[20%] px-4 py-3">Chủ khóa học</th>
                    <th scope="col" className="w-[20%] px-4 py-3">Giảng viên</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleCourses.map((course) => {
                    const selected = course.id === selectedId;
                    const courseAssignedTeachers = selected ? assignedTeachers : [];
                    const assignedLabel = selected
                      ? assignedLoading
                        ? 'Đang tải...'
                        : courseAssignedTeachers.length > 0
                          ? courseAssignedTeachers.map((teacher) => teacher.name).join(', ')
                          : 'Chưa phân công'
                      : 'Chọn để xem';

                    return (
                      <tr
                        key={course.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => selectCourse(course)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectCourse(course);
                          }
                        }}
                        className={cn(
                          'cursor-pointer outline-none transition hover:bg-slate-50 focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/20',
                          selected ? 'bg-accent' : 'bg-white',
                        )}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="group flex max-w-full items-start gap-3 text-left">
                            <span
                              className={cn(
                                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                                selected
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-slate-300 bg-white text-transparent group-hover:border-ring/60',
                              )}
                              aria-hidden
                            >
                              <Icon name="ri-check-line" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-base font-semibold text-slate-900" title={course.title}>
                                {course.title}
                              </span>
                              <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                                {course.id} · {course.students} học viên
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_BADGE[course.status])}>
                            {STATUS_LABEL[course.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {selected && owner ? (
                            <span className="inline-flex max-w-full rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <span className="truncate">{owner.name}</span>
                            </span>
                          ) : course.isOwner ? (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Chủ sở hữu
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Chọn để xem</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={cn(
                              'block truncate text-sm',
                              assignedLabel === 'Chưa phân công' ? 'font-medium text-amber-700' : 'text-slate-600',
                            )}
                            title={assignedLabel}
                          >
                            {assignedLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>

        <Card className="min-w-0 gap-0 py-0">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Gán giảng viên</h2>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {selectedCourse ? selectedCourse.title : 'Chọn một khóa học để thao tác'}
              </p>
            </div>
            {selectedCourse && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Đóng chi tiết khóa học"
                title="Đóng"
                onClick={closeCourseDetails}
                className="size-10 shrink-0"
              >
                <Icon name="ri-close-line" className="text-lg" aria-hidden />
              </Button>
            )}
          </div>

          <div className="space-y-5 p-4">
            {!selectedCourse ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                <Icon name="ri-cursor-line" className="mx-auto text-2xl text-slate-400" aria-hidden />
                <p className="mt-2 text-sm font-medium text-slate-800">Chưa chọn khóa học</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Chọn một dòng trong danh sách để xem chủ khóa học và giảng viên hiện tại.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Khóa học đang chọn</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{selectedCourse.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {STATUS_LABEL[selectedCourse.status]} · {selectedCourse.students} học viên
                  </p>
                </div>

                {assignedIsError ? (
                  <div role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {assignedError instanceof Error ? assignedError.message : 'Không tải được danh sách giảng viên của khóa học.'}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Chủ khóa học và giảng viên hiện tại</p>
                    <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {assignedLoading ? (
                        <li className="px-3 py-3 text-sm text-slate-500">Đang tải phân công...</li>
                      ) : assigned.length === 0 ? (
                        <li className="px-3 py-3 text-sm text-slate-500">Chưa phân công.</li>
                      ) : (
                        assigned.map((teacher) => (
                          <li key={teacher.teacherId} className="flex items-center gap-3 px-3 py-2.5">
                            <UserAvatar name={teacher.name} className="h-8 w-8" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-900">{teacher.name}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {teacher.code}{teacher.email ? ` · ${teacher.email}` : ''}
                              </span>
                            </span>
                            {teacher.isOwner ? (
                              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                Chủ khóa học
                              </span>
                            ) : (
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => unassign.mutate({ courseId: selectedCourse.id, teacherId: teacher.teacherId })}
                                disabled={unassign.isPending}
                              >
                                {unassign.isPending ? 'Đang gỡ...' : 'Gỡ'}
                              </Button>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}

                <div>
                  <label htmlFor="teacher-picker" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Giảng viên
                  </label>
                  <div id="teacher-picker" className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <TeacherPicker
                      teachers={available}
                      value={chosen}
                      onChange={setChosen}
                      loading={teachersLoading}
                      disabled={teachersLoading || teachersIsError || available.length === 0 || assignedIsError}
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        if (selectedCourse && chosen) {
                          setSuccess('');
                          assign.mutate({ courseId: selectedCourse.id, teacherId: chosen });
                        }
                      }}
                      disabled={!selectedCourse || !chosen || assign.isPending || assignedIsError}
                      className="w-full sm:w-auto"
                    >
                      {assign.isPending ? 'Đang gán...' : 'Gán giảng viên'}
                    </Button>
                  </div>
                  {teachersIsError && (
                    <p role="alert" className="mt-2 text-sm text-rose-600">
                      {teachersError instanceof Error ? teachersError.message : 'Không tải được danh sách giảng viên.'}
                    </p>
                  )}
                  {!teachersLoading && !teachersIsError && available.length === 0 && (
                    <p className="mt-2 text-sm text-slate-500">
                      Không còn giảng viên phù hợp để phân công.
                    </p>
                  )}
                  {selectedTeacher && (
                    <p className="mt-2 text-sm text-slate-500">
                      Sẽ gán: <span className="font-medium text-slate-800">{selectedTeacher.name}</span>
                      {selectedTeacher.email ? ` · ${selectedTeacher.email}` : ''}
                    </p>
                  )}
                </div>

                <div aria-live="polite" className="space-y-2">
                  {success && (
                    <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {success}
                    </p>
                  )}
                  {actionError && (
                    <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {(actionError as Error).message || 'Thao tác thất bại.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
