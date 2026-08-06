import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHeader, PageHeader } from "../components/AppShell.jsx";
import { AdminSidebar } from "../components/AdminShell.jsx";
import { AdminLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { clearSessionContext, setSessionContext } from "../lib/session.js";

const STATUS_LABELS = {
  preparing: "Đang chuẩn bị",
  validating: "Đang kiểm tra",
  learning: "Đang học",
  finished: "Đã hoàn thành",
  abandoned: "Đã thoát",
  failed: "Thất bại",
  cancelled: "Đã hủy",
};

const SESSION_TYPE_LABELS = {
  student_learning: "Phiên học chính thức",
  admin_test: "Phiên kiểm thử admin",
  legacy_unknown: "Phiên cũ",
};

function formatDate(value) {
  if (!value) return "Chưa ghi nhận";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function friendlyError(error, fallback) {
  console.error(error);
  return fallback;
}

function sessionStatusLabel(session) {
  return STATUS_LABELS[session?.status] || (session?.ended_at ? "Đã hoàn thành" : "Đang xử lý");
}

function sessionTypeLabel(session) {
  return SESSION_TYPE_LABELS[session?.session_type || "student_learning"] || "Không xác định";
}

function shortSessionId(sessionId) {
  if (!sessionId) return "Không xác định";
  return sessionId.length > 16 ? `${sessionId.slice(0, 8)}...${sessionId.slice(-5)}` : sessionId;
}

function lessonLabel(session) {
  return session?.item_title || session?.lesson_title || session?.course_item_id || session?.lesson_id || "Không xác định";
}

function canAnalyzeSession(session) {
  return (session?.tracking_points_count || 0) > 0 && Boolean(session?.course_item_id || session?.lesson_id);
}

function isRecentlyActive(session, now = Date.now()) {
  if (!session || session.ended_at || ["finished", "abandoned", "failed"].includes(session.status)) return false;
  const started = session.started_at ? new Date(session.started_at).getTime() : 0;
  if (!started) return false;
  return now - started <= 30 * 60 * 1000;
}

function healthStatus(ok) {
  if (ok === true) return "Hoạt động";
  if (ok === false) return "Không khả dụng";
  return "Chưa kiểm tra";
}

function learnerLabel(session) {
  const name = session.full_name || session.student_name || session.user_id || "Người dùng";
  return session.student_code ? `${name} (${session.student_code})` : name;
}

function useAdminOverview() {
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");

  async function load() {
    setState("loading");
    setMessage("");
    try {
      setOverview(await requestJson(apiUrl("/admin/overview")));
      setState("success");
    } catch (error) {
      setMessage(friendlyError(error, "Không thể tải dữ liệu quản trị. Hãy kiểm tra trạng thái hệ thống rồi thử lại."));
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { overview, state, message, reload: load };
}

function AdminChrome({ active, title, description, actions, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <>
      <AppHeader
        active="home"
        sidebarToggle={{
          open: sidebarOpen,
          controls: "admin-sidebar",
          label: "Mở điều hướng quản trị",
          onToggle: () => setSidebarOpen((value) => !value),
        }}
      />
      <AdminLayout className="admin-dashboard">
        <AdminSidebar active={active} mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="dashboard-workspace admin-module-page">
          <PageHeader title={title} description={description} actions={actions} />
          {children}
        </div>
      </AdminLayout>
    </>
  );
}

function LoadingState({ label = "Đang tải dữ liệu..." }) {
  return <div className="admin-state-card"><div className="skeleton-card"></div><p>{label}</p></div>;
}

function ErrorState({ title = "Không thể tải dữ liệu", body, onRetry }) {
  return (
    <div className="empty-state layout-surface admin-state-card">
      <h2>{title}</h2>
      <p>{body}</p>
      {onRetry ? <button className="btn secondary" type="button" onClick={onRetry}>Thử lại</button> : null}
    </div>
  );
}

function EmptyModuleState({ title, body, actions = null }) {
  return (
    <div className="empty-state layout-surface admin-state-card">
      <h2>{title}</h2>
      <p>{body}</p>
      {actions}
    </div>
  );
}

function SessionTable({ sessions, compact = false }) {
  if (!sessions.length) {
    return <EmptyModuleState title="Chưa có phiên phù hợp" body="Không tìm thấy phiên nào theo bộ lọc hiện tại." />;
  }
  return (
    <div className="admin-session-table-wrap">
      <table className="admin-session-table">
        <thead>
          <tr>
            <th>Người dùng</th>
            <th>Loại phiên</th>
            <th>Bài học</th>
            <th>Bắt đầu</th>
            <th>Mẫu gaze</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.session_id}>
              <td><strong>{learnerLabel(session)}</strong><span>{shortSessionId(session.session_id)}</span></td>
              <td><span className="admin-session-type">{sessionTypeLabel(session)}</span></td>
              <td>{lessonLabel(session)}</td>
              <td>{formatDate(session.started_at)}</td>
              <td>{session.tracking_points_count ?? 0}</td>
              <td><span className={`admin-status-pill state-${session.status || "unknown"}`}>{sessionStatusLabel(session)}</span></td>
              <td>
                <div className="table-actions">
                  <Link className="btn text" to={`/admin/sessions/${encodeURIComponent(session.session_id)}`}>Chi tiết</Link>
                  {!compact && (
                    canAnalyzeSession(session)
                      ? <Link className="btn text" to={`/admin/analytics?sessionId=${encodeURIComponent(session.session_id)}`}>Phân tích</Link>
                      : <button className="btn text" type="button" disabled title="Cần có mẫu gaze và ngữ cảnh bài học hợp lệ">Phân tích</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { overview, state, message, reload } = useAdminOverview();
  const counts = overview?.counts || {};
  const recent = (overview?.recent_sessions || []).filter((session) => session.session_type !== "admin_test").slice(0, 8);
  const activeRecentSessions = recent.filter((session) => isRecentlyActive(session));
  const activeSessions = activeRecentSessions.length;
  const activeStudents = new Set(activeRecentSessions.map((session) => session.user_id).filter(Boolean)).size;
  const alerts = [];
  if (overview?.system_health?.api?.ok === false) alerts.push({ text: "API hệ thống không phản hồi ổn định.", to: "/admin/system" });
  if (overview?.system_health?.ai_service?.ok === false) alerts.push({ text: "Dịch vụ eye-tracking không khả dụng.", to: "/admin/system" });
  const zeroGaze = recent.find((session) => (session.tracking_points_count || 0) === 0);
  if (zeroGaze) alerts.push({ text: "Có phiên gần đây chưa ghi nhận mẫu gaze.", to: "/admin/sessions?gaze=without" });

  return (
    <AdminChrome
      active="overview"
      title="Tổng quan quản trị"
      description="Tóm tắt vận hành hệ thống GazeEdu, phiên học gần đây và cảnh báo quan trọng."
      actions={<button className="btn secondary" type="button" onClick={reload}>Làm mới</button>}
    >
      {state === "loading" && <LoadingState label="Đang tải tổng quan quản trị..." />}
      {state === "error" && <ErrorState body={message} onRetry={reload} />}
      {state === "success" && (
        <>
          <section className="metric-strip admin-metric-strip">
            <div><span>Tổng phiên học</span><strong>{counts.sessions ?? 0}</strong></div>
            <div><span>Phiên đang hoạt động</span><strong>{activeSessions}</strong></div>
            <div><span>Học viên đang hoạt động</span><strong>{activeStudents}</strong></div>
            <div><span>Mẫu gaze hôm nay</span><strong>{counts.tracking_points_today ?? 0}</strong></div>
          </section>
          <section className="panel admin-quick-actions-panel">
            <div className="section-header"><h2>Thao tác nhanh</h2></div>
            <div className="admin-quick-actions">
              <Link className="btn primary" to="/admin/eye-tracking-test">Bắt đầu kiểm thử</Link>
              <Link className="btn secondary" to="/admin/sessions">Xem phiên học</Link>
              <Link className="btn secondary" to="/admin/analytics">Xem phân tích</Link>
            </div>
          </section>
          <section className="admin-overview-grid">
            <article className="panel">
              <div className="section-header"><h2>Cảnh báo quan trọng</h2></div>
              {alerts.length ? alerts.slice(0, 4).map((alert) => (
                <Link className="attention-item admin-alert-link" key={alert.text} to={alert.to}><strong>{alert.text}</strong><span>Xem chi tiết</span></Link>
              )) : (
                <div className="attention-item success">
                  <strong>Không có cảnh báo cần xử lý</strong>
                  <span>Chưa phát hiện bất thường quan trọng trong các tín hiệu vận hành gần đây.</span>
                </div>
              )}
            </article>
            <article className="panel">
              <div className="section-header"><h2>Sức khỏe hệ thống</h2></div>
              <div className="system-status-list">
                <div><span>API hệ thống</span><strong>{healthStatus(overview?.system_health?.api?.ok)}</strong></div>
                <div><span>Cơ sở dữ liệu</span><strong>{healthStatus(overview?.system_health?.db_schema)}</strong></div>
                <div><span>Dịch vụ eye-tracking</span><strong>{healthStatus(overview?.system_health?.ai_service?.ok)}</strong></div>
              </div>
            </article>
          </section>
          <section className="panel recent-panel">
            <div className="section-header">
              <div><h2>Phiên gần đây</h2><p className="muted">Hiển thị các phiên gần nhất để theo dõi vận hành nhanh.</p></div>
              <Link className="btn secondary" to="/admin/sessions">Xem tất cả phiên</Link>
            </div>
            <SessionTable sessions={recent.slice(0, 8)} compact />
          </section>
        </>
      )}
    </AdminChrome>
  );
}

export function AdminSessionsPage() {
  const { overview, state, message, reload } = useAdminOverview();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sessionType, setSessionType] = useState(searchParams.get("type") || "");
  const [courseFilter, setCourseFilter] = useState("");
  const [lessonFilter, setLessonFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [gazeFilter, setGazeFilter] = useState(searchParams.get("gaze") || "all");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const sessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return (overview?.recent_sessions || [])
      .filter((session) => !q || [session.session_id, session.user_id, session.full_name, session.student_code, session.lesson_id, session.course_item_id].some((value) => String(value || "").toLowerCase().includes(q)))
      .filter((session) => !status || (session.status || "") === status)
      .filter((session) => !sessionType || (session.session_type || "student_learning") === sessionType)
      .filter((session) => !courseFilter || String(session.course_id || "").toLowerCase().includes(courseFilter.trim().toLowerCase()))
      .filter((session) => !lessonFilter || [session.lesson_id, session.course_item_id, session.item_title].some((value) => String(value || "").toLowerCase().includes(lessonFilter.trim().toLowerCase())))
      .filter((session) => !userFilter || [session.user_id, session.full_name, session.student_code].some((value) => String(value || "").toLowerCase().includes(userFilter.trim().toLowerCase())))
      .filter((session) => {
        const started = session.started_at ? new Date(session.started_at).getTime() : 0;
        if (fromMs && started < fromMs) return false;
        if (toMs && started > toMs) return false;
        return true;
      })
      .filter((session) => gazeFilter === "all" || (gazeFilter === "with" ? (session.tracking_points_count || 0) > 0 : (session.tracking_points_count || 0) === 0))
      .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  }, [overview, query, status, sessionType, courseFilter, lessonFilter, userFilter, dateFrom, dateTo, gazeFilter]);
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const visible = sessions.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query, status, sessionType, courseFilter, lessonFilter, userFilter, dateFrom, dateTo, gazeFilter]);
  useEffect(() => {
    const next = new URLSearchParams();
    if (gazeFilter !== "all") next.set("gaze", gazeFilter);
    if (sessionType) next.set("type", sessionType);
    setSearchParams(next, { replace: true });
  }, [gazeFilter, sessionType, setSearchParams]);

  return (
    <AdminChrome active="sessions" title="Phiên học" description="Tra cứu các phiên gần đây, phân biệt phiên học chính thức và phiên kiểm thử.">
      {state === "loading" && <LoadingState label="Đang tải danh sách phiên..." />}
      {state === "error" && <ErrorState body={message} onRetry={reload} />}
      {state === "success" && (
        <>
          <section className="panel admin-filter-panel">
            <label><span>Tìm kiếm</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Session ID, người dùng, bài học..." /></label>
            <label><span>Trạng thái</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả</option><option value="preparing">Đang chuẩn bị</option><option value="validating">Đang kiểm tra</option><option value="learning">Đang học</option><option value="finished">Hoàn thành</option><option value="abandoned">Đã thoát</option><option value="failed">Lỗi</option></select></label>
            <label><span>Loại phiên</span><select value={sessionType} onChange={(e) => setSessionType(e.target.value)}><option value="">Tất cả</option><option value="student_learning">Phiên học chính thức</option><option value="admin_test">Phiên kiểm thử admin</option></select></label>
            <label><span>Dữ liệu gaze</span><select value={gazeFilter} onChange={(e) => setGazeFilter(e.target.value)}><option value="all">Tất cả</option><option value="with">Có mẫu gaze</option><option value="without">Không có mẫu gaze</option></select></label>
            <details className="admin-advanced-filters">
              <summary>Bộ lọc nâng cao</summary>
              <div>
                <label><span>Khóa học</span><input value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} placeholder="Mã khóa học" /></label>
                <label><span>Bài học</span><input value={lessonFilter} onChange={(e) => setLessonFilter(e.target.value)} placeholder="Mã hoặc tên bài học" /></label>
                <label><span>Người dùng</span><input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="Mã hoặc tên người dùng" /></label>
                <label><span>Từ ngày</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
                <label><span>Đến ngày</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
              </div>
            </details>
            <button className="btn secondary" type="button" onClick={() => { setQuery(""); setStatus(""); setSessionType(""); setCourseFilter(""); setLessonFilter(""); setUserFilter(""); setDateFrom(""); setDateTo(""); setGazeFilter("all"); }}>Xóa lọc</button>
          </section>
          <div className="section-header admin-list-heading"><h2>Các phiên gần đây</h2><p className="muted">{sessions.length} phiên phù hợp với bộ lọc hiện tại.</p></div>
          <SessionTable sessions={visible} />
          {sessions.length > pageSize && <div className="admin-pagination">
            <button className="btn secondary" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button>
            <span>Trang {page}/{totalPages}</span>
            <button className="btn secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Sau</button>
          </div>}
        </>
      )}
    </AdminChrome>
  );
}

export function AdminSessionDetailPage() {
  const { sessionId = "" } = useParams();
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  async function load() {
    setState("loading");
    try {
      const [sessionData, summaryData] = await Promise.all([
        requestJson(apiUrl(`/sessions/${encodeURIComponent(sessionId)}`)),
        requestJson(apiUrl(`/sessions/${encodeURIComponent(sessionId)}/tracking-summary`)).catch(() => null),
      ]);
      setSession(sessionData);
      setSummary(summaryData);
      setState("success");
    } catch (error) {
      setMessage(friendlyError(error, "Không thể tải chi tiết phiên. Phiên có thể không tồn tại hoặc bạn không có quyền xem."));
      setState("error");
    }
  }
  useEffect(() => { load(); }, [sessionId]);
  return (
    <AdminChrome active="sessions" title="Chi tiết phiên" description={sessionId} actions={<Link className="btn secondary" to="/admin/sessions">Quay lại phiên học</Link>}>
      {state === "loading" && <LoadingState />}
      {state === "error" && <ErrorState body={message} onRetry={load} />}
      {state === "success" && (
        <section className="panel admin-detail-grid">
          <div><span>Trạng thái</span><strong>{sessionStatusLabel(session)}</strong></div>
          <div><span>Loại phiên</span><strong>{sessionTypeLabel(session)}</strong></div>
          <div><span>Mã bài học</span><strong>{session.course_item_id || "Không xác định"}</strong></div>
          <div><span>Phiên bản tài liệu PDF</span><strong>{session.pdf_document_version || "Chưa ghi nhận"}</strong></div>
          <div><span>Bắt đầu</span><strong>{formatDate(session.started_at)}</strong></div>
          <div><span>Kết thúc</span><strong>{formatDate(session.ended_at)}</strong></div>
          <div><span>Điểm tracking</span><strong>{summary?.tracking_points_count ?? "Chưa ghi nhận"}</strong></div>
          <div><span>Tóm tắt tracking</span><strong>{summary ? "Đã ghi nhận" : "Chưa ghi nhận"}</strong></div>
        </section>
      )}
    </AdminChrome>
  );
}

export function AdminAnalyticsPage() {
  const routeParams = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "";
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(routeParams.courseId || searchParams.get("courseId") || "");
  const [selectedLessonId, setSelectedLessonId] = useState(routeParams.lessonId || searchParams.get("lessonId") || "");
  const [scope, setScope] = useState(searchParams.get("scope") || "valid");
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    async function loadCourses() {
      try {
        const data = await requestJson(apiUrl("/courses/my"));
        setCourses(data);
        setState("idle");
      } catch (error) {
        setMessage(friendlyError(error, "Không thể tải danh sách khóa học để chọn analytics."));
        setState("error");
      }
    }
    loadCourses();
  }, []);
  const selectedCourse = courses.find((course) => course.course_id === selectedCourseId) || null;
  const lessons = (selectedCourse?.items || []).filter((item) => item.item_type === "PDF_LESSON");
  const selectedLesson = lessons.find((item) => item.course_item_id === selectedLessonId) || null;
  function updateContext(nextCourseId, nextLessonId = "", nextScope = scope) {
    setSelectedCourseId(nextCourseId);
    setSelectedLessonId(nextLessonId);
    setScope(nextScope);
    const next = {};
    if (nextCourseId) next.courseId = nextCourseId;
    if (nextLessonId) next.lessonId = nextLessonId;
    if (nextLessonId) next.scope = nextScope;
    setSearchParams(next);
  }
  return (
    <AdminChrome active="analytics" title="Phân tích học tập" description="Phân tích dữ liệu điểm nhìn theo bài học, học viên, trang và khu vực nội dung.">
      {state === "loading" && <LoadingState label="Đang tải ngữ cảnh analytics..." />}
      {state === "error" && <ErrorState body={message} />}
      {state !== "loading" && state !== "error" && (
        <>
          {sessionId ? (
            <section className="panel">
              <div className="section-header">
                <div><h2>Phân tích theo phiên</h2><p className="muted">Xem dữ liệu điểm nhìn của phiên đã chọn.</p></div>
                <Link className="btn primary" to={`/analytics?session_id=${encodeURIComponent(sessionId)}&from=${encodeURIComponent("/admin/analytics")}`}>Tải phân tích phiên</Link>
              </div>
            </section>
          ) : null}
          <section className="panel admin-filter-panel">
            <label><span>Khóa học</span><select value={selectedCourseId} onChange={(e) => updateContext(e.target.value)}><option value="">Chọn khóa học</option>{courses.map((course) => <option key={course.course_id} value={course.course_id}>{course.course_title}</option>)}</select></label>
            <label><span>Bài học</span><select value={selectedLessonId} disabled={!selectedCourseId} onChange={(e) => updateContext(selectedCourseId, e.target.value)}><option value="">Chọn bài học</option>{lessons.map((item) => <option key={item.course_item_id} value={item.course_item_id}>{item.title}</option>)}</select></label>
            <label><span>Phạm vi phiên</span><select value={scope} disabled={!selectedLessonId} onChange={(e) => updateContext(selectedCourseId, selectedLessonId, e.target.value)}><option value="valid">Tất cả phiên hợp lệ</option><option value="recent">Phiên gần đây</option></select></label>
          </section>
          {!selectedCourseId || !selectedLessonId ? (
            <EmptyModuleState title="Chưa chọn bài học" body="Chọn khóa học và bài học phía trên để xem dữ liệu phân tích." />
          ) : !selectedLesson ? (
            <ErrorState title="Bài học không khả dụng" body="Bài học này không thuộc khóa học đã chọn hoặc đã bị gỡ khỏi khóa học." />
          ) : (
            <section className="panel">
              <div className="section-header">
                <div><h2>{selectedLesson.title}</h2><p className="muted">Tải báo cáo phân tích cho bài học đã chọn.</p></div>
                <div className="table-actions">
                  <Link className="btn primary" to={`/teacher/courses/${encodeURIComponent(selectedCourseId)}/lessons/${encodeURIComponent(selectedLessonId)}/analytics`}>Tải phân tích</Link>
                  <Link className="btn secondary" to={`/admin/eye-tracking-test?courseId=${encodeURIComponent(selectedCourseId)}&lessonId=${encodeURIComponent(selectedLessonId)}`}>Kiểm thử bài học này</Link>
                </div>
              </div>
              <p className="muted">Nếu bài học chưa có dữ liệu tracking hợp lệ, báo cáo sẽ hiển thị trạng thái chưa có dữ liệu.</p>
            </section>
          )}
        </>
      )}
    </AdminChrome>
  );
}

export function AdminEyeTrackingTestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { overview } = useAdminOverview();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(searchParams.get("courseId") || "");
  const [lessonId, setLessonId] = useState(searchParams.get("lessonId") || "");
  const [cameraReady, setCameraReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    async function load() {
      try {
        setCourses(await requestJson(apiUrl("/courses/my")));
        setState("success");
      } catch (error) {
        setMessage(friendlyError(error, "Không thể tải khóa học cho kiểm thử eye-tracking."));
        setState("error");
      }
    }
    load();
  }, []);
  const selectedCourse = courses.find((course) => course.course_id === courseId) || null;
  const lessons = (selectedCourse?.items || []).filter((item) => item.item_type === "PDF_LESSON" && item.access_state === "available");
  const lesson = lessons.find((item) => item.course_item_id === lessonId) || null;
  const readinessIssues = [
    !courseId ? "Chưa chọn khóa học" : "",
    !lesson ? "Chưa chọn bài học" : "",
  ].filter(Boolean);
  const disabledReason = readinessIssues[0] || "";
  const recentTestSessions = (overview?.recent_sessions || []).filter((session) => session.session_type === "admin_test").slice(0, 5);
  async function checkCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setCameraReady(true);
    } catch {
      setCameraReady(false);
      setMessage("Camera chưa sẵn sàng. Hãy cấp quyền camera trong trình duyệt rồi thử lại.");
    }
  }
  async function startTest() {
    if (!lesson) return;
    setStarting(true);
    try {
      clearSessionContext({ preserveIdentity: true });
      const session = await requestJson(apiUrl("/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: `S_ADMIN_TEST_${Date.now()}`,
          course_id: courseId,
          course_item_id: lesson.course_item_id,
          pdf_lesson_id: lesson.pdf_lesson?.pdf_lesson_id || null,
          is_fullscreen: Boolean(document.fullscreenElement),
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
        }),
      });
      setSessionContext({
        role: "admin",
        session_type: session.session_type || "admin_test",
        course_id: session.course_id || courseId,
        course_item_id: session.course_item_id || lesson.course_item_id,
        pdf_lesson_id: session.pdf_lesson_id || lesson.pdf_lesson?.pdf_lesson_id || "",
        pdf_document_version: session.pdf_document_version || lesson.pdf_lesson?.storage_key || "",
        session_id: session.session_id,
      });
      navigate("/camera-check");
    } catch (error) {
      setMessage(friendlyError(error, "Không thể bắt đầu phiên kiểm thử. Hãy kiểm tra quyền truy cập và bài học PDF đã chọn."));
      setStarting(false);
    }
  }
  return (
    <AdminChrome active="eye-tracking-test" title="Kiểm thử eye-tracking" description="Trải nghiệm bài học như học viên để kiểm tra độ chính xác và tính ổn định của tracking." actions={<button className="btn primary" type="button" disabled={Boolean(disabledReason) || starting} onClick={startTest}>Bắt đầu kiểm thử</button>}>
      {state === "loading" && <LoadingState label="Đang tải thiết lập kiểm thử..." />}
      {state === "error" && <ErrorState body={message} />}
      {state === "success" && (
        <>
          <section className="panel admin-test-setup">
            <label><span>Khóa học</span><select value={courseId} onChange={(e) => { setCourseId(e.target.value); setLessonId(""); }}><option value="">Chọn khóa học</option>{courses.map((course) => <option key={course.course_id} value={course.course_id}>{course.course_title}</option>)}</select></label>
            <label><span>Bài học PDF</span><select value={lessonId} disabled={!courseId} onChange={(e) => setLessonId(e.target.value)}><option value="">Chọn bài học</option>{lessons.map((item) => <option key={item.course_item_id} value={item.course_item_id}>{item.title}</option>)}</select></label>
            <div><span>Phiên bản tài liệu PDF</span><strong>{lesson?.pdf_lesson?.storage_key || "Chưa chọn bài học"}</strong></div>
            <div><span>Hồ sơ hiệu chỉnh</span><strong>{localStorage.getItem("calibration_profile_id") || "Sẽ chọn ở bước chuẩn bị"}</strong></div>
            <div><span>Kiểm tra nhanh camera</span><strong>{cameraReady ? "Hoạt động" : "Tùy chọn"}</strong><button className="btn secondary" type="button" onClick={checkCamera}>Kiểm tra nhanh</button></div>
            <div><span>Nhận diện khuôn mặt</span><strong>Thực hiện ở bước chuẩn bị</strong></div>
          </section>
          <section className={`panel admin-readiness ${readinessIssues.length ? "warning" : "ok"}`}>
            <h2>{readinessIssues.length ? "Chưa thể bắt đầu" : "Sẵn sàng kiểm thử"}</h2>
            {readinessIssues.length ? (
              <ul>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            ) : (
              <p className="muted">Bạn có thể bắt đầu kiểm thử và đi qua quy trình chuẩn bị giống học viên.</p>
            )}
          </section>
          {message ? <p className="status-line error">{message}</p> : null}
          <section className="panel">
            <h2>Quy trình kiểm thử</h2>
            <p className="muted">Bạn sẽ trải nghiệm bài học giống học viên. Trong quá trình học, hệ thống hiển thị điểm nhìn hiện tại và live heatmap để kiểm tra độ chính xác và tính ổn định của tracking.</p>
            <p className="muted">Phiên kiểm thử không ảnh hưởng đến tiến độ và dữ liệu phân tích chính thức của học viên.</p>
          </section>
          {recentTestSessions.length > 0 && (
            <section className="panel">
              <div className="section-header"><h2>Phiên kiểm thử gần đây</h2></div>
              <SessionTable sessions={recentTestSessions} compact />
            </section>
          )}
        </>
      )}
    </AdminChrome>
  );
}

export function AdminEyeTrackingReportPage() {
  const { testSessionId = "" } = useParams();
  return (
    <AdminChrome active="eye-tracking-test" title="Báo cáo kiểm thử eye-tracking" description={testSessionId} actions={<Link className="btn primary" to="/admin/eye-tracking-test">Kiểm thử lại</Link>}>
      <section className="panel">
        <h2>Báo cáo phiên kiểm thử</h2>
        <p className="muted">Phiên đã kết thúc. Bạn có thể xem dữ liệu phiên, mở phân tích hoặc thực hiện kiểm thử lại.</p>
        <div className="table-actions">
          <Link className="btn secondary" to={`/admin/sessions/${encodeURIComponent(testSessionId)}`}>Xem dữ liệu phiên</Link>
          <Link className="btn secondary" to={`/admin/analytics?sessionId=${encodeURIComponent(testSessionId)}`}>Xem lại heatmap</Link>
          <Link className="btn text" to="/admin/overview">Thoát</Link>
        </div>
      </section>
    </AdminChrome>
  );
}

export function AdminUsersPage() {
  const { overview, state, message, reload } = useAdminOverview();
  const counts = overview?.counts || {};
  const classified = (counts.students || 0) + (counts.teachers || 0) + (counts.admins || 0);
  const unclassified = counts.unclassified_users ?? Math.max(0, (counts.users || 0) - classified);
  return (
    <AdminChrome active="users" title="Người dùng & phân công" description="Tra cứu người dùng và quản lý phân công khóa học.">
      {state === "loading" && <LoadingState />}
      {state === "error" && <ErrorState body={message} onRetry={reload} />}
      {state === "success" && (
        <>
          <section className="metric-strip">
            <div><span>Tất cả người dùng</span><strong>{counts.users ?? 0}</strong></div>
            <div><span>Học viên</span><strong>{counts.students ?? 0}</strong></div>
            <div><span>Giáo viên</span><strong>{counts.teachers ?? 0}</strong></div>
            <div><span>Quản trị viên</span><strong>{counts.admins ?? 0}</strong></div>
            <div><span>Chưa phân loại</span><strong>{unclassified}</strong></div>
          </section>
          <EmptyModuleState
            title="Chức năng đang được hoàn thiện"
            body="Tính năng quản lý người dùng và phân công khóa học sẽ được mở khi dữ liệu quản trị sẵn sàng."
            actions={<Link className="btn secondary" to="/admin/overview">Quay lại tổng quan</Link>}
          />
        </>
      )}
    </AdminChrome>
  );
}

export function AdminSystemPage() {
  const { overview, state, message, reload } = useAdminOverview();
  const lastChecked = formatDate(new Date());
  const services = [
    { name: "API hệ thống", status: healthStatus(overview?.system_health?.api?.ok), detail: "Hệ thống đang nhận yêu cầu quản trị.", checked: lastChecked },
    { name: "Cơ sở dữ liệu", status: healthStatus(overview?.system_health?.db_schema), detail: overview?.system_health?.db_schema ? "Schema dữ liệu chính sẵn sàng." : "Chưa xác nhận được schema dữ liệu.", checked: lastChecked },
    { name: "Dịch vụ eye-tracking", status: healthStatus(overview?.system_health?.ai_service?.ok), detail: overview?.system_health?.ai_service?.ok ? "Dịch vụ mô hình đang phản hồi." : "Dịch vụ mô hình chưa sẵn sàng.", checked: lastChecked },
    { name: "Dịch vụ lưu trữ/PDF", status: healthStatus(overview?.system_health?.cloudinary?.configured), detail: overview?.system_health?.cloudinary?.configured ? "Cấu hình lưu trữ đã sẵn sàng." : "Chưa xác nhận cấu hình lưu trữ.", checked: lastChecked },
  ];
  return (
    <AdminChrome active="system" title="Hệ thống" description="Theo dõi trạng thái vận hành API, cơ sở dữ liệu, eye-tracking và lưu trữ." actions={<button className="btn secondary" type="button" onClick={reload}>Kiểm tra lại</button>}>
      {state === "loading" && <LoadingState label="Đang kiểm tra hệ thống..." />}
      {state === "error" && <ErrorState body={message} onRetry={reload} />}
      {state === "success" && (
        <>
          <section className="admin-system-grid">
            {services.map((service) => (
              <article className="panel admin-system-card" key={service.name}>
                <div className="section-header"><h2>{service.name}</h2><span className="admin-status-pill">{service.status}</span></div>
                <p className="muted">{service.detail}</p>
                <dl>
                  <div><dt>Kiểm tra gần nhất</dt><dd>{service.checked}</dd></div>
                  <div><dt>Thời gian phản hồi</dt><dd>Chưa được cung cấp</dd></div>
                </dl>
              </article>
            ))}
          </section>
          <section className="panel admin-version-grid">
            <div><span>Môi trường</span><strong>{import.meta.env.MODE}</strong></div>
            <div><span>Phiên bản frontend</span><strong>Chưa được cung cấp</strong></div>
            <div><span>Phiên bản backend</span><strong>Chưa được cung cấp</strong></div>
            <div><span>Phiên bản thuật toán</span><strong>Chưa được cung cấp</strong></div>
          </section>
        </>
      )}
    </AdminChrome>
  );
}
