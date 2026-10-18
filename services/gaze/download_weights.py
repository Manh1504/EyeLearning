import os
import re
import sys
import urllib.request

WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")

FILES = [
    {
        "name": "mediapipe.tflite",
        "sources": [
            ("drive", "1SOIwZEVFdZdLA4d_4hgEqhPaz1gp1jjV"),
            ("url", "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"),
        ],
        "min_size": 50_000,
    },
    {
        "name": "unigaze_b16_joint.safetensors",
        "sources": [
            ("drive", "1i6JofQgqeIHsntnhlhEY1NNSVza_EKt1"),
            ("url", "https://huggingface.co/UniGaze/UniGaze-models/resolve/main/unigaze_b16_joint.safetensors"),
        ],
        "min_size": 100_000_000,
    },
]

UA = "Mozilla/5.0 (compatible; GazeAPI/1.0)"


def http(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=timeout)


def stream_to_file(resp, dest):
    tmp = dest + ".part"
    with open(tmp, "wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, dest)


def download_url(url, dest):
    stream_to_file(http(url), dest)


def download_drive(file_id, dest):
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    resp = http(url)
    ctype = resp.headers.get_content_type()
    if ctype and ctype.startswith("text/html"):
        html = resp.read().decode("utf-8", "replace")
        m = re.search(r'name="confirm" value="([^"]+)"', html)
        if not m:
            raise RuntimeError("không lấy được token xác nhận của Google Drive")
        params = f"confirm={m.group(1)}&id={file_id}"
        u = re.search(r'name="uuid" value="([^"]+)"', html)
        if u:
            params += f"&uuid={u.group(1)}"
        download_url(f"https://drive.google.com/uc?export=download&{params}", dest)
    else:
        stream_to_file(resp, dest)


def ensure(name, sources, min_size):
    dest = os.path.join(WEIGHTS_DIR, name)
    if os.path.isfile(dest) and os.path.getsize(dest) >= min_size:
        print(f"[weights] {name}: co san ({os.path.getsize(dest):,} bytes)")
        return True
    for kind, value in sources:
        try:
            if kind == "drive":
                print(f"[weights] {name}: dang tai tu Google Drive ...")
                download_drive(value, dest)
            else:
                print(f"[weights] {name}: dang tai tu {value} ...")
                download_url(value, dest)
            size = os.path.getsize(dest)
            if size >= min_size:
                print(f"[weights] {name}: xong ({size:,} bytes)")
                return True
            print(f"[weights] {name}: file qua nho ({size:,} bytes), thu nguon khac")
        except Exception as e:
            print(f"[weights] {name}: loi tai ({kind}): {e}")
        finally:
            if os.path.exists(dest + ".part"):
                os.remove(dest + ".part")
            if os.path.isfile(dest) and os.path.getsize(dest) < min_size:
                os.remove(dest)
    return False


def main():
    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    ok = True
    for f in FILES:
        ok = ensure(**f) and ok
    if not ok:
        print("LOI: khong tai du weights. Kiem tra mang va link Google Drive.", file=sys.stderr)
        sys.exit(1)
    print("[weights] Tat ca weights da san sang.")


if __name__ == "__main__":
    main()
