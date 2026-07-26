#!/bin/sh
# Sinh /usr/share/nginx/html/config.js tại thời điểm container start, cho phép
# đổi API_BASE mà KHÔNG cần rebuild image (khác với biến VITE_* vốn bị đóng băng lúc build).
#
# Mặc định để trống -> browser gọi API cùng-origin, được nginx reverse-proxy
# sang backend (xem nginx.conf.template). Chỉ set RUNTIME_API_BASE khi frontend
# và backend KHÔNG cùng origin (vd deploy CDN riêng, domain riêng cho API).
set -e

CONFIG_FILE=/usr/share/nginx/html/config.js
API_BASE_VALUE="${RUNTIME_API_BASE:-}"

cat > "$CONFIG_FILE" <<CONFIG
window.__ENV__ = {
  API_BASE: "${API_BASE_VALUE}"
};
CONFIG

echo "[entrypoint] wrote $CONFIG_FILE (API_BASE='${API_BASE_VALUE}')"
