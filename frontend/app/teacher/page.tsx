import { AppShell } from "@/components/layout/app-shell";
import { TeacherCourseList } from "@/components/teacher/teacher-course-list";

export default function TeacherCoursesPage() {
  return (
    <AppShell
      role="teacher"
      title="Khóa học"
      description="Quản lý nội dung và theo dõi các khóa học của bạn."
    >
      <TeacherCourseList />
    </AppShell>
  );
}
