import cv2
import numpy as np
import time
from torchvision import transforms
from PIL import Image

# ========================= #
#       LÀM MƯỢT POG        #
# ========================= #
class OneEuroFilter2D:
    def __init__(self, min_cutoff=0.5, beta=0.05):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.x_prev = None
        self.dx_prev = np.zeros(2)
        self.t_prev = None

    def _alpha(self, dt, cutoff):
        return 1.0 / (1.0 + (1.0 / (2 * np.pi * cutoff)) / dt)

    def process(self, coord):
        """
        Nhận vào list [x, y], trả về list [x_mới, y_mới]
        """
        # Chuyển đổi list đầu vào thành numpy array
        coord_np = np.array(coord, dtype=float)
        t = time.time()
        
        # Khởi tạo lần đầu
        if self.x_prev is None:
            self.x_prev, self.t_prev = coord_np, t
            return coord 

        dt = t - self.t_prev
        if dt <= 0: 
            return self.x_prev.tolist()

        # 1. Vận tốc
        dx = (coord_np - self.x_prev) / dt
        a_d = self._alpha(dt, 1.0)
        self.dx_prev = a_d * dx + (1 - a_d) * self.dx_prev

        # 2. Cường độ lọc
        velocity = np.linalg.norm(self.dx_prev)
        cutoff = self.min_cutoff + self.beta * velocity
        a = self._alpha(dt, cutoff)

        # 3. Lọc và cập nhật
        self.x_prev = a * coord_np + (1 - a) * self.x_prev
        self.t_prev = t
        
        # Chuyển đổi numpy array trở lại thành list
        return self.x_prev.tolist()

# =============================== #
#          CHUẨN HÓA ẢNH          #
# =============================== #
def transform_frame(frame, device, size):
    frame_rgb = Image.fromarray(frame)
    transformers = transforms.Compose([
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )])
    return transformers(frame_rgb).unsqueeze(0).to(device)


def estimate_head_pose(landmarks, face_model, camera, distortion, iterate=True):
    ret, rvec, tvec = cv2.solvePnP(face_model, landmarks, camera, distortion, flags=cv2.SOLVEPNP_EPNP)
    if iterate:
        ret, rvec, tvec = cv2.solvePnP(face_model, landmarks, camera, distortion, rvec, tvec, True)
    return rvec, tvec


def get_face_center_by_nose(hR, ht, face_model):
    # Đưa 6 điểm mốc 3D vào hệ tọa độ camera
    Fc = np.dot(hR, face_model.T) + ht
    # Tâm 2 mắt (mắt phải + mắt trái) và chóp mũi
    eye_center = np.mean(Fc[:, 0:2], axis=1).reshape(3, 1)
    nose_center = Fc[:, 2:3]
    # Tâm khuôn mặt = trung bình của tâm mắt và mũi
    face_center = np.mean(np.concatenate((eye_center, nose_center), axis=1), axis=1).reshape(3, 1)
    return face_center, Fc


def normalize_image(img, landmarks, focal_norm, distance_norm, roi_size, center, hr, cam):
    center = center.reshape(3, 1)
    # Chuyển vector xoay (rvec) -> ma trận xoay
    hR = cv2.Rodrigues(hr)[0]

    distance = np.linalg.norm(center)
    # scale = khoảng cách mặc định / khoảng cách thực
    z_scale = distance_norm / distance
    # camera metrix
    cam_norm = np.array([
        [focal_norm, 0, roi_size[0] / 2],
        [0, focal_norm, roi_size[1] / 2],
        [0, 0, 1.0],
    ])
    # scaling matrix
    S = np.array([
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, z_scale],
    ])

    hRx = hR[:, 0]
    forward = (center / distance).reshape(3)
    down = np.cross(forward, hRx)
    down /= np.linalg.norm(down)
    right = np.cross(down, forward)
    right /= np.linalg.norm(right)
    R = np.c_[right, down, forward].T
    W = np.dot(np.dot(cam_norm, S), np.dot(R, np.linalg.inv(cam)))

    img_warped = cv2.warpPerspective(img, W, roi_size)
    hR_norm = np.dot(R, hR)
    num_point = landmarks.shape[0]
    landmarks_warped = cv2.perspectiveTransform(landmarks.reshape(-1, 1, 2).astype('float32'), W)
    landmarks_warped = landmarks_warped.reshape(num_point, 2)

    return img_warped, R, hR_norm, landmarks_warped, W


# ============================================== #
# THÊM THAM SỐ TINH NHẰM KHẮC PHỤC ĐỘ LỆCH KAPPA #
# ============================================== #
def apply_correction(pitch_raw, yaw_raw, params):
    a1, a2, b1, a3, a4, b2 = params
    pitch_c = a1 * pitch_raw + a2 * yaw_raw + b1
    yaw_c = a3 * yaw_raw + a4 * pitch_raw + b2
    return pitch_c, yaw_c

# ========================= #
#  ĐÓNG GÓI THÀNH PIPELINE  #
# ========================= #
class Preprocessor:
    def __init__(self, device="cuda", focal_norm=960, distance_norm=600,
                 roi_size=(224, 224), max_head_pose_deg=80, crop_scale=1.2):
        self.device = device
        self.focal_norm = focal_norm
        self.distance_norm = distance_norm
        self.roi_size = roi_size
        self.max_head_pose = max_head_pose_deg * np.pi / 180
        self.crop_scale = crop_scale

        # 3D face model cho 6 điểm mediapipe, đã hiệu chỉnh convention trục (đảo x, z)
        # để khớp với giao thức chuẩn hóa Zhang (mắt/miệng/tai có z dương).
        self.face_model = np.array([
                [-30.0, -30.0,  20.0],  # 1. Mắt phải (Right eye)
                [ 30.0, -30.0,  20.0],  # 2. Mắt trái (Left eye)
                [  0.0,   0.0,   0.0],  # 3. Chóp mũi (Nose tip)
                [  0.0,  30.0,  15.0],  # 4. Tâm miệng (Mouth center)
                [-75.0,   0.0,  80.0],  # 5. Tai phải (Right ear)
                [ 75.0,   0.0,  80.0]   # 6. Tai trái (Left ear)
            ], dtype=np.float64)
        self.face_pts = self.face_model.reshape(6, 1, 3)

    def process_rgb(self, frame):
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    def _dummy_camera(self, face):
        h, w = face.shape[:2]
        focal = w * 4
        cam = np.array([
            [focal, 0, w // 2],
            [0, focal, h // 2],
            [0, 0, 1],
        ], dtype="double")
        dist = np.zeros((1, 5))
        return cam, dist

    def process(self, face, landmarks):
        # face là ảnh mặt đã crop (RGB); landmarks là 6 điểm mediapipe trong hệ tọa độ ảnh crop
        # Trả về (tensor, R): R là ma trận xoay camera ảo, cần để de-normalize gaze về camera thật.
        lm = np.asarray(landmarks, dtype=np.float64)

        cam, dist = self._dummy_camera(face)
        lm_sub = lm.reshape(6, 1, 2)
        hr, ht = estimate_head_pose(lm_sub, self.face_pts, cam, dist)
        hR = cv2.Rodrigues(hr)[0]
        face_center, _ = get_face_center_by_nose(hR, ht, self.face_model)

        img_norm, R, hR_norm, lm_norm, W = normalize_image(
            face, lm, self.focal_norm, self.distance_norm, self.roi_size,
            face_center, hr, cam)

        hr_norm = np.array([
            np.arcsin(np.clip(hR_norm[1, 2], -1.0, 1.0)),
            np.arctan2(hR_norm[0, 2], hR_norm[2, 2]),
        ])
        if np.linalg.norm(hr_norm) > self.max_head_pose:
            return None

        tensor = transform_frame(img_norm, self.device, self.roi_size[0])
        return tensor
