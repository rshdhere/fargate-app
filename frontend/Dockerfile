# syntax=docker/dockerfile:1.7
# Multi-stage build for AWS Fargate (linux/amd64 by default).
# Build for Fargate (amd64) on Apple Silicon:
#   docker buildx build --platform linux/amd64 \
#     --build-arg VITE_API_URL=https://api.example.com \
#     -t todo-frontend .

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

# VITE_* envs must be present at build time because Vite inlines them
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

RUN rm -rf ./* /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist ./

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:5173/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
