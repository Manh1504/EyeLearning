"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useMyEnrollments } from "@/hooks/use-student";
import type { EnrolledCourse } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

function courseHref(enrollment: EnrolledCourse) {
  return `/student/courses/${enrollment.course.id}/prepare`;
}

function CourseCard({ enrollment }: { enrollment: EnrolledCourse }) {
  const completed = enrollment.status === "completed";
  return (
    <Link
      href={courseHref(enrollment)}
      className="group flex flex-col rounded-[20px] border border-border/80 bg-white p-5 shadow-xs outline-none transition hover:-translate-y-0.5 hover:border-foreground/10 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-[#e8f1e6] text-[#36533a]">
          <Icon name={completed ? "ri-checkbox-circle-line" : "ri-book-open-line"} className="size-5" />
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold",
            completed ? "bg-[#e8f1e6] text-[#52704f]" : "bg-muted text-muted-foreground",
          )}
        >
          {completed ? "Hoàn thành" : "Đang học"}
        </span>
      </div>
      <h3 className="mt-4 line-clamp-2 text-base font-semibold leading-6 text-foreground">
        {enrollment.course.title}
      </h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">{enrollment.course.teacherName}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#f7f7f4] p-3 text-[11px] text-muted-foreground">
        <span>
          <strong className="block text-sm text-foreground">{enrollment.course.moduleCount}</strong>chương
        </span>
        <span>
          <strong className="block text-sm text-foreground">{enrollment.course.lessonCount}</strong>bài học
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs font-medium text-foreground">
          {completed ? "Xem lại khóa học" : enrollment.progress ? "Tiếp tục học" : "Bắt đầu học"}
        </span>
        <Icon name="ri-arrow-right-line" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export function StudentHome() {
  const { data: enrollments = [], isLoading, isError, refetch } = useMyEnrollments();
  const [query, setQuery] = useState("");

  // Chỉ hiển thị khóa học; "mới được tạo gần nhất" = giữ nguyên thứ tự API
  // (đã sắp mới nhất trước), không lọc theo tiến độ/trạng thái.
  const courses = useMemo(
    () => enrollments.filter((item) => item.status !== "dropped"),
    [enrollments],
  );
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    if (!keyword) return courses;
    return courses.filter((item) =>
      `${item.course.title} ${item.course.teacherName}`.toLocaleLowerCase("vi").includes(keyword),
    );
  }, [courses, query]);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Không tải được khóa học"
        description="Vui lòng kiểm tra kết nối và thử lại."
        onRetry={() => refetch()}
      />
    );
  }
  if (courses.length === 0) {
    return (
      <EmptyState
        icon="ri-book-open-line"
        title="Chưa có khóa học"
        description="Tài khoản của bạn chưa được ghi danh vào khóa học nào."
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Khóa học của bạn</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {filtered.length} khóa học · mới nhất trước
          </p>
        </div>
        <div className="relative sm:w-64">
          <Icon
            name="ri-search-line"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="page-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm khóa học"
            className="h-9 bg-muted/55 pl-9"
          />
        </div>
      </div>

      {filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((enrollment) => (
            <CourseCard key={enrollment.enrollmentId} enrollment={enrollment} />
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
