# Backend — GazeEdu (EyeLearning)

FastAPI backend cho hệ thống học tập theo dõi hành vi mắt (eye-tracking).

## Kiến trúc

```
backend/app/
├── main.py              # FastAPI app, CORS, routers
├── core/
│   ├── config.py        # Settings (pydantic-settings, đọc .env)
│   ├── security.py      # bcrypt + JWT (access/refresh)
│   └── helpers.py       # gradient/color palette, relative time tiếng Việt
├── db/
│   ├── base.py          # SQLAlchemy Base
│   └── session.py       # async engine + session (asyncpg)
├── models/              # SQLAlchemy models ánh xạ db/migrations/*.sql
├── schemas/             # Pydantic v2 — camelCase, khớp frontend/lib/types/domain.ts
├── crud/                # data access
├── services/            # course_stats (aggregate), analytics (heatmap/fixation/hotspot)
└── api/
    ├── deps.py          # get_current_user, require_roles (RBAC)
    └── routes/          # auth, users, courses, modules, lessons, enrollments,
                         # gaze, calibration, analytics, proxy (AI service)
```

## Chạy

### Cách 1: Docker Compose (khuyến nghị)

```bash
docker compose up -d            # postgres (5435) + backend (8001)
```

### Cách 2: Chạy trực tiếp (dev)

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # Windows
copy .env.example .env                          # sửa nếu cần
.venv\Scripts\python -m uvicorn app.main:app --port 8001 --reload
```

Yêu cầu PostgreSQL đang chạy (mặc định `postgresql+asyncpg://postgres:postgres@localhost:5435/eyetracking`).

## Cấu hình (.env)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5435/eyetracking` | Chuỗi kết nối PG (asyncpg) |
| `JWT_SECRET` | dev | **Bắt buộc đổi ở production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 60 | Hạn JWT access |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 30 | Hạn refresh token (lưu hash trong `auth_sessions`) |
| `CORS_ORIGINS` | `http://localhost:3000` | Phân tách bằng dấu phẩy |
| `AI_HTTP_URL` | `http://127.0.0.1:8000` | ML service (`API/server.py`) |
| `AI_WS_URL` | `ws://127.0.0.1:8000/infer` | WebSocket inference |
| `GAZE_DOWNSAMPLE_HZ` | 4.0 | Downsample gaze trước khi ghi DB |
| `TESTING` | - | `1` = dùng NullPool (cho pytest) |

## Endpoints chính

### Auth (`/api/auth`)
- `POST /api/auth/login` — `{email, password}` → `{accessToken, refreshToken, user}`
- `POST /api/auth/refresh` — rotate refresh token
- `POST /api/auth/logout` — revoke refresh token

### Hồ sơ
- `GET/PATCH /api/me/profile` — khớp `MyProfile`/`ProfileUpdate` của frontend

### Khóa học (giáo viên — `/teacher`)
- `GET/POST /teacher/courses`, `PATCH/DELETE /teacher/courses/{id}`
- `POST /teacher/courses/{id}/modules`, `PATCH/DELETE /teacher/modules/{id}`
- `POST /teacher/modules/{id}/lessons`, `PATCH/DELETE /teacher/lessons/{id}`
- `POST /teacher/lessons/{id}/slides`, `DELETE /teacher/slides/{id}`
- `GET /teacher/courses/{id}` — cây modules/lessons + completion/attention
- `GET /teacher/courses/{id}/students` — danh sách học viên + tiến độ từng bài
- `GET /teacher/lessons/{id}/heatmap?studentId=` — SlideStat[] (onSlide, fixations, viewSec, hotspots)
- `POST /teacher/courses/{id}/recompute` — batch tính lại `heatmap_aggregates` + `engagement_scores`

### Học tập (sinh viên — `/api`)
- `GET /api/me/enrollments`, `GET /api/me/stats` (streak + phút học tuần)
- `POST /api/courses/{id}/enroll`
- `GET /api/courses/{id}?include=modules.lessons` — outline
- `GET /api/lessons/{id}/contents` — slides
- `PATCH /api/lessons/{id}/progress` — `{lastSlide}` (0-based)
- `POST /api/learning-sessions` / `PATCH /api/learning-sessions/{id}`
- `POST /api/lessons/{id}/gaze-samples` — batch `{lessonContentId, x, y, ts}`; clamp [0,1], downsample, cập nhật `gaze_slide_stats`

### Calibration
- `POST /api/calibrations` — lưu 6 tham số kappa (khóa cũ tự deactivate)
- `GET /api/calibrations/active?deviceFingerprint=`

### Proxy ML service (`API/server.py`)
- `POST /calibrate/point`, `POST /calibrate/fit` — forward HTTP
- `WS /infer` — proxy WebSocket 2 chiều
- `GET /ai/health`

## Tests

Tests chạy trên DB riêng `eyetracking_test` (tạo 1 lần):

```bash
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE eyetracking_test;"
# chạy migrations 001-004 vào eyetracking_test
```

```bash
cd backend
.venv\Scripts\python -m pytest tests -v
```

## Thiết kế đáng chú ý

- **JWT access ngắn hạn + refresh token** lưu dạng SHA-256 hash trong `auth_sessions`, rotation khi refresh.
- **RBAC**: role trong JWT + kiểm tra `user_roles`; ownership khóa học theo `courses.teacher_id`.
- **Gaze**: tọa độ chuẩn hóa [0,1]; clamp ở application trước khi insert vào `gaze_events` (partitioned theo tháng); thống kê on-slide/view-time ghi vào `gaze_slide_stats` lúc ingest (trước clamp) để tính on-slide ratio chính xác.
- **Heatmap**: fixation detection (dispersion) + hotspot clustering (grid 24×24 + local maxima) tính on-the-fly; `heatmap_aggregates`/`engagement_scores` tính bằng endpoint recompute (batch).
- **camelCase**: toàn bộ response dùng alias generator `to_camel` — khớp `frontend/lib/types/domain.ts`, UI không cần sửa.
