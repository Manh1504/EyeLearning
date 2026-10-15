"use client";

import Link from "next/link";
import {
  RiArrowRightLine,
  RiCalendarLine,
  RiCheckLine,
  RiFileList3Line,
  RiTimeLine,
} from "@remixicon/react";
import { useQuizAssignments, useQuizAttempt } from "@/hooks/use-quiz";
import type { QuizAssignment } from "@/lib/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function AssignmentCard({ assignment }: { assignment: QuizAssignment }) {
  const { data: attempt, isLoading } = useQuizAttempt(assignment.id);
  const isClosed = assignment.status === "closed";
  const href = attempt
    ? `/student/assignments/${assignment.id}/result`
    : `/student/assignments/${assignment.id}`;

  return (
    <article className="group flex h-full flex-col rounded-[24px] border border-border/80 bg-white p-5 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-foreground/10 hover:shadow-md sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f1e6] text-[#36533a]">
          <RiFileList3Line className="size-5" aria-hidden />
        </div>
        {isLoading ? (
          <span className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        ) : attempt ? (
          <Badge variant="success"><RiCheckLine className="size-3.5" />Đã nộp</Badge>
        ) : isClosed ? (
          <Badge variant="secondary">Đã đóng</Badge>
        ) : (
          <Badge variant="accent">Cần hoàn thành</Badge>
        )}
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {assignment.courseTitle}
      </p>
      <h3 className="font-display text-xl leading-snug text-foreground">{assignment.title}</h3>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {assignment.instructions}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 border-t border-border/70 pt-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <RiTimeLine className="size-4 text-foreground/60" aria-hidden />
          {assignment.durationMinutes} phút
        </span>
        <span className="flex items-center justify-end gap-2">
          {assignment.questions.length} câu hỏi
        </span>
        <span className="col-span-2 flex items-center gap-2">
          <RiCalendarLine className="size-4 text-foreground/60" aria-hidden />
          Hạn {dateFormatter.format(new Date(assignment.dueAt))}
        </span>
      </div>

      <Button asChild className="mt-5 w-full" variant={attempt ? "outline" : "default"}>
        <Link href={href}>
          {attempt ? "Xem kết quả" : isClosed ? "Xem bài tập" : "Bắt đầu làm bài"}
          <RiArrowRightLine className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </article>
  );
}

export function StudentAssignmentList() {
  const { data, isLoading, isError, refetch } = useQuizAssignments();

  if (isLoading) return <FullPageSpinner label="Đang tải bài tập..." />;
  if (isError) {
    return (
      <ErrorState
        title="Không thể tải bài tập"
        description="Dữ liệu bài tập hiện chưa sẵn sàng. Vui lòng thử lại."
        onRetry={() => void refetch()}
      />
    );
  }

  const assignments = (data ?? []).filter((item) => item.status !== "draft");
  if (!assignments.length) {
    return (
      <EmptyState
        icon="ri-file-text-line"
        title="Chưa có bài tập nào"
        description="Bài tập được giao sẽ xuất hiện tại đây."
      />
    );
  }

  return (
    <section aria-label="Danh sách bài tập">
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{assignments.length}</span> bài tập được giao
        </p>
        <span className="hidden text-xs text-muted-foreground sm:inline">Sắp xếp theo hạn nộp</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assignments.map((assignment) => (
          <AssignmentCard key={assignment.id} assignment={assignment} />
        ))}
      </div>
    </section>
  );
}
