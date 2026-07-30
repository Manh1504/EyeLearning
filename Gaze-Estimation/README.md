## Cài đặt

```bash
# 1. Cài các gói Python cơ bản
pip install -r requirements.txt
```



## Chuẩn bị weights
Đặt các file model vào thư mục `weights/`, tải tại [đây](https://drive.google.com/drive/folders/1olXtxlqBb7gW_nnB4p_dSDXV2t2IMy5B?usp=sharing)

## Chạy

```bash
# Lần đầu chạy (retinaface + l2cs)
python main.py --new_callibration

# Chạy bình thường (dùng calibration đã lưu)
python main.py