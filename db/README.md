# Database — Eyetracking Learning Analytics

PostgreSQL schema cho dự án theo dõi hành vi học bằng eye-tracking.
Nguồn schema duy nhất là các file trong [`migrations/`](migrations/) — bắt đầu từ
`001_init.sql` (bảng, khóa ngoại, CHECK, index) rồi tới các migration tiệm tiến.

## Yêu cầu

- **PostgreSQL 13+** (dùng `gen_random_uuid()` và native partitioning)
- Kiểm tra: `psql --version`

## Cấu trúc

```
db/
├── README.md                     # file này
├── seed_dev_users.sql            # 3 tài khoản mẫu cho DEV — chạy THỦ CÔNG, không tự động
└── migrations/                   # chạy đúng thứ tự, TẤT CẢ đều idempotent
    ├── 001_init.sql              # schema nền: bảng, khóa, CHECK, index, partition gaze_events
    ├── 002_seed.sql              # seed bảng lookup (roles, permissions, statuses…)
    ├── 003_gaze_partitions.sql   # default partition + 12 tháng đầu + function bảo trì
    ├── 004_analytics.sql         # heatmap_aggregates, aoi_dwell_stats, engagement_scores
    ├── 005_calibration_model.sql # calibration_params: lưu model .ubj + mae/mapping version
    ├── …                         # 006→013: quiz/embeddings, index, FK cascade, …
    ├── 014_drop_course_level.sql # bỏ cột courses.level
    ├── 015_drop_lesson_progress.sql # bỏ bảng lesson_progress
    ├── 016_quiz_items.sql        # bài tập trắc nghiệm là một loại lesson (kind)
    ├── 017_lesson_show_gaze_dot.sql # cờ lessons.show_gaze_dot (GV bật/tắt điểm nhìn)
    ├── 018_calibration_keep_latest.sql # chỉ giữ 1 bản ghi calibration / (user, device)
    ├── 019_quiz_allow_retry.sql  # cờ quiz_assignments.allow_retry (GV cho học viên làm lại)
    └── 020_chat_sessions.sql     # chat_sessions/chat_messages: phiên + lịch sử trợ lý học tập
```

> **Calibration không lưu lịch sử**: mỗi lần hiệu chỉnh lại sẽ **ghi đè** bản ghi
> cũ của (user, thiết bị) — `calibration_params` giữ đúng 1 dòng, kèm 1 dòng
> `calibration_sessions`. Model `.ubj` cũ bị thay thế hoàn toàn (xem
> `POST /api/calibrations` và migration `018`).

Sơ đồ partition `gaze_events` được bảo trì bằng `ops/maintain_partitions.sql`
(xem mục "Bảo trì partition" bên dưới).

## Có 2 cách cài database

1. **Docker (`docker-compose.yml`)** — nhanh, sạch, khuyến nghị cho dev.
2. **PostgreSQL native (psql)** — khi đã có Postgres cài trực tiếp trên máy.

Migrations sẽ tự chạy đúng thứ tự trong cả 2 cách. **Tất cả file đều
idempotent** — chạy lại toàn bộ an toàn (đây là điều kiện bắt buộc vì
`Dockerfile.migrations` chạy lại tất cả mỗi lần deploy).

---

## Cách 1: Docker Compose

### Tạo database (lần đầu)

```bash
docker compose up -d postgres
```

Migrations **không** chạy qua `docker-entrypoint-initdb.d` (compose không bind
mount `./db/migrations`). Thay vào đó, service một-lần `migrate`
(`Dockerfile.migrations`) chạy **toàn bộ** `db/migrations/*.sql` mỗi lần deploy,
theo thứ tự tên file và idempotent. Kiểm tra:

```bash
# chạy migrations (một lần) rồi list bảng
docker compose up migrate
docker compose exec postgres psql -U postgres -d eyetracking -c '\dt'
```

- Host port: **5435** (container 5432) → kết nối từ host dùng `-p 5435`.
- Dữ liệu nằm trong volume `pgdata`, **không mất khi `down`**.

### Chạy lại seed / migrate thủ công

```bash
# seed lookup (roles, permissions, statuses…) — file nằm trong image migrations
docker compose run --rm migrate bash -c \
    'psql -h postgres -U $PGUSER -d $PGDATABASE -f /migrations/002_seed.sql'

# tài khoản mẫu cho dev (KHÔNG tự động chạy — mật khẩu mặc định Password123!)
docker compose exec -T postgres psql -U postgres -d eyetracking \
    -f - < db/seed_dev_users.sql
```

### Xóa database (xoá hết dữ liệu)

```bash
docker compose down -v        # -v: XÓA volume pgdata → xóa toàn bộ dữ liệu
```

> Dùng `docker compose down` (không `-v`) nếu chỉ muốn dừng mà **giữ** dữ liệu.

### Khởi động lại database (giữ dữ liệu)

```bash
docker compose up -d postgres
```

---

## Cách 2: Postgres native (psql)

### Tạo database

```bash
sudo systemctl start postgresql
sudo -u postgres createdb eyetracking

psql -d eyetracking -f db/migrations/001_init.sql
psql -d eyetracking -f db/migrations/002_seed.sql
psql -d eyetracking -f db/migrations/003_gaze_partitions.sql
```

### Seed thêm / chạy lại seed

```bash
psql -d eyetracking -f db/migrations/002_seed.sql
```

### Xóa database

```bash
sudo -u postgres dropdb eyetracking
# hoặc
psql -d postgres -c "DROP DATABASE eyetracking;"
```

> Không thể DROP khi đang có kết nối. Ngắt `pgadmin`/client trước, hoặc dùng:
> `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='eyetracking';`

### Xóa database trong container postgres

```bash
docker compose exec postgres psql -U postgres -d postgres -c "DROP DATABASE eyetracking;"
```

---

## Tài khoản mẫu (CHỈ cho dev — `seed_dev_users.sql`)

⚠️ **Migrations KHÔNG còn tạo tài khoản người dùng.** Trước đây `002_seed.sql`
tạo sẵn 3 tài khoản với mật khẩu mặc định `Password123!`, và migration `004`
còn ghi đè `password_hash` mỗi lần deploy → tài khoản production bị reset mật
khẩu về mặc định sau mỗi lần deploy. Hai điều này đã được bỏ.

Tài khoản mẫu giờ nằm ở `db/seed_dev_users.sql`, **chỉ chạy thủ công** khi dev:

```bash
psql -h localhost -p 5435 -U postgres -d eyetracking -f db/seed_dev_users.sql
```

| Vai trò | Email | Khả năng |
|---|---|---|
| Admin | `admin@school.edu.vn` | toàn quyền |
| Giáo viên | `teacher@school.edu.vn` | quản lý khóa học + analytics |
| Sinh viên | `student@school.edu.vn` | học + xem heatmap cá nhân |

- Mật khẩu mặc định: `Password123!`.
- Cả 3 được đặt `must_change_password = true` → **bắt buộc đổi mật khẩu ở lần
  đăng nhập đầu tiên** (`POST /api/auth/change-password`).
- Production: tạo tài khoản admin thật qua `/api/auth/register` rồi gán role, hoặc
  tự thêm user với hash bcrypt riêng. **Không** dùng mật khẩu mặc định.

Kiểm tra nhanh:

```bash
psql -d eyetracking -c '\dt'                          # danh sách bảng
psql -d eyetracking -c "SELECT code FROM roles;"      # admin | teacher | student
psql -d eyetracking -c "SELECT email FROM users;"
psql -d eyetracking -c "SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'gaze_events'::regclass;"
```

---

## Bảo trì partition gaze_events

`003_gaze_partitions.sql` tạo sẵn function `create_gaze_partitions(months_ahead)`
và 12 partition tháng đầu. Về sau chạy định kỳ để không bao giờ thiếu partition:

Trong `docker-compose.yml`, service **`db-maintenance`** tự gọi function
`create_gaze_partitions(3)` mỗi 24h (không cần cron của host). Muốn chạy thủ công:

```bash
docker compose exec postgres psql -U postgres -d eyetracking \
    -c "SELECT create_gaze_partitions(3);"
# hoặc dùng file (chạy trên host có psql):
psql -d eyetracking -f ops/maintain_partitions.sql
```

Dữ liệu rơi ngoài các tháng đã tạo sẽ vào `gaze_events_default` (không mất,
nhưng nên xử lý sớm). Nếu cần tạo partition trùng khoảng dữ liệu đang nằm
trong default:

```sql
CREATE TABLE tmp AS SELECT * FROM gaze_events_default
    WHERE event_time >= '2026-12-01' AND event_time < '2027-01-01';
DELETE FROM gaze_events_default
    WHERE event_time >= '2026-12-01' AND event_time < '2027-01-01';
SELECT create_gaze_partitions(3);   -- tạo partition tháng 12
INSERT INTO gaze_events SELECT * FROM tmp;
DROP TABLE tmp;
```

## Hệ tọa độ (quan trọng)

- `gaze_events.gaze_x/gaze_y` và `aoi_regions.x_min..y_max` đều **chuẩn hóa [0,1]** —
  khớp với output `WS /session/{sid}/stream` của `services/gaze/server.py` (đã trả về [0,1]).
- Muốn tọa độ pixel: nhân với `devices.screen_width_px / screen_height_px`.
- Không CHECK biên [0,1] trên gaze: filter OneEuro có thể overshoot nhẹ;
  clamp ở tầng application trước khi ghi DB.

## Vận hành

- **Insert gaze**: WebSocket `/session/{sid}/stream` chạy ~20 fps → chỉ ghi DB sau khi
  downsample còn ~2–4 Hz (khối lượng: 1 lớp 30 học viên × 20 buổi ≈ vài triệu dòng).
- **Aggregate** (`heatmap_aggregates`, `aoi_dwell_stats`, `engagement_scores`):
  tính bằng batch job ngoài giờ học, không tính realtime trên `gaze_events`.
- **Xóa dữ liệu cũ**: `DROP` partition tháng cũ thay vì `DELETE` — tức thì, không bloat.
- **Timezone**: partition boundary tính theo timezone của phiên chạy migration;
  nên đặt timezone server là UTC cho nhất quán (docker-compose đã set `TZ: UTC`).

## Thay đổi so với thiết kế ban đầu

| Thay đổi | Lý do |
|---|---|
| `gaze_x_px/gaze_y_px` → `gaze_x/gaze_y` chuẩn hóa [0,1] | Khớp output `WS /session/{sid}/stream`; heatmap/AOI không phụ thuộc độ phân giải màn hình |
| AOI thêm `CHECK` biên + `x_min < x_max` | Tọa độ giáo viên vẽ phải hợp lệ, cùng hệ [0,1] với gaze |
| Thêm UNIQUE: `modules(course_id, order_index)`, `lessons(module_id, order_index)`, `aoi_dwell_stats(session_id, aoi_region_id)` | Chống trùng thứ tự / trùng thống kê |
| `heatmap_aggregates`: 2 partial unique index + CHECK scope↔student_id | UNIQUE thường không hoạt động với `student_id NULL` (scope='class') |
| CHECK cho các cột VARCHAR "enum": `enrollments.status`, `calibration_sessions.status`, `course_teachers.role`, `heatmap_aggregates.scope`, `learning_sessions.status` | Nhất quán ràng buộc, không cần thêm lookup table |
| **Slide-only**: bỏ `lesson_types`, `lesson_type_id`, `duration_seconds`, `lesson_contents.content_type`, `start_time_sec`, `end_time_sec` | Nội dung khóa học chỉ gồm slide: `lessons` = bài học (deck slides), `lesson_contents` = từng slide (`image_url`) |
| `lessons.kind` (`lesson` \| `quiz`) + `quiz_assignments` 1:1 | Bài tập trắc nghiệm là một item **cùng cấp** bài học trong chương; dùng chung `order_index` nên thứ tự bài học/bài tập được trộn. Item `quiz` không có slide và không ghi dữ liệu gaze. `quiz_assignments.due_at` cho phép NULL (hạn nộp tùy chọn). |
| `quiz_assignments.allow_retry` | Giáo viên cho phép học viên làm lại: **mỗi học viên vẫn chỉ giữ 1 lượt** (`quiz_attempts` UNIQUE theo assignment+student), lượt cũ bị xoá và `quiz_attempt_sessions.started_at` đặt lại để đồng hồ chạy lại từ đầu. |
| `learning_sessions` thêm `status` | Phân biệt phiên hoàn tất / bị hủy khi tính engagement |
| Roles: 3 role `admin`, `teacher`, `student` | Theo yêu cầu dự án |