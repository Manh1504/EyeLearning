import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader, Breadcrumbs, MetricStrip, PageHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { formatPercent, formatSeconds, summarizeLanding } from "../lib/teacherAnalyticsPresentation.js";

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart}, ${timePart}`;
}

function sessionAnalyticsHref(session) {
  if (session.course_item_id && session.course_id) {
    return `/teacher/courses/${encodeURIComponent(session.course_id)}/lessons/${encodeURIComponent(session.course_item_id)}/analytics?tab=sessions`;
  }
  return `/analytics?session_id=${encodeURIComponent(session.session_id)}&from=${encodeURIComponent("/teacher/analytics")}`;
}

function trackingState(session) {
  if (!session.has_tracking_data) return "Chưa có tracking";
  if (Number(session.tracking_points_count || 0) > 0 && Number(session.tracking_points_count || 0) < 5) return "Tracking thấp";
  return "Có tracking";
}

export default function TeacherAnalyticsHubPage() {
  const [dashboard, setDashboard] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setAccessDenied(false);
      setError("");
      try {
        const dashboardData = await requestJson(apiUrl("/courses/teacher/dashboard"));
        const courseIds = (dashboardData.courses || []).map((course) => course.course_id);
        const analyticsRows = await Promise.all(courseIds.map((courseId) => requestJson(apiUrl(`/courses/teacher/${encodeURIComponent(courseId)}/analytics`))));
        if (!active) return;
        setDashboard(dashboardData);
        setCourses(analyticsRows);
      } catch (err) {
        if (!active) return;
        if ((err.message || "").toLowerCase().includes("quyền")) setAccessDenied(true);
        else setError("Không thể tải dữ liệu phân tích. Vui lòng thử lại.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const summary = summarizeLanding(courses);
  const metrics = loading
    ? []
    : [
        { label: "Khóa học có dữ liệu", value: courses.filter((course) => (course.lessons || []).some((lesson) => lesson.session_count > 0)).length },
        { label: "Tổng phiên học", value: summary.totalSessions },
        { label: "Phiên có dữ liệu", value: formatPercent(summary.validTrackingRate) },
        { label: "Phiên trung bình", value: formatSeconds(courses.flatMap((course) => course.lessons || []).filter((lesson) => lesson.average_session_duration_seconds != null).reduce((sum, lesson) => sum + Number(lesson.average_session_duration_seconds || 0), 0) / Math.max(1, courses.flatMap((course) => course.lessons || []).filter((lesson) => lesson.average_session_duration_seconds != null).length)) },
      ];
  const recentSessions = (dashboard?.recent_sessions || []).slice(0, 6);

  return (
    <>
      <AppHeader active="analytics" />
      <TeacherLayout>
        <Breadcrumbs items={[{ label: "Giáo viên", to: "/teacher" }, { label: "Phân tích" }]} />
        <PageHeader title="Phân tích" description="Theo dõi dữ liệu học tập và bản đồ nhiệt từ các bài học PDF đã phát sinh phiên học thật." />

        {loading && <section className="panel"><div className="empty-state">Đang tải dữ liệu phân tích...</div></section>}
        {!loading && accessDenied && <section className="panel"><div className="empty-state"><h2>Bạn không có quyền xem dữ liệu phân tích này.</h2><p>Hãy dùng đúng tài khoản giáo viên đã được phân công khóa học.</p></div></section>}
        {!loading && !accessDenied && error && <section className="panel"><div className="empty-state"><h2>Không thể tải dữ liệu phân tích.</h2><p>Vui lòng thử lại.</p></div></section>}

        {!loading && !accessDenied && !error && (
          <>
            <MetricStrip metrics={metrics} />
            {!courses.some((course) => (course.lessons || []).some((lesson) => lesson.session_count > 0)) && (
              <section className="panel">
                <div className="empty-state">
                  <h2>Chưa có dữ liệu phân tích</h2>
                  <p>Dữ liệu sẽ xuất hiện sau khi học viên hoàn thành phiên học có bật eye-tracking.</p>
                </div>
              </section>
            )}
            {courses.some((course) => (course.lessons || []).some((lesson) => lesson.session_count > 0)) && (
              <section className="panel">
                <div className="section-header">
                  <div>
                    <h2>Khóa học có dữ liệu</h2>
                    <p className="muted">Chỉ hiển thị bài học PDF đã có phiên học hoặc dữ liệu gaze hợp lệ.</p>
                  </div>
                </div>
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Khóa học</th>
                      <th>Bài học có dữ liệu</th>
                      <th>Tổng phiên học</th>
                      <th>Phiên có dữ liệu</th>
                      <th>Hoạt động gần nhất</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course) => {
                      const lessons = (course.lessons || []).filter((lesson) => lesson.session_count > 0);
                      if (!lessons.length) return null;
                      const recent = lessons.reduce((best, lesson) => (!best || (lesson.last_activity_at && lesson.last_activity_at > best) ? lesson.last_activity_at : best), null);
                      return (
                        <tr key={course.course_id}>
                          <td><strong>{course.course_title}</strong></td>
                          <td>{lessons.length}</td>
                          <td>{course.total_sessions || 0}</td>
                          <td>{formatPercent(course.valid_tracking_rate)}</td>
                          <td>{fmtDate(recent)}</td>
                          <td><Link className="btn text" to={`/teacher/courses/${course.course_id}?tab=analytics`}>Xem phân tích</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}
            <section className="panel">
              <div className="section-header">
                <div>
                  <h2>Phiên học gần đây</h2>
                  <p className="muted">Các phiên học gần nhất có phát sinh trong khóa học được phân công.</p>
                </div>
                <Link className="btn secondary" to="/teacher#sessions">Xem tất cả phiên học</Link>
              </div>
              {!recentSessions.length && (
                <div className="empty-state compact">
                  <h2>Chưa có phiên học</h2>
                  <p>Các phiên học sẽ xuất hiện sau khi học viên bắt đầu bài học.</p>
                </div>
              )}
              {!!recentSessions.length && (
                <div className="teacher-session-table-wrap">
                  <table className="teacher-session-table analytics-landing-session-table">
                    <thead>
                      <tr>
                        <th>Học viên</th>
                        <th>Bài học</th>
                        <th>Bắt đầu</th>
                        <th>Mẫu tracking hợp lệ</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSessions.map((session) => {
                        const state = trackingState(session);
                        return (
                          <tr key={session.session_id}>
                            <td data-label="Học viên"><strong>{session.student_name || session.student_code || session.user_id}</strong></td>
                            <td data-label="Bài học">{session.item_title || "Bài học"}</td>
                            <td data-label="Bắt đầu">{fmtDate(session.started_at)}</td>
                            <td data-label="Mẫu tracking hợp lệ"><span className="meta-badge">{session.tracking_points_count || 0} mẫu</span></td>
                            <td data-label="Trạng thái">
                              <span className={`meta-badge ${state === "Có tracking" ? "tracking-ok" : state === "Tracking thấp" ? "tracking-low" : "tracking-missing"}`}>
                                {state}
                              </span>
                            </td>
                            <td data-label="Thao tác"><Link className="btn text" to={sessionAnalyticsHref(session)}>Xem phiên</Link></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </TeacherLayout>
    </>
  );
}
