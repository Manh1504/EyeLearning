from argparse import ArgumentParser
import cv2
import threading
from torchvision import transforms
from PIL import Image
import cv2
import numpy as np

def get_args():
    parser = ArgumentParser()
    parser.add_argument("--face_detector", type=str, default="mediapipe")
    parser.add_argument("--face_detector_weight", type=str, default="weights/mediapipe.tflite")

    parser.add_argument("--gaze_estimator", type=str, default="unigaze")
    parser.add_argument("--gaze_estimator_weight", type=str, default="weights/unigaze_b16_joint.safetensors")

    parser.add_argument("--calibrator", type=str, default="linear")
    parser.add_argument("--new_calibration", action="store_true", default=False)

    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--size", type=int, default=448)

    return parser.parse_args()

def get_screen_size(root):
    width = root.winfo_screenwidth()
    height = root.winfo_screenheight()

    return width, height

def create_points(w, h, points=25):
    if points == 25:
        return [
                # Hàng 1: y = 0
                (0 , 0 ), (w//4, 0 ), (w//2, 0 ), (3*w//4, 0 ), (w, 0 ),
                # Hàng 2: y = h//4
                (0 , h//4), (w//4, h//4), (w//2, h//4), (3*w//4, h//4), (w, h//4),
                # Hàng 3: y = h//2
                (0 , h//2), (w//4, h//2), (w//2, h//2), (3*w//4, h//2), (w, h//2),
                # Hàng 4: y = 3*h//4
                (0 , 3*h//4), (w//4, 3*h//4), (w//2, 3*h//4), (3*w//4, 3*h//4), (w, 3*h//4),
                # Hàng 5: y = h
                (0 , h), (w//4, h), (w//2, h), (3*w//4, h), (w, h),
            ]
    elif points == 9:
        return [
                # Hàng 1: y = 0
                (0, 0), (w//2, 0), (w, 0),
                # Hàng 2: y = h//2
                (0, h//2), (w//2, h//2), (w, h//2),
                # Hàng 3: y = h
                (0, h), (w//2, h), (w, h),
            ]
    elif points == 16:
        return [
                # Hàng 1: y = 0
                (0, 0), (w//3, 0), (2*w//3, 0), (w, 0),
                # Hàng 2: y = h//3
                (0, h//3), (w//3, h//3), (2*w//3, h//3), (w, h//3),
                # Hàng 3: y = 2*h//3
                (0, 2*h//3), (w//3, 2*h//3), (2*w//3, 2*h//3), (w, 2*h//3),
                # Hàng 4: y = h
                (0, h), (w//3, h), (2*w//3, h), (w, h),
            ]

# Tạo cap chỉ lấy các frame mới nhất 
class FreshFrameReader:
    def __init__(self, src=0):
        self.cap = cv2.VideoCapture(src)
        self.ret = False
        self.frame = None
        self.running = True
        
        # Chạy thread đọc camera liên tục
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def _update(self):
        while self.running:
            self.ret, self.frame = self.cap.read()

    def read(self):
        # Lấy frame mới nhất hiện tại
        return self.ret, self.frame

    def release(self):
        self.running = False
        self.thread.join()
        self.cap.release()


def normalize_img(frame, device, size):
    frame_rgb = Image.fromarray(frame)
    transformers = transforms.Compose([
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )])
    return transformers(frame_rgb).unsqueeze(0).to(device)


def draw(frame, bbox, pitch, yaw, gaze_length=50):
    # Dùng .tolist() để lấy thẳng int của Python
    x_min, y_min, x_max, y_max = bbox.tolist()
    
    # Dùng // để chia lấy nguyên, kết quả chắc chắn là int
    x_center = (x_min + x_max) // 2
    y_center = (y_min + y_max) // 2

    cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), color=(0, 255, 0), thickness=2)

    dx = int(-gaze_length * np.sin(np.radians(yaw)))
    dy = int(-gaze_length * np.sin(np.radians(pitch)))
    
    gaze_x = x_center + dx
    gaze_y = y_center + dy
    
    cv2.arrowedLine(frame, (x_center, y_center), (gaze_x, gaze_y),
                     color=(0, 0, 255), thickness=3, tipLength=0.25)

def compute_iou(boxA, boxB):
    # Xác định tọa độ của vùng giao nhau (Intersection)
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    # Diện tích vùng giao nhau
    inter_area = max(0, xB - xA) * max(0, yB - yA)

    # Diện tích của từng khung
    boxA_area = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxB_area = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

    # Diện tích vùng hợp (Union)
    union_area = boxA_area + boxB_area - inter_area

    if union_area == 0:
        return 0.0

    return inter_area / float(union_area)