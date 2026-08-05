# EyeLearn Frontend (React)

App React (Vite) tách hoàn toàn khỏi backend FastAPI. Port lại 1:1 logic từ
`web/static/*.html` + `web/static/js/*.js` cũ (đã xoá khỏi backend).

## Cấu trúc

```
src/
  pages/         # StartPage, LessonPage, CalibrationPage, AnalyticsPage, TeacherPage, AdminPage
  lib/
    api.js         # API_BASE + helper fetch JSON + /client-config cache
    session.js      # đọc/ghi session context trong localStorage
    liveHeatmap.js  # canvas overlay realtime (port live_heatmap.js)
    gazeClient.js    # WebSocket streaming webcam -> AI service (port gaze_client.js)
    pageSnapshot.js  # chụp html2canvas + upload snapshot (port page_snapshot.js)
  styles.css      # port nguyên vẹn từ static/css/styles.css
```

Logic quan trọng cần biết khi maintain:
- `gazeClient` và `liveHeatmap` giao tiếp qua `window` CustomEvent
  (`eyelearn:tracking-point`, `eyelearn:gaze-chunk-saved`, ...) và một mảng
  global `window.tracking_events` — giữ nguyên pattern của bản JS cũ để hạn
  chế rủi ro regression. Nếu refactor sau này, nên chuyển sang context/store
  React thực sự thay vì window globals.
- `html2canvas` được load qua `<script>` tag trong `index.html` (CDN), không
  import qua npm, vì file gốc cũng dùng CDN.

## Chạy dev

```bash
cd frontend
npm install
npm run dev
```

Vite dev server chạy ở `http://localhost:5173` và tự proxy các path API
(`/sessions`, `/tracking`, `/gaze`, `/metrics`, `/heatmaps`, `/calibration`,
`/lessons`, `/lectures`, `/debug`, `/admin`, `/page-snapshot`, `/client-config`,
`/health`) sang backend tại `http://127.0.0.1:8000` (đổi bằng biến môi trường
`VITE_DEV_API_PROXY_TARGET` nếu backend chạy port khác).

Backend cần cho phép origin `http://localhost:5173` trong CORS — đã thêm sẵn
vào `web/main.py` (`CORS_ORIGINS` env var có thể thêm origin khác nếu cần).

## Build & host trong container

```bash
docker build -t eyelearn-frontend ./frontend
docker run -p 8080:80 \
  -e API_UPSTREAM=web:8000 \
  eyelearn-frontend
```

Cơ chế:
1. Stage 1 (`node:20-alpine`): `npm install && npm run build` ra `dist/`.
2. Stage 2 (`nginx:1.27-alpine`): serve `dist/` tĩnh, SPA fallback về
   `index.html` cho react-router, và **reverse-proxy** các path API sang
   backend (`API_UPSTREAM`, mặc định `web:8000` — tên service trong
   `docker-compose.yml` gốc). Với các path bị trùng giữa SPA và API như
   `/courses/...`, nginx chỉ proxy khi request là fetch/API; điều hướng
   browser kiểu HTML sẽ quay về `index.html` để nested-route refresh không vỡ.
   Nhờ vậy browser gọi API cùng-origin với frontend, không cần CORS.
3. `docker-entrypoint.d/20-write-runtime-config.sh` sinh `/config.js` **lúc
   container start** (không phải lúc build) chứa `window.__ENV__.API_BASE`.
   Mặc định để trống (dùng proxy ở bước 2). Chỉ set `RUNTIME_API_BASE` nếu
   frontend và backend deploy ở domain khác nhau hẳn (vd CDN riêng).

Xem `docker-compose.yml` ở thư mục gốc dự án để chạy full stack
(postgres + web + frontend) bằng một lệnh.
