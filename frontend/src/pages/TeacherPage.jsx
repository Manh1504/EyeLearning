import { useEffect, useState } from "react";
import { apiUrl, requestJson } from "../lib/api.js";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function learnerLabel(session) {
  const name = session.full_name || "Learner";
  return session.student_code ? `${name} (${session.student_code})` : name;
}

export default function TeacherPage() {
  const [lesson, setLesson] = useState(localStorage.getItem("lesson_id") || "L001");
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState("Loading sessions...");
  const [status, setStatusState] = useState({ message: "", kind: "" });
  const [loading, setLoading] = useState(false);

  const setStatus = (message, kind = "") => setStatusState({ message, kind });

  async function loadSessions() {
    localStorage.setItem("role", "teacher");
    localStorage.setItem("lesson_id", lesson);
    setLoading(true);
    setStatus("Loading sessions...");
    try {
      const data = await requestJson(apiUrl(`/lessons/${encodeURIComponent(lesson)}/sessions`));
      setSessions(data);
      setSummary(`${data.length} session${data.length === 1 ? "" : "s"} for ${lesson}`);
      setStatus("Sessions loaded.", "ok");
    } catch (error) {
      setSessions([]);
      setSummary("Sessions unavailable.");
      setStatus(`Cannot load sessions: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  return (
    <>
      <header className="topbar">
        <div className="brand">EyeLearn</div>
        <div className="topbar-title">
          <strong>Teacher Dashboard</strong>
          <span>Lesson sessions and learning analytics</span>
        </div>
        <nav className="role-nav" aria-label="Teacher navigation">
          <a href="/teacher">Dashboard</a>
          <a href="#sessions">Sessions</a>
          <a href="/analytics">Analytics</a>
        </nav>
      </header>

      <main className="page dashboard-shell">
        <section className="panel dashboard-header">
          <div>
            <h1>Teacher Dashboard</h1>
            <p className="muted">Review learner sessions for a lesson and open analytics.</p>
          </div>
          <div className="field compact-field">
            <label htmlFor="lessonSelect">Lesson</label>
            <select id="lessonSelect" value={lesson} onChange={(e) => setLesson(e.target.value)}>
              <option value="L001">L001</option>
            </select>
          </div>
        </section>

        <section className="panel" id="sessions">
          <div className="section-header">
            <div>
              <h2>Sessions</h2>
              <p className="muted">{summary}</p>
            </div>
            <button className="btn" type="button" disabled={loading} onClick={loadSessions}>Refresh</button>
          </div>
          <div className="session-card-grid">
            {!sessions.length && <div className="empty-state">No sessions found for this lesson.</div>}
            {sessions.map((session) => (
              <article className="session-card" key={session.session_id}>
                <div>
                  <h3>{session.session_id}</h3>
                  <p className="muted">{learnerLabel(session)}</p>
                </div>
                <dl className="compact-facts">
                  <div><dt>Started</dt><dd>{formatDate(session.started_at)}</dd></div>
                  <div><dt>Tracking points</dt><dd>{session.tracking_points_count ?? 0}</dd></div>
                  <div><dt>Metrics</dt><dd>{session.metrics_count ?? 0}</dd></div>
                  <div><dt>Heatmaps</dt><dd>{session.heatmaps_count ?? 0}</dd></div>
                  <div><dt>Snapshot</dt><dd>{session.snapshot_captured ? "captured" : "missing"}</dd></div>
                </dl>
                <a className="btn primary" href={`/analytics?session_id=${encodeURIComponent(session.session_id)}`}>
                  View analytics
                </a>
              </article>
            ))}
          </div>
          <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
        </section>
      </main>
    </>
  );
}
