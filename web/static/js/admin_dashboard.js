const API_BASE = window.EYELEARN_API_BASE || "";

const refreshBtn = document.getElementById("refreshAdminBtn");
const healthGrid = document.getElementById("systemHealthGrid");
const overviewGrid = document.getElementById("dataOverviewGrid");
const sessionsList = document.getElementById("adminSessionsList");
const sessionSearch = document.getElementById("sessionSearch");
const rawJson = document.getElementById("adminRawJson");
const statusEl = document.getElementById("adminStatus");
const viewStudentLink = document.getElementById("viewStudentLink");
const viewTeacherLink = document.getElementById("viewTeacherLink");

let overview = null;

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status-line ${kind}`.trim();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function boolLabel(value) {
  return value ? "ok" : "missing";
}

function metricCard(label, value) {
  const card = document.createElement("div");
  card.className = "metric-card";
  card.innerHTML = `<span>${label}</span><strong>${value ?? "-"}</strong>`;
  return card;
}

function renderHealth(health) {
  healthGrid.replaceChildren(
    metricCard("API health", boolLabel(health?.api?.ok)),
    metricCard("DB schema status", boolLabel(health?.db_schema)),
    metricCard("AI service status", boolLabel(health?.ai_service?.ok)),
    metricCard("Cloudinary configured", health?.cloudinary?.configured ? "yes" : "no"),
  );
}

function renderCounts(counts) {
  const labels = {
    users: "Users",
    lessons: "Lessons",
    sessions: "Sessions",
    gaze_chunks: "Gaze chunks",
    tracking_points: "Tracking points",
    aoi_metrics: "AOI metrics",
    heatmaps: "Heatmaps",
    page_snapshots: "Page snapshots",
  };
  overviewGrid.replaceChildren(...Object.entries(labels).map(([key, label]) => metricCard(label, counts?.[key])));
}

function learnerLabel(session) {
  const name = session.full_name || "Learner";
  return session.student_code ? `${name} (${session.student_code})` : name;
}

function adminSessionCard(session) {
  const article = document.createElement("article");
  article.className = "session-card";
  article.innerHTML = `
    <div>
      <h3>${session.session_id}</h3>
      <p class="muted">${learnerLabel(session)} · ${session.lesson_id || "-"}</p>
    </div>
    <dl class="compact-facts">
      <div><dt>Started</dt><dd>${formatDate(session.started_at)}</dd></div>
      <div><dt>Tracking points</dt><dd>${session.tracking_points_count ?? 0}</dd></div>
      <div><dt>Metrics</dt><dd>${session.metrics_count ?? 0}</dd></div>
      <div><dt>Heatmaps</dt><dd>${session.heatmaps_count ?? 0}</dd></div>
      <div><dt>Snapshot</dt><dd>${session.snapshot_captured ? "captured" : "missing"}</dd></div>
    </dl>
    <div class="card-actions">
      <a class="btn primary" href="/analytics?session_id=${encodeURIComponent(session.session_id)}">Open analytics</a>
      <button class="btn" type="button" data-health="${session.session_id}">View health</button>
      <button class="btn" type="button" data-recalculate="${session.session_id}">Recalculate metrics</button>
    </div>
    <pre class="inline-raw" hidden></pre>
  `;
  return article;
}

function renderSessions() {
  const query = sessionSearch.value.trim().toLowerCase();
  const sessions = (overview?.recent_sessions || []).filter((session) => (
    !query || session.session_id.toLowerCase().includes(query)
  ));

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No matching sessions.";
    sessionsList.replaceChildren(empty);
    return;
  }

  sessionsList.replaceChildren(...sessions.map(adminSessionCard));
}

async function loadOverview() {
  localStorage.setItem("role", "admin");
  refreshBtn.disabled = true;
  setStatus("Loading admin overview...");

  try {
    overview = await requestJson(`${API_BASE}/admin/overview`);
    rawJson.textContent = JSON.stringify(overview, null, 2);
    renderHealth(overview.system_health);
    renderCounts(overview.counts);
    renderSessions();
    setStatus("Admin overview loaded.", "ok");
  } catch (error) {
    setStatus(`Cannot load admin overview: ${error.message}`, "error");
  } finally {
    refreshBtn.disabled = false;
  }
}

async function showSessionHealth(button) {
  const sessionId = button.dataset.health;
  const card = button.closest(".session-card");
  const raw = card.querySelector(".inline-raw");
  button.disabled = true;
  try {
    const health = await requestJson(`${API_BASE}/debug/session-health/${encodeURIComponent(sessionId)}`);
    raw.hidden = false;
    raw.textContent = JSON.stringify(health, null, 2);
  } catch (error) {
    setStatus(`Session health failed: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function recalculateSession(button) {
  const sessionId = button.dataset.recalculate;
  button.disabled = true;
  setStatus(`Recalculating metrics for ${sessionId}...`);
  try {
    await requestJson(`${API_BASE}/metrics/recalculate/${encodeURIComponent(sessionId)}`, { method: "POST" });
    setStatus("Metrics recalculated.", "ok");
    await loadOverview();
  } catch (error) {
    setStatus(`Recalculate failed: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

refreshBtn.addEventListener("click", loadOverview);
sessionSearch.addEventListener("input", renderSessions);
sessionsList.addEventListener("click", (event) => {
  const healthButton = event.target.closest("[data-health]");
  const recalculateButton = event.target.closest("[data-recalculate]");
  if (healthButton) showSessionHealth(healthButton);
  if (recalculateButton) recalculateSession(recalculateButton);
});
viewStudentLink.addEventListener("click", () => localStorage.setItem("role", "student"));
viewTeacherLink.addEventListener("click", () => localStorage.setItem("role", "teacher"));

loadOverview();
