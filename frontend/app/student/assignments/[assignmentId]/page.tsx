import { QuizRunner } from "@/components/quiz/quiz-runner";

export default async function StudentAssignmentRoute({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  return <QuizRunner assignmentId={assignmentId} />;
}
