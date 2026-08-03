import { useEffect, useState } from "react";

function DashboardIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <rect x="2.25" y="2.25" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.75" y="2.25" width="6" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.25" y="11.75" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.75" y="14" width="6" height="3.75" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ClockIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.25v4.2l2.6 1.55" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 16.25h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 13V9.5M10 13V6.5M14.5 13V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M6.25 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM13.75 8.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.75 15.5c.7-2.1 2.57-3.25 5.5-3.25 2.93 0 4.8 1.15 5.5 3.25M12.5 15.5c.44-1.4 1.63-2.25 3.75-2.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M2.25 10s2.8-5 7.75-5 7.75 5 7.75 5-2.8 5-7.75 5-7.75-5-7.75-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SettingsIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M10 5.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.5v1.5M10 16v1.5M17.5 10H16M4 10H2.5M15.3 4.7l-1.05 1.05M5.75 14.25 4.7 15.3M15.3 15.3l-1.05-1.05M5.75 5.75 4.7 4.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const NAV_GROUPS = [
  {
    label: "Học tập",
    items: [
      { key: "overview", label: "Tổng quan", href: "/admin#overview", Icon: DashboardIcon },
      { key: "sessions", label: "Phiên học", href: "/admin#sessions", Icon: ClockIcon },
      { key: "analytics", label: "Phân tích", href: "/analytics", Icon: ChartIcon },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { key: "courses", label: "Người dùng & phân công", href: "/admin#courses", Icon: UsersIcon },
    ],
  },
  {
    label: "Vận hành",
    items: [
      { key: "trial", label: "Kiểm thử eye-tracking", href: "/admin#trial", Icon: EyeIcon },
      { key: "system", label: "Hệ thống", href: "/admin#system", Icon: SettingsIcon },
    ],
  },
];

export function AdminSidebar({ active = "overview", mobileOpen = false, onClose = () => {} }) {
  const [current, setCurrent] = useState(active);

  useEffect(() => {
    function updateFromHash() {
      if (window.location.pathname === "/analytics") {
        setCurrent("analytics");
        return;
      }
      const next = window.location.hash.replace("#", "") || "overview";
      setCurrent(next === "management" ? "courses" : next);
    }

    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    return () => window.removeEventListener("hashchange", updateFromHash);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    if (!mobileOpen) return undefined;
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onClose]);

  return (
    <>
      <button
        className={`admin-sidebar-backdrop ${mobileOpen ? "is-open" : ""}`}
        type="button"
        aria-label="Đóng điều hướng quản trị"
        onClick={onClose}
      />
      <aside id="admin-sidebar" className={`app-sidebar admin-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Điều hướng quản trị">
        <div className="admin-sidebar__module">
          <span>Quản trị ELA</span>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Điều hướng quản trị">
          {NAV_GROUPS.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <p className="admin-nav-group__label">{group.label}</p>
              <div className="admin-nav-group__items">
                {group.items.map(({ key, label, href, Icon }) => (
                  <a
                    key={key}
                    className="admin-nav-item"
                    href={href}
                    aria-current={current === key ? "page" : undefined}
                    onClick={onClose}
                  >
                    <Icon className="admin-nav-item__icon" />
                    <span>{label}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-role-panel">
            <span>Vai trò hiện tại</span>
            <strong>Quản trị viên</strong>
          </div>
        </div>
      </aside>
    </>
  );
}
