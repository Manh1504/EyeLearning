#!/usr/bin/env bash
# =====================================================================
# docker_cleanup.sh — dọn image + build cache cũ trên host
#
# RẤT QUAN TRỌNG: script này CHỈ prune IMAGE và BUILD CACHE.
# TUYỆT ĐỐI KHÔNG prune volume — volume chứa dữ liệu thật
# (pgdata, backend-media, gaze-weights, redis-data). Xóa volume = mất dữ liệu.
#
# Dùng:
#   ./ops/docker_cleanup.sh
# =====================================================================
set -euo pipefail

log() { printf '[docker_cleanup] %s\n' "$*"; }

command -v docker >/dev/null 2>&1 || { echo "không tìm thấy docker" >&2; exit 1; }

log "trước khi dọn:"
docker system df

# Chỉ xóa image không dùng trong 168h (7 ngày) gần đây — giữ image vừa pull
# để rollback nhanh.
log "prune image cũ (>168h)"
docker image prune -af --filter "until=168h"

log "prune build cache cũ (>168h)"
docker builder prune -f --filter "until=168h"

# KHÔNG chạy: docker volume prune  /  docker system prune --volumes
log "sau khi dọn:"
docker system df
log "hoàn tất (không đụng volume)."
