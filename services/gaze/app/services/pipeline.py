"""Pipeline: mediapipe face detect -> UniGaze -> (pitch, yaw).

Chỉ được import lazily (qua `inference.init_pipeline`) vì kéo theo mediapipe/
torch/opencv nặng.
"""


import mediapipe as mp
import numpy as np
import torch
import unigaze.loader as loader

from app.services.preprocessing import Preprocessor
from app.settings import DEVICE, WEIGHTS_DIR

# Model UniGaze đang dùng. Tên file (bỏ `.safetensors`) PHẢI trùng key trong
# `unigaze.loader.MODEL_INDEX` vì ta dùng `path.stem` làm builder key:
#   unigaze_b16_joint (vit_b_16, 346 MB) | unigaze_l16_joint (vit_l_16, 1.2 GB)
#   unigaze_h14_joint (vit_h_14, 2.5 GB) | unigaze_h14_cross_X (vit_h_14, 2.5 GB)
# Đổi model thì sửa ở đây + thêm entry tương ứng trong scripts/download_weights.py.
UNIGAZE_WEIGHTS = WEIGHTS_DIR / "unigaze_b16_joint.safetensors"
MEDIAPIPE_WEIGHTS = WEIGHTS_DIR / "mediapipe.tflite"


def get_device() -> str:
    """cuda/cpu: đọc DEVICE nếu hợp lệ, ngược lại tự dò GPU."""
    if DEVICE in ("cpu", "cuda"):
        return DEVICE
    return "cuda" if torch.cuda.is_available() else "cpu"


class FaceDetectorModel:
    def __init__(self):
        base_options = mp.tasks.BaseOptions(
            model_asset_path=str(MEDIAPIPE_WEIGHTS),
            delegate=mp.tasks.BaseOptions.Delegate.CPU,  # model rất nhẹ -> chạy CPU
        )
        options = mp.tasks.vision.FaceDetectorOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
        )
        self.detector = mp.tasks.vision.FaceDetector.create_from_options(options)

    def predict(self, frame):
        h, w = frame.shape[:2]
        mp_frame = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        results = self.detector.detect(mp_frame)

        if not results.detections:
            return None
        res = results.detections[0]
        if not res.keypoints:
            return None

        box = res.bounding_box
        # Kẹp bbox vào biên ảnh để crop không rỗng / lệch.
        xmin = max(0, box.origin_x)
        ymin = max(0, box.origin_y)
        xmax = min(w, box.origin_x + box.width)
        ymax = min(h, box.origin_y + box.height)
        if xmax <= xmin or ymax <= ymin:
            return None

        landmarks = np.array(
            [[pt.x * w, pt.y * h] for pt in res.keypoints], dtype=np.float32
        )
        return (xmin, ymin, xmax, ymax), landmarks

    def __call__(self, frame):
        return self.predict(frame)


class GazeModel:
    def __init__(self, device=None):
        device = device or get_device()
        self.model = loader.build_unigaze_model(UNIGAZE_WEIGHTS.stem)
        self.model.load_unigaze_weights(str(UNIGAZE_WEIGHTS))
        self.model.to(device)
        self.model.eval()

    def predict(self, preprocessed_face):
        with torch.no_grad():
            pred = self.model(preprocessed_face)["pred_gaze"]
            pitch, yaw = pred.cpu().detach().numpy()[0]
            return float(pitch), float(yaw)

    def __call__(self, preprocessed_face):
        return self.predict(preprocessed_face)


class Pipeline:
    def __init__(self):
        self.device = get_device()
        self.face_detector = FaceDetectorModel()
        self.gaze_estimator = GazeModel(device=self.device)
        self.preprocessor = Preprocessor(device=self.device)

    def process(self, frame):
        rgb_frame = self.preprocessor.process_rgb(frame)
        result = self.face_detector(rgb_frame)
        if result is None:
            return None

        (xmin, ymin, xmax, ymax), landmarks = result
        face = rgb_frame[ymin:ymax, xmin:xmax]
        landmarks_crop = landmarks - np.array([xmin, ymin], dtype=np.float32)
        preprocessed_face = self.preprocessor.process(face, landmarks=landmarks_crop)
        if preprocessed_face is None:
            return None

        return self.gaze_estimator(preprocessed_face)

    def __call__(self, frame):
        return self.process(frame)
