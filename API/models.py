from l2cs.utils import getArch
import os
import torch
import torch.nn.functional as F
import numpy as np
from face_detection import RetinaFace
from ultralytics import YOLO
import unigaze.loader as loader
import mediapipe as mp
from preprocessing import Preprocessor, denormalize_gaze

class FaceDetectorModel:
    def __init__(self, model_name, model_weight, device="cuda"):
        self.model_name = model_name
        if model_name == "retina_face":
            self.detector = RetinaFace(gpu_id=0 if device == "cuda" else -1, model_path=model_weight)
        elif model_name == "yolo":
            self.detector = YOLO(model_weight)
            self.detector.to(device)
            self.detector.eval()
        elif model_name == "mediapipe":
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
        with torch.no_grad():
            if self.model_name == "retina_face":
                result = self.detector(frame)
                # Trường hợp k detect được gì
                if result == []:
                    return None
                best_face = result[0]
                confidence_score = best_face[2]
                # Trường hợp detect được nhưng độ tự tin thấp -> khả năng không phải mặt
                if confidence_score < 0.8:
                    return None
                bbox = best_face[0].astype(np.int16)
                landmarks = best_face[1].astype(np.int16)
                return (bbox, landmarks)
            
            elif self.model_name == "yolo":
                results = self.detector(frame)
                # Nếu detect được khuôn mặt thì lấy khuôn mặt có độ tự tin cao nhất 
                if len(results[0].boxes) > 0:
                    res = results[0]
                    landmarks = res.keypoints.xy[0].to(torch.int16).cpu().numpy()
                    bbox = res.boxes.xyxy[0].to(torch.int16).cpu().numpy()
                    return (bbox, landmarks)
                return None

            elif self.model_name == "mediapipe":
                h, w = frame.shape[:2]
                mp_frame = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
                results = self.detector.detect(mp_frame)
                
                if results.detections:
                    res = results.detections[0] 
                    box = res.bounding_box 
                    
                    xmin = box.origin_x
                    xmax = box.origin_x + box.width
                    ymax = box.origin_y + box.height
                    ymin = box.origin_y
                    
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
    def __init__(self, model_name: str, model_weight: str, device="cuda"):
        self.model_name = model_name
        if model_name == "l2cs":
            self.idx_tensor = torch.arange(90, dtype=torch.float32, device=device) 
            self.model = getArch("ResNet50", 90)
            self.model.load_state_dict(torch.load(model_weight, map_location=device))
        elif model_name == "unigaze":
            builder_key = os.path.splitext(os.path.basename(model_weight))[0]
            self.model = loader.build_unigaze_model(builder_key)
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
            if self.model_name == "l2cs":
                # L2CS trả về bị ngược: yaw, pitch
                gaze_yaw, gaze_pitch = self.model(preprocessed_face)
                # Trích xuất, chuyển từ gpu -> cpu, chuyển từ độ -> rad
                pitch, yaw = [
                    (torch.sum(F.softmax(x, dim=1) * self.idx_tensor, dim=1) * 4 - 180).item() * (np.pi / 180.0)
                    for x in (gaze_pitch, gaze_yaw)
                ]
                return pitch, yaw
            elif self.model_name == "unigaze":
                pitch, yaw = self.model(preprocessed_face)['pred_gaze'] .cpu().detach().numpy()[0]
                return pitch, yaw
    
    def __call__(self, preprocessed_face):
        return self.predict(preprocessed_face)

class Pipline:
    def __init__(self, args):
        self.face_detector = FaceDetectorModel(model_name=args.face_detector, model_weight=args.face_detector_weight)
        self.gaze_estimator = GazeModel(model_name=args.gaze_estimator, model_weight=args.gaze_estimator_weight, device=args.device)

        self.preprocessor = Preprocessor(device=args.device)

    def process(self, frame):
        result = self.process_full(frame)
        if result is None:
            return None
        return result[:2]

    def process_full(self, frame):
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

        preprocessed_face, R, hr, ht = prepared
        pitch, yaw = self.gaze_estimator(preprocessed_face)
        # Gaze model trả về góc trong hệ tọa độ camera ảo (sau warp chuẩn hóa),
        # cần đưa về hệ tọa độ camera thật trước khi đưa vào calibration.
        pitch, yaw = denormalize_gaze(pitch, yaw, R)
        return pitch, yaw, bbox, landmarks, hr, ht

    def __call__(self, frame):
        return self.process(frame)