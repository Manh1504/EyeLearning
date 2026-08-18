import cv2
import numpy as np
from utils import normalize_img
import time 
from scipy.optimize import minimize


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
def estimate_head_pose(landmarks, face_model, camera, distortion, iterate=True):
    """
    Tính góc xoay và vị trí 3D của đầu dựa trên các điểm trên mặt (thuật toán PnP).
    Args:
        landmarks (np.ndarray): Tọa độ 2D của các điểm mốc trên ảnh. (N, 2)
        face_model (np.ndarray): Tọa độ 3D chuẩn tương ứng của khuôn mặt. (N, 3)
        camera (np.ndarray): Ma trận nội suy camera (3x3).
        distortion (np.ndarray): Hệ số méo ống kính (thường là mảng 0).
        iterate (bool, optional): Bật tối ưu hóa kết quả lần 2 để tăng độ chuẩn xác. Mặc định là True.
                                
    Returns:
        Tuple:
            - rvec: Vector góc xoay đầu (Rotation).
            - tvec: Vector vị trí đầu so với camera (Translation).
    """
    ret, rvec, tvec = cv2.solvePnP(face_model, landmarks, camera, distortion, flags=cv2.SOLVEPNP_EPNP)
    if iterate:
        ret, rvec, tvec = cv2.solvePnP(face_model, landmarks, camera, distortion, rvec, tvec, True)
    return rvec, tvec


def get_face_center_by_nose(hR, ht, face_model):
    """
    Tính tọa độ 3D thực tế của "tâm khuôn mặt" (điểm giữa 2 mắt và mũi) so với camera.
    Args:
        hR (np.ndarray): Ma trận xoay 3x3 của đầu (từ rvec).
        ht (np.ndarray): Vector tịnh tiến 3x1 của đầu (từ tvec).
        face_model (np.ndarray): Tọa độ 3D chuẩn của 6 điểm mốc
                                 [mắt phải, mắt trái, chóp mũi, tâm miệng, tai phải, tai trái].
        
    Returns:
        Tuple:
            - face_center: Tọa độ 3D (X, Y, Z) của tâm khuôn mặt trong không gian thực.
            - Fc: Tọa độ 3D thực tế của 6 điểm mốc sau khi đã xoay và tịnh tiến.
    """
    # Đưa 6 điểm mốc 3D vào hệ tọa độ camera
    Fc = np.dot(hR, face_model.T) + ht
    # Tâm 2 mắt (mắt phải + mắt trái) và chóp mũi
    eye_center = np.mean(Fc[:, 0:2], axis=1).reshape(3, 1)
    nose_center = Fc[:, 2:3]
    # Tâm khuôn mặt = trung bình của tâm mắt và mũi
    face_center = np.mean(np.concatenate((eye_center, nose_center), axis=1), axis=1).reshape(3, 1)
    return face_center, Fc


def normalize_image(img, landmarks, focal_norm, distance_norm, roi_size, center, hr, cam):
    """
    Thực hiện chuẩn hóa hình học (Geometric Normalization) cho vùng ảnh khuôn mặt bằng cách
    tạo ra một "camera ảo" nhắm thẳng vào tâm mặt ở một khoảng cách cố định. 

    Các bước tính toán:
    1. Tính tỉ lệ thu phóng (Z-scale) để đưa mặt về khoảng cách chuẩn.
    2. Xây dựng ma trận xoay camera (R) sao cho trục Z hướng thẳng vào mặt và trục X thăng bằng.
    3. Tính ma trận phối cảnh (W) và áp dụng warp để cắt/bẻ thẳng bức ảnh.

    Args:
        img (np.ndarray): Ảnh gốc chứa khuôn mặt.
        landmarks (np.ndarray): Tọa độ 2D của các điểm mốc trên ảnh gốc.
        focal_norm (float): Độ dài tiêu cự giả định cho camera ảo.
        distance_norm (float): Khoảng cách chuẩn cố định từ camera ảo tới mặt (vd: 600mm).
        roi_size (tuple): Kích thước (width, height) của bức ảnh sau khi cắt.
        center (np.ndarray): Tọa độ 3D (X, Y, Z) của tâm khuôn mặt so với camera thực.
        hr (np.ndarray): Vector xoay 3D (rvec) của đầu.
        cam (np.ndarray): Ma trận nội suy (Intrinsic matrix) của camera thực tế.

    Returns:
        Tuple:
            - img_warped (np.ndarray): Bức ảnh đã được chuẩn hóa (chính diện, đúng khoảng cách).
            - R (np.ndarray): Ma trận xoay 3x3 của camera ảo.
            - hR_norm (np.ndarray): Ma trận xoay 3x3 của đầu ĐÃ CHUẨN HÓA (nhìn từ camera ảo).
            - landmarks_warped (np.ndarray): Tọa độ 2D của các điểm mốc trên bức ảnh mới.
            - W (np.ndarray): Ma trận biến đổi phối cảnh 3x3 (Warping Matrix).
    """
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

# ===================== #
#     GIẢI CHUẨN HÓA    #
# ===================== #
def pitchyaw_to_vector(pitch, yaw):
    """
    Chuyển góc (pitch, yaw) radian thành vector gaze đơn vị (3,) theo
    giao thức ETH-XGaze: x = cos(p)·sin(y), y = sin(p), z = cos(p)·cos(y).
    """
    p = float(pitch)
    y = float(yaw)
    return np.array([
        np.cos(p) * np.sin(y),
        np.sin(p),
        np.cos(p) * np.cos(y),
    ])


def vector_to_pitchyaw(vec):
    """
    Chuyển vector gaze 3D về góc (pitch, yaw) radian (ngược với pitchyaw_to_vector).
    """
    g = np.asarray(vec, dtype=np.float64).reshape(3)
    g = g / np.linalg.norm(g)
    return np.array([
        np.arcsin(np.clip(g[1], -1.0, 1.0)),
        np.arctan2(g[0], g[2]),
    ])


def denormalize_gaze(pitch, yaw, R):
    """
    Đưa góc gaze (pitch, yaw) từ hệ tọa độ camera ảo (sau khi warp chuẩn hóa Zhang)
    về hệ tọa độ camera thật, bằng cách xoay vector với Rᵀ (R trực giao nên R⁻¹ = Rᵀ).

    Args:
        pitch (float): Góc pitch của model (radian), quy ước (+) nhìn lên.
        yaw (float): Góc yaw của model (radian), quy ước (+) nhìn sang phải của người.
        R (np.ndarray): Ma trận xoay camera ảo (3x3) trả về từ normalize_image.

    Returns:
        Tuple[float, float]: (pitch_cam, yaw_cam) trong hệ tọa độ camera thật (radian),
            giữ nguyên quy ước dấu như đầu ra của model.
    """
    g = pitchyaw_to_vector(pitch, yaw).reshape(3, 1)
    g = np.dot(R.T, g)
    g = g / np.linalg.norm(g)
    pitch_cam, yaw_cam = vector_to_pitchyaw(g.reshape(1, 3)).flatten()
    return float(pitch_cam), float(yaw_cam)


# ============================================== #
# THÊM THAM SỐ TINH NHẰM KHẮC PHỤC ĐỘ LỆCH KAPPA #
# ============================================== #
def apply_correction(pitch_raw, yaw_raw, params):
    a1, a2, b1, a3, a4, b2 = params
    pitch_c = a1 * pitch_raw + a2 * yaw_raw + b1
    yaw_c = a3 * yaw_raw + a4 * pitch_raw + b2
    return pitch_c, yaw_c

import numpy as np
from scipy.optimize import minimize

def fit_calibration(results, model):
    data = np.array(results)
    
    # Tách data
    p, y   = data[:, 0], data[:, 1]
    rv, tv = data[:, 2:5], data[:, 5:8]
    xt, yt = data[:, 8], data[:, 9]
    
    def loss(params):
        pc, yc = apply_correction(p, y, params)
        
        # 1. Gộp pc, yc (1D) và rv, tv (2D) thành 1 ma trận duy nhất có dạng (25, 8)
        X_input = np.column_stack((pc, yc, rv, tv))
        
        # 2. Gọi hàm predict của sklearn
        predictions = model.predict(X_input)
        
        # 3. sklearn sẽ trả về mảng (25, 2) nếu model train với 2 output (x, y)
        x_pred = predictions[:, 0]
        y_pred = predictions[:, 1]
        
        return np.mean((x_pred - xt)**2 + (y_pred - yt)**2)

    init_params = np.array([1.0, 0.0, 0.0, 1.0, 0.0, 0.0])
    result = minimize(loss, init_params, method="Powell")
    
    return result.x

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

        tensor = normalize_img(img_norm, self.device, self.roi_size[0])
        # translation = (float(ht[0, 0]), float(ht[1, 0]), float(ht[2, 0]))
        return tensor, R, hr, ht
