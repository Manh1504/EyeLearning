# ---- 1. Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. Build (Next.js 16, output: standalone) ----
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=2048
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public vars (được inlay vào client bundle + dùng cho rewrites).
# Production: trỏ về tên service nội bộ trong mạng docker.
ARG NEXT_PUBLIC_API_URL=http://backend:8001
ARG NEXT_PUBLIC_GAZE_URL=http://gaze:8000
ARG NEXT_PUBLIC_DEMO=0
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GAZE_URL=$NEXT_PUBLIC_GAZE_URL
ENV NEXT_PUBLIC_DEMO=$NEXT_PUBLIC_DEMO
# Bật standalone CHỈ trong image Docker (Vercel không hỗ trợ standalone).
ENV NEXT_STANDALONE=1

RUN npm run build

# ---- 3. Runner (standalone) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# server.js + node_modules tối thiểu do Next trace ra.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# static assets + public phải copy thủ công (Next không tự gom).
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# server.js là entrypoint do Next sinh (output: standalone).
CMD ["node", "server.js"]
