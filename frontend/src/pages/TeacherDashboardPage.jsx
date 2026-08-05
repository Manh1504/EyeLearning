import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader, Breadcrumbs, MetricStrip, PageHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";

function fmtPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function fmtDate(value) {
  if (!value) return "Chưa có hoạt động";
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
  return `/analytics?session_id=${encodeURIComponent(session.session_id)}&from=${encodeURIComponent("/teacher")}`;
}

export default function TeacherDashboardPage() {
  const [payload, setPayload] = useState(null);
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
        if (!active) return;
        setPayload(data);
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

  const metrics = loading
    ? []
    : [
        { label: "Khóa học", value: payload?.course_count ?? "-" },
        { label: "Học viên", value: payload?.student_count ?? "-" },
        { label: "Phiên học", value: payload?.session_count ?? "-" },
        { label: "Phiên có tracking", value: fmtPercent(payload?.valid_tracking_session_rate || 0) },
      ];
  const recentSessions = (payload?.recent_sessions || []).slice(0, 5);
  const backendAttentionItems = payload?.attention_items || [];
  const hasBackendTrackingWarning = backendAttentionItems.some((item) => String(`${item.key || ""} ${item.title || ""}`).toLowerCase().includes("tracking"));
  const showTrackingWarning = !loading && !hasBackendTrackingWarning && Number(payload?.session_count || 0) > 0 && Number(payload?.valid_tracking_session_rate || 0) < 0.5;
  const attentionItems = backendAttentionItems.map((item) => {
    if (String(`${item.key || ""} ${item.title || ""}`).toLowerCase().includes("tracking")) {
      return {
        ...item,
        title: "Tỷ lệ phiên có tracking còn thấp",
        detail: `Chỉ ${fmtPercent(payload?.valid_tracking_session_rate || 0)} phiên gần đây có dữ liệu tracking.`,
      };
    }
    return item;
  });

  return (
    <>
      <AppHeader active="overview" />
      <TeacherLayout>
        <Breadcrumbs items={[{ label: "Giảng viên", to: "/teacher" }, { label: "Tổng quan" }]} />
        <PageHeader
          title="Tổng quan"
          description="Theo dõi khóa học, hoạt động học tập và tín hiệu eye-tracking trong phạm vi được phân công."
        />

        {accessDenied && (
          <section className="panel">
            <div className="empty-state">
              <h2>Bạn không có quyền truy cập nội dung này.</h2>
              <p>Hãy dùng đúng tài khoản giảng viên đã được phân công khóa học.</p>
            </div>
          </section>
        )}

        {!accessDenied && loading && (
          <section className="panel">
            <div className="empty-state">Đang tải tổng quan giảng viên...</div>
          </section>
        )}

        {!accessDenied && !loading && (
          <>
            <MetricStrip metrics={metrics} />

            <section className="teacher-dashboard-grid">
              <article className="panel teacher-dashboard-panel teacher-courses-panel">
                <div className="section-header">
                  <div>
                    <h2>Khóa học của tôi</h2>
                    <p className="muted">{loading ? "Đang tải..." : `${payload?.courses?.length || 0} khóa học`}</p>
                  </div>
                  <Link className="btn secondary" to="/teacher/courses">Xem tất cả</Link>
                </div>
                <div className="teacher-course-card-list">
                  {(payload?.courses || []).map((course) => (
                    <article className="teacher-overview-card" key={course.course_id}>
                      <div className="teacher-course-main">
                        <div>
                          <strong>{course.course_title}</strong>
                          <p className="muted">{course.course_description || "Khóa học chưa có mô tả."}</p>
                        </div>
                        <Link className="btn secondary" to={`/teacher/courses/${course.course_id}`}>Mở khóa học</Link>
                      </div>
                      <div className="course-meta-badges">
                        <span className="meta-badge">{course.lesson_count} bài học</span>
                        <span className="meta-badge">{course.student_count} học viên</span>
                        <span className="meta-badge">{course.session_count} phiên học</span>
                      </div>
                      <div className="teacher-overview-card-footer">
                        <span className="muted">Hoạt động gần nhất: {fmtDate(course.recent_activity_at)}</span>
                      </div>
                    </article>
                  ))}
                  {!loading && !(payload?.courses || []).length && (
                    <div className="empty-state">
                      Chưa có khóa học được phân công.
                    </div>
                  )}
                </div>
              </article>

              <article className="panel teacher-dashboard-panel teacher-attention-panel">
                <div className="section-header">
                  <div>
                    <h2>Cần chú ý</h2>
                    <p className="muted">Những tín hiệu cần xem lại trong các khóa học được phân công.</p>
                  </div>
                </div>
                <div className="teacher-attention-list">
                  {showTrackingWarning && (
                    <div className="attention-item severity-warning">
                      <strong>Tỷ lệ phiên có tracking còn thấp</strong>
                      <span>Chỉ {fmtPercent(payload?.valid_tracking_session_rate || 0)} phiên gần đây có dữ liệu tracking.</span>
                    </div>
                  )}
                  {attentionItems.map((item) => (
                    <div className={`attention-item severity-${item.severity}`} key={item.key}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                  ))}
                  {!loading && !showTrackingWarning && !attentionItems.length && (
                    <div className="empty-state compact">Chưa có cảnh báo nào từ dữ liệu hiện tại.</div>
                  )}
                </div>
              </article>
            </section>

            <section className="teacher-dashboard-grid single">
              <article className="panel teacher-dashboard-panel">
                <div className="section-header">
                  <div>
                    <h2>Hoạt động gần đây</h2>
                    <p className="muted">Phiên học mới nhất trong các khóa học được phân công.</p>
                  </div>
                  <Link className="btn secondary" to="/teacher#sessions">Xem tất cả phiên học</Link>
                </div>
                <div className="teacher-session-table-wrap">
                  <table className="teacher-session-table">
                    <thead>
                      <tr>
                        <th>Học viên</th>
                        <th>Bài học</th>
                        <th>Thời gian</th>
                        <th>Dữ liệu tracking</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSessions.map((session) => (
                        <tr key={session.session_id}>
                          <td data-label="Học viên"><strong>{session.student_name || session.student_code || session.user_id}</strong></td>
                          <td data-label="Bài học">{session.item_title || "Chưa có bài học"}</td>
                          <td data-label="Thời gian">{fmtDate(session.started_at)}</td>
                          <td data-label="Dữ liệu tracking">
                            <span className="meta-badge">{session.tracking_points_count} mẫu</span>
                            <span className={`meta-badge ${session.has_tracking_data ? "tracking-ok" : "tracking-missing"}`}>
                              {session.has_tracking_data ? "Có tracking" : "Chưa có tracking"}
                            </span>
                          </td>
                          <td data-label="Thao tác">
                            <Link className="btn text" to={sessionAnalyticsHref(session)}>Xem phiên</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!loading && !recentSessions.length && (
                    <div className="empty-state">Chưa có phiên học nào trong phạm vi được phân công.</div>
                  )}
                </div>
              </article>
            </section>
          </>
        )}

        {status.message ? <div className={`status-line ${status.kind}`.trim()}>{status.message}</div> : null}
      </TeacherLayout>
    </>
  );
}
