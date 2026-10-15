import type { Role } from "@/lib/api/auth";
import { isDemoMode } from "@/lib/demo-mode";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  match: (pathname: string) => boolean;
}

const under =
  (base: string) =>
  (p: string): boolean =>
    p === base || p.startsWith(`${base}/`);

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  student: [
    { href: "/student", label: "Tổng quan", icon: "ri-home-line", match: (p) => p === "/student" },
    ...(isDemoMode()
      ? [{ href: "/student/assignments", label: "Bài tập", icon: "ri-list-check-3", match: under("/student/assignments") }]
      : []),
    { href: "/student/profile", label: "Hồ sơ", icon: "ri-user-line", match: under("/student/profile") },
  ],
  teacher: [
    { href: "/teacher", label: "Tổng quan", icon: "ri-dashboard-line", match: (p) => p === "/teacher" },
    ...(isDemoMode()
      ? [{ href: "/teacher/assignments", label: "Giao bài", icon: "ri-list-check-3", match: under("/teacher/assignments") }]
      : []),
    { href: "/teacher/profile", label: "Hồ sơ", icon: "ri-user-line", match: under("/teacher/profile") },
  ],
  admin: [
    { href: "/admin", label: "Phân công", icon: "ri-user-follow-line", match: (p) => p === "/admin" },
    { href: "/admin/settings", label: "Cài đặt", icon: "ri-settings-3-line", match: under("/admin/settings") },
    { href: "/admin/profile", label: "Hồ sơ", icon: "ri-user-line", match: under("/admin/profile") },
  ],
};

export const PROFILE_HREF: Record<Role, string> = {
  student: "/student/profile",
  teacher: "/teacher/profile",
  admin: "/admin/profile",
};
