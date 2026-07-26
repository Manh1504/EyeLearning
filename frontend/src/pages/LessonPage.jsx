import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl, loadClientConfig, requestJson } from "../lib/api.js";
import { getSessionContext } from "../lib/session.js";
import { createLiveHeatmap } from "../lib/liveHeatmap.js";
import { createGazeClient } from "../lib/gazeClient.js";
import { capturePageSnapshot } from "../lib/pageSnapshot.js";

const TRACKING_INTERVAL_MS = 100;

function calibrationReady() {
  if (localStorage.getItem("calibration_ready") !== "true") return false;
  const width = Number(localStorage.getItem("calibration_viewport_w"));
  const height = Number(localStorage.getItem("calibration_viewport_h"));
  return width === window.innerWidth && height === window.innerHeight;
}

function calibrationMessage() {
  if (localStorage.getItem("calibration_ready") !== "true") {
    return "Calibration required before gaze tracking.";
  }
  return "Viewport changed after calibration. Please recalibrate.";
}

export default function LessonPage() {
  const navigate = useNavigate();
  const context = useMemo(getSessionContext, []);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  const liveHeatmapRef = useRef(null);
  const gazeClientRef = useRef(null);
  const isTrackingRef = useRef(false);
  const lastCaptureAtRef = useRef(0);

  const [activeTab, setActiveTab] = useState("transcript");
  const [learnerInfo, setLearnerInfo] = useState("No session");
  const [config, setConfig] = useState({ enable_dev_tools: false, enable_mouse_simulation: false });
  const [isAdmin, setIsAdmin] = useState(false);
  const [mouseAllowed, setMouseAllowed] = useState(false);

  const [trackingStatus, setTrackingStatusState] = useState({ message: "", kind: "" });
  const [snapshotStatus, setSnapshotStatusState] = useState({ message: "", kind: "" });
  const [gazeStatus, setGazeStatusState] = useState({ message: "idle", kind: "" });
  const [gazeAiStatus, setGazeAiStatusState] = useState({ message: "checking", ok: false });

  const [health, setHealth] = useState({ gaze_chunks_count: 0, tracking_points_count: 0, page_snapshot_exists: false });

  const [isTracking, setIsTracking] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [lastZone, setLastZone] = useState("none");
  const [lastSend, setLastSend] = useState("not sent");

  const [liveHeatmapOn, setLiveHeatmapOn] = useState(false);
  const [mouseTestOn, setMouseTestOn] = useState(false);
  const [liveHeatmapOpacity, setLiveHeatmapOpacityState] = useState(0.35);
  const [liveHeatmapPoints, setLiveHeatmapPoints] = useState(0);
  const [debugDotOn, setDebugDotOn] = useState(false);

  const [finishing, setFinishing] = useState(false);
  const [sending, setSending] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const setTrackingStatus = (message, kind = "") => setTrackingStatusState({ message, kind });
  const setSnapshotStatus = (message, kind = "") => setSnapshotStatusState({ message, kind });
  const setGazeStatus = (message, kind = "") => setGazeStatusState({ message, kind });
  const setGazeAiStatus = (message, ok = false) => setGazeAiStatusState({ message, ok });

  const getContext = useCallback(() => getSessionContext(), []);

  const refreshSessionHealth = useCallback(async () => {
    if (!context.session_id) return;
    try {
      const data = await requestJson(apiUrl(`/debug/session-health/${encodeURIComponent(context.session_id)}`));
      setHealth(data);
    } catch {
      // ignore — session health is best-effort UI info
    }
  }, [context.session_id]);

  // Redirect nếu chưa có session, giống ensureSession() bản cũ.
  useEffect(() => {
    if (!context.session_id) {
      navigate("/");
    }
  }, [context.session_id, navigate]);

  // Khởi tạo live heatmap + gaze client 1 lần khi mount.
  useEffect(() => {
    if (!context.session_id) return undefined;

    const liveHeatmap = createLiveHeatmap();
    liveHeatmap.init();
    window.liveHeatmap = liveHeatmap;
    liveHeatmapRef.current = liveHeatmap;
    liveHeatmap.setOpacity(liveHeatmapOpacity);

    const gazeClient = createGazeClient({
      refs: { video: videoRef, canvas: canvasRef, dot: dotRef },
      getContext,
      setStatus: setGazeStatus,
      setAiStatus: setGazeAiStatus,
      calibrationReady,
      calibrationMessage,
    });
    gazeClientRef.current = gazeClient;
    gazeClient.checkAi();

    window.tracking_events = window.tracking_events || [];
    setEventCount(window.tracking_events.length);

    learnerInfoUpdate();
    refreshSessionHealth();

    loadClientConfig()
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig({ enable_dev_tools: false, enable_mouse_simulation: false }));

    const onTrackingPoint = (event) => {
      if (event.detail?.target_zone) setLastZone(event.detail.target_zone);
      setEventCount(window.tracking_events.length);
    };
    const onGazeChunkSaved = () => {
      refreshSessionHealth();
      setLiveHeatmapPoints(liveHeatmap.getPointCount());
    };
    const onLiveHeatmapUpdated = (event) => {
      setLiveHeatmapPoints(event.detail?.point_count ?? liveHeatmap.getPointCount());
    };
    const onSnapshotCaptured = () => {
      refreshSessionHealth();
    };

    window.addEventListener("eyelearn:tracking-point", onTrackingPoint);
    window.addEventListener("eyelearn:gaze-chunk-saved", onGazeChunkSaved);
    window.addEventListener("eyelearn:live-heatmap-updated", onLiveHeatmapUpdated);
    window.addEventListener("page-snapshot-captured", onSnapshotCaptured);

    return () => {
      window.removeEventListener("eyelearn:tracking-point", onTrackingPoint);
      window.removeEventListener("eyelearn:gaze-chunk-saved", onGazeChunkSaved);
      window.removeEventListener("eyelearn:live-heatmap-updated", onLiveHeatmapUpdated);
      window.removeEventListener("page-snapshot-captured", onSnapshotCaptured);
      gazeClient.destroy();
      liveHeatmap.destroy();
      if (window.liveHeatmap === liveHeatmap) delete window.liveHeatmap;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.session_id]);

  function learnerInfoUpdate() {
    setLearnerInfo(`${context.full_name || context.student_code || "Learner"} · ${context.session_id}`);
  }

  // Role gating — tương đương applyRoleGating() bản cũ.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const admin = context.role === "admin";
    const mouse = admin && config.enable_mouse_simulation && (config.enable_dev_tools || params.get("debug") === "1");
    setIsAdmin(admin);
    setMouseAllowed(mouse);
  }, [context.role, config]);

  // Mouse-simulation capture (chỉ khi isTracking bật, giống captureMousePoint()).
  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    function captureMousePoint(event) {
      if (!isTrackingRef.current) return;
      const now = Date.now();
      if (now - lastCaptureAtRef.current < TRACKING_INTERVAL_MS) return;
      lastCaptureAtRef.current = now;

      const ctx = getSessionContext();
      const targetZone = event.target.closest("[data-zone]")?.dataset.zone || null;
      const point = {
        session_id: ctx.session_id,
        lesson_id: ctx.lesson_id,
        student_code: ctx.student_code,
        full_name: ctx.full_name,
        timestamp_ms: now,
        viewport_x: event.clientX,
        viewport_y: event.clientY,
        x: event.clientX,
        y: event.clientY,
        scroll_x: window.scrollX,
        scroll_y: window.scrollY,
        target_zone: targetZone,
        confidence: 1,
        gaze_status: "mouse_test",
      };

      window.tracking_events = window.tracking_events || [];
      window.tracking_events.push(point);
      const added = window.liveHeatmap?.addPoint(point);
      if (!added) {
        window.dispatchEvent(new CustomEvent("eyelearn:tracking-point", { detail: point }));
      }
      setLastZone(targetZone || "none");
      setEventCount(window.tracking_events.length);
    }

    document.addEventListener("mousemove", captureMousePoint, { passive: true });
    return () => document.removeEventListener("mousemove", captureMousePoint);
  }, []);

  async function sendTrackingEvents() {
    if (!context.session_id) return;
    if (!window.tracking_events?.length) {
      setTrackingStatus("No tracking points to send.");
      return;
    }
    setSending(true);
    setTrackingStatus("Sending tracking points...");

    try {
      const payload = window.tracking_events.slice();
      const response = await fetch(apiUrl("/tracking/points"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const data = await response.json();
      window.tracking_events = [];
      setEventCount(0);
      setLastSend(`${data.inserted} points`);
      setTrackingStatus(`Sent ${data.inserted} tracking points.`, "ok");
      refreshSessionHealth();
    } catch (error) {
      setTrackingStatus(`Send failed: ${error.message}`, "error");
    } finally {
      setSending(false);
    }
  }

  async function recalculateMetrics() {
    if (!context.session_id) return;
    setRecalculating(true);
    setTrackingStatus("Recalculating metrics...");
    try {
      const data = await requestJson(apiUrl(`/metrics/recalculate/${encodeURIComponent(context.session_id)}`), {
        method: "POST",
      });
      setTrackingStatus(`Metrics recalculated for ${data.length} AOIs.`, "ok");
      refreshSessionHealth();
    } catch (error) {
      setTrackingStatus(`Recalculate failed: ${error.message}`, "error");
    } finally {
      setRecalculating(false);
    }
  }

  async function finishSession() {
    if (!context.session_id) return;
    setFinishing(true);
    setTrackingStatus("Finishing session...");
    try {
      await capturePageSnapshot(context.session_id).catch(() => {});
      const response = await fetch(apiUrl(`/sessions/${encodeURIComponent(context.session_id)}/finish`), {
        method: "PATCH",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      setTrackingStatus("Session finished.", "ok");
      refreshSessionHealth();
    } catch (error) {
      setTrackingStatus(`Finish failed: ${error.message}`, "error");
      setFinishing(false);
      return;
    }
    setFinishing(false);
  }

  async function openAnalyticsWithSnapshot() {
    const href = `/analytics?session_id=${encodeURIComponent(context.session_id)}`;
    setTrackingStatus("Capturing page snapshot before analytics...");
    try {
      await capturePageSnapshot(context.session_id);
      refreshSessionHealth();
      setTrackingStatus("Snapshot captured. Opening analytics.", "ok");
    } catch (error) {
      setTrackingStatus(`Snapshot skipped: ${error.message}. Overlay heatmap may fallback to grid.`, "error");
    } finally {
      navigate(href);
    }
  }

  async function captureSnapshotManually() {
    setSnapshotStatus("Capturing page snapshot...");
    try {
      const result = await capturePageSnapshot(context.session_id);
      setSnapshotStatus(`Snapshot captured: ${result.snapshot_url}`, "ok");
    } catch (error) {
      setSnapshotStatus(`Snapshot capture failed: ${error.message}`, "error");
    }
  }

  function toggleLiveHeatmap(checked) {
    setLiveHeatmapOn(checked);
    if (checked) {
      liveHeatmapRef.current?.start();
    } else {
      liveHeatmapRef.current?.stop();
    }
  }

  function toggleMouseTest(checked) {
    setMouseTestOn(checked);
    setIsTracking(checked);
    setTrackingStatus(checked ? "Mouse simulation started." : "Mouse simulation stopped.", checked ? "ok" : "");
  }

  function onOpacityChange(value) {
    setLiveHeatmapOpacityState(value);
    liveHeatmapRef.current?.setOpacity(value);
  }

  function onDebugDotToggle(checked) {
    setDebugDotOn(checked);
    gazeClientRef.current?.setDebugDotVisible(checked);
  }

  if (!context.session_id) return null;

  const analyticsHref = `/analytics?session_id=${encodeURIComponent(context.session_id)}`;

  return (
    <>
      <header className="topbar" data-zone="top_nav">
        <div className="brand">EyeLearn</div>
        <div className="topbar-title">
          <strong>Data Visualization Basics</strong>
          <span>L001 · Đọc biểu đồ dữ liệu</span>
        </div>
        <nav className="role-nav" aria-label="Student navigation">
          <a href="/lesson">Lesson</a>
          <a href="/calibration">Calibration</a>
          <a
            href={analyticsHref}
            onClick={(e) => {
              e.preventDefault();
              openAnalyticsWithSnapshot();
            }}
          >
            My Analytics
          </a>
        </nav>
        <div className="muted">{learnerInfo}</div>
      </header>

      <main className="lesson-shell" id="lesson-root">
        <aside className="panel sidebar" data-zone="lesson_sidebar">
          <h3>Lesson outline</h3>
          <div className="progress-bar" aria-label="progress"><span></span></div>
          <div className="outline">
            <div className="outline-item">1. Nhận diện loại biểu đồ</div>
            <div className="outline-item">2. Đọc trục và đơn vị</div>
            <div className="outline-item">3. So sánh xu hướng</div>
            <div className="outline-item">4. Quiz kiểm tra</div>
          </div>
        </aside>

        <section>
          <div className="lesson-header" data-zone="lesson_header">
            <h1>Đọc biểu đồ dữ liệu</h1>
            <p className="muted">
              Tập trung vào vùng video, transcript, notes và quiz để tạo dữ liệu AOI analytics.
            </p>
          </div>

          <div className="video-block" data-zone="video_area">
            <div className="video-inner">
              <strong>Video bài giảng</strong>
              <span>Data Visualization Basics · 12:45 / 45:00</span>
            </div>
          </div>

          <div className="content-grid">
            <section className="panel" data-zone="quiz_area">
              <h3>Quiz</h3>
              <p>Biểu đồ đường thường phù hợp nhất để thể hiện điều gì?</p>
              <div className="quiz-choice">
                <button type="button">Tỷ lệ thành phần tại một thời điểm</button>
                <button type="button">Xu hướng thay đổi theo thời gian</button>
                <button type="button">Danh sách nhãn phân loại</button>
              </div>
            </section>

            <section className="panel" data-zone="completion_panel">
              <h3>Completion</h3>
              <p className="muted">Finish the lesson session when you are done.</p>
              <a
                className="btn"
                href={analyticsHref}
                onClick={(e) => {
                  e.preventDefault();
                  openAnalyticsWithSnapshot();
                }}
              >
                View analytics
              </a>
            </section>
          </div>

          <section className="panel tracking-panel" data-zone="tracking_panel">
            <h3>Learning session</h3>
            <div className="qa-strip" data-html2canvas-ignore="true">
              <span>Session <strong>created</strong></span>
              <span>Calibration <strong>profile/as-is</strong></span>
              {isAdmin && <span>Chunks <strong>{health.gaze_chunks_count ?? 0}</strong></span>}
              {isAdmin && <span>Tracking points <strong>{health.tracking_points_count ?? 0}</strong></span>}
              {isAdmin && <span>Snapshot <strong>{health.page_snapshot_exists ? "captured" : "missing"}</strong></span>}
            </div>

            <div className="student-actions" data-html2canvas-ignore="true">
              <button className="btn" type="button" onClick={() => navigate("/calibration")}>Go to calibration</button>
              <button className="btn primary" type="button" onClick={() => gazeClientRef.current?.startGaze()}>Start gaze</button>
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  gazeClientRef.current?.stopGaze();
                  setGazeStatus("Gaze tracking stopped.");
                }}
              >
                Stop gaze
              </button>
              <button className="btn" type="button" disabled={finishing} onClick={finishSession}>Finish session</button>
              <a
                className="btn"
                href={analyticsHref}
                onClick={(e) => {
                  e.preventDefault();
                  openAnalyticsWithSnapshot();
                }}
              >
                View analytics
              </a>
            </div>

            {mouseAllowed && (
              <div className="tracking-grid" data-html2canvas-ignore="true" data-mouse-simulation>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    setIsTracking(true);
                    setMouseTestOn(true);
                    setTrackingStatus("Mouse simulation started.", "ok");
                  }}
                >
                  Start mouse simulation
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    setIsTracking(false);
                    setMouseTestOn(false);
                    setTrackingStatus("Mouse simulation stopped.");
                  }}
                >
                  Stop mouse simulation
                </button>
                <button className="btn" type="button" disabled={sending} onClick={sendTrackingEvents}>Send tracking</button>
                <button className="btn" type="button" disabled={recalculating} onClick={recalculateMetrics}>Recalculate metrics</button>
                <button className="btn" type="button" onClick={captureSnapshotManually}>Capture page snapshot</button>
              </div>
            )}
            {mouseAllowed && <p className="muted dev-only-note" data-html2canvas-ignore="true">Mouse simulation - developer only.</p>}

            {isAdmin && (
              <div className="live-heatmap-controls" data-html2canvas-ignore="true">
                <label>
                  <input
                    type="checkbox"
                    checked={liveHeatmapOn}
                    onChange={(e) => toggleLiveHeatmap(e.target.checked)}
                  />{" "}
                  Live heatmap
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={mouseTestOn}
                    onChange={(e) => toggleMouseTest(e.target.checked)}
                  />{" "}
                  Mouse test
                </label>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    liveHeatmapRef.current?.clear();
                    setLiveHeatmapPoints(0);
                  }}
                >
                  Clear heatmap
                </button>
                <label className="opacity-control">
                  Opacity{" "}
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={liveHeatmapOpacity}
                    onChange={(e) => onOpacityChange(Number(e.target.value))}
                  />
                </label>
                <span>Live: <strong>{liveHeatmapOn ? "on" : "off"}</strong></span>
                <span>Mouse test: <strong>{isTracking ? "on" : "off"}</strong></span>
                <span>Points: <strong>{liveHeatmapPoints}</strong></span>
              </div>
            )}
            {isAdmin && <p className="muted live-heatmap-note" data-html2canvas-ignore="true">Live heatmap is a test overlay.</p>}

            <div className="gaze-controls" data-html2canvas-ignore="true">
              {isAdmin && (
                <label>
                  <input type="checkbox" checked={debugDotOn} onChange={(e) => onDebugDotToggle(e.target.checked)} /> Debug dot
                </label>
              )}
              <span>AI: <strong className={gazeAiStatus.ok ? "ok-text" : ""}>{gazeAiStatus.message}</strong></span>
              <span>Gaze: <strong>{gazeStatus.message}</strong></span>
            </div>

            <video ref={videoRef} autoPlay playsInline muted hidden data-html2canvas-ignore="true"></video>
            <canvas ref={canvasRef} hidden data-html2canvas-ignore="true"></canvas>
            <div ref={dotRef} className="gaze-debug-dot" hidden data-html2canvas-ignore="true"></div>

            {isAdmin && (
              <div className="debug-values" data-html2canvas-ignore="true">
                <div><strong>{isTracking ? "tracking" : "idle"}</strong><br /><span className="muted">state</span></div>
                <div><strong>{eventCount}</strong><br /><span className="muted">buffered points</span></div>
                <div><strong>{lastZone}</strong><br /><span className="muted">last target_zone</span></div>
                <div><strong>{lastSend}</strong><br /><span className="muted">last send</span></div>
              </div>
            )}

            <div className={`status-line ${trackingStatus.kind}`.trim()} data-html2canvas-ignore="true">{trackingStatus.message}</div>
            <div className={`status-line ${snapshotStatus.kind}`.trim()} data-html2canvas-ignore="true">{snapshotStatus.message}</div>
          </section>
        </section>

        <aside className="panel right-panel">
          <div className="tabs">
            <button
              className={`btn tab-btn ${activeTab === "transcript" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("transcript")}
            >
              Transcript
            </button>
            <button
              className={`btn tab-btn ${activeTab === "notes" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("notes")}
            >
              Notes
            </button>
          </div>

          <section className={`tab-panel ${activeTab === "transcript" ? "active" : ""}`} data-zone="transcript_panel">
            <h3>Transcript</h3>
            <div className="transcript-list">
              <p><strong>00:00</strong> Hôm nay chúng ta đọc biểu đồ dữ liệu theo ba bước.</p>
              <p><strong>03:10</strong> Đầu tiên, xác định trục, đơn vị đo và khoảng thời gian.</p>
              <p><strong>07:45</strong> Tiếp theo, so sánh xu hướng chính và điểm bất thường.</p>
              <p><strong>12:30</strong> Cuối cùng, diễn giải kết luận bằng ngữ cảnh dữ liệu.</p>
            </div>
          </section>

          <section className={`tab-panel ${activeTab === "notes" ? "active" : ""}`} data-zone="notes_panel">
            <h3>Notes</h3>
            <textarea className="notes-area" placeholder="Write lesson notes..."></textarea>
          </section>
        </aside>
      </main>
    </>
  );
}
