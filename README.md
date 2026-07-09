# EyeLearning

Demo phân tích hành vi học tập sử dụng FastAPI, PostgreSQL, dữ liệu gaze/tracking points chuẩn hóa, AOI metrics, page snapshots và heatmaps.

## Cấu trúc dự án

- `web/main.py`: entrypoint của FastAPI web service.
- `web/routers/`: các API cho session, tracking, gaze chunks, metrics, heatmaps, snapshots, debug, teacher/admin.
- `web/services/`: logic tạo heatmap và lưu page snapshot.
- `web/static/`: các trang HTML, JavaScript và CSS được phục vụ trực tiếp.
- `web/migrations/`: SQL migration cho bảng analytics và heatmaps.
- `Gaze-Estimation/`: AI service riêng cho calibration và gaze inference.
- `data/outputs/`: ảnh snapshot/heatmap sinh ra ở local, được ignore khỏi git.

## Cài đặt

```bash
cd EyeLearning
uv venv .venv
source .venv/bin/activate
uv pip install -r web/requirements.txt
cp .env.example .env
```

Cấu hình `.env`, ví dụ:

```env
DATABASE_URL=postgresql+asyncpg://eyelearn_user:eyelearn_password@localhost:5433/eyelearn
AI_HTTP_URL=http://127.0.0.1:9000
AI_WS_URL=ws://127.0.0.1:9000/inference
ENABLE_DEV_TOOLS=false
ENABLE_MOUSE_SIMULATION=false
```

Cloudinary là tùy chọn. Nếu không cấu hình Cloudinary, heatmap sẽ được lưu local trong `data/outputs/`.

## Chạy web backend

```bash
source .venv/bin/activate
python -m uvicorn web.main:app --host 127.0.0.1 --port 8000 --reload
```

Kiểm tra backend:

```bash
curl http://127.0.0.1:8000/health
```

## Chạy AI service

CPU mode, dùng được trên Mac, Windows và Linux:

```bash
cd Gaze-Estimation
docker compose up -d --build
curl http://127.0.0.1:9000/health_check
```

GPU mode cho Windows/Linux có NVIDIA Container Toolkit:

```bash
cd Gaze-Estimation
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
curl http://127.0.0.1:9000/health_check
```

AI service cần model weights trong thư mục `Gaze-Estimation/weights/`.

## Chạy migrations

Điều chỉnh tên container, user và database theo môi trường local của bạn:

```bash
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/001_analytics_tables.sql
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < web/migrations/002_heatmaps.sql
```

Kiểm tra schema:

```bash
curl http://127.0.0.1:8000/debug/schema-status
```

## Mở ứng dụng

```text
http://127.0.0.1:8000/
```

Các trang chính:

- `/`: chọn vai trò và bắt đầu phiên demo.
- `/lesson`: giao diện học của student, calibration/gaze controls và hoàn thành session.
- `/calibration`: calibration bằng webcam cho AI gaze.
- `/teacher`: dashboard cho teacher, xem session theo lesson và mở analytics.
- `/admin`: dashboard cho admin, xem health, counts, session inspector và debug tools.
- `/analytics?session_id=YOUR_SESSION_ID`: metrics và heatmaps của một session.

## Vai trò người dùng

Ứng dụng hiện có 3 vai trò demo:

- `student`: học bài, calibration, start/stop gaze, finish session, xem analytics của mình.
- `teacher`: xem danh sách session theo lesson và mở analytics của từng session.
- `admin`: xem system health, data overview, session inspector, debug panels và raw response.

Ghi chú bảo mật: role selector hiện tại chỉ là MVP/demo role switching, lưu bằng `localStorage`. Production cần thay bằng authentication thật và backend permission checks.

## Luồng demo nhanh

Student:

1. Mở `/`.
2. Chọn `Student`.
3. Nhập full name và student code.
4. Start session để vào `/lesson`.
5. Mở `/calibration`, hoàn thành calibration rồi quay lại lesson.
6. Bấm `Start gaze`, học bài, sau đó `Stop gaze`.
7. Bấm `Finish session`.
8. Mở analytics để xem kết quả nếu được phép.

Teacher:

1. Mở `/`.
2. Chọn `Teacher`.
3. Vào `/teacher`.
4. Chọn lesson, mặc định `L001`.
5. Xem danh sách session và bấm `View analytics`.

Admin:

1. Mở `/`.
2. Chọn `Admin`.
3. Vào `/admin`.
4. Kiểm tra API health, DB schema, AI service, Cloudinary và data counts.
5. Search session, xem session health, mở analytics hoặc recalculate metrics.

## Dev tools và mouse simulation

- Student không thấy dev tools, raw API response, schema status, session health internals hoặc mouse simulation.
- Teacher chỉ thấy analytics/session tools cần cho giảng dạy.
- Admin thấy debug panels và raw JSON, nhưng raw JSON được collapse mặc định.
- `ENABLE_DEV_TOOLS=true` chỉ mở thêm debug panels cho admin hoặc khi dùng `?debug=1`.
- Mouse simulation chỉ hiển thị khi `ENABLE_MOUSE_SIMULATION=true` và đang ở admin/dev mode. Đây là công cụ developer-only, không được gọi là gaze.

## Lệnh QA hữu ích

```bash
curl http://127.0.0.1:8000/debug/session-health/YOUR_SESSION_ID
curl http://127.0.0.1:8000/sessions/YOUR_SESSION_ID/tracking-summary
curl -X POST http://127.0.0.1:8000/metrics/recalculate/YOUR_SESSION_ID
curl http://127.0.0.1:8000/metrics/YOUR_SESSION_ID
curl -X POST http://127.0.0.1:8000/heatmaps/generate/YOUR_SESSION_ID
curl http://127.0.0.1:8000/heatmaps/YOUR_SESSION_ID
curl http://127.0.0.1:8000/lessons/L001/sessions
curl http://127.0.0.1:8000/admin/overview
```

## Lỗi thường gặp

- `ModuleNotFoundError: asyncpg`: chạy uvicorn bằng Python trong `.venv`.
- `Address already in use`: port `8000` đang được process khác dùng.
- API connection refused: backend chưa chạy hoặc sai port.
- DB connection failed: kiểm tra `DATABASE_URL` và port PostgreSQL.
- AI service not connected: kiểm tra `AI_HTTP_URL`, `AI_WS_URL` và service port `9000`.
- Webcam permission denied: cấp quyền camera cho browser.
- Chunks đã lưu nhưng không có tracking points: kiểm tra `/debug/session-health/{session_id}`.
- Không có AOI metrics: chạy `POST /metrics/recalculate/{session_id}`.
- Không có heatmap image: kiểm tra session đã có tracking points rồi generate lại heatmap.
- Không có page snapshot: overlay heatmap sẽ fallback sang grid; hãy capture snapshot trên lesson page.
- Cloudinary chưa cấu hình: local fallback dưới `/heatmaps/file/...` là trạng thái bình thường.
