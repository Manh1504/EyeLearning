import cv2
import numpy as np
from utils import normalize_img


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

    def _dummy_camera(self, image):
        h, w = image.shape[:2]
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
        translation = (float(ht[0, 0]), float(ht[1, 0]), float(ht[2, 0]))
        return tensor, translation
