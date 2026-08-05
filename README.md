# EyeLearning MVP

EyeLearning la LMS MVP cho bai hoc PDF co eye-tracking. He thong gom:

- `web/`: FastAPI backend + PostgreSQL schema/migrations
- `frontend/`: React + Vite frontend
- `Gaze-Estimation/`: AI service cho calibration va du doan diem nhin

## Development Setup

### 1. Chay bang Docker

```bash
docker compose up -d --build
cd Gaze-Estimation
docker compose up -d --build
```

Backend `eyelearn_web` duoc bind-mount tu source local:

- `./web -> /app/web`
- `./data -> /app/data`
- `./.env -> /app/.env`

Vi vay thay doi trong `web/` se duoc container dung ngay sau khi restart process backend.

### 2. Frontend development

Neu `npm` tren may host dang loi, co the chay frontend qua Docker tai `http://localhost:9080`.

Neu chay local:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

### 3. Health checks

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:9000/health_check
```

## Migrations

Database can co day du cac migration trong `web/migrations/`.

Hai migration moi can co trong moi moi truong MVP hien tai:

- `018_calibration_profile_preferences.sql`
- `019_pdf_teacher_analytics.sql`

Neu can chay tay trong container Postgres:

```bash
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/018_calibration_profile_preferences.sql
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/019_pdf_teacher_analytics.sql
```

## PDF Lesson Workflow

1. Teacher tai PDF len trong trang khoa hoc.
2. Backend luu file va gan `storage_key` bat bien cho moi phien ban tai lieu.
3. Student mo khoa hoc, chon bai hoc, vao trang chuan bi.
4. Sau khi qua camera + nhan dien khuon mat + ho so hieu chuan + validation, student vao trang doc PDF.
5. Frontend gui du lieu gaze da duoc map theo:
   - `course_item_id`
   - `pdf_document_version`
   - `page_number`
   - `page_x_normalized`
   - `page_y_normalized`
6. Teacher xem tong hop theo khoa hoc, bai hoc, trang va heatmap.

## Calibration Profiles

Student co the quan ly ho so hieu chuan ngay trong luong chuan bi hoac tai:

- `/calibration-profiles`

Ho tro:

- tao ho so moi
- chon ho so
- doi ten
- dat mac dinh
- canh bao khong tuong thich thiet bi/camera
- luu ket qua validation gan nhat
- xoa mem ma khong xoa du lieu phien hoc lich su

## Development Analytics Data

Seed analytics chi dung cho development:

```bash
docker exec eyelearn_web sh -lc 'cd /app && python -m web.dev.seed_pdf_teacher_analytics'
```

Script nay:

- khong duoc app import luc startup
- khong co UI de goi
- bi chan khi `APP_ENV=production`
- chi duoc phep override bang `ALLOW_PRODUCTION_DEV_SEED=true`

Xoa du lieu seed:

```bash
docker exec eyelearn_web sh -lc 'cd /app && python - <<\"PY\"
import asyncio
from web.database import AsyncSessionLocal
from web.dev.seed_pdf_teacher_analytics import clear_seed

async def main():
    async with AsyncSessionLocal() as db:
        await clear_seed(db)
        await db.commit()

asyncio.run(main())
PY'
```

## Verification

### Student manual test flow

1. Dang nhap student
2. Mo `/courses`
3. Mo chi tiet khoa hoc
4. Chon bai hoc
5. Hoan thanh camera, nhan dien khuon mat, chon/tao ho so hieu chuan, validation
6. Vao lesson PDF
7. Doc it nhat 2 trang
8. Hoan thanh lesson

### Teacher analytics routes

- `/teacher`
- `/teacher/courses`
- `/teacher/courses/:courseId`
- `/teacher/courses/:courseId?tab=analytics`
- `/teacher/courses/:courseId/lessons/:lessonId/analytics`

### SQL queries huu ich

```sql
select session_id, user_id, course_item_id, pdf_document_version, status, started_at, ended_at
from sessions
where session_type = 'student_learning'
order by started_at desc
limit 10;

select session_id, course_item_id, pdf_document_version, page_number,
       page_x_normalized, page_y_normalized, confidence, timestamp_ms
from tracking_points
where session_id = 'YOUR_SESSION_ID'
order by timestamp_ms
limit 30;
```

### Backend test command trong Docker

```bash
docker exec eyelearn_web sh -lc 'python -m unittest web.tests.test_calibration_profile_logic web.tests.test_learning_analytics_service web.tests.test_pdf_teacher_analytics_service web.tests.test_seed_pdf_teacher_analytics'
```

## Production Build

```bash
cd frontend
npm run build
```

## Known Limitations

- Khong co browser automation co webcam trong workspace CLI nay, nen phien capture webcam that phai duoc verify thu cong trong trinh duyet.
- Heatmap hien duoc render density tren frontend, chua dung kernel density nang cao.
- Bo loc session/analytics hien tai van con gon, chu yeu theo khoa hoc, bai hoc, hoc vien, ngay va confidence.
- Class analytics chua nam trong MVP hien tai.
- Chua co full frontend integration test framework cho luong webcam/browser.
