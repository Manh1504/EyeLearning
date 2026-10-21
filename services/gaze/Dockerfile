# syntax=docker/dockerfile:1
#
# Gaze service — build FROM image nền dùng chung (docker/ai-base) để chia sẻ
# layer torch/CUDA 12.4 với service chatbot. Base đã có torch/torchvision cu124,
# numpy, libgomp1, curl; ở đây chỉ thêm thư viện riêng của gaze.
#
# CUDA/cuDNN đến từ wheel pip cu124 trong base nên KHÔNG cần base image NVIDIA;
# host chỉ cần NVIDIA driver + nvidia-container-toolkit (docker-compose đặt
# `gpus: all`). Chạy CPU vẫn được qua DEVICE=cpu.
ARG AI_BASE=ghcr.io/manh1504/eyelearning-ai-base:latest
FROM ${AI_BASE}

# Thư viện hệ thống cho OpenCV / MediaPipe (GL, EGL) — base chỉ có libgomp1/curl.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libegl1 \
    libgles2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài dependencies trước để tận dụng cache layer. Assert ngay trong build để
# phát hiện sớm nếu thiếu deps hoặc unigaze không dựng được model. Dòng này build
# thử b16 (ViT nhỏ nhất) như một smoke test phụ thuộc — KHÔNG phải model đang
# dùng; model thật được kiểm tra ở RUN cuối (đọc từ app/services/pipeline.py),
# vì dựng thử l16/h14 ngay lúc build sẽ cấp phát vài GB RAM.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip check \
    && python -c "import cv2, mediapipe, ubjson, unigaze.loader as l; l.build_unigaze_model('unigaze_b16_joint')"

COPY app ./app
COPY scripts ./scripts
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh \
    && python -c "from app.main import app; paths={r.path for r in app.routes}; assert {'/health','/ready','/session','/session/{sid}'} <= paths, paths" \
    && python -c "from app.services.pipeline import UNIGAZE_WEIGHTS; import unigaze.loader as l; assert UNIGAZE_WEIGHTS.stem in l.MODEL_INDEX, (UNIGAZE_WEIGHTS.name, sorted(l.MODEL_INDEX))"

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
