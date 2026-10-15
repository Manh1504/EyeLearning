import { AppShell } from "@/components/layout/app-shell";
import { TeacherAssignmentManager } from "@/components/quiz/teacher-assignment-manager";

export default function TeacherAssignmentsPage() {
  return (
    <AppShell
      role="teacher"
      title="Bài kiểm tra"
      description="Tạo và giao bài trắc nghiệm, thiết lập hạn nộp và chuẩn bị phản hồi rõ ràng cho học viên."
    >
      <TeacherAssignmentManager />
    </AppShell>
  );
}
