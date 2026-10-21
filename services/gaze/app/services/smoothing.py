"""Bộ lọc làm mượt One-Euro cho tọa độ điểm nhìn (POG).

Tách riêng khỏi `preprocessing.py` để không phải kéo theo numpy/torchvision/opencv
khi chỉ cần làm mượt — nhờ đó test nhẹ và module độc lập.
"""

import time

import numpy as np


class OneEuroFilter2D:
    """One-Euro filter cho tín hiệu 2 chiều (x, y) chuẩn hóa.

    Tham số mặc định phù hợp tọa độ [0, 1] và có thể chỉnh qua biến môi trường
    (xem ``app.settings.ONEEURO_MIN_CUTOFF`` / ``ONEEURO_BETA`` /
    ``ONEEURO_D_CUTOFF``):

    - ``min_cutoff``: cutoff khi đứng yên — thấp để giảm rung, cao để bớt trễ.
    - ``beta``: độ nhạy theo tốc độ — càng cao càng bám nhanh khi lia mắt
      (đây là nút chính để giảm trễ mà gần như không thêm rung lúc đứng yên).
    - ``d_cutoff``: cutoff làm mượt vận tốc — cao hơn để thích ứng tốc độ nhanh hơn.
    """

    def __init__(self, min_cutoff=0.5, beta=0.5, d_cutoff=1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self.x_prev: np.ndarray | None = None
        self.dx_prev = np.zeros(2)
        self.t_prev: float | None = None

    @staticmethod
    def _alpha(dt: float, cutoff: float) -> float:
        return 1.0 / (1.0 + (1.0 / (2 * np.pi * cutoff)) / dt)

    def process(self, coord):
        """Nhận [x, y], trả về [x, y] đã làm mượt."""
        coord_np = np.asarray(coord, dtype=float)
        t = time.monotonic()

        if self.x_prev is None:
            self.x_prev, self.t_prev = coord_np, t
            return coord_np.tolist()

        dt = t - self.t_prev
        if dt <= 0:
            return self.x_prev.tolist()

        # 1. Vận tốc (làm mượt với cutoff riêng `d_cutoff`)
        dx = (coord_np - self.x_prev) / dt
        a_d = self._alpha(dt, self.d_cutoff)
        self.dx_prev = a_d * dx + (1 - a_d) * self.dx_prev

        # 2. Cường độ lọc phụ thuộc tốc độ
        velocity = float(np.linalg.norm(self.dx_prev))
        cutoff = self.min_cutoff + self.beta * velocity
        a = self._alpha(dt, cutoff)

        # 3. Lọc và cập nhật
        self.x_prev = a * coord_np + (1 - a) * self.x_prev
        self.t_prev = t
        return self.x_prev.tolist()
