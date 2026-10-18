import pickle

import numpy as np
import ubjson
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold


class Calibration:
    """Ánh xạ (pitch, yaw) -> (x, y) chuẩn hóa bằng LinearRegression.

    LinearRegression của sklearn nhận thẳng target nhiều cột (x, y) nên không
    cần bọc trong MultiOutputRegressor. Hệ số được cache sẵn dưới dạng numpy
    để `predict()` không tốn overhead validation của sklearn trên mỗi frame.
    """

    def __init__(self):
        self.model = LinearRegression()
        self._coef: np.ndarray | None = None
        self._intercept: np.ndarray | None = None

    # Đồng bộ cache hệ số từ model (gọi sau fit hoặc deserialize).
    # Model cũ (MultiOutputRegressor) không có coef_ trực tiếp -> để cache None
    # và predict() tự fallback về sklearn.
    def _refresh_cache(self):
        coef = getattr(self.model, "coef_", None)
        intercept = getattr(self.model, "intercept_", None)
        if coef is None or intercept is None:
            self._coef = self._intercept = None
            return
        self._coef = np.asarray(coef, dtype=float)
        self._intercept = np.asarray(intercept, dtype=float)

    def create_model(self, X, y):
        self.model.fit(X, y)
        self._refresh_cache()

    def predict(self, pitch, yaw):  # -> (float, float)
        if self._coef is None:
            self._refresh_cache()
        if self._coef is None:  # model legacy: dùng sklearn
            x, y = self.model.predict(np.array([[pitch, yaw]]))[0]
            return float(x), float(y)
        point = np.dot(self._coef, (pitch, yaw)) + self._intercept
        return float(point[0]), float(point[1])

    def evaluate(self, X, y):  # MAE pixel (k-fold), fit lại full sau đó
        n = len(X)
        if n < 2:
            return float("nan")
        k = min(5, n)
        errs = []
        for tr, te in KFold(k, shuffle=True, random_state=42).split(X):
            self.model.fit(X[tr], y[tr])
            errs.append(np.abs(self.model.predict(X[te]) - y[te]).mean())
        self.model.fit(X, y)
        self._refresh_cache()
        return float(np.mean(errs))

    def serialize(self):  # -> bytes (ubjson + pickle)
        return ubjson.dumpb({"py_pickle": pickle.dumps(self.model)})

    def deserialize(self, data):  # bytes -> model
        self.model = pickle.loads(ubjson.loadb(data)["py_pickle"])
        self._refresh_cache()
