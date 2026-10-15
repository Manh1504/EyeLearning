import { AppShell } from "@/components/layout/app-shell";
import { StudentHome } from "@/components/student/student-home";

export default function StudentHomePage() {
  return (
    <AppShell
      role="student"
      title="Khóa học của tôi"
      description="Theo dõi tiến độ và tiếp tục học ngay tại nơi bạn dừng lại."
    >
      <StudentHome />
    </AppShell>
  );
}
