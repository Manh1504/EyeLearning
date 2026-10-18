# syntax=docker/dockerfile:1
#
# Một bản duy nhất (GPU). CUDA/cuDNN đến từ wheel pip của torch
# (`--extra-index-url .../cu126` trong requirements.txt) nên KHÔNG cần base
# image NVIDIA; host chỉ cần NVIDIA driver + nvidia-container-toolkit
# (docker-compose đã đặt `gpus: all`). Chạy CPU vẫn được qua DEVICE=cpu.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive \
    PYUBJSON_NO_EXTENSION=1

# Thư viện hệ thống cho OpenCV / MediaPipe (GL, OpenMP, glib).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libegl1 \
    libgles2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài dependencies trước để tận dụng cache layer. Assert ngay trong build để
# phát hiện sớm nếu pip chọn nhầm wheel torch (CPU/cu124...).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip check \
    && python -c "import torch, torchvision, cv2, mediapipe, sklearn, ubjson, unigaze.loader as l; assert torch.__version__.startswith('2.7.0'), torch.__version__; assert torch.version.cuda == '12.6', torch.version.cuda; import torchvision as tv; assert tv.__version__.startswith('0.22.0'), tv.__version__; l.build_unigaze_model('unigaze_b16_joint')"

COPY app ./app
COPY scripts ./scripts
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh \
    && python -c "from app.main import app; paths={r.path for r in app.routes}; assert {'/health','/session','/session/{sid}'} <= paths, paths"

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
