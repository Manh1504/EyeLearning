import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { StudentHome } from "@/components/student/student-home";

export default function StudentHomePage() {
  return (
    <AppShell
      role="student"
      title="Khóa học của tôi"
      description="Mở khóa học và bắt đầu học ngay."
    >
      <Suspense fallback={null}>
        <StudentHome />
      </Suspense>
    </AppShell>
  );
}
