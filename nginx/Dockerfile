FROM nginx:1.27-alpine

# Cần openssl để sinh self-signed dự phòng khi chưa có cert thật.
RUN apk add --no-cache openssl

# Config + entrypoint (đảm bảo nginx luôn start dù cert thật chưa sẵn).
COPY app.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443

# Healthcheck đánh endpoint nội bộ (IPv4 127.0.0.1) không phụ thuộc upstream.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/nginx-health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
