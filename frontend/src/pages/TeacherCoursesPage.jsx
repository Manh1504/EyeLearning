import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";

function fmtDate(value) {
  if (!value) return "Chưa có hoạt động";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function TeacherCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus({ message: "", kind: "" });
      setAccessDenied(false);
      try {
        const data = await requestJson(apiUrl("/courses/teacher/dashboard"));
        if (active) setCourses(data.courses || []);
      } catch (error) {
        if (!active) return;
        if ((error.message || "").toLowerCase().includes("quyền")) {
          setAccessDenied(true);
        } else {
          setStatus({ message: "Không thể tải dữ liệu. Vui lòng thử lại.", kind: "error" });
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <AppHeader active="courses" />
      <TeacherLayout>
        <Breadcrumbs items={[{ label: "Giảng viên", to: "/teacher" }, { label: "Khóa học" }]} />
        <PageHeader
          title="Khóa học"
          description="Quản lý nội dung, theo dõi hoạt động học tập và mở phân tích theo từng khóa học."
        />

        <section className="panel">
          <div className="section-header">
            <div>
              <h2>Khóa học của tôi</h2>
              <p className="muted">{loading ? "Đang tải..." : `${courses.length} khóa học`}</p>
            </div>
          </div>

          <div className="teacher-course-table-wrap">
            {loading && <div className="empty-state">Đang tải danh sách khóa học...</div>}
            {!loading && accessDenied && (
              <div className="empty-state">
                <h2>Bạn không có quyền truy cập nội dung này.</h2>
                <p>Hãy dùng đúng tài khoản giảng viên đã được phân công khóa học.</p>
              </div>
            )}
            {!loading && !accessDenied && courses.length > 0 && (
              <table className="analytics-table teacher-course-table">
                <thead>
                  <tr>
                    <th>Khóa học</th>
                    <th>Bài học</th>
                    <th>Học viên</th>
                    <th>Hoạt động gần nhất</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => (
                    <tr key={course.course_id}>
                      <td>
                        <strong>{course.course_title}</strong>
                        <div className="muted">{course.course_description || "Không có mô tả."}</div>
                      </td>
                      <td>{course.lesson_count}</td>
                      <td>{course.student_count}</td>
                      <td>{fmtDate(course.recent_activity_at)}</td>
                      <td>
                        <Link className="btn text" to={`/teacher/courses/${course.course_id}`}>Mở khóa học</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && !accessDenied && !courses.length && (
              <div className="empty-state">
                Chưa có khóa học được phân công.
              </div>
            )}
          </div>
        </section>

        {status.message ? <div className={`status-line ${status.kind}`.trim()}>{status.message}</div> : null}
      </TeacherLayout>
    </>
  );
}
