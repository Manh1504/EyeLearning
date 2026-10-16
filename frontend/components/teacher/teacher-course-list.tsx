"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useTeacherCourses } from "@/hooks/use-teacher";
import { LEVEL_LABEL, STATUS_LABEL } from "@/lib/constants";
import type { CourseStatus, TeacherCourse } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

type Filter = CourseStatus | "all";
const CREATE_HREF = "/teacher/courses/c-new?new=1";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "published", label: "Đã xuất bản" },
  { key: "draft", label: "Nháp" },
  { key: "archived", label: "Lưu trữ" },
];

function CourseChip({ course }: { course: TeacherCourse }) {
  return (
    <Link prefetch={false} href={`/teacher/courses/${course.id}`} className="flex min-h-40 flex-col rounded-[18px] border border-border/80 bg-surface p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-foreground/10 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted"><Icon name="ri-book-open-line" className="size-4 text-muted-foreground" /></span>
        <span className="rounded-full bg-muted px-2 py-1 text-[9px] font-semibold text-muted-foreground">{STATUS_LABEL[course.status]}</span>
      </div>
      <div className="mt-4 min-w-0">
        <h3 className="line-clamp-2 text-xs font-semibold leading-5">{course.title}</h3>
        <p className="mt-1 text-[10px] text-muted-foreground">{course.students} học viên</p>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f7f7f4] px-3 py-2.5 text-[9px] text-muted-foreground">
        <span>{LEVEL_LABEL[course.level]}</span>
        <span>{course.updatedAt}</span>
      </div>
      <div className="mt-auto pt-4">
        <div className="mb-2 flex items-end justify-between"><span className="text-[9px] text-muted-foreground">Hoàn thành</span><strong className="text-xl font-semibold tracking-tight tabular-nums">{Math.round(course.completion)}%</strong></div>
        <div className="h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${course.completion}%` }} /></div>
      </div>
    </Link>
  );
}

function Portfolio({ courses }: { courses: TeacherCourse[] }) {
  const plotted = courses.slice(0, 6);
  return (
    <section className="min-h-[276px] rounded-[20px] border border-border/80 bg-surface p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-sm font-semibold">Hiệu suất khóa học</h2><p className="mt-1 text-[11px] text-muted-foreground">Tiến độ trung bình theo từng lớp</p></div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{courses.length} khóa</span>
      </div>
      <div className="mt-7 space-y-3.5">
        {plotted.length ? plotted.map((course, index) => (
          <Link key={course.id} prefetch={false} href={`/teacher/courses/${course.id}`} className="grid grid-cols-[18px_minmax(0,1fr)_36px] items-center gap-3 text-[10px]">
            <span className="font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <span className="relative h-6 overflow-hidden rounded-full bg-muted">
              <span className={cn("absolute inset-y-0 left-0 rounded-full", index === 0 ? "bg-primary" : "bg-primary/20")} style={{ width: `${Math.max(4, course.completion)}%` }} />
              <span className="absolute inset-0 flex items-center truncate px-3 font-medium text-foreground">{course.title}</span>
            </span>
            <span className="text-right font-semibold tabular-nums">{Math.round(course.completion)}%</span>
          </Link>
        )) : <p className="py-14 text-center text-xs text-muted-foreground">Chưa có dữ liệu khóa học</p>}
      </div>
    </section>
  );
}

function InsightRail({ courses, students }: { courses: TeacherCourse[]; students: number }) {
  const average = courses.length ? Math.round(courses.reduce((sum, course) => sum + course.completion, 0) / courses.length) : 0;
  const published = courses.filter((course) => course.status === "published").length;
  return (
    <aside className="grid min-h-[276px] grid-cols-2 gap-2 lg:grid-cols-1">
      <div className="flex flex-col justify-between rounded-[17px] border border-border bg-[#e8f1e6] p-4 text-foreground">
        <span className="text-[10px] text-muted-foreground">Hoàn thành trung bình</span>
        <strong className="text-3xl font-semibold tracking-[-0.05em]">{average}%</strong>
        <div className="h-1 rounded-full bg-primary/10"><span className="block h-full rounded-full bg-primary" style={{ width: `${average}%` }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <div className="rounded-[18px] border border-border/80 bg-white p-3 shadow-xs"><Icon name="ri-group-line" className="size-4 text-muted-foreground" /><p className="mt-3 text-lg font-semibold">{students}</p><p className="text-[10px] text-muted-foreground">học viên</p></div>
        <div className="rounded-[18px] border border-border/80 bg-white p-3 shadow-xs"><Icon name="ri-checkbox-circle-line" className="size-4 text-muted-foreground" /><p className="mt-3 text-lg font-semibold">{published}</p><p className="text-[10px] text-muted-foreground">đã xuất bản</p></div>
      </div>
    </aside>
  );
}

function CourseLine({ course }: { course: TeacherCourse }) {
  return (
    <Link prefetch={false} href={`/teacher/courses/${course.id}`} className="group grid gap-3 border-t border-border py-4 sm:grid-cols-[minmax(0,1fr)_110px_100px_150px_auto] sm:items-center">
      <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{course.title}</h3><p className="mt-1 truncate text-[11px] text-muted-foreground">{LEVEL_LABEL[course.level]} · cập nhật {course.updatedAt}</p></div>
      <span className="text-[11px] text-muted-foreground"><Icon name="ri-group-line" className="mr-1 inline size-3.5" />{course.students} học viên</span>
      <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">{STATUS_LABEL[course.status]}</span>
      <div><div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground"><span>Hoàn thành</span><span>{Math.round(course.completion)}%</span></div><div className="h-1 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${course.completion}%` }} /></div></div>
      <Icon name="ri-arrow-right-line" className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-1 sm:block" />
    </Link>
  );
}

export function TeacherCourseList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { data: courses = [], isLoading, isError, refetch } = useTeacherCourses();
  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    return courses.filter((course) => (filter === "all" || course.status === filter) && (!keyword || `${course.title} ${course.description}`.toLocaleLowerCase("vi").includes(keyword)));
  }, [courses, filter, query]);
  const totalStudents = courses.reduce((sum, course) => sum + course.students, 0);

  if (isLoading) return <div className="grid gap-3 lg:grid-cols-12"><Skeleton className="h-[276px] rounded-2xl lg:col-span-4" /><Skeleton className="h-[276px] rounded-2xl lg:col-span-6" /><Skeleton className="h-[276px] rounded-2xl lg:col-span-2" /></div>;
  if (isError) return <ErrorState title="Không tải được danh sách khóa học" description="Vui lòng kiểm tra kết nối và thử lại." onRetry={() => refetch()} />;

  return (
    <div className="space-y-8">
      {courses.length > 0 && <div className="grid gap-3 lg:grid-cols-12"><section className="grid grid-cols-2 gap-2 lg:col-span-4">{courses.slice(0, 4).map((course) => <CourseChip key={course.id} course={course} />)}</section><div className="lg:col-span-6"><Portfolio courses={courses} /></div><div className="lg:col-span-2"><InsightRail courses={courses} students={totalStudents} /></div></div>}

      <section>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="text-lg font-semibold tracking-tight">Danh sách khóa học</h2><p className="mt-1 text-[11px] text-muted-foreground">Quản lý nội dung, học viên và dữ liệu tập trung.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-60"><Icon name="ri-search-line" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="page-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm khóa học" className="h-9 bg-muted/55 pl-9" /></div>
            <div className="flex overflow-x-auto rounded-full bg-muted p-1">{FILTERS.map((item) => <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold", filter === item.key ? "bg-surface shadow-xs" : "text-muted-foreground")}>{item.label}</button>)}</div>
            <Button asChild size="sm"><Link href={CREATE_HREF}><Icon name="ri-add-line" />Tạo khóa học</Link></Button>
          </div>
        </div>
        <div className="mt-4">{courses.length === 0 ? <EmptyState icon="ri-book-open-line" title="Chưa có khóa học nào" description="Tạo khóa học đầu tiên để bắt đầu quản lý nội dung học tập." action={<Button asChild><Link href={CREATE_HREF}>Tạo khóa học</Link></Button>} /> : visible.length ? visible.map((course) => <CourseLine key={course.id} course={course} />) : <EmptyState icon="ri-search-line" title="Không tìm thấy khóa học" description="Thử thay đổi từ khóa hoặc bộ lọc." />}</div>
      </section>
    </div>
  );
}
