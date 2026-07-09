# Gaze Prediction on Screen

Dự đoán điểm nhìn của người dùng trên màn hình chỉ bằng webcam, không cần thiết bị eye-tracking chuyên dụng.

## Yêu cầu

- Python 3.10+
- Docker Desktop
- Webcam

## Chạy bằng Docker

Mặc định dùng CPU, chạy được trên Mac, Windows, Linux:

```bash
docker compose up -d --build
curl http://127.0.0.1:9000/health_check
```

Máy Windows/Linux có NVIDIA GPU dùng override GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
curl http://127.0.0.1:9000/health_check
```

## Cài đặt

```bash
# 1. Cài các gói Python cơ bản
pip install -r requirements.txt
```

## Chuẩn bị weights
Đặt các file model vào thư mục `weights/`, tải tại [đây](https://drive.google.com/drive/folders/1olXtxlqBb7gW_nnB4p_dSDXV2t2IMy5B?usp=sharing)

## Chạy

```bash
# Lần đầu chạy (retinaface + l2cs)
python main.py --new_callibration

# Chạy bình thường (dùng calibration đã lưu)
python main.py

# Dùng yolo + unigaze
python main.py --face_detector yolo --face_detector_weight weights/yolov8n-face.pt --gaze_estimator unigaze --gaze_estimator_weight weights/unigaze_l16_joint.safetensors --new_callibration --size 224
```
