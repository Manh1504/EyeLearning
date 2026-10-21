"use client";

import { useMyEnrollments } from "@/hooks/use-student";
import { CourseBrowser, type CourseListItem } from "@/components/courses/course-browser";

export function StudentHome() {
  const { data: enrollments = [], isLoading, isError, refetch } = useMyEnrollments();

  const items: CourseListItem[] = enrollments
    .filter((enrollment) => enrollment.status !== "dropped")
    .map((enrollment) => ({
      id: enrollment.enrollmentId,
      title: enrollment.course.title,
      teacherName: enrollment.course.teacherName,
      moduleCount: enrollment.course.moduleCount,
      lessonCount: enrollment.course.lessonCount,
      enrolledAt: enrollment.enrolledAt,
      status: enrollment.status,
      href: `/student/courses/${enrollment.course.id}/prepare`,
    }));

  return (
    <CourseBrowser
      items={items}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      emptyTitle="Chưa có khóa học"
      emptyDescription="Tài khoản của bạn chưa được ghi danh vào khóa học nào."
    />
  );
}
