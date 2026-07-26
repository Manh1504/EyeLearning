import { useEffect, useState } from "react";
import { apiUrl, requestJson } from "../lib/api.js";

function currentRole() {
  return localStorage.getItem("role") || "student";
}

function getSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("session_id") || localStorage.getItem("session_id");
}

function getLearnerLabel() {
  const fullName = localStorage.getItem("full_name");
  const studentCode = localStorage.getItem("student_code");
  if (fullName && studentCode) return `${fullName} (${studentCode})`;
  return fullName || studentCode || "-";
}

function seconds(ms) {
  return (ms / 1000).toFixed(1);
}

function formatDurationMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return "-";
  const value = Math.max(0, Number(ms));
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const secondsPart = totalSeconds % 60;
  return `${minutes}m ${String(secondsPart).padStart(2, "0")}s`;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function storageLabel(heatmap) {
  if (!heatmap?.image_url) return "No image";
  return heatmap.cloudinary_public_id || heatmap.image_url.startsWith("http") ? "Cloudinary" : "Local";
}

function heatmapModeLabel(heatmap) {
  if (heatmap?.metadata_json?.debug_overlay) return "Debug overlay";
  return heatmap?.metadata_json?.overlay_mode ? "Page overlay" : "Grid heatmap";
}

function heatmapBackgroundLabel(heatmap) {
  return heatmap?.background_image_url ? "Snapshot" : "None/grid fallback";
}

const AOI_OPTIONS = [
  "video_area",
  "transcript_panel",
  "quiz_area",
  "notes_panel",
  "lesson_sidebar",
  "lesson_header",
  "tracking_panel",
  "completion_panel",
];

function fetchMetrics(sessionId) {
  return requestJson(apiUrl(`/metrics/${encodeURIComponent(sessionId)}`));
}
function fetchHeatmaps(sessionId) {
  return requestJson(apiUrl(`/heatmaps/${encodeURIComponent(sessionId)}`));
}
function fetchTrackingSummary(sessionId) {
  return requestJson(apiUrl(`/sessions/${encodeURIComponent(sessionId)}/tracking-summary`));
}
function fetchSessionHealth(sessionId) {
  return requestJson(apiUrl(`/debug/session-health/${encodeURIComponent(sessionId)}`));
}
function generateHeatmapReq(sessionId, aoiKey, options = {}) {
  const params = new URLSearchParams();
  if (aoiKey) params.set("aoi_key", aoiKey);
  if (options.debug) params.set("debug", "1");
  if (options.mode) params.set("mode", options.mode);
  const query = params.toString() ? `?${params.toString()}` : "";
  return requestJson(apiUrl(`/heatmaps/generate/${encodeURIComponent(sessionId)}${query}`), { method: "POST" });
}
function recalculateReq(sessionId) {
  return requestJson(apiUrl(`/metrics/recalculate/${encodeURIComponent(sessionId)}`), { method: "POST" });
}

function MetricRow({ metric, sessionStart }) {
  function firstHitDisplay() {
    if (metric.first_hit_ms === null || metric.first_hit_ms === undefined) return "-";
    const value = Number(metric.first_hit_ms);
    if (Number.isFinite(sessionStart) && value >= sessionStart) {
      return formatDurationMs(value - sessionStart);
    }
    return formatDurationMs(value);
  }
  return (
    <tr>
      <td>{metric.aoi_name}</td>
      <td><code>{metric.aoi_key}</code></td>
      <td>{seconds(metric.dwell_time_ms)}</td>
      <td>{pct(metric.dwell_time_pct)}</td>
      <td>{metric.point_count}</td>
      <td>{firstHitDisplay()}</td>
      <td>{metric.revisit_count}</td>
    </tr>
  );
}

export default function AnalyticsPage() {
  const role = currentRole();
  const sessionId = getSessionIdFromUrl();

  const [status, setStatusState] = useState({ message: "", kind: "" });
  const [metrics, setMetrics] = useState([]);
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  const [heatmaps, setHeatmaps] = useState([]);
  const [selectedHeatmap, setSelectedHeatmap] = useState(null);
  const [heatmapAoi, setHeatmapAoi] = useState("");
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [heatmapDebugRaw, setHeatmapDebugRaw] = useState("No heatmap generated in this browser session.");

  const setStatus = (message, kind = "") => setStatusState({ message, kind });

  async function reloadHeatmaps() {
    const list = await fetchHeatmaps(sessionId);
    setHeatmaps(list);
    const latestDone =
      list.find((h) => h.heatmap_id === selectedHeatmap?.heatmap_id) ||
      list.find((h) => h.status === "done" && h.image_url);
    if (latestDone) setSelectedHeatmap(latestDone);
    fetchSessionHealth(sessionId).then(setHealth).catch(() => {});
    return list;
  }

  async function load() {
    if (!sessionId) {
      setStatus("No session_id found. Open analytics with ?session_id=... or start a session first.", "error");
      return;
    }
    setStatus("Loading analytics...");
    try {
      const [metricsData, summaryData] = await Promise.all([
        fetchMetrics(sessionId),
        fetchTrackingSummary(sessionId),
        fetchSessionHealth(sessionId).then(setHealth),
        reloadHeatmaps(),
      ]);
      setSummary(summaryData);
      setMetrics(metricsData);
      setStatus(`Loaded ${metricsData.length} AOI metrics.`, "ok");
    } catch (error) {
      setStatus(`Cannot load analytics: ${error.message}`, "error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleRecalculate() {
    if (!sessionId) {
      setStatus("No session_id found. Open analytics with ?session_id=... or start a session first.", "error");
      return;
    }
    setRecalculating(true);
    setStatus("Recalculating metrics...");
    try {
      await recalculateReq(sessionId);
      const [metricsData, summaryData] = await Promise.all([
        fetchMetrics(sessionId),
        fetchTrackingSummary(sessionId),
        fetchSessionHealth(sessionId).then(setHealth),
      ]);
      setSummary(summaryData);
      setMetrics(metricsData);
      setStatus(`Recalculated ${metricsData.length} AOI metrics.`, "ok");
    } catch (error) {
      setStatus(`Recalculate failed: ${error.message}`, "error");
    } finally {
      setRecalculating(false);
    }
  }

  async function handleGenerate(aoiKey, options = {}) {
    if (!sessionId) {
      setStatus("No session_id found. Open analytics with ?session_id=... or start a session first.", "error");
      return;
    }
    setHeatmapLoading(true);
    const scope = aoiKey || "whole session";
    setStatus(options.debug ? `Generating debug overlay for ${scope}...` : `Generating heatmap for ${scope}...`);

    try {
      const heatmap = await generateHeatmapReq(sessionId, aoiKey, options);
      setHeatmapDebugRaw(JSON.stringify(heatmap, null, 2));

      if (heatmap.status !== "done") {
        setSelectedHeatmap(heatmap);
        setStatus(heatmap.error_message || "Heatmap generation failed.", "error");
        await reloadHeatmaps();
        return;
      }
      if (!heatmap.image_url) {
        setSelectedHeatmap(heatmap);
        setStatus("Heatmap generated, but no image_url was returned.", "error");
        await reloadHeatmaps();
        return;
      }

      setSelectedHeatmap(heatmap);
      await reloadHeatmaps();
      if (!heatmap.metadata_json?.overlay_mode && (options.debug || options.mode === "overlay")) {
        setStatus(
          "No page snapshot found. Generated grid fallback heatmap. Go back to lesson and capture snapshot first for overlay.",
          "error"
        );
      } else {
        setStatus(`Generated ${heatmapModeLabel(heatmap)} from ${heatmap.point_count} points.`, "ok");
      }
    } catch (error) {
      const noPoints = error.message.includes("No tracking_points");
      setStatus(noPoints ? "No tracking_points found for this session or AOI." : `Generate heatmap failed: ${error.message}`, "error");
    } finally {
      setHeatmapLoading(false);
    }
  }

  const learning = metrics.filter((m) => m.is_learning_area);
  const ui = metrics.filter((m) => !m.is_learning_area);
  const aoisViewed = metrics.filter((m) => m.point_count > 0).length;
  const mappedFallback = metrics.reduce((sum, m) => sum + m.point_count, 0);
  const mapped = summary?.mapped_points ?? mappedFallback;
  const total = summary?.total_points ?? mapped;
  const outside = summary?.outside_aoi_points ?? Math.max(0, total - mapped);
  const sessionStart = Number(summary?.session_start_timestamp_ms);

  return (
    <>
      <header className="topbar" data-zone="top_nav">
        <div className="brand">EyeLearn</div>
        <div className="topbar-title">
          <strong>Session Analytics</strong>
          <span>{sessionId || "No session"}</span>
        </div>
        <nav className="role-nav" aria-label="Analytics navigation">
          {role === "student" && <a href="/lesson">Lesson</a>}
          {role === "teacher" && <a href="/teacher">Dashboard</a>}
          {role === "admin" && <a href="/admin">System</a>}
        </nav>
      </header>

      <main className="page analytics-shell">
        <section className="analytics-header panel">
          <div>
            <h1>Session Analytics</h1>
            <p className="muted">AOI metrics and heatmaps are derived from normalized tracking_points.</p>
          </div>
          <dl className="session-facts">
            <div><dt>Session</dt><dd>{sessionId || "-"}</dd></div>
            <div><dt>Learner</dt><dd>{getLearnerLabel()}</dd></div>
            <div><dt>Lesson</dt><dd>{localStorage.getItem("lesson_id") || "-"}</dd></div>
          </dl>
        </section>

        <section className="metrics-grid">
          <div className="metric-card"><span>Total tracking points</span><strong>{total}</strong></div>
          <div className="metric-card"><span>AOI-mapped points</span><strong>{mapped}</strong></div>
          <div className="metric-card"><span>Outside AOI points</span><strong>{outside}</strong></div>
          <div className="metric-card"><span>AOIs viewed</span><strong>{aoisViewed}</strong></div>
        </section>

        {role === "admin" && (
          <section className="panel metrics-section">
            <div className="section-header">
              <div>
                <h2>Session Health</h2>
                <p className="muted">{health?.recommended_next_action || "Loading session health..."}</p>
              </div>
            </div>
            <div className="qa-strip analytics-health">
              <span>Chunks <strong>{health?.gaze_chunks_count ?? 0}</strong></span>
              <span>Tracking points <strong>{health?.tracking_points_count ?? 0}</strong></span>
              <span>AOI mapping <strong>{health?.aoi_mapping_ok ? "ok" : "missing"}</strong></span>
              <span>Metrics <strong>{health?.metrics_count ?? 0}</strong></span>
              <span>Heatmaps <strong>{health?.heatmaps_count ?? 0}</strong></span>
              <span>Snapshot <strong>{health?.page_snapshot_exists ? "captured" : "missing"}</strong></span>
            </div>
          </section>
        )}

        <section className="panel metrics-section">
          <div className="section-header">
            <div>
              <h2>AOI Metrics</h2>
              <p className="muted">Split by learning and interface areas from the metrics API.</p>
            </div>
            <button className="btn primary" type="button" disabled={recalculating} onClick={handleRecalculate}>
              Recalculate metrics
            </button>
          </div>
        </section>

        <section className="panel metrics-section heatmap-section">
          <div className="section-header">
            <div>
              <h2>Heatmap</h2>
              <p className="muted">Generate full-session or AOI-specific heatmap images.</p>
              <p className="muted">Heatmap may include all tracking points; AOI metrics include only mapped AOI points.</p>
            </div>
            <div className="heatmap-controls">
              <button className="btn" type="button" disabled={heatmapLoading} onClick={() => handleGenerate(null)}>
                {heatmapLoading ? "Generating..." : "Generate full heatmap"}
              </button>
              <button className="btn" type="button" disabled={heatmapLoading} onClick={() => handleGenerate(null, { mode: "overlay" })}>
                {heatmapLoading ? "Generating..." : "Generate overlay heatmap"}
              </button>
              {role === "admin" && (
                <button
                  className="btn"
                  type="button"
                  disabled={heatmapLoading}
                  onClick={() => handleGenerate(heatmapAoi || null, { debug: true })}
                >
                  {heatmapLoading ? "Generating..." : "Generate debug overlay"}
                </button>
              )}
              <select
                aria-label="Heatmap scope"
                value={heatmapAoi}
                onChange={(e) => setHeatmapAoi(e.target.value)}
              >
                <option value="">Whole session</option>
                {AOI_OPTIONS.map((aoi) => (
                  <option key={aoi} value={aoi}>{aoi}</option>
                ))}
              </select>
              <button
                className="btn primary"
                type="button"
                disabled={heatmapLoading}
                onClick={() => handleGenerate(heatmapAoi || null)}
              >
                {heatmapLoading ? "Generating..." : "Generate selected heatmap"}
              </button>
            </div>
          </div>

          <div className="heatmap-layout">
            <div className="heatmap-preview">
              {!selectedHeatmap && <span>No heatmap generated yet.</span>}
              {selectedHeatmap && selectedHeatmap.status === "failed" && (
                <span>{selectedHeatmap.error_message || "Heatmap generation failed."}</span>
              )}
              {selectedHeatmap && selectedHeatmap.status !== "failed" && !selectedHeatmap.image_url && (
                <span>No image_url returned for this heatmap.</span>
              )}
              {selectedHeatmap && selectedHeatmap.status !== "failed" && selectedHeatmap.image_url && (
                <img src={selectedHeatmap.image_url} alt={`Heatmap ${selectedHeatmap.aoi_key || "whole session"}`} />
              )}
            </div>

            {selectedHeatmap && (
              <div className="heatmap-meta">
                {[
                  ["Scope", selectedHeatmap.aoi_key || "Whole session"],
                  ["Status", selectedHeatmap.status],
                  ["Points", String(selectedHeatmap.point_count ?? 0)],
                  ["Generated", formatDate(selectedHeatmap.generated_at)],
                  ["Storage", storageLabel(selectedHeatmap)],
                  ["Mode", heatmapModeLabel(selectedHeatmap)],
                  ["Background", heatmapBackgroundLabel(selectedHeatmap)],
                ].map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong>{value}</strong></div>
                ))}
              </div>
            )}

            <section className="heatmap-history">
              <h3>Generated heatmaps</h3>
              <div className="heatmap-list">
                {!heatmaps.length && <div className="empty-state">No generated heatmaps yet.</div>}
                {heatmaps.map((heatmap) => (
                  <button
                    key={heatmap.heatmap_id}
                    type="button"
                    className={`heatmap-item ${heatmap.heatmap_id === selectedHeatmap?.heatmap_id ? "selected" : ""}`.trim()}
                    disabled={heatmap.status !== "done" || !heatmap.image_url}
                    onClick={() => setSelectedHeatmap(heatmap)}
                  >
                    <strong>{heatmap.aoi_key || "Whole session"}</strong>
                    <span>{heatmap.status} · {heatmap.point_count ?? 0} points</span>
                    <span>{formatDate(heatmap.generated_at)} · {storageLabel(heatmap)}</span>
                    <span>{heatmapModeLabel(heatmap)} · {heatmapBackgroundLabel(heatmap)}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {role === "admin" && (
            <details className="debug-panel">
              <summary>Raw heatmap response</summary>
              <pre>{heatmapDebugRaw}</pre>
            </details>
          )}
        </section>

        <section className="panel metrics-section">
          <h2>Learning Areas</h2>
          <table>
            <thead>
              <tr>
                <th>AOI name</th><th>AOI key</th><th>Dwell sec</th><th>Dwell %</th>
                <th>Points</th><th>First hit</th><th>Revisits</th>
              </tr>
            </thead>
            <tbody>
              {learning.length
                ? learning.map((m) => <MetricRow key={m.aoi_key} metric={m} sessionStart={sessionStart} />)
                : <tr><td colSpan={7} className="empty-cell">No learning AOI metrics yet.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="panel metrics-section">
          <h2>Interface Areas</h2>
          <table>
            <thead>
              <tr>
                <th>AOI name</th><th>AOI key</th><th>Dwell sec</th><th>Dwell %</th>
                <th>Points</th><th>First hit</th><th>Revisits</th>
              </tr>
            </thead>
            <tbody>
              {ui.length
                ? ui.map((m) => <MetricRow key={m.aoi_key} metric={m} sessionStart={sessionStart} />)
                : <tr><td colSpan={7} className="empty-cell">No interface AOI metrics yet.</td></tr>}
            </tbody>
          </table>
        </section>

        <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
      </main>
    </>
  );
}
