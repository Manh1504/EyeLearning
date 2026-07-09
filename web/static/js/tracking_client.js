const API_BASE = window.EYELEARN_API_BASE || "";
const DEFAULT_LESSON_ID = "L001";
const TRACKING_INTERVAL_MS = 100;

window.tracking_events = window.tracking_events || [];

let isTracking = false;
let lastCaptureAt = 0;

const learnerInfo = document.getElementById("learnerInfo");
const startBtn = document.getElementById("startTrackingBtn");
const stopBtn = document.getElementById("stopTrackingBtn");
const sendBtn = document.getElementById("sendTrackingBtn");
const recalculateBtn = document.getElementById("recalculateBtn");
const eventCount = document.getElementById("eventCount");
const trackingState = document.getElementById("trackingState");
const lastZone = document.getElementById("lastZone");
const lastSend = document.getElementById("lastSend");
const statusEl = document.getElementById("trackingStatus");
const analyticsLink = document.getElementById("analyticsLink");
const completionAnalyticsLink = document.getElementById("completionAnalyticsLink");
const topAnalyticsLink = document.getElementById("topAnalyticsLink");
const finishSessionBtn = document.getElementById("finishSessionBtn");
const qaChunksState = document.getElementById("qaChunksState");
const qaTrackingPointsState = document.getElementById("qaTrackingPointsState");
const qaSnapshotState = document.getElementById("qaSnapshotState");
const liveHeatmapToggle = document.getElementById("liveHeatmapToggle");
const mouseTestToggle = document.getElementById("mouseTestToggle");
const clearLiveHeatmapBtn = document.getElementById("clearLiveHeatmapBtn");
const liveHeatmapOpacity = document.getElementById("liveHeatmapOpacity");
const liveHeatmapState = document.getElementById("liveHeatmapState");
const mouseTestState = document.getElementById("mouseTestState");
const liveHeatmapPoints = document.getElementById("liveHeatmapPoints");

function getSessionContext() {
  return {
    session_id: localStorage.getItem("session_id"),
    lesson_id: localStorage.getItem("lesson_id") || DEFAULT_LESSON_ID,
    student_code: localStorage.getItem("student_code"),
    full_name: localStorage.getItem("full_name"),
    role: localStorage.getItem("role") || "student",
  };
}

function setStatus(message, kind = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status-line ${kind}`.trim();
}

function updateDebug() {
  eventCount.textContent = String(window.tracking_events.length);
  trackingState.textContent = isTracking ? "tracking" : "idle";
  updateLiveHeatmapStatus();
}

function updateLiveHeatmapStatus() {
  if (liveHeatmapState) liveHeatmapState.textContent = liveHeatmapToggle?.checked ? "on" : "off";
  if (mouseTestState) mouseTestState.textContent = isTracking ? "on" : "off";
  if (liveHeatmapPoints) liveHeatmapPoints.textContent = String(window.liveHeatmap?.getPointCount() ?? 0);
  if (mouseTestToggle) mouseTestToggle.checked = isTracking;
}

function publishTrackingPoint(point) {
  const added = window.liveHeatmap?.addPoint(point);
  if (!added) {
    window.dispatchEvent(new CustomEvent("eyelearn:tracking-point", { detail: point }));
  }
}

async function refreshSessionHealth() {
  const context = getSessionContext();
  if (!context.session_id) return;
  const response = await fetch(`${API_BASE}/debug/session-health/${encodeURIComponent(context.session_id)}`);
  if (!response.ok) return;
  const health = await response.json();
  if (qaChunksState) qaChunksState.textContent = String(health.gaze_chunks_count ?? 0);
  if (qaTrackingPointsState) qaTrackingPointsState.textContent = String(health.tracking_points_count ?? 0);
  if (qaSnapshotState) qaSnapshotState.textContent = health.page_snapshot_exists ? "captured" : "missing";
}

function ensureSession() {
  const context = getSessionContext();
  if (!context.session_id) {
    window.location.href = "/";
    return null;
  }
  return context;
}

function captureMousePoint(event) {
  if (!isTracking) return;

  const now = Date.now();
  if (now - lastCaptureAt < TRACKING_INTERVAL_MS) return;
  lastCaptureAt = now;

  const context = getSessionContext();
  const targetZone = event.target.closest("[data-zone]")?.dataset.zone || null;
  const point = {
    session_id: context.session_id,
    lesson_id: context.lesson_id,
    student_code: context.student_code,
    full_name: context.full_name,
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

  window.tracking_events.push(point);
  publishTrackingPoint(point);
  lastZone.textContent = targetZone || "none";
  updateDebug();
}

async function sendTrackingEvents() {
  const context = ensureSession();
  if (!context) return;
  if (!window.tracking_events.length) {
    setStatus("No tracking points to send.");
    return;
  }

  sendBtn.disabled = true;
  setStatus("Sending tracking points...");

  const payload = window.tracking_events.slice();
  const response = await fetch(`${API_BASE}/tracking/points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    sendBtn.disabled = false;
    setStatus(`Send failed: ${text || response.status}`, "error");
    return;
  }

  const data = await response.json();
  window.tracking_events = [];
  lastSend.textContent = `${data.inserted} points`;
  setStatus(`Sent ${data.inserted} tracking points.`, "ok");
  sendBtn.disabled = false;
  updateDebug();
  refreshSessionHealth().catch(() => {});
}

async function recalculateMetrics() {
  const context = ensureSession();
  if (!context) return;

  recalculateBtn.disabled = true;
  setStatus("Recalculating metrics...");

  const response = await fetch(`${API_BASE}/metrics/recalculate/${encodeURIComponent(context.session_id)}`, {
    method: "POST",
  });

  recalculateBtn.disabled = false;

  if (!response.ok) {
    const text = await response.text();
    setStatus(`Recalculate failed: ${text || response.status}`, "error");
    return;
  }

  const data = await response.json();
  setStatus(`Metrics recalculated for ${data.length} AOIs.`, "ok");
  refreshSessionHealth().catch(() => {});
}

function initTabs() {
  const buttons = [...document.querySelectorAll(".tab-btn")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      document.getElementById("transcriptPanel").classList.toggle("active", button.dataset.tab === "transcript");
      document.getElementById("notesPanel").classList.toggle("active", button.dataset.tab === "notes");
    });
  });
}

function initLinks(sessionId) {
  const href = `/analytics?session_id=${encodeURIComponent(sessionId)}`;
  if (analyticsLink) analyticsLink.href = href;
  if (completionAnalyticsLink) completionAnalyticsLink.href = href;
  if (topAnalyticsLink) topAnalyticsLink.href = href;
}

async function loadClientConfig() {
  try {
    const response = await fetch("/client-config");
    if (!response.ok) return {};
    return response.json();
  } catch {
    return {};
  }
}

function applyRoleGating(config) {
  const role = localStorage.getItem("role") || "student";
  const params = new URLSearchParams(window.location.search);
  const debugAllowed = role === "admin";
  const mouseAllowed = debugAllowed && config.enable_mouse_simulation && (config.enable_dev_tools || params.get("debug") === "1");

  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.hidden = !debugAllowed;
  });
  document.querySelectorAll("[data-mouse-simulation]").forEach((element) => {
    element.hidden = !mouseAllowed;
  });
}

async function finishSession() {
  const context = ensureSession();
  if (!context) return;

  finishSessionBtn.disabled = true;
  setStatus("Finishing session...");

  try {
    if (window.capturePageSnapshot) {
      await window.capturePageSnapshot().catch(() => {});
    }
    const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(context.session_id)}/finish`, {
      method: "PATCH",
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    setStatus("Session finished.", "ok");
    refreshSessionHealth().catch(() => {});
  } catch (error) {
    setStatus(`Finish failed: ${error.message}`, "error");
    finishSessionBtn.disabled = false;
  }
}

async function openAnalyticsWithSnapshot(event) {
  event.preventDefault();
  const href = event.currentTarget.href;
  if (!window.capturePageSnapshot) {
    setStatus("Snapshot capture is unavailable. Opening analytics with grid fallback.", "error");
    window.location.href = href;
    return;
  }

  setStatus("Capturing page snapshot before analytics...");
  try {
    await window.capturePageSnapshot();
    refreshSessionHealth().catch(() => {});
    setStatus("Snapshot captured. Opening analytics.", "ok");
  } catch (error) {
    setStatus(`Snapshot skipped: ${error.message}. Overlay heatmap may fallback to grid.`, "error");
  } finally {
    window.location.href = href;
  }
}

async function init() {
  const context = ensureSession();
  if (!context) return;

  applyRoleGating(await loadClientConfig());
  learnerInfo.textContent = `${context.full_name || context.student_code || "Learner"} · ${context.session_id}`;
  initLinks(context.session_id);
  initTabs();
  updateDebug();
  refreshSessionHealth().catch(() => {});
  window.liveHeatmap?.init();
  window.liveHeatmap?.setOpacity(Number(liveHeatmapOpacity?.value || 0.35));

  document.addEventListener("mousemove", captureMousePoint, { passive: true });

  startBtn?.addEventListener("click", () => {
    isTracking = true;
    if (mouseTestToggle) mouseTestToggle.checked = true;
    setStatus("Mouse simulation started.", "ok");
    updateDebug();
  });

  stopBtn?.addEventListener("click", () => {
    isTracking = false;
    if (mouseTestToggle) mouseTestToggle.checked = false;
    setStatus("Mouse simulation stopped.");
    updateDebug();
  });

  liveHeatmapToggle?.addEventListener("change", () => {
    if (liveHeatmapToggle.checked) {
      window.liveHeatmap?.start();
    } else {
      window.liveHeatmap?.stop();
    }
    updateLiveHeatmapStatus();
  });

  mouseTestToggle?.addEventListener("change", () => {
    isTracking = mouseTestToggle.checked;
    setStatus(isTracking ? "Mouse simulation started." : "Mouse simulation stopped.", isTracking ? "ok" : "");
    updateDebug();
  });

  clearLiveHeatmapBtn?.addEventListener("click", () => {
    window.liveHeatmap?.clear();
    updateLiveHeatmapStatus();
  });

  liveHeatmapOpacity?.addEventListener("input", () => {
    window.liveHeatmap?.setOpacity(Number(liveHeatmapOpacity.value));
  });

  sendBtn?.addEventListener("click", () => {
    sendTrackingEvents().catch((error) => setStatus(error.message, "error"));
  });

  recalculateBtn?.addEventListener("click", () => {
    recalculateMetrics().catch((error) => setStatus(error.message, "error"));
  });

  finishSessionBtn?.addEventListener("click", () => {
    finishSession().catch((error) => setStatus(error.message, "error"));
  });

  window.addEventListener("page-snapshot-captured", () => {
    refreshSessionHealth().catch(() => {});
  });

  window.addEventListener("eyelearn:tracking-point", (event) => {
    if (event.detail?.target_zone && lastZone) lastZone.textContent = event.detail.target_zone;
    updateDebug();
  });
  window.addEventListener("eyelearn:gaze-chunk-saved", () => {
    refreshSessionHealth().catch(() => {});
    updateLiveHeatmapStatus();
  });
  window.addEventListener("eyelearn:live-heatmap-updated", () => {
    updateLiveHeatmapStatus();
  });

  analyticsLink?.addEventListener("click", openAnalyticsWithSnapshot);
  completionAnalyticsLink?.addEventListener("click", openAnalyticsWithSnapshot);
}

init();
