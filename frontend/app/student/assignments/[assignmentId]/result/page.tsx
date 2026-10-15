import { AppShell } from "@/components/layout/app-shell";
import { QuizReview } from "@/components/quiz/quiz-review";

export default async function StudentAssignmentResultRoute({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  return (
    <AppShell role="student" contentClassName="lg:pr-0">
      <QuizReview assignmentId={assignmentId} />
    </AppShell>
  );
}
