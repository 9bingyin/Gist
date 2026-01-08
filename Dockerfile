# Stage 1: Frontend Builder
FROM oven/bun:alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
# 移除 --frozen-lockfile 以防止由于版本微差导致的构建失败，并去掉错误的 cache clean
RUN bun install
COPY frontend/ ./
RUN bun run build

# Stage 2: Backend Builder
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app/backend
RUN apk add --no-cache git
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -v -o gist-server ./cmd/server/main.go

# Stage 3: Final Image
FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata && \
    rm -rf /var/cache/apk/*
    
COPY --from=backend-builder /app/backend/gist-server .
COPY --from=frontend-builder /app/frontend/dist ./static
RUN mkdir -p /app/data

ENV GIST_ADDR=:8080
ENV GIST_DATA_DIR=/app/data
ENV GIST_STATIC_DIR=/app/static
ENV GIST_LOG_LEVEL=info
ENV TZ=Asia/Shanghai

EXPOSE 8080
CMD ["./gist-server"]
