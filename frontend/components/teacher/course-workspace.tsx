"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { FullPageSpinner } from "@/components/ui/spinner";
import { ContentEditor } from "@/components/teacher/content-editor";
import { StudentsTab } from "@/components/teacher/students-tab";
import { OverviewTab } from "@/components/teacher/overview-tab";
import { useTeacherCourses } from "@/hooks/use-teacher";
import { LEVEL_LABEL, STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type View = "content" | "students" | "overview";

const TABS: { key: View; label: string }[] = [
  { key: "content", label: "Nội dung" },
  { key: "students", label: "Học viên" },
  { key: "overview", label: "Tổng quan" },
];

function Workspace({ courseId }: { courseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = courseId === "c-new";
  const tabParam = searchParams.get("tab");
  const view: View = TABS.some((t) => t.key === tabParam) ? (tabParam as View) : "content";

  const { data: courses = [], isLoading } = useTeacherCourses();
  const course = courses.find((c) => c.id === courseId);
  const canManage = isNew || course?.isOwner === true;
  const title = isNew ? "Khóa học mới" : course?.title ?? "Khóa học";
  const status = isNew ? "draft" : course?.status ?? "draft";

  if (!isNew && isLoading) return <FullPageSpinner label="Đang tải khóa học..." />;

  return (
    <div className="min-h-dvh bg-[#f5f6f2] text-black">
      <header className="sticky top-0 z-30 border-b border-[#eeeee9] bg-[#f5f6f2]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:px-8 lg:px-12">
          <Button asChild variant="ghost" size="icon" aria-label="Quay lại danh sách khóa học" className="rounded-full hover:bg-white">
            <Link href="/teacher">
              <Icon name="ri-arrow-left-line" className="size-5" />
            </Link>
          </Button>

          <div className="min-w-0 flex-1 border-l border-black/10 pl-4">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-black">{title}</p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-black/45">
              <span className="rounded-full bg-[#e8f1e6] px-2 py-0.5 font-medium text-[#52704f]">
                {STATUS_LABEL[status]}
              </span>
              {!isNew && course && (
                <span className="truncate">
                  {LEVEL_LABEL[course.level]} · {course.students} học viên
                </span>
              )}
            </div>
          </div>

          {!isNew && (
            <nav aria-label="Khu vực quản lý" className="order-last flex w-full items-center gap-1 rounded-full border border-[#eeeee9] bg-white p-1 shadow-xs sm:order-none sm:w-auto">
              {TABS.map((item) => {
                const active = view === item.key;
                return (
                  <Link
                    key={item.key}
                    href={`/teacher/courses/${courseId}?tab=${item.key}`}
                    className={cn(
                      "flex h-8 flex-1 items-center justify-center rounded-full px-4 text-xs font-semibold transition-colors sm:flex-none",
                      active
                        ? "bg-black text-white shadow-sm"
                        : "text-black/45 hover:text-black",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100dvh-73px)] w-full max-w-[1440px] rounded-t-[28px] border border-b-0 border-[#eeeee9] bg-[#fdfdfa] px-4 py-8 shadow-[0_-1px_12px_rgba(30,35,25,0.025)] sm:px-8 lg:px-12 lg:py-12">
        {view === "content" ? (
          <ContentEditor
            courseId={courseId}
            isNew={isNew}
            canManage={canManage}
            onCreated={(id) => router.replace(`/teacher/courses/${id}?tab=content`)}
          />
        ) : view === "students" ? (
          <StudentsTab courseId={courseId} canManage={canManage} />
        ) : (
          <OverviewTab courseId={courseId} />
        )}
      </main>
    </div>
  );
}

export function CourseWorkspace({ courseId }: { courseId: string }) {
  return (
    <Suspense fallback={<FullPageSpinner label="Đang tải khóa học..." />}>
      <Workspace courseId={courseId} />
    </Suspense>
  );
}
