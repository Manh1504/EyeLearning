FROM python:3.11-slim

# Tránh buffer log để thấy log realtime trong `docker logs`.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Cài dependencies trước (tận dụng layer cache).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source code.
COPY app ./app

# Tạo user không phải root để chạy.
RUN useradd --create-home --shell /bin/bash appuser \
    && mkdir -p /app/media \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
