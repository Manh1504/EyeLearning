# from l2cs.utils import getArch
import torch
import torch.nn.functional as F
# import numpy as np
# from face_detection import RetinaFace
from ultralytics import YOLO
from processor import Preprocessing
# from visualization import draw
import unigaze.loader as loader
# import mediapipe as mp


class FaceDetectorModel:
    def __init__(self, 
                 model_name: str, 
                 model_weight: str, 
                 device="cuda"):
        self.model_name = model_name
        
        # if model_name == "retina_face":
        #     if device == "cpu":
        #         self.detector = RetinaFace(model_path=model_weight)
        #     elif device == "cuda":
        #         self.detector = RetinaFace(gpu_id=0, model_path=model_weight)

        # Hiện tại chỉ chạy trên gpu
        # elif model_name == "yolo":
        if model_name == "yolo":
            self.detector = YOLO(model_weight)

        # elif model_name == "mediapipe":
        #     BaseOptions = mp.tasks.BaseOptions
        #     FaceLandmarker = mp.tasks.vision.FaceLandmarker
        #     FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
        #     VisionRunningMode = mp.tasks.vision.RunningMode

        #     self.options = FaceLandmarkerOptions(
        #         base_options=BaseOptions(model_asset_path=model_weight),
        #         running_mode=VisionRunningMode.IMAGE)
        #     self.detector = FaceLandmarker.create_from_options(self.options) 

    def predict(self, frame):
        # if self.model_name == "retina_face":
        #     with torch.no_grad():
        #         # Output của model là list các faces, mỗi 1 phần tử là 1 tuple chứa: (bb, landmark, score)
        #         result = self.detector(frame)
        #         if result == []:
        #             return None
        #         # Lấy khuôn mặt có độ tự tin cao nhất
        #         best_face = result[0]
        #         confidence_score = best_face[2]

        #         if confidence_score < 0.9:
        #             return None 
                
        #         xmin, ymin, xmax, ymax = best_face[0]
        #         if xmin < 0 or ymin < 0 or xmax < 0 or ymax < 0:
        #             return None
        #         return [int(xmin), int(ymin), int(xmax), int(ymax)]
        
        # elif self.model_name == "yolo":
        if self.model_name == "yolo":
            with torch.no_grad():
                results = self.detector(frame, verbose=False)
                boxes = results[0].boxes
                if len(boxes) > 0:
                    box = boxes[0].xyxy[0].cpu().numpy()
                    return [int(box[0]), int(box[1]), int(box[2]), int(box[3])]
                return None 
        
        # elif self.model_name == "mediapipe":
        #     mp_frame = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        #     face_landmarker_result = self.detector.detect(mp_frame)
        #     if face_landmarker_result.face_landmarks:
        #         img_h, img_w, _ = mp_frame.numpy_view().shape

        #         # 2. Lấy danh sách landmark của khuôn mặt đầu tiên phát hiện được
        #         first_face_landmarks = face_landmarker_result.face_landmarks[0]

        #         # 3. Trích xuất toàn bộ tọa độ X, Y (đã nhân với kích thước ảnh)
        #         x_coords = [lm.x * img_w for lm in first_face_landmarks]
        #         y_coords = [lm.y * img_h for lm in first_face_landmarks]

        #         # 4. Tìm Min/Max để tạo ra Bounding Box full mặt
        #         xmin, xmax = int(min(x_coords)), int(max(x_coords))
        #         ymin, ymax = int(min(y_coords)), int(max(y_coords))

        #         return [xmin, ymin, xmax, ymax]
        #     return None

    def __call__(self, frame):
        return self.predict(frame)

class GazeModel:
    def __init__(self, 
                 model_name: str,
                 model_weight: str, 
                 device="cuda"):
        self.model_name = model_name

        # if model_name == "l2cs":
        #     self.idx_tensor = torch.arange(90, dtype=torch.float32, device=device) 
        #     self.model = getArch("ResNet50", 90)
        #     self.model.load_state_dict(torch.load(model_weight, map_location=device))
            
        # elif model_name == "unigaze":
        if model_name == "unigaze":
            self.model = loader.build_unigaze_model("unigaze_l16_joint")
            self.model.load_unigaze_weights(model_weight)

        self.model.to(device)
        self.model.eval()

    def predict(self, preprocessed_face):
        with torch.no_grad():
            # if self.model_name == "l2cs":
            #     gaze_pitch, gaze_yaw = self.model(preprocessed_face)

            #     pitch_predicted = F.softmax(gaze_pitch, dim=1)
            #     yaw_predicted = F.softmax(gaze_yaw, dim=1)

            #     pitch_predicted = torch.sum(pitch_predicted * self.idx_tensor, dim=1) * 4 - 180
            #     yaw_predicted = torch.sum(yaw_predicted * self.idx_tensor, dim=1) * 4 - 180

            #     pitch_predicted= pitch_predicted.cpu().numpy().item() * np.pi/180.0
            #     yaw_predicted= yaw_predicted.cpu().numpy().item() * np.pi/180.0

            #     return pitch_predicted, yaw_predicted
            
            # elif self.model_name == "unigaze":
            if self.model_name == "unigaze":
                pitch, yaw = self.model(preprocessed_face)['pred_gaze'] .cpu().detach().numpy()[0]
                return pitch, yaw
    
    def __call__(self, preprocessed_face):
        return self.predict(preprocessed_face)

class Pipline:
    def __init__(self, args):
        self.face_detector = FaceDetectorModel(model_name=args.face_detector, model_weight=args.face_detector_weight)
        self.gaze_estimator = GazeModel(model_name=args.gaze_estimator, model_weight=args.gaze_estimator_weight, device=args.device)
        self.preprocessor = Preprocessing(args.size, args.device)

    def process(self, frame):
        bbox = self.face_detector(frame)
        if bbox is not None:
            face = frame[bbox[1]: bbox[3], bbox[0]: bbox[2]]
            # Gaze estimation
            processed_face = self.preprocessor(face)
            pitch, yaw = self.gaze_estimator(processed_face)
            # draw(frame, bbox[0], bbox[1], bbox[2], bbox[3], pitch, yaw)

            return pitch, yaw 
        return None

    def __call__(self, frame):
        return self.process(frame)