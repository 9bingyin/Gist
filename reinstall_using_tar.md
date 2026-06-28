1. 在release中下载编译好的镜像包
2. 上传tar文件和`redeploygist.sh`和到群晖某个目录下
3. 更改`redeploygist.sh`文件中的`IMAGE_LOAD_PATH`的路径
4. 在putty中cd到`redeploygist.sh`所在目录
5. 运行`chmod +x redeploygist.sh` ; 这是给`redeploygist.sh`赋予运行权限
6. 运行`./redeploygist.sh`执行命令，就能实现gist的重装。
