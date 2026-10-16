"use client";

import Link from "next/link";
import { RiArrowRightLine, RiCheckLine, RiFileList3Line, RiTimeLine } from "@remixicon/react";
import { useQuizAssignments, useQuizAttempt } from "@/hooks/use-quiz";
import type { QuizAssignment } from "@/lib/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function LessonAssignmentCard({ assignment }: { assignment: QuizAssignment }) {
  const { data: attempt, isLoading } = useQuizAttempt(assignment.id);
  const href = attempt
    ? `/student/assignments/${assignment.id}/result`
    : `/student/assignments/${assignment.id}`;

  return (
    <article className="flex flex-col rounded-2xl border border-border/80 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:gap-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f1e6] text-[#36533a]">
        <RiFileList3Line className="size-5" />
      </span>
      <div className="mt-3 min-w-0 flex-1 sm:mt-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-foreground">{assignment.title}</h3>
          {!isLoading && attempt && <Badge variant="success"><RiCheckLine className="size-3" />Đã nộp</Badge>}
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{assignment.instructions}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <RiTimeLine className="size-3.5" />{assignment.durationMinutes} phút · {assignment.questions.length} câu
        </p>
      </div>
      <Button asChild size="sm" variant={attempt ? "outline" : "default"} className="mt-4 shrink-0 sm:mt-0">
        <Link href={href}>{attempt ? "Xem lại bài" : "Làm bài"}<RiArrowRightLine /></Link>
      </Button>
    </article>
  );
}

export function LessonAssignmentList({ lessonId }: { lessonId: string }) {
  const { data, isLoading } = useQuizAssignments();
  const assignments = (data ?? []).filter(
    (assignment) => assignment.lessonId === lessonId && assignment.status !== "draft",
  );

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;
  if (!assignments.length) return null;

  return (
    <section className="space-y-3" aria-labelledby="lesson-assignments-heading">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#52704f]">Bài tập của bài học</p>
        <h2 id="lesson-assignments-heading" className="mt-1 font-display text-xl">Bài trắc nghiệm</h2>
      </div>
      {assignments.map((assignment) => <LessonAssignmentCard key={assignment.id} assignment={assignment} />)}
    </section>
  );
}
