import type { Role } from "@/lib/api/auth";

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
    { href: "/student", label: "Khóa học", icon: "ri-home-line", match: (p) => p === "/student" },
    { href: "/student/profile", label: "Hồ sơ", icon: "ri-user-line", match: under("/student/profile") },
  ],
  teacher: [
    { href: "/teacher", label: "Khóa học", icon: "ri-dashboard-line", match: (p) => p === "/teacher" },
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
