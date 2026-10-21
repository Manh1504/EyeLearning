# AI base image (dùng chung gaze + chatbot)

Image nền chia sẻ giữa `services/gaze` và `services/chatbot`:

- `python:3.12-slim`
- **torch 2.6.0 + torchvision 0.21.0 — CUDA 12.4** (wheel pip `cu124`)
- `numpy==1.26.4`, `libgomp1`, `curl`

Vì cả hai service đều cần torch, gộp phần này vào một image nền để các layer nặng
(torch + `nvidia-cuda-*`, ~vài GB) chỉ được lưu **một bản** trên host/registry.

> Vì sao 2.6.0/12.4: torch 2.7.0 không phát hành wheel `cu124` (chỉ `cu118`/`cu126`/`cu128`).
> 2.6.0 là bản mới nhất hỗ trợ CUDA 12.4.

## Build local

```bash
./ops/build_ai_base.sh          # build + tag ghcr.io/manh1504/eyelearning-ai-base:latest
```

Sau đó build service như bình thường (`docker compose build gaze chatbot` hoặc
`docker compose up -d --build`). Hai Dockerfile của service `FROM` image nền theo
mặc định; có thể override khi build:

```bash
docker build --build-arg AI_BASE=ghcr.io/manh1504/eyelearning-ai-base:latest \
  -t eyelearning-gaze:dev ./services/gaze
```

CI (`build.yml`) tự build & push image nền **trước** khi build gaze/chatbot mỗi khi
`docker/ai-base/**` thay đổi.
