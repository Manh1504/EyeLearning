# syntax=docker/dockerfile:1
#
# Chatbot RAG service — build FROM image nền dùng chung (docker/ai-base): torch/
# torchvision CUDA 12.4 + numpy + libgomp1 + curl đã có sẵn (torch dùng cho
# embedding local Qwen3-Embedding-0.6B; curl cho HEALTHCHECK).
#
# Base KHÔNG có thư viện GL/OpenCV của gaze — chatbot không cần.
ARG AI_BASE=ghcr.io/manh1504/eyelearning-ai-base:latest
FROM ${AI_BASE}

WORKDIR /app

# Cài dependencies trước để tận dụng cache layer. Assert ngay trong build để
# phát hiện sớm nếu pip chọn nhầm wheel torch (CPU thay vì cu124).
COPY requirements.txt requirements-embedding.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-embedding.txt \
    && pip check \
    && python -c "import torch; assert torch.version.cuda == '12.4', torch.version.cuda"

# Chạy bằng user không phải root. Tạo sẵn /app/weights thuộc appuser để volume
# `chatbot-weights` (mount đè lên đây) ghi được weights embedding lúc runtime.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/weights \
    && chown appuser:appuser /app/weights

COPY --chown=appuser:appuser . .

RUN chmod +x entrypoint.sh

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
