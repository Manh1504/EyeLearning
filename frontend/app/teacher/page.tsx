import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { TeacherCourseList } from "@/components/teacher/teacher-course-list";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function TeacherCoursesPage() {
  return (
    <AppShell
      role="teacher"
      title="Khóa học"
      description="Danh sách các khóa học bạn phụ trách."
      actions={
        <Button asChild size="sm">
          <Link href="/teacher/courses/c-new?new=1">
            <Icon name="ri-add-line" />
            Tạo khóa học
          </Link>
        </Button>
      }
    >
      <Suspense fallback={null}>
        <TeacherCourseList />
      </Suspense>
    </AppShell>
  );
}
