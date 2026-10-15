"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import {
  useAssignTeachers,
  useCourseTeachers,
  useTeacherDirectory,
  useUnassignTeacher,
} from "@/hooks/use-admin";
import { useTeacherCourses } from "@/hooks/use-teacher";
import { STATUS_LABEL } from "@/lib/constants";
import type { CourseStatus, TeacherCourse } from "@/lib/types/domain";
import { initialsOf } from "@/lib/utils";

type Filter = CourseStatus | "all";

function statusVariant(status: CourseStatus): "success" | "warning" | "outline" {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "outline";
}

function AssignmentPanel({ courseId }: { courseId: string }) {
  const assignedQuery = useCourseTeachers(courseId);
  const directoryQuery = useTeacherDirectory();
  const assigned = assignedQuery.data ?? [];
  const directory = directoryQuery.data ?? [];
  const assign = useAssignTeachers(courseId);
  const unassign = useUnassignTeacher(courseId);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const assignedIds = new Set(assigned.map((t) => t.teacherId));
  const available = directory.filter((t) => !assignedIds.has(t.id) && !selected.includes(t.id));

  const doAssign = async () => {
    setNotice(null);
    unassign.reset();
    try {
      const res = await assign.mutateAsync(selected);
      setSelected([]);
      setNotice(`Đã phân công ${res.added} giảng viên.`);
    } catch {}
  };

  const doUnassign = (teacher: Parameters<typeof unassign.mutate>[0]) => {
    setNotice(null);
    assign.reset();
    unassign.mutate(teacher, {
      onSuccess: () => setNotice("Đã gỡ giảng viên khỏi khóa học."),
    });
  };

  const isLoading = assignedQuery.isLoading || directoryQuery.isLoading;
  const queryError = assignedQuery.error ?? directoryQuery.error;
  const actionError = assign.error ?? unassign.error;

  if (isLoading) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="p-5">
        <ErrorState
          title="Không tải được phân công"
          description={queryError instanceof Error ? queryError.message : "Vui lòng thử lại."}
          onRetry={() => {
            void Promise.all([assignedQuery.refetch(), directoryQuery.refetch()]);
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-px border-t border-[#eeeee9] bg-[#eeeee9] lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <section className="bg-[#fdfdfa] p-4 sm:p-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Giảng viên hiện tại</h3>
        {assigned.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-surface px-4 py-4 text-sm text-muted-foreground">
            Chưa có giảng viên được phân công.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/70">
            {assigned.map((teacher) => (
              <li
                key={teacher.teacherId}
                className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"
              >
                <Avatar className="size-9">
                  <AvatarFallback>{initialsOf(teacher.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{teacher.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {teacher.code}
                    {teacher.email ? ` · ${teacher.email}` : ""}
                  </span>
                </span>
                {teacher.isOwner ? (
                  <Badge variant="warning">Chủ khóa học</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={unassign.isPending}
                    onClick={() => doUnassign(teacher)}
                    aria-label={`Gỡ ${teacher.name}`}
                  >
                    <Icon name="ri-close-line" className="size-4" /> Gỡ
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white p-4 sm:p-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Thêm giảng viên</h3>
        <select
          value=""
          onChange={(e) => e.target.value && setSelected((prev) => [...prev, e.target.value])}
          disabled={available.length === 0}
          aria-label="Chọn giảng viên để thêm"
          className="mt-3 h-10 w-full rounded-full border border-input bg-surface px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:bg-muted"
        >
          <option value="">
            {available.length === 0 ? "Không còn giảng viên để gán" : "Chọn giảng viên"}
          </option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.code}
            </option>
          ))}
        </select>

        {selected.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {selected.map((id) => {
              const t = directory.find((d) => d.id === id);
              return (
                <li key={id}>
                   <Badge variant="outline" className="gap-1.5 rounded-full pr-1">
                    {t?.name ?? id}
                    <button
                      type="button"
                      onClick={() => setSelected((prev) => prev.filter((x) => x !== id))}
                      aria-label={`Bỏ ${t?.name ?? id}`}
                      className="rounded-full p-0.5 hover:bg-black/10"
                    >
                      <Icon name="ri-close-line" className="size-3.5" />
                    </button>
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}

        <Button
          className="mt-3 w-full"
          disabled={selected.length === 0 || assign.isPending}
          onClick={doAssign}
        >
          {assign.isPending ? "Đang phân công…" : `Phân công ${selected.length > 0 ? `(${selected.length})` : ""}`}
        </Button>

        {actionError && (
          <Alert className="mt-3" variant="destructive" title="Không thực hiện được thao tác">
            {actionError instanceof Error ? actionError.message : "Vui lòng thử lại."}
          </Alert>
        )}
        {notice && !actionError && <Alert className="mt-3" variant="info" title={notice} />}
      </section>
    </div>
  );
}

function CourseRow({
  course,
  expanded,
  onToggle,
}: {
  course: TeacherCourse;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-[18px] border border-[#eeeee9] bg-white shadow-xs transition-shadow hover:shadow-sm">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="group flex min-h-20 w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition hover:bg-[#fdfdfa] sm:px-5"
      >
        <span className="font-mono text-[10px] font-semibold text-muted-foreground group-hover:text-foreground">
          {course.id.slice(0, 5).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{course.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {course.students} học viên · cập nhật {course.updatedAt}
          </span>
        </span>
        <Badge variant={statusVariant(course.status)} className="hidden sm:inline-flex">
          {STATUS_LABEL[course.status]}
        </Badge>
        <Icon
          name="ri-arrow-down-s-line"
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && <AssignmentPanel courseId={course.id} />}
    </article>
  );
}

export function CourseAssignment() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: courses = [], isLoading, isError, error, refetch } = useTeacherCourses();

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    return courses.filter((c) => {
      const matchStatus = filter === "all" || c.status === filter;
      const matchQuery =
        !keyword ||
        [c.title, c.id, c.description].join(" ").toLocaleLowerCase("vi").includes(keyword);
      return matchStatus && matchQuery;
    });
  }, [courses, filter, query]);

  return (
    <div className="space-y-5">
      <div className="rounded-[18px] border border-[#eeeee9] bg-white p-2 shadow-xs">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_210px]">
          <div className="relative">
            <Icon
              name="ri-search-line"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc mã khóa học"
              className="h-10 rounded-full border-transparent bg-[#f5f6f2] pl-10 shadow-none focus-visible:border-border"
              aria-label="Tìm khóa học"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Lọc trạng thái"
            className="h-10 rounded-full border border-transparent bg-[#f5f6f2] px-4 text-xs font-medium text-foreground outline-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring/20"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp</option>
            <option value="archived">Lưu trữ</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Không tải được danh sách khóa học"
          description={error instanceof Error ? error.message : "Vui lòng thử lại."}
          onRetry={() => refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="ri-book-open-line"
          title="Không có khóa học phù hợp"
          description="Thử thay đổi từ khóa hoặc trạng thái."
        />
      ) : (
        <div className="grid gap-2.5">
          <div className="flex items-center justify-between gap-4 px-1 py-1 sm:px-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Danh mục khóa học</h2>
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
              {visible.length} / {courses.length}
            </span>
          </div>
          {visible.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              expanded={expandedId === course.id}
              onToggle={() => setExpandedId(expandedId === course.id ? null : course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
