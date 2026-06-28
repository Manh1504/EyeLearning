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
