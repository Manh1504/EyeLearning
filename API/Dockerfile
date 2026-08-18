FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1


# torch/opencv/mediapipe/ultralytics cần một số thư viện hệ thống
RUN apt-get update && apt-get install -y --no-install-recommends git \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
#   CPU  (mặc định, chạy được trên mọi máy, không cần GPU):
#     docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu ...
#   CUDA 12.6 (máy có NVIDIA GPU + nvidia-container-toolkit):
#     docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu126 ...
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cuda126
ARG TORCH_VERSION=2.7.0
ARG TORCHVISION_VERSION=0.22.0
RUN pip install --no-cache-dir \
    torch==${TORCH_VERSION} torchvision==${TORCHVISION_VERSION} \
    --extra-index-url ${TORCH_INDEX_URL}

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py /app/

# DEVICE=cpu|cuda phải khớp với TORCH_INDEX_URL lúc build (cuda wheel vẫn
# chạy được ở chế độ cpu nhưng ngược lại thì lỗi: cpu wheel không có kernel
# CUDA). Mặc định cpu để container chạy được ngay không cần GPU.
ENV DEVICE=CUDA
ENV CORS_ORIGINS=http://localhost:3000

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:9000/docs || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9000"]