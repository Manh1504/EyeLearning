import { AppShell } from "@/components/layout/app-shell";
import { StudentAssignmentList } from "@/components/quiz/student-assignment-list";

export default function StudentAssignmentsPage() {
  return (
    <AppShell
      role="student"
      title="Bài tập của tôi"
      description="Theo dõi bài được giao, hạn nộp và xem lại kết quả trong một nơi."
    >
      <StudentAssignmentList />
    </AppShell>
  );
}
