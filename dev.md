# Dev local — xem thay đổi ngay (hot reload)

Tài liệu này hướng dẫn cách khởi động để **sửa code backend/frontend là thấy kết quả
ngay**, không phải build image rồi deploy.

> **Vì sao cần?** Trong `docker-compose.yml`, `backend` và `frontend` **không có `build:`**
> — chúng chỉ chạy image `ghcr.io/manh1504/eyelearning-{backend,frontend}:latest` với
> `pull_policy: always` (backend chạy `uvicorn` **không có `--reload`**, frontend là
> Next.js `output: standalone` đã build sẵn). Nên `docker compose up` sau khi sửa code
> sẽ **không** cập nhật gì: Docker kéo lại đúng image cũ từ GHCR.
> Cách duy nhất để thấy thay đổi ngay là chạy backend/frontend **trên host** với
> chế độ dev (mục 2 và 3 dưới đây).

## Kiến trúc khi dev

| Thành phần | Chạy ở đâu | Cổng | Hot reload |
|---|---|---|---|
| `postgres` | Docker | `127.0.0.1:5435` | — |
| `redis` | Docker (tuỳ chọn) | `127.0.0.1:6379` | — |
| `migrate` | Docker (one-shot) | — | — |
| `backend` | **host** (`uvicorn --reload`) | `localhost:8001` | ✅ |
| `frontend` | **host** (`next dev`) | `localhost:3000` | ✅ |
| `gaze` | Docker (tuỳ chọn, cần GPU) | `127.0.0.1:8000` | ❌ (code nằm trong image) |
| `chatbot` | Docker (tuỳ chọn) | `127.0.0.1:8002` | ❌ (code nằm trong image) |

- Backend host đọc `.env` ở gốc repo (`backend/app/core/config.py` → `ROOT_ENV_FILE`),
  trong đó `DATABASE_URL=...@localhost:5435/...` đúng cho host.
- Frontend đọc `frontend/.env.local`, đang trỏ `NEXT_PUBLIC_API_URL=http://localhost:8001`;
  `next.config.ts` rewrite `/api/*` và `/media/*` → backend, `/gaze/*` → gaze.

## Chuẩn bị (chỉ 1 lần)

```bash
# 1) .env ở gốc repo (đã có sẵn; nếu chưa: cp .env.example .env)
# 2) Backend env ảo — .venv đã có sẵn trong backend/
cd backend
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
cd ..

# 3) Frontend deps
cd frontend && npm install && cd ..
```

Yêu cầu: Docker, Node ≥ 20, Python ≥ 3.12.

## Bước 1 — Hạ tầng bằng Docker

```bash
# Nếu stack "kiểu production" đang chạy thì nhả cổng 3000 cho frontend dev:
docker compose stop frontend

# Postgres + Redis (đủ để dev backend/frontend)
docker compose up -d postgres redis
```

Áp migration **chỉ khi** DB mới hoặc bạn vừa thêm file trong `db/migrations/`
(ví dụ `021_course_show_gaze_dot.sql` — cờ điểm nhìn chuyển lên cấp khóa + ghi gaze
cho bài tập):

```bash
# Phải build lại vì image migrate đóng gói db/migrations vào trong (không bind mount)
docker compose build migrate
docker compose run --rm migrate
# Lỗi thì xem: docker logs eyetracking-migrate
```

> ⚠️ Schema và code phải đi cùng nhau: backend mới cần `courses.show_gaze_dot` /
> `gaze_session_stats`. Chạy migration **trước** khi chạy backend bản mới.

Tuỳ chọn — nếu cần tính năng AI (gaze/chatbot):

```bash
docker compose up -d gaze chatbot      # lần đầu / sau khi sửa services/: thêm --build
docker compose logs -f gaze            # theo dõi tải weights (lần đầu, có thể vài phút)
```

## Bước 2 — Backend (hot reload)

Terminal 1:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8001
```

- Windows: `.venv\Scripts\python -m uvicorn app.main:app --reload --port 8001`
- Sửa bất kỳ file trong `backend/app/**` → tự nạp lại (xem log `Reloading...`).
- Kiểm tra: <http://localhost:8001/health> → `{"status":"ok",...}`, Swagger: <http://localhost:8001/docs>.

## Bước 3 — Frontend (hot reload)

Terminal 2:

```bash
cd frontend
npm run dev
```

Mở <http://localhost:3000>. Sửa file trong `frontend/app`, `components`, `lib`, `hooks`
→ HMR cập nhật ngay trên trình duyệt (không cần F5 cho hầu hết thay đổi).

## Sửa gì thì cần làm gì

| Bạn sửa | Cần làm |
|---|---|
| `backend/app/**` | không cần gì — reload tự động |
| `backend/requirements*.txt` | `pip install -r ...` rồi restart uvicorn |
| `.env` (gốc repo) | restart uvicorn (settings đọc lúc khởi động) |
| `frontend/**` (app/components/lib/hooks) | không cần gì — HMR |
| `frontend/next.config.ts`, `frontend/.env.local` | restart `npm run dev` |
| `frontend/package.json` | `npm install` rồi restart `npm run dev` |
| `db/migrations/**` hoặc `db/migrate.sh` | `docker compose build migrate && docker compose run --rm migrate` |
| `services/gaze/**`, `services/chatbot/**` | `docker compose up -d --build gaze chatbot` (không hot reload) |

## Khi nào thay đổi KHÔNG hiện ngay

- **Container `backend`/`frontend`**: image GHCR đóng băng + `pull_policy: always`, nên
  dù bạn build tay thì `docker compose up` cũng kéo lại `:latest` và ghi đè.
- Muốn test đúng image production → commit, push `main`, chờ CI (`ci.yml`) và
  `build.yml` build & push lên GHCR, webhook Portainer redeploy; sau đó:

  ```bash
  docker compose pull backend frontend && docker compose up -d backend frontend nginx
  ```

## Xử lý sự cố

- **`npm run dev` báo cổng 3000 đang dùng** → container `eyetracking-frontend` đang giữ
  cổng: `docker compose stop frontend`.
- **Cổng 8001 đang dùng** → `ss -ltnp | grep 8001` (hoặc `lsof -i :8001`) để tìm process
  và dừng nó trước khi chạy uvicorn.
- **Backend `connection refused` / `Connection refused` tới DB** → postgres chưa healthy
  (`docker compose ps`) hoặc sai cổng: `DATABASE_URL` trong `.env` phải là
  `...@localhost:5435/...` (bản `DATABASE_URL_DOCKER` chỉ dùng cho container).
- **Đăng nhập không giữ được phiên trên `http://localhost`** → cookie bị đánh dấu
  `Secure` khi `DEBUG=false`/`COOKIE_SECURE=true`. Dev qua http thì đặt
  `COOKIE_SECURE=false` trong `.env` rồi restart uvicorn.
  ⚠️ `.env` dùng chung với docker — đừng commit giá trị dev này.
- **Frontend gọi `/api/...` bị 404/`ECONNREFUSED`** → backend 8001 chưa chạy, hoặc
  `frontend/.env.local` trỏ sai `NEXT_PUBLIC_API_URL` (phải là `http://localhost:8001`).
- **Migration lỗi** → `docker logs eyetracking-migrate`; quy tắc: **không sửa file
  migration đã ship**, hãy thêm file mới (xem `db/README.md`).

## Bảng cổng nhanh

| Cổng | Dịch vụ |
|---|---|
| 3000 | frontend (`npm run dev`, hoặc container nếu không stop) |
| 5435 | postgres |
| 6379 | redis |
| 8000 | gaze (Docker) |
| 8001 | backend host |
| 8002 | chatbot (Docker) |

Dừng dev: `Ctrl+C` ở 2 terminal. Dừng hạ tầng: `docker compose stop` (giữ dữ liệu) hoặc
`docker compose down` (giữ volume) / `docker compose down -v` (**xoá dữ liệu**).
