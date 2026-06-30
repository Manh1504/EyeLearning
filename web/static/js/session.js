const API_BASE = window.EYELEARN_API_BASE || "";
const LESSON_ID = "L001";

const form = document.getElementById("startForm");
const statusEl = document.getElementById("startStatus");
const roleSelect = document.getElementById("roleSelect");
const fullNameInput = document.getElementById("fullName");
const studentCodeInput = document.getElementById("studentCode");

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status-line ${kind}`.trim();
}

function normalizeCode(value) {
  return value.trim().replace(/\s+/g, "_");
}

async function createBackendSession(payload) {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json();
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const role = roleSelect?.value || "student";
  const fullName = fullNameInput.value.trim();
  const studentCode = normalizeCode(studentCodeInput.value);

  if (!fullName || (role === "student" && !studentCode)) {
    setStatus("Nhập đầy đủ full name và student code.", "error");
    return;
  }

  const identityCode = studentCode || role;
  const sessionId = role === "student" ? `S_${identityCode}_${Date.now()}` : "";
  localStorage.setItem("role", role);
  localStorage.setItem("full_name", fullName);
  localStorage.setItem("student_code", studentCode);
  localStorage.setItem("session_id", sessionId);
  localStorage.setItem("lesson_id", LESSON_ID);

  if (role === "teacher") {
    setStatus("Opening teacher dashboard...", "ok");
    window.location.href = "/teacher";
    return;
  }

  if (role === "admin") {
    setStatus("Opening admin dashboard...", "ok");
    window.location.href = "/admin";
    return;
  }

  const payload = {
    session_id: sessionId,
    student_code: studentCode,
    full_name: fullName,
    role,
    lesson_id: LESSON_ID,
    is_fullscreen: Boolean(document.fullscreenElement),
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
  };

  setStatus("Creating session...");
  form.querySelector("button").disabled = true;

  try {
    const session = await createBackendSession(payload);
    localStorage.setItem("session_id", session.session_id || sessionId);
    setStatus("Session ready. Opening lesson...", "ok");
    window.location.href = "/lesson";
  } catch (error) {
    form.querySelector("button").disabled = false;
    setStatus(`Cannot create session: ${error.message}`, "error");
  }
});
