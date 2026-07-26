import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl, requestJson } from "../lib/api.js";
import { LESSON_ID, setSessionContext } from "../lib/session.js";

function normalizeCode(value) {
  return value.trim().replace(/\s+/g, "_");
}

export default function StartPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("student");
  const [fullName, setFullName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedName = fullName.trim();
    const normalizedCode = normalizeCode(studentCode);

    if (!trimmedName || (role === "student" && !normalizedCode)) {
      setStatus({ message: "Nhập đầy đủ full name và student code.", kind: "error" });
      return;
    }

    const identityCode = normalizedCode || role;
    const sessionId = role === "student" ? `S_${identityCode}_${Date.now()}` : "";

    setSessionContext({
      role,
      full_name: trimmedName,
      student_code: normalizedCode,
      session_id: sessionId,
      lesson_id: LESSON_ID,
    });

    if (role === "teacher") {
      setStatus({ message: "Opening teacher dashboard...", kind: "ok" });
      navigate("/teacher");
      return;
    }

    if (role === "admin") {
      setStatus({ message: "Opening admin dashboard...", kind: "ok" });
      navigate("/admin");
      return;
    }

    const payload = {
      session_id: sessionId,
      student_code: normalizedCode,
      full_name: trimmedName,
      role,
      lesson_id: LESSON_ID,
      is_fullscreen: Boolean(document.fullscreenElement),
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
    };

    setStatus({ message: "Creating session...", kind: "" });
    setSubmitting(true);

    try {
      const session = await requestJson(apiUrl("/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSessionContext({ session_id: session.session_id || sessionId });
      setStatus({ message: "Session ready. Opening lesson...", kind: "ok" });
      navigate("/lesson");
    } catch (error) {
      setSubmitting(false);
      setStatus({ message: `Cannot create session: ${error.message}`, kind: "error" });
    }
  }

  return (
    <>
      <header className="topbar" data-zone="top_nav">
        <div className="brand">EyeLearn</div>
        <div className="topbar-title">
          <strong>Data Visualization Basics</strong>
          <span>L001 · Đọc biểu đồ dữ liệu</span>
        </div>
      </header>

      <main className="page start-shell">
        <section className="course-panel">
          <div className="course-kicker">LMS Session Entry</div>
          <h1>Data Visualization Basics</h1>
          <p className="muted">
            Bắt đầu phiên học để ghi tracking points theo AOI và xem analytics sau bài học.
          </p>
          <div className="course-meta">
            <span className="pill">L001</span>
            <span className="pill">Đọc biểu đồ dữ liệu</span>
            <span className="pill">Role-based LMS demo</span>
          </div>
        </section>

        <section className="form-panel">
          <h2>Start EyeLearn</h2>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="roleSelect">View as</label>
              <select id="roleSelect" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="studentCode">Student code</label>
              <input
                id="studentCode"
                autoComplete="username"
                required
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
              />
            </div>
            <button className="btn primary" type="submit" disabled={submitting}>
              Start Session
            </button>
            <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
          </form>
        </section>
      </main>
    </>
  );
}
