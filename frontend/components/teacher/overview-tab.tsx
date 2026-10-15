"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseStudents, useCourseTree, useTeacherCourses } from "@/hooks/use-teacher";
import { ENROLL_LABEL, STATUS_LABEL } from "@/lib/constants";
import { initialsOf } from "@/lib/utils";

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex min-h-40 flex-col justify-between rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p>
      <div>
        <p className="text-4xl font-semibold tracking-[-0.05em] text-black">{value}</p>
        <p className="mt-2 text-xs leading-5 text-black/45">{note}</p>
      </div>
    </div>
  );
}

function DistributionRow({ label, count, total }: { label: string; count: number; total: number }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-black">{label}</span>
        <span className="tabular-nums text-black/45">
          {count} học viên · {percent}%
        </span>
      </div>
      <Progress value={percent} className="mt-3 h-1.5 bg-white/70" indicatorClassName="bg-[#6f8f69]" />
    </div>
  );
}

export function OverviewTab({ courseId }: { courseId: string }) {
  const { data: courses = [], isLoading: coursesLoading, isError: coursesError } = useTeacherCourses();
  const { data: modules = [], isLoading: modulesLoading, isError: modulesError } = useCourseTree(courseId);
  const { data: students = [], isLoading: studentsLoading, isError: studentsError } = useCourseStudents(courseId);

  const course = courses.find((c) => c.id === courseId);
  const loading = coursesLoading || modulesLoading || studentsLoading;
  const hasError = coursesError || modulesError || studentsError;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <ErrorState
        title="Không tải được tổng quan khóa học"
        description="Vui lòng thử lại sau."
      />
    );
  }

  const lessons = modules.flatMap((m) => m.lessons);
  const lessonsWithPdf = lessons.filter((l) => l.slides > 0).length;
  const totalStudents = students.length;
  const notStarted = students.filter((s) => s.status === "active" && s.progress <= 0).length;
  const inProgress = students.filter((s) => s.status === "active" && s.progress > 0).length;
  const completed = students.filter((s) => s.status === "completed").length;
  const visibleStudents = students.filter((s) => s.status !== "dropped").slice(0, 5);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-5 border-b border-black/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Báo cáo nhanh</p>
          <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.04em] text-black sm:text-4xl">
            Tổng quan khóa học
          </h2>
          <p className="mt-3 text-sm text-black/45">
            Tóm tắt tiến độ học viên và tình trạng nội dung.
          </p>
        </div>
        <p className="rounded-full border border-[#eeeee9] bg-white px-4 py-2 text-xs text-black/45 shadow-xs">Cập nhật {course?.updatedAt ?? "—"}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Tổng học viên"
          value={String(course?.students ?? totalStudents)}
          note="Số học viên của khóa học"
        />
        <MetricCard label="Đang học" value={String(inProgress)} note="Học viên active có tiến độ > 0%" />
        <MetricCard label="Đã hoàn thành" value={String(completed)} note="Theo trạng thái ghi danh" />
        <MetricCard
          label="Tiến độ trung bình"
          value={`${course?.completion ?? 0}%`}
          note="Giá trị từ API khóa học"
        />
      </div>

      {totalStudents === 0 ? (
        <EmptyState
          icon="ri-group-line"
          title="Khóa học chưa có học viên"
          description="Thêm học viên hoặc mở tab Học viên để quản lý danh sách."
          action={
            <Button asChild variant="outline">
              <Link href={`/teacher/courses/${courseId}?tab=students`}>Xem tab Học viên</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <section className="rounded-[20px] border border-[#dfe9dc] bg-[#e8f1e6] p-6 text-black shadow-xs sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Phân bố tiến độ</h3>
                <p className="mt-1 text-xs text-black/45">Phân loại theo trạng thái và tiến độ.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-black/55">{totalStudents} học viên</span>
            </div>
            <div className="mt-12 space-y-6">
              <DistributionRow label="Chưa bắt đầu" count={notStarted} total={totalStudents} />
              <DistributionRow label="Đang học" count={inProgress} total={totalStudents} />
              <DistributionRow label="Đã hoàn thành" count={completed} total={totalStudents} />
            </div>
          </section>

          <section className="overflow-hidden rounded-[20px] border border-[#eeeee9] bg-white shadow-xs">
            <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-black">Tiến độ học viên</h3>
                <p className="mt-0.5 text-xs text-black/40">Danh sách từ dữ liệu hiện có.</p>
              </div>
              <Link
                href={`/teacher/courses/${courseId}?tab=students`}
                 className="shrink-0 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
              >
                Xem tất cả
              </Link>
            </div>
            <div className="divide-y divide-black/8 px-2">
              {visibleStudents.map((student) => (
                <div key={student.id} className="flex items-center gap-3 rounded-xl px-4 py-3.5 hover:bg-[#fdfdfa]">
                  <Avatar className="size-9">
                    {student.avatarUrl ? <AvatarImage src={student.avatarUrl} alt={student.name} /> : null}
                    <AvatarFallback>{initialsOf(student.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-black">{student.name}</p>
                    <p className="mt-0.5 text-xs text-black/40">
                      {student.code} · {student.lastActive || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums text-black">{student.progress}%</p>
                    <span className="mt-1 block text-[10px] text-black/40">
                      {ENROLL_LABEL[student.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 pt-3">
              <Button asChild size="sm" className="w-full rounded-full bg-black text-white hover:bg-black/80">
                <Link href={`/teacher/courses/${courseId}?tab=students`}>Xem tiến độ học viên</Link>
              </Button>
            </div>
          </section>
        </div>
      )}

      <section className="rounded-[20px] border border-[#eeeee9] bg-white p-2 shadow-xs">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-black">Tình trạng nội dung</h3>
            <p className="mt-0.5 text-xs text-black/40">Dữ liệu từ cấu trúc chương và bài học.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full rounded-full border-black/10 sm:w-auto">
            <Link href={`/teacher/courses/${courseId}?tab=content`}>
              <Icon name="ri-edit-line" className="size-4" />
              Quản lý nội dung
            </Link>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
           <div className="rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] px-5 py-5">
            <p className="text-2xl font-semibold tracking-tight text-black">{modules.length}</p>
            <p className="mt-1 text-xs text-black/40">Chương</p>
          </div>
            <div className="rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] px-5 py-5">
            <p className="text-2xl font-semibold tracking-tight text-black">{lessons.length}</p>
            <p className="mt-1 text-xs text-black/40">Bài học</p>
          </div>
            <div className="rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] px-5 py-5">
            <p className="text-2xl font-semibold tracking-tight text-black">{lessonsWithPdf}</p>
            <p className="mt-1 text-xs text-black/40">Bài có PDF</p>
          </div>
          <div className="rounded-[18px] border border-[#dfe9dc] bg-[#e8f1e6] px-5 py-5 text-black">
            <p className="text-lg font-semibold">
              {course?.status ? STATUS_LABEL[course.status] : "—"}
            </p>
            <p className="mt-1 text-xs text-black/45">Trạng thái</p>
          </div>
        </div>
      </section>
    </div>
  );
}
