#!/bin/sh
# Chuẩn bị model THEO CẤU HÌNH .env rồi mới khởi động API:
#   - EMBEDDING_NAME=local -> tải weights Qwen3-Embedding-0.6B (bắt buộc).
# LLM và VLM (River AI) đều gọi API -> không cần chuẩn bị gì.
# Xem scripts/prepare_models.py.
set -e

echo "== Chatbot RAG =="
python -m scripts.prepare_models

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
