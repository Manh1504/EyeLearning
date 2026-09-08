# PLAN — Gaze_API: Calibration + Streaming theo session

## 1. Tổng quan

- Pipeline cố định: `frame → mediapipe (face detect) → chuẩn hóa → UniGaze (pitch, yaw) → LinearRegression calibration → (x, y) pixel`
- Multi-user: mỗi backend tạo 1 session; mỗi session có mô hình calibration + bộ lọc OneEuro riêng.
- **Không dùng base64**: HTTP dùng `multipart/form-data` (raw JPEG), WebSocket dùng binary message (raw JPEG).
- Backend tự đếm số mẫu hợp lệ và tự gọi train; sau train có thể **tải mô hình về lưu trữ và tái sử dụng** cho lần sau.

## 2. Luồng hoạt động chi tiết

### Bước 0 — Tạo session
```
POST /session
body: {"screen_width": 1920, "screen_height": 1080,
       "points": [{"id": "p0", "x": 100, "y": 100}, ...]}   # N điểm, tọa độ pixel
resp: {"session_id": "<uuid>"}
```
Server lưu: kích thước màn hình, danh sách điểm, `samples = {}`, smoother mới, `state = "collecting"`.

### Bước 1 — Thu thập mẫu calibration (backend lặp từng điểm)
Với mỗi điểm `point_id`:
1. Backend hiển thị dot tại (x, y), người dùng nhìn vào đó.
2. Backend chụp 1 frame từ webcam → gửi:
   ```
   POST /session/{sid}/calibrate        (multipart/form-data)
     image    : raw JPEG bytes (không base64)
     point_id : "p0"
   ```
3. Server xử lý **đúng 1 frame này**:
   - Ảnh hỏng → `{"status": "invalid_image"}`
   - **Không có khuôn mặt** → `{"status": "no_face"}` → backend hiện thông báo "hãy nhìn vào điểm" và chụp lại
   - Có khuôn mặt → **nối thêm** mẫu `(pitch, yaw, x, y)` vào `samples[point_id]` → `{"status": "accepted", "count": k}`
4. Backend lặp bước 2–3 tới khi `count` đủ (vd 10) → chuyển điểm kế tiếp.

### Vì sao "gửi từng điểm một" vẫn train được với N mẫu?

- Mỗi request `/calibrate` chỉ mang 1 frame + `point_id`, nhưng **server là stateful theo session**:
  mỗi frame hợp lệ được **nối tiếp vào danh sách mẫu của đúng điểm đó** trong RAM
  (`session.samples[point_id] += [(pitch, yaw, x, y)]`), không bao giờ bị ghi đè hay mất.
- Backend gửi K frame/điểm → sau khi đi hết N điểm, server đã tích lũy đủ **N × K mẫu**
  (mỗi mẫu gắn sẵn tọa độ đích (x, y) của chính điểm nó thuộc về).
- Khi backend gọi `/train`, server gom **toàn bộ** mẫu đã tích lũy thành
  `X = (pitch, yaw)` kích thước `(N×K, 2)` và `y = (x, y)` kích thước `(N×K, 2)` rồi fit 1 lần.
  Thứ tự gửi/order không quan trọng vì mỗi mẫu đã tự mang nhãn (x, y) của nó.
- **Đảm bảo an toàn**: `/train` sẽ kiểm tra và **từ chối** nếu:
  - điểm nào đó trong N điểm đã khai báo **chưa có mẫu nào**, hoặc
  - số mẫu của bất kỳ điểm nào < `min_samples` (vd 5)
  → trả `422 {"status": "insufficient_samples", "detail": {point_id: số_mẫu}}` để backend biết chính xác điểm nào còn thiếu.

### Bước 2 — Train calibration
```
POST /session/{sid}/train
```
- Server kiểm tra đủ mẫu (như trên) → fit LinearRegression trên mọi mẫu tích lũy.
- Đánh giá MAE (pixel) bằng 5-fold CV → trả:
  ```
  {"status": "ok", "n_samples": 90, "mae_px": 45.2}
  ```
- Backend quyết định: `mae_px` > ngưỡng → xóa mẫu làm lại; ngược lại → `state = "ready"`.

### Bước 2b — Lưu / tái sử dụng mô hình calibration (tùy chọn)
- **Tải về** (sau khi train xong):
  ```
  GET /session/{sid}/model  →  file nhị phân calibration_{sid}.ubj
  ```
  Backend lưu file này kèm thông tin người dùng (DB, file...) để dùng lần sau.
- **Tái sử dụng** (lần đăng nhập sau của cùng người dùng):
  ```
  POST /session/{sid}/import     (multipart: model = file .ubj đã lưu)
  → {"status": "ready"}          # session bỏ qua calibration, vào thẳng streaming
  ```
- Mô hình chỉ vài KB (LinearRegression), chi phí lưu trữ không đáng kể.

### Bước 3 — Streaming qua WebSocket
```
WS /session/{sid}/stream
```
- Server từ chối nếu session chưa `"ready"` (close code 1008, reason `not_calibrated`).
- Client gửi **binary message = raw JPEG bytes** mỗi frame.
- Server: decode → pipeline → `(pitch, yaw)` → `calib.predict` → `(x, y)` pixel (clip trong màn hình) → OneEuro smoothing → trả:
  ```
  {"ok": true, "x": 1234.5, "y": 678.9}
  ```
  Không có khuôn mặt → `{"ok": false, "error": "no_face"}`.
- **Drop-frame**: nếu frame trước đang xử lý mà frame mới tới → bỏ frame mới đó luôn (không xếp hàng chờ), giữ latency thấp.

### Bước 4 — Kết thúc
- `DELETE /session/{sid}` hoặc background task xóa session idle > 30 phút (TTL), giới hạn số session tối đa (vd 100).

## 3. Bảng API

| Method | Path | Input | Output |
|---|---|---|---|
| POST | `/session` | JSON `SessionRequest` | `{session_id}` |
| POST | `/session/{sid}/calibrate` | multipart `image` + `point_id` | `{status: "accepted"\|"no_face"\|"invalid_image"\|"unknown_point", count}` |
| POST | `/session/{sid}/train` | – | `{status, n_samples, mae_px}` hoặc 422 `insufficient_samples` |
| GET | `/session/{sid}/model` | – | file nhị phân `.ubj` (mô hình calibration) |
| POST | `/session/{sid}/import` | multipart `model` (file .ubj) | `{status: "ready"}` |
| WS | `/session/{sid}/stream` | binary JPEG bytes | `{"ok": true, "x", "y"}` \| `{"ok": false, "error": "no_face"}` |
| GET | `/session/{sid}` | – | state, số mẫu mỗi điểm, calibrated? |
| DELETE | `/session/{sid}` | – | `{status: "deleted"}` |
| GET | `/health` | – | `{status, gpu_available, pipeline_ready}` |

Quy tắc: HTTP luôn trả 200 + field `status` (backend xử lý nhánh đơn giản); 404/422/503 chỉ cho lỗi session không tồn tại / thiếu mẫu / model chưa load.

## 4. Thiết kế performance

1. **Load model đúng 1 lần** lúc startup (lifespan), mọi session dùng chung pipeline → tiết kiệm VRAM tối đa.
2. **Chạy 1 worker uvicorn duy nhất** (mặc định) — không nhân bản model, không tranh chấp GPU.
3. **Inference tuần tự qua 1 lock toàn cục** (torch/mediapipe không thread-safe); phần xử lý nặng chạy trong `asyncio.to_thread` → event loop không bao giờ bị chặn, nhiều session vẫn phục vụ song song phần I/O.
4. **WS drop-frame**: chỉ xử lý frame mới nhất, bỏ frame đến trong lúc bận → không backlog, latency ổn định.
5. **Raw JPEG, không base64** → giảm 33% băng thông và CPU encode/decode.
6. **TTL + giới hạn session** → RAM không phình theo thời gian.
7. Mỗi session chỉ thêm 1 LinearRegression (vài KB) + 1 OneEuroFilter → chi phí/session không đáng kể.

## 5. File tạo mới / sửa

### 5.1. `session_manager.py` — TẠO MỚI
```python
import time, uuid
from calibration import Calibration
from preprocessing import OneEuroFilter2D

class Session:
    def __init__(self, screen_w, screen_h, points):   # points: dict id -> (x, y)
        self.screen = (screen_w, screen_h)
        self.points = points
        self.samples = {}          # point_id -> list [(pitch, yaw, x, y)]
        self.calib = Calibration()
        self.smoother = OneEuroFilter2D()
        self.state = "collecting"  # "collecting" -> "ready"
        self.last_active = time.time()
        self.processing = False    # drop-frame flag

class SessionManager:
    def __init__(self, ttl=1800, max_sessions=100):
        self.sessions = {}         # sid -> Session
        self.ttl, self.max = ttl, max_sessions

    def create(self, screen_w, screen_h, points):
        sid = str(uuid.uuid4())
        self.sessions[sid] = Session(screen_w, screen_h, points)
        return sid

    def get(self, sid):            # trả None nếu không có, cập nhật last_active
        s = self.sessions.get(sid)
        if s: s.last_active = time.time()
        return s

    def delete(self, sid):         return self.sessions.pop(sid, None)

    def cleanup_expired(self):     # xóa session idle quá ttl
        now = time.time()
        for sid in [k for k, v in self.sessions.items() if now - v.last_active > self.ttl]:
            self.sessions.pop(sid, None)
```

### 5.2. `schemas.py` — TẠO MỚI
```python
from pydantic import BaseModel

class CalibPoint(BaseModel):
    id: str
    x: float
    y: float

class SessionRequest(BaseModel):
    screen_width: int
    screen_height: int
    points: list[CalibPoint]
```

### 5.3. `server.py` — VIẾT MỚI (hiện rỗng)
```python
import asyncio, threading
import numpy as np, cv2
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.responses import Response, JSONResponse

from models import Pipline
from session_manager import SessionManager
from schemas import SessionRequest

MIN_SAMPLES = 5   # số mẫu tối thiểu cho mỗi điểm trước khi train

pipeline = None
sessions = SessionManager()
inference_lock = threading.Lock()   # torch/mediapipe không thread-safe

@asynccontextmanager
async def lifespan(app):
    global pipeline
    pipeline = Pipline(None)        # cố định mediapipe + unigaze, load 1 lần
    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()

app = FastAPI(title="Gaze API", lifespan=lifespan)

async def cleanup_loop():
    while True:
        await asyncio.sleep(60)
        sessions.cleanup_expired()

def decode_jpeg(data):              # bytes -> ảnh BGR, None nếu hỏng
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)

def run_pipeline(frame):            # (pitch, yaw) hoặc None nếu không có mặt
    with inference_lock:
        return pipeline.process(frame)

# ---------- CALIBRATION ----------
@app.post("/session")
def create_session(req: SessionRequest):
    points = {p.id: (p.x, p.y) for p in req.points}
    return {"session_id": sessions.create(req.screen_width, req.screen_height, points)}

@app.post("/session/{sid}/calibrate")
async def calibrate(sid: str, image: UploadFile = File(...), point_id: str = Form(...)):
    s = sessions.get(sid)
    if s is None: raise HTTPException(404, "session not found")
    if point_id not in s.points: return {"status": "unknown_point"}

    frame = decode_jpeg(await image.read())
    if frame is None: return {"status": "invalid_image"}

    result = await asyncio.to_thread(run_pipeline, frame)
    if result is None: return {"status": "no_face"}        # backend bắt người dùng làm lại

    pitch, yaw = result
    s.samples.setdefault(point_id, []).append([pitch, yaw, *s.points[point_id]])
    return {"status": "accepted", "count": len(s.samples[point_id])}

@app.post("/session/{sid}/train")
def train(sid: str):
    s = sessions.get(sid)
    if s is None: raise HTTPException(404, "session not found")

    missing = {pid: len(s.samples.get(pid, [])) for pid in s.points}
    bad = {pid: n for pid, n in missing.items() if n < MIN_SAMPLES}
    if bad:                                                  # đảm bảo đủ N điểm × K mẫu
        return JSONResponse(422, {"status": "insufficient_samples", "detail": bad})

    X = np.array([m[:2] for ms in s.samples.values() for m in ms])
    y = np.array([m[2:] for ms in s.samples.values() for m in ms])
    s.calib.create_model(X, y)
    mae = s.calib.evaluate(X, y)
    s.state = "ready"
    return {"status": "ok", "n_samples": len(X), "mae_px": mae}

# ---------- LƯU / TÁI SỬ DỤNG MÔ HÌNH ----------
@app.get("/session/{sid}/model")
def download_model(sid: str):
    s = sessions.get(sid)
    if s is None: raise HTTPException(404, "session not found")
    if s.state != "ready": raise HTTPException(409, "not calibrated")
    return Response(s.calib.serialize(), media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="calibration_{sid}.ubj"'})

@app.post("/session/{sid}/import")
async def import_model(sid: str, model: UploadFile = File(...)):
    s = sessions.get(sid)
    if s is None: raise HTTPException(404, "session not found")
    try:
        s.calib.deserialize(await model.read())
    except Exception:
        return {"status": "invalid_model"}
    s.state = "ready"                                       # bỏ qua calibration
    return {"status": "ready"}

# ---------- STREAMING ----------
@app.websocket("/session/{sid}/stream")
async def stream(ws: WebSocket, sid: str):
    s = sessions.get(sid)
    if s is None or s.state != "ready":
        await ws.close(code=1008, reason="not_calibrated")
        return
    await ws.accept()
    while True:
        msg = await ws.receive()
        if msg["type"] == "websocket.disconnect": break
        data = msg.get("bytes")
        if data is None: continue
        if s.processing: continue                           # drop frame, không xếp hàng
        s.processing = True
        try:
            error, point = await asyncio.to_thread(predict, s, data)
            if error: await ws.send_json({"ok": False, "error": error})
            else:     await ws.send_json({"ok": True, "x": point[0], "y": point[1]})
        finally:
            s.processing = False

def predict(s, jpeg_bytes):   # (None, [x, y]) đã smooth + clip, hoặc ("no_face", None)
    frame = decode_jpeg(jpeg_bytes)
    if frame is None: return "invalid_image", None
    result = run_pipeline(frame)
    if result is None: return "no_face", None
    x, y = s.calib.predict(*result)
    w, h = s.screen
    return None, s.smoother.process([min(max(x, 0), w), min(max(y, 0), h)])
```

### 5.4. `calibration.py` — SỬA
```python
import io, pickle, ubjson
import numpy as np
from sklearn.multioutput import MultiOutputRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold

class Calibration:
    def __init__(self):
        self.model = MultiOutputRegressor(LinearRegression())

    def create_model(self, X, y):
        self.model.fit(X, y)

    def predict(self, pitch, yaw):                    # -> (float, float)
        x, y = self.model.predict(np.array([[pitch, yaw]]))[0]
        return float(x), float(y)

    def evaluate(self, X, y, k=5):                    # MAE pixel (5-fold), fit lại full sau đó
        errs = []
        for tr, te in KFold(k, shuffle=True, random_state=42).split(X):
            self.model.fit(X[tr], y[tr])
            errs.append(np.abs(self.model.predict(X[te]) - y[te]).mean())
        self.model.fit(X, y)
        return float(np.mean(errs))

    def serialize(self):                              # -> bytes (ubjson + pickle)
        return ubjson.dumpb({"py_pickle": pickle.dumps(self.model)})

    def deserialize(self, data):                      # bytes -> model
        self.model = pickle.loads(ubjson.loadb(data)["py_pickle"])

    def save(self, path):  open(path, "wb").write(self.serialize())
    def load(self, path):  self.deserialize(open(path, "rb").read())
```

### 5.5. `preprocessing.py` — SỬA NHỎ
- **Xóa dòng 3** `from utils import normalize_img` (dead import, sẽ crash vì không có utils.py).
- **Xóa dòng 5** `from scipy.optimize import minimize` (không còn dùng → bỏ được dependency scipy).

### 5.6. `requirements.txt` — SỬA
```
--extra-index-url https://download.pytorch.org/whl/cu126
torch==2.7.0
torchvision==0.22.0

numpy
pillow
opencv-python
scikit-learn
mediapipe
unigaze

fastapi
uvicorn[standard]
python-multipart
py-ubjson
```
(Bỏ: `python-dotenv`, `sqlalchemy`. Thêm: `pillow` — PIL trong `transform_frame`.
`timm` đã xác nhận không cần thiết; nếu pip tự kéo theo `unigaze` thì vô hại.)

### 5.7. `Dockerfile` — TẠO MỚI (GPU)
```dockerfile
FROM nvidia/cuda:12.6.1-cudnn-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN python3 -m pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000
CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 5.8. `docker-compose.yml` — TẠO MỚI
```yaml
services:
  gaze:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./weights:/app/weights
    environment:
      - DEVICE=cuda
    gpus: all
```

### 5.9. `.dockerignore` — TẠO MỚI
```
__pycache__/
*.pyc
.vscode/
weights/
```

## 6. LƯU Ý QUAN TRỌNG

1. **`weights/` hiện đang trống** (đã rà toàn ổ D:, không tìm thấy `mediapipe.tflite` hay `unigaze_b16_joint.safetensors` ở đâu khác). Phải đặt 2 file này vào `./weights/` trước khi chạy (mount thẳng vào container qua docker-compose).
2. `models.py` đang hardcode `device="cuda"` và đường dẫn weights — giữ nguyên vì pipeline cố định, Docker chạy GPU.
3. `Calibration.load_model()` hiện hardcode `"weights/calibrator.ubj"` → được thay bằng `serialize/deserialize/save/load` ở trên; server session dùng mô hình trong RAM, `serialize/deserialize` phục vụ việc backend lưu trữ/tái sử dụng.

## 7. Kiểm thử

1. **Local** (có GPU + weights trong `./weights`):
   `python -m uvicorn server:app --port 8000`
   - `curl /health` → `pipeline_ready: true`, `gpu_available: true`
   - `POST /session` → có `session_id`
   - `POST /session/{sid}/calibrate` với ảnh **không có mặt** → `{"status": "no_face"}`
   - Với ảnh có mặt (N điểm × ≥5 mẫu) → `POST /train`:
     - thử train khi còn thiếu 1 điểm → 422 `insufficient_samples` (đảm bảo đủ N điểm)
     - train đủ → `{status: "ok", mae_px: ...}`
   - `GET /session/{sid}/model` → tải file .ubj; tạo session mới → `POST /import` → state ready
   - Mở WS bằng script test nhỏ (python `websockets`): gửi binary JPEG → nhận `{x, y}`
2. **Docker**: `docker compose up --build` (máy host cần nvidia-container-toolkit) → test lại toàn bộ như trên.
