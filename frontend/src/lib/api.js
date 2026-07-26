// API_BASE rỗng nghĩa là gọi cùng-origin (dev: qua Vite proxy, prod: qua nginx reverse-proxy).
// Có thể override qua window.__ENV__.API_BASE (config.js sinh runtime trong container)
// hoặc build-time qua VITE_API_BASE.
export const API_BASE =
  (typeof window !== "undefined" && window.__ENV__?.API_BASE) ??
  import.meta.env.VITE_API_BASE ??
  "";

export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

let cachedClientConfig = null;

export async function loadClientConfig(force = false) {
  if (cachedClientConfig && !force) return cachedClientConfig;
  const response = await fetch(apiUrl("/client-config"));
  if (!response.ok) throw new Error("Cannot load client config.");
  cachedClientConfig = await response.json();
  return cachedClientConfig;
}
