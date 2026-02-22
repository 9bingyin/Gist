# Stage 1: Frontend Builder
FROM oven/bun:1.3.9 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# Stage 2: Backend Builder
FROM golang:1.26.0 AS backend-builder
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -v -o gist-server ./cmd/server/main.go

# Stage 3: Final Image
FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata su-exec \
    && addgroup -g 1000 -S gist \
    && adduser -u 1000 -G gist -S -h /app gist

COPY --from=backend-builder /app/backend/gist-server .
COPY --from=frontend-builder /app/frontend/dist ./static
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/data && chown -R gist:gist /app

ENV GIST_ADDR=:8080
ENV GIST_DATA_DIR=/app/data
ENV GIST_STATIC_DIR=/app/static
ENV GIST_LOG_LEVEL=info
ENV TZ=Asia/Shanghai

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["./gist-server"]
