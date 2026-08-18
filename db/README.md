# Database — Eyetracking Learning Analytics

PostgreSQL schema cho dự án theo dõi hành vi học bằng eye-tracking.
Sơ đồ bảng và quan hệ: [`ERD.md`](ERD.md).

## Yêu cầu

- **PostgreSQL 13+** (dùng `gen_random_uuid()` và native partitioning)
- Kiểm tra: `psql --version`

## Cấu trúc

```
db/
├── README.md                     # file này
├── maintain_partitions.sql       # chạy định kỳ (cron) tạo partition tháng mới
└── migrations/
    ├── 001_init.sql              # toàn bộ schema: bảng, khóa, CHECK, index
    ├── 002_seed.sql              # seed lookup + 3 tài khoản mẫu
    └── 003_gaze_partitions.sql   # default partition + 12 tháng đầu + function bảo trì
```

## Có 2 cách cài database

1. **Docker (`docker-compose.yml`)** — nhanh, sạch, khuyến nghị cho dev.
2. **PostgreSQL native (psql)** — khi đã có Postgres cài trực tiếp trên máy.

Migrate (001, 002, 003) sẽ tự chạy đúng thứ tự trong cả 2 cách. Cả 3 file đều
**idempotent** — chạy lại an toàn.

---

## Cách 1: Docker Compose

### Tạo database (lần đầu)

```bash
docker compose up -d postgres
```

Postgres container tự mount `./db/migrations` vào `/docker-entrypoint-initdb.d`
nên **migrate chạy tự động** lần đầu tạo volume. Kiểm tra:

```bash
# shell vào container
docker compose exec postgres psql -U postgres -d eyetracking -c '\dt'
```

- Host port: **5435** (container 5432) → kết nối từ host dùng `-p 5435`.
- Dữ liệu nằm trong volume `pgdata`, **không mất khi `down`**.

### Chạy lại seed / migrate thủ công

```bash
docker compose exec -T postgres psql -U postgres -d eyetracking \
    -f docker-entrypoint-initdb.d/002_seed.sql
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

## Tài khoản mẫu (seed trong `002_seed.sql`)

`002_seed.sql` seed thêm 3 tài khoản mẫu (idempotent qua email UNIQUE):

| Vai trò | Email | Khả năng |
|---|---|---|
| Admin | `admin@school.edu.vn` | toàn quyền |
| Giáo viên | `teacher@school.edu.vn` | quản lý khóa học + analytics |
| Sinh viên | `student@school.edu.vn` | học + xem heatmap cá nhân |

- Mỗi user có `user_profiles`, và `teacher_profiles` / `student_profiles` tương ứng.
- Gán role qua bảng `user_roles`.
- ⚠️ `password_hash` trong seed là **placeholder** — cần thay bằng bcrypt hash thật
  trước khi deploy production (mục đích demo/test).

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

```bash
# crontab -e  (ngày 25 hàng tháng, tạo trước 3 tháng)
0 3 25 * * psql -d eyetracking -f /path/to/db/maintain_partitions.sql
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
  khớp với output endpoint `/infer` của `API/server.py` (đã trả về [0,1]).
- Muốn tọa độ pixel: nhân với `devices.screen_width_px / screen_height_px`.
- Không CHECK biên [0,1] trên gaze: filter OneEuro có thể overshoot nhẹ;
  clamp ở tầng application trước khi ghi DB.

## Vận hành

- **Insert gaze**: WebSocket `/infer` chạy ~20 fps → chỉ ghi DB sau khi
  downsample còn ~2–4 Hz (khối lượng: 1 lớp 30 học viên × 20 buổi ≈ vài triệu dòng).
- **Aggregate** (`heatmap_aggregates`, `aoi_dwell_stats`, `engagement_scores`):
  tính bằng batch job ngoài giờ học, không tính realtime trên `gaze_events`.
- **Xóa dữ liệu cũ**: `DROP` partition tháng cũ thay vì `DELETE` — tức thì, không bloat.
- **Timezone**: partition boundary tính theo timezone của phiên chạy migration;
  nên đặt timezone server là UTC cho nhất quán (docker-compose đã set `TZ: UTC`).

## Thay đổi so với thiết kế ban đầu

| Thay đổi | Lý do |
|---|---|
| `gaze_x_px/gaze_y_px` → `gaze_x/gaze_y` chuẩn hóa [0,1] | Khớp output `/infer`; heatmap/AOI không phụ thuộc độ phân giải màn hình |
| AOI thêm `CHECK` biên + `x_min < x_max` | Tọa độ giáo viên vẽ phải hợp lệ, cùng hệ [0,1] với gaze |
| Thêm UNIQUE: `modules(course_id, order_index)`, `lessons(module_id, order_index)`, `aoi_dwell_stats(session_id, aoi_region_id)` | Chống trùng thứ tự / trùng thống kê |
| `heatmap_aggregates`: 2 partial unique index + CHECK scope↔student_id | UNIQUE thường không hoạt động với `student_id NULL` (scope='class') |
| CHECK cho các cột VARCHAR "enum": `enrollments.status`, `lesson_progress.status`, `calibration_sessions.status`, `course_instructors.role`, `heatmap_aggregates.scope`, `learning_sessions.status` | Nhất quán ràng buộc, không cần thêm lookup table |
| **Slide-only**: bỏ `lesson_types`, `lesson_type_id`, `duration_seconds`, `lesson_contents.content_type`, `start_time_sec`, `end_time_sec` | Nội dung khóa học chỉ gồm slide: `lessons` = bài học (deck slides), `lesson_contents` = từng slide (`image_url`) |
| `lesson_progress` thêm `last_watched_at`, `updated_at` | Dashboard cần biết học viên đang học bài nào, lần cuối khi nào |
| `learning_sessions` thêm `status` | Phân biệt phiên hoàn tất / bị hủy khi tính engagement |
| Roles: 3 role `admin`, `teacher`, `student` | Theo yêu cầu dự án |