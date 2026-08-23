# GazeEdu — EyeLearning

Nền tảng học tập theo dõi hành vi mắt (eye-tracking): học viên học bài giảng slide
qua webcam, hệ thống ước lượng hướng nhìn và sinh phân tích (heatmap, mức độ tập
trung) cho giáo viên.

## Kiến trúc

```
┌────────────┐   HTTP/WS    ┌────────────┐   SQL    ┌────────────┐
│  frontend  │ ───────────► │  backend   │ ───────► │  postgres  │
│  Next.js   │              │  FastAPI   │          │  (5435)    │
│  (:3000)   │              │  (:8001)   │          └────────────┘
└─────┬──────┘              └─────┬──────┘
      │  WS /infer                 │ calibration (multipart: model .ubj)
      ▼                           ▼
┌────────────┐              lưu model .ubj active theo (user, device)
│  API (ML)  │
│  (:8000)   │  mediapipe + UniGaze gaze estimation
│            │  calibration 16-25 điểm → train model → .ubj
└────────────┘
```

| Thư mục | Vai trò |
|---|---|
| `frontend/` | Next.js (App Router, TypeScript, Tailwind) — khu vực học viên + giáo viên |
| `backend/` | FastAPI — auth/JWT, khóa học, gaze ingestion, analytics (chi tiết: `backend/README.md`) |
| `API/` | ML service — ước lượng gaze từ webcam, calibration, WebSocket `/infer` (cần GPU) |
| `db/` | Migrations PostgreSQL (001 schema, 002 seed, 003 partition gaze, 004 analytics) |

## Chạy nhanh (Docker)

```bash
docker compose up -d              # postgres (:5435) + backend (:8001)
```

- Backend: `server.nmhieu.online` — Swagger tại `server.nmhieu.online/docs`
- Postgres: `localhost:5435` (user/pass/db: `postgres/postgres/eyetracking`)

Service ML (`API/`, cần GPU) đang được comment trong `docker-compose.yml`; bật lên
khi có NVIDIA runtime. Frontend kết nối trực tiếp WS `/infer` của service này —
khi nó tắt, frontend tự fallback mock (backend chỉ dùng `AI_HTTP_URL` để probe `/ai/health`).

### Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

Frontend gọi backend qua `NEXT_PUBLIC_API_URL` (mặc định `server.nmhieu.online`,
đã set trong `frontend/.env.local`).

### Backend chạy trực tiếp (không Docker)

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8001 --reload
```

> **Một file env duy nhất**: mọi biến (DB, JWT, CORS, AI service, Postgres) đặt ở
> `.env` gốc repo — tạo từ `.env.example`. `docker-compose.yml` và
> `backend/app/core/config.py` đều đọc từ file này; không còn giá trị mẫu nhúng.

## Tài khoản mẫu (mật khẩu: `Password123!`)

| Email | Vai trò |
|---|---|
| `admin@school.edu.vn` | Quản trị viên |
| `teacher@school.edu.vn` | Giáo viên — tạo khóa học, xem heatmap/analytics lớp |
| `student@school.edu.vn` | Học sinh — học bài, calibration, gửi gaze |

## Luồng dữ liệu chính

1. **Calibration**: học viên nhìn lần lượt 16 điểm trên màn hình, mỗi điểm bấm để
   webcam gửi ảnh + tọa độ về `POST /calibrate/point` của ML service → server trả
   1 mẫu `[pitch,yaw,rvec(3),tvec(3),x,y]`; frontend tích lũy đủ 16 mẫu rồi gọi
   `POST /calibrate/fit` → nhận 6 tham số `[a1,a2,b1,a3,a4,b2]` → lưu lên
   `POST /api/calibrations` (JSON) làm bản active duy nhất cho (user, device).
   Lúc mở phiên mới, frontend tải 6 tham số đó qua
   `GET /api/calibrations/active/params` và gửi vào message cấu hình của WS `/infer`
   để stream mà không cần calibrate lại.
2. **Học bài**: frontend mở phiên (`POST /api/learning-sessions`, response có
   `calibrated` — đã có params hiệu chỉnh sẵn sàng chưa), nhận gaze từ WebSocket `/infer` (trực
   tiếp từ ML service), gửi batch về `POST /api/lessons/{id}/gaze-samples`
   — backend clamp [0,1], downsample ~4Hz, ghi vào `gaze_events` (partition theo tháng)
   và cập nhật `gaze_slide_stats`.
3. **Analytics**: giáo viên xem heatmap từng slide (`GET /teacher/lessons/{id}/heatmap`)
   — on-slide ratio, fixation, hotspot; `POST /teacher/courses/{id}/recompute` tính lại
   `heatmap_aggregates` + `engagement_scores` dạng batch.

## Vận hành DB

```bash
docker compose exec postgres psql -U postgres -d eyetracking -c '\dt'   # liệt kê bảng
docker compose down           # dừng, giữ dữ liệu
docker compose down -v        # XÓA volume — mất dữ liệu, migrations chạy lại từ đầu
```

- Migrations tự chạy lần đầu tạo volume (mount vào `/docker-entrypoint-initdb.d`).
- Partition `gaze_events`: chạy `db/maintain_partitions.sql` định kỳ (xem `db/README.md`).

## Tests

```bash
cd backend
.venv\Scripts\python -m pytest tests -v     # cần postgres + DB eyetracking_test
.venv\Scripts\python e2e_check.py           # smoke test full flow qua HTTP
```

Tạo DB test một lần:

```bash
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE eyetracking_test;"
```

(rồi chạy 4 file migration vào DB này — xem `backend/README.md`).
