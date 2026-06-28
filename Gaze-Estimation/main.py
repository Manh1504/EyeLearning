from models import Pipline
from utils import get_args
import cv2 
from calibration import Calibration
import tkinter as tk

def inference(args):
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

    x1, y1, x2, y2 = 0, 0, 0, 0
    cap = cv2.VideoCapture(0)
    while True:
        ret, frame = cap.read()
        if not ret:
            print("No frame")
            break
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = pipline(rgb_frame)

        if result is not None:
            canvas.delete(dot)
            x3, y3 = calibration.predict_gaze(result[0], result[1])
            x = 1/3 * (x1 + x2 + x3)
            y = 1/3 * (y1 + y2 + y3)
            dot = canvas.create_oval(x - 10, y - 10, x + 10, y + 10, fill="red", outline="red")
            root.update()
            x1, y1 = x2, y2
            x2, y2 = x3, y3

        bgr_frame = cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR)
        cv2.imshow("Window", bgr_frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    args = get_args()
    inference(args)
    