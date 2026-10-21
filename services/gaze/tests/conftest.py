"""Test dev-only cho gaze service.

Đảm bảo `app` import được khi chạy `pytest` từ bất kỳ thư mục nào:
thêm thư mục service (services/gaze) vào sys.path.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
