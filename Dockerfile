# Stage 1: Frontend Builder
FROM oven/bun:1.3.8 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# Stage 2: Backend Builder
FROM golang:1.25.7 AS backend-builder
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -v -o gist-server ./cmd/server/main.go

# Stage 3: Final Image
FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S gist \
    && adduser -S -G gist -h /app gist

COPY --from=backend-builder --chown=gist:gist /app/backend/gist-server .
COPY --from=frontend-builder --chown=gist:gist /app/frontend/dist ./static
RUN mkdir -p /app/data && chown -R gist:gist /app

ENV GIST_ADDR=:8080
ENV GIST_DATA_DIR=/app/data
ENV GIST_STATIC_DIR=/app/static
ENV GIST_LOG_LEVEL=info
ENV TZ=Asia/Shanghai

USER gist

EXPOSE 8080
CMD ["./gist-server"]
