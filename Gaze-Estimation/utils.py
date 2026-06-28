from argparse import ArgumentParser

def get_args():
    parser = ArgumentParser()
    parser.add_argument("--face_detector", type=str, default="retina_face")
    parser.add_argument("--face_detector_weight", type=str, default="weights/mobilenet0.25_Final.pth")

    parser.add_argument("--gaze_estimator", type=str, default="l2cs")
    parser.add_argument("--gaze_estimator_weight", type=str, default="weights/L2CSNet_gaze360.pkl")

    parser.add_argument("--calibrator", type=str, default="svr")
    parser.add_argument("--new_calibration", action="store_true", default=False)
    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--size", type=int, default=448)

    return parser.parse_args()

def get_screen_size(root):
    width = root.winfo_screenwidth()
    height = root.winfo_screenheight()

    return width, height

def create_points(w, h):
    return [
            # Hàng 1: y = 0
            (0, 0), (w//4, 0), (w//2, 0), (3*w//4, 0), (w-5, 0),
            # Hàng 2: y = h//4
            (0, h//4), (w//4, h//4), (w//2, h//4), (3*w//4, h//4), (w, h//4),
            # Hàng 3: y = h//2
            (0, h//2), (w//4, h//2), (w//2, h//2), (3*w//4, h//2), (w, h//2),
            # Hàng 4: y = 3*h//4
            (0, 3*h//4), (w//4, 3*h//4), (w//2, 3*h//4), (3*w//4, 3*h//4), (w, 3*h//4),
            # Hàng 5: y = h
            (0, h), (w//4, h), (w//2, h), (3*w//4, h), (w, h),
        ]

