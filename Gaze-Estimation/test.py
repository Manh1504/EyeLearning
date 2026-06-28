import asyncio
import requests
import websockets
import json
import cv2
import numpy as np

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/inference"
IMG_URL = "test_img/kevin.png"  # Đường dẫn tới ảnh test

# Tạo một ảnh đen giả định để test (định dạng JPEG)
dummy_img = cv2.imread(IMG_URL)
_, img_encoded = cv2.imencode('.jpg', dummy_img)
img_bytes = img_encoded.tobytes()

def test_health_check():
    print("--- Test Health Check ---")
    res = requests.get(f"{BASE_URL}/health_check")
    print(res.json())

def test_calibrate():
    print("\n--- Test Calibrate ---")
    # Tạo danh sách 25 tọa độ giả
    points = [{"x": 0.5, "y": 0.5} for _ in range(25)]
    data = {'points': json.dumps(points)}
    
    # Gắn kèm 25 file ảnh giả định
    files = [('frames', ('test.jpg', img_bytes, 'image/jpeg')) for _ in range(25)]
    
    res = requests.post(f"{BASE_URL}/calibrate", data=data, files=files)
    print(res.json())

async def test_inference():
    print("\n--- Test Inference (WebSocket) ---")
    try:
        async with websockets.connect(WS_URL) as ws:
            await ws.send(img_bytes)
            response = await ws.recv()
            print("Nhận được:", json.loads(response))
    except Exception as e:
        print(f"Lỗi WebSocket: {e}")

if __name__ == "__main__":
    test_health_check()
    test_calibrate()
    asyncio.run(test_inference())