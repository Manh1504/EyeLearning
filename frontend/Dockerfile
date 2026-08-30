# ---- 1. Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. Build (Next.js 16) ----
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=2048
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public vars (bị inlay vào client bundle: rewrite + WebSocket gaze).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GAZE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GAZE_URL=$NEXT_PUBLIC_GAZE_URL

RUN npm run build

# ---- 3. Runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

USER nextjs
EXPOSE 3000

CMD ["npm", "run", "start"]
