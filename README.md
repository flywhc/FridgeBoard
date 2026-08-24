# FridgeBoard

家庭冰箱库存看板：手机 PWA 负责管理，冰箱端显示设备负责低频展示。Kindle 浏览器只是可选的典型设备示例。当前已完成 P3：flycn
所有者登录、冰箱端兼容绑定、短效手机配对与可撤销设备凭证。

Kindle 专用入口为 `https://kindle.flycn.fyi/`，根路径直接提供与
`https://fridge.flycn.fyi/fridge` 相同的兼容页面；常规 PWA 入口仍为
`https://fridge.flycn.fyi/`。

## 本地开发

前置条件：Python 3.12+、[uv](https://docs.astral.sh/uv/)、Node.js 22+ 与 npm。

```bash
uv run uvicorn fridgeboard.main:app --app-dir backend --reload
npm ci --prefix frontend
npm run --prefix frontend dev
```

后端监听 `0.0.0.0:8000`，健康检查为 `GET /healthz`；前端开发服务器监听 `0.0.0.0:7001`。在手机或其他设备上，请使用电脑的局域网 IP 访问，例如 `http://192.168.1.20:7001`，不要把 `0.0.0.0` 当作二维码地址。Kindle 页边距 Spike 的短地址是 `http://电脑局域网IP:7001/k`。

项目根目录的 `.env` 会由直接启动的 FastAPI 应用读取。在 VS Code 中按 `F5` 选择
`FridgeBoard：全栈调试` 时会自动加载 `.env`、执行数据库迁移、启动 Vite 并打开前端；
修改 `.env` 后需停止并重新按 `F5`，不能只刷新浏览器。开发环境生成的冰箱端配对链接统一指向
前端本机可用 `http://127.0.0.1:5173`，局域网设备请使用电脑的局域网 IP。二维码和 SSO 回调会根据当前浏览器访问地址自动生成。

手动启动时也可以显式加载同一份配置：

```bash
set -a; source .env; set +a
uv run uvicorn fridgeboard.main:app --app-dir backend --reload
```

## Android APK 构建与部署

前置条件：Node.js 22+、Android SDK、JDK 21，以及已开启 USB 调试并授权本机的 Android 手机。

推荐在仓库根目录执行一条命令完成前端构建、Capacitor 同步、Android Debug 构建、安装并启动：

```bash
npm run --prefix frontend install:android:debug
```

如果连接了多台设备，可以把设备序列号传给 Capacitor：

```bash
npm run --prefix frontend install:android:debug -- --target <设备序列号>
```

该命令等价于先执行 `npm run build`，再执行 `npx cap run android`；后者会自动完成
`sync`、Gradle 构建、ADB 安装和启动。

一键命令使用 Gradle 原始 Debug APK 部署，产物位于：

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

如果需要项目命名的 `FridgeBoard-debug.apk` 文件而不直接部署设备，仍可执行：

```bash
npm run --prefix frontend build
(cd frontend && npx cap sync android)
npm run --prefix frontend build:android
```

该流程会额外复制生成 `frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk`。

以下是手动安装已经生成的 `FridgeBoard-debug.apk` 的备用流程：

连接手机并确认设备已被 ADB 识别：

```bash
adb devices
```

安装并启动应用：

```bash
adb install -r frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk
adb shell am start -n com.fridgeboard.app/.MainActivity
```

如果连接了多台设备，使用设备序列号安装和启动：

```bash
adb -s <设备序列号> install -r frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk
adb -s <设备序列号> shell am start -n com.fridgeboard.app/.MainActivity
```

卸载 Debug 版本：

```bash
adb uninstall com.fridgeboard.app
```

## iOS 本地构建与部署

前置条件：macOS、Xcode、CocoaPods，以及已通过 Xcode 配置开发团队的 iPhone 或已启动的 iPhone 模拟器。

在仓库根目录执行一条命令完成前端构建、Capacitor 同步、iOS Debug 构建、安装并启动：

```bash
npm run --prefix frontend install:ios:debug
```

指定 iOS 模拟器或真机的 UDID：

```bash
npm run --prefix frontend install:ios:debug -- --target <设备或模拟器 UDID>
```

首次真机运行前，在 Xcode 打开 `frontend/ios/App/App.xcodeproj`，为 `App` target
在 `Signing & Capabilities` 中选择 Apple Developer Team；iPhone 需要解锁、开启开发者模式并信任开发者证书。
`npx cap run ios` 会自动执行 `sync`、Xcode Debug 构建、安装和启动。

### 发布签名 APK/IPA

本项目当前不上传 Google Play、Apple App Store 或 TestFlight。Android 正式 APK 通过当前公开仓库的 GitHub Release 发布；iOS 仍由本地脚本构建 IPA。

Android 需要 JDK 21、Android SDK 和签名 keystore；iOS 需要 macOS/Xcode、Apple Team ID 及 ad-hoc/enterprise/development 分发签名环境。签名文件只通过环境变量或本机受保护文件注入：

```bash
# 构建 Android 签名 APK
FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES=/secure/fridgeboard/keystore.properties \
  scripts/mobile-release.sh build --platform android \
  --version 0.1.0 --build-number 1800000000

# 构建 iOS IPA（默认 ad-hoc）
FRIDGEBOARD_IOS_TEAM_ID=ABCDE12345 \
  FRIDGEBOARD_ALLOW_PROVISIONING_UPDATES=1 \
  scripts/mobile-release.sh build --platform ios \
  --version 0.1.0 --build-number 1800000000

# 正式发布：推送 v0.1.0 tag，由 GitHub Actions 构建并上传当前仓库 Release
git tag v0.1.0
git push origin v0.1.0
```

产物位于 `output/mobile-release/`。脚本会校验包名 `com.fridgeboard.app`、版本号和构建号；未签名 archive、模拟器 `.app` 和 Debug APK 不属于发布产物。Android Release 文件名包含版本号和 `versionCode`。

### GitHub Actions 移动发布

公开仓库使用 GitHub-hosted runner，不需要 self-hosted runner。推送 `v*` tag 后，`Android Release` workflow 会读取 tag 版本、使用 `1700000000 + GitHub Actions run number` 作为 `versionCode`，构建签名 APK、校验包内元数据并上传到当前仓库的 GitHub Release；上传后还会检查 Release asset 的 SHA-256 digest。既有 `Mobile Release` workflow 继续负责手动 iOS 构建和可选 flycn 门户发布。

仓库需要配置以下 Actions Secrets：

| Secret | 用途 |
| --- | --- |
| `FRIDGEBOARD_ANDROID_KEYSTORE_BASE64` | Android release keystore 的 base64 内容 |
| `FRIDGEBOARD_ANDROID_KEY_ALIAS` | Android keystore alias |
| `FRIDGEBOARD_ANDROID_KEY_PASSWORD` | Android key 密码 |
| `FRIDGEBOARD_ANDROID_STORE_PASSWORD` | Android keystore 密码；不设置时复用 key 密码 |
| `FRIDGEBOARD_IOS_CERTIFICATE_BASE64` | Apple 分发证书 `.p12` 的 base64 内容 |
| `FRIDGEBOARD_IOS_CERTIFICATE_PASSWORD` | `.p12` 密码 |
| `FRIDGEBOARD_IOS_PROVISIONING_PROFILE_BASE64` | `com.fridgeboard.app` 的 ad-hoc/enterprise/development profile |
| `FRIDGEBOARD_IOS_KEYCHAIN_PASSWORD` | GitHub runner 临时 keychain 密码 |
| `FRIDGEBOARD_IOS_TEAM_ID` | Apple Developer Team ID |
| 无额外发布 Token | 使用 Actions 内置 `GITHUB_TOKEN` 上传当前仓库 Release |

workflow 声明 `contents: write`，仅将签名材料从 Secrets 注入构建环境；GitHub Token 不进入 APK 或 artifact。APK 更新检查读取当前仓库的公开 GitHub Releases API，不需要用户登录或发布凭据。

## 质量检查

```bash
uv run ruff check backend
uv run pytest
npm ci --prefix frontend
npm run --prefix frontend lint
npm run --prefix frontend build
docker build --tag fridgeboard:local .
```

## 配置与部署

复制 `.env.example` 作为部署环境变量的参考，实际密钥只能由部署环境提供，不能提交到仓库。生产环境通过 `compose.yaml` 使用名为 `proxy` 的既有外部 Docker 网络，并把 SQLite 数据保存在 `fridgeboard-data` 卷；应用不直接暴露主机端口。

`Dockerfile` 构建 React/Vite 产物并由同一 FastAPI 进程提供 API 与静态资源。生产部署固定单副本、单 Uvicorn 进程，符合 SQLite WAL 的写入约束。容器启动时会先执行一次 Alembic 前向迁移；迁移失败时容器不会开始提供 HTTP 服务。

生产静态资源压缩由 Nginx Proxy Manager 在边缘处理，FridgeBoard 应用本身不重复压缩。NPM 的
`/data/nginx/custom/server_proxy.conf` 配置了 256 bytes 最小响应长度，并覆盖 JavaScript、CSS、JSON、XML
和 SVG 等文本类型；修改后必须先执行 `nginx -t` 再 reload。该文件位于 NPM 数据卷中，变更前应创建带时间戳的备份。

后端依赖由 `uv.lock` 锁定。更新 Python 依赖后，使用 `uv export --locked --no-dev --no-emit-project --format requirements-txt --output-file requirements.lock` 刷新容器安装清单；CI 会检查锁文件有效性。

P3 生产环境还需配置 `FRIDGEBOARD_PUBLIC_BASE_URL`、`FRIDGEBOARD_FLYCN_AUTHORIZE_URL`、
`FRIDGEBOARD_FLYCN_EXCHANGE_URL` 与 `FRIDGEBOARD_FLYCN_CLIENT_SECRET`。其中共享密钥必须与
flycn 的 `FRIDGEBOARD_CLIENT_SECRET` 相同；本地手工演示可临时设置
`FRIDGEBOARD_DEVELOPMENT_OWNER_USER_ID`，生产环境不得设置该变量。

P13.4 的 App Links/Universal Links 还需由正式发布环境注入
`FRIDGEBOARD_ANDROID_SHA256_CERT_FINGERPRINTS` 和 `FRIDGEBOARD_IOS_TEAM_ID`。
服务端会据此提供 `/.well-known/assetlinks.json` 和
`/.well-known/apple-app-site-association`；未配置时返回空关联，公开二维码和登录地址仍
继续按 PWA fallback 工作。禁止把 debug 指纹、Team ID 占位值或签名密钥提交到仓库。

若部署在受信任的 OpenWrt 私有局域网，设置 `FRIDGEBOARD_LOCAL_OWNER_USER_ID` 后，手机无需
flycn 登录即可创建冰箱、领取冰箱端首次开机二维码并管理设备。该模式把局域网访问视为
所有者权限，不能暴露到公网，也不要与 flycn SSO 配置同时使用。

### 发布最新版本

`scripts/deploy-image.sh` 默认读取仓库根目录的本地 `.deploy.env`，通过生产固定 IP
`107.174.152.245` 的 SSH 把源码归档传到服务器并在服务器上重新构建容器，不依赖 GHCR 或
Token。发布脚本会拒绝对 `flycn.fyi` 建立 SSH 连接。`.deploy.env` 已被
`.gitignore` 忽略，只存在本机。
脚本通过 SSH 在 `/opt/fridgeboard` 执行，不上传源码、不覆盖服务器 `.env`，并在重建前用
SQLite 在线备份创建 `/data/fridgeboard.db.backup-时间戳`。默认发布当前 `HEAD`，也可以
通过 `--ref` 指定提交或分支。

每次正式发布时，脚本会自动生成 `yymmddhhMMss` 格式的 release 号，注入本次发布归档的
前端构建，并在“关于与帮助”页面显示；该过程不会修改本地工作区或语义版本号。

内置物品分类和 SVG 图标位于 `backend/fridgeboard/assets/item_catalog/`，会随 Git 跟踪和
`git archive` 一起进入 Docker 构建上下文，不需要逐个手工上传。`.gitignore` 已明确放行该
目录；发布脚本在传输前会检查 `catalog.json` 声明的每个资产都存在于待发布归档中，缺失时
直接停止发布。

```bash
# 默认通过 .deploy.env 中的生产固定 IP 发布；不会连接 flycn.fyi。
scripts/deploy-image.sh
```

也可以显式指定生产固定 IP 发布：

```bash
scripts/deploy-image.sh --host 107.174.152.245
```

发布前先检查参数而不连接服务器：

```bash
scripts/deploy-image.sh --dry-run
```

也可以发布指定提交或使用其他本地配置文件：

```bash
scripts/deploy-image.sh --ref main
scripts/deploy-image.sh --config path/to/deploy.env
```
命令行选项会覆盖配置文件中的同名值。

脚本不会自动回滚已启动的容器；发布失败时保留数据库备份和容器日志，需根据日志处理后再
重新发布。生产 `.env`、`fridgeboard-data` 卷及 Docker external network `proxy` 必须已在
服务器上配置好。

生产环境的 Compose 使用服务器 `/opt/fridgeboard/.env`，不会自动读取本机 `.env.prod`；本机 `.env.prod`
只是受控的部署配置模板，发布脚本也不会覆盖服务器密钥。修改模型或输出上限后，需在服务器 `.env`
中同步配置，再重建容器。生产错误日志由 `FRIDGEBOARD_LOG_FILE` 指向 `/data/logs/fridgeboard.log`，按 UTC 日界线或
单文件 10 MiB 轮换，保留当前文件和最近七个归档；Docker 标准输出同时限制单文件 10 MiB、最多 3 个文件。Agnes
识别失败日志会保留脱敏的上游状态、模型、耗时、`finish_reason`、响应长度和有界响应正文，
不记录 Token、Cookie、Authorization、原始图片或 base64。
