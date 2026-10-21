"""Chuẩn hoá khuôn mặt (alignment kiểu Zhang) trước khi đưa vào UniGaze.

Quy trình: crop mặt -> solvePnP 6 điểm -> chuẩn hoá phối cảnh về 224x224 ->
tensor ImageNet-normalized. Trả về None nếu tư thế đầu vượt ngưỡng.

Việc làm mượt POG nằm ở `app/services/smoothing.py`.
"""

import cv2
import numpy as np
from PIL import Image
from torchvision import transforms


def estimate_head_pose(landmarks, face_model, camera, distortion):
    ret, rvec, tvec = cv2.solvePnP(
        face_model, landmarks, camera, distortion, flags=cv2.SOLVEPNP_EPNP
    )
    # Chạy lại từ nghiệm đầu để hội tụ chính xác hơn
    ret, rvec, tvec = cv2.solvePnP(
        face_model, landmarks, camera, distortion, rvec, tvec, True
    )
    return rvec, tvec


def get_face_center_by_nose(hR, ht, face_model):
    # Đưa 6 điểm mốc 3D vào hệ tọa độ camera
    Fc = np.dot(hR, face_model.T) + ht
    # Tâm 2 mắt (mắt phải + mắt trái) và chóp mũi
    eye_center = np.mean(Fc[:, 0:2], axis=1).reshape(3, 1)
    nose_center = Fc[:, 2:3]
    face_center = np.mean(
        np.concatenate((eye_center, nose_center), axis=1), axis=1
    ).reshape(3, 1)
    return face_center, Fc


def normalize_image(img, landmarks, focal_norm, distance_norm, roi_size, center, hr, cam):
    center = center.reshape(3, 1)
    hR = cv2.Rodrigues(hr)[0]

    distance = np.linalg.norm(center)
    z_scale = distance_norm / distance
    cam_norm = np.array(
        [
            [focal_norm, 0, roi_size[0] / 2],
            [0, focal_norm, roi_size[1] / 2],
            [0, 0, 1.0],
        ]
    )
    S = np.array(
        [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, z_scale],
        ]
    )

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
    return img_warped, hR_norm


class Preprocessor:
    def __init__(
        self,
        device="cuda",
        focal_norm=960,
        distance_norm=600,
        roi_size=(224, 224),
        max_head_pose_deg=80,
        crop_scale=1.2,
    ):
        self.device = device
        self.focal_norm = focal_norm
        self.distance_norm = distance_norm
        self.roi_size = roi_size
        self.max_head_pose = max_head_pose_deg * np.pi / 180
        self.crop_scale = crop_scale

        # 3D face model cho 6 điểm mediapipe, đã hiệu chỉnh convention trục (đảo x, z)
        # để khớp với giao thức chuẩn hóa Zhang (mắt/miệng/tai có z dương).
        self.face_model = np.array(
            [
                [-30.0, -30.0, 20.0],  # 1. Mắt phải
                [30.0, -30.0, 20.0],   # 2. Mắt trái
                [0.0, 0.0, 0.0],       # 3. Chóp mũi
                [0.0, 30.0, 15.0],     # 4. Tâm miệng
                [-75.0, 0.0, 80.0],    # 5. Tai phải
                [75.0, 0.0, 80.0],     # 6. Tai trái
            ],
            dtype=np.float64,
        )
        self.face_pts = self.face_model.reshape(6, 1, 3)

        # Tensor transform chỉ tạo MỘT lần (trước đây tạo lại mỗi frame).
        self.transform = transforms.Compose(
            [
                transforms.Resize((roi_size[0], roi_size[1])),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            ]
        )

    def process_rgb(self, frame):
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    def _dummy_camera(self, face):
        h, w = face.shape[:2]
        focal = w * 4
        cam = np.array(
            [
                [focal, 0, w // 2],
                [0, focal, h // 2],
                [0, 0, 1],
            ],
            dtype="double",
        )
        dist = np.zeros((1, 5))
        return cam, dist

    def process(self, face, landmarks):
        """face: ảnh mặt đã crop (RGB); landmarks: 6 điểm trong hệ ảnh crop.

        Trả về tensor 224x224 (1, 3, H, W) hoặc None nếu tư thế đầu vượt ngưỡng.
        """
        lm = np.asarray(landmarks, dtype=np.float64)

        cam, dist = self._dummy_camera(face)
        lm_sub = lm.reshape(6, 1, 2)
        hr, ht = estimate_head_pose(lm_sub, self.face_pts, cam, dist)
        hR = cv2.Rodrigues(hr)[0]
        face_center, _ = get_face_center_by_nose(hR, ht, self.face_model)

        img_norm, hR_norm = normalize_image(
            face,
            lm,
            self.focal_norm,
            self.distance_norm,
            self.roi_size,
            face_center,
            hr,
            cam,
        )

        hr_norm = np.array(
            [
                np.arcsin(np.clip(hR_norm[1, 2], -1.0, 1.0)),
                np.arctan2(hR_norm[0, 2], hR_norm[2, 2]),
            ]
        )
        if np.linalg.norm(hr_norm) > self.max_head_pose:
            return None

        rgb = Image.fromarray(img_norm)
        return self.transform(rgb).unsqueeze(0).to(self.device)
