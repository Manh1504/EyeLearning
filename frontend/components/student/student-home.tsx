"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useMyEnrollments, useMyLearningStats } from "@/hooks/use-student";
import { LEVEL_LABEL } from "@/lib/constants";
import type { EnrolledCourse } from "@/lib/types/domain";
import { getStoredCalibration } from "@/lib/api/calibration";
import type { LearningStats } from "@/lib/api/student";
import { useQuizAssignments } from "@/hooks/use-quiz";
import { cn } from "@/lib/utils";

type TabKey = "all" | "active" | "completed";

function subscribeCalibration(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function courseHref(enrollment: EnrolledCourse) {
  return `/student/courses/${enrollment.course.id}/prepare`;
}

function MiniCourse({ enrollment }: { enrollment: EnrolledCourse }) {
  const completed = enrollment.status === "completed";
  return (
    <Link
      href={courseHref(enrollment)}
      className="group flex min-h-40 flex-col rounded-[18px] border border-border/80 bg-surface p-4 shadow-xs outline-none transition hover:-translate-y-0.5 hover:border-foreground/10 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon name={completed ? "ri-checkbox-circle-line" : "ri-book-open-line"} className="size-4" />
        </span>
        <span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", completed ? "bg-[#e8f1e6] text-[#52704f]" : "bg-[#f5f5f3] text-muted-foreground")}>{completed ? "Hoàn thành" : "Đang học"}</span>
      </div>
      <div className="mt-4 min-w-0">
        <h3 className="line-clamp-2 text-xs font-semibold leading-5 text-foreground">{enrollment.course.title}</h3>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">{enrollment.course.teacherName}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-[#f7f7f4] p-2.5 text-[9px] text-muted-foreground">
        <span><strong className="block text-xs text-foreground">{enrollment.course.moduleCount}</strong>chương</span>
        <span><strong className="block text-xs text-foreground">{enrollment.course.lessonCount}</strong>bài học</span>
      </div>
      <div className="mt-auto pt-4">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-[9px] text-muted-foreground">Tiến độ</span>
          <strong className="text-xl font-semibold tracking-tight tabular-nums">{Math.round(enrollment.progress)}%</strong>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full", completed ? "bg-success" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.max(0, enrollment.progress))}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function LearningMap({ enrollments }: { enrollments: EnrolledCourse[] }) {
  const plotted = enrollments.slice(0, 4);
  const tones = [
    "bg-[#e8f1e6] text-[#3f5e42]",
    "bg-[#f6efe3] text-[#715d3d]",
    "bg-[#edf2ef] text-[#46564d]",
    "bg-[#f5f5f3] text-[#565751]",
  ];
  return (
    <section className="relative min-h-[276px] overflow-hidden rounded-[20px] border border-border/80 bg-surface p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lộ trình học</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Tiến độ trên các khóa đang theo học</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
          {plotted.length} khóa
        </span>
      </div>

      <div className="mt-5">
        <div className="grid grid-cols-5 px-1 text-[9px] text-muted-foreground">
          <span>0%</span><span className="text-center">25%</span><span className="text-center">50%</span><span className="text-center">75%</span><span className="text-right">100%</span>
        </div>
        <div className="relative mt-2 space-y-2.5 overflow-hidden rounded-xl py-1">
          <div className="pointer-events-none absolute inset-0 grid grid-cols-4 divide-x divide-border/80 border-x border-border/80" />
          {plotted.length > 0 ? plotted.map((enrollment, index) => {
            const progress = Math.round(Math.min(100, Math.max(0, enrollment.progress)));
            return (
              <Link key={enrollment.enrollmentId} href={courseHref(enrollment)} className="group relative flex h-10 items-center">
                <span
                  className={cn("flex h-9 min-w-32 items-center justify-between gap-3 rounded-xl px-3 shadow-xs transition group-hover:-translate-y-0.5 group-hover:shadow-sm", tones[index % tones.length])}
                  style={{ width: `${Math.max(34, progress)}%` }}
                >
                  <span className="truncate text-[10px] font-semibold">{enrollment.course.title}</span>
                  <span className="shrink-0 text-[9px] font-bold tabular-nums">{progress}%</span>
                </span>
              </Link>
            );
          }) : <p className="py-12 text-center text-xs text-muted-foreground">Chưa có dữ liệu tiến độ</p>}
        </div>
      </div>
    </section>
  );
}

function UpcomingAssignments() {
  const { data: assignments = [], isLoading } = useQuizAssignments();
  const upcoming = assignments.find((item) => item.status === "published");
  return (
    <section className="rounded-[20px] border border-border/80 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Bài tập sắp đến</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Các bài cần hoàn thành sẽ xuất hiện tại đây.</p>
        </div>
        <Link href="/student/assignments" className="flex size-8 items-center justify-center rounded-full bg-[#f5f5f3] text-muted-foreground transition hover:bg-[#e8f1e6] hover:text-[#52704f]" aria-label="Xem tất cả bài tập"><Icon name="ri-arrow-right-line" className="size-4" /></Link>
      </div>
      {isLoading ? (
        <Skeleton className="mt-5 h-24 rounded-2xl" />
      ) : upcoming ? (
        <Link href={`/student/assignments/${upcoming.id}`} className="mt-5 flex min-h-24 items-center gap-4 rounded-2xl border border-border/80 bg-[#fafaf8] px-4 py-4 transition hover:border-foreground/10 hover:shadow-xs">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e8f1e6] text-[#52704f]"><Icon name="ri-file-text-line" className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{upcoming.title}</span>
            <span className="mt-1 block truncate text-[10px] text-muted-foreground">{upcoming.courseTitle} · {upcoming.questions.length} câu · {upcoming.durationMinutes} phút</span>
            <span className="mt-1 block text-[9px] font-medium text-warning">Hạn {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(upcoming.dueAt))}</span>
          </span>
          <Icon name="ri-arrow-right-line" className="size-4 text-muted-foreground" />
        </Link>
      ) : (
        <div className="mt-5 flex min-h-24 items-center gap-4 rounded-2xl border border-dashed border-border bg-[#fafaf8] px-4 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e8f1e6] text-[#52704f]"><Icon name="ri-check-line" className="size-4" /></span>
          <div>
            <p className="text-xs font-semibold">Chưa có bài tập sắp đến</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Bài giảng viên giao sẽ xuất hiện tại đây.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ProgressSnapshot({ enrollments }: { enrollments: EnrolledCourse[] }) {
  const completed = enrollments.filter((item) => item.status === "completed").length;
  const active = enrollments.filter((item) => item.status === "active").length;
  const average = enrollments.length
    ? Math.round(enrollments.reduce((sum, item) => sum + item.progress, 0) / enrollments.length)
    : 0;
  return (
    <section className="rounded-[20px] border border-border/80 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-sm font-semibold">Tiến độ học tập</h2><p className="mt-1 text-[11px] text-muted-foreground">Tổng hợp từ các khóa học hiện tại.</p></div>
        <span className="rounded-full bg-[#e8f1e6] px-2.5 py-1 text-[10px] font-semibold text-[#52704f]">{average}%</span>
      </div>
      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] items-center gap-5">
        <div className="grid size-[88px] place-items-center rounded-full" style={{ background: `conic-gradient(#789472 ${average * 3.6}deg, #f0f0eb 0deg)` }}>
          <div className="grid size-[66px] place-items-center rounded-full bg-white text-base font-semibold">{average}%</div>
        </div>
        <div className="space-y-3 text-[11px]">
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><i className="size-2 rounded-full bg-[#789472]" />Đã hoàn thành</span><strong>{completed}</strong></div>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><i className="size-2 rounded-full bg-[#d5c9ae]" />Đang học</span><strong>{active}</strong></div>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><i className="size-2 rounded-full bg-[#deded9]" />Tổng khóa học</span><strong>{enrollments.length}</strong></div>
        </div>
      </div>
    </section>
  );
}

function SummaryRail({ enrollments, stats }: { enrollments: EnrolledCourse[]; stats?: LearningStats }) {
  const calibrated = useSyncExternalStore(
    subscribeCalibration,
    () => getStoredCalibration().calibrated,
    () => false,
  );
  const calibrationCourse = enrollments.find((item) => item.status === "active") ?? enrollments[0];
  const average = enrollments.length
    ? Math.round(enrollments.reduce((sum, item) => sum + item.progress, 0) / enrollments.length)
    : 0;
  return (
    <aside className="grid min-h-[276px] grid-cols-2 gap-2 lg:grid-cols-1">
      <div className="flex flex-col justify-between rounded-[17px] border border-border bg-[#e8f1e6] p-4 text-foreground">
        <span className="text-[10px] font-medium text-muted-foreground">Tiến độ trung bình</span>
        <strong className="text-3xl font-semibold tracking-[-0.05em] tabular-nums">{average}%</strong>
        <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${average}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <div className="rounded-[18px] border border-border/80 bg-white p-3 shadow-xs">
          <Icon name="ri-fire-line" className="size-4 text-muted-foreground" />
          <p className="mt-3 text-lg font-semibold tabular-nums">{stats?.streakDays ?? 0}</p>
          <p className="text-[10px] text-muted-foreground">ngày liên tiếp</p>
        </div>
        <div className="rounded-[18px] border border-border/80 bg-white p-3 shadow-xs">
          <Icon name="ri-calendar-line" className="size-4 text-muted-foreground" />
          <p className="mt-3 text-lg font-semibold tabular-nums">
            {Math.round((stats?.weekStudyMinutes ?? 0) / 60)}h
          </p>
          <p className="text-[10px] text-muted-foreground">trong tuần</p>
        </div>
      </div>
      {calibrationCourse && (
        <Link
          href={`/student/courses/${calibrationCourse.course.id}/prepare`}
          className="col-span-2 flex items-center gap-3 rounded-[18px] border border-border/80 bg-surface p-3 shadow-xs transition hover:border-foreground/10 hover:shadow-sm lg:col-span-1"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e8f1e6] text-[#52704f]">
            <Icon name="ri-eye-line" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold">Eye Tracking</span>
            <span className="mt-0.5 block text-[9px] text-muted-foreground">
              {calibrated ? "Sẵn sàng cho phiên học" : "Cần hiệu chỉnh trước khi học"}
            </span>
          </span>
          <span className={cn("size-2 rounded-full", calibrated ? "bg-success" : "bg-warning")} />
        </Link>
      )}
    </aside>
  );
}

function CourseLine({ enrollment, index }: { enrollment: EnrolledCourse; index: number }) {
  const completed = enrollment.status === "completed";
  return (
    <div className="grid gap-3 border-t border-border py-4 sm:grid-cols-[36px_minmax(0,1fr)_140px_110px_auto] sm:items-center">
      <span className="hidden text-[10px] font-semibold text-muted-foreground sm:block">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <Link href={courseHref(enrollment)} className="truncate text-sm font-semibold hover:underline">
          {enrollment.course.title}
        </Link>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {LEVEL_LABEL[enrollment.course.level]} · {enrollment.course.teacherName}
        </p>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>Tiến độ</span><span>{Math.round(enrollment.progress)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${enrollment.progress}%` }} />
        </div>
      </div>
      <span className={cn("w-fit rounded-full px-2.5 py-1 text-[10px] font-medium", completed ? "bg-success/10 text-success" : "bg-muted text-muted-foreground") }>
        {completed ? "Hoàn thành" : "Đang học"}
      </span>
      <Button asChild size="sm" variant={completed ? "outline" : "default"}>
        <Link href={courseHref(enrollment)}>{completed ? "Xem lại" : enrollment.progress ? "Tiếp tục" : "Bắt đầu"}</Link>
      </Button>
    </div>
  );
}

export function StudentHome() {
  const { data: enrollments = [], isLoading, isError, refetch } = useMyEnrollments();
  const { data: learningStats } = useMyLearningStats();
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const courses = useMemo(() => enrollments.filter((item) => item.status !== "dropped"), [enrollments]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    return courses.filter((item) =>
      (tab === "all" || item.status === tab) &&
      (!keyword || `${item.course.title} ${item.course.teacherName}`.toLocaleLowerCase("vi").includes(keyword)),
    );
  }, [courses, query, tab]);

  if (isLoading) {
    return <div className="grid gap-3 lg:grid-cols-12"><Skeleton className="h-[276px] rounded-2xl lg:col-span-4" /><Skeleton className="h-[276px] rounded-2xl lg:col-span-6" /><Skeleton className="h-[276px] rounded-2xl lg:col-span-2" /></div>;
  }
  if (isError) {
    return <ErrorState title="Không tải được khóa học" description="Vui lòng kiểm tra kết nối và thử lại." onRetry={() => refetch()} />;
  }
  if (courses.length === 0) {
    return <EmptyState icon="ri-book-open-line" title="Chưa có khóa học" description="Tài khoản của bạn chưa được ghi danh vào khóa học nào." />;
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "all", label: "Tất cả" },
    { key: "active", label: "Đang học" },
    { key: "completed", label: "Hoàn thành" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-3 lg:grid-cols-12">
        <section className="grid grid-cols-2 gap-2 lg:col-span-4">
          {courses.slice(0, 4).map((enrollment) => <MiniCourse key={enrollment.enrollmentId} enrollment={enrollment} />)}
        </section>
        <div className="lg:col-span-6"><LearningMap enrollments={courses} /></div>
        <div className="lg:col-span-2"><SummaryRail enrollments={courses} stats={learningStats} /></div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <UpcomingAssignments />
        <ProgressSnapshot enrollments={courses} />
      </div>

      <section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Khóa học của bạn</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Tiếp tục bài học hoặc xem lại nội dung đã hoàn thành.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-60">
              <Icon name="ri-search-line" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="page-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm khóa học" className="h-9 bg-muted/55 pl-9" />
            </div>
            <div className="flex rounded-full bg-muted p-1">
              {tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold", tab === item.key ? "bg-surface shadow-xs" : "text-muted-foreground")}>{item.label}</button>)}
            </div>
          </div>
        </div>
        <div className="mt-4">
          {filtered.length ? filtered.map((enrollment, index) => <CourseLine key={enrollment.enrollmentId} enrollment={enrollment} index={index} />) : <EmptyState icon="ri-search-line" title="Không tìm thấy khóa học" description="Thử thay đổi từ khóa hoặc bộ lọc." />}
        </div>
      </section>
    </div>
  );
}
