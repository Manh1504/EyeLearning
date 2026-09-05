FROM nginx:1.27-alpine

# Config thuần HTTP nội bộ (TLS do Cloudflare Edge lo, cloudflared forward tới nginx:80).
COPY default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Healthcheck đánh endpoint nội bộ (IPv4 127.0.0.1) không phụ thuộc upstream.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/nginx-health || exit 1
