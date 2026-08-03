import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiUrl, requestJson } from "./api.js";
import { normalizeRole, setSessionContext } from "./session.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const current = await requestJson(apiUrl("/auth/me"));
      const role = normalizeRole(current.role);
      setUser({ ...current, role });
      setSessionContext({
        role,
        full_name: current.full_name || "",
        student_code: current.student_code || "",
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(payload) {
    const current = await requestJson(apiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const role = normalizeRole(current.role);
    setUser({ ...current, role });
    setSessionContext({
      role,
      full_name: current.full_name || "",
      student_code: current.student_code || "",
    });
    sessionStorage.removeItem("ela_logged_out");
    return { ...current, role };
  }

  async function logout() {
    await requestJson(apiUrl("/auth/logout"), { method: "POST" }).catch(() => null);
    setUser(null);
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
