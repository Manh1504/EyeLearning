import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";

export default function TeacherClassesPage() {
  return (
    <>
      <AppHeader active="classes" />
      <TeacherLayout>
        <Breadcrumbs items={[{ label: "Giảng viên", to: "/teacher" }, { label: "Lớp học" }]} />
        <PageHeader
          title="Lớp học"
          description="Tổ chức học viên theo từng nhóm để theo dõi tiến độ và hoạt động học tập."
        />
        <section className="panel">
          <div className="empty-state">
            <h2>Chưa có lớp học</h2>
            <p>Tạo lớp học để tổ chức học viên và theo dõi tiến độ theo nhóm.</p>
          </div>
        </section>
      </TeacherLayout>
    </>
  );
}
