import numpy as np
import time
from sklearn.svm import SVR
from sklearn.multioutput import MultiOutputRegressor
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer
from utils import get_screen_size, create_points
from xgboost import XGBRegressor
import tkinter as tk
import pickle
import ubjson
from utils import FreshFrameReader


def _tan_features(X):
    X = np.asarray(X, dtype=float)
    return np.column_stack([np.tan(X[:, 1]), np.tan(X[:, 0])])

class Calibration:
    def __init__(self, root=None, model_path="weights/calibrator.ubj",
                 new_calibration=True, model_name="linear_tan",
                 viewport_w=None, viewport_h=None):
        self.results = []
        self.model_path = model_path
        self.new_calibration = new_calibration
        self.root = root
        self.model_name = model_name

        if root is not None:
            self.w, self.h = get_screen_size(root)
        else:
            self.w = viewport_w
            self.h = viewport_h

        self.points = create_points(self.w, self.h)

        self.model = make_pipeline(
            FunctionTransformer(_tan_features, validate=False),
            MultiOutputRegressor(LinearRegression())
        )

    def collect_calibration_data(self, pipline, delay=1):
        if self.new_calibration:
            # Khởi tạo GUI
            self.root.attributes('-fullscreen', True)
            self.root.configure(bg='black')

            canvas = tk.Canvas(self.root, width=self.w, height=self.h, bg='black', highlightthickness=0)
            canvas.pack()

            cap = FreshFrameReader(0)
            # Hiển thị lần lượt từng điểm
            for x, y in self.points:
                # Vẽ điểm màu đỏ, bán kính 10px
                dot = canvas.create_oval(x-10, y-10, x+10, y+10, fill='red', outline='red')
                self.root.update()

                time.sleep(delay)

                _, frame = cap.read()
                pitch, yaw, tx, ty, depth = pipline(frame)
                self.results.append([pitch, yaw, x / self.w, y / self.h])

                canvas.delete(dot)
            canvas.destroy()
            cap.release()

    def creat_calibration_model(self):
        self.results = np.array(self.results)

        if self.model_name in ("svr", "linear_tan"):
            if self.new_calibration:
                X = self.results[:, :-2] # Bỏ 2 cột cuối
                y = self.results[:, -2:] # Lấy 2 cột cuối là x, y
                self.model.fit(X, y)
                model_bytes = pickle.dumps(self.model)
                with open(self.model_path, "wb") as f:
                    ubjson.dump({"py_pickle": model_bytes}, f)
            else:
                with open(self.model_path, "rb") as f:
                    data = ubjson.load(f)
                self.model = pickle.loads(data["py_pickle"])

    def create_calibration_model_for_api_version(self, results_arr, points_arr):
        self.results = np.hstack([results_arr, points_arr])
        X = self.results[:, :-2]
        y = self.results[:, -2:]
        self.model.fit(X, y)
        model_bytes = pickle.dumps(self.model)
        with open(self.model_path, "wb") as f:
            ubjson.dump({"py_pickle": model_bytes}, f)

    def predict(self, pitch, yaw):
        x, y = self.model.predict(np.array([[pitch, yaw]]))[0]
        return x * self.w, y * self.h
