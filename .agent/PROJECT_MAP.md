# PROJECT_MAP — EyeLearning (GazeEdu)

Bản đồ dự án dành cho AI agent: cấu trúc, module, endpoint, dữ liệu và luồng chính.
Mọi thông tin đều được xác minh từ code/config thực tế; chỗ chưa rõ ghi **Unknown**.

---

## 1. Tổng quan

Nền tảng học tập theo dõi hành vi mắt: học viên học bài giảng slide qua webcam, hệ thống
ước lượng hướng nhìn (ML) và sinh phân tích (heatmap, mức độ tập trung) cho giáo viên.

| Lớp | Công nghệ | Cổng/Run |
|---|---|---|
| `frontend/` | Next.js 16.3.1 · React 19 · TypeScript · Tailwind 4 · TanStack Query | `:3000` |
| `backend/` | FastAPI · SQLAlchemy 2 async · asyncpg · Pydantic v2 | `:8001` |
| `db/` | PostgreSQL 16 (Docker) + SQL migrations | `:5435` |
| `API/` | ML gaze (mediapipe + UniGaze, image `hieunm1501/gaze-api:gpu`) | `:8000` (`/session`) |

Vai trò: `admin`, `teacher`, `student`.

## 2. Cấu trúc thư mục

```
EyeLearning/
├── .env / .env.example       # MỘT file env duy nhất (gốc repo) — KHÔNG commit .env
├── docker-compose.yml        # postgres (:5435) + backend (:8001)
├── README.md                 # chạy, tài khoản demo, luồng dữ liệu
├── test.html                 # file thử nghiệm
├── frontend/
│   ├── app/                  # App Router: teacher, student, admin, account, landing, try (guest)
│   ├── components/           # ui/, landing/, teacher/, student/, admin/, account/, profile/, try/
│   ├── public/demo/          # 3 slide SVG mẫu cho luồng dùng thử /try
│   ├── lib/api/              # client (fetch+refresh), auth, teacher, student, admin, profile, calibration
│   ├── lib/types/domain.ts   # kiểu TS khớp schema backend (camelCase)
│   ├── lib/hooks/use-stored-user.ts   # localStorage user an toàn hydration
│   ├── hooks/                # use-teacher, use-student, use-profile, use-gaze-tracker
│   └── AGENTS.md             # ⚠️ Next.js bản này KHÁC chuẩn — đọc docs trong node_modules trước khi viết code
├── backend/
│   ├── app/                  # FastAPI (chi tiết §6)
│   ├── tests/                # pytest (conftest, test_auth, test_flow)
│   ├── e2e_check.py          # smoke test full flow qua HTTP
│   ├── Dockerfile            # python:3.11-slim, uvicorn app.main:app :8001
│   └── requirements.txt
├── db/
│   ├── migrations/           # 001_init → 006 (idempotent)
│   ├── maintain_partitions.sql, fix_*.sql, restore_course.sql
│   └── README.md / ERD.md
└── API/                      # ML gaze service (docker-compose riêng, cần GPU)
    ├── docker-compose.yml    # gaze:8000 (hieunm1501/gaze-api:gpu)
    └── weights/              # bind mount vào /app/weights
```

## 3. Kiến trúc

```
┌────────────────┐  HTTP /api/* (relative) ┌──────────────────┐  SQL  ┌────────────┐
│   frontend     │ ───────────────────────► │     backend      │ ────► │  postgres  │
│  Next.js :3000 │  Next rewrite /api/* →   │   FastAPI :8001  │       │   (:5435)  │
└──────┬─────────┘  BACKEND_INTERNAL        └─────────▲────────┘       └────────────┘
       │  /gaze/* (HTTP, Next rewrite)             │  GET /ai/health (probe)
       │  ────────────────────────►┌───────────────┐│
       │                           │  API (ML)     │◄┘
       │  WS /session/{sid}/stream │  :8000        │
       └──────────────────────────►└───────────────┘
              (trực tiếp, không qua proxy)
```

- Frontend gọi backend qua **relative** `/api/*` — Next.js rewrite (`next.config.ts: beforeFiles /api/teacher, /api/admin và afterFiles /api/:path*`) proxy tới `BACKEND_INTERNAL` (mặc định `http://localhost:8001`, env `NEXT_PUBLIC_BACKEND_INTERNAL`).
- `next.config.ts` rewrite `/media/:path*` → `${BACKEND_INTERNAL}/media/:path*` (ảnh slide). Frontend render slide qua `resolveMediaUrl()` (`lib/api/client.ts:24`): nếu `/media/*` giữ nguyên để rewrite xử lý.
- `next.config.ts` rewrite `/gaze/:path*` → `${GAZE_INTERNAL}/:path*` (mặc định `http://localhost:8000`, env `NEXT_PUBLIC_GAZE_INTERNAL`) — HTTP calibration đi qua proxy cùng-origin, tránh CORS.
- Backend mount `/media` StaticFiles từ `MEDIA_DIR` (volume `backend-media`) — `main.py:60`.
- Gaze WS `/session/{sid}/stream` nối **trực tiếp** tới AI service (`ws://` từ `NEXT_PUBLIC_EYE_TRACKING_WS_URL`), không qua proxy (WS không bị CORS).

## 4. Entry points

| Entry | Vị trí |
|---|---|
| FastAPI app | `backend/app/main.py:29` — CORS, 11 routers, `/health`, mount `/media` |
| Backend serve | `uvicorn app.main:app --host 0.0.0.0 --port 8001` (`backend/Dockerfile`) |
| Swagger/OpenAPI | `http://localhost:8001/docs` |
| DB init | `db/migrations/*.sql` → mount `/docker-entrypoint-initdb.d` (chỉ chạy lần đầu tạo volume) |
| Landing | `frontend/app/page.tsx` → `components/landing/landing-page.tsx` |
| Dùng thử (guest) | `frontend/app/try/page.tsx` → `components/try/try-flow.tsx` — CTA "Dùng thử" từ landing, không cần đăng nhập |
| Route groups | `app/teacher/(dashboard)`, `app/teacher/(viewer)`; `app/student/(dashboard)`, `app/student/(viewer)`; `app/admin` |
| Auth UI | `app/account/login/page.tsx` → `components/account/login-form.tsx` |

## 5. API Routes

### Auth (`/api/auth`, `routes/auth.py`)
| Method | Path (qua Next rewrite `/api/*`) | Hàm : dòng | Mô tả |
|---|---|---|---|
| POST | `/api/auth/login` | `login:56` | `{email,password}` → `{accessToken, refreshToken, user}` |
| POST | `/api/auth/refresh` | `refresh:76` | rotate refresh token (1 lần dùng) |
| POST | `/api/auth/logout` | `logout:98` | revoke refresh token |

### Hồ sơ (`/api/me`, `routes/users.py`)
| Method | Path | Hàm : dòng |
|---|---|---|
| GET | `/api/me/profile` | `get_my_profile:49` |
| PATCH | `/api/me/profile` | `update_my_profile:56` |

### Khóa học — giáo viên (`routes/courses.py`, router không prefix)
| Method | Path (rewrite `/api/teacher` hoặc `/api/admin` → backend `/teacher`,`/admin`) | Hàm : dòng | Quyền |
|---|---|---|---|
| GET | `/teacher/courses` | `list_teacher_courses:76` | teacher/admin |
| POST | `/teacher/courses` | `create_course:137` | teacher/admin (201) |
| PATCH | `/teacher/courses/{id}` | `update_course:186` | owner/admin |
| DELETE | `/teacher/courses/{id}` | `delete_course:231` | owner/admin |
| GET | `/teacher/courses/{id}` | `get_course_tree:245` | owner/admin/assigned |
| GET | `/teacher/courses/{id}/students` | `get_course_students:300` | owner/admin/assigned |
| GET | `/teacher/students` | `list_student_directory:403` | teacher/admin |
| POST | `/teacher/courses/{id}/students` | `add_course_students:444` | owner/admin |
| DELETE | `/teacher/courses/{id}/students/{sid}` | `remove_course_student:482` | owner/admin/assigned |
| GET | `/api/courses/{id}` | `get_course_outline:506` | student (đã enroll) |

Frontend gọi giáo viên qua `NEXT_PUBLIC_API_URL` relative: thực tế request là `/api/teacher/courses` → Next beforeFiles rewrite → `BACKEND_INTERNAL/teacher/courses`; tương tự `/api/admin/*`. Học viên gọi `/api/courses/{id}`, `/api/me/*` → afterFiles rewrite.

### Modules / Lessons / Slides (`routes/modules.py`, `routes/lessons.py`)
| Method | Path | Hàm : dòng | Quyền |
|---|---|---|---|
| POST | `/teacher/courses/{id}/modules` | `create_module:45` | **owner/admin** |
| PATCH | `/teacher/modules/{id}` | `update_module:72` | owner/admin |
| DELETE | `/teacher/modules/{id}` | `delete_module:92` | owner/admin |
| POST | `/teacher/modules/{id}/lessons` | `create_lesson:71` | **owner/admin** |
| PATCH | `/teacher/lessons/{id}` | `update_lesson:103` | owner/admin |
| DELETE | `/teacher/lessons/{id}` | `delete_lesson:119` | owner/admin |
| POST | `/teacher/lessons/{id}/slides` | `add_slide:133` | owner/admin/assigned |
| POST | `/teacher/lessons/{id}/slides/upload` | `upload_lesson_pdf:213` | owner/admin/assigned (PDF→JPEG, thay slide cũ) |
| DELETE | `/teacher/slides/{id}` | `delete_slide:252` | owner/admin/assigned |
| GET | `/api/lessons/{id}/contents` | `get_lesson_contents:268` | student (đã enroll) |
| PATCH | `/api/lessons/{id}/progress` | `patch_lesson_progress:297` | student |

### Học tập (`routes/enrollments.py`, `routes/gaze.py`)
| Method | Path | Hàm : dòng |
|---|---|---|
| GET | `/api/me/enrollments` | `my_enrollments:24` |
| POST | `/api/courses/{id}/enroll` | `enroll:107` (201) |
| GET | `/api/me/stats` | `my_stats:136` (streak + phút học tuần) |
| POST | `/api/learning-sessions` | `create_learning_session:72` (201) |
| PATCH | `/api/learning-sessions/{id}` | `end_learning_session:114` |
| POST | `/api/lessons/{id}/gaze-samples` | `post_gaze_samples:152` (batch; clamp [0,1], downsample ~4Hz) |

### Calibration backend (`/api/calibrations`, `routes/calibration.py`) — lưu model cũ (hiện ít dùng, frontend mới lưu session id localStorage)
| Method | Path | Hàm : dòng |
|---|---|---|
| POST | `/api/calibrations` | `save_calibration_params:49` (201; deactivate bản cũ cùng user+device) |
| GET | `/api/calibrations/active` | `get_active_calibration:106` (404 → chưa có) |
| GET | `/api/calibrations/active/params` | `get_active_calibration_params:130` |

### Analytics (`routes/analytics.py`)
| Method | Path | Hàm : dòng | Quyền |
|---|---|---|---|
| GET | `/teacher/lessons/{id}/heatmap` | `get_lesson_heatmap:29` | owner/admin/assigned (`studentId=` lọc cá nhân) |
| POST | `/teacher/courses/{id}/recompute` | `recompute_course_analytics:53` | **owner/admin** (batch recalc aggregates) |

### Admin (`/admin`, `routes/admin.py`) — phân công giáo viên
| Method | Path | Hàm : dòng | Quyền |
|---|---|---|---|
| GET | `/admin/teachers` | `list_teachers:32` | admin |
| GET | `/admin/courses/{id}/teachers` | `list_course_teachers:65` | admin |
| POST | `/admin/courses/{id}/teachers` | `assign_teachers:120` (201, `{teacherIds}`) | admin |
| DELETE | `/admin/courses/{id}/teachers/{tid}` | `unassign_teacher:149` | admin |

### AI service (`API/`, image `hieunm1501/gaze-api:gpu`) — qua Next rewrite `/gaze/*`
| Method | Path (frontend gọi) | Thực tế tới AI | Mô tả |
|---|---|---|---|
| POST | `/gaze/session` | `POST /session` | tạo session `{screen_width, screen_height, points:[{id,x,y}]}` → `{session_id}` |
| POST | `/gaze/session/{sid}/calibrate` | `POST /session/{sid}/calibrate` (multipart image+point_id) | `{status: accepted|no_face|invalid_image, count}` |
| POST | `/gaze/session/{sid}/train` | `POST /session/{sid}/train` | `{status: ok|insufficient_samples, mae_px}` |
| WS | `ws://.../session/{sid}/stream` (trực tiếp) | `WS /session/{sid}/stream` | binary JPEG → `{ok,x,y}` / `{ok:false,error}` |

### Proxy / hệ thống
| Method | Path | Hàm : dòng |
|---|---|---|
| GET | `/ai/health` | `proxy.py: ai_health:11` (probe `AI_HTTP_URL`) |
| GET | `/health` | `main.py: health:53` |

## 6. Các module quan trọng

### Backend (`backend/app/`)
| Layer | File | Vai trò |
|---|---|---|
| Core | `core/config.py` | `Settings` pydantic-settings — đọc **`.env` ở gốc repo** (`config.py:47 get_settings`) |
| Core | `core/security.py` | bcrypt `hash/verify_password:11,17`; JWT HS256 `create/decode_access_token:26,41`; `new_refresh_token:45` + `hash_refresh_token:49` (SHA-256) |
| Core | `core/helpers.py` | gradient/color palette, `relative_time_vn:41` |
| Core | `core/deps.py` | **File RỖNG** — dep thật nằm ở `api/deps.py` |
| DB | `db/session.py` | async engine (NullPool khi `TESTING=1`), `SessionLocal`, `get_db:17` |
| DB | `db/base.py` | SQLAlchemy `Base` |
| Models | `models/{auth,profile,course,gaze,calibration,analytics}.py` | ORM ánh xạ migrations (30 class) |
| Schemas | `schemas/*.py` | Pydantic v2, camelCase output (`common.py` alias generator `to_camel`) — khớp `frontend/lib/types/domain.ts` |
| CRUD | `crud/user.py`, `crud/profile.py` | data access: `get_user_by_email:10`, `create_session:28`, `get_valid_session:48`, `revoke_session:57`, profile/gender lookups |
| Services | `services/analytics.py` | `compute_slide_stats:38`, `_count_fixations:111`, `_compute_hotspots:134`, `recompute_lesson_aggregates:186`, `refresh_aggregates:298` |
| Services | `services/course_stats.py` | `enrollment_counts:16`, `lesson_counts:27`, `attention_avg_by_course:57`, `completion_percent:86` — ⚠️ `course_ids_of_teacher:9` là **dead code** |
| API deps | `api/deps.py` | `get_current_user:15`, `require_roles:41`, `can_manage_course:52`, `can_access_course:60` |

### Frontend
| Module | File | Vai trò |
|---|---|---|
| API client | `lib/api/client.ts` | `apiFetch:108`, `apiFetchMultipart:147`, `apiFetchBlob:182` — gọi **relative** `/api/*` (Next rewrite tới backend), tự gắn Bearer, refresh 1 lần khi 401; `resolveMediaUrl:24` (giữ `/media/*` nguyên để rewrite) |
| Auth | `lib/api/auth.ts` | login/logout/`refreshHandlers`, event `gaze-auth-change` |
| Domain | `lib/types/domain.ts` | `TeacherCourse`, `LessonNode`, `ModuleNode`, `StudentRow`, `SlideStat`, `Hotspot`, `EnrolledCourse`, `CourseOutline`, `MyProfile`, `ProfileUpdate`… |
| Student | `lib/api/student.ts` | enrollments, stats, outline, slides (`/api/lessons/{id}/contents`), learning-session, gaze-samples, progress; `getDeviceFingerprint:44` |
| Teacher | `lib/api/teacher.ts` | courses, tree, students, heatmap (`CourseListQuery`) |
| Admin | `lib/api/admin.ts` | `fetchTeachers`, `fetchCourseTeachers`, `assignTeachers`, `unassignTeacher` |
| Calibration | `lib/api/calibration.ts` | **Mới:** `buildCalibrationPoints:28` (16 điểm 4×4, id p0-p15), `createGazeSession:50` (POST `/gaze/session`), `submitCalibrationSample:77` (POST `/gaze/session/{sid}/calibrate` multipart), `trainGazeSession:108` (POST `/gaze/session/{sid}/train`), `checkFace:124`, `store/getStored/clearStoredGazeSession:134-153` (localStorage `gaze_session_id`), `gazeStreamUrl:159` (WS `/session/{sid}/stream`) |
| Hooks | `hooks/use-gaze-tracker.ts` | camera + WS `/session/{sid}/stream` (fire-and-forget 20 FPS), fallback `simulated` khi no_face/camera lỗi; `GazeSource = real|simulated|off`; đọc `gaze_session_id` từ localStorage khi `calibrated=true` |
| Hooks | `hooks/{use-teacher,use-student,use-profile}.ts` | TanStack Query hooks; `useLessonSlides:26` (query `student/lesson-slides`) |
| Hooks | `lib/hooks/use-stored-user.ts` | đọc `auth_user` localStorage an toàn hydration (useSyncExternalStore) |

## 7. Symbol Map (file:line)

- App: `main.py:29 app`, `main.py:23 lifespan`, `main.py:52 health`
- Auth: `auth.py:56 login`, `:76 refresh`, `:98 logout`; `security.py:11 hash_password`, `:26 create_access_token`, `:41 decode_access_token`, `:45 new_refresh_token`, `:49 hash_refresh_token`
- Deps: `deps.py:15 get_current_user`, `:41 require_roles`, `:52 can_manage_course`, `:60 can_access_course`
- Permission resolver: `courses.py:59 _get_owned_course`, `:67 _get_viewable_course`, `:52 _get_course_or_404`
- Gaze: `gaze.py:29 _upsert_device`, `:72 create_learning_session`, `:152 post_gaze_samples`; `services/analytics.py:38 compute_slide_stats`, `:134 _compute_hotspots`, `:298 refresh_aggregates`
- PDF render: `lessons.py:169 _render_pdf_slides` (pymupdf), `:213 upload_lesson_pdf`
- Calibration backend: `calibration.py:49 save_calibration_params`, `:106 get_active_calibration`, `:130 get_active_calibration_params` (hiện ít dùng)
- Calibration frontend: `lib/api/calibration.ts:28 buildCalibrationPoints`, `:50 createGazeSession`, `:77 submitCalibrationSample`, `:108 trainGazeSession`, `:134 storeGazeSession`
- Media: `lib/api/client.ts:24 resolveMediaUrl` — học viên dùng để hiển thị slide
- Frontend hooks: `lib/api/client.ts:108 apiFetch`, `hooks/use-gaze-tracker.ts:43 useGazeTracker`
- Student: `components/student/course-learning.tsx:97 useLessonSlides` (hiển thị 1 slide/trang, `overflow-y-auto`), `lib/api/student.ts:75 fetchLessonSlides`

## 8. Dependency Map

```
.env (root) ─► core/config.py ─► main.py, routes (qua get_settings)
core/security.py ─► crud/user.py ─► routes/auth.py
api/deps.py (get_current_user/require_roles/can_*) ─► mọi route /teacher & /admin
routes/*.py ─► crud/*.py ─► models/*.py (SQLAlchemy)
routes/*.py ─► services/analytics.py & course_stats.py ─► schemas (out model)
schemas/*.py ─(camelCase to_camel)─► frontend/lib/types/domain.ts
lib/api/client.ts (apiFetch relative /api/*) ─► lib/api/{auth,teacher,student,admin}.ts ─► hooks/* ─► components/*
lib/api/calibration.ts (gaze /session) ─► components/student/calibration.tsx, pre-learning-check.tsx
hooks/use-gaze-tracker.ts ─► lib/api/calibration (getStoredGazeSessionId, gazeStreamUrl)
components/student/course-learning.tsx ─► hooks/use-student (useLessonSlides, useCourseOutline) + lib/api/client.resolveMediaUrl
components/teacher/heatmap-viewer.tsx ─► hooks/use-teacher + use-student (slides) + lib/api/client.API_BASE_URL
frontend/next.config.ts (rewrites) ─► BACKEND_INTERNAL, GAZE_INTERNAL (env)
```

Media: `POST /teacher/lessons/{id}/slides/upload` → render PDF → JPEG vào `MEDIA_DIR`,
`lesson_contents.image_url = /media/lessons/{id}/slide_*.jpg` → frontend hiện qua `resolveMediaUrl()` hoặc rewrite `/media/*`.

Gaze session: Next rewrite `/gaze/*` → AI service; WS `/session/{sid}/stream` nối thẳng.

## 9. Database

### Bảng (từ `db/migrations/001_init.sql` + `004_analytics.sql` + `006_course_teachers.sql`)
- **Identity**: `user_statuses`, `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `oauth_accounts` (chưa dùng), `auth_sessions`
- **Hồ sơ**: `genders`, `user_profiles`, `student_profiles`, `teacher_profiles`
- **Nội dung khóa học**: `course_statuses`, `courses`, `modules`, `lessons`, `lesson_contents`, `course_teachers` (006 — phân công GV)
- **Học tập**: `enrollments`, `lesson_progress`, `learning_sessions`, `devices`
- **Calibration**: `calibration_sessions`, `calibration_params` (6 tham số active theo user+device — hiện ít dùng, frontend mới lưu `gaze_session_id` localStorage)
- **Gaze**: `gaze_events` (PARTITION BY RANGE event_time theo tháng; `gaze_events_default` + 12 partition đầu; function `create_gaze_partitions(months_ahead)` từ `003`), `gaze_slide_stats`
- **Analytics (004)**: `aoi_regions`, `heatmap_aggregates`, `aoi_dwell_stats`, `engagement_scores`

### Ghi chú quan trọng
- Tọa độ gaze `gaze_x/gaze_y` và AOI: **chuẩn hóa [0,1]**; không CHECK biên trong DB — clamp ở tầng application trước khi ghi.
- Migration **idempotent** (`IF NOT EXISTS`), chạy lại an toàn; chạy tự động lần đầu tạo volume.
- Bảo trì partition: `db/maintain_partitions.sql` (cron tháng); host timezone UTC (`TZ: UTC` trong compose).
- Fix scripts: `db/fix_names.sql`, `db/fix_profiles.sql`, `db/restore_course.sql` (thao tác cụ thể, dùng khi cần).

## 10. AuthN/Z

- **JWT access ngắn hạn** (HS256, `ACCESS_TOKEN_EXPIRE_MINUTES`), **refresh token** dạng chuỗi ngẫu nhiên, lưu **SHA-256 hash** trong `auth_sessions`; rotation khi refresh.
- Frontend lưu localStorage: `auth_token`, `refresh_token`, `auth_user`, `gaze_session_id`, `gaze_calibrated_at`, `gaze_device_fingerprint`.
- `lib/api/client.ts` gọi **relative** `/api/*` (qua Next rewrite, không còn CORS); tự refresh 1 lần khi gặp 401 rồi retry; hết hạn → `clearAuthStorage`.
- **RBAC**: role lấy từ `user_roles`; vai trò trong JWT + kiểm tra `user_roles` khi cần.
- **Quyền khóa học** (2 cấp):
  - `can_manage_course` (`deps.py:52`): admin ∨ chủ khóa (`courses.teacher_id`). → create/update/delete module, lesson, khóa; add/remove SV.
  - `can_access_course` (`deps.py:60`): admin ∨ owner ∨ được phân công (`course_teachers`). → view tree/students/heatmap, **add slide**, upload PDF, delete slide, remove SV.
- **Admin** (`/admin/*`): chỉ `require_roles("admin")` — quản lý phân công GV.
- Demo accounts (seed `002`, pass trong README): `admin@school.edu.vn`, `teacher@school.edu.vn`, `student@school.edu.vn` (+ `teacher2@school.edu.vn` đã được phân công thủ công).

## 11. External Services

- **ML gaze service** (`API/`, image `hieunm1501/gaze-api:gpu`, `API/docker-compose.yml: gaze:8000`):
  - `POST /session` `{screen_width, screen_height, points:[{id,x,y}]}` → `{session_id}`
  - `POST /session/{sid}/calibrate` (multipart image+point_id) → `{status: accepted|no_face|invalid_image|unknown_point, count}`
  - `POST /session/{sid}/train` → `{status: ok|insufficient_samples, mae_px}`
  - `WS /session/{sid}/stream` → binary JPEG → `{ok,x,y}` / `{ok:false,error:no_face}` (requires `state==ready`, else close 1008 `not_calibrated`)
  - Frontend gọi HTTP qua Next rewrite `/gaze/*` để tránh CORS; WS nối thẳng `ws(s)://` từ `NEXT_PUBLIC_EYE_TRACKING_WS_URL`.
  - Code tham chiếu trong image: `server.py`, `calibration.py` (LinearRegression 2→2, 6 params, ubjson pickle), `session_manager.py` (TTL 30min, max 100 sessions).
  - Lưu ý: `API/README.md` mô tả protocol cũ, không dùng nữa — thực tế là `/session` như trên.
- **Cloudinary**: `.env.example` có `CLOUDINARY_*` nhưng **không tìm thấy usage trong code** → Unknown / dự phòng.

## 12. Env vars (chỉ tên biến — không giá trị; theo `.env.example` và code)

| Nhóm | Biến | Nơi dùng |
|---|---|---|
| Postgres (compose) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `DATABASE_URL_DOCKER` | `docker-compose.yml`, `core/config.py` |
| JWT | `JWT_SECRET` (bắt buộc đổi prod), `JWT_ALGORITHM` (HS256), `ACCESS_TOKEN_EXPIRE_MINUTES` (60), `REFRESH_TOKEN_EXPIRE_DAYS` (30) | `core/config.py`, `core/security.py` |
| App | `CORS_ORIGINS`, `DEBUG` | `core/config.py` (cors_origin_list) |
| Gaze ingest | `GAZE_DOWNSAMPLE_HZ` (4.0), `GAZE_BATCH_MAX` (2000) | `core/config.py` |
| AI service (backend probe) | `AI_HTTP_URL` | `core/config.py`, `proxy.py` |
| Cloudinary | `CLOUDINARY_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (XEM §11) | `docker-compose.yml` (optional) |
| Test | `TESTING` (`1` = NullPool) | `db/session.py` |
| Frontend (Next) | `NEXT_PUBLIC_API_URL` (deprecated, dùng relative `/api/*`), `NEXT_PUBLIC_BACKEND_INTERNAL` (mặc định `http://localhost:8001`), `NEXT_PUBLIC_GAZE_INTERNAL` (mặc định `http://localhost:8000`), `NEXT_PUBLIC_EYE_TRACKING_WS_URL` (mặc định `wss://api.nmhieu.online` → local nên đặt `ws://127.0.0.1:8000`) | `next.config.ts`, `lib/api/client.ts` (normalize), `lib/api/calibration.ts` |

Lưu ý: frontend hiện gọi backend qua **relative** `/api/*` và `/media/*` (không cần `NEXT_PUBLIC_API_URL` nếu dùng rewrite); `NEXT_PUBLIC_EYE_TRACKING_WS_URL` dùng cho WS.

## 13. Config

- Một file env duy nhất: **`.env` ở gốc repo**. `docker-compose.yml`, `backend/app/core/config.py` và `API/docker-compose.yml` đều đọc từ đó (trừ `NEXT_PUBLIC_*` đọc từ `frontend/.env.local` khi dev); không giá trị mẫu nhúng trong code.
- `core/config.py`: class `Settings` (pydantic-settings, `ROOT_ENV_FILE = parents[3]/.env`); `get_settings:47` cache; `MEDIA_DIR`/`media_path` tạo tự động ở `lifespan`.
- `core/config.py` chỉ đọc 4 biến bắt buộc: `database_url`, `jwt_secret`, `cors_origins`, `ai_http_url` — `AI_WS_URL` trong `.env` hiện không đọc (chỉ dùng `NEXT_PUBLIC_EYE_TRACKING_WS_URL` ở frontend).
- CORS: `cors_origin_list` resolve từ `CORS_ORIGINS` (phân tách phẩy, strip).
- Frontend config: `frontend/next.config.ts` — `rewrites()` với `beforeFiles` (`/api/teacher`, `/api/admin`) và `afterFiles` (`/api/:path*`, `/media/:path*`, `/gaze/:path*`) trỏ tới `BACKEND_INTERNAL`/`GAZE_INTERNAL`; `frontend/lib/api/client.ts: `normalizeApiUrl` + `resolveMediaUrl` + `buildUrl` dùng relative path.
- `frontend/.env.local` (gitignored) override `NEXT_PUBLIC_*` khi dev.

## 14. Error / Debug Map

| Lỗi | Nơi xảy ra / fix |
|---|---|
| 401 | `api/deps.py:15 get_current_user` (hết hạn/thiếu token) — frontend tự refresh qua `client.ts:77 tryRefresh` |
| 403 | `api/deps.py:41 require_roles` hoặc `can_manage_course:52`/`can_access_course:60` — kiểm tra role + ownership/`course_teachers` |
| 404 lesson | `courses.py:52 _get_course_or_404`, `lessons.py:33 _get_lesson_or_404`; calibration active khi chưa có params |
| 404 slide / 404 gaze session | `GET /api/lessons/{id}/contents` 403 nếu chưa enroll; `POST /session/{sid}/calibrate` 404 nếu sid hết hạn (TTL 30min) |
| Login sai | `routes/auth.py:56` → `crud/user.py:10 get_user_by_email` → `security.py verify_password` → 401 |
| Ảnh slide không hiện (học viên) | `course-learning.tsx:102 resolveMediaUrl` + `next.config.ts` `/media` rewrite; kiểm tra file tồn tại `MEDIA_DIR/lessons/{id}/` và `API_BASE_URL` |
| Ảnh slide 404 teacher | `heatmap-viewer.tsx:91` `${API_BASE_URL}${slideImageRaw}` — cần `NEXT_PUBLIC_API_URL` đúng |
| 500 heatmap | `routes/analytics.py:29 get_lesson_heatmap` → `services/analytics.py:38 compute_slide_stats` (đọc `gaze_events`) |
| 422 camelCase | schema `to_camel` ↔ `domain.ts` lệch tên field |
| Hydration mismatch | đọc localStorage khi SSR — dùng `lib/hooks/use-stored-user.ts` (useSyncExternalStore) hoặc defer `setTimeout` trong effect |
| Gaze không "real" | kiểm tra: camera permission, AI service có chạy (`/health` → `gpu_available`), `gaze_session_id` localStorage có tồn tại, WS `/session/{sid}/stream` 1008 `not_calibrated` → chưa train; fallback `simulated` |
| Heatmap nhạt | `heatmap-viewer.tsx:229 gain = 255/maxAlpha` (cũ `2.6/maxAlpha` làm `t≈0.1` luôn xanh), gradient alpha thấp, `mix-blend-multiply` + `opacity 0.7` → đã sửa lên `gain 255/maxAlpha`, `t=pow(a*gain,0.6)`, alpha `85+t*170`, blend `normal`, opacity `0.88` |
| Batches to | `GAZE_BATCH_MAX` (2000) — `post_gaze_samples` chia nhỏ |
| CORS (cũ) | backend đã dùng relative `/api/*` qua Next rewrite nên không còn CORS; `/gaze/*` cũng qua rewrite nên HTTP không CORS, WS không bị CORS |

## 15. Common Data Flows

1. **Calibration `/session` (học viên, mới)**: tạo session `POST /gaze/session` (16 điểm `buildCalibrationPoints` 4×4, `MIN_SAMPLES=5` mỗi điểm) → bấm từng điểm chụp 5 frame gửi `POST /gaze/session/{sid}/calibrate` (server gom) → đủ 80 mẫu → `POST /gaze/session/{sid}/train` → `storeGazeSession(sid)` (localStorage `gaze_session_id` + `gaze_calibrated_at`). TTL server 30min.
2. **Học bài + gaze**: mở `POST /api/learning-sessions` (enrollment) → `useGazeTracker` đọc `gaze_session_id` từ localStorage → mở `WS /session/{sid}/stream` (fire-and-forget 20 FPS, binary JPEG) → nhận `{ok,x,y}` clamp [0,1] → batch `POST /api/lessons/{id}/gaze-samples` → backend downsample ~4Hz, ghi `gaze_events` (partition tháng) + cập nhật `gaze_slide_stats` + refresh aggregates incremental. Chưa calibrate → `simulated`.
3. **Học viên xem slide**: `GET /api/lessons/{id}/contents` → `Slide[]` (`imageUrl: /media/lessons/{id}/slide_*.jpg`) → `resolveMediaUrl()` (giữ `/media/*` để Next rewrite) → `<img>` hiển thị 1 slide/trang, `overflow-y-auto`, `w-full` (đã sửa từ `overflow-hidden` + `max-h-full`).
4. **Analytics/GV**: view cây khóa học (`GET /teacher/courses/{id}`) → xem heatmap từng slide (`GET /teacher/lessons/{id}/heatmap?studentId=`) — on-slide ratio, fixations, viewSec, hotspots; canvas heatmap vẽ density (`SCALE=6`, `lighter` composite) + colorize `gain 255/maxAlpha` + `heatColor` (blue→red) + `opacity 0.88` + `mix-blend-normal`.
5. **Phân công GV (admin)**: `GET/POST/DELETE /admin/courses/{id}/teachers` → ghi `course_teachers` → GV được phân công có `can_access_course`, `TeacherCourseOut.isOwner=false`, UI ẩn nút manage (chỉ slide/upload/remove SV).
6. **Dùng thử guest (`/try`, 100% không ghi DB)**: landing CTA → `intro` → `calibrate` (16 điểm × 5 mẫu qua `/gaze/session` + `/calibrate` + `/train`, lưu `gaze_session_id` localStorage; có nút bỏ qua → mô phỏng) → `view` (3 slide SVG `public/demo/*`, `useGazeTracker` thu gaze vào ref, KHÔNG gọi `postGazeSamples`/`learning-sessions`) → `result` (heatmap canvas tính local từ gaze đã thu, thuật toán giống `heatmap-viewer.tsx`: density SCALE=6 + `gain 255/maxAlpha`).

## 16. Tests

- **Backend**: `pytest` + `fastapi.testclient`, cần PostgreSQL + DB `eyetracking_test` (chạy migrations 001-006; lookup seed trong `conftest.py`). `conftest.py`: bật `TESTING=1`, reset DB mỗi test (TRUNCATE CASCADE), `make_user`, helpers `login`/`auth`; `requires_db` skip nếu không có DB. Các file: `test_auth.py` (health/login/refresh/logout/profile), `test_flow.py`.
  - Chạy: `cd backend; .venv\Scripts\python -m pytest tests -v`
- **Smoke**: `backend/e2e_check.py` — toàn quy trình qua HTTP.
- **Frontend**: **Unknown** — chưa thấy test script trong `package.json` (chỉ `dev`, `build`, `start`, `lint`).

## 17. Deployment

- `docker compose up -d` → postgres `:5435` + backend `:8001`; volume `pgdata`, `backend-media`. Backend cần `CORS_ORIGINS`, `AI_HTTP_URL` từ `.env`.
- `API/docker-compose.yml` riêng: `docker compose -f API/docker-compose.yml up -d` → `hieunm1501/gaze-api:gpu` `:8000` (cần NVIDIA runtime, `DEVICE=cuda`, mount `weights`).
- Backend image: `python:3.11-slim`, cài `requirements.txt`, `COPY app ./app`, uvicorn `:8001` (`backend/Dockerfile`).
- Migrations mount `/docker-entrypoint-initdb.d` — **chỉ chạy khi volume mới**; reset toàn bộ: `docker compose down -v`.
- Frontend: `cd frontend && npm run dev` (`:3000`, cần `NEXT_PUBLIC_BACKEND_INTERNAL`, `NEXT_PUBLIC_GAZE_INTERNAL`, `NEXT_PUBLIC_EYE_TRACKING_WS_URL`), hoặc `npm run build && npm start`. `next.config.ts` rewrites xử lý `/api`, `/media`, `/gaze` (cần env internal khi deploy sau proxy/tunnel).
- Bảo trì định kỳ: `db/maintain_partitions.sql` (tạo partition gaze tháng mới).

## 18. Important Files

| File | Lý do quan trọng |
|---|---|
| `docker-compose.yml` | postgres:5435, backend:8001, env, mount migrations |
| `API/docker-compose.yml` | gaze:8000 `hieunm1501/gaze-api:gpu`, ports, weights mount, DEVICE=cuda |
| `frontend/next.config.ts` | rewrites `/api/*`, `/media/*`, `/gaze/*` → internal backends (tránh CORS) |
| `backend/app/main.py` | đăng ký toàn bộ routers + mount `/media` |
| `backend/app/api/deps.py` | mọi auth/permission |
| `backend/app/core/config.py` + `.env` (root) | toàn bộ cấu hình backend (4 biến bắt buộc) |
| `backend/app/core/security.py` | JWT/bcrypt/refresh |
| `backend/app/routes/gaze.py` + `services/analytics.py` | lõi eye-tracking analytics |
| `backend/app/routes/{courses,modules,lessons}.py` | CRUD khóa học + PDF render |
| `frontend/lib/api/client.ts` | `apiFetch` relative + `resolveMediaUrl` + `normalizeApiUrl` |
| `frontend/lib/api/calibration.ts` | `createGazeSession`, `submitCalibrationSample`, `trainGazeSession`, `gazeStreamUrl` |
| `frontend/hooks/use-gaze-tracker.ts` | camera + WS `/session/{sid}/stream` (20 FPS fire-and-forget) |
| `frontend/components/student/course-learning.tsx` | học viên viewer: `useLessonSlides` + `resolveMediaUrl` + scroll `overflow-y-auto` |
| `frontend/components/teacher/heatmap-viewer.tsx` | canvas heatmap `gain 255/maxAlpha` + blend normal |
| `frontend/lib/types/domain.ts` | hợp đồng dữ liệu FE↔BE |
| `db/migrations/*.sql` | schema + partition + seed |
| `frontend/AGENTS.md` | quy tắc viết code Next.js bản riêng |

## 19. Change Impact Guide

- **Thêm/sửa endpoint backend**: backend route + schema → `frontend/lib/types/domain.ts` (nếu đổi response) → client API file (`student.ts`, `teacher.ts`) → hooks → component. Lưu ý `next.config.ts` `beforeFiles` cho `/api/teacher`/`/api/admin` (tránh deduplicate với `/api/:path*`).
- **Đổi quyền**: `api/deps.py` + logic `course_teachers` + thứ tự checks trong route; FE ẩn/hiện theo `isOwner`/role.
- **Thêm bảng**: viết migration mới (idempotent) → ORM model → test seed (`conftest.py` + `eyetracking_test`).
- **PDF/slide**: `lessons.py:169 _render_pdf_slides` (pymupdf) + `MEDIA_DIR/lessons/{id}/` + `resolveMediaUrl` + `next.config.ts` `/media` rewrite; xóa bài phải xóa folder.
- **Calibration/Gaze**: chỉnh `lib/api/calibration.ts` (protocol `/session`) + `hooks/use-gaze-tracker.ts` (WS) + `components/student/*` (create/submit/train, localStorage sid). Server session TTL 30min, `MIN_SAMPLES=5` mỗi điểm (80 mẫu).
- **Partition**: chỉ qua `003_gaze_partitions.sql` + `maintain_partitions.sql`; partition cũ `DROP` thay `DELETE`.
- **Rủi ro**: sửa `gaze_events`/heatmap chạm nhiều service (`analytics.py`, `course_stats`, heatmap viewer) — heatmap viewer gain/opacity/gradient nhạy với faint bug; sửa `resolveMediaUrl`/`isUnresolvable` ảnh hưởng hiển thị slide học viên; sửa rewrite ảnh hưởng CORS.

## 20. Agent Rules (quy tắc cho AI agent)

1. **KHÔNG đọc/committed `.env`, `.env.local`** — dùng `.env.example` và code để lấy tên biến; không in giá trị secret. (Nhưng khi debug CORS phải kiểm tra `cors_origin_list` và `NEXT_PUBLIC_*` internal.)
2. **Đọc `frontend/AGENTS.md`** trước khi sửa frontend — Next.js bản này khác chuẩn, phải đọc `node_modules/next/dist/docs/` trước khi viết code. Lưu ý deduplicate `beforeFiles`/`afterFiles` trong `next.config.ts`.
3. Migration **idempotent**; test DB riêng `eyetracking_test`; đừng chạy migration vào DB production auto.
4. Gaze coordinate **chuẩn hóa [0,1]**; clamp ở application layer. `no_face → onSlide giảm`, không ghi vào heatmap.
5. **Response camelCase** (`to_camel`) — schema output khớp `domain.ts`; không đặt tên lệch.
6. Trình bày code theo style hiện tại (async route functions, Depends, `HTTPException` tiếng Việt, không comment thừa). Frontend `'use client'` + TanStack Query + `useGazeTracker` fire-and-forget.
7. Tài khoản demo không phải secret (đã public trong README) nhưng đổi pass/prod.
8. `core/deps.py` rỗng — đừng viết dep vào đó; dep xài chủ yếu trong `api/deps.py`.
9. Slide học viên: `resolveMediaUrl` giữ `/media/*` nguyên để Next rewrite xử lý, không filter `localhost` qua `isUnresolvable`.

---
## Phần "Unknown" & cần xác minh thêm

- `API/` (ML service) chi tiết pipeline: `models.py`, `preprocessing.py` (OneEuroFilter), `calibration.py` (LinearRegression 6 params) — đã đọc từ image.
- Cloudinary (`CLOUDINARY_*`): có trong `.env.example` nhưng **không tìm thấy usage** trong code.
- `test.html`: file thử nghiệm ở root, chưa rõ mục đích.
- Frontend tests: chưa có test script (`package.json` chỉ `lint`).
- `db/fix_names.sql`, `db/fix_profiles.sql`, `db/restore_course.sql`: fix point-in-time — xem nội dung trước khi chạy.
- `AI_WS_URL` trong `.env` không được `core/config.py` đọc (chỉ `AI_HTTP_URL`).

Lần update gần nhất: chuyển frontend sang `/session` (thay `/calibrate/point`/`/infer`), thêm Next rewrite `/gaze` + `/api` relative (tránh CORS), sửa slide học viên `resolveMediaUrl` + `overflow-y-auto`, và heatmap `gain 255/maxAlpha` + vivid.
