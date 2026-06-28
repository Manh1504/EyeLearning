import cv2 
import numpy as np

def draw(frame, xmin: int, ymin: int, xmax: int, ymax: int, pitch, yaw):
    x_center, y_center = (xmin + xmax) // 2, (ymin + ymax) // 2

    # Vẽ bounding box
    cv2.rectangle(frame, (xmin, ymin), (xmax, ymax), color=(0, 255, 0), thickness=2)

    gaze_length = 50
    p = pitch.item() if hasattr(pitch, 'item') else pitch
    y = yaw.item() if hasattr(yaw, 'item') else yaw

    # Công thức chuẩn theo L2CS-Net (có dấu âm)
    dx = -gaze_length * np.sin(p) * np.cos(y)
    dy = -gaze_length * np.sin(y)
    
    gaze_x = int(x_center + dx)
    gaze_y = int(y_center + dy)

    # Vẽ mũi tên gaze
    cv2.arrowedLine(frame, (x_center, y_center), (gaze_x, gaze_y),
                     color=(0, 0, 255), thickness=3, tipLength=0.25)