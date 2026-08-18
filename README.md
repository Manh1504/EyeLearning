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
└────────────┘              └─────┬──────┘
      │                           │ proxy /calibrate/*, WS /infer
      │ calibration (multipart)   ▼
      └──────────────────► ┌────────────┐
                           │  API (ML)  │  mediapipe + UniGaze gaze estimation
                           │  (:8000)   │  calibration 16-25 điểm → 6 tham số kappa
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

- Backend: `http://localhost:8001` — Swagger tại `http://localhost:8001/docs`
- Postgres: `localhost:5435` (user/pass/db: `postgres/postgres/eyetracking`)

Service ML (`API/`, cần GPU) đang được comment trong `docker-compose.yml`; bật lên
khi có NVIDIA runtime. Backend proxy `/calibrate/*` và WS `/infer` sang service này —
khi nó tắt, các endpoint proxy trả `ai_service_unavailable` và frontend tự fallback mock.

### Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

Frontend gọi backend qua `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:8001`,
đã set trong `frontend/.env.local`).

### Backend chạy trực tiếp (không Docker)

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --port 8001 --reload
```

## Tài khoản mẫu (mật khẩu: `Password123!`)

| Email | Vai trò |
|---|---|
| `admin@school.edu.vn` | Quản trị viên |
| `teacher@school.edu.vn` | Giáo viên — tạo khóa học, xem heatmap/analytics lớp |
| `student@school.edu.vn` | Học sinh — học bài, calibration, gửi gaze |

## Luồng dữ liệu chính

1. **Calibration**: học viên nhìn 16-25 điểm trên màn hình, webcam gửi ảnh về
   `POST /calibrate/point` → `POST /calibrate/fit` trả 6 tham số kappa → backend lưu
   vào `calibration_params` (active duy nhất mỗi user+device).
2. **Học bài**: frontend mở phiên (`POST /api/learning-sessions`), nhận gaze từ
   WebSocket `/infer` (đã proxy), gửi batch về `POST /api/lessons/{id}/gaze-samples`
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
