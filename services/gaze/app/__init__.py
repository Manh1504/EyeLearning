"""Gaze service: ước lượng hướng nhìn (mediapipe + UniGaze) + calibration.

Bố cục giống các service khác trong repo (backend, chatbot):
    app/main.py      - FastAPI app, lifespan, /health
    app/settings.py  - đọc biến môi trường
    app/schemas.py   - pydantic request/response
    app/api/         - router HTTP/WebSocket
    app/services/    - logic (pipeline, calibration, session)
"""
