import { apiFetch, setMemoryAccessToken, clearMemoryToken, AUTH_CHANGE_EVENT } from "./client";

export { AUTH_CHANGE_EVENT };

export type Role = "student" | "teacher" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  roles: Role[];
  fullName: string | null;
  avatarUrl?: string | null;
  /** true khi phải đổi mật khẩu trước khi dùng các API khác (lần đăng nhập đầu). */
  mustChangePassword?: boolean;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export const ROLE_HOME: Record<Role, string> = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  student: "Học viên",
  teacher: "Giảng viên",
  admin: "Quản trị viên",
};

export type AuthChangeReason =
  | "login"
  | "logout"
  | "session-expired"
  | "password-change-required"
  | "unknown";
const AUTH_SYNC_KEY = "gaze_auth_sync";

export function primaryRole(roles: Role[] | undefined | null): Role {
  if (!roles || roles.length === 0) return "student";
  for (const role of ["teacher", "student", "admin"] as const) {
    if (roles.includes(role)) return role;
  }
  return roles[0] ?? "student";
}

function notifyAuthChange(reason: AuthChangeReason): void {
  globalThis.window?.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: reason }));
  try {
    globalThis.localStorage?.setItem(AUTH_SYNC_KEY, JSON.stringify({ reason, at: Date.now() }));
  } catch {
    /* Storage may be unavailable or blocked. */
  }
}

export function subscribeAuthChange(callback: (reason: AuthChangeReason) => void): () => void {
  const fire = (event: Event) => {
    if (event instanceof StorageEvent && event.key !== AUTH_SYNC_KEY) return;
    let reason: AuthChangeReason = event instanceof CustomEvent ? event.detail : "unknown";
    if (event instanceof StorageEvent && event.newValue) {
      try {
        reason = JSON.parse(event.newValue).reason as AuthChangeReason;
      } catch {
        reason = "unknown";
      }
    }
    if (reason === "logout" || reason === "session-expired") clearMemoryToken();
    callback(reason);
  };
  globalThis.window?.addEventListener(AUTH_CHANGE_EVENT, fire);
  globalThis.window?.addEventListener("storage", fire);
  return () => {
    globalThis.window?.removeEventListener(AUTH_CHANGE_EVENT, fire);
    globalThis.window?.removeEventListener("storage", fire);
  };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { isDemoMode, setDemoEmail, setDemoCookies, demoUserForEmail } = await import("@/lib/demo");
  if (isDemoMode()) {
    setDemoEmail(email);
    setDemoCookies();
    const user = demoUserForEmail(email);
    setMemoryAccessToken("demo-token");
    notifyAuthChange("login");
    return { accessToken: "demo-token", refreshToken: "demo-refresh", user };
  }

  const data = await apiFetch<LoginResult>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuthRefresh: true,
  });
  if (data?.accessToken) setMemoryAccessToken(data.accessToken);
  else if ((data as unknown as { access_token?: string })?.access_token) {
    setMemoryAccessToken((data as unknown as { access_token: string }).access_token);
  }
  notifyAuthChange("login");
  return data;
}

export async function register(
  fullName: string,
  email: string,
  password: string,
  birthYear: number,
): Promise<LoginResult> {
  const data = await apiFetch<LoginResult>("/api/auth/register", {
    method: "POST",
    body: { fullName, email, password, birthYear },
    skipAuthRefresh: true,
  });
  if (data?.accessToken) setMemoryAccessToken(data.accessToken);
  notifyAuthChange("login");
  return data;
}

/**
 * Đổi mật khẩu. Dùng cho lần đăng nhập đầu (mustChangePassword) hoặc tự đổi.
 * Backend sẽ thu hồi các phiên đăng nhập khác (giữ phiên hiện tại).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      body: {},
      skipAuthRefresh: true,
    });
  } catch {
    /* vẫn clear local dù server lỗi */
  }
  clearAuth();
}

export function clearAuth(): void {
  clearMemoryToken();
  try {
    globalThis.localStorage?.removeItem("auth_token");
    globalThis.localStorage?.removeItem("refresh_token");
    globalThis.localStorage?.removeItem("auth_user");
    globalThis.localStorage?.removeItem("gaze_params");
    globalThis.localStorage?.removeItem("gaze_calibrated_at");
    globalThis.localStorage?.removeItem("gaze_session_id");
    globalThis.localStorage?.removeItem("gaze_screen");
  } catch {
    /* ignore */
  }
  notifyAuthChange("logout");
}
