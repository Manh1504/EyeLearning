import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { getSessionContext, normalizeRole } from "../lib/session.js";

function roleHome(role) {
  if (role === "teacher") return "/teacher";
  if (role === "admin") return "/admin";
  return "/courses";
}

function navItems(role) {
  if (role === "teacher") {
    return [
      { label: "Tổng quan lớp học", to: "/teacher", key: "home" },
      { label: "Phiên học", to: "/teacher#sessions", key: "sessions" },
    ];
  }
  if (role === "admin") {
    return [];
  }
  return [
    { label: "Trang chủ", to: "/courses", key: "home" },
    { label: "Khóa học của tôi", to: "/courses", key: "courses" },
  ];
}

function initials(name) {
  const parts = (name || "ELA User").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "EU";
}

export function AppHeader({ active, sidebarToggle = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout: revokeSession } = useAuth();
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const firstMenuItemRef = useRef(null);
  const context = getSessionContext();
  const role = normalizeRole(user?.role || context.role) || "student";
  const userName = user?.full_name || context.full_name || context.student_code || "Người dùng";
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("ela_logged_out") === "1") {
      navigate("/login", { replace: true });
      return undefined;
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        setMobileOpen(false);
        triggerRef.current?.focus?.();
      }
    }
    function onPointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => firstMenuItemRef.current?.focus?.());
    }
  }, [open]);

  function isActive(item) {
    if (active) return active === item.key;
    return location.pathname === item.to.split("#")[0];
  }

  async function logout() {
    await revokeSession();
    [
      "session_id",
      "lesson_id",
      "student_code",
      "full_name",
      "role",
      "calibration_ready",
      "calibration_profile_id",
      "calibration_viewport_w",
      "calibration_viewport_h",
      "calibration_is_fullscreen",
      "calibration_completed_at",
    ].forEach((key) => localStorage.removeItem(key));
    sessionStorage.setItem("ela_logged_out", "1");
    setOpen(false);
    setMobileOpen(false);
    navigate("/login", { replace: true });
  }

  const items = navItems(role);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-left">
          {sidebarToggle ? (
            <button
              className="nav-toggle admin-nav-toggle"
              type="button"
              aria-expanded={sidebarToggle.open}
              aria-controls={sidebarToggle.controls}
              aria-label={sidebarToggle.label || "Mở điều hướng quản trị"}
              onClick={sidebarToggle.onToggle}
            >
              ☰
            </button>
          ) : null}
          <Link className="brand app-brand" to={roleHome(role)}>ELA</Link>
          {items.length > 0 && (
            <button
              className="nav-toggle"
              type="button"
              aria-expanded={mobileOpen}
              aria-label="Mở điều hướng"
              onClick={() => setMobileOpen((value) => !value)}
            >
              ☰
            </button>
          )}
        </div>

        {items.length > 0 && (
          <nav className={`primary-nav ${mobileOpen ? "open" : ""}`} aria-label="Điều hướng chính">
            {items.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                aria-current={isActive(item) ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="user-menu" ref={menuRef}>
          <button
            className="user-menu-button"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            ref={triggerRef}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && !open) {
                event.preventDefault();
                setOpen(true);
              }
            }}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="avatar">{initials(userName)}</span>
            <span>{userName}</span>
            <span aria-hidden>⌄</span>
          </button>
          {open && (
            <div className="user-dropdown" role="menu">
              <button type="button" role="menuitem" ref={firstMenuItemRef}>Hồ sơ cá nhân</button>
              <button type="button" role="menuitem">Quyền riêng tư & dữ liệu eye-tracking</button>
              <button className="logout-item" type="button" role="menuitem" onClick={logout}>Đăng xuất</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <strong aria-current="page">{item.label}</strong>}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <section className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </section>
  );
}

export function SessionSummary({ items }) {
  return (
    <dl className="session-summary">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MetricStrip({ metrics }) {
  return (
    <section className="metric-strip" aria-label="Tổng quan chỉ số">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </section>
  );
}
