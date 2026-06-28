# 1. 编译当前工程
Write-Host "正在构建 Docker 镜像..." -ForegroundColor Cyan
docker build -f docker/Dockerfile -t gist-rss:custom .

# 2. 检查并删除旧镜像文件，生成新文件
$tarFile = Join-Path $PWD.Path "gist-rss.tar"

if (Test-Path $tarFile) {
    Write-Host "发现旧文件，正在删除: $tarFile" -ForegroundColor Yellow
    Remove-Item $tarFile -Force
}

Write-Host "正在导出镜像到 $tarFile..." -ForegroundColor Cyan
docker save -o $tarFile gist-rss:custom