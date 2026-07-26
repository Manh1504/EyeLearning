# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---- Runtime stage (nginx) ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/20-write-runtime-config.sh /docker-entrypoint.d/20-write-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/20-write-runtime-config.sh

# Backend API để nginx reverse-proxy tới (đặt tên service trong docker-compose, vd "web:8000")
ENV API_UPSTREAM=web:8000
# Base URL mà browser sẽ gọi cho web API — để trống nghĩa là dùng relative path (qua nginx proxy ở trên)
ENV RUNTIME_API_BASE=

EXPOSE 80
