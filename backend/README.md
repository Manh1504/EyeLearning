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
# Se dùng MỘT file env duy nhất ở gốc repo: copy .env.example .env (gốc repo)
.venv\Scripts\python -m uvicorn app.main:app --port 8001 --reload
```

Yêu cầu PostgreSQL đang chạy (`docker compose up -d postgres` từ gốc repo).

## Cấu hình (env — một file duy nhất ở gốc repo)

Backend đọc mọi biến từ **`.env` ở gốc repo** (`backend/app/core/config.py` trỏ thẳng
tới `ROOT_ENV_FILE`). Không còn giá trị mẫu nhúng trong code.

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | Có | Chuỗi kết nối PG (asyncpg) khi chạy ngoài container |
| `DATABASE_URL_DOCKER` | Có (compose) | Chuỗi kết nối DB nội bộ cho container backend |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Có (compose) | Tạo DB của service `postgres` |
| `JWT_SECRET` | Có | **Bắt buộc đổi ở production** |
| `JWT_ALGORITHM` | Không | Mặc định `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Không | Hạn JWT access (mặc định 60) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Không | Hạn refresh token (mặc định 30) |
| `CORS_ORIGINS` | Có | Phân tách bằng dấu phẩy |
| `AI_HTTP_URL` | Có | ML service (`gaze-api`) HTTP — dùng cho `/ai/health` |
| `GAZE_DOWNSAMPLE_HZ` | Không | Downsample gaze trước khi ghi DB (mặc định 4.0) |
| `GAZE_BATCH_MAX` | Không | Batch gaze tối đa (mặc định 2000) |
| `DEBUG` | Không | Bật debug (mặc định `false`) |
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
- `POST /api/calibrations` — JSON `{deviceFingerprint, numPoints, params: [a1,a2,b1,a3,a4,b2], maePx?, mappingModelVersion?, screenWidthPx?, screenHeightPx?}` — 6 tham số trả về từ `POST /calibrate/fit` của AI service; bất kỳ bản cũ nào của (user, device) tự deactivate
- `GET /api/calibrations/active?deviceFingerprint=` — metadata bản active (`calibrated`, `maePx`, `mappingModelVersion`, `calibratedAt`)
- `GET /api/calibrations/active/params?deviceFingerprint=` — JSON `{params: [a1,a2,b1,a3,a4,b2]}` active để client gửi vào message cấu hình của WS `/infer` (không cần calibrate lại)

### AI service — kết nối trực tiếp
- WebSocket `/infer` và `POST /calibrate/point`, `POST /calibrate/fit` **không còn proxy qua backend** — frontend/AI service gọi trực tiếp (`AI_HTTP_URL` của ML service).
- `GET /ai/health` — backend probe ML service còn sống không.

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
- **Gaze**: tọa độ chuẩn hóa [0,1]; chỉ ghi event khi nằm trong [0,1] — sample "ngoài màn hình" (AI báo no_face → -1,-1) chỉ đếm vào `gaze_slide_stats` (total/on-slide) để on-slide ratio chính xác mà không nhiễu heatmap; thống kê on-slide/view-time ghi lúc ingest.
- **Heatmap**: fixation detection (dispersion) + hotspot clustering (grid 24×24 + local maxima) tính on-the-fly từ `gaze_events`; `heatmap_aggregates`/`engagement_scores` được tự refresh gần thời gian thực sau mỗi batch gaze-sample (incremental, chỉ chạm slide của batch) + endpoint recompute (batch) để chạy lại toàn bài.
- **camelCase**: toàn bộ response dùng alias generator `to_camel` — khớp `frontend/lib/types/domain.ts`, UI không cần sửa.
