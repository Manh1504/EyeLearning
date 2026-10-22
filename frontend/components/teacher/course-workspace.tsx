"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { FullPageSpinner } from "@/components/ui/spinner";
import { ContentEditor } from "@/components/teacher/content-editor";
import { CourseInfoTab } from "@/components/teacher/course-info-tab";
import { CourseSettingsTab } from "@/components/teacher/course-settings-tab";
import { StudentsTab } from "@/components/teacher/students-tab";
import { UnsavedGuardProvider, useUnsavedGuard } from "@/components/teacher/unsaved-guard";
import { useTeacherCourses } from "@/hooks/use-teacher";
import { STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type View = "content" | "info" | "settings" | "students";

const TABS: { key: View; label: string }[] = [
  { key: "content", label: "Nội dung" },
  { key: "info", label: "Thông tin khóa học" },
  { key: "settings", label: "Cài đặt" },
  { key: "students", label: "Học viên" },
];

function Workspace({ courseId }: { courseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const guard = useUnsavedGuard();
  const isNew = courseId === "c-new";
  const tabParam = searchParams.get("tab");
  // Khóa mới không có tab: luôn hiển thị trang tạo khóa học một-bước.
  const view: View = isNew
    ? "content"
    : TABS.some((t) => t.key === tabParam)
      ? (tabParam as View)
      : "content";

  const { data: courses = [], isLoading } = useTeacherCourses();
  const course = courses.find((c) => c.id === courseId);
  const canManage = isNew || course?.isOwner === true;
  const title = isNew ? "Khóa học mới" : course?.title ?? "Khóa học";
  const status = isNew ? "draft" : course?.status ?? "draft";

  /** Điều hướng trong workspace — hỏi trước nếu trình soạn còn thay đổi chưa lưu. */
  const go = (href: string) => {
    const proceed = () => router.push(href);
    if (guard) guard.confirmLeave(proceed);
    else proceed();
  };

  if (!isNew && isLoading) return <FullPageSpinner label="Đang tải khóa học..." />;

  return (
    <div className="min-h-dvh bg-[#f5f6f2] text-black">
      <header className="sticky top-0 z-30 border-b border-[#eeeee9] bg-[#f5f6f2]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:px-8 lg:px-12">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Quay lại danh sách khóa học"
            title="Về danh sách khóa học"
            className="rounded-full hover:bg-white"
          >
            <Link
              href="/teacher"
              onClick={(event) => {
                event.preventDefault();
                go("/teacher");
              }}
            >
              <Icon name="ri-arrow-left-line" className="size-5" />
            </Link>
          </Button>

          <div className="min-w-0 flex-1 border-l border-black/10 pl-4">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-black">{title}</p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-black/60">
              <span className="rounded-full bg-[#e8f1e6] px-2 py-0.5 font-medium text-[#52704f]">
                {STATUS_LABEL[status]}
              </span>
              {!isNew && course && <span className="truncate">{course.students} học viên</span>}
            </div>
          </div>

          {!isNew && (
            <nav
              aria-label="Khu vực quản lý"
              className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto rounded-full border border-[#eeeee9] bg-white p-1 shadow-xs sm:order-none sm:mx-0 sm:w-auto"
            >
              {TABS.map((item) => {
                const active = view === item.key;
                const href = `/teacher/courses/${courseId}?tab=${item.key}`;
                return (
                  <Link
                    key={item.key}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => {
                      if (active) {
                        event.preventDefault();
                        return;
                      }
                      event.preventDefault();
                      go(href);
                    }}
                    className={cn(
                      "flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-colors",
                      active ? "bg-black text-white shadow-sm" : "text-black/60 hover:text-black",
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
        {view === "content" && (
          <ContentEditor
            courseId={courseId}
            isNew={isNew}
            canManage={canManage}
            courseTitle={title}
            onCreated={(id) => router.replace(`/teacher/courses/${id}?tab=content`)}
          />
        )}
        {!isNew && view === "info" && <CourseInfoTab courseId={courseId} canManage={canManage} />}
        {!isNew && view === "settings" && (
          <CourseSettingsTab courseId={courseId} canManage={canManage} />
        )}
        {!isNew && view === "students" && <StudentsTab courseId={courseId} canManage={canManage} />}
      </main>
    </div>
  );
}

export function CourseWorkspace({ courseId }: { courseId: string }) {
  return (
    <Suspense fallback={<FullPageSpinner label="Đang tải khóa học..." />}>
      <UnsavedGuardProvider>
        <Workspace courseId={courseId} />
      </UnsavedGuardProvider>
    </Suspense>
  );
}
