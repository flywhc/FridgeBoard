# FridgeBoard 手机端 APK/IPA 与 PWA 部署设计

状态：P13 移动端能力、构建、签名和发布流程已实施并验证
更新日期：2026-08-29
关联决策：[ADR-0004：Capacitor 原生移动端与 PWA 共存](architecture/adr/0004-capacitor-mobile-and-pwa.md)

## 1. 目标和非目标

### 目标

- 保留现有 PWA 作为免安装、同域、快速发布的 Web 入口。
- 增加 Android 签名 APK；Android APK 发布到当前公开仓库的 GitHub Release。iOS 可分发 IPA 继续沿用现有本地签名流程。
- Android/iOS App 首屏 HTML、JavaScript、CSS、图标等静态应用资源从安装包加载，不依赖浏览器已有 Cache Storage。
- 在共享 React/Vite 页面基础上增加原生安全存储、相机/扫码、系统分享、推送和平台返回/边沿手势。
- 保持 FastAPI、SQLite、单容器和现有业务 API 为唯一服务端业务边界。

### 非目标

- 不重写为 React Native 或原生 UI。
- 不引入 Electron/Chromium 运行时。
- 不为 Android/iOS 复制完整业务 API 或维护两套业务页面。
- 第一阶段不承诺库存和食谱离线读写；包内静态资源可离线加载不等于业务数据可离线操作。
- 不以 App 内 WebView 的跨源 Cookie 兼容性作为长期认证方案。
- 当前阶段不接入 Google Play、Apple App Store 或 TestFlight；门户侧载仍需符合 Android/iOS 签名规则。

## 2. 现状基线

- 前端：React + TypeScript + Vite，生产 `frontend/dist` 当前约 1.1 MB。
- PWA：[`frontend/src/main.tsx`](../frontend/src/main.tsx) 注册 [`frontend/public/sw.js`](../frontend/public/sw.js)，manifest 和应用壳缓存已存在。
- PWA 启动由缓存应用壳立即返回静态 splash；Service Worker 后台刷新 `index.html`，发现壳内容变化时通知页面 reload。release 同步在 splash 阶段显示“正在更新...”，检查、注册或清理失败均放弃本次升级并继续进入主界面。
- API：[`frontend/src/appApi.ts`](../frontend/src/appApi.ts) 使用同域相对路径 `/api`、`credentials: 'same-origin'`、SSE 和请求超时。
- 认证：所有者主要使用 `fb_owner_session` HttpOnly Cookie；PWA/设备凭证使用 `fb_device_credentials` HttpOnly Cookie，同时后端已支持 Bearer 设备凭证。
- 配对：二维码使用公开地址中的一次性/短效 token；消费后前端清理地址栏和 sessionStorage 中的配对意图。
- 手势：[`frontend/src/edgeSwipeBack.ts`](../frontend/src/edgeSwipeBack.ts) 已有页面级右滑返回判定，页面导航由 React 状态管理。
- 部署：FastAPI 与前端构建产物同一容器、同一公开域名提供；生产固定单进程、单副本和 SQLite。

## 3. 总体架构

```text
                 ┌────────────────────────────┐
                 │ FastAPI + SQLite           │
                 │ https://fridge.flycn.fyi   │
                 │ /api + PWA static           │
                 └──────────────┬─────────────┘
                                │ HTTPS API
                 ┌──────────────┴─────────────┐
                 │                            │
       Browser PWA / Safari / Chrome       Capacitor App
       remote static + SW + Cookie         local dist + native shell
                                               │
                                  system browser SSO / deep link
                                  Keychain / Keystore Bearer token
```

### 3.1 实际目录

```text
frontend/                    # React/Vite/PWA 与 Capacitor 工程根目录
  capacitor.config.ts
  android/
  ios/
  dist/                      # 构建后同步到原生包的静态资源
docs/mobile-deployment-design.md
docs/architecture/adr/0004-capacitor-mobile-and-pwa.md
```

本次 P13.1 选择 `frontend/` 作为 Capacitor 工程根目录，以复用现有 Vite `dist` 和 npm 锁文件。业务源码仍只有一份，Android/iOS 目录只保存原生构建和配置资产；原生生成的 `public` 资源目录按平台 `.gitignore` 忽略，由 `npx cap sync` 生成。

### 3.2 P13.1 工具链基线

- Capacitor：`8.5.0`（CLI、core、Android、iOS）；Node `v24.14.0`；npm `11.9.0`。
- Android：Gradle Wrapper `8.14.3`，Android Gradle Plugin `8.13.0`，`minSdk 24`、`compileSdk 36`、`targetSdk 36`；包名 `com.fridgeboard.app`。
- iOS：Xcode `26.6`（Build `17F113`），Capacitor Swift Package `8.5.0`，Deployment Target `iOS 15.0`；Bundle ID `com.fridgeboard.app`。
- 当前构建资源：`frontend/dist` 约 `1.1 MB`；iOS Simulator Debug `.app` 输出于 `/tmp/fridgeboard-derived/Build/Products/Debug-iphonesimulator/App.app`。
- 已验证命令：`npm run build`、`npx cap sync`、`xcodebuild -list -project ios/App/App.xcodeproj`、`xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -derivedDataPath /tmp/fridgeboard-derived CODE_SIGNING_ALLOWED=NO build`。
- Android 构建：不在仓库写入 `org.gradle.java.home` 或任何机器绝对路径；`frontend/scripts/build-android.sh` 优先使用 `JAVA_HOME`，macOS 自动发现系统 JDK 21 或 Android Studio JBR，Android Studio 用户也可在 Gradle JDK 设置中选择 21，CI 只需注入标准 `JAVA_HOME`。脚本通过 `npm run --prefix frontend build:android` 调用。
- 已验证：Android `assembleDebug`、`testDebugUnitTest` 和 `assembleDebugAndroidTest` 均通过；前端原生目录已加入 ESLint 忽略，生成的 instrumentation test 包名与 `com.fridgeboard.app` 一致；Java 25 shell 下脚本可自动发现本机 Android Studio JBR Java 21。
- 未验证：Android 真机/模拟器运行、connected instrumentation、AAB、iOS archive/IPA、飞行模式静态壳、相机权限、系统返回手势、远程 API 连通和正式签名。

## 4. 前端运行时边界

新增一个小型运行时适配层，禁止让业务组件到处判断平台：

```ts
type AppRuntime = 'web' | 'capacitor'

type RuntimeConfig = {
  runtime: AppRuntime
  apiBaseUrl: string
}
```

### PWA

- `runtime = web`。
- `apiBaseUrl = ''`，保留现有相对 `/api` 请求和同源 Cookie。
- 注册 Service Worker。
- `beforeinstallprompt`、manifest 和 PWA 安装引导继续有效。

### Capacitor

- `runtime = capacitor`，通过 Capacitor 能力检测而非 User-Agent 判断。
- `apiBaseUrl` 来自受控构建配置或原生注入，生产只允许 HTTPS 公开 API 地址。
- 不注册 PWA Service Worker；资源由 WebView 的本地应用 Origin 加载。
- `request()` 和 `streamRequest()` 统一拼接 API 基地址，保留现有超时、SSE、错误和取消语义。
- 原生能力通过 `nativeBridge` 适配层调用；浏览器环境提供 no-op 或 Web API fallback。

### 静态资源策略

- 发行构建先执行现有 `npm run --prefix frontend build`，再同步 `frontend/dist` 到 Capacitor `webDir`。
- 不把生产 API 数据预渲染进包内，避免安装包携带过期家庭数据。
- 不把 Token、Cookie、`.env`、数据库或生产数据复制进包内。
- App 内资源更新依赖重新发布 APK/IPA；不得未经审核通过远程下载并执行新的 JavaScript 作为版本更新机制。
- 原生包页面若需打开外部网页，只允许显式白名单，并交给系统浏览器处理登录、支持和隐私页面；Android 登录页优先使用用户默认浏览器的 Custom Tabs，避免绑定单一浏览器或触发同域 App Link 候选选择框。

## 5. 认证和会话设计

这是实施中风险最高的部分，必须先做 Spike 和安全评审。

### 5.1 PWA 保持不变

- 浏览器访问公开站点，使用同源 HttpOnly Cookie。
- 现有 owner SSO 回调、PWA 配对、设备撤销和 `same-origin` 请求继续工作。
- PWA 不读取或复制 HttpOnly Cookie 到 JavaScript。

### 5.2 App 认证目标

App 需要两个可能的身份场景：

1. **所有者管理模式**：系统浏览器完成 flycn SSO，App 获得可撤销的 FridgeBoard App 管理会话。
2. **日常设备模式**：从冰箱端二维码领取现有 PWA 设备凭证，App 以 Bearer 方式访问日常接口。

推荐的协议边界：

```text
App ──打开系统浏览器──> GET /api/auth/login?client=mobile&redirect_uri=fridgeboard://mobile/auth/callback
App <── App 专属 URI ── fridgeboard://mobile/auth/callback?code=...&state=...
App ──一次性 code + PKCE/state──> POST /api/auth/mobile/exchange
App <──短期 access token + 可轮换 refresh token──
```

具体是否直接复用 `OwnerSession`，要由实现 Spike 根据当前服务端会话模型和撤销需求确认。不能把现有 30 天 owner Cookie 原样塞进 WebView，也不能把长期 Bearer token 放入 localStorage、URL 或日志。

### 5.3 凭证存储和请求

- Android：使用 Android Keystore 保护的安全存储；iOS：使用 Keychain。
- 前端只通过原生桥接获取短期访问令牌，内存中使用，退出/撤销/401 时清除。
- refresh token 只在原生安全存储中轮换；服务端需要记录客户端会话、撤销时间、最近使用时间和设备标签。
- App API 请求使用 `Authorization: Bearer ...`，PWA 请求继续使用 Cookie。
- 令牌脱敏规则必须覆盖 URL、query、请求头、异常信息、Native bridge 调用和 SSE 日志。
- App 卸载、退出登录、服务端撤销、刷新失败和配对失败后的清理行为要有自动化测试。

### 5.4 配对

- QR 永远编码 `https://fridge.flycn.fyi/pair?...`，不编码 `capacitor://`、`tauri://` 或设备本地地址。
- App 通过 Universal Links/App Links 接收配对链接；浏览器/PWA 仍可接收相同链接。
- App 仅在内存中保存短效 pairing token，调用现有消费接口后立即清理 URL、剪贴板和页面状态。
- 原生 App 不能因为自报 `standalone` 就获得权限；服务端以已签发的设备凭证和访问角色为准。

## 6. SSO 和深链

### Android

- 二维码配对注册 HTTPS App Link，域名使用公开 FridgeBoard 域名；移动 SSO 使用 `fridgeboard://mobile/auth/callback` App 专属 URI，避免未完成域名验证时弹出浏览器选择框。
- 服务端提供并部署 `/.well-known/assetlinks.json`，只声明正式签名证书指纹和包名。
- 登录从系统浏览器开始，回调 URL 使用一次性 code/state；App 专属 URI 交给原生认证桥，避免未完成 HTTPS 域名验证时弹出浏览器选择框。
- App 不接管任意外部 URL，不把 OAuth code 转发给非白名单页面。

### iOS

- 注册 HTTPS Universal Link，服务端提供并部署 `/.well-known/apple-app-site-association`，用于二维码配对。
- 只声明正式 Team ID、Bundle ID 和必要路径。
- 使用系统浏览器完成 SSO；App 收到 App 专属 URI 后校验 state、code、路径和过期时间。
- App Store/TestFlight/开发包的 Bundle ID 和关联文件必须分别验证，避免签名或路径配置漂移。

### 降级

- 没有 App、深链未关联或用户选择浏览器打开时，公开 URL 必须继续进入 PWA 配对/登录流程。
- 深链失败不得把短效 token 显示为普通错误 URL；应提供重新扫码/重新登录入口。

## 7. 原生能力设计

| 能力 | PWA | Capacitor App | 首期要求 |
| --- | --- | --- | --- |
| 摄像头 | `getUserMedia` | Camera/扫码插件或原生桥 | 必须可手工录入降级 |
| 二维码/条码 | 浏览器相机能力 | 原生扫码能力 | 配对和商品扫码都验收 |
| 图片上传 | File/Blob | 原生相机结果转 Blob/File | 保持现有 `/api` 上传语义 |
| 系统分享 | Web Share API | Share 插件 | PWA 失败时仍可复制 |
| 凭证存储 | HttpOnly Cookie | Keychain/Keystore | 禁止 localStorage 长期存储 |
| 推送 | Web Push 能力验证 | APNs/FCM 原生通道 | 与 PWA Push 分开评估 |
| 网络状态 | `navigator.onLine` | Network 插件 | 只改善提示，不改变业务语义 |
| 返回手势 | 页面级右滑 | Android/iOS 原生 + 页面级兜底 | 防止抽屉/横向控件误触 |

原生插件调用必须集中在一个适配模块中，不能在 `App.tsx`、库存组件和食谱组件中散落平台分支。

### 7.1 系统权限清单

当前 APK/IPA 的系统权限与调用点保持一一对应：

| 能力/调用点 | Android | iOS | 运行时行为 | 当前结论 |
| --- | --- | --- | --- | --- |
| 扫描冰箱端二维码、物品识别相机 | `android.permission.CAMERA` | `NSCameraUsageDescription` | 首次 `getUserMedia` 时由 WebView/系统弹窗请求；拒绝后保留手工录入和照片降级 | 已声明，需真机验收首次授权、拒绝和永久拒绝 |
| 网络 API、SSE、远程图片 | `INTERNET`；网络状态监听使用 `ACCESS_NETWORK_STATE` | 无运行时网络权限 | App 启动或请求时由系统网络栈处理 | 已声明/无需声明 |
| 图片选取 | 不声明存储或 `READ_MEDIA_IMAGES`，使用系统文件选择器 | 不声明相册读取权限，使用系统照片/文件选择器 | 用户主动打开文件选择器并选择图片 | 当前实现无需新增权限 |
| 音频、定位、蓝牙 | 未使用、未声明 | 未使用、未声明 | 相机约束明确设置 `audio: false` | 无需新增权限 |
| 系统通知 | 未接入原生通知插件 | 未接入 APNs/原生通知插件 | 仅调用浏览器 `Notification` API；不可用时显示应用内提醒降级 | 不应为了当前 Web fallback 添加原生通知权限 |
| Keychain/Keystore、剪贴板、分享、深链 | 不需要运行时危险权限 | 不需要运行时隐私权限 | 分别使用原生安全存储、系统剪贴板/分享面板和 App Links/Universal Links | 无遗漏 |

每次修改原生能力后可运行 `npm run --prefix frontend check:mobile-permissions`，它会检查源码权限声明、相机调用链和音频关闭约束；构建后还应检查最终 APK/IPA 的合并权限清单。

P13.5 当前已将分享、网络状态和系统返回事件集中到 `frontend/src/nativeBridge.ts`，共享 `PageShell` 会展示离线提示且不改变业务请求语义。Android 通过 `NativeCapabilities` 插件提供系统分享、`ConnectivityManager` 网络事件和 `OnBackPressedDispatcher` 返回事件，并在 Android 13+ 开启 predictive back；无页面返回处理器时交还系统默认行为，销毁时移除原生监听。Android 分享使用 ActivityCallback，iOS 使用 `UIActivityViewController` 完成回调区分成功与取消；iOS 网络事件切回主线程后再通知 WebView。iOS 通过 `NativeCapabilitiesPlugin` 的屏幕左边缘手势通知 React 返回事件，只有存在页面监听时才识别该手势，并关闭 WebView history 手势以避免重复导航。原生分享失败时继续复制完整文本和 URL，PWA 继续使用 Web Share/剪贴板 fallback。相机/扫码和通知继续保留现有 Web API fallback，原生扫码 UI、APNs/FCM 推送和真机手势仍需后续设备验收与能力评估。

## 8. 手势和导航

### 页面级

- 继续使用 `edgeSwipeBack.ts` 作为页面级导航规则。
- 组件内部横向手势、抽屉、分类面板、轮播和输入控件必须优先消费触摸事件。
- 原生返回回调只能触发当前 React 导航栈可执行的返回，不得直接 reload 或改变业务状态。

### Android

- 接入系统 back dispatcher；Android 33+ 配合 predictive back 配置。
- App 页面有可返回状态时，将 back 事件桥接给 Web 导航；根页面允许系统返回/退出。
- 不能用高优先级回调无条件拦截系统动画。
- 在 Android 12、13、14、15+ 至少各验证一次，重点检查边缘滑动、键盘、模态框和全屏扫码。

### iOS

- 配置 WKWebView back/forward gestures 或 Capacitor 等价方案。
- 检查 iOS 系统返回手势与页面右滑返回的重复触发；一次手势只能消费一次导航。
- 在首页、二级页、弹窗、抽屉、表单未保存和扫码页分别验证。

## 9. 构建和发布

### 开发

```bash
npm ci --prefix frontend
npm run --prefix frontend lint
npm run --prefix frontend test -- --run
npm run --prefix frontend build

npx cap sync
npx cap open android
npx cap open ios
```

`npx cap sync` 会把最新 `frontend/dist` 复制到 Android/iOS 包内；原生 App 不注册 PWA Service Worker。实际 archive、签名和真机验证仍不能由这些命令替代。

### P13.6 可重复发布脚本

统一构建入口为 [`scripts/mobile-release.sh`](../scripts/mobile-release.sh)：

#### 本机 Android 签名材料清单

当前开发机使用的正式 Android 签名材料不在 Git 仓库内：

| 项目 | 位置/值 |
| --- | --- |
| Keystore | `/Users/jason/secure/fridgeboard-release.jks` |
| Gradle 配置 | `/Users/jason/secure/fridgeboard-keystore.properties` |
| Key alias | `fridgeboard` |
| SHA-256 指纹 | `BC:C7:26:27:D1:43:17:64:75:45:4F:1D:D8:3B:B5:36:AB:31:66:24:A0:06:C9:F9:13:93:23:82:64:0E:9D:0A` |
| 文件权限 | keystore 和 properties 均为 `600` |

本机所有 Android 主包构建（包括 Debug）都会自动查找 `~/secure/fridgeboard-keystore.properties` 并使用
正式签名；找不到配置时直接失败，不再回退到 Android 默认 Debug 证书。只有配置文件放在其他受保护路径时，
才需要用 `FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES` 覆盖路径：

```bash
FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES=/Users/jason/secure/fridgeboard-keystore.properties \
  frontend/scripts/build-android.sh assembleDebug
```

正式发布脚本也接受同一变量；GitHub Actions 则从 `FRIDGEBOARD_ANDROID_KEYSTORE_BASE64` 等仓库
Secrets 临时注入签名材料。密码不得记录在本工程文档、命令行参数、日志或 Git 中。更换开发机后，
应将 keystore 放在新的受保护路径，并用 `keytool -list -v` 核对 alias 与 SHA-256 指纹。

移动端产品版本的唯一来源是 `frontend/package.json` 的 `version`，当前为 `0.2.0`，格式固定为三段数字
`MAJOR.MINOR.PATCH`。它会进入 PWA 关于页、Android `versionName`、iOS
`CFBundleShortVersionString` 以及发布文件名和 tag。每次跨平台发布还使用同一 `yymmddhhMMss` 格式的
release 标识，并注入 PWA、Android 和 iOS 包，关于页显示 `版本 + release`。正式构建脚本与 GitHub
Actions 会拒绝与产品版本基线不一致的版本。Android `versionCode` 和 iOS `CFBundleVersion` 是独立的
正整数构建号，只用于安装升级比较和平台内部排序，不作为用户可见字段。

```bash
# 只构建签名 APK
FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES=/secure/fridgeboard/keystore.properties \
  scripts/mobile-release.sh build --platform android --version 0.1.4 \
  --release 260825112917 --build-number 1800000000

# 构建 IPA；默认使用 ad-hoc 导出
FRIDGEBOARD_IOS_TEAM_ID=ABCDE12345 \
  FRIDGEBOARD_ALLOW_PROVISIONING_UPDATES=1 \
  scripts/mobile-release.sh build --platform ios --version 0.1.4 \
  --release 260825112917 --build-number 1800000000

# 正式发布：先更新 frontend/package.json，再推送相同版本的 tag
git tag v0.1.4
git push origin v0.1.4

# 兼容既有 iOS/flycn 门户发布（不会被 Android tag workflow 调用）
FLYCN_PUBLISH_TOKEN=... \
  scripts/mobile-release.sh build-and-publish --platform ios \
  --version 0.1.4 --build-number 1800000000
```

脚本会先构建前端并执行 Capacitor sync，再按 `com.fridgeboard.app`、版本号和构建号校验 APK/IPA 内的 manifest。发布时会调用 `scripts/generate-release-changelog.sh`，按最近 tag 到本次提交自动生成中文变更摘要；若传入 `--notes-file`，手工说明会追加在自动摘要之后。签名材料、`.env` 和 IPA/keystore 不进入 Git；`output/mobile-release/` 仅作为本地产物目录。

GitHub Actions workflow [`android-release.yml`](../.github/workflows/android-release.yml) 使用 GitHub-hosted Ubuntu runner，固定 JDK 21；推送 `v*` tag 时构建 Android release、上传 Actions artifact，并用内置 `GITHUB_TOKEN` 将 APK 上传到当前 `flywhc/FridgeBoard` 仓库的 GitHub Release。Release 正文由 `scripts/generate-release-changelog.sh` 自动生成，发布后 workflow 还会检查 GitHub asset 是否存在有效的 `sha256:` digest，缺失时任务失败。普通 push 和 pull request 不触发 Android 发布。

workflow 必须配置 Android keystore Secrets。既有 [`mobile-release.yml`](../.github/workflows/mobile-release.yml) 保留 iOS 手动构建、Actions artifact 和可选 flycn 门户发布；iOS profile 的 Team ID 和 `application-identifier` 会在构建前校验为 `com.fridgeboard.app`，避免把其他 App 的 profile 用于发布。`publish`/`build-and-publish` 脚本入口也保留给既有 iOS/flycn 流程；脚本会拒绝 Android flycn 发布，避免旧命令绕过新的 GitHub Release 方案。

### Android

- debug APK 只用于开发，不进入交付目录。
- release 生成签名 APK 作为当前 GitHub Release 的安装产物；可选生成 AAB 留作未来商店构建检查，但本阶段不上传 AAB。
- 配置应用签名、包名、版本号、图标、网络安全策略、深链、相机/通知权限和 16 KB page size 兼容性。
- 使用 Play App Bundle 做设备定向下载；安装包大小报告以 Play Console 实际结果为准。

### iOS

- 使用正式 Bundle ID、Team ID、签名证书、Associated Domains、相机/通知说明和隐私清单。
- 使用 ad-hoc、enterprise 或 development 导出方式生成符合签名规则的 IPA；本次不改变 iOS 的现有构建/分发方式，不能把未签名 simulator `.app` 当成 IPA。
- IPA 文件大小、App Store 下载大小和设备安装占用必须分开记录；以 Xcode/App Store thinning 报告为准。

### PWA

- 沿用现有 Docker/FastAPI 发布流程和 release 注入规则。
- PWA 发布不自动更新已安装 APK/IPA；移动端更新由商店/签名包流程负责。
- 后端 API 必须保持向后兼容，至少覆盖当前线上 App 版本的迁移窗口；删除协议前先发布 App 版本并确认升级率。

## 10. 分阶段计划

详细任务登记在 [`docs/development-execution-plan.md`](development-execution-plan.md) 的 P13。

### P13.1 骨架和工具链 Spike

建立 Capacitor 工程，加载当前 `dist`，在 Android/iOS 模拟器和至少一台真机验证启动、静态资源、返回、相机权限和远程 API 连通性。输出实际目录、版本、最低系统版本、构建命令和包体积基线。

### P13.2 运行时和 API 适配

增加 `web/capacitor` 运行时配置，统一 API base URL、SSE、上传、错误和取消；确保 PWA 路径和 Service Worker 无回归。补充前端单元测试和构建验证。

### P13.3 App 会话和安全存储

- 当前实现：后端通过 `mobile_authorization_codes` 和 `mobile_sessions` 提供一次性授权码、PKCE S256 交换、15 分钟访问令牌、持续有效到用户主动退出或服务端明确撤销的刷新令牌，以及服务端撤销；原生请求使用 App Owner Bearer 或配对设备 Bearer，不使用跨源 Cookie。Android 使用 Keystore AES-GCM 加密且排除系统备份的 SharedPreferences，iOS 使用 `WhenUnlockedThisDeviceOnly` Keychain；PWA 仍使用 HttpOnly Cookie。
- 认证恢复边界：Capacitor 受保护请求收到 access token 401 后只执行一次单飞刷新。断网、超时、服务不可用、本机会话缺失/损坏以及服务端返回 `mobile_session_revoked`/`mobile_session_not_found` 都只记录故障并保留安全存储与缓存页面，不得自动进入登录页。只有用户主动退出，或在故障弹窗明确点击“重新登录”后，才能清理本地 token 并启动登录。
- 现场诊断：非主动重新登录必须显示原因和 `auth-*` 诊断编号。服务端拒绝时由 refresh 响应生成编号并写入拒绝日志，App 提交错误信息时沿用同一编号；本机存储故障由 App 生成编号。诊断请求只包含时间、阶段、稳定原因码、HTTP/原生错误码、release、平台和联网状态，不包含 token、Cookie、任意日志正文、用户输入或业务数据。
- 自动化证据：`backend/tests/test_mobile_auth.py` 覆盖 SSO/PKCE、state/redirect 校验、重复/无效 code、刷新复用、拒绝原因、退出撤销、诊断日志脱敏和移动配对设备 Bearer；前端 `mobileAuth.test.ts`/`appApi` 覆盖 Capacitor 401 单飞刷新、网络失败保留会话、安全存储故障分类与诊断字段白名单。
- 未验证：真实 Android/iOS 系统浏览器回跳、杀进程重启后的 Keychain/Keystore 读取、飞行模式跨越 access token 过期、系统备份恢复及服务端后台撤销后的真机提示/提交；App Links/Universal Links 关联文件属于 P13.4。

设计并实现 App SSO exchange、刷新、退出、撤销和设备 Bearer 请求；服务端补会话模型/迁移（如需要）、认证测试、日志脱敏测试；原生端接入 Keychain/Keystore。

### P13.4 深链和配对

当前实现已配置 `com.fridgeboard.app` 对 `https://fridge.flycn.fyi/pair` 和
`/mobile/auth/callback` 的 Android App Links、iOS Universal Links 和 Capacitor 冷启动/
后台恢复 URL 桥；前端只接受公开域名的白名单路径，配对 token 与 SSO code/state 进入
App 内存，不写入 Web Storage。服务端由
`FRIDGEBOARD_ANDROID_SHA256_CERT_FINGERPRINTS` 和 `FRIDGEBOARD_IOS_TEAM_ID` 生成两份
关联文件；未配置正式签名信息时返回空关联，公开 URL 继续由 PWA fallback 接收。
仍需在正式签名包和真实设备上覆盖 App 已安装、未安装、过期、重复消费、取消和换设备场景。

### P13.5 原生能力和交互

已完成分享、网络状态、Android predictive back、iOS WebView back gesture 和 PWA fallback 的桥接自动化实现；原生扫码、推送和真机验收仍按清单执行。

系统栏与安全区约定：`frontend/capacitor.config.ts` 的 Capacitor `SystemBars` 固定使用 `style: LIGHT`、`hidden: false`、`insetsHandling: css`，两端 WebView/窗口背景固定为标题栏白色；Android 启动主题使用透明状态栏/导航栏和白色 `windowBackground`，splash 结束后切换到 `AppTheme.NoActionBar`；iOS 保持 `UIViewControllerBasedStatusBarAppearance=YES` 并以 `UIStatusBarStyleDarkContent` 作为启动回退。网页入口声明 `viewport-fit=cover`，共享 CSS 通过 `--app-safe-*` 读取 Android 注入的 `--safe-area-inset-*` 或 iOS `env(safe-area-inset-*)`，顶部栏、底部导航、底部操作区、弹窗和横向边距统一消费同一套变量；iOS `contentInset` 固定为 `never`，避免原生滚动 inset 与 CSS 安全区重复计算。构建已覆盖 Android Debug、iOS Simulator Debug、前端测试和静态配置检查；刘海/挖孔屏、手势导航和横屏仍需真机验收。

### P13.6 发布流水线和商店准备

加入前端构建→Capacitor sync→签名 Android APK→包内元数据校验→Actions artifact→当前仓库 GitHub Release 的可重复流程；商店 AAB/TestFlight 暂不作为本阶段交付；签名材料只从 GitHub Secrets 或本机安全环境注入。

### P13.7 端到端验收

在 Android 和 iOS 真机完成登录、配对、创建/切换冰箱、库存录入、扫码、图片上传、SSE、食谱/购物、返回手势、断网启动和升级回归；同时验收普通浏览器 PWA 未受影响。

### P13.8 Android APK 自动更新

Android APK 的“关于与帮助”页进入时检查当前公开 GitHub 仓库的 Releases API，按原生包的
`versionCode` 数值判断是否有新版本。客户端从最新 Release 的 APK asset 读取版本号、构建号、文件大小和
GitHub 提供的 SHA-256 digest；发布 token、门户访问码和登录会话不进入 APK。

客户端优先请求 FridgeBoard 同域的 `/api/mobile/android/releases/latest`，由服务端以匿名请求读取并短时缓存
GitHub 元数据；旧服务端或代理暂时不可用时回退到 GitHub API。该代理只返回已校验的公开版本元数据，不代理
APK 文件下载，因此 APK 下载仍直接使用 GitHub Release 受控地址。

自动检查在本机以 6 小时为最短间隔记录检查时间，避免多个页面进入或多个设备共享出口时持续消耗 GitHub 公共 API 配额；帮助页的“检查更新”按钮始终执行手动检查。

发现新版本后，Android 原生桥只接受 `https://github.com/flywhc/FridgeBoard/releases/download/` 下的
地址，并允许 GitHub Release 的受控资源重定向域名，将 APK 下载到 App 私有目录并校验 SHA-256，再通过
`FileProvider` 和系统 Package Installer 安装。Android 8 及以上若未
允许本应用安装未知来源应用，先打开系统权限页，由用户完成确认；系统安装确认不可被应用绕过。

PWA 和 iOS 继续使用原有页面刷新/发布流程，不使用该 Android 安装桥。

## 11. 质量门禁和验收矩阵

### 自动化门禁

- `uv run ruff check backend`
- `uv run pytest`
- `uv lock --check`
- `npm run --prefix frontend lint`
- `npm run --prefix frontend test -- --run`
- `npm run --prefix frontend build`
- `git diff --check`
- `sh -n scripts/mobile-release.sh`
- `node --check scripts/verify-mobile-artifact.mjs`
- `scripts/mobile-release.sh ... --dry-run`
- Capacitor Android release/AAB 构建和 iOS archive/IPA 构建（在对应签名工具链可用环境执行）

### 关键人工验收

| 场景 | PWA | Android App | iOS App |
| --- | --- | --- | --- |
| 冷启动静态资源 | 浏览器首次/清缓存 | 飞行模式打开应用壳 | 飞行模式打开应用壳 |
| 所有者登录 | Cookie SSO | 系统浏览器 + App Link | 系统浏览器 + Universal Link |
| 手机配对 | QR → PWA | QR → App/未安装降级 PWA | QR → App/未安装降级 PWA |
| 库存录入 | 手工/相机 | 手工/原生扫码/相机 | 手工/原生扫码/相机 |
| SSE/上传 | 正常/超时 | 正常/切后台/恢复 | 正常/切后台/恢复 |
| 返回导航 | 页面右滑 | 系统边缘返回 + 页面右滑 | WKWebView 边沿返回 + 页面右滑 |
| 凭证撤销 | Cookie 失效 | Bearer 停止有效访问并提示；用户确认后清理安全存储 | Bearer 停止有效访问并提示；用户确认后清理 Keychain |
| PWA 回归 | 必须通过 | 不适用 | 不适用 |

### 验收证据

每个 P13 子任务应记录：设备型号、系统版本、WebView/WebKit 版本、App version/release、API release、构建产物摘要、测试命令、截图/录屏位置、失败回退和未验证项。当前 P13 已完成；新增移动端行为仍按 `RG-013` 和 `RG-015` 回归。

## 12. 风险和决策门

| 风险 | 触发条件 | 处理 |
| --- | --- | --- |
| App SSO 深链回不来 | 系统浏览器回调未触发或 state 丢失 | 保留 PWA 回退；先修复关联文件和回调协议 |
| App Origin/CORS 不稳定 | API、上传或 SSE 在 WebView 失败 | 统一 API base、明确 CORS/Origin、补真机测试，不放宽为通配凭证 |
| Android WebView 差异 | 低版本扫码、SSE 或 CSS 行为异常 | 提高最低 WebView/系统版本或实现原生能力 fallback |
| iOS 审核风险 | 被判定为网站包装 | 在正式版提供并演示原生扫码、安全存储、深链、手势等真实功能 |
| 凭证泄漏 | Token 出现在 URL、日志、localStorage 或剪贴板 | 阻断发布，撤销凭证，补脱敏和安全存储测试 |
| 离线误解 | 包内页面能开但业务请求失败 | 明确 UI 的在线状态和错误文案；不宣称业务离线可用 |
| 构建签名泄漏 | keystore/cert 被提交或进入日志 | 立即轮换；使用部署环境注入并扫描归档 |

若 P13.1 或 P13.3 证明 Capacitor 的 WebView/API/认证边界无法满足要求，必须先暂停后续实现，记录证据并重新评估 Tauri 或原生壳方案；不能直接在业务代码中堆平台特判。
