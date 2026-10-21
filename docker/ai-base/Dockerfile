# syntax=docker/dockerfile:1
#
# ============================================================
# AI base — image dùng CHUNG cho services/gaze và services/chatbot
# ============================================================
#
# Mục đích: cài torch/torchvision (CUDA 12.4) + thư viện hệ thống tối thiểu
# MỘT LẦN. Hai service `FROM` image này nên các layer nặng (torch + nvidia-cuda-*,
# ~vài GB) chỉ được lưu một bản trên host/registry thay vì hai bản.
#
# Base CHỈ chứa thứ cả hai service đều cần (python, torch cu124, libgomp1, curl).
# Thư viện riêng của từng service (vd libgl1/libglib2.0-0 cho OpenCV/MediaPipe của
# gaze) được cài ở Dockerfile của service đó.
#
# Build & push (CI tự làm khi docker/ai-base/** đổi):
#   docker build -t ghcr.io/manh1504/eyelearning-ai-base:latest docker/ai-base
#   docker push ghcr.io/manh1504/eyelearning-ai-base:latest
# hoặc dùng script tiện dụng: ./ops/build_ai_base.sh
#
# CUDA/cuDNN đến từ wheel pip cu124 (requirements-torch.txt) nên KHÔNG cần base
# image NVIDIA; host chỉ cần NVIDIA driver + nvidia-container-toolkit (compose đặt
# `gpus: all`). Chạy CPU vẫn được qua DEVICE=cpu / EMBEDDING_DEVICE=cpu.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive \
    PYUBJSON_NO_EXTENSION=1

# libgomp1: OpenMP cho torch/numpy. curl: dùng cho HEALTHCHECK của service.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Assert ngay trong build để phát hiện sớm nếu pip chọn nhầm wheel (CPU sai CUDA).
COPY requirements-torch.txt .
RUN pip install --no-cache-dir -r requirements-torch.txt \
    && pip check \
    && python -c "import torch, torchvision; assert torch.__version__.startswith('2.6.0'), torch.__version__; assert torch.version.cuda == '12.4', torch.version.cuda; assert torchvision.__version__.startswith('0.21.0'), torchvision.__version__"
