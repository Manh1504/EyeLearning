import { Navigate, useLocation } from "react-router-dom";
import { AppHeader } from "./AppShell.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getSessionContext } from "../lib/session.js";

function isLoggedOut() {
  return sessionStorage.getItem("ela_logged_out") === "1";
}

function homeForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/courses";
}

export function RequireRole({ allow, children }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const role = user?.role || "";

  if (loading) {
    return <main className="app-page"><div className="empty-state">Đang xác thực phiên đăng nhập...</div></main>;
  }

  if (isLoggedOut() || !role) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allow.includes(role)) {
    return <AccessDenied role={role} />;
  }

  return children;
}

export function RequireSession({ children }) {
  const context = getSessionContext();
  if (!context.session_id) {
    return <Navigate to={homeForRole(context.role)} replace />;
  }
  return children;
}

export function AccessDenied({ role }) {
  return (
    <>
      <AppHeader />
      <main className="app-page">
        <section className="panel access-denied">
          <div className="course-kicker">403</div>
          <h1>Bạn không có quyền xem khu vực này</h1>
          <p className="muted">Tài khoản hiện tại không được cấp quyền truy cập dữ liệu hoặc chức năng này.</p>
          <a className="btn primary" href={homeForRole(role)}>Về trang của tôi</a>
        </section>
      </main>
    </>
  );
}
