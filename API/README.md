# Gaze API — Tài liệu tích hợp cho Backend

> ⚠️ **CẢNH BÁO PROTOCOL KHÔNG KHỚP**: Tài liệu dưới đây mô tả protocol `/session`
> (POST `/session`, `/session/{sid}/calibrate`, `/train`, `/model`, `/import`,
> `/session/{sid}/stream`) được THIẾT KẾ nhưng CHƯA BAO GIỜ được xây dựng.
> Image thực tế đang chạy trong Docker (`hieunm1501/gaze-api:gpu`, xem
> `API/docker-compose.yml`) implement protocol CŨ — client lấy từng mẫu khớp
> riêng. Các endpoint thật được dùng bởi frontend hiện tại:
>
> - `POST /calibrate/point` — multipart `image` (JPEG) + `x`, `y` (float, chuẩn hóa
>   `[0,1]`) → `{ok, sample: [pitch, yaw, rvec(3), tvec(3), x, y]}` (10 số) hoặc
>   `{ok:false, error: no_face|invalid_image}` (HTTP 503 nếu pipeline chưa sẵn sàng).
> - `POST /calibrate/fit` — JSON `{samples: [[10 số] × 16-25]}` → `{ok, params: [6]}`
>   (a1,a2,b1,a3,a4,b2), 422 nếu sai số lượng/độ dài mẫu.
> - `WS /infer` — message TEXT đầu tiên `{"params":[6],"smooth":true}` để cấu hình,
>   sau đó gửi **binary JPEG** từng frame → nhận JSON `{ok,x,y}` (chuẩn hóa `[0,1]`;
>   có thể âm/>1) hoặc `{ok:false, error: no_face}`.
>
> Client chịu trách nhiệm TỰ tích lũy mẫu (10 số) sau mỗi `/calibrate/point`, gọi
> `/calibrate/fit` khi đủ, rồi lưu 6 `params` lên backend (`POST /api/calibrations`).
> Khi stream lại chỉ cần gửi 6 `params` vào WS `/infer` — không tạo session,
> không calibrate lại.

Tài liệu này mô tả đầy đủ từng API của dịch vụ ước lượng hướng nhìn (gaze estimation) để team backend có thể gọi đúng từ request đầu tiên.

## 1. Tổng quan

Pipeline xử lý mỗi frame camera:

```
frame (JPEG) → face detection (MediaPipe) → UniGaze → (pitch, yaw)
             → mô hình calibration (LinearRegression) → (x, y) chuẩn hóa
```

Nếu không detect được khuôn mặt hoặc ảnh hỏng, frame đó bị bỏ qua và trả về lỗi tương ứng (không crash).

Dịch vụ **stateful**: server giữ session calibration trong RAM. Backend luôn đi theo 1 luồng 4 bước cố định:

```
1. POST /session                        → tạo session, khai báo N điểm calibration
2. POST /session/{sid}/calibrate        → gửi ảnh + point_id, lặp lại ≥ 5 lần/điểm
3. POST /session/{sid}/train            → train mô hình calibration riêng cho session
4. WS   /session/{sid}/stream           → streaming gaze thời gian thực
```

### 1.1 Hai khái niệm cốt lõi

**Session (trạng thái server-side)**

- Mỗi session độc lập, lưu trong RAM của dịch vụ này.
- Vòng đời: `collecting` (đang thu mẫu) → `ready` (đã train/import, mới được stream).
- TTL: 30 phút không có request nào → tự xóa. Tối đa **100 session** đồng thời (vượt quá → 503).
- Dịch vụ **không có cơ chế xác thực**: backend phải tự kiểm soát ai được gọi và không để lộ `session_id`.

**Tọa độ chuẩn hóa `[0, 1]`**

- Mọi `x, y` — điểm calibration khai báo, target khi train, output khi stream — đều **chuẩn hóa theo `screen_width × screen_height`** của session. `0.5` = giữa màn hình.
- Output stream **có thể âm hoặc > 1** (người dùng nhìn ra ngoài màn hình). Đây là hành vi bình thường, không phải lỗi. Đổi sang pixel ở phía client: `px = x * screen_width`, `py = y * screen_height`.

### 1.2 Mô hình calibration

- Input: `(pitch, yaw)` từ UniGaze — góc nhìn, **không** chuẩn hóa.
- Target: `(x, y)` chuẩn hóa `[0, 1]`.
- Mỗi session train một `LinearRegression` riêng, dạng:

```
x = a1·pitch + a2·yaw + b1
y = a3·pitch + a4·yaw + b2
```

### 1.3 Quy ước chung

- Base URL: `http://<host>:8000` (dùng biến env khi triển khai).
- Ảnh trao đổi luôn là **JPEG** (multipart field `image` hoặc binary frame qua WebSocket).
- Nếu không ghi mã HTTP cụ thể trong mục nào, mặc định là `200`.
- Body trả về luôn là JSON.

## 2. Danh sách endpoint

| Method | Path | Mục đích |
|---|---|---|
| GET | `/health` | Kiểm tra dịch vụ đã sẵn sàng chưa |
| POST | `/session` | Tạo session calibration, khai báo điểm |
| GET | `/session/{sid}` | Xem trạng thái session + số mẫu từng điểm |
| DELETE | `/session/{sid}` | Xóa session |
| POST | `/session/{sid}/calibrate` | Gửi 1 frame JPEG + `point_id` để thu mẫu |
| POST | `/session/{sid}/train` | Train mô hình calibration (cần ≥ 5 mẫu/điểm) |
| GET | `/session/{sid}/model` | Tải mô hình (.ubj) để lưu và tái sử dụng |
| POST | `/session/{sid}/import` | Nạp lại mô hình đã lưu, bỏ qua calibration |
| WS | `/session/{sid}/stream` | Streaming gaze: gửi binary JPEG, nhận `{x, y}` chuẩn hóa |

## 3. Chi tiết từng endpoint

### 3.1 GET `/health`

Kiểm tra dịch vụ đã load xong pipeline chưa trước khi nhận request thật.

```bash
curl api.nmhieu.online/health
```

```json
{
  "status": "ok",
  "gpu_available": true,
  "pipeline_ready": true
}
```

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `status` | string | `ok` khi pipeline sẵn sàng, `degraded` khi chưa |
| `gpu_available` | bool | Có GPU (CUDA) hay chạy CPU |
| `pipeline_ready` | bool | MediaPipe + UniGaze đã load xong chưa |

> Backend nên gọi endpoint này lúc khởi động hoặc trước khi mở tính năng calibration; nếu `pipeline_ready = false` thì trả lỗi "đang bảo trì" cho người dùng.

### 3.2 POST `/session` — Tạo session

Khai báo kích thước màn hình và danh sách N điểm calibration. Server trả về `session_id` dùng cho mọi request sau.

**Body JSON:**

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `screen_width` | int | Có | Chiều rộng màn hình (px) |
| `screen_height` | int | Có | Chiều cao màn hình (px) |
| `points` | array | Có | Danh sách điểm calibration |
| `points[].id` | string | Có | Định danh điểm (vd `"tl"`, `"c"`, ...) — dùng lại ở `/calibrate` |
| `points[].x` | float | Có | Tọa độ chuẩn hóa `[0, 1]` |
| `points[].y` | float | Có | Tọa độ chuẩn hóa `[0, 1]` |

```json
{
  "screen_width": 1920,
  "screen_height": 1080,
  "points": [
    {"id": "tl", "x": 0.125, "y": 0.167},
    {"id": "tr", "x": 0.875, "y": 0.167},
    {"id": "bl", "x": 0.125, "y": 0.833},
    {"id": "br", "x": 0.875, "y": 0.833},
    {"id": "c", "x": 0.5, "y": 0.5}
  ]
}
```

```bash
curl -X POST api.nmhieu.online/session \
  -H "Content-Type: application/json" \
  -d '{"screen_width":1920,"screen_height":1080,"points":[{"id":"tl","x":0.125,"y":0.167},{"id":"c","x":0.5,"y":0.5}]}'
```

**Thành công:**

```json
{"session_id": "6f1a2b3c-..."}
```

**Lỗi:**

| HTTP | Body / ý nghĩa |
|---|---|
| 503 | `too many sessions` — đã đạt giới hạn 100 session, thử lại sau |

### 3.3 GET `/session/{sid}` — Trạng thái session

Dùng để theo dõi tiến độ thu mẫu (mỗi điểm đã có bao nhiêu mẫu) và biết khi nào train/stream được.

```bash
curl api.nmhieu.online/session/6f1a2b3c-...
```

```json
{
  "state": "collecting",
  "samples": {"tl": 5, "c": 4},
  "calibrated": false
}
```

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `state` | string | `collecting` (đang thu mẫu) hoặc `ready` (đã train/import) |
| `samples` | object | Map `point_id → số mẫu đã thu` (đây là **số lượng mẫu**, không phải tọa độ) |
| `calibrated` | bool | `true` khi `state == "ready"` — lúc này mới stream được |

**Lỗi:** `404` nếu session không tồn tại.

### 3.4 DELETE `/session/{sid}` — Xóa session

Gọi khi người dùng hủy calibration hoặc đóng trang để giải phóng slot (nhớ giới hạn 100 session).

```bash
curl -X DELETE api.nmhieu.online/session/6f1a2b3c-...
# {"status": "deleted"}
```

**Lỗi:** `404` nếu session không tồn tại.

### 3.5 POST `/session/{sid}/calibrate` — Thu mẫu

Gửi **multipart/form-data** gồm 1 frame JPEG + `point_id` của điểm đang hiển thị trên màn hình người dùng. Server tự detect khuôn mặt, tính `(pitch, yaw)` rồi lưu 1 mẫu cho điểm đó. Lặp lại cho từng điểm tới khi mỗi điểm ≥ 5 mẫu.

| Form field | Kiểu | Mô tả |
|---|---|---|
| `image` | file | Frame JPEG từ webcam |
| `point_id` | string | `id` của điểm đã khai báo ở `/session` |

```bash
curl -X POST api.nmhieu.online/session/6f1a2b3c.../calibrate \
  -F "image=@frame.jpg" \
  -F "point_id=tl"
```

**Phản hồi (luôn HTTP 2xx nếu session tồn tại — phân biệt qua field `status`):**

```json
{"status": "accepted", "count": 1}
```

| `status` | Ý nghĩa | Hành động backend |
|---|---|---|
| `accepted` | Thu mẫu thành công; `count` = tổng mẫu đã có của điểm đó | Tiếp tục điểm tiếp theo |
| `unknown_point` | `point_id` không tồn tại trong session | Kiểm tra lại id |
| `invalid_image` | File không phải JPEG hợp lệ | Gửi lại ảnh |
| `no_face` | Không detect được khuôn mặt | Báo client chụp lại điểm này |

**Lỗi:** `404` nếu session không tồn tại.

### 3.6 POST `/session/{sid}/train` — Train mô hình

Không cần body. Điều kiện: **mỗi điểm đã có ≥ 5 mẫu**. Server fit `LinearRegression` mapping `(pitch, yaw) → (x, y)` chuẩn hóa và đánh giá bằng 5-fold cross-validation.

```bash
curl -X POST api.nmhieu.online/session/6f1a2b3c.../train
```

**Thành công:**

```json
{"status": "ok", "n_samples": 25, "mae_px": 0.018}
```

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `status` | string | `ok` |
| `n_samples` | int | Tổng số mẫu dùng để train |
| `mae_px` | float | Sai số trung bình, đơn vị chuẩn hóa `[0, 1]` (0.018 ≈ lệch 1.8% màn hình) |

**Lỗi:**

| HTTP | Body | Ý nghĩa |
|---|---|---|
| 422 | `{"status": "insufficient_samples", "detail": {"tl": 3}}` | Chưa đủ mẫu; `detail` = map `point_id → số mẫu hiện có` để báo client thu thêm điểm nào |
| 404 | — | Session không tồn tại |

Sau khi train thành công, `state` chuyển sang `ready` — có thể stream.

### 3.7 GET `/session/{sid}/model` — Tải mô hình

Tải mô hình đã train về dạng file `.ubj` (ubjson + pickle) để **lưu vào DB của backend** và tái sử dụng ở lần sau, khỏi phải calibration lại.

```bash
curl -o calibration.ubj api.nmhieu.online/session/6f1a2b3c.../model
```

- Response: `application/octet-stream`, tên file `calibration_{sid}.ubj`.
- **Lỗi:** `409` nếu chưa train (`not calibrated`), `404` nếu session không tồn tại.

### 3.8 POST `/session/{sid}/import` — Nạp lại mô hình

Nạp file `.ubj` đã tải từ `/model` vào session mới, **bỏ qua toàn bộ bước thu mẫu + train**, session chuyển thẳng sang `ready`.

| Form field | Kiểu | Mô tả |
|---|---|---|
| `model` | file | File `.ubj` tải từ `GET /session/{sid}/model` |

```bash
curl -X POST api.nmhieu.online/session/6f1a2b3c.../import \
  -F "model=@calibration.ubj"
```

```json
{"status": "ready"}
```

| `status` | Ý nghĩa |
|---|---|
| `ready` | Import thành công, stream được ngay |
| `invalid_model` | File không phải model hợp lệ |

**Lỗi:** `404` nếu session không tồn tại.

### 3.9 WS `/session/{sid}/stream` — Streaming gaze

WebSocket gửi liên tục frame JPEG, nhận tọa độ gaze chuẩn hóa theo thời gian thực.

**Bắt tay:**

- URL: `ws://<host>:8000/session/{sid}/stream`
- Session phải ở trạng thái `ready`. Nếu chưa train/import, server **đóng kết nối với close code `1008`** (reason `not_calibrated`).

**Tin nhắn:**

- Client → server: **binary JPEG** (mỗi message = 1 frame).
- Server → client: **text JSON**:

```json
{"ok": true, "x": 0.512, "y": 0.347}
```

```json
{"ok": false, "error": "no_face"}
```

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `ok` | bool | `false` khi frame bị bỏ qua |
| `x`, `y` | float | Tọa độ chuẩn hóa theo `screen_width × screen_height` của session; **có thể âm hoặc > 1** |
| `error` | string | `no_face` (không thấy khuôn mặt) hoặc `invalid_image` (frame hỏng) — chỉ có khi `ok = false` |

**Cơ chế quan trọng khi tích hợp:**

- **Drop-frame**: nếu server đang xử lý frame trước, frame mới gửi đến sẽ bị bỏ qua (không xếp hàng) để tránh trễ. Client gửi thoải mái, **không cần chờ phản hồi** của từng frame.
- Output đã qua bộ lọc làm mượt One-Euro.
- Đổi sang pixel ở phía client: `px = x * screen_width`, `py = y * screen_height` (lấy `screen_width/height` đã khai báo lúc tạo session).

**Ví dụ client Python:**

```python
import asyncio
import json

import cv2
import websockets


async def main():
    sid = "6f1a2b3c-..."  # session đã train xong
    cap = cv2.VideoCapture(0)

    async with websockets.connect(f"ws://localhost:8000/session/{sid}/stream") as ws:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            _, buf = cv2.imencode(".jpg", frame)
            await ws.send(buf.tobytes())          # gửi binary JPEG, không chờ

            resp = json.loads(await ws.recv())    # đọc response không chặn theo frame
            if resp.get("ok"):
                x, y = resp["x"], resp["y"]       # chuẩn hóa [0, 1]
                # px = x * screen_width; py = y * screen_height


asyncio.run(main())
```

**Ví dụ client JavaScript (browser):**

```js
const sid = "6f1a2b3c-...";
const ws = new WebSocket(`ws://localhost:8000/session/${sid}/stream`);

ws.onopen = () => ws.send(jpegBlob);        // mỗi frame webcam encode JPEG rồi gửi bytes

ws.onmessage = (e) => {
  const resp = JSON.parse(e.data);
  if (resp.ok) drawGaze(resp.x * width, resp.y * height);  // nhân kích thước màn hình
};
```

## 4. Quy trình tích hợp end-to-end

Mô tả đầy đủ vai trò của client (frontend/backend) trong từng bước:

```
Bước 1 — Bắt đầu calibration
  Frontend gọi POST /session với screen_width/height + N điểm (lấy từ cấu hình UI).
  Lưu session_id tạm thời (gắn với user + device đang calibrate).

Bước 2 — Thu mẫu (client lái)
  Client hiển thị lần lượt từng điểm (5 vòng × 16 điểm); mỗi lần gửi frame JPEG
  + point_id qua POST /session/{sid}/calibrate (gọi thẳng dịch vụ này).
  Client định kỳ gọi GET /session/{sid} để biết mỗi điểm đã đủ ≥ 5 mẫu chưa.
  Nếu nhận status "no_face" / "invalid_image" → yêu cầu chụp lại điểm đó.

Bước 3 — Train
  Client gọi POST /session/{sid}/train.
  - 422 → đọc map detail, thu thêm mẫu cho các điểm còn thiếu.
  - ok  → download model: GET /session/{sid}/model (file .ubj), rồi upload file đó
    lên backend: POST /api/calibrations (multipart `model`) — backend lưu làm bản
    active duy nhất cho (user, device).

Bước 4 — Streaming
  Lần sau mở phiên: client tải model đã lưu từ backend
  (GET /api/calibrations/active/model) → POST /session mới →
  POST /session/{sid}/import (bỏ qua bước 2-3, session chuyển ngay sang ready) →
  mở WebSocket /session/{sid}/stream: gửi binary JPEG, nhận JSON {ok, x, y}.

Dọn dẹp
  Khi phiên kết thúc (client đóng trang / stream xong), client gọi
  DELETE /session/{sid} để trả slot về giới hạn 100 session.
```

Ví dụ gọi tuần tự bằng Python:

```python
import json
import urllib.request

BASE = "api.nmhieu.online"

# 1. Tạo session
points = [
    {"id": "tl", "x": 0.125, "y": 0.167},
    {"id": "c", "x": 0.5, "y": 0.5},
    {"id": "br", "x": 0.875, "y": 0.833},
]
req = urllib.request.Request(
    f"{BASE}/session",
    data=json.dumps({"screen_width": 1920, "screen_height": 1080, "points": points}).encode(),
    headers={"Content-Type": "application/json"},
)
sid = json.load(urllib.request.urlopen(req))["session_id"]

# 2. Thu mẫu: lặp tới khi mỗi điểm >= 5 mẫu
#    (kiểm tra tiến độ qua GET /session/{sid}, xem mục 3.3)

# 3. Train
resp = json.load(urllib.request.urlopen(f"{BASE}/session/{sid}/train", data=b""))
print(resp)  # {"status": "ok", "n_samples": 25, "mae_px": ...}

# 4. Streaming qua WebSocket — xem mục 3.9
```

## 5. Tổng hợp mã lỗi

**HTTP:**

| HTTP | Xảy ra ở | Ý nghĩa |
|---|---|---|
| 404 | mọi endpoint `/session/{sid}...` | Session không tồn tại (hết TTL, đã xóa hoặc sai id) |
| 409 | `GET .../model` | Chưa train (`not calibrated`) |
| 422 | `POST .../train` | Chưa đủ mẫu; `detail` = map `point_id → số mẫu` |
| 503 | `POST /session` | Quá 100 session đồng thời |

**WebSocket:**

| Mã / giá trị | Ý nghĩa |
|---|---|
| Close code `1008` | Session chưa `ready` (`not_calibrated`) |
| `{"ok": false, "error": "no_face"}` | Frame không có khuôn mặt — bỏ qua |
| `{"ok": false, "error": "invalid_image"}` | Frame không phải JPEG hợp lệ — bỏ qua |

## 6. Checklist khi triển khai

- [ ] Gọi `GET /health` khi khởi động; chặn tính năng nếu `pipeline_ready = false`.
- [ ] Luôn khởi tạo qua `POST /session`, không gọi thẳng endpoint con.
- [ ] Theo dõi `GET /session/{sid}` trong lúc thu mẫu để biết điểm nào còn thiếu.
- [ ] Xử lý `status` (không chỉ HTTP code) ở `/calibrate` và `/import`.
- [ ] Nhân kích thước viewport ở client khi hiển thị; chấp nhận tọa độ âm / > 1.
- [ ] WebSocket stream: client gửi binary JPEG (không ép kiểu message), nhận text JSON `{ok, x, y}`; sẵn sàng tọa độ âm / > 1.
- [ ] Gọi `DELETE /session/{sid}` khi kết thúc để không chạm giới hạn 100 session.
- [ ] Lưu file `.ubj` từ `/model` vào DB để tái sử dụng qua `/import` (tránh calibration lại mỗi phiên).
- [ ] Tự bảo vệ API này (không có auth), không để lộ `session_id` ra ngoài phạm vi kiểm soát.
- [ ] Xoá session qua `DELETE /session/{sid}` khi đóng trang để không chạm giới hạn 100 session.
