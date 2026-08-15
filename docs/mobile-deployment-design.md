# FridgeBoard 手机端 APK/IPA 与 PWA 部署设计

状态：P13.1–P13.4 已实施，P13.3/P13.4 待真实设备验收，P13.5 桥接进行中
更新日期：2026-08-14
关联决策：[ADR-0004：Capacitor 原生移动端与 PWA 共存](architecture/adr/0004-capacitor-mobile-and-pwa.md)

## 1. 目标和非目标

### 目标

- 保留现有 PWA 作为免安装、同域、快速发布的 Web 入口。
- 增加 Android APK/AAB 和 iOS App Store/TestFlight 部署路径。
- Android/iOS App 首屏 HTML、JavaScript、CSS、图标等静态应用资源从安装包加载，不依赖浏览器已有 Cache Storage。
- 在共享 React/Vite 页面基础上增加原生安全存储、相机/扫码、系统分享、推送和平台返回/边沿手势。
- 保持 FastAPI、SQLite、单容器和现有业务 API 为唯一服务端业务边界。

### 非目标

- 不重写为 React Native 或原生 UI。
- 不引入 Electron/Chromium 运行时。
- 不为 Android/iOS 复制完整业务 API 或维护两套业务页面。
- 第一阶段不承诺库存和食谱离线读写；包内静态资源可离线加载不等于业务数据可离线操作。
- 不以 App 内 WebView 的跨源 Cookie 兼容性作为长期认证方案。

## 2. 现状基线

- 前端：React + TypeScript + Vite，生产 `frontend/dist` 当前约 1.1 MB。
- PWA：[`frontend/src/main.tsx`](../frontend/src/main.tsx) 注册 [`frontend/public/sw.js`](../frontend/public/sw.js)，manifest 和应用壳缓存已存在。
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
- 原生包页面若需打开外部网页，只允许显式白名单，并交给系统浏览器处理登录、支持和隐私页面。

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
App ──打开系统浏览器──> GET /api/auth/login?client=mobile&redirect_uri=...
App <── Universal Link/App Link ── /mobile/auth/callback?code=...&state=...
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

- 注册 HTTPS App Link，域名使用公开 FridgeBoard 域名。
- 服务端提供并部署 `/.well-known/assetlinks.json`，只声明正式签名证书指纹和包名。
- 登录从系统浏览器开始，回调 URL 使用一次性 code/state；App Link 收到后交给原生认证桥。
- App 不接管任意外部 URL，不把 OAuth code 转发给非白名单页面。

### iOS

- 注册 HTTPS Universal Link，服务端提供并部署 `/.well-known/apple-app-site-association`。
- 只声明正式 Team ID、Bundle ID 和必要路径。
- 使用系统浏览器完成 SSO；App 收到 Universal Link 后校验 state、code、路径和过期时间。
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

### Android

- debug APK 只用于开发，不进入交付目录。
- release 生成 AAB 作为 Google Play 产物，并生成签名 APK 作为明确的手工安装产物。
- 配置应用签名、包名、版本号、图标、网络安全策略、深链、相机/通知权限和 16 KB page size 兼容性。
- 使用 Play App Bundle 做设备定向下载；安装包大小报告以 Play Console 实际结果为准。

### iOS

- 使用正式 Bundle ID、Team ID、签名证书、Associated Domains、相机/通知说明和隐私清单。
- 先以开发设备和 TestFlight 验证，再决定 App Store 发布。
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

- 当前实现：后端通过 `mobile_authorization_codes` 和 `mobile_sessions` 提供一次性授权码、PKCE S256 交换、15 分钟访问令牌、30 天刷新令牌轮换和服务端撤销；原生请求使用 App Owner Bearer 或配对设备 Bearer，不使用跨源 Cookie。Android 使用 Keystore AES-GCM 加密的 SharedPreferences，iOS 使用 `WhenUnlockedThisDeviceOnly` Keychain；PWA 仍使用 HttpOnly Cookie。
- 自动化证据：`backend/tests/test_mobile_auth.py` 覆盖 SSO/PKCE、state/redirect 校验、重复/无效 code、刷新轮换、退出撤销和移动配对设备 Bearer；前端 `appApi` 在 Capacitor 401 时单飞刷新并清理安全存储。
- 未验证：真实 Android/iOS 系统浏览器回跳、杀进程重启后的 Keychain/Keystore 读取、服务端后台撤销后的真机 401 清理；App Links/Universal Links 关联文件属于 P13.4。

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

接入相机/扫码、分享、网络状态、推送评估、Android predictive back、iOS WebView back gesture 和安全区；保持 PWA fallback，补原生桥接测试和真机验收记录。

### P13.6 发布流水线和商店准备

加入前端构建→Capacitor sync→Android AAB/APK、iOS archive/TestFlight 的可重复流程；签名密钥只从 CI/本机安全环境注入；补版本、release、产物、回滚和隐私说明文档。

### P13.7 端到端验收

在 Android 和 iOS 真机完成登录、配对、创建/切换冰箱、库存录入、扫码、图片上传、SSE、食谱/购物、返回手势、断网启动和升级回归；同时验收普通浏览器 PWA 未受影响。

## 11. 质量门禁和验收矩阵

### 自动化门禁

- `uv run ruff check backend`
- `uv run pytest`
- `uv lock --check`
- `npm run --prefix frontend lint`
- `npm run --prefix frontend test -- --run`
- `npm run --prefix frontend build`
- `git diff --check`
- Capacitor Android release/AAB 构建和 iOS archive 构建（在对应工具链可用环境执行）

### 关键人工验收

| 场景 | PWA | Android App | iOS App |
| --- | --- | --- | --- |
| 冷启动静态资源 | 浏览器首次/清缓存 | 飞行模式打开应用壳 | 飞行模式打开应用壳 |
| 所有者登录 | Cookie SSO | 系统浏览器 + App Link | 系统浏览器 + Universal Link |
| 手机配对 | QR → PWA | QR → App/未安装降级 PWA | QR → App/未安装降级 PWA |
| 库存录入 | 手工/相机 | 手工/原生扫码/相机 | 手工/原生扫码/相机 |
| SSE/上传 | 正常/超时 | 正常/切后台/恢复 | 正常/切后台/恢复 |
| 返回导航 | 页面右滑 | 系统边缘返回 + 页面右滑 | WKWebView 边沿返回 + 页面右滑 |
| 凭证撤销 | Cookie 失效 | Bearer 失效并清理安全存储 | Bearer 失效并清理 Keychain |
| PWA 回归 | 必须通过 | 不适用 | 不适用 |

### 验收证据

每个 P13 子任务必须记录：设备型号、系统版本、WebView/WebKit 版本、App version/release、API release、构建产物摘要、测试命令、截图/录屏位置、失败回退和未验证项。未完成深链、凭证安全存储或真机认证验收时，不能标记 P13 完成。

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
