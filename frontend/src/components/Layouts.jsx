function joinClassName(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function AuthLayout({ className = "", children, ...props }) {
  return <div className={joinClassName("layout-shell auth-layout", className)} {...props}>{children}</div>;
}

export function PublicLayout({ className = "", children, ...props }) {
  return <main className={joinClassName("layout-shell page-shell", className)} {...props}>{children}</main>;
}

export function StudentLayout({ className = "", children, ...props }) {
  return <main className={joinClassName("layout-shell app-page student-layout", className)} {...props}>{children}</main>;
}

export function TeacherLayout({ className = "", children, ...props }) {
  return <main className={joinClassName("layout-shell app-page teacher-layout", className)} {...props}>{children}</main>;
}

export function AdminLayout({ className = "", children, ...props }) {
  return <main className={joinClassName("admin-layout", className)} {...props}>{children}</main>;
}

export function AnalyticsLayout({ className = "", children, ...props }) {
  return <main className={joinClassName("layout-shell app-page analytics-layout", className)} {...props}>{children}</main>;
}

export function LearningLayout({ className = "", children, ...props }) {
  return <main className={joinClassName("layout-shell app-page learning-layout", className)} {...props}>{children}</main>;
}
