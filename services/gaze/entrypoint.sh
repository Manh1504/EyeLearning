#!/bin/sh
set -e

echo "== Gaze API =="
python -m scripts.download_weights

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
