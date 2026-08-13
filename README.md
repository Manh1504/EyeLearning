# EyeLearning

LMS cho bài học PDF có eye-tracking. Hệ thống gồm 3 khối:

| Thư mục | Vai trò |
|---|---|
| `web/` | Backend FastAPI + PostgreSQL migrations (`web/migrations/`, 21 file `000` → `020`) |
| `frontend/` | Frontend React (Vite), nginx serve + reverse-proxy API |
| `Gaze-Estimation/` | AI Service (FastAPI, port 9000) — calibration + dự đoán điểm nhìn |

Chạy đầy đủ gồm 4 service:

| Service | Container | Port host → container | File compose |
|---|---|---|---|
| Postgres | `eyelearn_postgres` | `5433 → 5432` | `docker-compose.yml` (gốc) |
| Backend | `eyelearn_web` | `8000 → 8000` | `docker-compose.yml` (gốc) |
| Frontend | `eyelearn_frontend` | `9080 → 80` | `docker-compose.yml` (gốc) |
| AI | `eyelearn_ai` | `9000 → 9000` | `Gaze-Estimation/docker-compose.yml` |

## Yêu cầu

- Docker + Docker Compose.
- **Model weights** — KHÔNG nằm trong git. Tải tại [Google Drive](https://drive.google.com/drive/folders/1olXtxlqBb7gW_nnB4p_dSDXV2t2IMy5B?usp=sharing) (~6 file, ~1.7GB) và copy vào `Gaze-Estimation/weights/` trước khi chạy.

## Pull code về máy chạy thử

```bash
git clone https://github.com/Manh1504/EyeLearning
cd EyeLearning

# 1. Tải model weights vào Gaze-Estimation/weights/ (link ở mục Yêu cầu)

# 2. Network dùng chung cho cả 2 nhóm compose (bỏ qua nếu báo "already exists")
docker network create eyelearning_default

# 3. Postgres + backend + frontend
docker compose up -d --build

# 4. AI Service (mặc định build bản CPU-only, chạy được mọi máy, không cần GPU)
cd Gaze-Estimation
docker compose up -d --build
cd ..
```

Mở **`http://localhost:9080`**, chọn role `Student`, nhập tên + student code, Start session.

> Nếu bỏ qua bước 4: app vẫn mở được nhưng calibration và gaze tracking không hoạt động (không có gì trả lời ở `127.0.0.1:9000`).

### Kiểm tra sau khi lên

```bash
curl http://localhost:8000/health                  # {"status":"ok"}
curl http://localhost:8000/debug/schema-status     # đủ bảng, đúng migration
curl http://localhost:8000/lessons/L001/aois       # seed data — phải trả về 9 AOI
curl http://127.0.0.1:9000/health_check            # "pipeline_loaded": true
```

- `/lessons/L001/aois` trả `[]` → migration chưa chạy đủ (xem mục Migrations).
- `/health_check` trả `"pipeline_loaded": false` → thiếu model weights.

### Chạy frontend bằng npm (tuỳ chọn, khi muốn sửa UI nhanh)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, tự proxy API sang http://127.0.0.1:8000
```

Backend dev (`docker-compose.yml`) mount source `./web` nên sửa code trong `web/` được uvicorn `--reload` áp dụng ngay, không cần rebuild.

### GPU (tuỳ chọn)

Mặc định AI Service build bản CPU. Máy có GPU NVIDIA + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html):

```bash
cd Gaze-Estimation
TORCH_VARIANT=cuda DEVICE=cuda docker compose up -d --build
```

và bỏ comment khối `deploy.resources.reservations.devices` trong `Gaze-Estimation/docker-compose.yml`.

## Migrations

`docker-compose.yml` mount `./web/migrations` vào `/docker-entrypoint-initdb.d` — Postgres tự chạy toàn bộ file `.sql` theo thứ tự tên, **chỉ 1 lần lúc volume còn rỗng**.

Nếu volume `eyelearn_pgdata` đã có data từ trước và có migration mới thêm vào sau, migration mới **không tự chạy**. Hai cách:

```bash
# A. Chạy tay file còn thiếu (kiểm tra file thiếu qua /debug/schema-status)
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/00X_ten_file.sql

# B. Xoá sạch volume chạy lại từ đầu (MẤT DATA)
docker compose down -v && docker compose up -d --build
```

> Image production (`web/Dockerfile.prod`) tự chạy migration lúc khởi động qua `web.migrate` (idempotent, tracking bảng `_schema_migrations`) nên không dính vấn đề này.

## Dừng / dọn dẹp

```bash
docker compose down                              # giữ data
cd Gaze-Estimation && docker compose down        # dừng AI Service
docker compose down -v                           # + xoá volume Postgres (mất data)
```

## Deploy (hướng Portainer)

Đích deploy hiện tại là server Docker của trường quản lý bằng Portainer (không GPU): 3 image build sẵn push lên Docker Hub + stack `portainer/stack.yml` dán vào Portainer (Stacks → Add stack → Web editor). Khai báo 3 biến môi trường lúc deploy: `DOCKER_USER`, `POSTGRES_PASSWORD`, `TRACKING_TOKEN_SECRET`.

```bash
docker login
docker build -f web/Dockerfile.prod -t <DOCKER_USER>/eyelearn-web:latest ./web
docker build -t <DOCKER_USER>/eyelearn-frontend:latest ./frontend
cd Gaze-Estimation
docker build -f Dockerfile.bundled -t <DOCKER_USER>/eyelearn-ai:latest .   # bake sẵn weights, CPU
cd ..
docker push <DOCKER_USER>/eyelearn-web:latest
docker push <DOCKER_USER>/eyelearn-frontend:latest
docker push <DOCKER_USER>/eyelearn-ai:latest
```

Chỉ expose port `9080` (nginx); browser gọi API và AI WebSocket cùng origin qua `/ai/...`. Postgres/AI/web chỉ nói chuyện trong network nội bộ của stack.

## Những vấn đề chưa xử lý để có thể deploy

1. **Model weights không nằm trong git** — phải tải tay từ Google Drive trước khi build/chạy. Image AI bundled (`Dockerfile.bundled`) phải bake sẵn weights nên rất nặng (~4–5GB), push/pull lần đầu chậm. Chưa có registry nội bộ — đang phụ thuộc Docker Hub.
2. **Dockerfile AI Service chưa được build-test đầy đủ** — viết dựa trên đọc code (`server.py`, `requirements.txt`); lần đầu build thật nếu lỗi cài package (torch/mediapipe/L2CS cài từ GitHub) cần điều chỉnh lại Dockerfile.
3. **Webcam yêu cầu HTTPS** — trình duyệt chặn `getUserMedia` trên trang `http://` (trừ localhost). Trước khi học sinh calibration được cần domain + chứng chỉ TLS đặt trước port 9080 (Caddy là dễ nhất, hoặc Cloudflare proxy — lưu ý Cloudflare free chỉ proxy port 80/443 nên phải đổi `"9080:80"` trong `portainer/stack.yml` thành `"80:80"`). Chưa có HTTPS thì hệ thống chạy được nhưng camera/calibration không hoạt động.
4. **Secrets mặc định là giá trị dev** — `TRACKING_TOKEN_SECRET=dev-tracking-token-secret` và password Postgres dev. Trước khi deploy thật phải sinh giá trị ngẫu nhiên (vd. `openssl rand -hex 32`), và `TRACKING_TOKEN_SECRET` **phải trùng nhau** giữa service `web` và `ai`.
5. **Portainer Stacks không chạy `docker build`** — quy trình build + push 3 image hiện làm tay trên máy dev; chưa có CI tự động build/push khi có release.
6. **Backfill dữ liệu tracking cũ** — sau khi deploy schema tracking mới, phải chạy tay `scripts/backfill_tracking_pdf_context.sql` đúng 1 lần (backup DB trước: `docker exec eyelearn_postgres pg_dump -U eyelearn_user eyelearn > backup.sql`).
7. **Hiệu năng AI trên CPU** — server trường không có GPU, inference chạy CPU chậm và ăn RAM; cần tối thiểu 8 cores / 16GB RAM, hoặc cân nhắc thuê máy có GPU và build lại bản `TORCH_VARIANT=cuda`.
8. **Cloudinary (tuỳ chọn) chưa cấu hình** — không set `CLOUDINARY_URL` thì heatmap/page snapshot lưu disk local trong volume `eyelearn_data` (vẫn hoạt động, nhưng cần backup volume này cùng DB).
9. **Chưa có integration test cho luồng webcam/browser** — phiên capture webcam thật phải verify thủ công trong trình duyệt sau mỗi lần deploy.
