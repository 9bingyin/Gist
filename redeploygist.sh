#!/bin/bash

# 配置区域：请修改为您的实际路径
IMAGE_LOAD_PATH="/volume1/your_path_here/gist-rss.tar"
COMPOSE_DIR="/volume1/docker/Gist"

echo "开始清理名为包含 'gist' 的容器..."

# 1. 终止并删除名称中含有 gist 的容器
CONTAINERS=$(docker ps -a --format "{{.Names}}" | grep "gist")

for container in $CONTAINERS; do
    echo "正在停止容器: $container"
    docker stop $container
    echo "正在删除容器: $container"
    docker rm $container
done

# 2. 删除对应的镜像 (假设镜像名称也包含 gist)
IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "gist-rss")

if [ -n "$IMAGES" ]; then
    echo "正在删除镜像: $IMAGES"
    docker rmi $IMAGES
else
    echo "未找到需要删除的 gist 镜像"
fi

# 3. 重新加载镜像
if [ -f "$IMAGE_LOAD_PATH" ]; then
    echo "正在加载镜像: $IMAGE_LOAD_PATH"
    docker load -i "$IMAGE_LOAD_PATH"
else
    echo "错误: 镜像文件 $IMAGE_LOAD_PATH 不存在"
    exit 1
fi

# 4. 重新部署
if [ -d "$COMPOSE_DIR" ]; then
    echo "正在 $COMPOSE_DIR 目录执行 docker-compose 部署..."
    cd "$COMPOSE_DIR" || exit
    docker-compose down
    docker-compose up -d
    echo "部署完成"
else
    echo "错误: 目录 $COMPOSE_DIR 不存在"
    exit 1
fi
