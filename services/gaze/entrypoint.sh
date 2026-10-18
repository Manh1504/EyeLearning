#!/bin/sh
set -e

echo "== Gaze API =="
python download_weights.py

exec uvicorn server:app --host 0.0.0.0 --port 8000
