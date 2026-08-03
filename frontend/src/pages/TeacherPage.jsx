import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function learnerLabel(session) {
  const name = session.full_name || "Người học";
  return session.student_code ? `${name} (${session.student_code})` : name;
}

export default function TeacherPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lesson, setLesson] = useState(searchParams.get("lesson") || localStorage.getItem("lesson_id") || "L001");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [sessionStatus, setSessionStatus] = useState(searchParams.get("status") || "");
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState("Đang tải phiên học...");
  const [status, setStatusState] = useState({ message: "", kind: "" });
  const [loading, setLoading] = useState(false);

  const setStatus = (message, kind = "") => setStatusState({ message, kind });

  async function loadCourses() {
    try {
      const data = await requestJson(apiUrl("/courses/my"));
      const lessons = data.filter((course) => course.lesson_id);
      setCourses(lessons);
      if (lessons.length && !lessons.some((course) => course.lesson_id === lesson)) {
        setLesson(lessons[0].lesson_id);
      }
    } catch (error) {
      setCourses([]);
      setStatus(`Không thể tải khóa học được phân công: ${error.message}`, "error");
    }
  }

  async function loadSessions() {
    localStorage.setItem("lesson_id", lesson);
    setLoading(true);
    setStatus("Đang tải phiên học...");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (sessionStatus) params.set("status", sessionStatus);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const data = await requestJson(apiUrl(`/lessons/${encodeURIComponent(lesson)}/sessions${suffix}`));
      setSessions(data);
      setSummary(`${data.length} phiên học phù hợp`);
      setStatus("Đã tải phiên học.", "ok");
    } catch (error) {
      setSessions([]);
      setSummary("Chưa tải được danh sách phiên học.");
      setStatus(`Không thể tải phiên học: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, sessionStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams();
      if (lesson) next.set("lesson", lesson);
      if (query.trim()) next.set("q", query.trim());
      if (sessionStatus) next.set("status", sessionStatus);
      setSearchParams(next, { replace: true });
      loadSessions();
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (lesson) next.set("lesson", lesson);
    if (query.trim()) next.set("q", query.trim());
    if (sessionStatus) next.set("status", sessionStatus);
    setSearchParams(next, { replace: true });
  }, [lesson, query, sessionStatus, setSearchParams]);

  function clearFilters() {
    setQuery("");
    setSessionStatus("");
  }

  const totals = sessions.reduce(
    (acc, session) => ({
      points: acc.points + (session.tracking_points_count ?? 0),
      metrics: acc.metrics + (session.metrics_count ?? 0),
      heatmaps: acc.heatmaps + (session.heatmaps_count ?? 0),
      snapshots: acc.snapshots + (session.snapshot_captured ? 1 : 0),
    }),
    { points: 0, metrics: 0, heatmaps: 0, snapshots: 0 }
  );

  const activeSessions = sessions.filter((session) => !session.ended_at).length;
  const latestSessions = sessions.slice(0, 6);
  const fromTeacher = `/teacher?${searchParams.toString()}#sessions`;

  return (
    <>
    <AppHeader active="home" />
    <TeacherLayout className="teacher-dashboard">
      <div className="dashboard-workspace">
        <header className="dashboard-hero">
          <div>
            <div className="course-kicker">Trực tiếp · lớp học · phân tích học tập</div>
            <h1>Tổng quan lớp học</h1>
            <p className="muted">
              Theo dõi phiên học, tín hiệu tracking và dữ liệu heatmap mà không suy diễn năng lực cá nhân.
            </p>
          </div>
          <div className="dashboard-filters">
            <div className="field compact-field">
              <label htmlFor="lessonSelect">Bài học</label>
              <select id="lessonSelect" value={lesson} onChange={(e) => setLesson(e.target.value)}>
                {courses.length === 0 && <option value={lesson}>{lesson}</option>}
                {courses.map((course) => (
                  <option key={course.lesson_id} value={course.lesson_id}>
                    {course.lesson_id} · {course.lesson_title || course.course_title}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="button" disabled={loading} onClick={loadSessions}>Làm mới</button>
          </div>
        </header>

        <section className="dashboard-bento">
          <article className="bento-tile bento-tile-hero">
            <span>Phiên học</span>
            <strong>{sessions.length}</strong>
            <p>{summary}</p>
          </article>
          <article className="bento-tile">
            <span>Đang mở</span>
            <strong>{activeSessions}</strong>
            <p>Phiên chưa kết thúc.</p>
          </article>
          <article className="bento-tile">
            <span>Mẫu ánh nhìn</span>
            <strong>{totals.points}</strong>
            <p>Tổng điểm gaze đã ghi nhận.</p>
          </article>
          <article className="bento-tile">
            <span>Bản đồ nhiệt</span>
            <strong>{totals.heatmaps}</strong>
            <p>{totals.snapshots} snapshot đã sẵn sàng.</p>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel signal-panel">
            <div className="section-header">
              <div>
                <h2>Tín hiệu lớp học</h2>
                <p className="muted">Tổng hợp từ dữ liệu thật của các phiên trong bài học.</p>
              </div>
            </div>
            <div className="signal-bars">
              <div style={{ "--value": `${Math.min(100, sessions.length * 12)}%` }}>
                <span>Số phiên</span><strong>{sessions.length}</strong>
              </div>
              <div style={{ "--value": `${Math.min(100, totals.metrics * 8)}%` }}>
                <span>Chỉ số vùng</span><strong>{totals.metrics}</strong>
              </div>
              <div style={{ "--value": `${sessions.length ? Math.round((totals.snapshots / sessions.length) * 100) : 0}%` }}>
                <span>Tỷ lệ ảnh chụp</span><strong>{sessions.length ? Math.round((totals.snapshots / sessions.length) * 100) : 0}%</strong>
              </div>
            </div>
          </article>

          <article className="panel recent-panel">
            <div className="section-header">
              <div>
                <h2>Phiên gần đây</h2>
                <p className="muted">Mở analytics từ từng phiên học.</p>
              </div>
            </div>
            <div className="compact-session-list">
              {!latestSessions.length && <div className="empty-state">Chưa có phiên học cho bài này.</div>}
              {latestSessions.map((session) => (
                <Link className="compact-session-row" to={`/analytics?session_id=${encodeURIComponent(session.session_id)}&from=${encodeURIComponent(fromTeacher)}`} key={session.session_id}>
                  <div>
                    <strong>{learnerLabel(session)}</strong>
                    <span>{formatDate(session.started_at)}</span>
                  </div>
                  <em>{session.tracking_points_count ?? 0} mẫu</em>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="panel" id="sessions">
          <div className="section-header">
            <div>
              <h2>Tất cả phiên học</h2>
              <p className="muted">{summary}</p>
            </div>
            <button className="btn" type="button" disabled={loading} onClick={loadSessions}>Làm mới</button>
          </div>
          <div className="teacher-filter-row">
            <div className="field compact-field">
              <label htmlFor="teacherSessionSearch">Tìm học sinh hoặc mã phiên</label>
              <input
                id="teacherSessionSearch"
                value={query}
                placeholder="Tên, mã học sinh, S_..."
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="field compact-field">
              <label htmlFor="teacherSessionStatus">Trạng thái phiên</label>
              <select id="teacherSessionStatus" value={sessionStatus} onChange={(event) => setSessionStatus(event.target.value)}>
                <option value="">Tất cả</option>
                <option value="open">Đang mở</option>
                <option value="finished">Đã kết thúc</option>
              </select>
            </div>
            <button className="btn secondary" type="button" disabled={!query && !sessionStatus} onClick={clearFilters}>Xóa bộ lọc</button>
          </div>
          <p className="result-count">{loading ? "Đang cập nhật..." : `${sessions.length} kết quả`}</p>
          <div className="session-card-grid">
            {!sessions.length && (
              <div className="empty-state">
                {query || sessionStatus
                  ? "Không có phiên nào khớp bộ lọc hiện tại. Hãy xóa bộ lọc hoặc thử từ khóa khác."
                  : "Chưa có phiên học cho bài này. Khi học sinh bắt đầu học, phiên sẽ xuất hiện tại đây."}
              </div>
            )}
            {sessions.map((session) => (
              <article className="session-card" key={session.session_id}>
                <div>
                  <h3>{session.session_id}</h3>
                  <p className="muted">{learnerLabel(session)}</p>
                </div>
                <dl className="compact-facts">
                  <div><dt>Bắt đầu</dt><dd>{formatDate(session.started_at)}</dd></div>
                  <div><dt>Mẫu ánh nhìn</dt><dd>{session.tracking_points_count ?? 0}</dd></div>
                  <div><dt>Chỉ số</dt><dd>{session.metrics_count ?? 0}</dd></div>
                  <div><dt>Bản đồ nhiệt</dt><dd>{session.heatmaps_count ?? 0}</dd></div>
                  <div><dt>Ảnh chụp</dt><dd>{session.snapshot_captured ? "Đã có" : "Thiếu"}</dd></div>
                </dl>
                <Link className="btn primary" to={`/analytics?session_id=${encodeURIComponent(session.session_id)}&from=${encodeURIComponent(fromTeacher)}`}>
                  Mở phân tích
                </Link>
              </article>
            ))}
          </div>
          <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
        </section>
      </div>
    </TeacherLayout>
    </>
  );
}
