import { Suspense } from "react";
import { LearningReader } from "@/components/student/learning-reader";

export default async function CourseLearningRoute({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <Suspense fallback={null}>
      <LearningReader courseId={courseId} />
    </Suspense>
  );
}
