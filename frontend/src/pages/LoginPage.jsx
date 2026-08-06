import { useRef, useState } from "react";
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
  "Camera chỉ được kích hoạt khi người học đồng ý.",
  "Tiến độ và hồ sơ hiệu chỉnh được lưu theo tài khoản.",
  "Kết quả phân tích được phân quyền theo vai trò.",
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef(null);
  const statusId = "login-status";
  const identifierId = "login-identifier";
  const passwordId = "login-password";
  const identifierErrorId = "login-identifier-error";
  const passwordErrorId = "login-password-error";

  function focusErrorSummary() {
    window.requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    sessionStorage.removeItem("ela_logged_out");

    const normalizedIdentifier = normalizeCode(identifier);
    const nextFieldErrors = {};

    if (!normalizedIdentifier) {
      nextFieldErrors.identifier = "Vui lòng nhập email hoặc mã tài khoản.";
    }
    if (!password) {
      nextFieldErrors.password = "Vui lòng nhập mật khẩu.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setStatus({ message: "Vui lòng kiểm tra lại thông tin đăng nhập.", kind: "error" });
      focusErrorSummary();
      return;
    }

    ["session_id", "course_id", "course_item_id", "pdf_lesson_id", "test_id", "module_id", "activity_id", "content_version_id", "calibration_ready"].forEach((key) => {
      localStorage.removeItem(key);
    });
    setFieldErrors({});
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
      const message = /kết nối|máy chủ|server|network|API/i.test(error.message)
        ? "Không thể kết nối tới máy chủ. Vui lòng thử lại sau."
        : "Email, mã tài khoản hoặc mật khẩu không chính xác.";
      setStatus({ message, kind: "error" });
      setSubmitting(false);
      focusErrorSummary();
    }
  }

  return (
    <>
      <header className="topbar auth-topbar gazeedu-login-header">
        <div className="auth-topbar__inner">
          <Link className="brand auth-brand-link" to="/">GazeEdu</Link>
          <nav className="auth-top-links" aria-label="Điều hướng phụ">
            <Link to="/">Trang chủ</Link>
            <Link to="/#privacy">Trợ giúp</Link>
          </nav>
        </div>
      </header>

      <main className="auth-layout login-page gazeedu-login-page">
        <section className="auth-layout__intro gazeedu-login-aside" aria-label="Giới thiệu GazeEdu">
          <div className="auth-layout__intro-inner">
            <p className="auth-kicker">GAZEEDU · EYE-TRACKING LEARNING ANALYTICS</p>
            <h1>Học tập và phân tích trên cùng một nền tảng.</h1>
            <p>
              Truy cập khóa học, bài giảng và các phiên học có ghi nhận điểm nhìn trong một không gian thống nhất.
            </p>

            <div className="auth-hero-card" aria-hidden="true">
              <div className="auth-hero-visual">
                <article className="auth-slide-mockup">
                  <div className="auth-slide-header">
                    <div>
                      <span className="auth-slide-eyebrow">Bài giảng PDF</span>
                      <strong>Sơ đồ nhận thức học tập</strong>
                    </div>
                    <span className="auth-slide-badge">Trang 08</span>
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
                  <div className="auth-status-card">
                    <span>Ghi nhận</span>
                    <strong>Đang bật</strong>
                  </div>
                  <div className="auth-status-card">
                    <span>Hiệu chỉnh</span>
                    <strong>Sẵn sàng</strong>
                  </div>
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

        <section className="auth-layout__form gazeedu-login-form-area" aria-label="Form đăng nhập">
          <div className="auth-layout__form-inner">
            <div className="auth-form-header">
              <h2>Chào mừng quay lại</h2>
              <p>Đăng nhập để truy cập không gian GazeEdu theo vai trò của bạn.</p>
            </div>

            <form className="form-stack gazeedu-login-form" onSubmit={handleSubmit} noValidate>
              {status.kind === "error" && status.message ? (
                <div
                  id={statusId}
                  className="gazeedu-login-error"
                  role="alert"
                  aria-live="assertive"
                  tabIndex={-1}
                  ref={errorRef}
                >
                  {status.message}
                </div>
              ) : (
                <div id={statusId} className="sr-only" aria-live="polite" aria-atomic="true">
                  {status.message}
                </div>
              )}

              <div className="field">
                <label htmlFor={identifierId}>Email hoặc mã tài khoản</label>
                <input
                  id={identifierId}
                  autoComplete="username"
                  placeholder="Nhập email hoặc mã tài khoản"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (fieldErrors.identifier) setFieldErrors((errors) => ({ ...errors, identifier: "" }));
                  }}
                  aria-describedby={`${statusId}${fieldErrors.identifier ? ` ${identifierErrorId}` : ""}`}
                  aria-invalid={fieldErrors.identifier ? "true" : undefined}
                  disabled={submitting}
                />
                {fieldErrors.identifier ? <p className="field-error" id={identifierErrorId}>{fieldErrors.identifier}</p> : null}
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
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((errors) => ({ ...errors, password: "" }));
                    }}
                    aria-describedby={`${statusId}${fieldErrors.password ? ` ${passwordErrorId}` : ""}`}
                    aria-invalid={fieldErrors.password ? "true" : undefined}
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
                {fieldErrors.password ? <p className="field-error" id={passwordErrorId}>{fieldErrors.password}</p> : null}
              </div>

              <button className="btn primary login-submit" type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting ? <span className="login-submit__spinner" aria-hidden="true" /> : null}
                <span>{submitting ? "Đang đăng nhập..." : "Đăng nhập"}</span>
              </button>

              <p className="auth-support">
                Cần hỗ trợ đăng nhập? <a href="mailto:support@ela.edu.vn?subject=GazeEdu%20-%20Ho%20tro%20tai%20khoan">Liên hệ quản trị viên.</a>
              </p>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
