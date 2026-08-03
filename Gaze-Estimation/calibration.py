# import cv2
import numpy as np
# import tkinter as tk
# import time 
from sklearn.svm import SVR
# from utils import get_screen_size, create_points
# import joblib
# import os


#============================================ #
# Bản dành cho desktop, không dùng cho server #
#============================================ #
# class Calibration:
#     def __init__(self, root, model_name="svr", new_calibration=True, save_path="weights"):
#         self.results = []
#         self.new_calibration = new_calibration
#         self.model_name = model_name
#         self.root = root
#         self.w, self.h = get_screen_size(root)
#         self.points = create_points(self.w, self.h)

#         if model_name == "svr":
#             self.model_x = SVR(C=500, epsilon=10)
#             self.model_y = SVR(C=500, epsilon=10)

#     def collect_calibration_data(self, pipline, delay=1):
#         if self.new_calibration:
#             # Khởi tạo GUI
#             self.root.attributes('-fullscreen', True)
#             self.root.configure(bg='black')
            
#             canvas = tk.Canvas(self.root, width=self.w, height=self.h, bg='black', highlightthickness=0)
#             canvas.pack()

#             cap = cv2.VideoCapture(0)
#             cap.read()

#             # Hiển thị lần lượt từng điểm
#             for x, y in self.points:
#                 # Vẽ điểm màu đỏ, bán kính 10px
#                 dot = canvas.create_oval(x-10, y-10, x+10, y+10, fill='red', outline='red')
#                 self.root.update() 
                
#                 time.sleep(delay) 

#                 # Flush buffer: đọc và bỏ các frame cũ tích tụ trong lúc sleep
#                 for _ in range(30):
#                     cap.read()

#                 # Đọc frame mới nhất sau khi flush
#                 _, frame = cap.read()
#                 rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
#                 pitch, yaw = pipline(rgb_frame)
#                 self.results.append([[x, y], [pitch, yaw]])

#                 canvas.delete(dot) 
#             canvas.destroy()
#             cap.release()

#     def creat_calibration_model(self):
#         if self.model_name == "svr":
#             if self.new_calibration:
#                 pitch_yaw = np.array([r[1] for r in self.results])
#                 x = np.array([r[0][0] for r in self.results]).reshape(-1, 1)
#                 y = np.array([r[0][1] for r in self.results]).reshape(-1, 1)
#                 self.model_x.fit(pitch_yaw, x)
#                 self.model_y.fit(pitch_yaw, y)

#                 joblib.dump(self.model_x, "weights/model_x.pkl")
#                 joblib.dump(self.model_y, "weights/model_y.pkl")
#             else:
#                 if os.path.exists("weights/model_x.pkl") and os.path.exists("weights/model_y.pkl"):
#                     self.model_x = joblib.load("weights/model_x.pkl")
#                     self.model_y = joblib.load("weights/model_y.pkl")
#                 else:
#                     print("No checkpoint")

#     def predict_gaze(self, new_pitch, new_yaw):   
#         if self.model_name == "svr":
#             inp = np.array([[new_pitch, new_yaw]])
#             x = self.model_x.predict(inp) 
#             y = self.model_y.predict(inp)

#             return float(x[0]), float(y[0])

# Luôn tạo mới callubration, không dùng lại callibration cũ
class Calibration:
    def __init__(self, model_name="svr"):
        self.model_name = model_name
        if model_name == "svr":
            self.model_x = SVR()
            self.model_y = SVR()

    def creat_calibration_model(self, results, points):
        if self.model_name == "svr":
            self.model_x.fit(results, points[:, 0])
            self.model_y.fit(results, points[:, 1])

    def predict_gaze(self, new_pitch, new_yaw):
        if self.model_name == "svr":
            inp = np.array([[new_pitch, new_yaw]])
            x = self.model_x.predict(inp)
            y = self.model_y.predict(inp)

            return float(x[0]), float(y[0])

    def export_models_b64(self):
        """Serialize model_x/model_y bằng joblib, trả về base64 để Web Service
        upload lên object storage — persist model, không để mất khi container
        AI Service restart (model vẫn sống trong RAM để inference nhanh, đây
        chỉ là bản backup)."""
        import base64
        import io

        import joblib

        def dump_b64(model):
            buf = io.BytesIO()
            joblib.dump(model, buf)
            return base64.b64encode(buf.getvalue()).decode("ascii")

        return dump_b64(self.model_x), dump_b64(self.model_y)

    def import_models_b64(self, model_x_b64, model_y_b64):
        """Load lại model đã serialize bằng joblib vào đúng pipeline inference.
        Hàm này không train lại và không thay đổi thuật toán mapping."""
        import base64
        import io

        import joblib

        self.model_x = joblib.load(io.BytesIO(base64.b64decode(model_x_b64)))
        self.model_y = joblib.load(io.BytesIO(base64.b64decode(model_y_b64)))

    def compute_avg_error_px(self, results, points, viewport_w, viewport_h):
        """Đo lại chính các điểm đã train (không phải held-out set) — chỉ để
        có con số tham khảo mức độ fit, KHÔNG phải đánh giá generalization
        thật (dữ liệu N=9 điểm quá ít để tách train/test có ý nghĩa)."""
        if self.model_name != "svr":
            return None
        pred_x = self.model_x.predict(results)
        pred_y = self.model_y.predict(results)
        err_x_px = (pred_x - points[:, 0]) * viewport_w
        err_y_px = (pred_y - points[:, 1]) * viewport_h
        err_px = np.sqrt(err_x_px ** 2 + err_y_px ** 2)
        return float(np.mean(err_px))
