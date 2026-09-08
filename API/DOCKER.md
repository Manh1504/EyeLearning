# Đóng gói & đẩy image lên Docker Hub

Hướng dẫn build và push **2 image** (CPU + GPU) của Gaze API lên Docker Hub cho tài khoản `hieunm1501`.

## 0. Quy ước

| Phiên bản | Dockerfile | File requirements | Tag trên Docker Hub | Khi chạy cần |
|---|---|---|---|---|
| GPU | `Dockerfile` (mặc định) | `requirements-gpu.txt` (torch cu126) | `hieunm1501/gaze-api:gpu` | NVIDIA GPU + `nvidia-container-toolkit` |
| CPU | `Dockerfile.cpu` | `requirements-cpu.txt` (torch CPU) | `hieunm1501/gaze-api:cpu` | Không cần GPU |

- **Weights KHÔNG được đóng vào image** — `.dockerignore` đã loại thư mục `weights/`; khi container khởi động, `entrypoint.sh` chạy `download_weights.py` để tự tải weights (đã có sẵn thì bỏ qua).
- Image dùng `ENTRYPOINT ["/app/entrypoint.sh"]`, mở port `8000`.

## 1. Chuẩn bị

1. Đăng nhập Docker Hub (đã đăng nhập thì bỏ qua):

   ```bash
   docker login
   ```

2. Kiểm tra `.dockerignore` đã loại `weights/`, `__pycache__/`, `.env`:

   ```bash
   cat .dockerignore
   ```

3. Đứng tại thư mục gốc chứa `Dockerfile`:

   ```bash
   cd API
   ```

## 2. Build image

### 2.1 Bản GPU

```bash
docker build -t hieunm1501/gaze-api:gpu .
```

### 2.2 Bản CPU

```bash
docker build -f Dockerfile.cpu -t hieunm1501/gaze-api:cpu .
```

> Build image GPU **không cần máy có GPU** (chỉ cần mạng để tải CUDA wheel); việc cần GPU chỉ xảy ra lúc **chạy** container.

## 3. Test cục bộ trước khi push

```bash
# GPU
docker compose up -d

# CPU
docker compose -f docker-compose.cpu.yml up -d

# Kiểm tra
curl http://localhost:8000/health
# {"status":"ok","gpu_available":true/false,"pipeline_ready":true}
```

Dừng lại sau khi test:

```bash
docker compose down
docker compose -f docker-compose.cpu.yml down
```

## 4. Đẩy lên Docker Hub

```bash
docker push hieunm1501/gaze-api:gpu
docker push hieunm1501/gaze-api:cpu
```

## 5. Xác minh

Trên Docker Hub: https://hub.docker.com/r/hieunm1501/gaze-api/tags — phải thấy 2 tag `gpu` và `cpu`.

Kéo về từ máy khác để kiểm tra:

```bash
docker pull hieunm1501/gaze-api:gpu
docker pull hieunm1501/gaze-api:cpu
```

## 6. Lệnh đầy đủ (chạy 1 mạch)

```bash
cd API

docker build -t hieunm1501/gaze-api:gpu .
docker build -f Dockerfile.cpu -t hieunm1501/gaze-api:cpu .

docker push hieunm1501/gaze-api:gpu
docker push hieunm1501/gaze-api:cpu
```

## 7. Lưu ý

- **CPU wheel không có kernel CUDA** — image `:cpu` không chạy được trên GPU; image `:gpu` vẫn chạy được trên CPU (nhưng nặng). Vì vậy cần build riêng 2 tag.
- **`DEVICE` phải khớp image**: `DEVICE=cuda` cho tag `:gpu`, `DEVICE=cpu` cho tag `:cpu` (đã cài sẵn trong 2 file `docker-compose*.yml`).
- Muốn đẩy thêm tag phiên bản (vd `:gpu-v1.2.0`):

  ```bash
  docker tag hieunm1501/gaze-api:gpu hieunm1501/gaze-api:gpu-v1.2.0
  docker push hieunm1501/gaze-api:gpu-v1.2.0
  ```

- (Nâng cao) Build multi-platform nếu cần chạy trên máy kiến trúc khác:

  ```bash
  docker buildx build --platform linux/amd64,linux/arm64 \
    -t hieunm1501/gaze-api:gpu --push .
  ```
