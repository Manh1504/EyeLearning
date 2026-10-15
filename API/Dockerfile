FROM pytorch/pytorch:2.7.0-cuda12.6-cudnn9-runtime@sha256:27c3135420bc184e86977170b6158c6133be3c7cc5c35e9e4fa87bdda629dc2b

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libegl1 \
    libgles2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-torch.txt ./
RUN python -m pip install --no-cache-dir --no-deps -r requirements-torch.txt \
    && python -c "import torch, torchvision; assert torch.__version__.startswith('2.7.0'); assert torch.version.cuda == '12.6'"

COPY requirements-gpu.txt ./
RUN PYUBJSON_NO_EXTENSION=1 python -m pip install --no-cache-dir -r requirements-gpu.txt \
    && python -m pip check \
    && python -c "import cv2, fastapi, mediapipe, sklearn, ubjson, unigaze.loader as loader; loader.build_unigaze_model('unigaze_b16_joint')"

COPY *.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
