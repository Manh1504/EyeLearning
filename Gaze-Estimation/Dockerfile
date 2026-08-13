# syntax=docker/dockerfile:1
#
# AI Service (Gaze-Estimation) — server.py, FastAPI + WebSocket, port 9000.
# main.py (tkinter desktop app dùng webcam local) KHÔNG chạy được trong container
# và không được dùng ở đây — image này chỉ chạy server.py qua uvicorn.
#
# GPU: mặc định build bản CPU-only của torch (chạy được trên mọi máy, không cần
# NVIDIA driver/container toolkit). Nếu host có GPU NVIDIA + nvidia-container-toolkit,
# build lại với: docker compose build --build-arg TORCH_VARIANT=cuda
# rồi chạy container kèm `--gpus all` (hoặc deploy.resources.reservations.devices
# trong docker-compose.yml) và đặt DEVICE=cuda.
FROM python:3.11-slim AS base

ARG TORCH_VARIANT=cpu

WORKDIR /app

# opencv-python / mediapipe cần các thư viện native này trên base image "slim".
# git cần để pip cài L2CS-Net trực tiếp từ GitHub (xem requirements.txt).
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# torch: chọn index phù hợp theo TORCH_VARIANT (cpu mặc định, cuda nếu build lại).
# requirements.txt gốc trỏ sẵn --extra-index-url cho cu118 — bóc dòng đó ra để
# tự chọn theo ARG thay vì hard-code CUDA.
RUN sed -i '/^--extra-index-url/d; /^torch==/d; /^torchvision==/d' requirements.txt
RUN if [ "$TORCH_VARIANT" = "cuda" ]; then \
        pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cu118 torch==2.7.0 torchvision==0.22.0; \
    else \
        pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch==2.7.0 torchvision==0.22.0; \
    fi
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Bắt buộc để uvicorn hỗ trợ WebSocket (/inference). Cài ở lớp riêng SAU
# "COPY . ." để không làm invalid lớp torch (~2-3GB) khi đổi requirements.txt.
RUN pip install --no-cache-dir "websockets>=10.0"
# volume lúc chạy: -v ./Gaze-Estimation/weights:/app/weights
VOLUME ["/app/weights"]

ENV DEVICE=${TORCH_VARIANT}
EXPOSE 9000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9000"]
