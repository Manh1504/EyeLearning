const API_BASE = window.EYELEARN_API_BASE || "";

const lessonSelect = document.getElementById("lessonSelect");
const refreshBtn = document.getElementById("refreshTeacherBtn");
const sessionsList = document.getElementById("teacherSessionsList");
const sessionSummary = document.getElementById("teacherSessionSummary");
const statusEl = document.getElementById("teacherStatus");

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status-line ${kind}`.trim();
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function requestJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

function learnerLabel(session) {
  const name = session.full_name || "Learner";
  return session.student_code ? `${name} (${session.student_code})` : name;
}

function sessionCard(session) {
  const article = document.createElement("article");
  article.className = "session-card";
  article.innerHTML = `
    <div>
      <h3>${session.session_id}</h3>
      <p class="muted">${learnerLabel(session)}</p>
    </div>
    <dl class="compact-facts">
      <div><dt>Started</dt><dd>${formatDate(session.started_at)}</dd></div>
      <div><dt>Tracking points</dt><dd>${session.tracking_points_count ?? 0}</dd></div>
      <div><dt>Metrics</dt><dd>${session.metrics_count ?? 0}</dd></div>
      <div><dt>Heatmaps</dt><dd>${session.heatmaps_count ?? 0}</dd></div>
      <div><dt>Snapshot</dt><dd>${session.snapshot_captured ? "captured" : "missing"}</dd></div>
    </dl>
    <a class="btn primary" href="/analytics?session_id=${encodeURIComponent(session.session_id)}">View analytics</a>
  `;
  return article;
}

function renderSessions(sessions) {
  sessionSummary.textContent = `${sessions.length} session${sessions.length === 1 ? "" : "s"} for ${lessonSelect.value}`;
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No sessions found for this lesson.";
    sessionsList.replaceChildren(empty);
    return;
  }
  sessionsList.replaceChildren(...sessions.map(sessionCard));
}

async function loadSessions() {
  localStorage.setItem("role", "teacher");
  localStorage.setItem("lesson_id", lessonSelect.value);
  refreshBtn.disabled = true;
  setStatus("Loading sessions...");

  try {
    const sessions = await requestJson(`${API_BASE}/lessons/${encodeURIComponent(lessonSelect.value)}/sessions`);
    renderSessions(sessions);
    setStatus("Sessions loaded.", "ok");
  } catch (error) {
    sessionsList.replaceChildren();
    sessionSummary.textContent = "Sessions unavailable.";
    setStatus(`Cannot load sessions: ${error.message}`, "error");
  } finally {
    refreshBtn.disabled = false;
  }
}

lessonSelect.addEventListener("change", loadSessions);
refreshBtn.addEventListener("click", loadSessions);

loadSessions();
