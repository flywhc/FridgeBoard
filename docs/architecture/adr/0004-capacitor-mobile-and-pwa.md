# ADR-0004：Capacitor 原生移动端与 PWA 共存

状态：已接受  
日期：2026-08-12

## 背景

FridgeBoard 当前是 React/Vite 前端与 FastAPI 同容器同域提供的 PWA。PWA 继续作为免安装入口，但其静态应用壳依赖浏览器缓存和 Service Worker；同时，浏览器不能完整接入 Android 系统返回/预测性返回等原生交互。用户希望增加 APK/IPA，使用稳定的包内静态资源，并保留 PWA。

当前前端 API 使用相对 `/api` 路径和 `credentials: 'same-origin'`；所有者会话与 PWA 设备凭证主要通过 HttpOnly Cookie 保存，设备 API 同时已经支持 Bearer 凭证。二维码配对链接和 SSO 回调依赖公开 HTTPS 地址。

## 决策

采用 **Capacitor 原生壳 + 包内 React/Vite 资源 + 远程同域 FastAPI API**，并继续维护现有 PWA。

```text
PWA 浏览器
  https://fridge.flycn.fyi/
  同源静态资源 + Service Worker + HttpOnly Cookie

Capacitor Android / iOS
  包内 frontend/dist 静态资源
  ├─ 远程 https://fridge.flycn.fyi/api
  ├─ 系统浏览器 SSO + App 专属 URI 回跳；配对使用 App Links / Universal Links
  └─ Keychain / Android Keystore 中的原生 Bearer 会话
```

### 资源和 API

- PWA 继续由 FastAPI 同域提供静态资源与 `/api`，继续注册 Service Worker；不缓存 API 响应。
- APK/IPA 将发布时生成的 `frontend/dist` 复制到原生包，由本地 WebView 加载，不依赖浏览器 Cache Storage 才能显示应用壳。
- 原生包通过编译配置或运行时适配选择 API 基地址；生产 API 固定为公开 HTTPS 地址，开发环境允许局域网地址注入，但不得把 API 地址写死在业务模块中。
- 原生包不注册 PWA Service Worker，避免包内资源和远程网页缓存策略互相覆盖。
- 业务数据仍是服务端数据；“稳定静态内容”只表示 HTML、JS、CSS、图标等应用资源包内可用，不承诺离线读写库存或食谱。

### 认证和深链

- PWA 保持现有同源 HttpOnly Cookie 行为，避免破坏当前浏览器和已有设备配对流程。
- 原生 App 不把跨源 HttpOnly Cookie 作为唯一认证机制。移动端增加面向 App 的会话交换/刷新边界，使用现有设备 Bearer 校验能力，并把长期凭证交给 Android Keystore 或 iOS Keychain 保存；前端 JavaScript 不直接持久化长期凭证。
- 所有者 SSO 由系统浏览器打开公开登录地址；服务端完成 flycn 授权码兑换后，通过 `fridgeboard://mobile/auth/callback` 把一次性 App 回调交给原生壳，再交换为 App 会话。二维码配对仍通过 HTTPS Universal Link/App Link 工作，未安装 App 时继续回到 PWA。
- 二维码中的配对 URL 始终使用公开站点地址，而不是原生包的本地 Origin。App 收到深链后将短效令牌交给现有配对流程，并在消费后清理 URL 和内存中的令牌。
- 所有回调必须校验 state、目标 Origin/域名、一次性 code 或短效 token；不得把长期 Bearer 令牌放进 URL、日志、剪贴板或 QR 内容。

### 原生能力和导航

- React 页面导航继续保留现有页面级 `edgeSwipeBack`，作为 PWA 和原生壳的共同降级路径。
- Android 原生层接入系统返回回调和预测性返回；当页面内存在可返回状态时交给 Web 导航，否则退出当前原生页面/应用。不得阻断系统需要的返回动画。
- iOS 原生层配置 WKWebView 前进/后退手势或等价桥接，并确保不会与页面级横扫切换、抽屉和表单水平手势冲突。
- 相机、扫码、文件选择、分享、通知、网络状态和安全存储优先使用 Capacitor 官方或维护明确的插件；只有现有插件不能满足约束时才新增自定义 Kotlin/Swift 插件。
- 原生能力必须有 Web fallback：PWA 使用现有浏览器 API 或明确的手工降级，不能让 Capacitor import 阻塞浏览器启动。

### 后端和部署边界

- FastAPI、SQLite、单容器、单 Uvicorn 进程、Nginx Proxy Manager 和同域 PWA 部署边界不变。
- API 不为 Android/iOS 复制一套业务路由；只增加必要的 App 会话/回调协议，并复用现有 AccessService、设备凭证撤销和权限判断。
- API CORS 只允许明确的原生 App 请求来源/协议策略；不能使用通配 `*` 配合凭证。若采用 Bearer-only API 请求，则仍必须校验 Origin、CSRF/重放和权限边界。
- 服务端永远不信任 App 标识、包名或自报设备类型来授予权限；权限只来自已签发并可撤销的会话/设备凭证。

### 发布边界

- Android 正式商店上传 AAB；额外提供签名 APK 供明确的手工/局域网安装。Release 构建按 ABI 分发，不能把 debug 包当作交付物。
- iOS 通过 TestFlight、App Store 或符合 Apple 签名规则的企业/Ad Hoc 渠道分发；不承诺 IPA 可像 APK 一样直接安装。
- 每个移动端版本必须记录前端 release、原生版本、API 兼容范围、签名构建产物和回滚版本。PWA 仍按现有服务器发布脚本独立更新。
- App Store 版本必须具有超出“网站包装”的实际能力，例如安全凭证存储、原生扫码/相机、系统返回/边沿手势、深链或推送，并在审核说明中可操作演示。

## 备选方案

### Tauri

Tauri 也使用系统 WebView，理论上可得到更小的原生壳；但当前项目不需要 Rust 业务层，移动端插件和认证桥接会增加 Rust、Kotlin、Swift 与 TypeScript 的维护边界。预计节省的移动端安装包通常只有几 MB，不足以抵消当前阶段的工程复杂度。

### Electron

不采用。Electron 会把 Chromium/Node.js 运行时一并打包，明显增加移动端安装包体积，也不符合本项目 Web-first 的 PWA 共存目标。

### TWA/纯远程 WebView

不作为 APK/IPA 主方案。它不能提供包内静态应用资源，也无法稳定承载本项目需要的 Keychain/Keystore、系统扫码和平台返回手势；同时无法满足 iOS 原生包路径。

### React Native/原生重写

不采用。当前 UI、业务逻辑和 PWA 已有较大投入，重写会产生两套渲染和行为实现，超出本需求的必要范围。

## 后果

### 正面

- 页面、样式、业务请求和 PWA 继续共享；原生包首屏资源不依赖浏览器缓存。
- 可逐步增加系统相机、扫码、推送、分享、安全存储和返回手势，而不重写业务 UI。
- PWA 可以独立快速发布；移动商店版本按审核和签名流程发布。

### 代价和风险

- 需要维护 Android Studio/Gradle 与 Xcode/CocoaPods 或 Swift Package 的构建环境、签名和商店元数据。
- 原生包 Origin 与 API Origin 不同，认证、CORS、深链和文件上传必须有自动化测试及真机验收。
- Android WebView 版本随系统组件变化；iOS WebKit 受系统版本约束。原生包不是完全自带浏览器，仍需定义最低系统版本和能力降级。
- 远程 API 不可用时，用户只能看到包内界面，不能假设业务数据可离线使用；后续若需要离线写入，必须另行设计同步和冲突规则。

## 实施前置条件

1. 完成 Capacitor 骨架 Spike，确认当前 Vite `dist` 可被 Android/iOS 本地加载。
2. 明确 App API 基地址、App 会话模型、SSO 回调域名和深链关联文件的正式域名。
3. 在真实 Android/iOS 设备验证扫码、相机、SSE、上传、登录回调和返回手势。
4. 配置 Android 签名、Google Play AAB 流程、Apple Developer 团队/证书/TestFlight 流程。
5. 完成安全评审：凭证存储、token 清理、日志脱敏、TLS、CORS、回调重放和撤销行为。
