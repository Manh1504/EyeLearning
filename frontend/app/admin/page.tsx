import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CourseAssignment } from "@/components/admin/course-assignment";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function AdminPage() {
  return (
    <AppShell
      role="admin"
      title="Quản lý khóa học"
      description="Tạo, chỉnh sửa, xóa khóa học và phân công giảng viên phụ trách."
      actions={
        <Button asChild size="sm">
          <Link href="/admin/courses/c-new?new=1">
            <Icon name="ri-add-line" />
            Tạo khóa học
          </Link>
        </Button>
      }
    >
      <CourseAssignment />
    </AppShell>
  );
}
