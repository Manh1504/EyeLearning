import os
import torch
import numpy as np
import unigaze.loader as loader
import mediapipe as mp
from preprocessing import Preprocessor


def get_device():
    dev = os.environ.get("DEVICE", "").strip().lower()
    if dev in ("cpu", "cuda"):
        return dev
    return "cuda" if torch.cuda.is_available() else "cpu"


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
        h, w = frame.shape[:2]
        mp_frame = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        results = self.detector.detect(mp_frame)
        
        if results.detections:
            res = results.detections[0] 
            box = res.bounding_box  
            bbox = (box.origin_x, box.origin_y, box.origin_x + box.width, box.origin_y + box.height)
            
            landmarks = np.array([[pt.x * w, pt.y * h] for pt in res.keypoints], dtype=np.int16)
            return bbox, landmarks
            
        return None

    def __call__(self, frame):
        return self.predict(frame)


class GazeModel:
    def __init__(self, device=None):
        device = device or get_device()
        builder_key = os.path.splitext(os.path.basename("weights/unigaze_b16_joint.safetensors"))[0]
        self.model = loader.build_unigaze_model(builder_key)
        self.model.load_unigaze_weights("weights/unigaze_b16_joint.safetensors")
        self.model.to(device)
        self.model.eval()

    def predict(self, preprocessed_face):
        with torch.no_grad():
            pitch, yaw = self.model(preprocessed_face)['pred_gaze'] .cpu().detach().numpy()[0]
            return pitch, yaw
    
    def __call__(self, preprocessed_face):
        return self.predict(preprocessed_face)

class Pipline:
    def __init__(self, args):
        self.device = get_device()
        self.face_detector = FaceDetectorModel()
        self.gaze_estimator = GazeModel(device=self.device)

        self.preprocessor = Preprocessor(device=self.device)

    def process(self, frame):
        rgb_frame = self.preprocessor.process_rgb(frame)
        result = self.face_detector(rgb_frame)
        if result is None:
            return None

        bbox, landmarks = result
        xmin, ymin, xmax, ymax = bbox
        face = rgb_frame[ymin:ymax, xmin:xmax]
        landmarks_crop = landmarks - np.array([xmin, ymin])
        preprocessed_face = self.preprocessor.process(face, landmarks=landmarks_crop)
        if preprocessed_face is None:
            return None

        pitch, yaw = self.gaze_estimator(preprocessed_face)
        return pitch, yaw

    def __call__(self, frame):
        return self.process(frame)