#!/usr/bin/env bash
# =====================================================================
# build_ai_base.sh — build image nền dùng chung (docker/ai-base)
#
# Base chứa torch/torchvision CUDA 12.4 + libgomp1/curl, dùng cho cả
# services/gaze và services/chatbot (xem docker/ai-base/README.md).
#
# Phải build/pull base TRƯỚC khi build gaze/chatbot, vì hai Dockerfile của
# service `FROM ghcr.io/manh1504/eyelearning-ai-base:latest`.
#
# Dùng:
#   ./ops/build_ai_base.sh
# =====================================================================
set -euo pipefail

IMAGE="${AI_BASE_IMAGE:-ghcr.io/manh1504/eyelearning-ai-base:latest}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '[build_ai_base] %s\n' "$*"; }

command -v docker >/dev/null 2>&1 || { echo "không tìm thấy docker" >&2; exit 1; }

log "build $IMAGE từ docker/ai-base ..."
docker build -t "$IMAGE" "$ROOT_DIR/docker/ai-base"

log "xong. Kiểm tra:"
docker image inspect "$IMAGE" --format '{{.RepoTags}} {{.Size}}'
