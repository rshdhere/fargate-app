# syntax=docker/dockerfile:1.7
# Multi-stage build for AWS Fargate (linux/amd64 by default).
# Build for Fargate (amd64) on Apple Silicon:
#   docker buildx build --platform linux/amd64 -t todo-backend .

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

# Native build deps needed by bcrypt; removed after install to keep image small.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
    && npm cache clean --force \
    && apk del .build-deps

COPY --from=builder /app/dist ./dist

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["node", "dist/index.js"]
