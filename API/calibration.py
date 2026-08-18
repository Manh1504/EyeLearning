import numpy as np
from sklearn.svm import SVR
from sklearn.multioutput import MultiOutputRegressor
from sklearn.linear_model import LinearRegression
from utils import get_screen_size, create_points
from xgboost import XGBRegressor
from preprocessing import fit_calibration, apply_correction
import pickle
import ubjson
import tkinter as tk
import time 
from utils import FreshFrameReader

class Calibration:
    def __init__(self, root, model_name="svr", model_path="weights/calibrator.ubj",new_calibration=True):
        self.results = []
        self.model_path = model_path
        self.new_calibration = new_calibration
        self.model_name = model_name
        self.root = root
        self.w, self.h = get_screen_size(root)
        self.points = create_points(self.w, self.h)

        if model_name == "svr":
            self.model = MultiOutputRegressor(SVR())
        elif model_name == "xgb":
            self.model = XGBRegressor()
        elif model_name == "linear_tan":
            self.model = MultiOutputRegressor(LinearRegression())
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
                pitch, yaw, bbox, landmarks, hr, ht = pipline.process_full(frame)
                # [SỬA] hr, ht từ solvePnP có shape (3,1) — phải flatten() trước khi
                # unpack, nếu không np.array(results) trong fit_calibration sẽ crash
                self.results.append([pitch, yaw, *hr.flatten(), *ht.flatten(), x / self.w, y / self.h])

                canvas.delete(dot) 
            canvas.destroy()
            cap.release()

    def creat_calibration_model(self):
        # Khởi tạo model đã được huấn luyện trước đó 
        if self.model_name in ("svr", "linear"):
            with open(self.model_path, "rb") as f:
                data = ubjson.load(f)
            self.model = pickle.loads(data["py_pickle"])
        elif self.model_name == "xgb":
            self.model.load_model(self.model_path)

        # Tinh chỉnh 6 tham số
        self.params = fit_calibration(self.results, self.model)

    def predict(self, pitch, yaw, rvec, tvec):
        p_c, y_c = apply_correction(pitch, yaw, self.params)
        # [SỬA] flatten() để nhận được rvec/tvec shape (3,) bất kể đầu vào là
        # (3,) hay (3,1) từ solvePnP — tránh crash khi unpack vào np.array
        x, y = self.model.predict(np.array([[p_c, y_c, *np.asarray(rvec).flatten(), *np.asarray(tvec).flatten()]]))[0]
        return x * self.w, y * self.h
