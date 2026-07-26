import { useEffect, useState } from "react";
import { apiUrl, requestJson } from "../lib/api.js";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function boolLabel(value) {
  return value ? "ok" : "missing";
}
function learnerLabel(session) {
  const name = session.full_name || "Learner";
  return session.student_code ? `${name} (${session.student_code})` : name;
}

const COUNT_LABELS = {
  users: "Users",
  lessons: "Lessons",
  sessions: "Sessions",
  gaze_chunks: "Gaze chunks",
  tracking_points: "Tracking points",
  aoi_metrics: "AOI metrics",
  heatmaps: "Heatmaps",
  page_snapshots: "Page snapshots",
};

function SessionCard({ session, onRecalculate, recalculating }) {
  const [healthRaw, setHealthRaw] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  async function showHealth() {
    setHealthLoading(true);
    try {
      const health = await requestJson(apiUrl(`/debug/session-health/${encodeURIComponent(session.session_id)}`));
      setHealthRaw(JSON.stringify(health, null, 2));
    } catch (error) {
      setHealthRaw(`Session health failed: ${error.message}`);
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <article className="session-card">
      <div>
        <h3>{session.session_id}</h3>
        <p className="muted">{learnerLabel(session)} · {session.lesson_id || "-"}</p>
      </div>
      <dl className="compact-facts">
        <div><dt>Started</dt><dd>{formatDate(session.started_at)}</dd></div>
        <div><dt>Tracking points</dt><dd>{session.tracking_points_count ?? 0}</dd></div>
        <div><dt>Metrics</dt><dd>{session.metrics_count ?? 0}</dd></div>
        <div><dt>Heatmaps</dt><dd>{session.heatmaps_count ?? 0}</dd></div>
        <div><dt>Snapshot</dt><dd>{session.snapshot_captured ? "captured" : "missing"}</dd></div>
      </dl>
      <div className="card-actions">
        <a className="btn primary" href={`/analytics?session_id=${encodeURIComponent(session.session_id)}`}>Open analytics</a>
        <button className="btn" type="button" disabled={healthLoading} onClick={showHealth}>View health</button>
        <button
          className="btn"
          type="button"
          disabled={recalculating === session.session_id}
          onClick={() => onRecalculate(session.session_id)}
        >
          Recalculate metrics
        </button>
      </div>
      {healthRaw !== null && <pre className="inline-raw">{healthRaw}</pre>}
    </article>
  );
}

export default function AdminPage() {
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatusState] = useState({ message: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(null);

  const setStatus = (message, kind = "") => setStatusState({ message, kind });

  async function loadOverview() {
    localStorage.setItem("role", "admin");
    setLoading(true);
    setStatus("Loading admin overview...");
    try {
      const data = await requestJson(apiUrl("/admin/overview"));
      setOverview(data);
      setStatus("Admin overview loaded.", "ok");
    } catch (error) {
      setStatus(`Cannot load admin overview: ${error.message}`, "error");
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
    setStatus(`Recalculating metrics for ${sessionId}...`);
    try {
      await requestJson(apiUrl(`/metrics/recalculate/${encodeURIComponent(sessionId)}`), { method: "POST" });
      setStatus("Metrics recalculated.", "ok");
      await loadOverview();
    } catch (error) {
      setStatus(`Recalculate failed: ${error.message}`, "error");
    } finally {
      setRecalculating(null);
    }
  }

  const sessions = (overview?.recent_sessions || []).filter(
    (session) => !query.trim() || session.session_id.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      <header className="topbar">
        <div className="brand">EyeLearn</div>
        <div className="topbar-title">
          <strong>Admin Dashboard</strong>
          <span>System health, data overview, and session inspection</span>
        </div>
        <nav className="role-nav" aria-label="Admin navigation">
          <a href="/admin">System</a>
          <a href="#sessions">Sessions</a>
          <a href="/analytics">Analytics</a>
          <a href="/lesson" onClick={() => localStorage.setItem("role", "student")}>View as Student</a>
          <a href="/teacher" onClick={() => localStorage.setItem("role", "teacher")}>View as Teacher</a>
        </nav>
      </header>

      <main className="page dashboard-shell">
        <section className="panel dashboard-header">
          <div>
            <h1>Admin Dashboard</h1>
            <p className="muted">Operational view for the demo LMS.</p>
          </div>
          <button className="btn" type="button" disabled={loading} onClick={loadOverview}>Refresh</button>
        </section>

        <section className="metrics-grid">
          <div className="metric-card"><span>API health</span><strong>{boolLabel(overview?.system_health?.api?.ok)}</strong></div>
          <div className="metric-card"><span>DB schema status</span><strong>{boolLabel(overview?.system_health?.db_schema)}</strong></div>
          <div className="metric-card"><span>AI service status</span><strong>{boolLabel(overview?.system_health?.ai_service?.ok)}</strong></div>
          <div className="metric-card"><span>Cloudinary configured</span><strong>{overview?.system_health?.cloudinary?.configured ? "yes" : "no"}</strong></div>
        </section>

        <section className="panel">
          <div className="section-header">
            <div>
              <h2>Data Overview</h2>
              <p className="muted">Current table and artifact counts.</p>
            </div>
          </div>
          <div className="overview-grid">
            {Object.entries(COUNT_LABELS).map(([key, label]) => (
              <div className="metric-card" key={key}>
                <span>{label}</span>
                <strong>{overview?.counts?.[key] ?? "-"}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel metrics-section" id="sessions">
          <div className="section-header">
            <div>
              <h2>Session Inspector</h2>
              <p className="muted">Recent sessions and admin actions.</p>
            </div>
            <div className="field compact-field">
              <label htmlFor="sessionSearch">Search session_id</label>
              <input id="sessionSearch" placeholder="S_..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="session-card-grid">
            {!sessions.length && <div className="empty-state">No matching sessions.</div>}
            {sessions.map((session) => (
              <SessionCard
                key={session.session_id}
                session={session}
                onRecalculate={recalculateSession}
                recalculating={recalculating}
              />
            ))}
          </div>
          <details className="debug-panel">
            <summary>Raw overview response</summary>
            <pre>{overview ? JSON.stringify(overview, null, 2) : "No response loaded."}</pre>
          </details>
          <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
        </section>
      </main>
    </>
  );
}
