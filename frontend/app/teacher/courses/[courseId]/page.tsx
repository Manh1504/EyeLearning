import { CourseWorkspace } from "@/components/teacher/course-workspace";

export default async function TeacherCourseWorkspaceRoute({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <CourseWorkspace courseId={courseId} />;
}
