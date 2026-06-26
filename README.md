# EyeLearn — Hướng dẫn cài đặt & chạy

## Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đã cài và đang chạy
- Python 3.x (để chạy frontend local)

---

## Cấu trúc thư mục

```
EyeLearning/
├── web/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── routers/
│       ├── sessions.py
│       └── calibration.py
├── index.html
├── init.sql
├── docker-compose.yml
└── .env
```

---

## Lần đầu cài đặt

### Bước 1 — Tạo file `.env`

Tạo file `.env` trong thư mục gốc với nội dung:

```env
POSTGRES_PASSWORD=your_password_here
```

> Thay `your_password_here` bằng password thực của container `portsdb`.

---

### Bước 2 — Khởi tạo database

Nếu chưa có container `portsdb`, chạy lệnh sau để tạo DB và các bảng:

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

Sau đó import schema:

```powershell
docker exec -i portsdb psql -U admin -d eye < init.sql
```

Kiểm tra bảng đã tạo chưa:

```powershell
docker exec -i portsdb psql -U admin -d eye -c "\dt"
```

Kết quả đúng:

```
 Schema |         Name         | Type  | Owner
--------+----------------------+-------+-------
 public | calibration_profiles | table | admin
 public | gaze_chunks          | table | admin
 public | heatmaps             | table | admin
 public | lectures             | table | admin
 public | sessions             | table | admin
 public | users                | table | admin
```

---

### Bước 3 — Đưa `portsdb` vào network của project

```powershell
docker network connect eyelearning_default portsdb
```

> Nếu báo network chưa tồn tại thì bỏ qua, chạy Bước 4 trước rồi quay lại chạy lệnh này.

---

### Bước 4 — Chạy Web Service

```powershell
docker compose up -d
```

Kiểm tra đang chạy:

```powershell
docker compose logs web --tail=20
```

Kết quả đúng có dòng:

```
INFO:     Application startup complete.
```

---

### Bước 5 — Chạy Frontend

```powershell
python -m http.server 3000
```

Mở trình duyệt tại:

```
http://localhost:3000
```

---

## Kiểm tra API

Swagger UI (test API trực tiếp):

```
http://localhost:8000/docs
```

Test tạo session bằng PowerShell:

```powershell
Invoke-WebRequest -Uri http://localhost:8000/sessions `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"student_code":"test123"}'
```

---

## Các lệnh thường dùng

| Lệnh | Mô tả |
|---|---|
| `docker compose up -d` | Khởi động web service |
| `docker compose down` | Tắt web service |
| `docker compose logs web -f` | Xem log realtime |
| `docker compose down && docker compose up -d` | Restart |
| `docker exec -i portsdb psql -U admin -d eye -c "\dt"` | Kiểm tra bảng DB |

---

## Reset database (xóa toàn bộ data)

```powershell
docker stop portsdb
docker rm portsdb
docker volume rm pg_data
```

Sau đó chạy lại từ **Bước 2**.

---

## Cổng sử dụng

| Service | Cổng |
|---|---|
| Web Service (FastAPI) | `http://localhost:8000` |
| API Docs (Swagger) | `http://localhost:8000/docs` |
| Frontend | `http://localhost:3000` |
| PostgreSQL | `localhost:5432` |