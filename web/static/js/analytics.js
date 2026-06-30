const API_BASE = window.EYELEARN_API_BASE || "";

const sessionLabel = document.getElementById("analyticsSessionLabel");
const sessionIdValue = document.getElementById("sessionIdValue");
const learnerInfoValue = document.getElementById("learnerInfoValue");
const lessonIdValue = document.getElementById("lessonIdValue");
const statusEl = document.getElementById("analyticsStatus");
const recalculateBtn = document.getElementById("recalculateMetricsBtn");
const generateFullHeatmapBtn = document.getElementById("generateFullHeatmapBtn");
const generateOverlayHeatmapBtn = document.getElementById("generateOverlayHeatmapBtn");
const generateDebugOverlayBtn = document.getElementById("generateDebugOverlayBtn");
const generateSelectedHeatmapBtn = document.getElementById("generateSelectedHeatmapBtn");
const heatmapAoiSelect = document.getElementById("heatmapAoiSelect");
const heatmapPreview = document.getElementById("heatmapPreview");
const heatmapMeta = document.getElementById("heatmapMeta");
const heatmapList = document.getElementById("heatmapList");
const heatmapDebug = document.getElementById("heatmapDebug");
const totalPoints = document.getElementById("totalPoints");
const mappedPoints = document.getElementById("mappedPoints");
const outsidePoints = document.getElementById("outsidePoints");
const aoisViewed = document.getElementById("aoisViewed");
const sessionHealthAction = document.getElementById("sessionHealthAction");
const healthChunks = document.getElementById("healthChunks");
const healthTrackingPoints = document.getElementById("healthTrackingPoints");
const healthAoiMapping = document.getElementById("healthAoiMapping");
const healthMetrics = document.getElementById("healthMetrics");
const healthHeatmaps = document.getElementById("healthHeatmaps");
const healthSnapshot = document.getElementById("healthSnapshot");
const learningBody = document.getElementById("learningMetricsBody");
const interfaceBody = document.getElementById("interfaceMetricsBody");

let trackingSummary = null;
let selectedHeatmapId = null;

function currentRole() {
  return localStorage.getItem("role") || "student";
}

function applyRoleGating() {
  const role = currentRole();
  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.hidden = role !== "admin";
  });
  document.querySelectorAll("[data-role-link]").forEach((element) => {
    element.hidden = element.dataset.roleLink !== role;
  });
}

function getSessionId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("session_id") || localStorage.getItem("session_id");
}

function getLearnerLabel() {
  const fullName = localStorage.getItem("full_name");
  const studentCode = localStorage.getItem("student_code");
  if (fullName && studentCode) return `${fullName} (${studentCode})`;
  return fullName || studentCode || "-";
}

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status-line ${kind}`.trim();
}

function setHeatmapButtonsLoading(loading) {
  generateFullHeatmapBtn.disabled = loading;
  generateOverlayHeatmapBtn.disabled = loading;
  if (generateDebugOverlayBtn) generateDebugOverlayBtn.disabled = loading;
  generateSelectedHeatmapBtn.disabled = loading;
  generateFullHeatmapBtn.textContent = loading ? "Generating..." : "Generate full heatmap";
  generateOverlayHeatmapBtn.textContent = loading ? "Generating..." : "Generate overlay heatmap";
  if (generateDebugOverlayBtn) generateDebugOverlayBtn.textContent = loading ? "Generating..." : "Generate debug overlay";
  generateSelectedHeatmapBtn.textContent = loading ? "Generating..." : "Generate selected heatmap";
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
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function firstHitDisplay(metric) {
  if (metric.first_hit_ms === null || metric.first_hit_ms === undefined) return "-";
  const value = Number(metric.first_hit_ms);
  const sessionStart = Number(trackingSummary?.session_start_timestamp_ms);
  if (Number.isFinite(sessionStart) && value >= sessionStart) {
    return formatDurationMs(value - sessionStart);
  }
  return formatDurationMs(value);
}

function row(metric) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${metric.aoi_name}</td>
    <td><code>${metric.aoi_key}</code></td>
    <td>${seconds(metric.dwell_time_ms)}</td>
    <td>${pct(metric.dwell_time_pct)}</td>
    <td>${metric.point_count}</td>
    <td>${firstHitDisplay(metric)}</td>
    <td>${metric.revisit_count}</td>
  `;
  return tr;
}

function emptyRow(message) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 7;
  td.className = "empty-cell";
  td.textContent = message;
  tr.append(td);
  return tr;
}

function renderMetrics(metrics) {
  const learning = metrics.filter((metric) => metric.is_learning_area);
  const ui = metrics.filter((metric) => !metric.is_learning_area);
  aoisViewed.textContent = String(metrics.filter((metric) => metric.point_count > 0).length);

  learningBody.replaceChildren(...(learning.length ? learning.map(row) : [emptyRow("No learning AOI metrics yet.")]));
  interfaceBody.replaceChildren(...(ui.length ? ui.map(row) : [emptyRow("No interface AOI metrics yet.")]));
}

function renderTrackingSummary(summary, metrics = []) {
  const mappedFallback = metrics.reduce((sum, metric) => sum + metric.point_count, 0);
  const mapped = summary?.mapped_points ?? mappedFallback;
  const total = summary?.total_points ?? mapped;
  const outside = summary?.outside_aoi_points ?? Math.max(0, total - mapped);

  totalPoints.textContent = String(total);
  mappedPoints.textContent = String(mapped);
  outsidePoints.textContent = String(outside);
}

function renderSessionHealth(health) {
  if (!health) return;
  healthChunks.textContent = String(health.gaze_chunks_count ?? 0);
  healthTrackingPoints.textContent = String(health.tracking_points_count ?? 0);
  healthAoiMapping.textContent = health.aoi_mapping_ok ? "ok" : "missing";
  healthMetrics.textContent = String(health.metrics_count ?? 0);
  healthHeatmaps.textContent = String(health.heatmaps_count ?? 0);
  healthSnapshot.textContent = health.page_snapshot_exists ? "captured" : "missing";
  sessionHealthAction.textContent = health.recommended_next_action || "";
}

function renderHeatmapMeta(heatmap) {
  if (!heatmap) {
    heatmapMeta.replaceChildren();
    return;
  }

  const items = [
    ["Scope", heatmap.aoi_key || "Whole session"],
    ["Status", heatmap.status],
    ["Points", String(heatmap.point_count ?? 0)],
    ["Generated", formatDate(heatmap.generated_at)],
    ["Storage", storageLabel(heatmap)],
    ["Mode", heatmapModeLabel(heatmap)],
    ["Background", heatmapBackgroundLabel(heatmap)],
  ];

  heatmapMeta.replaceChildren(...items.map(([label, value]) => {
    const item = document.createElement("div");
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    return item;
  }));
}

function renderHeatmapPreview(heatmap) {
  selectedHeatmapId = heatmap?.heatmap_id || null;
  renderHeatmapMeta(heatmap);

  if (!heatmap || heatmap.status === "failed") {
    heatmapPreview.replaceChildren(Object.assign(document.createElement("span"), {
      textContent: heatmap?.error_message || "Heatmap generation failed.",
    }));
    return;
  }

  if (!heatmap.image_url) {
    heatmapPreview.replaceChildren(Object.assign(document.createElement("span"), {
      textContent: "No image_url returned for this heatmap.",
    }));
    return;
  }

  const image = document.createElement("img");
  image.src = heatmap.image_url;
  image.alt = `Heatmap ${heatmap.aoi_key || "whole session"}`;
  heatmapPreview.replaceChildren(image);
  updateHeatmapSelection();
}

function heatmapItem(heatmap) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `heatmap-item ${heatmap.heatmap_id === selectedHeatmapId ? "selected" : ""}`.trim();
  button.dataset.heatmapId = heatmap.heatmap_id;
  button.disabled = heatmap.status !== "done" || !heatmap.image_url;
  button.innerHTML = `
    <strong>${heatmap.aoi_key || "Whole session"}</strong>
    <span>${heatmap.status} · ${heatmap.point_count ?? 0} points</span>
    <span>${formatDate(heatmap.generated_at)} · ${storageLabel(heatmap)}</span>
    <span>${heatmapModeLabel(heatmap)} · ${heatmapBackgroundLabel(heatmap)}</span>
  `;
  button.addEventListener("click", () => renderHeatmapPreview(heatmap));
  return button;
}

function updateHeatmapSelection() {
  heatmapList.querySelectorAll(".heatmap-item").forEach((item) => {
    item.classList.toggle("selected", item.dataset.heatmapId === selectedHeatmapId);
  });
}

function renderHeatmaps(heatmaps) {
  if (!heatmaps.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No generated heatmaps yet.";
    heatmapList.replaceChildren(empty);
    renderHeatmapMeta(null);
    return;
  }

  heatmapList.replaceChildren(...heatmaps.map(heatmapItem));
  const latestDone = heatmaps.find((heatmap) => heatmap.heatmap_id === selectedHeatmapId)
    || heatmaps.find((heatmap) => heatmap.status === "done" && heatmap.image_url);
  if (latestDone) renderHeatmapPreview(latestDone);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

function fetchMetrics(sessionId) {
  return requestJson(`${API_BASE}/metrics/${encodeURIComponent(sessionId)}`);
}

function fetchHeatmaps(sessionId) {
  return requestJson(`${API_BASE}/heatmaps/${encodeURIComponent(sessionId)}`);
}

function fetchTrackingSummary(sessionId) {
  return requestJson(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/tracking-summary`);
}

function fetchSessionHealth(sessionId) {
  return requestJson(`${API_BASE}/debug/session-health/${encodeURIComponent(sessionId)}`);
}

function generateHeatmap(sessionId, aoiKey, options = {}) {
  const params = new URLSearchParams();
  if (aoiKey) params.set("aoi_key", aoiKey);
  if (options.debug) params.set("debug", "1");
  if (options.mode) params.set("mode", options.mode);
  const query = params.toString() ? `?${params.toString()}` : "";
  return requestJson(`${API_BASE}/heatmaps/generate/${encodeURIComponent(sessionId)}${query}`, {
    method: "POST",
  });
}

function recalculate(sessionId) {
  return requestJson(`${API_BASE}/metrics/recalculate/${encodeURIComponent(sessionId)}`, {
    method: "POST",
  });
}

async function reloadHeatmaps(sessionId) {
  const heatmaps = await fetchHeatmaps(sessionId);
  renderHeatmaps(heatmaps);
  fetchSessionHealth(sessionId).then(renderSessionHealth).catch(() => {});
  return heatmaps;
}

async function handleGenerate(aoiKey, options = {}) {
  const sessionId = getSessionId();
  if (!sessionId) {
    setStatus("No session_id found. Open analytics with ?session_id=... or start a session first.", "error");
    return;
  }

  setHeatmapButtonsLoading(true);
  const scope = aoiKey || "whole session";
  setStatus(options.debug ? `Generating debug overlay for ${scope}...` : `Generating heatmap for ${scope}...`);

  try {
    const heatmap = await generateHeatmap(sessionId, aoiKey, options);
    heatmapDebug.textContent = JSON.stringify(heatmap, null, 2);

    if (heatmap.status !== "done") {
      renderHeatmapPreview(heatmap);
      setStatus(heatmap.error_message || "Heatmap generation failed.", "error");
      await reloadHeatmaps(sessionId);
      return;
    }

    if (!heatmap.image_url) {
      renderHeatmapPreview(heatmap);
      setStatus("Heatmap generated, but no image_url was returned.", "error");
      await reloadHeatmaps(sessionId);
      return;
    }

    renderHeatmapPreview(heatmap);
    await reloadHeatmaps(sessionId);
    if (!heatmap.metadata_json?.overlay_mode && (options.debug || options.mode === "overlay")) {
      setStatus("No page snapshot found. Generated grid fallback heatmap. Go back to lesson and capture snapshot first for overlay.", "error");
    } else {
      setStatus(`Generated ${heatmapModeLabel(heatmap)} from ${heatmap.point_count} points.`, "ok");
    }
  } catch (error) {
    const noPoints = error.message.includes("No tracking_points");
    setStatus(noPoints ? "No tracking_points found for this session or AOI." : `Generate heatmap failed: ${error.message}`, "error");
  } finally {
    setHeatmapButtonsLoading(false);
  }
}

async function load() {
  const sessionId = getSessionId();
  if (!sessionId) {
    sessionLabel.textContent = "No session";
    setStatus("No session_id found. Open analytics with ?session_id=... or start a session first.", "error");
    return;
  }

  sessionLabel.textContent = sessionId;
  sessionIdValue.textContent = sessionId;
  learnerInfoValue.textContent = getLearnerLabel();
  lessonIdValue.textContent = localStorage.getItem("lesson_id") || "-";
  setStatus("Loading analytics...");

  try {
    const [metrics, summary] = await Promise.all([
      fetchMetrics(sessionId),
      fetchTrackingSummary(sessionId),
      fetchSessionHealth(sessionId).then(renderSessionHealth),
      reloadHeatmaps(sessionId),
    ]);
    trackingSummary = summary;
    renderTrackingSummary(summary, metrics);
    renderMetrics(metrics);
    setStatus(`Loaded ${metrics.length} AOI metrics.`, "ok");
  } catch (error) {
    setStatus(`Cannot load analytics: ${error.message}`, "error");
  }
}

recalculateBtn.addEventListener("click", async () => {
  const sessionId = getSessionId();
  if (!sessionId) {
    setStatus("No session_id found. Open analytics with ?session_id=... or start a session first.", "error");
    return;
  }

  recalculateBtn.disabled = true;
  setStatus("Recalculating metrics...");

  try {
    await recalculate(sessionId);
    const [metrics, summary] = await Promise.all([
      fetchMetrics(sessionId),
      fetchTrackingSummary(sessionId),
      fetchSessionHealth(sessionId).then(renderSessionHealth),
    ]);
    trackingSummary = summary;
    renderTrackingSummary(summary, metrics);
    renderMetrics(metrics);
    setStatus(`Recalculated ${metrics.length} AOI metrics.`, "ok");
  } catch (error) {
    setStatus(`Recalculate failed: ${error.message}`, "error");
  } finally {
    recalculateBtn.disabled = false;
  }
});

generateFullHeatmapBtn.addEventListener("click", () => handleGenerate(null));
generateOverlayHeatmapBtn.addEventListener("click", () => handleGenerate(null, { mode: "overlay" }));
generateDebugOverlayBtn?.addEventListener("click", () => handleGenerate(heatmapAoiSelect.value || null, { debug: true }));
generateSelectedHeatmapBtn.addEventListener("click", () => handleGenerate(heatmapAoiSelect.value || null));

applyRoleGating();
load();
