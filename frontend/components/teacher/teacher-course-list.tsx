"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTeacherCourses } from "@/hooks/use-teacher";
import { setCourseGazeDot } from "@/lib/api/teacher";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { STATUS_LABEL } from "@/lib/constants";
import type { TeacherCourse } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

type SortMode = "recent" | "name";

// Các lối vào nhanh trong workspace của khóa (khớp ?tab= của CourseWorkspace).
const COURSE_TABS = [
  { key: "content", label: "Nội dung" },
  { key: "students", label: "Học viên" },
] as const;

const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-[#e8f1e6] text-[#52704f]",
  archived: "bg-[#f3ede4] text-[#8a6d3b]",
};

function CourseRow({
  course,
  canManage,
  toggling,
  onToggleGaze,
}: {
  course: TeacherCourse;
  canManage: boolean;
  toggling: boolean;
  onToggleGaze: (course: TeacherCourse, value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef3eb] text-[#52654f]">
        <Icon name="ri-book-open-line" className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            prefetch={false}
            href={`/teacher/courses/${course.id}?tab=content`}
            className="truncate text-base font-semibold leading-6 text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {course.title}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              STATUS_CLS[course.status] ?? STATUS_CLS.draft,
            )}
          >
            {STATUS_LABEL[course.status] ?? course.status}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {course.description}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Icon name="ri-user-line" className="size-3.5" />
            {course.students} học viên
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="ri-slideshow-3-line" className="size-3.5" />
            {course.lessonCount ?? 0} bài giảng
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="ri-calendar-line" className="size-3.5" />
            Cập nhật {course.updatedAt}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
        <div
          className="flex items-center gap-2 rounded-full border border-[#dfe9dc] bg-[#e8f1e6]/50 py-1 pl-3 pr-1"
          title={canManage ? "Áp cho mọi bài giảng và bài tập của khóa" : "Chỉ chủ khóa học mới đổi được"}
        >
          <span className="text-[11px] font-medium text-[#3f573c]">Điểm nhìn cho SV</span>
          <Switch
            checked={Boolean(course.showGazeDot)}
            disabled={!canManage || toggling}
            onCheckedChange={(value) => onToggleGaze(course, value)}
            ariaLabel={`Hiển thị điểm nhìn cho sinh viên — ${course.title}`}
          />
        </div>

        <nav aria-label={`Mở khóa ${course.title}`} className="flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 p-1">
          {COURSE_TABS.map((tab) => (
            <Link
              key={tab.key}
              prefetch={false}
              href={`/teacher/courses/${course.id}?tab=${tab.key}`}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function TeacherCourseList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: courses = [], isLoading, isError, refetch } = useTeacherCourses();

  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [sort, setSort] = useState<SortMode>("recent");
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Ghi từ khóa vào URL (?q=) sau khi người dùng ngừng gõ.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = searchParams.toString();
      const params = new URLSearchParams(current);
      if (query) params.set("q", query);
      else params.delete("q");
      const next = params.toString();
      if (next !== current) {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, searchParams, pathname, router]);

  const toggleGaze = async (course: TeacherCourse, value: boolean) => {
    setPending((prev) => ({ ...prev, [course.id]: true }));
    queryClient.setQueriesData<TeacherCourse[]>({ queryKey: ["teacher", "courses"] }, (list) =>
      list?.map((c) => (c.id === course.id ? { ...c, showGazeDot: value } : c)),
    );
    try {
      await setCourseGazeDot(course.id, value);
    } catch {
      // Bỏ qua: invalidate ở dưới sẽ kéo lại trạng thái thật từ máy chủ.
    } finally {
      setPending((prev) => ({ ...prev, [course.id]: false }));
      queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
    }
  };

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    const filtered = keyword
      ? courses.filter((course) =>
          `${course.title} ${course.description}`.toLocaleLowerCase("vi").includes(keyword),
        )
      : courses;
    if (sort === "name") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title, "vi"));
    }
    return filtered;
  }, [courses, query, sort]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Không tải được danh sách khóa học"
        description="Vui lòng kiểm tra kết nối và thử lại."
        onRetry={() => void refetch()}
      />
    );
  }

  if (courses.length === 0) {
    return (
      <EmptyState
        icon="ri-book-open-line"
        title="Chưa có khóa học nào"
        description="Tạo khóa học đầu tiên để bắt đầu quản lý nội dung."
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Icon
            name="ri-search-line"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm khóa học theo tên"
            aria-label="Tìm khóa học theo tên"
            className="h-9 bg-muted/55 pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Sắp xếp</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
            aria-label="Sắp xếp khóa học"
            className="h-9 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="recent">Mới nhất</option>
            <option value="name">Tên A → Z</option>
          </select>
        </label>
      </div>

      {visible.length ? (
        <div className="divide-y divide-border/70 overflow-hidden rounded-[20px] border border-border/80 bg-white shadow-xs">
          {visible.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              canManage={course.isOwner !== false}
              toggling={Boolean(pending[course.id])}
              onToggleGaze={(target, value) => void toggleGaze(target, value)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="ri-search-line"
          title="Không tìm thấy khóa học"
          description="Thử thay đổi từ khóa tìm kiếm."
        />
      )}
    </section>
  );
}
