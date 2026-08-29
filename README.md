# FridgeBoard

家庭冰箱库存看板。常规 PWA 入口：<https://fridge.flycn.fyi/>；Kindle 入口：
<https://kindle.flycn.fyi/>。

## 项目文档

日常开发从 [docs/README.md](docs/README.md) 开始；其中包含当前产品需求、回归矩阵、维护计划、设计基线和架构文档入口。

## 日常安装

前置条件：

- Android：Node.js 22+、Android SDK、JDK 21，手机已开启 USB 调试并授权。
- iOS：macOS、Xcode、CocoaPods，真机已配置开发者团队，或已启动模拟器。

在仓库根目录执行：

```bash
# 构建、安装并启动 Android Debug 版本
npm run install:android

# 构建、安装并启动 iOS Debug 版本
npm run install:ios
```

首次在 iPhone 真机运行，需要在 Xcode 打开 `frontend/ios/App/App.xcodeproj`，为 `App` target
选择 Apple Developer Team，并在手机上信任开发者证书。

## 本地开发

后端使用 Python 3.12+ 和 [uv](https://docs.astral.sh/uv/)。前端开发服务器默认监听
`http://localhost:7001`。VS Code 可直接按 `F5` 选择“FridgeBoard：全栈调试”。

## 配置与发布

复制 `.env.example` 作为配置参考。密钥只能由部署环境或本机受保护文件提供，不能提交
`.env`、数据库、Token、证书或 keystore。

生产环境使用单容器、单 Uvicorn 进程和 SQLite；发布脚本每次从本机受保护的 `.env.prod` 读取
生产配置，并覆盖服务器 `/opt/fridgeboard/.env` 后再重建容器。部署前确认 `.env.prod`、数据卷
及 Docker external network `proxy` 已准备好。Android 正式 APK 通过 GitHub Release 发布，
iOS IPA 由本地脚本构建。

## 高级命令

日常不需要执行以下命令；仅在开发、排障、构建正式包或发布时使用。

| 用途 | 命令 |
| --- | --- |
| 启动后端热重载 | `uv run uvicorn fridgeboard.main:app --app-dir backend --reload` |
| 安装前端依赖 | `npm ci --prefix frontend` |
| 启动前端开发服务器 | `npm run --prefix frontend dev` |
| Android 指定设备 | `npm run install:android -- --target <设备序列号>` |
| iOS 指定设备 | `npm run install:ios -- --target <UDID>` |
| Android Debug APK | `npm run --prefix frontend build:android` |
| Android 正式 APK | `npm run --prefix frontend build:android:release` |
| iOS 正式 IPA | `npm run --prefix frontend build:ios:release` |
| 前端 lint / 测试 / 构建 | `npm run --prefix frontend lint` / `test` / `build` |
| 后端检查 / 测试 | `uv run ruff check backend` / `uv run pytest` |
| Docker 构建 | `docker build --tag fridgeboard:local .` |
| 发布生产环境（同步 `.env.prod`） | `scripts/deploy-image.sh` |
| 发布前检查参数 | `scripts/deploy-image.sh --dry-run` |
| 查看 Android 设备 | `adb devices` |

所有 Android 主包构建都必须使用线上同一正式签名；找不到签名材料时构建直接失败，禁止回退到
Android Debug 证书。Gradle 会自动查找仓库外的 `~/secure/fridgeboard-keystore.properties`，也可用
环境变量覆盖路径。推送 `v*` tag 会触发 GitHub Actions 的 Android Release workflow；不要把密钥、证书或生产数据放入 Git。

### Android 签名材料位置

当前开发机的 Android 正式签名材料位于仓库外的受保护目录：

- Keystore：`/Users/jason/secure/fridgeboard-release.jks`
- Gradle 配置：`/Users/jason/secure/fridgeboard-keystore.properties`
- Alias：`fridgeboard`
- SHA-256 指纹：`BC:C7:26:27:D1:43:17:64:75:45:4F:1D:D8:3B:B5:36:AB:31:66:24:A0:06:C9:F9:13:93:23:82:64:0E:9D:0A`

本地构建会自动查找上述受保护配置文件；只有配置文件不在该路径时才需要显式覆盖路径。不要把密码写入命令历史、日志或 Git：

```bash
FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES=/Users/jason/secure/fridgeboard-keystore.properties \
  npm run --prefix frontend build:android
```

正式发布的 GitHub Actions 使用仓库 Secrets，不读取上述本机路径。更换开发机时，先将 keystore
安全传输到受保护目录，再用 `keytool -list -v` 核对 alias 和 SHA-256 指纹。
