# Shared build toolchain
FROM nixos/nix:2.36.0 AS toolchain
ENV NIX_CONFIG="experimental-features = nix-command flakes"
WORKDIR /toolchain
COPY flake.nix flake.lock ./
RUN nix develop --no-update-lock-file path:/toolchain#ci --command true

# Frontend builder
FROM toolchain AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN nix develop --no-update-lock-file path:/toolchain#ci --command bun install --frozen-lockfile
COPY frontend/ ./
RUN nix develop --no-update-lock-file path:/toolchain#ci --command bun run build

# Backend builder
FROM toolchain AS backend-builder
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN nix develop --no-update-lock-file path:/toolchain#ci --command go mod download
COPY backend/ ./
RUN nix develop --no-update-lock-file path:/toolchain#ci --command \
    env CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -v -o gist-server ./cmd/server

# Alpine runtime
FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata su-exec \
    && addgroup -g 1000 -S gist \
    && adduser -u 1000 -G gist -S -h /app gist

COPY --from=backend-builder /app/backend/gist-server .
COPY --from=frontend-builder /app/frontend/dist ./static
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/data && chown -R gist:gist /app

ENV GIST_ADDR=:8080
ENV GIST_DATA_DIR=/app/data
ENV GIST_STATIC_DIR=/app/static
ENV GIST_LOG_LEVEL=info
ENV TZ=Asia/Shanghai

EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
CMD ["./gist-server"]
