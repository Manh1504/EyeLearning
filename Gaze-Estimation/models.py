import torch
import numpy as np
import unigaze.loader as loader
import mediapipe as mp
from preprocessing import Preprocessor

class FaceDetectorModel:
    def __init__(self):
        BaseOptions = mp.tasks.BaseOptions
        FaceDetector = mp.tasks.vision.FaceDetector
        FaceDetectorOptions = mp.tasks.vision.FaceDetectorOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        options = FaceDetectorOptions(
            base_options=BaseOptions(
                model_asset_path="weights/mediapipe.tflite",
                delegate=BaseOptions.Delegate.CPU,  # luôn CPU vì model rất nhẹ
            ),
            running_mode=VisionRunningMode.IMAGE)
        self.detector = FaceDetector.create_from_options(options)

    def predict(self, frame):
        """
        Args:
            frame (ndarray): 1 frame lấy từ camera
        Retures:
            Tuple[ndarray, ndarray] | None:
                - (bbox, landmarks): nếu detect được khuôn mặt
                - None: Nếu không detect được khuôn mặt
        """
        h, w = frame.shape[:2]
        mp_frame = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        results = self.detector.detect(mp_frame)

        if results.detections:
            res = results.detections[0]
            box = res.bounding_box

            xmin = box.origin_x
            xmax = xmin + box.width
            ymin = box.origin_y
            ymax = ymin + box.height


            # # Dịch ymin lên trên 20% chiều cao để lấy trán
            # ymin = int(max(0, box.origin_y - 0.2 * box.height))
            # # Mở rộng chiều ngang mỗi bên 10% (mediapipe bắt bbox khá bé)
            # xmin = int(max(0, xmin - 0.1 * box.width))
            # xmax = int(min(w, xmax + 0.1 * box.width))

            bbox = (xmin, ymin, xmax, ymax)

            landmarks = np.array([[pt.x * w, pt.y * h] for pt in res.keypoints], dtype=np.int16)
            return bbox, landmarks

        return None

    def __call__(self, frame):
        return self.predict(frame)


class GazeModel:
    def __init__(self, model_weight: str = "weights/unigaze_b16_joint.safetensors", device="cuda"):
        self.model = loader.build_unigaze_model("unigaze_b16_joint")
        self.model.load_unigaze_weights(model_weight)
        self.model.to(device)
        self.model.eval()

    def predict(self, preprocessed_face):
        """
        Args:
            preprocessed_face (tensor): Khuôn mặt đã được xử lý từ các bước trước
        Returns:
            Tuple[float, float]:
                - pitch (float): Góc ngước/cúi đầu (+: ngước lên, -: cúi xuống) (radian)
                - yaw (float): Góc quay đầu (+: sang phải, -: sang trái) (radian)
        """
        with torch.no_grad():
            pitch, yaw = self.model(preprocessed_face)['pred_gaze'] .cpu().detach().numpy()[0]
            return pitch, yaw

    def __call__(self, preprocessed_face):
        return self.predict(preprocessed_face)

class Pipline:
    def __init__(self, args):
        self.face_detector = FaceDetectorModel()
        self.gaze_estimator = GazeModel(device=args.device)

        self.preprocessor = Preprocessor(device=args.device)

    def process(self, frame):
        rgb_frame = self.preprocessor.process_rgb(frame)
        result = self.face_detector(rgb_frame)
        if result is None:
            return None

        bbox, landmarks = result
        xmin, ymin, xmax, ymax = bbox
        # Mở rộng bbox theo crop_scale quanh tâm để đủ vùng cho warp chuẩn hóa (tránh viền đen)
        h, w = rgb_frame.shape[:2]
        cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
        bw, bh = xmax - xmin, ymax - ymin
        s = self.preprocessor.crop_scale
        x1 = int(max(0, cx - bw * s / 2))
        x2 = int(min(w, cx + bw * s / 2))
        y1 = int(max(0, cy - bh * s / 2))
        y2 = int(min(h, cy + bh * s / 2))
        face = rgb_frame[y1:y2, x1:x2]
        landmarks_crop = landmarks - np.array([x1, y1])
        prepared = self.preprocessor.process(face, landmarks=landmarks_crop)
        if prepared is None:
            return None

        preprocessed_face, (tx, ty, depth) = prepared
        pitch, yaw = self.gaze_estimator(preprocessed_face)
        return pitch, yaw, tx, ty, depth

    def __call__(self, frame):
        return self.process(frame)