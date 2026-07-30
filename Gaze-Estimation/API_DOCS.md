# API Documentation

EyeLearn AI Service — FastAPI server cho eye-tracking gaze estimation.

## Chạy server

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

## Cấu hình môi trường (.env)

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `DEVICE` | `cuda` | Thiết bị inference (`cuda` hoặc `cpu`) |

---

## Endpoints

### 1. Health Check

Kiểm tra server và pipeline status.

```
GET /health_check
```

**Response:**

```json
{
  "status": "ok",
  "pipeline_loaded": true,
  "pipeline_error": null
}
```

---

### 2. Calibration

Thu thập dữ liệu gaze từ ảnh webcam + tọa độ điểm chuẩn, train model calibration và lưu theo session.

```
POST /calibrate
Content-Type: multipart/form-data
```

**Form fields:**

| Field | Type | Bắt buộc | Mặc định | Mô tả |
|-------|------|----------|----------|-------|
| `session_id` | string | ✅ | — | ID phiên calibration |
| `points` | string (JSON) | ✅ | — | Mảng điểm chuẩn, mỗi điểm có `x`, `y` (normalized 0–1), `name` |
| `frames` | List[File] | ✅ | — | Ảnh JPEG tương ứng từng điểm (cùng thứ tự với `points`) |
| `viewport_w` | int | ❌ | 1920 | Chiều rộng viewport (pixel) |
| `viewport_h` | int | ❌ | 1080 | Chiều cao viewport (pixel) |

**Ví dụ `points`:**

```json
[
  {"x": 0.0,  "y": 0.0,  "name": "top-left"},
  {"x": 0.5,  "y": 0.0,  "name": "top-center"},
  {"x": 1.0,  "y": 0.0,  "name": "top-right"},
  {"x": 0.5,  "y": 0.5,  "name": "center"},
  {"x": 1.0,  "y": 1.0,  "name": "bottom-right"}
]
```

**Response (thành công):**

```json
{
  "message": "Calibration successful",
  "session_id": "user_123",
  "n_points": 5,
  "per_point": [
    {
      "name": "top-left",
      "x": 0.0,
      "y": 0.0,
      "pitch": -0.32,
      "yaw": -0.45
    }
  ]
}
```

**Response (lỗi):**

```json
{
  "error": "No face detected in frame 'top-left'"
}
```

**Các trường hợp lỗi:**
- Pipeline chưa sẵn sàng
- JSON `points` không hợp lệ
- Số lượng `frames` không khớp `points`
- Không decode được ảnh
- Không phát hiện khuôn mặt trong frame

---

### 3. Inference (WebSocket)

Kết nối realtime để nhận tọa độ gaze từ frame webcam.

```
WS ws://host:port/inference?session_id=xxx
```

**Query params:**

| Param | Type | Mô tả |
|-------|------|-------|
| `session_id` | string | ID session đã calibration |

**Gửi (client → server):**

- `bytes` — Ảnh JPEG của frame webcam (raw bytes)

**Nhận (server → client):**

Thành công:
```json
{
  "x": 960.5,
  "y": 540.2
}
```

Lỗi:
```json
{
  "error": "No face detected"
}
```

**Ví dụ client (JavaScript):**

```javascript
const ws = new WebSocket("ws://localhost:8000/inference?session_id=user_123");

ws.onmessage = (event) => {
  const { x, y } = JSON.parse(event.data);
  console.log(`Gaze: (${x}, ${y})`);
};

// Gửi frame JPEG
function sendFrame(blob) {
  blob.arrayBuffer().then(buffer => ws.send(buffer));
}
```

**WebSocket close codes:**

| Code | Mô tả |
|------|-------|
| 4000 | Session chưa được calibrate |
| 4001 | Pipeline không khả dụng |

---

### 4. Calibration Status

Kiểm tra trạng thái calibration của session.

```
GET /calibration_status?session_id=xxx
```

**Response (đã calibrate):**

```json
{
  "status": "calibrated",
  "session_id": "user_123"
}
```

**Response (chưa có):**

```json
{
  "status": "not_found",
  "session_id": "user_123"
}
```

---

### 5. Delete Calibration

Xóa calibration khỏi RAM và file lưu trữ.

```
DELETE /calibration?session_id=xxx
```

**Response (thành công):**

```json
{
  "message": "Session 'user_123' deleted"
}
```

**Response (lỗi):**

```json
{
  "error": "Session 'user_123' not found"
}
```

---

## Quy trình sử dụng

```
1. Health check          → GET  /health_check
2. Calibration           → POST /calibrate  (gửi N ảnh + N điểm)
3. Kiểm tra status       → GET  /calibration_status?session_id=xxx
4. Inference realtime    → WS   /inference?session_id=xxx
5. Cleanup (optional)    → DELETE /calibration?session_id=xxx
```

---

## Lưu trữ model

- Model calibration được lưu tại: `weights/calibration_{session_id}.ubj`
- Khi server restart, cần calibration lại (model chỉ tồn tại trong RAM)
- File `.ubj` vẫn được giữ lại trên disk sau khi delete
