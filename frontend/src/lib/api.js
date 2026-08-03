// API_BASE rỗng nghĩa là gọi cùng-origin (dev: qua Vite proxy, prod: qua nginx reverse-proxy).
// Có thể override qua window.__ENV__.API_BASE (config.js sinh runtime trong container)
// hoặc build-time qua VITE_API_BASE.
export const API_BASE =
  (typeof window !== "undefined" && window.__ENV__?.API_BASE) ??
  import.meta.env.VITE_API_BASE ??
  "";

function networkErrorMessage(error, fallback = "Không thể kết nối tới máy chủ. Kiểm tra backend API rồi thử lại.") {
  if (error?.name === "AbortError") return "Máy chủ phản hồi quá lâu. Hãy thử lại sau.";
  if (error instanceof TypeError) return fallback;
  return error?.message || fallback;
}

export async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: "include", ...options });
  } catch (error) {
    throw new Error(networkErrorMessage(error));
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = text || `HTTP ${response.status}`;
    if (text.trimStart().startsWith("<!doctype") || text.trimStart().startsWith("<html")) {
      message = "API trả về HTML thay vì JSON. Kiểm tra cấu hình proxy hoặc API_BASE cho route này.";
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed?.detail) {
        if (typeof parsed.detail === "string") {
          message = parsed.detail;
        } else if (parsed.detail?.message) {
          message = parsed.detail.message;
          const error = new Error(message);
          error.detail = parsed.detail;
          error.status = response.status;
          throw error;
        } else {
          message = JSON.stringify(parsed.detail);
        }
      }
      if (parsed?.message) message = parsed.message;
    } catch {
      // Keep the original server text when it is not JSON.
    }
    if (response.status === 401) message = message || "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (response.status === 403) message = message || "Bạn không có quyền thực hiện thao tác này.";
    if (response.status === 404) message = message || "Không tìm thấy dữ liệu cần truy cập.";
    if (response.status >= 500) message = "Máy chủ đang gặp lỗi. Hãy thử lại sau hoặc báo quản trị viên.";
    throw new Error(message);
  }
  return response.json();
}

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

let cachedClientConfig = null;

export async function loadClientConfig(force = false) {
  if (cachedClientConfig && !force) return cachedClientConfig;
  let response;
  try {
    response = await fetch(apiUrl("/client-config"), { credentials: "include" });
  } catch (error) {
    throw new Error(networkErrorMessage(error, "Không thể kết nối tới cấu hình hệ thống. Kiểm tra backend rồi thử lại."));
  }
  if (!response.ok) throw new Error("Không thể tải cấu hình hệ thống.");
  cachedClientConfig = await response.json();
  return cachedClientConfig;
}
