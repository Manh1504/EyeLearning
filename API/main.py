from models import Pipline
from utils import get_args
import cv2 
from calibration import Calibration
import tkinter as tk
from utils import FreshFrameReader
import time
from preprocessing import OneEuroFilter2D

def inference(args):
    filter = OneEuroFilter2D(min_cutoff=0.5, beta=0.01)
    root = tk.Tk()
    pipline = Pipline(args)

    # Calibration
    calibration = Calibration(root, model_name=args.calibrator, new_calibration=args.new_calibration)
    calibration.collect_calibration_data(pipline)
    calibration.creat_calibration_model()
    
    root.attributes('-fullscreen', True)
    root.configure(bg='black')
    
    canvas = tk.Canvas(root, width=calibration.w, height=calibration.h, bg='black', highlightthickness=0)
    canvas.pack()
    dot = canvas.create_oval(0, 0, 10, 10, fill="red", outline="red")

    # x1, y1, x2, y2 = 0, 0, 0, 0
    cap = FreshFrameReader(0)
    time.sleep(1)
    while True:
        ret, frame = cap.read()
        if not ret:
            print("No frame")
            break
        # [SỬA] pipline(frame) chỉ trả (pitch, yaw) — thiếu rvec/tvec mà model
        # XGBoost cần. Chuyển sang process_full để lấy đủ 6 giá trị.
        result = pipline.process_full(frame)

        if result is not None:
            # [SỬA] unpack thêm hr (rvec) và ht (tvec) — đầu ra của process_full
            pitch, yaw, bbox, landmarks, hr, ht = result
            canvas.delete(dot)
            # [SỬA] predict cần đủ 4 đối số: model mapping học trên 8 features
            # [pitch, yaw, rvec(3), tvec(3)] như lúc train
            x3, y3 = calibration.predict(pitch, yaw, hr, ht)
            x, y = filter.process([x3, y3])
            # x = 1/3 * (x1 + x2 + x3)
            # y = 1/3 * (y1 + y2 + y3)
            dot = canvas.create_oval(x - 10, y - 10, x + 10, y + 10, fill="red", outline="red")
            root.update()
            # x1, y1 = x2, y2
            # x2, y2 = x3, y3

        cv2.imshow("Window", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    args = get_args()
    inference(args)
    