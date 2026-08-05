import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { setSessionContext } from "../lib/session.js";

function normalizeCode(value) {
  return value.trim().replace(/\s+/g, "_");
}

function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3 4.5 20.5 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 12s3.5-6.5 8-6.5c1.1 0 2.1.2 3 .6M20 12s-3.5 6.5-8 6.5c-1.2 0-2.2-.2-3.1-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.2 9.2A3 3 0 0 0 12 15a3 3 0 0 0 2.7-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="m4.5 10.5 3.2 3.2L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const benefits = [
  "Theo dõi điểm nhìn trong quá trình học.",
  "Tái sử dụng hồ sơ hiệu chỉnh.",
  "Phân tích mức độ chú ý theo từng trang.",
];

const heroStatuses = [
  { label: "Theo dõi", value: "Ổn định" },
  { label: "Hiệu chỉnh", value: "Sẵn sàng" },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [submitting, setSubmitting] = useState(false);
  const statusId = "login-status";
  const identifierId = "login-identifier";
  const passwordId = "login-password";

  async function handleSubmit(event) {
    event.preventDefault();
    sessionStorage.removeItem("ela_logged_out");

    const normalizedIdentifier = normalizeCode(identifier);

    if (!normalizedIdentifier) {
      setStatus({ message: "Nhập email hoặc mã sinh viên để đăng nhập.", kind: "error" });
      return;
    }

    ["session_id", "course_id", "course_item_id", "pdf_lesson_id", "test_id", "module_id", "activity_id", "content_version_id", "calibration_ready"].forEach((key) => {
      localStorage.removeItem(key);
    });
    setSubmitting(true);
    setStatus({ message: "Đang xác thực...", kind: "" });

    try {
      const user = await login({
        identifier: normalizedIdentifier,
        password,
      });
      setSessionContext({
        role: user.role,
        full_name: user.full_name || "",
        student_code: user.student_code || "",
      });

      if (user.role === "teacher") {
        navigate("/teacher");
        return;
      }
      if (user.role === "admin") {
        navigate("/admin");
        return;
      }
      navigate("/courses");
    } catch (error) {
      setStatus({ message: `Không thể đăng nhập: ${error.message}`, kind: "error" });
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="topbar auth-topbar">
        <div className="auth-topbar__inner">
          <Link className="brand auth-brand-link" to="/">ELA</Link>
          <nav className="auth-top-links" aria-label="Điều hướng phụ">
            <Link to="/#features">Giới thiệu</Link>
            <Link to="/#privacy">Trợ giúp</Link>
          </nav>
        </div>
      </header>

      <main className="auth-layout login-page">
        <section className="auth-layout__intro" aria-label="Giới thiệu ELA">
          <div className="auth-layout__intro-inner">
            <p className="auth-kicker">Nền tảng học tập có eye-tracking</p>
            <h1>Hiểu cách người học<br />tương tác với bài giảng</h1>
            <p>
              Học qua tài liệu, theo dõi mức độ tập trung và phân tích cách người học tương tác với từng nội dung.
            </p>

            <div className="auth-hero-card" aria-hidden="true">
              <div className="auth-hero-visual">
                <article className="auth-slide-mockup">
                  <div className="auth-slide-header">
                    <div>
                      <span className="auth-slide-eyebrow">Tài liệu học tập</span>
                      <strong>Nội dung bài học PDF</strong>
                    </div>
                    <span className="auth-slide-badge">Trang 03</span>
                  </div>
                  <div className="auth-slide-content">
                    <div className="auth-slide-text-block auth-slide-text-block--lg" />
                    <div className="auth-slide-text-block" />
                    <div className="auth-slide-text-block auth-slide-text-block--sm" />
                    <div className="auth-slide-heatmap">
                      <span className="auth-gaze-dot auth-gaze-dot--one" />
                      <span className="auth-gaze-dot auth-gaze-dot--two" />
                      <span className="auth-gaze-dot auth-gaze-dot--three" />
                    </div>
                  </div>
                  <div className="auth-slide-footer" aria-hidden="true">
                    <span className="auth-slide-step is-active" />
                    <span className="auth-slide-step" />
                    <span className="auth-slide-step" />
                    <span className="auth-slide-step" />
                  </div>
                </article>

                <div className="auth-status-stack">
                  {heroStatuses.map((item) => (
                    <div className="auth-status-card" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <ul className="auth-check-list">
              {benefits.map((item) => (
                <li key={item}>
                  <CheckIcon className="auth-check-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-layout__form" aria-label="Form đăng nhập">
          <div className="auth-layout__form-inner">
            <div className="auth-form-header">
              <h2>Chào mừng quay lại</h2>
              <p>Đăng nhập để tiếp tục học tập trên ELA.</p>
            </div>

            <form className="form-stack" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor={identifierId}>Email hoặc mã sinh viên</label>
                <input
                  id={identifierId}
                  autoComplete="username"
                  required
                  placeholder="Nhập email hoặc mã sinh viên"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  aria-describedby={statusId}
                  aria-invalid={status.kind === "error"}
                  disabled={submitting}
                />
              </div>

              <div className="field">
                <label htmlFor={passwordId}>Mật khẩu</label>
                <div className="password-field">
                  <input
                    id={passwordId}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby={statusId}
                    aria-invalid={status.kind === "error"}
                    disabled={submitting}
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    disabled={submitting}
                  >
                    {showPassword ? <EyeOffIcon className="password-toggle__icon" /> : <EyeIcon className="password-toggle__icon" />}
                  </button>
                </div>
              </div>

              <a className="auth-forgot" href="mailto:support@ela.edu.vn?subject=ELA%20-%20Quen%20mat%20khau">Quên mật khẩu?</a>

              <button className="btn primary login-submit" type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting ? <span className="login-submit__spinner" aria-hidden="true" /> : null}
                <span>{submitting ? "Đang đăng nhập..." : "Đăng nhập"}</span>
              </button>

              <div
                id={statusId}
                className={`status-line ${status.kind}`.trim()}
                role={status.kind === "error" ? "alert" : "status"}
                aria-live={status.kind === "error" ? "assertive" : "polite"}
                aria-atomic="true"
              >
                {status.message}
              </div>

              <p className="auth-support">
                Cần hỗ trợ đăng nhập? <a href="mailto:support@ela.edu.vn?subject=ELA%20-%20Ho%20tro%20tai%20khoan">Liên hệ quản trị viên.</a>
              </p>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
