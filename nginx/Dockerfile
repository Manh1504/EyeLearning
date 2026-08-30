FROM nginx:1.27-alpine

# Cần openssl để sinh self-signed dự phòng khi chưa có cert thật.
RUN apk add --no-cache openssl

# Config + entrypoint (đảm bảo nginx luôn start dù cert thật chưa sẵn).
COPY app.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443
ENTRYPOINT ["/entrypoint.sh"]
