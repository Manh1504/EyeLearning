import time
import numpy as np
import tkinter as tk
import cv2
from PIL import Image, ImageTk

from sqlalchemy import create_engine, Column, Integer, Float, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

from models import Pipline
from utils import get_args, get_screen_size, FreshFrameReader

# ===================================================== #
#               TẠO VÀ KẾT NỐI DATABASE                 #
# ===================================================== #
Base = declarative_base()

# 1. Khai báo mô hình bảng
class Data(Base):
    __tablename__ = 'data'

    id = Column(Integer, primary_key=True) # Cần 1 khóa chính (Primary Key)
    pitch = Column(Float)
    yaw = Column(Float)
    x = Column(Float)
    y = Column(Float)
    rvec = Column(JSON)  # Hoặc Column(String)
    tvec = Column(JSON)

# 2. Tạo file SQLite và kết nối
engine = create_engine('sqlite:///my_database.db')
Base.metadata.create_all(engine) # Tạo bảng vào file database

# 3. Mở session để thao tác dữ liệu
Session = sessionmaker(bind=engine)
session = Session()

# ===================================================== #
#                      CẤU HÌNH                         #
# ===================================================== #
EDGE_MARGIN = 10       # Khoảng cách (px) của 8 điểm đầu tiên tới mép màn hình
CLICK_RADIUS = 50      # Bán kính (px) cho phép bấm vào chấm
FEED_INTERVAL = 0.15   # Giây tối thiểu giữa 2 lần vẽ camera feed (chỉ dùng lúc căn chỉnh)

# ===================================================== #
#                   THU THẬP DỮ LIỆU                    #
# ===================================================== #
class DataCollector:
    def __init__(self, root, pipline):
        self.root = root
        self.pipline = pipline
        self.w, self.h = get_screen_size(root)

        # Full màn hình
        self.root.attributes('-fullscreen', True)
        self.root.configure(bg='black')

        self.canvas = tk.Canvas(self.root, width=self.w, height=self.h, bg='black', highlightthickness=0)
        self.canvas.pack()

        # Giữ reference của ảnh camera (tránh bị garbage-collected gây lỗi Tcl)
        self.feed = ImageTk.PhotoImage(Image.new('RGB', (1, 1)))
        self.feed_item = self.canvas.create_image(0, 0, anchor='nw', image=self.feed)

        # Trạng thái bấm chuột / phím ESC
        self.current_point = None
        self.clicked = False
        self.stop = False
        self._last_feed_time = 0.0
        self.canvas.bind('<Button-1>', self._on_click)
        self.root.bind('<Escape>', self._on_escape)   

    # --- Hiển thị frame camera full màn hình (chỉ dùng lúc căn chỉnh mặt) ---
    def _update_frame(self, frame, interval=FEED_INTERVAL):
        if self.feed_item is None:
            return
        now = time.time()
        if now - self._last_feed_time < interval:
            return
        self._last_feed_time = now
        frame = cv2.resize(frame, (self.w, self.h))
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self.feed = ImageTk.PhotoImage(Image.fromarray(frame))
        self.canvas.itemconfig(self.feed_item, image=self.feed)

    # --- Xử lý bấm chuột vào chấm ---
    def _on_click(self, event):
        if self.current_point is None:
            return
        px, py = self.current_point
        if (event.x - px) ** 2 + (event.y - py) ** 2 <= CLICK_RADIUS ** 2:
            self.clicked = True

    # --- Nhấn ESC để dừng thu thập ---
    def _on_escape(self, _event):
        self.stop = True

    # --- 8 điểm cố định sát các cạnh, góc màn hình ---
    def _edge_points(self):
        m = EDGE_MARGIN
        w, h = self.w, self.h
        return [
            (m, m),                        # 1. Góc trên trái
            (w / 2, m),                    # 2. Giữa cạnh trên
            (w - m, m),                    # 3. Góc trên phải
            (w - m, h / 2),                # 4. Giữa cạnh phải
            (w - m, h - m),                # 5. Góc dưới phải
            (w / 2, h - m),                # 6. Giữa cạnh dưới
            (m, h - m),                    # 7. Góc dưới trái
            (m, h / 2),                    # 8. Giữa cạnh trái
        ]

    # --- Thu 1 mẫu tại 1 điểm: bấm chuột là chụp ngay, retry đến khi lưu được ---
    def _collect_point(self, cap, px, py, hint):
        self.current_point = (px, py)

        dot = self.canvas.create_oval(px - 12, py - 12, px + 12, py + 12, fill='red', outline='red')
        prog = self.canvas.create_text(self.w // 2, 40, text=hint,
                                       fill='white', font=('Arial', 28))
        fail = self.canvas.create_text(self.w // 2, self.h - 40, text='',
                                       fill='red', font=('Arial', 28))
        self.root.update()

        # Retry vô hạn: chỉ chuyển sang điểm khác khi lưu mẫu thành công (ESC vẫn dừng được)
        while not self.stop:
            self.clicked = False
            self.canvas.itemconfig(fail, text='')
            self.root.update()

            # Chờ người dùng bấm chuột vào chấm (ESC vẫn dừng được)
            while not self.clicked and not self.stop:
                self.root.update()
                time.sleep(0.01)

            if self.stop:
                break

            # Bấm là chụp ngay: đọc frame mới nhất + inference
            ret, frame = cap.read()
            if not ret:
                continue
            result = self.pipline.process_full(frame)
            if result is None:
                # Không detect được mặt: báo lỗi và chờ bấm lại, không tính mẫu
                self.canvas.itemconfig(fail,
                                       text='Không phát hiện khuôn mặt — bấm lại vào chấm đỏ')
                self.root.update()
                continue

            pitch, yaw, bbox, landmarks, hr, ht = result
            self._save(px / self.w, py / self.h, pitch, yaw,hr, ht)
            self.canvas.delete(dot, prog, fail)
            self.root.update()
            return True

        self.canvas.delete(dot, prog, fail)
        self.root.update()
        return False

    # --- Bước 2: 8 điểm mép cố định, rồi random vô hạn đến khi bấm ESC ---
    def collect(self, cap):
        count = 0

        for i, (px, py) in enumerate(self._edge_points(), 1):
            if self.stop:
                break
            if self._collect_point(cap, px, py,
                                   hint=f'Điểm {i}/8 — Bấm chuột vào chấm đỏ'):
                count += 1

        n = 8
        while not self.stop:
            n += 1
            px = np.random.uniform(0, self.w)
            py = np.random.uniform(0, self.h)
            if self._collect_point(cap, px, py,
                                   hint=f'Điểm random {n - 8} — Bấm chuột vào chấm đỏ (ESC: kết thúc)'):
                count += 1

        self.canvas.create_text(self.w // 2, self.h // 2,
                                text=f'Hoàn tất! Đã lưu {count} mẫu vào my_database.db',
                                fill='lime', font=('Arial', 36))
        self.root.update()
        time.sleep(2)

    def _save(self, x, y, pitch, yaw, hr, ht):
        row = Data(
            pitch=pitch,
            yaw=yaw,
            x=x,
            y=y,
            rvec=hr.flatten().tolist(),
            tvec=ht.flatten().tolist(),
        )
        session.add(row)
        session.commit()


def main():
    args = get_args()
    root = tk.Tk()
    pipline = Pipline(args)
    collector = DataCollector(root, pipline)

    cap = FreshFrameReader(0)
    time.sleep(1)  # Chờ camera khởi động

    try:
        collector.collect(cap)
    finally:
        cap.release()
        root.destroy()


if __name__ == "__main__":
    main()
