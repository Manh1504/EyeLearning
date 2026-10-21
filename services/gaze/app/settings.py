"""Cấu hình dùng chung cho gaze service.

Gom mọi biến môi trường về một chỗ; phần còn lại của code chỉ import từ đây.
Module này KHÔNG import torch/mediapipe/opencv để script nhẹ (download_weights,
test) cũng dùng được.
"""

import os
from pathlib import Path

# Thư mục chứa weights (unigaze + mediapipe), tải lúc runtime bởi
# scripts/download_weights.py. Mặc định /app/weights khớp volume `gaze-weights`
# của docker-compose; đặt WEIGHTS_DIR khi chạy ngoài image.
WEIGHTS_DIR = Path(os.getenv("WEIGHTS_DIR", "/app/weights"))

# Số mẫu tối thiểu cho mỗi điểm calibration trước khi train.
MIN_SAMPLES = int(os.getenv("MIN_SAMPLES", "1"))

# Số điểm calibration tối đa được khai báo trong 1 session (khớp cap num_points
# phía backend = 64).
MAX_POINTS = int(os.getenv("MAX_POINTS", "64"))

# Giới hạn số mẫu giữ lại cho mỗi điểm (giữ mẫu mới nhất) để RAM không phình khi
# client gửi liên tục.
MAX_SAMPLES_PER_POINT = int(os.getenv("MAX_SAMPLES_PER_POINT", "50"))

# Kích thước ảnh upload tối đa cho /calibrate và /import (bytes).
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))

# Vòng đời session (giây) và số session đồng thời tối đa.
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "1800"))
MAX_SESSIONS = int(os.getenv("MAX_SESSIONS", "100"))

# Số worker suy luận. torch/mediapipe không thread-safe nên mặc định 1;
# tăng lên khi chạy nhiều GPU/process riêng biệt.
INFER_WORKERS = int(os.getenv("INFER_WORKERS", "1"))

# Thiết bị suy luận: "cpu", "cuda", hoặc rỗng để tự dò GPU.
DEVICE = os.getenv("DEVICE", "").strip().lower()

# One-Euro smoothing (làm mượt POG, xem app/services/smoothing.py)
# Tọa độ là [0, 1] theo viewport nên các ngưỡng tính theo "bề rộng viewport/giây".
# `beta` là nút chính để BỚT TRỄ: cao hơn -> bám nhanh khi lia mắt.
ONEEURO_BETA = float(os.getenv("ONEEURO_BETA", "0.5"))
# Cutoff khi gần như đứng yên: thấp -> ít rung, cao -> bớt trễ nhưng run hơn.
ONEEURO_MIN_CUTOFF = float(os.getenv("ONEEURO_MIN_CUTOFF", "0.5"))
# Cutoff làm mượt ước lượng vận tốc: cao -> thích ứng tốc độ nhanh hơn.
ONEEURO_D_CUTOFF = float(os.getenv("ONEEURO_D_CUTOFF", "1.0"))
