"""Cấu hình dùng chung cho gaze service.

Gom mọi biến môi trường về một chỗ; phần còn lại của code chỉ import từ đây.
Module này KHÔNG import torch/mediapipe để script nhẹ (download_weights) cũng
dùng được.
"""

import os
from pathlib import Path

# Thư mục chứa weights (unigaze + mediapipe), tải lúc runtime bởi
# scripts/download_weights.py. Mặc định /app/weights khớp volume `gaze-weights`
# của docker-compose; đặt WEIGHTS_DIR khi chạy ngoài image.
WEIGHTS_DIR = Path(os.getenv("WEIGHTS_DIR", "/app/weights"))

# Số mẫu tối thiểu cho mỗi điểm calibration trước khi train.
MIN_SAMPLES = int(os.getenv("MIN_SAMPLES", "1"))

# Vòng đời session (giây) và số session đồng thời tối đa.
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "1800"))
MAX_SESSIONS = int(os.getenv("MAX_SESSIONS", "100"))
