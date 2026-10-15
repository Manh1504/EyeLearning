import { AppShell } from "@/components/layout/app-shell";
import { CourseAssignment } from "@/components/admin/course-assignment";

export default function AdminPage() {
  return (
    <AppShell
      role="admin"
      title="Phân công giảng viên"
      description="Chọn khóa học để xem chủ sở hữu, thêm giảng viên hỗ trợ hoặc gỡ phân công."
    >
      <CourseAssignment />
    </AppShell>
  );
}
