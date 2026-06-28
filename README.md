# EyeLearn — Hướng dẫn cài đặt & chạy



## Yêu cầu

- Docker Desktop đang chạy
- Python 3.x (để serve frontend)
- GPU NVIDIA + CUDA (cho AI Service) — hoặc đổi `device=cpu`
- Webcam

---

## Lần đầu cài đặt

### Bước 1 — Tạo file `.env`

Tạo file `.env` trong thư mục **gốc** (`EyeLearning/`):

```env
POSTGRES_PASSWORD=your_password_here
```

---

### Bước 2 — Khởi tạo Database

> Bỏ qua nếu đã có container `portsdb` với đầy đủ bảng.

```powershell
docker run -d `
  --name portsdb `
  -e POSTGRES_USER=admin `
  -e POSTGRES_PASSWORD=your_password_here `
  -e POSTGRES_DB=eye `
  -p 5432:5432 `
  -v pg_data:/var/lib/postgresql/data `
  postgres:18
```

Import schema:

```powershell
docker exec -i portsdb psql -U admin -d eye < data.sql
```

Kiểm tra:

```powershell
docker exec -i portsdb psql -U admin -d eye -c "\dt"
```

Kết quả đúng có đủ 6 bảng: `calibration_profiles`, `gaze_chunks`, `heatmaps`, `lectures`, `sessions`, `users`.

---

### Bước 3 — Chạy Web Service

```powershell
# Trong thư mục EyeLearning/
docker compose up -d
```

Đưa `portsdb` vào cùng network:

```powershell
docker network connect eyelearning_default portsdb
```

Kiểm tra:

```powershell
docker compose logs web --tail=20
```

Thấy dòng này là OK:

```
INFO:     Application startup complete.
```

---

### Bước 4 — Chạy AI Service

> Đảm bảo đã có file weights trong `Gaze-Estimation/weights/`.  
> Tải tại: https://drive.google.com/drive/folders/1olXtxlqBb7gW_nnB4p_dSDXV2t2IMy5B

```

Chạy AI Service:

```powershell
# Trong thư mục EyeLearning/gaze/
cd gaze
docker compose up -d
cd ..
```

Kiểm tra:

```powershell
docker logs eyetracking-container --tail=20
```

Thấy dòng này là OK:

```
INFO:     Application startup complete.
```

---

### Bước 5 — Chạy Frontend

```powershell
# Trong thư mục EyeLearning/
python -m http.server 3000
```

Mở trình duyệt:

```
http://localhost:3000
```

---

## Luồng sử dụng

```
1. Nhập tên → Bắt đầu học
      ↓
2. Calibration tự động (9 điểm, ~20 giây)
   Browser chụp frame → POST http://localhost:9000/calibrate
      ↓
3. Vào màn hình học bài
   WebSocket ws://localhost:9000/inference?session_id=xxx
   Gaze data → buffer → POST http://localhost:8000/gaze/chunks (mỗi 5 giây)
      ↓
4. Bấm Finish → lưu session → chuyển Dashboard
```

---

## Kiểm tra API

| URL | Mô tả |
|---|---|
| `http://localhost:8000/docs` | Swagger — Web Service |
| `http://localhost:9000/docs` | Swagger — AI Service |
| `http://localhost:9000/health_check` | Kiểm tra AI Service sống không |

---

## Các lệnh thường dùng

| Lệnh | Mô tả |
|---|---|
| `docker compose up -d` | Khởi động Web Service |
| `docker compose down` | Tắt Web Service |
| `docker compose logs web -f` | Log Web Service realtime |
| `docker logs eyetracking-container -f` | Log AI Service realtime |
| `docker exec -i portsdb psql -U admin -d eye -c "\dt"` | Kiểm tra bảng DB |

---

## Cổng sử dụng

| Service | Cổng |
|---|---|
| Web Service (FastAPI) | `http://localhost:8000` |
| AI Service (FastAPI) | `http://localhost:9000` |
| Frontend | `http://localhost:3000` |
| PostgreSQL | `localhost:5432` |

---

## Reset toàn bộ

```powershell
# Tắt services
docker compose down
docker -C gaze compose down

# Xóa DB
docker stop portsdb && docker rm portsdb
docker volume rm pg_data

# Chạy lại từ Bước 2
```