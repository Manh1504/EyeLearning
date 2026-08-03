import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppShell.jsx";
import { AdminSidebar } from "../components/AdminShell.jsx";
import { AdminLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { LESSON_ID, getSessionContext, setSessionContext } from "../lib/session.js";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function learnerLabel(session) {
  if (session.session_type === "admin_test") return session.full_name || "Quản trị viên kiểm thử";
  const name = session.full_name || "Người học";
  return session.student_code ? `${name} (${session.student_code})` : name;
}

function sessionStatusLabel(session) {
  if (session.session_type === "admin_test") return "Kiểm thử";
  if (session.ended_at) return "Đã kết thúc";
  return "Đang mở";
}

function healthStatus(ok) {
  if (ok === true) return "Hoạt động";
  if (ok === false) return "Gián đoạn";
  return "Chưa xác định";
}

function RecentSessionsTable({ sessions, loading, onRecalculate, recalculating }) {
  if (loading) return <div className="empty-state">Đang tải phiên học gần đây...</div>;
  if (!sessions.length) return <div className="empty-state">Chưa có phiên học nào được ghi nhận.</div>;

  return (
    <div className="admin-session-table-wrap">
      <table className="admin-session-table">
        <thead>
          <tr>
            <th>Người học</th>
            <th>Bài học</th>
            <th>Thời gian</th>
            <th>Mẫu gaze</th>
            <th>Trạng thái</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.session_id}>
              <td>
                <strong>{learnerLabel(session)}</strong>
                <span>{session.session_type === "admin_test" ? "Dữ liệu kiểm thử" : session.student_code || "Không có mã"}</span>
              </td>
              <td>{session.lesson_id || "-"}</td>
              <td>{formatDate(session.started_at)}</td>
              <td>{session.tracking_points_count ?? 0}</td>
              <td>{sessionStatusLabel(session)}</td>
              <td>
                <div className="table-actions">
                  <a className="btn text" href={`/analytics?session_id=${encodeURIComponent(session.session_id)}&from=admin-sessions`}>
                    Xem chi tiết
                  </a>
                  <button
                    className="btn text"
                    type="button"
                    disabled={recalculating === session.session_id}
                    onClick={() => onRecalculate(session.session_id)}
                  >
                    Tính lại
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScopeManagement({ onSaved, setStatus }) {
  const [teacherId, setTeacherId] = useState("");
  const [teacherCourseId, setTeacherCourseId] = useState("C001");
  const [studentId, setStudentId] = useState("");
  const [studentCourseId, setStudentCourseId] = useState("C001");
  const [saving, setSaving] = useState("");

  async function submit(endpoint, body, label) {
    setSaving(label);
    setStatus(`Đang cập nhật ${label}...`);
    try {
      await requestJson(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus(`Đã cập nhật ${label}.`, "ok");
      await onSaved();
    } catch (error) {
      setStatus(`Không thể cập nhật ${label}: ${error.message}`, "error");
    } finally {
      setSaving("");
    }
  }

  async function remove(endpoint, label) {
    setSaving(label);
    setStatus(`Đang gỡ ${label}...`);
    try {
      await requestJson(apiUrl(endpoint), { method: "DELETE" });
      setStatus(`Đã gỡ ${label}.`, "ok");
      await onSaved();
    } catch (error) {
      setStatus(`Không thể gỡ ${label}: ${error.message}`, "error");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="scope-management">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit("/courses/teacher-assignments", { teacher_id: teacherId.trim(), course_id: teacherCourseId.trim() }, "phân công giảng viên");
        }}
      >
        <h3>Phân công giảng viên</h3>
        <div className="scope-form-grid">
          <div className="field compact-field">
            <label htmlFor="teacherId">Teacher ID</label>
            <input id="teacherId" value={teacherId} onChange={(event) => setTeacherId(event.target.value)} required />
          </div>
          <div className="field compact-field">
            <label htmlFor="teacherCourseId">Course ID</label>
            <input id="teacherCourseId" value={teacherCourseId} onChange={(event) => setTeacherCourseId(event.target.value)} required />
          </div>
        </div>
        <div className="table-actions">
          <button className="btn primary" type="submit" disabled={saving !== ""}>Gán</button>
          <button
            className="btn secondary"
            type="button"
            disabled={saving !== "" || !teacherId.trim() || !teacherCourseId.trim()}
            onClick={() => remove(`/courses/teacher-assignments/${encodeURIComponent(teacherId.trim())}/${encodeURIComponent(teacherCourseId.trim())}`, "phân công giảng viên")}
          >
            Gỡ
          </button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit("/courses/enrollments", { student_id: studentId.trim(), course_id: studentCourseId.trim(), status: "active" }, "ghi danh học sinh");
        }}
      >
        <h3>Ghi danh học sinh</h3>
        <div className="scope-form-grid">
          <div className="field compact-field">
            <label htmlFor="studentId">Student user ID</label>
            <input id="studentId" value={studentId} onChange={(event) => setStudentId(event.target.value)} required />
          </div>
          <div className="field compact-field">
            <label htmlFor="studentCourseId">Course ID</label>
            <input id="studentCourseId" value={studentCourseId} onChange={(event) => setStudentCourseId(event.target.value)} required />
          </div>
        </div>
        <div className="table-actions">
          <button className="btn primary" type="submit" disabled={saving !== ""}>Ghi danh</button>
          <button
            className="btn secondary"
            type="button"
            disabled={saving !== "" || !studentId.trim() || !studentCourseId.trim()}
            onClick={() => remove(`/courses/enrollments/${encodeURIComponent(studentId.trim())}/${encodeURIComponent(studentCourseId.trim())}`, "ghi danh học sinh")}
          >
            Gỡ
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const context = getSessionContext();
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatusState] = useState({ message: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(null);

  const setStatus = (message, kind = "") => setStatusState({ message, kind });

  async function startAdminTrial() {
    const adminUserId = `U_ADMIN_${Date.now()}`;
    const sessionId = `S_admin_test_${Date.now()}`;
    setLoading(true);
    setStatus("Đang tạo phiên học thử cho quản trị viên...");
    try {
      const session = await requestJson(apiUrl("/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: adminUserId,
          full_name: context.full_name || "Quản trị viên ELA",
          role: "admin",
          session_type: "admin_test",
          lesson_id: LESSON_ID,
          is_fullscreen: Boolean(document.fullscreenElement),
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
        }),
      });
      setSessionContext({
        role: "admin",
        full_name: context.full_name || "Quản trị viên ELA",
        student_code: "",
        session_type: "admin_test",
        course_id: session.course_id || "",
        module_id: session.module_id || "",
        lesson_id: session.lesson_id || LESSON_ID,
        activity_id: session.activity_id || "",
        content_version_id: session.content_version_id || "",
        session_id: session.session_id || sessionId,
      });
      navigate("/camera-check");
    } catch (error) {
      setStatus(`Không thể tạo phiên học thử: ${error.message}`, "error");
      setLoading(false);
    }
  }

  async function loadOverview() {
    setLoading(true);
    setStatus("Đang tải dashboard quản trị...");
    try {
      const data = await requestJson(apiUrl("/admin/overview"));
      setOverview(data);
      setStatus("Đã tải dashboard quản trị.", "ok");
    } catch (error) {
      setStatus(`Không thể tải dashboard quản trị: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recalculateSession(sessionId) {
    setRecalculating(sessionId);
    setStatus(`Đang tính lại chỉ số cho ${sessionId}...`);
    try {
      await requestJson(apiUrl(`/metrics/recalculate/${encodeURIComponent(sessionId)}`), { method: "POST" });
      setStatus("Đã tính lại chỉ số.", "ok");
      await loadOverview();
    } catch (error) {
      setStatus(`Không thể tính lại chỉ số: ${error.message}`, "error");
    } finally {
      setRecalculating(null);
    }
  }

  const productionSessions = (overview?.recent_sessions || []).filter((session) => session.session_type === "student_learning");
  const testSessions = (overview?.recent_sessions || []).filter((session) => session.session_type === "admin_test");
  const sessions = productionSessions.filter(
    (session) => !query.trim() || session.session_id.toLowerCase().includes(query.trim().toLowerCase())
  );
  const counts = overview?.counts || {};

  return (
    <>
    <AppHeader active="home" />
    <AdminLayout className="admin-dashboard">
      <AdminSidebar active="overview" />

      <div className="dashboard-workspace">
        <header className="dashboard-hero" id="overview">
          <div>
            <div className="course-kicker">ELA Admin</div>
            <h1>Tổng quan quản trị</h1>
            <p className="muted">Theo dõi hoạt động người dùng, phiên học và trạng thái vận hành của ELA.</p>
          </div>
          <div className="page-actions">
            <button className="btn secondary" type="button" disabled={loading} onClick={startAdminTrial}>Học thử với live heatmap</button>
            <button className="btn primary" type="button" disabled={loading} onClick={loadOverview}>Làm mới</button>
          </div>
        </header>

        <section className="metric-strip admin-metric-strip" aria-label="Tổng quan quản trị">
          <div><span>Tổng phiên học</span><strong>{counts.sessions ?? "-"}</strong></div>
          <div><span>Tổng giảng viên</span><strong>{counts.teachers ?? "-"}</strong></div>
          <div><span>Tổng học sinh</span><strong>{counts.students ?? "-"}</strong></div>
          <div><span>Tổng mẫu ánh nhìn</span><strong>{counts.tracking_points ?? "-"}</strong></div>
        </section>

        <section className="admin-overview-grid" id="sessions">
          <article className="panel recent-panel admin-recent-sessions">
            <div className="section-header">
              <div>
                <h2>Phiên học gần đây</h2>
                <p className="muted">Chỉ hiển thị phiên học chính thức của học sinh. Phiên kiểm thử nằm trong khu Kiểm thử eye-tracking.</p>
              </div>
              <button className="btn secondary" type="button" disabled={!query} onClick={() => setQuery("")}>Xóa tìm kiếm</button>
            </div>
            <div className="field compact-field admin-session-search">
              <label htmlFor="sessionSearch">Tìm mã phiên</label>
              <input id="sessionSearch" placeholder="S_..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <RecentSessionsTable
              sessions={sessions}
              loading={loading}
              onRecalculate={recalculateSession}
              recalculating={recalculating}
            />
          </article>

          <article className="panel recent-panel system-health-panel" id="system">
            <div className="section-header">
              <div>
                <h2>Trạng thái hệ thống</h2>
                <p className="muted">Kiểm tra gần nhất: {formatDate(new Date())}</p>
              </div>
            </div>
            <div className="system-status-list">
              <div><span>API hệ thống</span><strong>{healthStatus(overview?.system_health?.api?.ok)}</strong></div>
              <div><span>Cơ sở dữ liệu</span><strong>{healthStatus(overview?.system_health?.db_schema)}</strong></div>
              <div><span>Dịch vụ eye-tracking</span><strong>{healthStatus(overview?.system_health?.ai_service?.ok)}</strong></div>
            </div>
          </article>
        </section>

        <section className="admin-secondary-grid" id="management">
          <article className="panel recent-panel" id="trial">
            <div className="section-header">
              <div>
                <h2>Kiểm thử eye-tracking</h2>
                <p className="muted">
                  Tạo phiên kiểm thử riêng để kiểm tra calibration, tracking và live heatmap. Dữ liệu này không nằm trong danh sách phiên học chính thức.
                </p>
              </div>
              <button className="btn primary" type="button" disabled={loading} onClick={startAdminTrial}>
                Bắt đầu kiểm thử
              </button>
            </div>
            <div className="test-session-list">
              {!testSessions.length && <div className="empty-state compact">Chưa có phiên kiểm thử gần đây.</div>}
              {testSessions.slice(0, 3).map((session) => (
                <div className="test-session-row" key={session.session_id}>
                  <div>
                    <strong>{session.lesson_id || "Bài kiểm thử"}</strong>
                    <span>{formatDate(session.started_at)} · {session.tracking_points_count ?? 0} mẫu gaze</span>
                  </div>
                  <a className="btn text" href={`/analytics?session_id=${encodeURIComponent(session.session_id)}&from=${encodeURIComponent("/admin#trial")}`}>
                    Xem kỹ thuật
                  </a>
                </div>
              ))}
            </div>
          </article>

          <article className="panel recent-panel admin-course-management" id="courses">
            <div className="section-header">
              <div>
                <h2>Khóa học và bài học</h2>
                <p className="muted">Quản lý phân công và ghi danh bằng dữ liệu thật trong backend.</p>
              </div>
            </div>
            <div className="system-status-list">
              <div><span>Bài học</span><strong>{counts.lessons ?? "-"}</strong></div>
              <div><span>Phiên học chính thức</span><strong>{counts.sessions ?? "-"}</strong></div>
              <div><span>Phiên kiểm thử admin</span><strong>{counts.admin_test_sessions ?? "-"}</strong></div>
            </div>
            <ScopeManagement onSaved={loadOverview} setStatus={setStatus} />
          </article>

          <article className="panel recent-panel" id="users">
            <div className="section-header">
              <div>
                <h2>Người dùng</h2>
                <p className="muted">Chỉ hiển thị số lượng hiện backend hỗ trợ đọc.</p>
              </div>
            </div>
            <div className="system-status-list">
              <div><span>Tất cả người dùng</span><strong>{counts.users ?? "-"}</strong></div>
              <div><span>Học sinh</span><strong>{counts.students ?? "-"}</strong></div>
              <div><span>Giảng viên</span><strong>{counts.teachers ?? "-"}</strong></div>
            </div>
          </article>
        </section>

        <section className="panel metrics-section admin-raw-panel">
          <details className="debug-panel">
            <summary>Phản hồi kỹ thuật dashboard</summary>
            <pre>{overview ? JSON.stringify(overview, null, 2) : "Chưa có phản hồi."}</pre>
          </details>
          <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
        </section>
      </div>
    </AdminLayout>
    </>
  );
}
