# Chạy EyeLearning bằng Docker Compose

## 3 container

`docker-compose.yml` ở gốc project build đúng 3 service:

| Service | Container | Port host | Vai trò |
|---|---|---|---|
| `eyelearn_postgres` | `eyelearn_postgres` | `5433 → 5432` | Database — chạy migrations tự động lần đầu |
| `web` | `eyelearn_web` | `8000 → 8000` | Backend FastAPI — business logic, DB |
| `frontend` | `eyelearn_frontend` | `8080 → 80` | React build tĩnh, nginx reverse-proxy API sang `web` |

```bash
docker compose up -d --build
```

Mở `http://localhost:8080`.

> **AI Service (Gaze-Estimation) không nằm trong 3 container này.** Đây là service thứ 4, có `docker-compose.yml` riêng trong `Gaze-Estimation/`, chạy port `9000`. Nếu chỉ chạy 3 container ở trên, app vẫn mở được nhưng **calibration và gaze tracking sẽ không hoạt động** (frontend gọi thẳng tới `AI_HTTP_URL`/`AI_WS_URL`, mặc định trỏ `127.0.0.1:9000`). Chạy thêm:
> ```bash
> cd Gaze-Estimation && docker compose up -d --build
> ```

## Dữ liệu bắt buộc phải có để chạy được (seed data)

Đây là phần **quan trọng nhất** — thiếu sẽ không chạy được, không phải optional:

### 1. Lesson `L001` + 9 AOI demo

Frontend hard-code `LESSON_ID = "L001"` ở nhiều nơi, nhưng **không có API nào tạo lesson**. Migration `005_seed_demo_lesson.sql` (đã thêm) insert sẵn:
- 1 row `lessons` (`lesson_id='L001'`, `teacher_id=NULL` — cột này nullable nên không bắt buộc phải có user giáo viên)
- 9 row `aoi_definitions` khớp đúng `DEMO_AOIS` trong `web/routers/lessons.py`

**Không có migration này → tạo session đầu tiên sẽ lỗi FK violation ngay lập tức.**

### 2. Users, sessions, calibration — KHÔNG cần seed

Được tạo tự động ngay trong luồng dùng app:
- `users`: tạo mới theo `student_code` ngay lúc `POST /sessions` (get-or-create), không cần insert tay
- `sessions`, `calibration_profiles`, `gaze_chunks`, `tracking_points`, `page_snapshots`, `heatmaps`: đều sinh ra trong lúc chạy, không cần seed

### 3. AI Service — model weights (bắt buộc nếu muốn calibration/gaze chạy thật)

`Gaze-Estimation/weights/` cần có file model đã train (không nằm trong git, phải tự tải/copy vào trước khi build container AI Service). Không có file này, `docker compose up` ở `Gaze-Estimation/` vẫn lên container nhưng `/calibrate` và `/inference` sẽ lỗi khi gọi thật.

## Migrations — chạy theo thứ tự tên file

Volume `eyelearn_pgdata` mount `./web/migrations` vào `/docker-entrypoint-initdb.d` — Postgres image chính thức tự chạy **mọi file `.sql` trong đó theo thứ tự alphabet**, nhưng **chỉ khi volume data đang rỗng** (lần đầu tiên tạo container).

Danh sách hiện tại (phải giữ đúng thứ tự số):
```
001_analytics_tables.sql
002_heatmaps.sql
003_session_status.sql        ← thêm: cột sessions.status
004_page_snapshots.sql        ← thêm: bảng page_snapshots
005_seed_demo_lesson.sql      ← thêm: seed lesson L001 + 9 AOI
```

⚠️ Nếu bạn đã từng chạy `docker compose up` trước đây (volume `eyelearn_pgdata` đã tồn tại và có data), các migration mới **sẽ KHÔNG tự chạy** — vì `docker-entrypoint-initdb.d` chỉ chạy lúc data dir rỗng. Phải chạy tay:
```bash
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/003_session_status.sql
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/004_page_snapshots.sql
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/005_seed_demo_lesson.sql
```
Hoặc xoá sạch volume để chạy lại từ đầu (**mất hết data cũ**):
```bash
docker compose down -v
docker compose up -d --build
```

## Biến môi trường (`web` service)

Đã có default hợp lý trong `docker-compose.yml`, chỉ cần override khi cần:

| Biến | Default trong compose | Ghi chú |
|---|---|---|
| `DATABASE_URL` | trỏ tới `eyelearn_postgres:5432` (network nội bộ) | không cần đổi khi dùng compose |
| `AI_HTTP_URL` | `http://127.0.0.1:9000` | địa chỉ **browser** gọi, không phải container — nếu deploy thật (không phải localhost), đổi thành domain/IP public của AI Service |
| `AI_WS_URL` | `ws://127.0.0.1:9000/inference` | tương tự, browser-facing |
| `CORS_ORIGINS` | `http://localhost:8080` | origin của frontend container |
| `ENABLE_DEV_TOOLS` | `false` | bật debug panel cho admin |
| `ENABLE_MOUSE_SIMULATION` | `false` | dev-only, giả lập gaze bằng chuột |
| `CLOUDINARY_*` | trống | optional — không set thì heatmap/page_snapshot lưu local, serve qua `/heatmaps/file/...` và `/page-snapshots/file/...` |

## Kiểm tra sau khi lên

```bash
curl http://localhost:8000/health                    # web service sống
curl http://localhost:8000/debug/schema-status        # đủ bảng, đúng migration
curl http://localhost:8000/lessons/L001/aois          # seed data #1 đã vào — phải trả về 9 AOI
curl http://localhost:8080/                           # frontend qua nginx
curl http://127.0.0.1:9000/health_check               # AI Service (nếu đã chạy riêng)
```

Nếu `curl .../lessons/L001/aois` trả rỗng `[]` — nghĩa là migration `005` chưa chạy (xem mục "chạy tay" ở trên).

## Thứ tự chạy thực tế 1 lần từ đầu

```bash
docker network create eyelearning_default   # nếu chưa có
docker compose up -d --build                # 3 container: postgres + web + frontend
cd Gaze-Estimation && docker compose up -d --build   # AI Service, port 9000

# xác nhận
curl http://localhost:8000/health
curl http://localhost:8000/lessons/L001/aois
curl http://127.0.0.1:9000/health_check
```

Mở `http://localhost:8080`, chọn role `Student`, nhập tên + student code, Start session.
