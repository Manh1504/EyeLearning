"""Ánh xạ (pitch, yaw) -> (x, y) chuẩn hóa bằng hồi quy tuyến tính (numpy).

Thay vì lưu cả object `sklearn.LinearRegression` bằng `pickle` (rủi ro RCE khi
nhận file từ client), model được serialize thuần dưới dạng hệ số:

    x = a1 * pitch + a2 * yaw + b1
    y = a3 * pitch + a4 * yaw + b2

Format `.ubj` v2:
    {"format": "gaze-lr-v2", "coef": [[a1, a3], [a2, a4]], "intercept": [b1, b2]}

`coef` xếp sao cho `coef @ [pitch, yaw] + intercept` ra `[x, y]`. Không có
`pickle`, không cần scikit-learn ở đường predict.
"""

from __future__ import annotations

import numpy as np
import ubjson

FORMAT = "gaze-lr-v2"


class Calibration:
    def __init__(self):
        self._coef: np.ndarray | None = None      # shape (2, 2)
        self._intercept: np.ndarray | None = None  # shape (2,)

    @property
    def ready(self) -> bool:
        return self._coef is not None

    # --- Fit / predict -----------------------------------------------------
    def fit(self, X, y) -> None:
        """Fit bình phương nhỏ nhất từ mẫu (X: Nx2, y: Nx2)."""
        X = np.asarray(X, dtype=float).reshape(-1, 2)
        y = np.asarray(y, dtype=float).reshape(-1, 2)
        if len(X) == 0:
            raise ValueError("cần ít nhất 1 mẫu để fit")
        design = np.hstack([X, np.ones((len(X), 1))])
        sol, *_ = np.linalg.lstsq(design, y, rcond=None)  # (3, 2)
        self._coef = sol[:2].T
        self._intercept = sol[2]

    def predict(self, pitch: float, yaw: float) -> tuple[float, float]:
        if self._coef is None:
            raise RuntimeError("model chưa được train/import")
        point = self._coef @ np.array([pitch, yaw], dtype=float) + self._intercept
        return float(point[0]), float(point[1])

    def evaluate(self, X, y) -> float | None:
        """MAE bằng k-fold (k = min(5, N)). Trả None khi không đủ mẫu (< 3).

        Fit lại toàn bộ dữ liệu ở cuối để model sẵn sàng dùng.
        """
        X = np.asarray(X, dtype=float).reshape(-1, 2)
        y = np.asarray(y, dtype=float).reshape(-1, 2)
        n = len(X)
        if n < 3:
            self.fit(X, y)
            return None

        k = min(5, n)
        indices = np.random.default_rng(42).permutation(n)
        folds = [f for f in np.array_split(indices, k) if len(f) > 0]

        errs: list[float] = []
        for i, test_idx in enumerate(folds):
            train_idx = np.concatenate([f for j, f in enumerate(folds) if j != i])
            self.fit(X[train_idx], y[train_idx])
            pred = (self._coef @ X[test_idx].T + self._intercept[:, None]).T
            errs.append(float(np.abs(pred - y[test_idx]).mean()))

        self.fit(X, y)  # fit cuối trên toàn bộ mẫu
        return float(np.mean(errs))

    # --- Serialize (ubjson v2, không pickle) -------------------------------
    def serialize(self) -> bytes:
        if self._coef is None:
            raise RuntimeError("model chưa được train")
        return ubjson.dumpb(
            {
                "format": FORMAT,
                "coef": self._coef.tolist(),
                "intercept": self._intercept.tolist(),
            }
        )

    def deserialize(self, data: bytes) -> None:
        """Nạp model từ bytes .ubj v2. Sai format/shape -> ValueError.

        KHÔNG dùng pickle: dữ liệu từ client chỉ được đọc như số.
        """
        if not isinstance(data, (bytes, bytearray)) or not data:
            raise ValueError("model rỗng")
        try:
            obj = ubjson.loadb(bytes(data))
        except Exception as exc:  # ubjson ValueError / TypeError
            raise ValueError("không parse được model .ubj") from exc
        if not isinstance(obj, dict) or obj.get("format") != FORMAT:
            raise ValueError("format model không được hỗ trợ")

        coef = np.asarray(obj.get("coef"), dtype=float)
        intercept = np.asarray(obj.get("intercept"), dtype=float)
        if coef.shape != (2, 2) or intercept.shape != (2,):
            raise ValueError("shape model không hợp lệ")
        if not (np.all(np.isfinite(coef)) and np.all(np.isfinite(intercept))):
            raise ValueError("model chứa giá trị không hợp lệ")

        self._coef = coef
        self._intercept = intercept
