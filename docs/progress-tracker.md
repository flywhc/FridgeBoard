# FridgeBoard 开发进度看板

更新时间：2026-08-24
规则：每次会话只更新自己领取的任务；状态变化必须附带会话记录与验证证据。

### 2026-08-24 — 修复编辑食谱食材输入失焦并调整自动分类触发时机（本次会话）

- 状态：待评审。
- 目标：编辑食谱时，食材名称输入过程中不触发自动分类或重建输入框；输入框失去焦点后再执行自动分类。
- 范围：`frontend/src/RecipeWorkspace.tsx`、相关前端回归测试和本进度记录；不改变分类匹配接口、保存数据结构、手工分类选择和食谱库存判断规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的表单交互规则；`docs/functional-design-and-feasibility.md` §9.1、§9.2；单日食谱编辑最终设计 `bbeda1ae-e99c-40d6-87b3-90cdedd7adfa` 及本地 `docs/ui-assets/html/pwa-recipe-edit.html`、`docs/ui-assets/png/pwa-recipe-edit.png`。
- 会话记录：已确认当前编辑页通过食材名称依赖启动 450ms 分类匹配，且食材行 React key 包含名称，导致每次改字都可能重建输入框并丢失焦点。本轮改为稳定行 key，并将编辑页分类匹配改由输入框失焦触发。
- 完成：食材名称输入改动只更新草稿并取消该行进行中的分类请求；输入框失焦且名称至少 2 个字符、尚未手工分类时才启动匹配；手工选择分类会取消自动匹配并阻止晚到结果覆盖；分类回填前继续校验食材名称未变化。
- 验证：`npm run --prefix frontend test -- --run`（30 个测试文件、274 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实 iOS Safari、Android WebView 或 PWA 安装环境完成人工输入焦点验收；未提交或发布。工作区既有 `fridgeboard.log` 未触碰。
- 下一步：评审通过后按发布流程处理；人工验收时覆盖连续输入、删除、输入框失焦自动分类、手工分类覆盖自动结果和网络失败提示。

### 2026-08-24 — 发布 APK 更新修复到生产服务器（本次会话）

- 状态：完成。
- 目标：将本次 APK GitHub Release 发布流程、iOS 兼容发布入口和帮助页检查限流修复纳入生产发布提交，完成远程数据库备份、容器重建、健康检查和发布记录。
- 范围：当前工作区中除 `fridgeboard.log` 外的本次代码、workflow、文档和测试改动；不提交密钥、`.deploy.env`、数据库、生产数据或运行时日志，不执行 GitHub tag/Release 发布。
- 设计/需求基线：用户本次“发布到服务器”；`scripts/deploy-image.sh`；项目正式发布规则；当前 `.deploy.env` 的既有生产目标。
- 预期验证：后端 Ruff/pytest、锁文件检查、前端 test/lint/build、Android Java 编译、脚本语法、发布 dry-run、自动提交、远程数据库备份、容器健康检查和公网健康检查。
- 发布结果：提交 `f5fc183` 已部署到 `root@107.174.152.245:/opt/fridgeboard`；脚本生成 release `260824203531`；容器镜像摘要为 `sha256:6332f739d7762cc833181dc8fcabc3fd51c67b5cfa3923cc75d488c7cedb73fe`。
- 发布验证：远程容器 `running/healthy`、重启次数 `0`；数据库备份 `/data/fridgeboard.db.backup-20260824-123626` 存在，权限 `600`、属主 `appuser:appuser`、大小 `1216512` 字节；容器内前端已注入 release `260824203531`；`https://fridge.flycn.fyi/healthz` 返回 HTTP 200 和 `{"status":"ok"}`。
- 验证：发布前门禁、`scripts/deploy-image.sh --dry-run`、远程 Docker 构建、数据库备份、容器健康检查和公网健康检查均通过；远程传输阶段出现 macOS xattr 的 tar warning，但未影响归档解包、构建或服务健康。
- 未验证：未推送 Android `v*` tag、未实际运行 GitHub Actions 或创建 GitHub Release，Android 真机升级仍待验收；本次未发布 flycn 仓库中已废弃的公开更新接口清理改动。工作区保留未提交的 `fridgeboard.log`。
- 下一步：配置确认后推送正式 `v*` tag，验证 GitHub Release APK asset、公开 API、Android 下载/安装和升级签名；不需要为本次服务器部署新增环境变量。

### 2026-08-24 — 调整 APK 发布与自动更新方案（本次会话）

- 状态：待评审。
- 目标：复用 HermitReader 已验证的 GitHub Release 发布方式，在公开的 FridgeBoard 自有仓库发布 Android APK，不再依赖 flycn APK 上传接口或发布 token。
- 范围：FridgeBoard GitHub Actions、GitHub Release asset 元数据、帮助页更新检查、Android 下载域名校验、移动部署文档和相关测试；同步移除 flycn 中本次新增但不再需要的公开更新接口及配置。
- 设计/需求基线：用户本次纠正；HermitReader 的 `release.yml`、`release-apple-mobile-selfhosted.yml` 和 GitHub Release 资产发布模式；FridgeBoard 当前已生成的 release keystore 与 Android Secrets。
- 会话记录：已确认 HermitReader 因私有主仓库才使用独立 `HermitReader-Releases`；FridgeBoard 本身是公开仓库，应直接使用 `flywhc/FridgeBoard/releases` 和 Actions 内置 `GITHUB_TOKEN`，不创建第二个 FridgeBoard 发行仓库。
- 方案修订：不新增 `latest.json` manifest；客户端直接读取 GitHub Releases API 的最新 APK asset，通过文件名读取 `versionCode`，通过 GitHub asset `digest` 读取 SHA-256，减少发布链路和新协议。
- 预期验证：tag 触发发布 workflow、GitHub asset 元数据、APK 包体与 SHA-256 校验、GitHub 下载重定向、Android 更新状态、PWA/iOS fallback、前端与 Android 构建、flycn 清理后门禁和文档同步。
- 完成：Android 发布 workflow 改为 `v*` tag 触发，使用当前公开仓库内置 `GITHUB_TOKEN` 上传 GitHub Release；`versionCode` 使用 `1700000000 + GITHUB_RUN_NUMBER`，APK 文件名携带构建号。帮助页改为读取 GitHub Releases API，Android 原生桥改为校验 GitHub Release 地址及受控重定向域名；移除 FridgeBoard/flycn 中本次新增的 flycn APK 更新接口、配置和上传脚本。
- 验证：前端 30 个测试、270 passed，lint/build、移动权限检查、Android Java 编译、release APK 构建与包内校验、脚本语法、`uv lock --check`、flycn 30 个测试、Ruff、compileall 和两仓库 `git diff --check` 均通过。
- 未验证：尚未推送 `v*` tag、实际运行 GitHub Actions 或创建 GitHub Release；尚未在真实 Android 设备完成 GitHub API、下载重定向、未知来源权限、系统安装确认和升级验收；flycn 清理代码尚未重新部署生产。现有 `fridgeboard.log`、flycn `.DS_Store`/`uv.lock` 未纳入变更。
- 下一步：评审通过后推送正式 `v*` tag，验证 GitHub Actions Release asset 和公开 API，再进行 Android 真机升级验收；确认无误后再部署 flycn 清理提交。

### 2026-08-24 — 修复 APK 发布流程兼容性与更新检查风险（本次会话）

- 状态：待评审。
- 目标：修复代码审查发现的 iOS 发布流程被误删、旧本地发布命令不兼容、GitHub Release SHA-256 元数据缺少发布门禁以及自动检查消耗公共 API 配额的问题。
- 范围：Android GitHub Release workflow、既有 iOS/flycn 发布 workflow、`scripts/mobile-release.sh` 兼容入口、帮助页更新检查冷却策略、Release 完整性契约测试和本进度记录；不改变 APK 下载域名白名单、文件大小校验、SHA-256 校验及系统安装器安全边界。
- 设计/需求基线：本次代码审查结论；用户要求尽量复用既有发布流程；当前 FridgeBoard 自有公开仓库 GitHub Release 方案；项目发布与进度同步规则。
- 完成：新增独立 `android-release.yml`，保留 `mobile-release.yml` 的手动 iOS 构建、签名导入、Actions artifact 和可选 flycn 发布；恢复 `scripts/mobile-release.sh` 的 `publish`/`build-and-publish` 接口及 `publish:mobile`，但明确拒绝 Android flycn 发布，避免旧入口绕过 GitHub Release。Android workflow 上传后通过 `actions/github-script` 校验 Release asset 的 `sha256:` digest；帮助页自动检查增加 6 小时本地冷却，手动检查强制绕过冷却，并对 GitHub 403/429 返回可操作提示。
- 验证：更新模块与发布 workflow 契约 8 passed；前端全量测试 30 个文件、273 passed；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、Android `:app:compileDebugJavaWithJavac`、`sh -n scripts/mobile-release.sh`、`node --check scripts/verify-mobile-artifact.mjs`、两套 workflow YAML 解析、Android flycn 发布拒绝 dry-run、iOS flycn 发布 dry-run 和 `git diff --check` 均通过。
- 未验证：尚未推送 `v*` tag、实际运行 GitHub Actions、创建 GitHub Release 或在真实 Android/iOS 设备验收；未执行 flycn 清理代码生产部署；本次未提交 Git。工作区已有运行时 `fridgeboard.log` 未触碰。
- 下一步：评审通过后推送正式 `v*` tag，确认 Android Release asset 的 digest 和公开 API，再进行 Android 真机升级验收；iOS 继续使用 `Mobile Release` 手动 workflow 或本地脚本。

### 2026-08-24 — 修复扫码页按调用页面返回（本次会话）

- 状态：进行中。
- 目标：扫码页因返回、取消或识别失败关闭时，返回实际调用它的页面；首页右上角打开的扫码返回首页，物品列表/添加物品页打开的扫码返回对应调用页面，不再固定返回物品列表。
- 范围：`frontend/src/InventoryFlow.tsx`、`frontend/src/App.tsx`、相关前端回归测试和本进度记录；不改变扫码识别、照片识别、添加保存和位置选择业务规则，不撤销工作区其他未提交改动。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的页面返回与共享页面壳规则；功能设计 §6.3、§6.4、§6.9；现有首页、物品列表、添加物品和识别物品页面。
- 会话记录：已确认 `closeRecognition` 当前用 `initialView !== 'add'` 固定推导为列表返回，导致首页直达扫码和添加页内扫码都返回列表。本轮将保存识别页打开前的本地页面状态，并为首页直达识别保留外层调用方返回回调。
- 完成：扫码页保存打开前的内部页面；首页直达扫码没有内部页面时调用外层返回首页；从列表添加页打开扫码时取消回添加页、添加完成回列表；从搜索结果进入编辑页的返回和保存回搜索页。`App` 外层库存流也保存首页/搜索页调用方，不再固定回首页。
- 验证：`npm run --prefix frontend test -- --run`（29 个文件、268 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实 iOS Safari、Android WebView 或 PWA 安装环境完成相机权限和多层返回的人工验收；未提交或发布。工作区其他未提交改动及 `fridgeboard.log` 未触碰。

### 2026-08-24 — APK 帮助页自动检查与升级（本次会话）

- 状态：原 flycn 方案已废弃，改由本会话的 GitHub Release 方案替代。
- 目标：在 Android APK 的“关于与帮助”页自动检查 flycn 最新 Android Universal APK，支持下载、SHA-256 校验并拉起系统安装器；PWA 与 iOS 行为保持不变。
- 范围：`frontend/src` 更新检查与帮助页、Android 原生能力桥和安装资源、flycn 公开 Android 版本接口、相关测试、移动部署文档与本进度记录；本次执行代码提交和生产服务发布，不提交密钥、不创建分支。
- 设计/需求基线：用户本次“APK 自动检查与升级”方案；`docs/mobile-deployment-design.md`；flycn 发布门户的多平台 Release API 与安装令牌约定。
- 会话记录：已确认当前帮助页只有 PWA 缓存刷新入口；Android 包版本来自原生 `versionName/versionCode`，flycn 现有下载入口依赖网页登录/访问码。本轮新增仅对白名单 App 开放的公开版本元数据和短期下载链路，发布 token 与门户凭据不进入 APK。
- 完成：flycn 增加 `GET /api/apps/{slug}/releases/latest` 公开 Android Universal 元数据接口，按数字 `build_number` 选择 active 本地 APK，生成匿名短期下载 token，并增加显式 CORS/白名单配置；FridgeBoard 帮助页在 Android APK 中自动检查更新，支持手动重试、SHA-256 校验、未知来源权限设置和系统安装器；PWA/iOS 保留原有刷新入口。
- 验证：FridgeBoard `npm run --prefix frontend test -- --run`（29 个文件、269 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、`npm run --prefix frontend build:android`、Android Debug assemble、脚本语法检查、`node --check scripts/verify-mobile-artifact.mjs`、后端 `uv run ruff check backend`、`uv run pytest`（173 passed）、`uv lock --check` 和 `git diff --check` 均通过；flycn 公开更新改动此前 `pytest -q`（32 passed）、Ruff、`compileall` 和 `git diff --check` 均通过，迁移修复通过本地 Ruff/compileall，并在生产容器迁移路径验证通过。
- 发布结果：FridgeBoard 提交 `aa1b97e` 已发布到 `root@107.174.152.245:/opt/fridgeboard`；脚本 release `260824160142`，数据库备份 `/data/fridgeboard.db.backup-20260824-080205`，远程容器 `running/healthy`、重启 `0`，镜像 `sha256:0279a61b75bd52f7c5e5bc678b28dcbe0f5eed341b9b9f66fbdbb46935d9feac`，容器内 `/healthz` 返回 `{"status":"ok"}`。本机到 `https://fridge.flycn.fyi/healthz` 的 TLS 检查重试仍为 LibreSSL `SSL_ERROR_SYSCALL`。
- 发布结果：flycn 提交 `18a0d63`、迁移兼容修复 `56d523a`/`f19840c` 已同步到 `/opt/flycn`；生产配置为 `PUBLIC_UPDATE_APP_SLUGS=fridgeboard`、`PUBLIC_UPDATE_CORS_ORIGINS=https://localhost,http://localhost`，容器 `running`、重启 `0`、镜像 `sha256:a20c09e336169655402df802c95a6a0c73e68069c4f5f1e7c3b7e3c2c26b68bb`，容器内 `/healthz` 和公网 `https://app.flycn.fyi/healthz` 均返回 200。当前没有 `fridgeboard` Release 记录，公开更新接口按预期返回 404，待签名 APK 上传后才会返回元数据。
- 未验证：签名 APK 未发布，原因是当前环境缺少 Android release keystore 配置；未在真实 Android 设备完成未知来源权限、下载中断、SHA-256 失败、系统安装确认和升级后版本验收。工作区已有运行时 `fridgeboard.log`、flycn 的 `.DS_Store`/`uv.lock` 均未纳入提交。
- 下一步：不再配置 flycn 发布 token；改由当前公开仓库 GitHub Release workflow 发布 APK，并在 Android 8+ 真机覆盖无更新、新版本、权限拒绝、断网、下载失败、签名不匹配和升级回滚场景。
- 审查记录：代码审查发现匿名更新 token 会在每次检查时写入且没有清理、APK 下载缺少大小上限、缺失最新文件时不会回退、CORS 作用范围过宽，以及页面卸载后未取消版本请求。本轮修复这些问题并补充回归测试。
- 修复完成：公开接口接收 `current_build_number`，无更新时不签发 token，并清理匿名过期 token；原生下载校验预期文件大小、256 MiB 硬上限和实际字节数；服务端按文件存在性回退可用版本；CORS 改为更新接口响应级别；前端版本请求支持 AbortController 和卸载取消。
- 修复验证：前端测试 29 个文件、269 passed，lint/build 通过；Android `:app:compileDebugJavaWithJavac` 通过；flycn pytest 32 passed、Ruff、compileall 和两仓库 `git diff --check` 通过。
- 修复验证：flycn 迁移兼容修复已在生产数据库（已有 `network_resources` 表、Alembic 版本 `0006`）完成升级并通过容器健康检查；本条状态更新为“已发布服务，待签名 APK 与真机验收”。

### 2026-08-24 — 发布当前 main 到生产服务器（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 提交 `9cffe17` 发布到生产服务器，自动生成正式 release，完成远程数据库备份、容器健康检查和公网健康检查。
- 范围：当前 `main` 提交中的项目代码、资源及本次发布记录；不提交 `.env`、数据库、令牌、生产数据或运行时日志；不创建分支、不推送远端 Git。
- 设计/需求基线：用户本次“发布到服务器”请求；项目发布规则；`scripts/deploy-image.sh`；生产固定 SSH 地址 `107.174.152.245`。
- 会话记录：已确认工作区干净，当前分支为 `main`，HEAD 为 `9cffe17`；发布配置为 `root@107.174.152.245:/opt/fridgeboard`，健康地址为 `https://fridge.flycn.fyi/healthz`。发布前进度记录已提交为 `013b4b6`，并以该提交执行发布。
- 预期验证：后端 Ruff/pytest、锁文件检查、前端测试/lint/build、脚本语法检查、发布脚本 dry-run、远程容器健康检查、公网健康检查和 `git diff --check` 通过。
- 发布前验证：`uv run ruff check backend`、`uv run pytest -q`（173 passed，54 条既有弃用警告）、`uv lock --check`、`npm run --prefix frontend test -- --run`（28 个文件、261 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run 和 `git diff --check` 均通过。
- 发布结果：提交 `013b4b6` 已部署到 `root@107.174.152.245:/opt/fridgeboard`；脚本自动生成 release `260824144647`；远程镜像摘要为 `sha256:910d130afc9efb2d791882b99140b0357f266fe9b5c8c73474455dce7891dde1`；数据库备份为 `/data/fridgeboard.db.backup-20260824-064707`，权限 `600`、属主 `appuser:appuser`、大小 `1216512` 字节；迁移版本为 `20260820_24 (head)`。
- 发布验证：容器状态为 `running/healthy`、重启次数 `0`；release 已进入 `/app/frontend/dist/assets/index-Dx3Uiicr.js`；`https://fridge.flycn.fyi/healthz` 返回 HTTP 200 和 `{"status":"ok"}`。
- 未验证：未在真实 Safari/iOS WebView、Android APK 或 PWA 安装流程中完成发布后人工视觉与交互验收；未推送远端 Git。

### 2026-08-24 — 首页右上角改为扫码录入入口（本次会话）

- 状态：待评审。
- 目标：保持首页顶部左侧物品列表入口不变，将右侧入口改为扫码/拍照录入；识别完成后复用现有添加物品表单和位置确认流程，让用户选择当前冰箱存放位置。
- 范围：`frontend/src/App.tsx`、`frontend/src/InventoryFlow.tsx`、必要的前端回归测试和本进度记录；不新增页面，不改变现有识别接口、位置选择规则和手工添加流程。
- 设计/需求基线：`docs/ui-design-specification.md`；功能设计 §6.3、§6.4、§6.9；最终设计 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`（添加物品/识别入口）与 `0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8`（确认位置）；当前首页设计 `23329191-d0fa-48ca-a517-fee9ff3eab9b`。
- 会话记录：用户更正入口方向为“左上角保持不变、右上角扫码”。已确认首页左侧原物品列表按钮保留，右侧改用现有扫码图标；`InventoryFlow` 已实现相机、扫码、识图、照片和位置确认状态。本轮保持相机页与位置确认页为现有页面。
- 完成：首页左上角继续进入全部物品列表；右上角改为“扫码添加物品”，点击后直接打开现有“识别物品”页面。扫码、识图或照片识别完成后回到现有添加表单，点击“加入冰箱”继续使用现有位置选择弹窗。
- 验证：`npm run --prefix frontend test -- --run`（28 个文件、261 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实 iOS Safari、Android WebView 或 PWA 安装环境进行相机权限和视觉验收；未提交或发布。工作区原有 `fridgeboard.log` 改动未触碰。

### 2026-08-24 — 发布当前 main 到生产服务器（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main`（包含本次未提交的前端样式/测试和进度记录改动）发布到生产服务器，自动生成 release，完成生产数据库备份、容器健康检查和公网健康检查。
- 范围：`docs/progress-tracker.md`、`frontend/src/App.test.ts`、`frontend/src/styles.css` 及当前 `main` 已提交内容；不提交 `.env`、数据库、令牌、生产数据或运行时日志，不创建分支、不推送远端。
- 设计/需求基线：用户本次“发布到服务器”请求；项目发布规则；`scripts/deploy-image.sh`；生产固定 SSH 地址 `107.174.152.245`。
- 会话记录：已确认当前分支为 `main`，本地比 `origin/main` 超前 3 个提交；工作区包含前端样式修复、回归测试、进度记录和运行时 `fridgeboard.log` 改动。运行时日志按项目日志规则保留在本地，不纳入发布提交；其余项目改动将在质量门禁通过后提交。
- 预期验证：后端 Ruff/pytest、锁文件检查、前端测试/lint/build、部署脚本语法检查、发布脚本 dry-run、`git diff --check`，以及正式发布后的远程数据库备份、容器健康检查和 HTTPS `/healthz` 检查。
- 完成：提交 `62c42f5` 已通过 `scripts/deploy-image.sh` 发布到 `root@107.174.152.245:/opt/fridgeboard`；脚本自动生成 release `260824115536`，完成数据库在线备份、远程 Docker 构建、容器重建和 HTTPS 健康检查。
- 发布结果：远程镜像摘要为 `sha256:b34006221306b7845bed1ff9ae84a87e27185f7cb6ae0f25be42c4d2654d01d6`；release 已进入 `/app/frontend/dist/assets/index-CUjtXUyh.js`；数据库备份为 `/data/fridgeboard.db.backup-20260824-035555`，权限 `600`、属主 `appuser:appuser`、大小 `1212416` 字节；容器为 `running/healthy`、重启次数 `0`，Alembic 为 `20260820_24 (head)`；公网 `/healthz` 返回 `{"status":"ok"}`。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（173 passed，54 条既有依赖弃用警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（28 个文件、259 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、正式发布和 `git diff --check` 均通过。
- 未验证：未在真实 Safari/iOS WebView、Android APK 或 PWA 安装流程中完成发布后人工视觉与交互验收；未推送远端 Git。工作区仍保留未纳入提交的运行时 `fridgeboard.log` 改动。
- 下一步：在生产网页版及真实设备刷新资源，验收拟物主题添加按钮、物品列表右箭头及相关页面交互后，将本条标记为完成。

### 2026-08-24 — 恢复拟物主题物品列表底部添加按钮背景（本次会话）

- 状态：待评审。
- 目标：修复拟物主题物品列表底部“＋ 添加物品”按钮只显示纯文本、缺少实体按钮轮廓背景的问题；保留其他文本加号入口的透明浮雕样式。
- 范围：`frontend/src/styles.css`、相关前端样式契约测试和本进度记录；不改变添加物品、选择物品、数量或列表导航行为。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §7、§8；物品列表功能规则 §3.6–§3.7；拟物主题全部物品评审资产 `skeuomorphic-app-system-v3`。
- 预期验证：`.p5-add-item.p5-add-item-plus` 在拟物主题使用主按钮实体材质、伪元素背景和按下态；其他文本加号按钮继续保持透明；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认物品列表按钮同时带有 `.p5-add-item` 与 `.p5-add-item-plus`，近期统一文本加号规则误将 `.p5-add-item-plus` 纳入透明例外，覆盖了底部主按钮材质；本轮将移除该误分类并补充选择器契约。
- 完成：从拟物主题文本加号选择器移除 `.p5-add-item-plus`，恢复其继承 `.bottom-action-bar` 主按钮的三切片背景、软影和按下态；分类器中的其他文本加号入口保持透明浮雕样式。
- 验证：`npm run --prefix frontend test -- --run`（28 个文件、259 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；Playwright 本地实测拟物主题 320×844、390×844、430×844，三种视口 `scrollWidth` 均等于视口宽度，按钮均为 56px 高；computed style 确认 `primary-master.webp` 伪元素和底部软影存在；390px 截图已保存为 `.playwright-cli/page-2026-08-24T03-41-19-788Z.png`。
- 未验证：尚未在真实 iOS Safari/WebView 设备上进行像素级验收；未提交或发布。
- 下一步：评审拟物主题物品列表底部按钮的材质、文字对比度与按下反馈，确认后按发布流程处理。

### 2026-08-24 — 修复 iOS 物品列表右箭头横向溢出（本次会话）

- 状态：待评审。
- 目标：修复 iOS 物品列表中冰箱位置右箭头超出拟物物品框并造成页面横向滚动的问题；保持其他平台和物品列表交互不变。
- 范围：`frontend/src/styles.css`、相关前端样式契约测试和本进度记录；不改变库存数据、排序、数量操作或导航行为。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；物品列表共用布局规则及功能规则 §3.6。
- 预期验证：冰箱名称与右箭头按钮始终限制在物品行第三列内，320px、390px 和 430px 布局无横向溢出；运行相关前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认 `.p5-inventory-item` 第三列固定为 `106px`，但 `.p5-inventory-fridge` 宽度固定为 `160px`（窄屏为 `144px`），按钮会突破拟物全宽物品行；本轮将移除固定超出宽度的约束并补充 CSS 契约。
- 完成：`.p5-inventory-fridge` 改为 `width: 100%` 并使用 `border-box`，删除窄屏下的固定 `144px` 覆盖；右箭头与冰箱名称现在受实际第三列轨道约束，不改变数量控件和列表交互。
- 验证：`npm run --prefix frontend test -- --run`（28 个文件、259 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增物品列表样式契约测试。
- 未验证：尚未在真实 iOS Safari/WebView 设备上进行像素级验收；未提交或发布。

### 2026-08-24 — 统一 iOS 日期输入框与购物清单输入框焦点样式（本次会话）

- 状态：待评审。
- 目标：修复 iOS Safari 下编辑物品页面生产日期、保质期至输入框过扁且缺少拟物凹陷效果的问题；统一编辑购物清单物品名称及其他同类普通输入框的焦点态，保留内置图标搜索框的特殊样式。
- 范围：前端输入框样式规则、必要的输入框语义类名、前端回归测试和本进度记录；不改变日期/购物清单数据逻辑，不修改搜索框样式例外。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；P5 编辑物品与 P9 编辑购物清单最终设计及现有拟物主题输入框令牌。
- 预期验证：普通文本、数字、日期和多行输入框在拟物主题下尺寸、凹陷阴影和焦点态一致；搜索框继续保留独立样式；运行相关前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认 P5 日期输入直接使用原生 `type="date"`，现有拟物规则将其纳入通用输入框但未覆盖 iOS 原生外观；P9 购物清单输入框焦点时被通用焦点规则排除，需统一普通输入框的焦点态，同时维持搜索框例外。
- 完成：拟物主题普通输入框、选择框和多行输入框的焦点态统一使用内凹阴影；P5 编辑物品日期输入固定 48px 高度并关闭 iOS 原生外观差异；P9 编辑购物清单物品名称输入获得焦点时恢复 3D 凹陷；搜索输入层和数量步进输入保持独立样式。
- 验证：`npm run --prefix frontend test -- --run`（28 个文件、258 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增拟物输入框样式契约断言。
- 未验证：尚未在真实 iOS Safari、Android WebView 或真实设备上进行像素级视觉验收；未提交或发布。

### 2026-08-24 — 修复编辑物品返回确认位置后白屏（本次会话）

- 状态：待评审。
- 目标：修复编辑物品页面打开“确认位置”后点击左上角返回出现白屏的问题；返回后保留原编辑表单和已选择的数据。
- 范围：`frontend/src/InventoryFlow.tsx`、相关前端回归测试和本进度记录；不改变位置选择、保存和物品编辑业务规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`、P5 编辑物品与位置确认流程；现有 `InventoryFlow` 状态管理。
- 预期验证：从编辑物品进入确认位置再返回时恢复编辑页，不出现空白渲染；新增可复现回归断言，并运行前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认该流程由 `InventoryFlow` 内部 `view` 状态驱动；位置页返回时原先复用同一个 `PageShell` DOM，退出动画可能把返回后的编辑页一并保持为透明状态。本轮为“确认位置”和“编辑物品”页面壳增加稳定 key，使返回时卸载已退出页面并重新挂载编辑页。
- 完成：修复编辑物品进入确认位置后点击左上角返回的白屏风险；编辑草稿、位置和数量状态仍由 `InventoryFlow` 保留。
- 验证：新增 `frontend/src/InventoryFlow.test.ts` 契约测试；真实浏览器链路验证返回后标题为“编辑物品”且 `.p5-edit` 存在；`npm run --prefix frontend test -- --run`（28 个文件、257 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android 设备进行页面转场验收。

### 2026-08-24 — 发布当前 main 到生产服务器（本次会话）

- 状态：完成。
- 目标：将当前 `main` 提交 `84d4ba2` 发布到生产服务器，生成正式 release，完成远程数据库备份、容器健康检查和公网健康检查。
- 范围：当前 `main` 提交中的项目代码与资源；不提交 `.env`、数据库、令牌、生产数据或其他敏感文件；不创建分支、不推送远端。
- 设计/需求基线：用户本次“发布到服务器”请求；项目发布规则；`scripts/deploy-image.sh`；生产固定 SSH 地址 `107.174.152.245`。
- 预期验证：后端 Ruff/pytest、锁文件检查、前端测试/lint/build、脚本语法检查、发布脚本 dry-run、远程容器健康检查和 `HEALTH_URL` 健康检查通过；记录提交号、release 号、镜像标识、数据库备份、验证结果和未验证项。
- 会话记录：已确认当前 `main` 为 `84d4ba2`，初始工作区干净；发布配置为 `root@107.174.152.245:/opt/fridgeboard`，健康地址为 `https://fridge.flycn.fyi/healthz`；本条进度记录将作为发布前状态纳入提交。
- 发布记录：发布提交 `b2bd13f` 已部署到 `root@107.174.152.245:/opt/fridgeboard`；脚本生成 release `260824035303`；容器镜像摘要为 `sha256:ccab0e61c57cbb76053a27231bb59552c180e70fdd797b60cb94aa4e178431d1`；迁移版本为 `20260820_24 (head)`。
- 发布验证：远程数据库备份 `/data/fridgeboard.db.backup-20260823-195331` 存在，权限 `600`、属主 `appuser:appuser`、大小 `1196032` 字节；容器为 `running/healthy`，重启次数为 `0`；release 已进入 `/app/frontend/dist/assets/index-bKjq0qCJ.js`；`https://fridge.flycn.fyi/healthz` 返回 HTTP 200 和 `{"status":"ok"}`。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（173 passed，56 条既有警告）、`uv lock --check`、`npm run --prefix frontend test -- --run`（27 个文件、256 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、远程容器健康检查、公网健康检查和 `git diff --check` 均通过。
- 未验证：未在真实 Safari/iOS WebView、Android APK 或 PWA 安装流程中进行发布后人工视觉与交互验收；未推送远端 Git。
- 下一步：在生产网页版及真实设备刷新资源并完成发布后视觉与交互验收。

### 2026-08-24 — 修正图标资源处理规则并移除额外留白（本次会话）

- 状态：完成。
- 目标：按用户新增的项目规则，撤销图标生成时擅自加入的 margin/padding/安全留边，仅将 `/Users/jason/Downloads/冰箱3.png` 等比放缩到各平台目标尺寸；同步把规则写入项目 `AGENTS.md`。
- 范围：Web/PWA、Android、iOS 图标资源及相关资源契约；splash 外层背景仅保留用户前一轮明确要求的边沿色例外，不改变图片本体。
- 设计/需求基线：用户本次明确要求“严禁未经同意篡改我给的图片资源，只允许放缩”；新增 `AGENTS.md` 用户图片资源规则。
- 预期验证：所有图标输出与源图保持相同宽高比和画布占比，不含额外 margin/padding；资源格式和尺寸符合平台引用；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认当前图标存在约 70% 缩放和外层留白，本轮将改为直接 `sips -z` 等比缩放，不再使用 `sips -p` 生成图标画布。
- 完成：Web favicon、Apple touch icon、PWA icon、HTML boot icon、Android launcher/round/foreground 和 iOS AppIcon 均改为对 `冰箱3.png` 直接等比缩放；删除图标额外 margin/padding；新增带 `ice3` 后缀的 Web/PWA URL 以绕过远程旧文件缓存；`AGENTS.md` 已加入用户图片资源硬规则。
- 验证：逐文件 PNG 格式检查通过；视觉检查确认图标主体铺满目标画布；`npm run --prefix frontend test -- --run`（27 个文件、256 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`./gradlew --no-daemon :app:assembleDebug`、`xcodebuild -project frontend/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` 均通过。
- 未验证：尚未执行下一次远程发布，因此线上 CDN 仍可能返回旧 URL 资源；尚未在真实设备确认系统 mask 行为；未提交或发布。
- 下一步：按发布流程发布本次版本，确认线上 HTML/manifest/Service Worker 使用 `ice3` 资源 URL 后，再在 iOS PWA 删除旧图标并重新安装验收。

### 2026-08-24 — 修复远程 PWA 图标缓存与 iOS 启动背景（本次会话）

- 状态：进行中。
- 目标：解决发布后 iOS PWA 和普通浏览器仍读取旧图标、iOS 启动背景与新版图标边沿色不一致、启动时出现黑屏的问题。
- 范围：Web/PWA 图标 URL、manifest 背景色、HTML 启动色、Service Worker 缓存清单/版本及相关前端契约测试；不改变业务逻辑和移动原生 App 资源。
- 设计/需求基线：用户本次反馈；线上 `fridge.flycn.fyi` 响应对比；当前 `frontend/index.html`、`frontend/public/manifest.webmanifest`、`frontend/public/sw.js`。
- 预期验证：图标使用新 URL 绕过 CDN 旧文件缓存；manifest、HTML 和 splash 使用新版边沿色；前端测试、lint、生产构建和 `git diff --check` 通过，并验证线上响应在发布后包含新 URL/颜色。
- 会话记录：已确认线上 `apple-touch-icon.png` 为旧哈希且 Cloudflare `HIT`，线上 `sw.js` 仍为 `v6`；本地新版同名图标哈希不同，manifest 仍为 `#FFFFFF`，需要同时修复资源寻址和启动背景契约。

### 2026-08-24 — 发布当前 main 到生产服务器（本次会话）

- 状态：完成。
- 目标：将当前 `main` 提交 `51268fc` 发布到生产服务器，生成正式 release，完成远程数据库备份、容器健康检查和公网健康检查。
- 范围：当前 `main` 提交中的项目代码与资源；不提交 `.env`、数据库、令牌、生产数据或其他敏感文件；不创建分支、不推送远端。
- 设计/需求基线：用户本次“发布到服务器”请求；项目发布规则；`scripts/deploy-image.sh`；生产固定 SSH 地址 `107.174.152.245`。
- 预期验证：后端 Ruff/pytest、锁文件检查、前端测试/lint/build、脚本语法检查、发布脚本 dry-run、远程容器健康检查和 `HEALTH_URL` 健康检查通过；记录提交号、release 号、镜像标识、数据库备份、验证结果和未验证项。
- 会话记录：已确认工作区干净，当前分支为 `main`，HEAD 为 `51268fc`；发布配置为 `root@107.174.152.245:/opt/fridgeboard`，健康地址为 `https://fridge.flycn.fyi/healthz`；dry-run 已通过。
- 完成：发布提交 `5dd6d40` 已部署到 `root@107.174.152.245:/opt/fridgeboard`；脚本生成 release `260824032038`；容器镜像标识为 `sha256:87ee9d3e324ab9dbf29b871d3af20054b112b3c6eb865e9f27fad6082b36710f`；迁移版本为 `20260820_24 (head)`。
- 发布验证：远程数据库备份 `/data/fridgeboard.db.backup-20260823-192054` 存在，权限 `600`、属主 `appuser:appuser`、大小 `1196032` 字节；容器为 `running/healthy`，重启次数为 `0`；release 已进入 `/app/frontend/dist/assets/index-DgxC1uRF.js`；`https://fridge.flycn.fyi/healthz` 返回 HTTP 200 和 `{"status":"ok"}`。
- 验证：`uv run ruff check backend`、`uv run pytest`（173 passed，54 条既有警告）、`uv lock --check`、`npm run --prefix frontend test -- --run`（27 个文件、256 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、远程容器健康检查、公网健康检查和 `git diff --check` 均通过。
- 未验证：未在真实 Safari/iOS WebView、Android APK 或 PWA 安装流程中进行发布后人工视觉与交互验收；远端 `/opt/fridgeboard` 保留有 `2026-08-10` 历史遗留的 macOS `._*` 文件，本次未清理。
- 下一步：完成生产网页版及真实设备的发布后验收，并在后续维护窗口清理服务器部署目录中的历史 `._*` 文件。

### 2026-08-24 — Android/iOS 原生 App 锁定竖屏（本次会话）

- 状态：待评审。
- 目标：让 Android 与 iOS Capacitor App 始终保持竖屏，系统旋转时不进入横屏；不改变 PWA 已有的竖屏配置和页面业务行为。
- 范围：Android `MainActivity` 屏幕方向声明、iOS 支持方向声明、原生方向契约测试和本进度记录；不修改桌面/PWA 页面布局、API 或认证逻辑。
- 设计/需求基线：用户本次明确提出的“安卓和ios app锁定屏幕旋转，一致保持竖屏”；现有 Capacitor 移动端工程与 PWA 竖屏约定。
- 预期验证：Android/iOS 原生配置仅允许 portrait，相关契约测试、前端 lint、生产构建、Android Debug 构建和 `git diff --check` 通过；真实设备方向行为待人工验收。
- 会话记录：已确认 PWA manifest 和启动时 `Screen Orientation API` 已具备竖屏能力，但 Android manifest 未声明 `screenOrientation`，iOS `Info.plist` 仍包含横屏和 iPad 倒置方向。本轮将仅补齐原生壳配置与回归断言。
- 完成：Android `MainActivity` 增加 `android:screenOrientation="portrait"`；iOS iPhone/iPad 支持方向均仅保留 `UIInterfaceOrientationPortrait`，并设置 `UIRequiresFullScreen` 防止 iPad 多任务容器要求横屏适配；新增原生方向契约测试。
- 验证：方向契约测试 3 passed；前端全量测试 27 个文件、255 passed；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npx cap sync android`、`npx cap sync ios`、Android `env -u JAVA_HOME ./gradlew --no-daemon assembleDebug`、iOS Simulator Debug `xcodebuild` 和 `git diff --check` 均通过；构建产物核对确认 iOS 两组方向数组和 Android merged manifest 均仅允许竖屏。
- 未验证：未在真实 Android/iOS 设备上切换系统自动旋转并进行人工验收；未提交或发布。
- 下一步：安装最新 Android APK 和 iOS 包，在真实设备开启自动旋转后确认始终保持竖屏，再并入 P13/P11 综合验收。

### 2026-08-24 — 修复 Android 拟物主题安全区底色不一致（本次会话）

- 状态：完成。
- 目标：让 Android App 在拟物主题下的顶部/底部系统安全区与应用壳底色保持一致，消除安全区与底部背景之间的色差。
- 范围：主题色初始元数据、Android 原生壳背景资源、相关前端回归测试和本进度记录；不改变主题切换、页面布局或其他主题配色。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §4.4、§5；最终拟物主题共享令牌 `--chrome: #EBE6DD`。
- 预期验证：拟物主题运行时 `theme-color`、首帧元数据、Android 原生壳背景与应用底色一致；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认拟物主题最终应用壳底色为 `#EBE6DD`，但 `frontend/android/app/src/main/res/values/colors.xml` 的 `app_chrome` 和 `frontend/index.html` 首帧 body 背景仍为白色；透明系统栏会暴露该不一致。
- 完成：将 Android 原生 `app_chrome`、Capacitor root/Android 背景色和首帧加载背景统一为 `#EBE6DD`；透明系统栏和 CSS 安全区处理保持不变；补充 Android 壳颜色回归断言。
- 验证：移动端安全区专项测试 1 passed；前端全量测试 27 个文件、254 passed；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npx cap sync android`、`./gradlew assembleDebug` 和 `git diff --check` 均通过；已核对生成的 `frontend/android/app/src/main/assets/capacitor.config.json` root/Android 背景色为 `#EBE6DD`，构建产物首帧背景同步为拟物底色。
- 未验证：未在真实 Android 设备或 APK 安装后进行安全区像素级视觉验收；未提交或发布。
- 下一步：在真实 Android 设备安装最新 APK，确认顶部状态栏和底部导航安全区与拟物应用壳连续一致。
- 会话追加：Android 10 真机复测顶部状态栏仍为白色；确认当前透明 `statusBarColor` 在该系统版本上没有使用 `windowBackground` 作为可见底色，因此改为让启动主题和主主题直接使用 `@color/app_chrome`，并补充原生主题颜色断言。
- 完成追加：`AppTheme.NoActionBarLaunch` 与 `AppTheme.NoActionBar` 的状态栏、导航栏均改为 `@color/app_chrome`，避免 Android 10 透明系统栏回退为白色。
- 验证追加：移动端安全区专项测试 1 passed；前端全量测试 27 个文件、254 passed；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npx cap sync android`、`./gradlew assembleDebug` 和 `git diff --check` 均通过。
- 未验证追加：尚未在 Android 10 真机安装本轮新 APK 后复测状态栏颜色；旧 APK 不包含本轮原生主题资源变更。
- 真机验证追加：已在 Android 10 设备 `28ffa63d` 安装 `frontend/android/app/build/outputs/apk/debug/app-debug.apk` 并启动应用；截图确认顶部系统状态栏与拟物主题奶油白背景一致，底部导航安全区未出现白色条带。

### 2026-08-24 — 发布当前 main 到生产服务器（本次会话）

- 状态：完成。
- 目标：将当前 `main` 的已完成拟物主题及相关资源变更发布到生产服务器，生成并注入正式 release，完成远程数据库备份、容器健康检查和公网健康检查。
- 范围：当前工作区中除 `.deploy.env`、`.env*`、运行日志和其他忽略文件外的项目改动；按 `scripts/deploy-image.sh` 发布，不创建分支、不推送远端。
- 设计/需求基线：用户本次明确发布请求；项目发布规则、`scripts/deploy-image.sh` 和当前 `main` 提交历史。
- 预期验证：后端 Ruff/pytest、锁文件检查、前端测试/lint/build、`git diff --check`、发布脚本 dry-run、远程容器健康检查和 `HEALTH_URL` 健康检查通过；记录提交号、release 号、镜像标识、数据库备份和未验证项。
- 会话记录：已确认 `main` 当前为 `b4a8197`，唯一未提交项目文件为本进度记录；发布规则要求将该项目改动纳入本次发布提交，敏感配置不会进入 Git 或发布归档。
- 完成：发布提交 `e0e3153` 已部署到 `root@107.174.152.245:/opt/fridgeboard`；脚本生成 release `260824023815`，远程数据库备份为 `/data/fridgeboard.db.backup-20260823-183834`，容器状态为 `healthy`，公网 `https://fridge.flycn.fyi/healthz` 返回 HTTP 200 和 `{"status":"ok"}`。
- 镜像标识：`sha256:76bd0e0e23d3b1677b4b0cc376d35e71816bff14f4562ae03369e197fbb89b15`。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（173 passed，54 warnings）、`uv lock --check`、`npm run --prefix frontend test -- --run`（27 个文件、254 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、远程容器健康检查和公网健康检查均通过；备份文件已在容器内确认存在且权限为 `600`。
- 未验证：未在真实 Safari/iOS WebView、Android APK 或 PWA 安装流程中进行发布后人工视觉与交互验收；未推送远端 Git。
- 下一步：在生产网页版及真实设备刷新资源，确认拟物默认主题、图标和启动画面；完成真实设备验收后关闭相关待评审项。

### 2026-08-24 — 将拟物主题置顶并设为默认主题（本次会话）

- 状态：完成。
- 目标：在主题设置中将“拟物”置于第一项，并将新安装或无有效本机主题偏好时的默认主题改为拟物。
- 范围：`frontend/src/theme.ts`、`frontend/src/themeSettings.test.ts`、`frontend/src/theme.test.ts`、首屏主题回退相关需求文档和本进度记录；不覆盖用户已保存的主题选择，不改变主题 key、切换流程或其他主题视觉。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/final-ui-designs.md` 主题系统冻结基线；`docs/ui-assets/proposals/theme-system-design.html` 与 PNG；现有主题注册表和本机偏好持久化实现。
- 预期验证：主题设置首项为“拟物”；无保存值、未知值或存储不可用时读取 `skeuomorphic`；已保存的水墨/卡通值继续准确读取；前端主题测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认设置页通过 `Object.keys(THEME_REGISTRY)` 渲染顺序，默认主题和无效值回退均由 `DEFAULT_THEME` 控制；`localStorage` 中已有合法值会优先保留，不会因默认值调整被覆盖。
- 完成：将 `THEME_REGISTRY` 的首项改为拟物，将 `DEFAULT_THEME` 和首屏无保存值回退改为 `skeuomorphic`；已保存的合法主题仍优先读取；同步主题色和功能/设计文档。
- 验证：主题专项测试（2 个文件、10 passed）、前端全量测试（27 个文件、254 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；构建产物首屏脚本已确认默认使用拟物并保留合法本机值。
- 未验证：未在真实 PWA、Android/iOS WebView 或真机上进行主题设置点击和系统状态栏视觉验收；未提交或发布。
- 下一步：在真实设备确认主题设置首项及首次启动效果后，按发布流程处理。

### 2026-08-24 — 使用冰箱3.png 更新无裁剪图标与 splash 背景（本次会话）

- 状态：完成。
- 目标：使用 `/Users/jason/Downloads/冰箱3.png` 替换现有全部 Web/PWA、Android、iOS 图标和启动画面；继续保持等比缩放、不裁剪，并按新版图片边沿色更新 splash 底色。
- 范围：当前图标与 splash 资源文件；不改变资源路径、业务逻辑或其他用户改动。
- 设计/需求基线：用户本次指定图片；上一轮确认的约 70% 安全区留边方案；PWA maskable、Android adaptive icon、iOS AppIcon 的系统裁切约束。
- 预期验证：图标主体完整可见，splash 背景使用 `冰箱3.png` 边沿采样色，所有资源尺寸/格式正确；前端测试、lint、生产构建、Android/iOS 原生构建和 `git diff --check` 通过。
- 会话记录：已确认新版图片为 1848×1848 RGB PNG，无透明通道；将沿用上一轮安全留边生成方式，仅重新采样边沿色并替换资源内容。
- 完成：所有 Web/PWA、Android、iOS 图标均使用 `冰箱3.png` 等比缩放到约 70% 画布并居中留边；所有 splash 外层背景改为边沿平均色 `#F6F7F1`。
- 验证：已视觉检查新版图标和横竖屏 splash；逐文件 PNG 格式与尺寸检查通过；`npm run --prefix frontend test -- --run`（27 个文件、252 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`./gradlew --no-daemon :app:assembleDebug`、`xcodebuild -project frontend/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Android/iOS 设备和 Safari PWA 安装流程中确认不同系统 mask 的最终裁切、缓存更新与启动画面时序；当前连接的 iOS 真机处于锁屏状态；未提交或发布。
- 下一步：真机清理旧 PWA/应用缓存后复核新版图标与 splash，确认后按发布流程处理。

### 2026-08-24 — 修复图标裁剪并调整 PWA splash 底色（本次会话）

- 状态：完成。
- 目标：修复上一轮使用 `冰箱2.png` 生成图标时主体在系统图标安全区/圆角 mask 中显示不完整的问题；所有图标只做等比缩放，不裁剪，并将 PWA splash 底色设置为图标边沿色。
- 范围：上一轮 Web/PWA、Android、iOS 图标与 splash 资源及生成引用；不改变业务逻辑、页面布局或其他用户改动。
- 设计/需求基线：用户本次反馈；`/Users/jason/Downloads/冰箱2.png`；PWA maskable、Android adaptive icon、iOS AppIcon 的安全区约束。
- 预期验证：新版图标主体完整可见，资源均为有效 PNG 且尺寸符合平台引用；splash 使用边沿采样色作为底色；前端测试、lint、生产构建、原生构建和 `git diff --check` 通过。
- 会话记录：已定位上一轮直接将满幅源图写入 adaptive/maskable 图标的风险；本轮先测量源图边沿颜色，再以安全边距生成透明图标画布，并用边沿色填充 splash 背景。
- 完成：所有图标改为源图等比缩放至约 70% 画布并居中留边，避免 Android adaptive、PWA maskable 和 iOS 圆角 mask 裁剪主体；所有 Web/Android/iOS splash 画布使用源图 8px 边沿平均色 `#FDFEFD` 填充。
- 验证：视觉检查确认冰箱主体完整；逐文件 PNG 格式与尺寸检查通过；`npm run --prefix frontend test -- --run`（27 个文件、252 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`./gradlew --no-daemon :app:assembleDebug`、`xcodebuild -project frontend/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Android/iOS 设备和 Safari PWA 安装流程中确认不同系统 mask 的最终裁切、缓存更新与启动画面时序；当前连接的 iOS 真机处于锁屏状态；未提交或发布。
- 下一步：真机清理旧 PWA/应用缓存后复核新版图标与 splash，确认后按发布流程处理。

### 2026-08-24 — 使用冰箱2.png 更新应用图标与启动画面（本次会话）

- 状态：完成。
- 目标：使用 `/Users/jason/Downloads/冰箱2.png` 替换现有网站 favicon、PWA 安装图标、移动端应用图标和 Web/原生启动画面，保持各平台既有尺寸与格式契约。
- 范围：上一轮图标资源对应的 Web、Android、iOS 图片文件；不改变页面结构、业务逻辑、manifest 路径或其他用户改动。
- 设计/需求基线：用户本次指定的新版图片；现有 `frontend/index.html`、`frontend/public/sw.js`、Android resource density 目录和 iOS asset catalog。
- 预期验证：各平台资源均由新版图片生成且尺寸符合引用；前端测试、lint、生产构建、Android/iOS 原生构建和 `git diff --check` 通过。
- 会话记录：已确认新版图片为 2048×2048 RGBA PNG；已确认当前所有图标和 splash 引用沿用上一轮资源路径，本轮只替换其内容。
- 完成：使用 `冰箱2.png` 重生成并覆盖 Web/PWA 的 favicon、Apple touch icon、192/512 图标和 1024 启动图；Android 五档 launcher、round launcher、adaptive foreground、横竖屏 splash；iOS AppIcon 与三套 Splash 图片，未改变资源路径和应用逻辑。
- 验证：逐文件 PNG 格式与尺寸检查通过；`npm run --prefix frontend test -- --run`（27 个文件、252 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`./gradlew --no-daemon :app:assembleDebug`、`xcodebuild -project frontend/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Android/iOS 设备和 Safari PWA 安装流程中确认系统图标裁切、缓存更新与启动画面时序；当前连接的 iOS 真机处于锁屏状态；未提交或发布。
- 下一步：真机安装并清理旧 PWA/应用缓存后复核新版图标与启动画面，确认后按发布流程处理。

### 2026-08-24 — 移除拟物主题底部导航选中图标高亮（本次会话）

- 状态：待评审。
- 目标：拟物主题底部导航条中，选中入口的图标不再显示额外高亮填充；保留导航入口、文字和选中语义行为。
- 范围：`frontend/src/styles.css`、对应前端样式契约测试和本进度记录；不改变导航路由、图标线条、文字或其他主题。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` 的主题隔离、导航共享实现和选中状态表达规则；现有 `P7Navigation` 与拟物主题导航壳实现。
- 预期验证：拟物主题选中图标填充保持透明，未选中图标与文字行为不变；运行相关前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已定位拟物主题选中图标高亮由 `.p7-nav button.is-active .p7-nav-icon--skeuomorphic .p7-nav-icon-fill` 的 `var(--skeu-control)` 填充产生，本轮仅移除该填充并同步测试断言。
- 完成：恢复拟物主题导航 SVG 的整体浮雕滤镜，并在选中态隐藏底层 `.p7-nav-icon-fill` 奶白图标层，仅保留上层彩色图标；水墨与卡通主题未改动。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（128 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView 或 320/390/430px 真机上进行像素级视觉验收；未提交或发布。
- 下一步：在拟物主题底部导航人工确认选中图标与未选中图标无额外高亮填充，确认后按发布流程处理。
- 会话追加：用户指出本轮误改了选中图标填充而非左上白边高光；已先将 `fill: var(--skeu-control)` 和原测试断言恢复，后续只处理拟物图标滤镜产生的左上高光。
- 会话追加：进一步确认白边来自整个导航 SVG 的 `skeuomorphic-emboss` 滤镜处理选中填充路径；本轮将滤镜收窄到图标线条/轮廓，保留选中填充颜色但移除其左上高光。
- 会话追加：用户要求先恢复上一轮滤镜范围，并指出白边可能来自选中态底层奶白 `.p7-nav-icon-fill` 与上层彩色图标叠加；本轮先恢复整体滤镜，再隐藏选中态底层填充图标层。
- 会话追加：用户要求停止继续修改应用页面；已恢复选中填充色和原页面样式，后续仅新增独立原型 HTML 对底层填充与滤镜组合进行对照实验。
- 完成：应用页恢复到原有选中填充和整图滤镜规则；新增 `docs/prototypes/p7-nav-emboss-layers.html`，提供当前组合、去掉底层、仅线条滤镜、仅填充滤镜和无滤镜五组对照及实时开关。
- 验证：原有 `frontend/src/App.test.ts`（128 passed）、原型文件存在性检查和 `git diff --check` 均通过；未继续修改应用页面或运行生产构建。
- 未验证：尚未在浏览器中打开原型并根据视觉结果确定最终根因；未提交或发布。
- 下一步：打开独立原型，先比较“当前实现”和“去掉底层”两组，再根据白边是否消失决定后续应用页修复方向。
- 会话追加：用户指出原型图标路径被简化；已按 `frontend/src/sharedUi.tsx` 的 shopping 图标逐字恢复完整 `path`、两条 `NAV_ICON_ENCLOSED.shopping` 填充路径、`24×24` viewBox 及 `#DCC9B6`/`#CCB8A1` 颜色，应用页面未修改。
- 会话追加：截图检查发现原型未复用工程 `.p7-nav` 末端定位规则且图标被错误放大；已改为直接加载 `frontend/src/styles.css`、使用相同 SVG class/选中按钮结构和 `26px` 尺寸，并截图确认五组组合均实际渲染。
- 验证追加：Playwright 截图 `output/playwright/p7-nav-emboss-layers-checked.png` 已检查；当前实现对照使用工程实际颜色、整体 `skeuomorphic-emboss` 滤镜和图标 DOM，原型路径契约及 `git diff --check` 通过。
- 会话追加：用户确认白边由“整张 SVG 加滤镜”产生；本轮将移除拟物底部导航图标 SVG 的整体 `skeuomorphic-emboss` 滤镜，保留选中填充、图标路径和颜色。
- 会话追加：刷新后未生效的根因是早期高优先级选中态规则 `[data-theme="skeuomorphic"] .p7-nav button.is-active .p7-nav-icon` 仍注入 `drop-shadow`；本轮一并清除该选中态滤镜覆盖。
- 会话追加：用户复测确认直接移除整张 SVG 滤镜导致浮雕和阴影同时消失；本轮改为新增导航专用“去高光但保留漫反射浮雕与接触阴影”滤镜，仅替换底部导航图标使用的滤镜。
- 完成：拟物主题底部导航改用 `skeuomorphic-nav-emboss` 专用滤镜；移除 `specular-light` 高光分支，保留 `contact-shadow` 阴影和 `diffuse-face` 浮雕，填充色、图标路径和导航选中行为保持不变。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（128 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；Playwright 计算样式确认导航 SVG 使用 `url("#skeuomorphic-nav-emboss")`，填充为 `rgb(220, 201, 182)`，图标为 `rgb(204, 184, 161)`，并已完成截图检查。
- 未验证：尚未在真实 Safari/iOS WebView 或真机上复核去除滤镜后的最终像素效果；未提交或发布。

### 2026-08-24 — 清除拟物主题编辑物品图标按钮材质（本次会话）

- 状态：待评审。
- 目标：让编辑物品页面 `p5-icon-grid` 内的分类/物品图标按钮在拟物主题下保持透明、无边框、无背景和无阴影。
- 范围：`frontend/src/styles.css`、相关前端样式契约测试和本进度记录；不改变图标选择、分类切换、搜索及编辑流程行为。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` 的主题控件规则、图标按钮热区和现有编辑物品页面实现。
- 预期验证：拟物主题下 `.p5-icon-grid button` 的计算样式不再继承通用控件阴影，水墨和卡通主题保持现状；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认拟物主题全局 `button` 规则注入 `box-shadow: var(--control-shadow)`，优先级覆盖 `.p5-icon-grid button` 的基础透明样式；本轮仅增加编辑物品图标按钮的主题专属视觉重置和对应契约断言。
- 完成：拟物主题 `.p5-icon-grid button` 强制使用 `border: 0`、`background: transparent` 和 `box-shadow: none`；图标 `span` 的拟物容器材质和选中态保持不变。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（128 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView 或 320/390/430px 真机上进行像素级视觉验收；未提交或发布。
- 下一步：重新打开编辑物品页确认图标容器不再显示浅凸起，确认后按发布流程处理。
- 会话追加：用户复测确认视觉仍为浅凸起；进一步定位到 `.p5-icon-grid button > span` 在后段拟物规则中仍绘制 `background`、边框和 `var(--skeu-raised-shadow)`，本轮将按钮本体与图标容器一并强制透明。

### 2026-08-24 — 修正拟物主题物品列表背景层全宽（本次会话）

- 状态：待评审。
- 目标：修复物品列表页 `p5-inventory-item` 两侧与中间颜色不一致的问题，让实际承载拟物材质的父级 `p5-inventory-items` 背景延伸到屏幕边沿。
- 范围：`frontend/src/styles.css`、相关前端样式契约测试和本进度记录；不改变物品列表数据、数量操作、排序、选择和页面导航行为。
- 设计/需求基线：用户本次复测反馈；浏览器计算样式确认 `p5-inventory-item` 自身透明，背景来自父级 `section.p5-inventory-items`；现有拟物主题列表材质和页面壳规则。
- 预期验证：物品列表父级材质层覆盖屏幕左右边沿，行内容和分隔线不被重复外扩；其他主题保持现状；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已通过 Playwright 页面链路定位到拟物主题下父级 `section` 的 `surface-control` 背景优先级高于基础透明规则；本轮只调整物品列表父级背景层和对应契约测试。
- 完成：拟物主题 `.p5-inventory-items` 使用 `min(100vw, 430px)` 和内容区抵消铺满应用壳，并保留 `surface-control` 材质；子项继续以自身横向出血覆盖分隔线，窄屏同步使用 `16px` 内容区。
- 验证：Playwright 390×844 实测拟物主题下 `.p5-inventory-items` 与 `.p5-inventory-item` 均为 `x=0`、`width=390px`、`right=390px`；`npm run --prefix frontend test -- --run`（27 个文件、250 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView 或不同安全区设备上进行像素级视觉验收；未提交或发布。
- 下一步：在真实拟物主题物品列表页确认连续背景和分隔线视觉，确认后按发布流程处理。

### 2026-08-24 — 主题设置文案改为“水墨”（本次会话）

- 状态：待评审。
- 目标：将主题设置中的“水墨屏”展示名称改为“水墨”。
- 范围：`frontend/src/theme.ts`、主题注册表回归测试和本进度记录；不改变主题 key、视觉样式、主题切换逻辑或持久化数据。
- 设计/需求基线：用户本次明确反馈；现有“应用偏好 → 主题设置”实现及共享主题注册表。
- 预期验证：主题设置和应用偏好均显示“水墨”，运行相关前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已定位运行时展示名称由 `THEME_REGISTRY.ink.label` 统一提供，确认无需修改页面结构或主题存储协议。
- 完成：将 `THEME_REGISTRY.ink.label` 从“水墨屏”改为“水墨”，主题设置和应用偏好摘要均复用新名称；补充旧文案排除断言。
- 验证：`npm run --prefix frontend test -- --run src/theme.test.ts src/themeSettings.test.ts`（2 个文件、8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；运行时源码检索未发现旧展示标签。
- 未验证：未进行真实设备或视觉回归；未提交或发布。
- 下一步：评审确认文案后按发布流程处理。

### 2026-08-24 — 修正拟物主题输入框文字内边距（本次会话）

- 状态：待评审。
- 目标：为拟物主题凹陷输入框增加足够的文字安全内边距，避免文字落入边框阴影；搜索框保留图标避让后的现有布局，不额外增加输入文字内边距。
- 范围：`frontend/src/styles.css`、相关前端样式契约测试和本进度记录；不改变输入值、搜索行为、表单结构或其他主题。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的表单控件内边距、主题隔离和搜索框共享规则；`docs/final-ui-designs.md` 注册的拟物主题页面设计稿及对应本地 HTML/PNG 资产。
- 预期验证：普通拟物输入框/选择框/文本域声明内边距，搜索输入显式保持零内边距并依靠左侧图标避让；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认拟物主题最终通用控件规则仅设置凹陷阴影，没有覆盖足够的文字内边距；搜索输入由 `.p7-inventory-search`、`.p5-search` 和分类搜索选择器单独清除阴影与内边距。本轮仅补充最终主题 CSS 内边距覆盖和样式契约。
- 完成：拟物主题普通 `input/select` 增加 `8px` 横向文字内边距，`textarea` 增加 `8px` 全向内边距；搜索输入从通用内边距选择器本身排除并保持 `padding: 0`；数量步进器排除通用留白，保留窄数字栏的居中布局。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（126 passed）、`npm run --prefix frontend test -- --run`（27 个文件、250 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView、320/390/430px 真机上进行像素级文字与凹陷阴影视觉验收；未提交或发布。
- 下一步：评审拟物主题各表单页文字与凹陷边框的间距，确认后按发布流程处理。
- 会话追加：用户反馈 `16px` 过大，并指出搜索输入不应先被通用输入规则命中再覆盖。本轮将普通输入/选择框调整为 `8px`，并从通用选择器本身排除 `.p7-inventory-search`、`.p5-search` 及分类搜索输入。

### 2026-08-24 — 统一拟物主题加号与删除按钮样式（本次会话）

- 状态：待评审。
- 目标：检查拟物主题全局加号/删除操作，将编辑购物清单弹窗加号及遗漏的添加/删除控件统一为标题栏左右按钮的透明浮雕样式。
- 范围：`frontend/src/styles.css`、相关前端回归测试和本进度记录；保留数量步进器的内嵌 `+/-` 控件语义与布局，不改变业务行为、接口或数据结构。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的共享标题栏按钮、48px 交互热区和主题一致性规则；现有拟物主题标题栏、每周食谱、编辑食谱和编辑购物清单实现。
- 预期验证：拟物主题所有独立加号/删除操作无 secondary/danger 三切片底图和底部阴影，SVG 使用标题栏浮雕滤镜；文本加号入口保持透明平面；数量步进器继续使用独立内嵌控件；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已审计 `p9-add-day-button`、`p9-remove-ingredient`、首页/购物页标题栏入口和 `p5-quantity-arrows` 已有标题栏规则；确认 `p9-add-shopping-row`、`p9-remove-shopping-row`、`p9-add-ingredient` 以及分类抽屉/新建冰箱的文本加号仍有旧材质或缺少统一覆盖。本轮只调整主题视觉选择器。
- 完成：编辑购物清单的 `p9-add-shopping-row`、`p9-remove-shopping-row`，编辑食谱的 `p9-add-ingredient`，分类抽屉的 `p5-add-group`/`p5-new-subcategory`，库存列表的 `p5-add-item-plus` 和最近冰箱入口的 `p71-new-fridge` 均移除拟物底图；独立图标按钮统一为 48×48px 并复用标题栏浮雕 SVG，文本加号入口和独立文字删除入口（`p5-delete`、`p5-selection-delete`、`p9-delete-recipe`、冰箱危险操作）保持透明平面；数量步进器仍保留内嵌控件材质。
- 验证：`npm run --prefix frontend test -- --run`（27 个文件、248 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；Playwright 实测编辑购物清单弹窗及编辑食谱页，目标按钮均无背景图/边框/阴影/伪元素底图，独立删除按钮和加号热区均为 48×48px。
- 未验证：尚未在真实 Safari/iOS WebView 真机比较浮雕滤镜、触摸反馈和系统安全区；未提交或发布。
- 下一步：评审拟物主题各页面独立加号/删除按钮的一致性，确认后按发布流程处理。

### 2026-08-24 — 拟物主题列表项铺满屏幕宽度（本次会话）

- 状态：待评审。
- 目标：拟物主题下让 `p5-row-link.p5-subcategory-link`、`p5-inventory-item` 和 `p9-history-row` 左右无内容区留白，列表背景/分隔线延伸到屏幕边沿；保留列表文字、图标和操作的可读内边距，不改变其他主题和交互行为。
- 范围：`frontend/src/styles.css`、相关前端样式契约测试和本进度记录；不改变业务数据、路由、列表操作或 API。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的页面壳、主题隔离、列表分隔线和横向安全边距规则；现有拟物主题页面内容区样式。
- 预期验证：拟物主题四类列表项的可见背景/底部分隔线触达视口左右边沿，内容不被裁切；水墨和卡通主题保持现状；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已定位这些元素位于带 `24px` 横向内边距的滚动内容区，本轮采用拟物主题专属全宽出血规则，列表内容继续保留内部安全间距。
- 完成：拟物主题的 `p5-row-link.p5-subcategory-link`、`p5-inventory-item` 以 `24px` 内容区抵消铺满 P5 滚动区；`p9-history-row` 以 `16px` 内容区抵消铺满 P9 滚动区；窄屏 P5 同步切换为 `16px` 抵消，其他主题不变。新增样式契约测试。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（125 passed）、`npm run --prefix frontend test -- --run`（27 个文件、248 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView、不同安全区设备或 320/390/430px 真机上进行像素级视觉验收；未提交或发布。
- 下一步：在拟物主题的编辑物品、库存列表和食谱历史页面人工复核四类列表项是否确实触达屏幕边沿，确认后按发布流程处理。

### 2026-08-24 — 修正拟物主题添加物品数量控件（本次会话）

- 状态：待评审。
- 目标：让 `p5-food-quantity-input` 的凹陷输入框四角透明，并让“添加物品”页的“增加数量/减少数量”按钮复用页面顶端标题栏左右按钮的透明浮雕样式。
- 范围：`frontend/src/styles.css`、相关前端回归测试和本进度记录；保留数量输入、步进边界、可访问名称与添加流程行为，不改变数据结构或接口。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的共享标题栏按钮、48px 交互热区与主题一致性规则；现有 `PageHeader`/拟物主题标题栏按钮样式。
- 预期验证：拟物主题数量输入四角不再绘制独立背景；添加页两个数量按钮与标题栏左右按钮使用同一透明浮雕规则；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认通用拟物输入规则覆盖数量输入，令输入元素自身绘制奶白圆角背景；添加页的纵向按钮使用 `.p5-quantity-arrows`，未接入拟物标题栏按钮选择器。本轮仅调整主题视觉层。
- 完成：拟物主题 `.p5-quantity-control` 使用咖啡色 `var(--skeu-control)` 凹陷材质和 `11px` 圆角；`.p5-food-quantity-input` 保持透明以露出外层圆角；`.p5-quantity-arrows button` 接入标题栏按钮的透明盒子、浮雕 SVG 和按下变色规则，保留原有数量输入和边界行为。
- 验证：`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView 或不同设备上进行浮雕滤镜、触摸反馈和像素级视觉验收；未提交或发布。
- 下一步：在拟物主题添加物品页人工复核数量输入四角和上下按钮视觉，确认后按发布流程处理。
- 会话追加：用户复测发现数量控件的咖啡色凹陷圆角框变为方角；根因是上一轮为实现透明角落误将输入框 `border-radius` 设为 `0`，覆盖了原有圆角结构。本轮恢复正确的 `11px` 咖啡色凹陷外框，数字输入恢复透明且不再绘制独立方角阴影。
- 修复完成：末尾拟物主题覆盖恢复 `.p5-quantity-control` 的 `var(--skeu-control)`、`var(--skeu-inset-shadow)` 和 `11px` 圆角；`p5-food-quantity-input` 仅保持透明背景，添加样式契约断言防止历史级联回归。
- 修复验证：`npm run --prefix frontend test -- --run`（28 个文件、257 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 会话追加：用户要求撤回上一轮外框恢复，先回到上一版外框级联，再只观察中间输入区域的颜色变化。本轮撤回末尾 `.p5-quantity-control` 外框覆盖，将 `.p5-food-quantity-input` 的背景改为 `var(--skeu-control)`，保留上一版圆角/外框和按钮规则。
- 本轮验证：`npm run --prefix frontend test -- --run`（28 个文件、257 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。

### 2026-08-24 — 调整编辑食谱食材行操作样式（本次会话）

- 状态：进行中。
- 目标：将编辑食谱每个食材行最右侧删除按钮改为标题栏左右按钮的透明浮雕样式，并将分类入口呈现为带下划线的链接文本，不显示凸起按钮材质。
- 范围：`frontend/src/styles.css`、相关前端回归测试和本进度记录；保留删除、分类选择、完成态禁用和数量编辑行为，不改变接口或数据结构。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的共享标题栏按钮、48px 交互热区和主题一致性规则；`docs/final-ui-designs.md` 注册的单日食谱编辑稿 `bbeda1ae-e99c-40d6-87b3-90cdedd7adfa` 及本地 `docs/ui-assets/html/pwa-recipe-edit.html`、`docs/ui-assets/png/pwa-recipe-edit.png`。
- 预期验证：删除按钮在拟物主题无背景、边框、阴影和底图，仅 SVG 保留浮雕滤镜；分类文字保持下划线、透明背景和无阴影；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认 `RecipeIngredientEditorRow` 已保留可访问的分类按钮和 48px 删除热区；当前 `.p9-category-link` 虽有下划线，仍可能继承拟物主题通用按钮阴影，`.p9-remove-ingredient` 也未接入标题栏按钮的拟物覆盖。本轮只调整视觉层。
- 完成：`.p9-remove-ingredient` 接入拟物主题标题栏按钮的透明盒子与 SVG 浮雕滤镜，保留 48×48 热区和按下变色；`.p9-category-link` 强制透明背景、无阴影/滤镜、常规字重和下划线，继续使用可访问的按钮语义打开分类选择器。
- 验证：`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；聚焦分类入口与主题样式测试 7 passed。
- 未验证：尚未在 Safari/iOS WebView 真机比较浮雕滤镜、触摸反馈和系统安全区；未提交或发布。
- 下一步：评审编辑食谱删除图标和分类链接的视觉层级，确认后按发布流程处理。

### 2026-08-24 — 更新应用图标与启动画面资源（本次会话）

- 状态：完成。
- 目标：使用用户提供的 `/Users/jason/Downloads/冰箱.png` 更新网站 favicon、PWA 安装图标、移动端应用图标和 PWA/原生启动画面，并按 Web、Android、iOS 的资源规格生成对应尺寸。
- 范围：`frontend/public/`、`frontend/android/app/src/main/res/`、`frontend/ios/App/App/Assets.xcassets/`、必要的 HTML/manifest/缓存清单和本进度记录；不改变业务逻辑与页面交互。
- 设计/需求基线：用户本次指定图片与“网站 PWA favicon、手机版图标、PWA splash”的要求；现有 `frontend/index.html`、`frontend/public/manifest.webmanifest`、Capacitor Android/iOS 资源契约。
- 预期验证：各平台图标和 splash 文件均为有效图片且尺寸符合引用；PWA manifest、HTML head、Service Worker 预缓存不再遗漏新 favicon/splash 资源；前端 lint、测试、生产构建和 `git diff --check` 通过。
- 会话记录：已确认源图为 2048×2048 RGBA PNG；已定位 Web 的 favicon/manifest/apple-touch-icon、Android 各密度 launcher/splash、iOS AppIcon/Splash 资源及相关引用。
- 完成：Web/PWA 改用 16×16、32×32 PNG favicon、180×180 Apple touch icon、192×192/512×512 PWA icon 和 1024×1024 boot/startup splash；HTML 移除旧 SVG favicon/mask 引用，Service Worker 升级到 `fridgeboard-app-v8` 并预缓存新图标和 splash；Android 更新五档 launcher、round launcher、adaptive foreground 及横竖屏 splash；iOS 更新 1024 AppIcon 和三套 Splash 资源。
- 验证：各资源尺寸和 PNG 格式逐文件检查通过；`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`./gradlew --no-daemon :app:assembleDebug`、`xcodebuild -project frontend/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` 和 `git diff --check` 均通过；已视觉检查 Web 图标及 Android 横竖屏 splash。
- 未验证：尚未在真实 Android/iOS 设备和 Safari PWA 安装流程中确认系统图标裁切、缓存更新与启动画面时序；未提交或发布。
- 下一步：真机安装并清理旧 PWA/应用缓存后复核图标与启动画面，确认后按发布流程处理。

### 2026-08-24 — 调整每周食谱每日加号位置与拟物样式（本次会话）

- 状态：待评审。
- 目标：将每周食谱中每个星期名称后的加号改为紧贴标题的布局；拟物主题复用标题栏左右按钮的透明浮雕样式并移除底部按钮贴图，水墨和卡通主题同步采用相同布局。
- 范围：`frontend/src/RecipeWorkspace.tsx`、`frontend/src/styles.css`、相关前端回归测试和本进度记录；不改变新增食谱操作、权限判断、星期数据或其他添加按钮语义。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的共享页面壳、主题一致性和 48px 交互热区规则；`docs/functional-design-and-feasibility.md` §17.1 的本周/下周食谱；`docs/final-ui-designs.md` 注册的 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及本地 `docs/ui-assets/png/pwa-weekly-recipes.png`、`docs/ui-assets/html/pwa-weekly-recipes.html`。
- 预期验证：周标题和加号在三主题中同一行且加号紧跟标题；拟物加号无 `secondary-master.png` 底图和底部阴影，仍保持 48×48 热区；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认 `RecipeWorkspace` 当前使用 `justify-content: space-between` 将加号推至每日标题行最右侧；拟物主题在添加操作选择器中为该按钮注入 secondary 三切片和阴影。本轮将调整共享结构与拟物例外选择器，保留现有 `aria-label` 和点击回调。
- 完成：每日标题行改为左对齐并将 `p9-add-day-button` 紧跟星期名称；拟物主题将该按钮移出 secondary 三切片和底部阴影选择器，复用标题栏透明按钮与浮雕 SVG 规则；水墨、拟物、卡通共享同一 DOM 布局和 48×48 热区。
- 验证：`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 390×844 实测三主题，标题与按钮间距均为 `0px`、按钮尺寸均为 `48×48px`；拟物主题 computed style 确认无背景图、边框、阴影及 `::before/::after` 贴图内容。
- 未验证：尚未在 Safari/iOS WebView 真机比较浮雕滤镜、触摸反馈和系统安全区；未提交或发布。
- 下一步：评审三主题每日标题行的视觉间距与拟物加号的透明浮雕效果，确认后按发布流程处理。

### 2026-08-23 — 替换拟物主题分类图标（本次会话）

- 状态：待评审。
- 目标：将拟物主题下水果、酒类、饮料、奶品、纸品、洁面、面妆和面部 8 个分类图标替换为用户指定的 Thiings 3D 图标。
- 范围：图标库初始化数据、拟物主题静态资源、相关前端/后端回归测试和本进度记录；不改变分类 ID、分类名称、其他主题图标及分类选择/库存展示行为。
- 设计/需求基线：用户本次提供的 Thiings 图标链接；`docs/ui-design-specification.md`；现有 `Icon.variants.skeuomorphic` 主题资源契约。
- 预期验证：确认 8 个分类映射到指定资源，运行相关后端测试、前端测试、lint、生产构建和 `git diff --check`；资源文件存在且格式可被当前运行时读取。
- 会话记录：已确认前端通过 `resolveIconVariant` 使用服务端下发的拟物变体，并定位到版本化主题变体清单和静态资源目录；保留工作区已有未提交改动。
- 资源处理：从用户指定的 Thiings 页面取得对应原始 PNG（strawberry、beer-bottle、soda-can、cheese、paper-towel-roll、arnica-gel-tube、makeup-brush、clay-face-mask），统一转换为 256×256 RGBA PNG；映射保持原有逻辑图标 key，不修改分类数据。
- 完成：`fruit`、`lucide:wine`、`drink`、`milk`、`hugeicons:tissue-paper`、`outlook-洁面`、`makeup-base`、`covid:personal-hygiene-hand-sanitizer-spray` 分别切换为 strawberry、beer-bottle、soda-can、cheese、paper-towel-roll、arnica-gel-tube、makeup-brush、clay-face-mask 资源；新增精确映射回归测试。
- 验证：`uv run pytest backend/tests/test_item_catalog_api.py -q`（18 passed）、`uv run ruff check backend`、`uv run pytest -q`（173 passed，54 warnings）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；8 个资源均为可读的 256×256 RGBA PNG，并已视觉检查合成图。
- 未验证：尚未在真实设备或生产环境切换拟物主题进行人工验收；未提交或发布。
- 下一步：在发布前于拟物主题的分类选择器、物品列表和冰箱首页复核 8 个图标的显示尺寸与缓存更新。

### 2026-08-23 — 发布当前 main 到生产服务器（本次会话）

- 状态：完成。
- 目标：将当前 `main` 的应用改动发布到生产服务器，生成并注入正式 release，完成远程数据库备份、容器健康检查和公网健康检查。
- 范围：当前工作区中除运行日志 `fridgeboard.log` 外的项目改动；使用 `scripts/deploy-image.sh`，不创建分支、不推送远端。
- 设计/需求基线：用户本次明确发布请求；项目发布规则和 `scripts/deploy-image.sh`。
- 预期验证：后端 Ruff/pytest、锁文件检查、前端测试/lint/build、差异检查、远程容器健康检查和 `HEALTH_URL` 健康检查通过；记录提交号、release 号、镜像标识、数据库备份和未验证项。
- 会话记录：已确认工作区有前端拟物主题相关改动及进度文档改动；`fridgeboard.log` 为已跟踪运行日志，本次不纳入发布提交。
- 完成：发布提交 `4d5d139` 已部署到 `root@107.174.152.245:/opt/fridgeboard`；脚本生成 release `260823215244`，远程数据库备份为 `/data/fridgeboard.db.backup-20260823-135322`，容器状态为 `healthy`，公网 `https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 镜像标识：`sha256:dbe2aac25b58fc36b822fe44e0e1a2187b5c633c80e9fa901e4d85cd8be91fda`。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（172 passed，54 warnings）、`uv lock --check`、`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`、远程容器健康检查和公网健康检查均通过。
- 未验证：未进行真实 Safari/iOS WebView 的像素级视觉验收；`fridgeboard.log` 的本地未提交改动未纳入此次发布。
- 下一步：在生产网页版不清缓存连续刷新两次，确认新 Service Worker 使用本次 release 并复核水墨/拟物主题导航；完成真实设备验收后可关闭相关待评审项。

### 2026-08-23 — 统一底部导航四个拟物图标的浮雕与激活填充效果（本次会话）

- 状态：待评审。
- 目标：让首页、食谱、购物、我的四个底部导航图标使用完全一致的拟物浮雕、高光/阴影和激活填充规则。
- 范围：`frontend/src/sharedUi.tsx`、`frontend/src/styles.css`、导航回归测试和本进度记录；保留四个图标各自的原始线条/轮廓、导航行为、点击热区和主题隔离。
- 设计/需求基线：用户本轮反馈；`docs/ui-design-specification.md` §4.4、§8；现有拟物 `skeuomorphic-emboss` 滤镜和 `--skeu-control` 输入框颜色令牌。
- 预期验证：四个拟物图标未激活时均使用同一浮雕滤镜，激活时均只在独立填充层使用浅咖啡色；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认其他三个图标已有独立空白区域填充层，但激活选择器与首页分开；本轮将收敛为针对所有拟物导航图标的共享激活填充规则，不修改图标路径。
- 完成：四个拟物导航 SVG 统一通过 `p7-nav-icon--skeuomorphic` 使用 `skeuomorphic-emboss` 滤镜；激活时统一通过同一个选择器将各自独立的 `p7-nav-icon-fill` 填为 `var(--skeu-control)`，原始线条/轮廓层保持不变。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（124 passed）、`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在 Safari/iOS WebView 真机比较 SVG 滤镜、系统色彩管理和实际视觉像素差异；未提交或发布。
- 下一步：评审四个导航图标的未激活/激活视觉一致性，确认后安排真实设备验收。

### 2026-08-23 — 优化拟物主题每周食谱周切换控件（本次会话）

- 状态：进行中。
- 目标：拟物主题下未选中的“本周/下周”仅显示为背景文字；选中后显示奶白色按钮，并在切换时让奶白背景滑动到目标侧，两个文字位置保持不动。
- 范围：`frontend/src/RecipeWorkspace.tsx`、`frontend/src/styles.css`、相关前端回归测试和本进度记录；不改变周数据加载、缓存、导航和其他主题的现有视觉。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9；`docs/final-ui-designs.md` 中 `pwa-weekly-recipes` 设计注册表及本地 HTML/PNG 资产。
- 预期验证：拟物主题周切换背景可在两列间平滑移动，文字不发生位移；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认原控件的激活背景直接附着在按钮上，且拟物主题存在多处后置覆盖；本轮在周切换容器增加 `is-next` 状态，将奶白按钮视觉统一移动到伪元素，按钮文字保留原网格列位置。新增 `prefers-reduced-motion` 降级规则和样式契约测试。
- 完成：拟物主题未选中的一侧仅显示背景文字，选中态由容器伪元素显示奶白色浮雕按钮；切换时仅伪元素使用 `transform` 过渡，`本周`/`下周`文字不移动。其他主题和周数据行为未改动。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（124 passed）、`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView 或不同浏览器下进行像素级视觉验收；未提交或发布。
- 下一步：待评审拟物主题周切换的静态样式与实际点击动画效果。
- 会话追加：用户复测发现未选中的周按钮仍受其他拟物主题通用控件规则影响，残留边框或底色。本轮仅加强 `.p9-week-tabs` 按钮自身的透明边界、背景和阴影覆盖，不改变其他按钮。
- 修正完成：`.p9-week-tabs` 下两个按钮统一强制 `border: 0`、`background: transparent`、`box-shadow: none`，奶白背景仍仅由周切换容器伪元素绘制。
- 修正验证：`npm run --prefix frontend test -- --run src/App.test.ts`（124 passed）、`npm run --prefix frontend lint` 和 `git diff --check` 均通过。

### 2026-08-23 — 统一拟物主题顶部导航栏高度（本次会话）

- 状态：待评审。
- 目标：拟物主题各页面顶部导航栏与水墨主题保持一致高度；保留拟物主题的贴图边缘、零水平外留白、系统安全区和按钮热区。
- 范围：`frontend/src/styles.css`、顶部导航样式契约测试和本进度记录；不改变底部导航、页面内容、导航行为或其他主题。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5–§6.2.1；水墨主题共享顶部栏规则；已确认拟物主题应用壳与本地主题设计资产。
- 预期验证：拟物 `.app-header`/`.page-header` 的高度规则与共享水墨顶部栏一致；前端测试、lint、生产构建和 `git diff --check` 通过。
- 完成：拟物主题两处共享 `.app-header`/`.page-header` 覆盖均将 `min-height` 从 `112px` 收紧为 `56px`；保留 `var(--app-safe-top)` 和水平零留白规则，底部导航未修改。
- 验证：`npm run --prefix frontend test -- --run`（27 个文件、246 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增静态契约确认拟物顶部栏为 `min-height: 56px` 且仍使用 `padding: var(--app-safe-top) 0 0`。
- 未验证：尚未在 Safari/iOS WebView 真机比较顶部贴图边缘、系统安全区和色彩管理的像素差异；未提交或发布。

### 2026-08-23 — 恢复水墨主题并隔离拟物主题样式（本次会话）

- 状态：待评审。
- 目标：以提交 `1596add5c18ab830dfabf858b8c14dfc129e0870` 为水墨主题兼容基线，修复近期拟物主题改动对水墨主题造成的严重视觉回归，同时保持当前拟物主题视觉与交互不变。
- 范围：主题相关共享 UI 结构、`frontend/src/styles.css`、PWA Service Worker、前端静态文件缓存响应头、相关回归测试和本进度记录；不改变业务流程、数据接口、冰箱布局几何或当前拟物主题设计资产。
- 设计/需求基线：用户本次明确要求；提交 `1596add5c18ab830dfabf858b8c14dfc129e0870`；`docs/ui-design-specification.md` §4.4 关于 `ink` 兼容基线和主题仅覆盖视觉令牌/资产的约束；`docs/functional-design-and-feasibility.md` §17.1；`docs/final-ui-designs.md` 与本地冻结设计资产。
- 预期验证：新增可自动化的水墨主题基线隔离回归，确认拟物专属材质、阴影、浮雕、导航贴图和结构辅助层不会作用于 `ink`；运行前端全量测试、lint、生产构建和 `git diff --check`，并分别检查水墨与拟物主题关键页面。
- 会话记录：已确认基准之后应用代码差异主要为 `frontend/src/styles.css` 新增约 1163 行拟物样式、`sharedUi.tsx` 的导航/浮雕辅助结构和少量按钮 class。逐条审计后确认拟物材质 CSS 本身均限定在 `data-theme="skeuomorphic"`；实际根因是共享导航为拟物贴图新增 `.p7-nav-skin`/`.p7-nav-content` 两层 DOM，却没有为水墨主题定义默认隐藏和透明布局，导致贴图进入文档流且四个按钮不再直接参与原四列网格；每页新增的 SVG filter 定义也会在非拟物主题下采用默认 SVG 尺寸。导航图标同时被全局替换，破坏了水墨冻结图标基线。
- 完成：拟物贴图层在非拟物主题下默认隐藏，导航内容包装在非拟物主题下使用 `display: contents`，水墨四按钮恢复原四列布局；SVG filter 定义改为零尺寸资源节点，不再占据页面布局；重新加入基准提交的四个水墨线框图标，仅 `ink` 显示，拟物继续显示当前 Iconify/填充/浮雕图标，卡通主题继续沿用修复前图标。新增回归用例锁定辅助层隔离、双图标集合及主题可见性契约。
- 验证：先运行新增用例并确认在缺少隔离实现时失败；修复后定向用例通过。`npm run --prefix frontend test -- --run`（27 个文件、246 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。Playwright CLI 在 390×844 实测：`ink` 导航为 72px 高、四列各 89.5px、贴图 `display:none`、内容包装 `display:contents`、4 个水墨图标可见且拟物图标均隐藏；`skeuomorphic` 导航为 112px 高、贴图/内容均为 grid、4 个拟物图标可见且水墨图标均隐藏。两主题横向溢出均为 0，控制台 0 error / 0 warning；已人工检查水墨和拟物首页截图。临时 Vite 服务使用 `http://127.0.0.1:7003/`，验证后已停止。
- 未验证：真实 Android/iOS/PWA 水墨与拟物主题尚未人工验收。
- 下一步：在真实 Android/iOS/PWA 分别切换水墨与拟物主题，复核系统安全区、底部导航和主题切换后的首帧表现；通过后可标记完成。
- 会话追加：用户在网页版复测发现首次打开正常，但刷新后页面再次错乱，底部出现多个大图片按钮。该表现与拟物导航 PNG 在旧缓存 CSS 下作为普通 `<img>` 渲染一致；本轮重新将状态置为进行中，范围增加 PWA 刷新时 Service Worker 的 HTML/JS/CSS 版本一致性和跨版本 DOM 降级，不在复现与验证完成前宣称修复完成。
- 根因补充：生产 `sw.js` 实测由 Cloudflare 旧缓存命中，响应为 `cf-cache-status: HIT` 且已有约 6 小时时龄；现有 Service Worker 固定使用 `fridgeboard-app-v6` 并对导航、HTML、JS、CSS统一 cache-first，导致首次网络加载正常、刷新后恢复旧应用壳。新导航 DOM 中的三张拟物 PNG 和内容包装依赖新 CSS 隐藏/布局，遇到旧 CSS 后即按原图尺寸进入页面。
- 本轮完成：导航贴图层内联默认 `display:none`，内容包装内联默认 `display:contents`，水墨/拟物图标可见性由当前主题直接写入内联样式；新拟物 CSS 用 `!important` 仅在拟物主题恢复贴图和四列内容层。因此即使短暂出现“新 JS + 旧 CSS”，也不会再渲染大 PNG 或双套图标。Service Worker 升级为 `fridgeboard-app-v7`，页面导航改为 network-first 并只把成功响应更新为统一 `/index.html` 离线回退，哈希静态资源和图标继续 cache-first，业务 API 仍不缓存。注册 URL 加入正式 release 参数并设置 `updateViaCache:'none'`，绕过既存浏览器/CDN worker 缓存；源站对 PWA HTML 和 `sw.js` 返回 `no-store, max-age=0`。
- 本轮验证：新增导航跨版本安全、PWA network-first、release 缓存键和源站缓存头回归测试，先确认旧实现失败后修复通过。`uv run ruff check backend`、`uv run pytest -q`（172 passed，54 warnings）、`uv lock --check`、`npm run --prefix frontend test -- --run`（27 个文件、246 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。生产形态本地服务由真实 Service Worker 控制，缓存仅有 `fridgeboard-app-v7`；390×844 下水墨和拟物各连续刷新两次，水墨保持 72px 四列、贴图隐藏、4 个水墨图标可见，拟物保持 112px 胶囊、四列各 90.5px、4 个拟物图标可见；两者横向溢出均为 0，控制台 0 error / 0 warning。`/` 与 `/sw.js?release=dev` 均实测返回 `Cache-Control: no-store, max-age=0`。
- 本轮未验证：修复尚未发布到生产，因此用户当前生产网页仍可能继续命中旧 Service Worker；发布后需在同一浏览器连续刷新并确认 worker URL 带新 release 号。真实 Android/iOS 不受 Service Worker 注册影响，本轮未重复真机验收。
- 下一步：按发布流程部署后，在生产网页版不清缓存直接打开并连续刷新两次，确认旧 worker 自动升级且底部不再出现大图片；再分别切换水墨与拟物主题复核导航。

### 2026-08-23 — 合并首页导航图标的浮雕与激活填充效果（本次会话）

- 状态：待评审。
- 目标：让底部导航左下角“首页”图标在未激活时同时保留 3D 浮雕和高光/阴影效果，激活时以该未激活态为基础，仅在原图标没有线条的封闭空白区域填入浅咖啡色。
- 范围：`frontend/src/sharedUi.tsx`、`frontend/src/styles.css`、导航回归测试和本进度记录；不改变图标线条、导航行为、点击热区或底部导航素材。
- 设计/需求基线：用户本轮反馈；`docs/ui-design-specification.md` §4.4、§8；现有 `.p7-nav-icon` 的 `skeuomorphic-emboss` 浮雕滤镜和 `--skeu-control` 输入框颜色令牌。
- 预期验证：首页图标两种状态均保留同一线条层和浮雕滤镜；仅激活态显示浅咖啡色空白区域填充；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认首页当前仍使用单层线框 SVG，而其他三个导航图标已有独立封闭区域填充层；本轮将为首页补充与线条层分离的填充路径，并复用现有拟物主题样式。
- 完成：首页增加独立的房屋内部填充路径，门洞通过 `fillRule="evenodd"` 保持为空；原有三段房屋线条移入独立轮廓层，拟物主题固定线条为未激活态的 `#CCB8A1`，激活时仅将填充层设为 `var(--skeu-control)`，并继续复用 `skeuomorphic-emboss` 滤镜。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（122 passed）、`npm run --prefix frontend test -- --run`（27 个文件、245 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在 Safari/iOS WebView 真机比较 SVG 滤镜、系统色彩管理和实际视觉像素差异；未提交或发布。
- 下一步：评审首页图标未激活/激活两种视觉状态，确认后安排真实设备验收。

### 2026-08-23 — 收紧拟物主题顶部栏与底部导航外留白（本次会话）

- 状态：待评审。
- 目标：拟物主题的顶部导航栏和底部导航条四周不再叠加贴图自带留白，视觉边界直接贴合应用壳；保留系统安全区和现有按钮热区。
- 范围：`frontend/src/styles.css`、拟物主题样式契约测试和本进度记录；不改变水墨屏/卡通主题、导航行为、页面内容或贴图资源。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5–§6.2.1、§7；`docs/final-ui-designs.md` 已确认拟物主题应用壳；`docs/ui-assets/proposals/theme-system-design.html/png` 与 `docs/ui-assets/html/pwa-home.html/png`。
- 预期验证：拟物主题顶部栏和底部导航无贴图外侧留白；安全区变量仍被保留；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认当前 `.app-header`/`.page-header` 使用 `20px` 水平和 `25px` 底部内边距，`.p7-nav` 使用 `8px` 左侧、`8px` 底部外边距及 `14px`/`18px` 内边距；这些间距会叠加在已含视觉边界的拟物贴图外。本轮将仅在 `data-theme="skeuomorphic"` 覆盖为贴图容器零外留白，并保留 `var(--app-safe-top/right/bottom/left)` 参与系统安全区计算。
- 完成：拟物主题 `.app-header`/`.page-header` 改为仅保留 `var(--app-safe-top)`，水平和底部外层留白归零；`.p7-nav` 改为 `width: 100%`、`margin: 0`，仅保留底部系统安全区，导航三切片资源和按钮热区保持不变。
- 验证：`npm run --prefix frontend test -- --run`（27 个文件、245 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；静态契约确认拟物顶部栏使用 `padding: var(--app-safe-top) 0 0`，底部导航使用 `width: 100%`、`margin: 0` 和 `padding: 0 0 var(--app-safe-bottom)`。
- 未验证：尚未在 Safari/iOS WebView 真机比较贴图边缘、系统安全区和色彩管理的像素差异；未提交或发布。

### 2026-08-23 — 依据用户本地 SVG 修正底部图标封闭区域填充（本次会话）

- 状态：待评审。
- 目标：以用户下载的三个 Iconify SVG 为唯一图形基线，修正未选中图标与原文件不一致的问题；选中时只填充图形内部封闭区域，线条几何、颜色和浮雕效果保持不变。
- 范围：`/Users/jason/Downloads/fluent--spatula-spoon-32-regular.svg`、`material-symbols--shopping-cart-outline.svg`、`boxicons--user.svg` 的路径读取与固化，`frontend/src/sharedUi.tsx`、`frontend/src/styles.css`、导航回归测试和本进度记录；不改变导航行为和热区。
- 设计/需求基线：用户本轮提供的本地 SVG；`docs/ui-assets/prototypes/skeuomorphic-capsule/styles.css` 的 `.relief-icon` 细线/浮雕参数；拟物主题输入框颜色令牌 `--skeu-control`。
- 预期验证：三个图标未选中时直接使用下载 SVG 的原始 `fill` 路径；选中时仅增加独立的封闭区域填充，原始路径的颜色、几何和浮雕滤镜保持不变；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认前一版将实心 Iconify glyph 复制为 `stroke`，导致路径边缘被二次描边而变粗；本轮改为原始路径作为固定线条层，并使用独立封闭区域几何作为选中填充层。三份本地 SVG 路径已逐一比对并固化。
- 验证：`npm run --prefix frontend test -- --run`（27 个测试文件、245 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；本地 SVG 三条主路径比对结果均为 `true`。未选中层使用原始 `fill="currentColor"` 路径，选中层仅切换 `.p7-nav-icon-fill` 为 `var(--skeu-control)`，主路径固定为 `#CCB8A1`。
- 未验证：尚未在 Safari/iOS WebView 真机比较 SVG filter 和系统色彩管理差异；未提交或发布。

### 2026-08-23 — 修正底部导航指定图标的细线未选中态（本次会话）

- 状态：待评审。
- 目标：修正上一轮替换图标后未选中态过粗、选中态仅变浅的问题；未选中恢复原有微凸细线绘制，选中时在保持细线轮廓的基础上填充输入框同色的淡咖啡色。
- 范围：`frontend/src/sharedUi.tsx`、`frontend/src/styles.css`、导航回归测试和本进度记录；不改变图标名称、导航行为、点击热区或首页入口。
- 设计/需求基线：用户本轮反馈；原 `NavigationIcon` 的 `fill="none"`、`stroke="currentColor"`、微凸滤镜绘制方式；拟物主题输入框颜色令牌 `--skeu-control`。
- 预期验证：未选中三个指定图标均为细线微凸样式；选中态不再整体替换为浅色粗图标，而是保留细线并增加淡咖啡色内部填充；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认当前实现给三个 Iconify glyph 直接设置 `fill="currentColor"`，且选中态把整个 SVG 改为 `--skeu-control`，因此视觉上变成粗色块；原型实际使用独立的 `.relief-icon` 细线几何和统一浮雕滤镜。本轮将线条层与指定 Iconify 填充层分离，填充层位于线条层下方。
- 完成：三个指定图标使用与原型一致的细线 SVG 几何、`fill="none"`、`stroke="currentColor"` 和 `skeuomorphic-emboss` 滤镜；选中态只显示指定 Iconify 填充层的 `var(--skeu-control)`，线条层显式保持 `fill="none"`，不再改变线条颜色或粗细。
- 验证：390px 浏览器截图 `output/playwright/nav-icon-repair-390.png` 已检查；拟物主题未选中图标为 `fill: none`、`stroke-width: 2px`、`url(#skeuomorphic-emboss)`；食谱选中时线条仍为 `fill: none`、`rgb(118, 91, 72)`、`2px`，只有填充层为 `rgb(220, 201, 182)`。`npm run --prefix frontend test -- --run`（27 个测试文件、245 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在 Safari/iOS WebView 真机比较 SVG filter 和系统色彩管理差异；未提交或发布。

### 2026-08-23 — 更新首页底部导航图标与选中填充色（本次会话）

- 状态：待评审。
- 目标：将首页底部“食谱”“购物”“我的”入口替换为用户指定的 Fluent、Material Symbols 和 Boxicons 图标；选中时使用输入框同色的淡咖啡色填充这三个图标。
- 范围：`frontend/src/sharedUi.tsx`、`frontend/src/styles.css`、必要的前端静态标记回归测试和本进度记录；不改变导航行为、首页页面壳、图标热区或“首页”入口。
- 设计/需求基线：用户本轮反馈；`docs/ui-design-specification.md` §8 图标规范、§6/§7 共享导航与控件令牌；拟物主题输入框颜色令牌 `--skeu-control`。
- 预期验证：三个入口使用指定图标路径；三个入口选中时图标颜色为 `--skeu-control`，未选中仍保持导航原有颜色；TypeScript/Vitest、前端 lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认 `P7Navigation` 当前使用共享 `NavigationIcon` 的自绘线框图标；项目不依赖运行时 Iconify 组件，因此将把指定 Iconify 图标固化为内联 SVG 路径。当前输入框颜色由 `--skeu-control` 提供，现有选中态使用 `--skeu-shell-active`，本轮仅为指定三个填充图标增加选中态覆盖。
- 完成：`P7Navigation` 的“食谱”“购物”“我的”分别换为 `fluent:spatula-spoon-32-regular`、`material-symbols:shopping-cart-outline` 和 `boxicons:user` 的内联 SVG；拟物主题选中态将三个填充图标设为 `var(--skeu-control)`，首页图标及导航行为保持不变。
- 验证：三条内联 SVG 路径与 Iconify 官方返回值逐字一致；`npm run --prefix frontend test -- --run`（27 个测试文件、245 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在 Safari/iOS WebView 真机比较图标填充色、SVG filter 和系统色彩管理差异；未提交或发布。

### 2026-08-23 — 修复拟物首页底部导航三切片纵向变形（本次会话）

- 状态：待评审。
- 目标：在保持上一轮收紧底部导航高度的前提下，修复左右圆弧被直接压矮导致的素材变形；端片必须等比缩放，中间片仅承担横向可变宽度。
- 范围：`frontend/src/styles.css`、必要的共享导航标记/前端回归测试和本进度记录；保留用户确认的底部三切片 PNG、图标 SVG、交互和右侧贴边语义，不修改素材像素。
- 设计/需求基线：用户本轮反馈；`docs/ui-design-specification.md` 的手机端固定底部导航与 320/390/430px 响应式基线；`docs/final-ui-designs.md` 的拟物首页设计注册表；上一轮第十六至第十八轮导航调整记录。
- 预期验证：底部高度继续收紧但左右端片保持原始纵横比；中间片不造成端片横向挤压或接缝；320/390/430px 无横向溢出、导航内容完整且右侧阴影仍贴边；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认当前 CSS 对三张图片统一使用 `width: 100%; height: 100%; object-fit: fill`，将左/中/右 `300×380 / 1052×380 / 300×380` 素材压入 `112px` 高三列网格，根因是端片纵向非等比缩放。已将 `P7Navigation` 中间片改为横向重复背景，左右端片改为按导航高度自动计算宽度；保留素材文件、图标 SVG、交互和右侧贴边规则不变。
- 验证：`npm run --prefix frontend test -- --run`（27 个测试文件、244 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 实测 320/390/430px，导航高度均为 `112px`，左右端片宽度均约 `88.41px`、宽高比均为 `0.7894`（原素材 `300/380`），中心片宽度随视口分别为 `135.17/205.17/245.17px`，右边界间距均为 `0px`，横向溢出均为 `0px`；控制台 `0 error / 0 warning`。
- 未验证：尚未在 Safari/iOS WebView 真机比较 PNG 重复背景、透明阴影、系统安全区和色彩管理的像素差异；未提交或发布。

### 2026-08-23 — 发布当前 main（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD` 发布到生产服务器，并确认数据库备份、容器健康状态和 HTTPS 健康检查。
- 范围：当前 `HEAD`、生产 Docker 镜像、服务器 SQLite 在线备份、容器重建和健康检查；不修改生产数据内容、不创建分支、不推送远端。
- 设计/需求基线：当前 `main`、`scripts/deploy-image.sh`、项目发布规则和生产 `.deploy.env`。
- 会话记录：工作区无未提交改动，发布提交为 `465c114`；使用生产固定 IP `107.174.152.245`，未创建分支或推送远端。
- 发布记录：自动生成 release `260823045115`；服务器数据库备份为 `/data/fridgeboard.db.backup-20260822-205132`；镜像摘要为 `sha256:39212638ab6a508631d1c510c38dffe7a72afbee914db4836591ba19fb15c111`；容器运行中且 `healthy`，重启次数为 0，Alembic 为 `20260820_24 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 验证：`uv run ruff check backend`、`uv run pytest`（172 passed，56 条既有依赖/线程清理警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 个文件、244 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过；发布脚本完成远程构建、数据库备份、容器重建和 HTTPS 健康检查。
- 未验证：尚未在真实手机/PWA 或 Capacitor WebView 完成发布后人工视觉与交互验收；服务器归档解包时输出 macOS 扩展属性警告，但发布脚本最终成功且容器健康。

### 2026-08-23 — 修正顶部浮点按钮、搜索框和列表信息层级（本次会话）

- 状态：待评审。
- 目标：继续收敛最终拟物主题，移除标题按钮上沿横线与顶部操作按钮底图，统一搜索框为单层内凹，取消物品列表名称/冰箱位置的微凸修饰，并修复取消按钮默认不显示 secondary 底图的问题。
- 范围：共享顶部栏、库存列表、库存流程搜索/列表信息、取消按钮的前端结构与主题 CSS；不改变业务状态、导航行为或数据接口。
- 设计/需求基线：用户本轮反馈；指定线程 `01a024a5-ad40-7b00-8826-40d9a6fdfd2c` 最终拟物方案；`docs/ui-design-specification.md` 共享页面壳规则。
- 预期验证：所有页面左上/右上操作为无背景浮点浮雕按钮；各类搜索输入仅保留一层内凹；库存列表名称与冰箱位置信息无背景、边框、阴影和滤镜；取消按钮未按下时显示 secondary 材质，按下时才显示按压反馈。
- 完成：顶部标题触发器、返回/扫码/筛选/保存及弹窗关闭按钮改为透明无阴影盒子，仅内部文字或图标使用浮雕滤镜；所有搜索容器清除伪元素与嵌套输入阴影；库存物品名称和冰箱位置按钮清除微凸材质；取消按钮建立独立层叠上下文并恢复默认 secondary 三切片，按下时保留位移和阴影反馈。
- 验证：前端 `npm run --prefix frontend test -- --run`（27 个测试文件、244 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 390px 实测首页、全部物品页、添加物品页和分类弹出框，computed style 确认标题/顶部按钮本体无背景、边框、shadow、filter，搜索输入仅外层有一组内凹阴影，取消按钮默认 secondary 伪元素可见；截图已保存为 `output/playwright/skeuomorphic-home-390-v2.png`、`skeuomorphic-inventory-selection-390.png`。
- 未验证：尚未在 Safari/iOS WebView 真机比较 SVG filter、按下态和系统安全区的像素差异；未发布或提交 Git。
- 下一步：评审本轮顶部操作、搜索框层级、库存信息文本和取消按钮的视觉细节，随后安排真机验收。

### 2026-08-23 — 修正最终拟物主题控件层叠与操作语义（本次会话）

- 状态：待评审。
- 目标：修正最终拟物主题接入后的底部导航、首页搜索、顶部标题栏、食谱状态按钮、添加按钮、弹窗关闭按钮和购物清单删除按钮视觉回归。
- 范围：`frontend/src/styles.css`、必要的共享 UI/测试契约与本进度记录；不改变业务状态、导航行为、冰箱布局或数据接口。
- 设计/需求基线：用户本轮反馈；指定线程 `01a024a5-ad40-7b00-8826-40d9a6fdfd2c` 最终原型；上一轮最终拟物主题实施结果。
- 预期验证：底部四入口均匀分布且不覆盖材质；搜索栏只有一层内凹图；顶部冰箱名称无横向阴影线；食谱完成按钮无底图；添加按钮统一 secondary；关闭与购物清单删除按钮为透明无凸起浮雕文字/图标并有按下变色反馈。
- 完成：底部导航内容层改为覆盖整幅壳体的绝对定位并保持四列均分；搜索输入清除重复背景/阴影；顶部标题栏和状态行清除横向阴影；食谱完成按钮改为透明浮雕状态控件；为物品、分类、位置、订单、食谱和购物清单添加操作补充明确 class 并统一 secondary 三切片；弹窗关闭 X、页面关闭 X 和购物清单逐行删除改为无底图浮雕控件，按下时变色；图标型添加按钮收紧三切片端宽。
- 验证：前端 `npm run --prefix frontend test -- --run`（27 个测试文件、244 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；浏览器实测首页、食谱页和编辑购物清单弹窗，390px 下底部四列均分、搜索外层仅一层阴影、标题栏无 shadow、完成按钮无底图、添加/关闭/删除 computed style 符合预期；截图已保存为 `output/playwright/skeuomorphic-fixes-home-390.png`、`skeuomorphic-fixes-recipe-390-v2.png`、`skeuomorphic-fixes-shopping-dialog-390.png`。
- 未验证：尚未在 Safari/iOS WebView 真机比较 PNG/SVG filter、按下态和系统安全区的像素差异；未发布或提交 Git。
- 下一步：评审本轮控件层级与按钮材质，随后安排真机验收。

### 2026-08-23 — 按最终拟物原型重做应用主题（本次会话）

- 状态：待评审。
- 目标：依据用户指定线程 `01a024a5-ad40-7b00-8826-40d9a6fdfd2c` 的最终方案，将正式前端从旧 v5 胶囊实现切换为最终暖色拟物系统。
- 范围：`frontend/src/styles.css`、`frontend/src/sharedUi.tsx`、拟物主题资源与前端回归测试；顶部改为页面背景上的透明图标和标题，底部改用最终导航三切片，控件继续使用独立按钮材质、内凹输入/分段和浅凸列表；不改变业务 DOM、交互、冰箱布局几何或图标数据契约。
- 设计/需求基线：指定线程最终原型的第十三至第十八轮收敛结果；`docs/ui-design-specification.md`；`docs/ui-assets/prototypes/skeuomorphic-capsule/` 最终原型及其 RGBA/三切片资产。
- 预期验证：正式页面在 320/390/430px 下无横向溢出，顶部标题保持视口中心，顶部按钮无背景，底部导航三切片无接缝且右侧阴影贴合页面边界；前端测试、lint、生产构建和 `git diff --check` 通过。
- 会话记录：已确认当前应用仍使用旧顶部/底部 v5 胶囊切片和旧 CSS 浮雕实现，与指定线程最终原型不一致；本轮先完成共享壳和主题令牌迁移，再运行代码与浏览器级验证。
- 完成：`frontend/src/sharedUi.tsx` 改用最终左上光源局部浮雕滤镜，顶部栏/二级页标题移除旧胶囊背景，`P7Navigation` 接入最终暖色底部三切片并保留三列/四入口布局；`frontend/src/styles.css` 接入暖奶油色、内凹搜索/输入/分段、三切片主次/危险按钮和浅凸列表/弹窗；新增最终导航与按钮 RGBA 资源；同步主题色和测试契约。
- 验证：前端 `npm run --prefix frontend test -- --run`（27 个测试文件、243 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；本地后端和 Vite 浏览器实测 320/390/430px，标题中心偏差均为 `0px`、横向溢出均为 `0px`、底部右边界间距均为 `0px`，导航三图均加载成功，顶部背景图为 `none`；已生成 `output/playwright/skeuomorphic-final-390.png` 并人工检查。
- 未验证：尚未在 Safari/iOS WebView 真机比较透明 PNG 边缘、SVG filter 和系统安全区的像素差异；未发布或提交 Git。
- 下一步：评审最终顶部透明操作、底部导航实体厚度、按钮按压反馈和暖色控件层级；通过后再安排真机验收。

### 2026-08-22 — 修复暖色胶囊母版多余半透明（本次会话）

- 状态：待评审。
- 目标：丢弃损坏的 RGBA 胶囊切图，直接从无 alpha 的原始 RGB 母版抠除底色并重建透明层；主体、凸起厚边和底缘不透明，仅外部右下柔影保留半透明。
- 范围：`docs/ui-assets/prototypes/skeuomorphic-capsule/assets/top-master.png`、`bottom-master.png` 作为唯一来源，重建对应暖色母版及六张三切片；不修改页面结构、CSS、业务组件或其他资产。
- 设计/需求基线：用户指定会话 `01a024a5-ad40-7b00-8826-40d9a6fdfd2c` 的修复要求；用户本轮明确要求从完全没有透明度的原图切图。
- 预期验证：主体与厚边 alpha=255，背景 alpha=0，仅外部右下柔影为 `0 < alpha < 255`；RGB 材质直接来自无 alpha 原图；母版与三切片像素一致。
- 会话记录：用户进一步明确最终需要“从完全不透明原图抠除底色”：主体不透明，只有右下柔影半透明。本轮保留原始 RGB 作为唯一颜色来源，重新计算主体/实体厚边和外部柔影 alpha，不再使用旧 RGBA 的预乘暗色。
- 完成：从无 alpha 原始 RGB 母版重建顶部/底部 RGBA 母版；主体与实体厚边保留原图 RGB 并设为 alpha=255，抠除背景，外部右下阴影使用原图阴影范围并限制为半透明 alpha；同步重切六张三片。
- 验证：顶部 `2103×600` 统计为 `0/139208/757630`（透明/半透明/不透明），底部为 `0/182761/681260`；主体边界内半透明像素均为 `0`，阴影最大 alpha 为 `170`；六张切片均逐像素等于母版裁剪；`file`、自定义 PNG 解码和 `git diff --check -- docs/progress-tracker.md` 通过。
- 未验证：未运行前端测试、lint、生产构建或 Safari/iOS WebView 检查；未在原型页面做最终视觉验收。
- 下一步：请评审主体边缘、右下柔影强度和页面背景融合效果。

### 2026-08-22 — 修复移动访问令牌过期时状态接口阻断刷新（本次会话）

- 状态：待评审。
- 目标：根据生产日志定位“刷新令牌有效但 App 仍反复显示登录”的真实原因，修复认证状态接口与移动 Bearer 自动刷新机制之间的契约冲突。
- 范围：`/api/auth/status` 的移动 Bearer 失效响应、前端现有 401 刷新链路及回归测试；不改变匿名访问状态、长期刷新令牌和主动退出语义。
- 设计/需求基线：生产 `fridgeboard-app` 最近 48 小时认证日志；`backend/fridgeboard/main.py` 的 `auth_status`；`frontend/src/appApi.ts` 的 401 刷新逻辑；现有移动认证测试。
- 预期验证：匿名请求仍返回 `200 {authenticated:false}`；带失效移动 Bearer 的状态请求返回 401，使 `request()` 自动调用 `/api/auth/mobile/refresh` 并重试；刷新成功后首页不进入 signed-out；运行后端全量测试和前端相关测试。
- 会话记录：生产日志已出现多次“Owner API 401 → mobile refresh 200 → auth/status 200”的序列，证明刷新令牌有效而状态接口把失效访问令牌伪装成正常未认证响应，前端因此绕过 `request()` 的 401 刷新分支并显示登录页。另一次登录链路出现 callback 303 后没有 mobile exchange，需在后续真实设备测试中区分深链未交付与 App 未消费回调。
- 完成：`/api/auth/status` 对带失效移动 Bearer 的请求改为返回 401，匿名无凭证请求仍返回 200 false；补充回归断言，保留前端现有 refresh/retry 机制。
- 验证：后端 `uv run ruff check backend`、`uv run pytest`（172 passed，54 条既有警告）、`uv lock --check`；前端 lint、全量测试（27 个文件、243 passed）和生产构建均通过；`git diff --check` 通过。
- 未验证：本次改动尚未提交或部署，尚未在真实 Android 设备上确认刷新后页面不再回到登录页；当前线上仍运行此前 release。
- 下一步：评审后提交并部署此认证修复；复现时用日志中的 `app_state`/`sso_state` 指纹关联 401、refresh、status、callback、mobile exchange 和深链事件。

### 2026-08-22 — 方案 A 纯 CSS 外凸导航与按钮原型（本次会话）

- 状态：进行中。
- 目标：依据用户指定的 `/Users/jason/Downloads/preview.html` 方案 A，将现有拟物原型的顶部栏、底部导航和全部凸起按钮改为纯 CSS 连续厚倒角，不再依赖贴图绘制外凸效果。
- 范围：仅新增 `docs/ui-assets/prototypes/skeuomorphic-css-relief/` 独立 HTML/CSS/JS 原型和本轮截图；保留现有页面信息、交互示例、视口切换与运行时指标；不修改 `frontend/src`、业务组件、冰箱布局或生产资源。
- 设计基线：用户指定的方案 A；现有 `docs/ui-assets/prototypes/skeuomorphic-capsule/` 多页面原型；`docs/ui-design-specification.md` 的顶部栏、底部导航、操作热区与拟物主题约束。
- 预期验证：原型不引用 PNG 导航/按钮贴图；320/390/430px 下无横向溢出，顶部标题保持视口中心，顶部/底部壳体连续，主次/危险按钮和选中项共用纯 CSS 外凸语义；完成 HTML/CSS/JS 语法和浏览器截图检查。
- 完成：新增 `docs/ui-assets/prototypes/skeuomorphic-css-relief/`，保留原型页面切换、视口切换、表单、食谱分段、编辑页和确认弹窗；顶部栏、底部导航、主次/危险按钮、选中分段项、列表行和图标块改用方案 A 的多层 CSS 光影与连续厚倒角；移除所有导航/按钮贴图节点和 `assets/*.png` 依赖；新增 `preview-390.png` 评审截图。
- 验证：`node --check docs/ui-assets/prototypes/skeuomorphic-css-relief/prototype.js`、`git diff --check -- docs/progress-tracker.md docs/ui-assets/prototypes/skeuomorphic-css-relief` 通过；Playwright 本地服务实测 320/390/430px：首页、食谱、编辑、控件和确认弹窗可访问，标题中心偏差均为 `0.00px`，横向溢出均为 `0px`，控制台 `0 error / 0 warning`；`rg` 确认新版原型无导航/按钮图片资源引用。
- 未验证：未在 Safari/iOS WebView 比较纯 CSS 多重背景和阴影的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 状态：待评审。

### 2026-08-22 — 方案 B SVG 浮雕导航与按钮原型（本次会话）

- 状态：进行中。
- 目标：依据 `/Users/jason/Downloads/preview.html` 的方案 B，为顶部栏、底部导航和凸起按钮生成一版内联 SVG 浮雕原型；保留“全部 / 临期”分段控件现有 CSS 内凹实现，不将其改为方案 A 或 SVG 表面。
- 范围：新增 `docs/ui-assets/prototypes/skeuomorphic-svg-relief/` 独立 HTML/CSS/JS 原型；保留现有页面、交互、视口切换和运行时指标；不修改 `frontend/src`、业务组件、冰箱布局或生产资源。
- 设计基线：用户指定的 `preview.html` 方案 B；现有 `skeuomorphic-capsule` 多页面原型；`docs/ui-design-specification.md` 的顶部栏、底部导航与拟物主题约束。
- 预期验证：方案 B 表面由内联 SVG 渐变、左上光照、右下暗面和 SVG 投影生成；新版不引用 PNG 导航/按钮贴图；“全部 / 临期”分段控件 DOM 与 CSS 语义保持原样；320/390/430px 下无横向溢出并完成浏览器截图检查。
- 完成：新增 `docs/ui-assets/prototypes/skeuomorphic-svg-relief/`；通过运行时唯一 ID 为顶部栏、底部导航、主次/危险按钮、列表行、图标块和 SVG 外凸样例插入独立内联 SVG，包含渐变材质、左上光照、右下暗面、中心平面和 SVG 投影；完全移除 PNG/`border-image` 表面依赖；明确排除 `.segment-track`，并恢复“全部 / 临期”原有 CSS 内凹与选中态规则。
- 验证：`node --check docs/ui-assets/prototypes/skeuomorphic-svg-relief/prototype.js`、`git diff --check -- docs/progress-tracker.md docs/ui-assets/prototypes/skeuomorphic-svg-relief` 通过；Playwright 实测首页、食谱、本周/下周切换、控件页和确认弹窗，320/390/430px 下标题中心偏差均为 `0.00px`、横向溢出均为 `0px`，控制台 `0 error / 0 warning`；已人工检查 390px 截图确认“全部 / 临期”未插入 SVG，顶部/底部和按钮使用方案 B 浮雕；`preview-390.png` 为有效 PNG。
- 未验证：未在 Safari/iOS WebView 比较内联 SVG filter、mask 和 drop shadow 的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 状态：待评审。

### 2026-08-21 — 拟物主题胶囊切片与动态浮雕 HTML 原型（本次会话）

- 状态：待评审。
- 目标：针对另一会话直接实现 v5 设计失败的问题，先产出独立 HTML 网页原型，验证生成胶囊位图如何通过切分/拉伸适应 320/390/430px 布局，以及如何用 HTML 文字和 SVG 图标动态渲染与设计图一致的方向相关浮雕。
- 范围：`docs/ui-assets/prototypes/` 下的独立 HTML/CSS/JS 原型与专用位图切片；不修改 `frontend/src`、业务组件、冰箱共享几何或交互逻辑。冰箱位置、占比、缩放和 framing 继续由程序全局控制，不在原型验证范围。
- 设计基线：用户已确认的 `docs/ui-assets/proposals/skeuomorphic-imagegen-system-v5.html/png`；`navigation-top-populated-color-v2.png`、`navigation-bottom-populated-color-v2.png`与 `shared-controls-color-v2.png`；用户原始 AGIC 附件的暖奶油白、低饱和咖啡奶油色和左上光源。
- 实现方案：导航胶囊使用横向三切片（左圆端/中心可拉伸带/右圆端），圆端按高度等比缩放，中心带只水平拉伸，避免圆角、底缘回凹和投影被整图非等比扭曲。HTML 文字和 SVG 共用内联 SVG filter：`SourceAlpha` 高度图 + `feDiffuseLighting`/`feSpecularLighting` 左上远光 + 暗面挤出 + 独立右下模糊投影；光照对每个局部边缘法线计算明暗，不用多重固定 `text-shadow` 伪造。
- 预期验证：同一原型可切换 320/390/430px 宽度，顶部三列标题几何中心偏差 ≤ 2px，胶囊圆端宽高比在三视口不变，中心带无可见接缝，底缘回凹/投影不被拉平；标题文字和顶部/底部 SVG 图标均具有随形状方向连续变化的左上高光与右下暗面，普通文字保持平面；Playwright CLI 检查图像加载、溢出、接缝、居中和控制台错误。
- 现有变更边界：工作区已存在另一会话对 `frontend/src/theme.ts`、`frontend/src/styles.css`、`frontend/src/sharedUi.tsx`、前端测试和 `frontend/public/assets/theme/` 的未提交实现；本任务不覆盖、回退或继续修改这些文件，只用独立原型验证方案。
- 完成：使用 provider-aware `imagegen` 流程和 `gpt-image-2` 生成 v5 配色的顶部/底部空白胶囊母版，并机械裁成固定左圆端、横向伸缩中心带、固定右圆端三片；新增 `docs/ui-assets/prototypes/skeuomorphic-capsule/index.html`，可在 320/390/430px 间切换并实时编辑 HTML 标题。标题与内联 SVG 共用 `SourceAlpha` 高度图、315° 左上漫反射/柔高光、右下暗面挤出和独立软影；普通导航、搜索和按钮文字保持平面。胶囊网格行高与图片最小尺寸已锁定，避免宽视口下图片固有宽高比撑高壳层。
- 验证：8 张母版/切片均经 `file` 确认为有效 RGB PNG；Playwright CLI 实测 320/390/430px 三种原型宽度的标题中心偏差均为 `0.00px`、顶部/底部最大露缝均为 `0.00px`、圆端宽高比均为 `0.7857`、横向溢出均为 `0px`；320px 下输入 8 字动态标题可正常更新并按容器省略，不改变几何指标；控制台 `0 error / 0 warning`。已人工检查三宽度截图，确认奶油白胶囊、底缘回凹、左上高光、右下暗面/软影及浮雕方向连续；`git diff --check -- docs/progress-tracker.md docs/ui-assets/prototypes/skeuomorphic-capsule/index.html` 通过。
- 未验证：本任务未修改应用代码，因此未运行前端测试、lint 或生产构建；尚未验证 Safari/iOS WebView 对 SVG filter 的像素级差异，也未把原型方案接入现有共享顶部栏/底部导航。
- 下一步：评审独立原型的胶囊厚度、色彩和文字/SVG 浮雕强度；确认后再将三切片壳层与共享滤镜按现有主题组件边界接入应用，并补 Chromium/Safari 视觉回归。
- 本轮评审反馈：用户确认顶部标题胶囊与底部导航效果符合预期；要求输入框及“本周/下周”分段选择恢复高浮雕 v3 的内凹语义，补充多个页面验证共享控件的一致性，并修正文字/SVG 顶部线条偏粗、左上高光不足的问题。
- 本轮范围：保留已确认的顶部/底部三切片位图与全局冰箱 framing 边界，仅扩展独立 HTML 原型的首页、每周食谱、编辑物品、组件/确认弹窗场景；统一内凹输入/选择/分段容器、凸起选中项、主次按钮和列表表面。细化共享浮雕滤镜的高度图、高光和线宽，不修改 `frontend/src`。
- 本轮预期验证：四个页面在 320/390/430px 无溢出；同语义控件跨页面复用同一类名和令牌；输入、选择、文本域和分段轨道呈连续内凹，上浮选中项与主次按钮层级明确；标题/SVG 左上亮边可见且顶部轮廓不出现粗重双线；标题中心偏差不超过 2px、切片无露缝、控制台无错误。
- 本轮完成：将原型拆分为 `index.html`、`styles.css` 与 `prototype.js`，新增首页、每周食谱、编辑物品、共享控件/确认弹窗四个可交互页面。搜索、文本输入、选择器、数量控件、日期、文本域和分段轨道统一复用 `--inset-shadow` 内凹表面；选中 Tab 使用奶油白浅凸表面；主按钮、次按钮、禁用按钮、危险按钮、列表行、浮雕图标块和居中弹窗分别建立清晰层级。顶部/底部继续使用已确认三切片壳层；共享 SVG filter 将图标线宽从 3px 级收至 2.35px、缩短暗面位移并增强 315° 左上柔高光。
- 交互修正：首次浏览器检查发现手机容器与页面按钮共用了 `[data-page]` 查询，任意内部点击都会重新渲染当前页并清空 Tab/弹窗状态；已将绑定范围收紧为 `.mode-control [data-page]`。修正后“本周/下周”可正确切换 `aria-selected`，弹窗保持打开并具有 `role="dialog"`、`aria-modal="true"`。
- 本轮验证：`node --check prototype.js` 通过；HTML/CSS/JS 本地请求均为 HTTP 200。Playwright CLI 实测四页面在 320/390/430px 下手机壳与内容区横向溢出均为 `0px`，标题中心偏差均为 `0.00px`，顶部切片最大露缝均为 `0.00px`，带底部导航页面的底部露缝均为 `0.00px`，圆端宽高比均为 `0.7857`；控制台 `0 error / 0 warning`。已人工检查首页、食谱、编辑、控件、320px 控件页与确认弹窗截图，未发现文字截断、元素重叠或不连贯接缝。
- 本轮未验证：仍未在 Safari/iOS WebView 比较 SVG filter 的像素级差异；未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 本轮下一步：评审四页面的内凹深度、选中 Tab 浮起高度、按钮层级以及细化后的标题/SVG 高光；确认后再把这些共享令牌和滤镜接入应用组件。
- 第三轮评审反馈：用户要求凸起文字/SVG 去除深咖啡实体暗面，仅保留底部更淡的渐变软影，并将当前误读为右上打光的效果校正为与控件一致的左上光源；食谱列表分类图标去除内凹方框，改为图标自身下方渐变影。顶部/底部胶囊资产周围不应出现独立白色底块，整个页面统一使用胶囊母版的奶白色。Tab 与列表项保持当前方案。
- 第三轮按钮基线：以用户提供的 848×190 主按钮附件为形体与主按钮色参考，通过 image-to-image 去除画布背景、原有外部投影和“+ 添加厨品”文字，生成透明背景的空白按钮表面；次按钮使用相同形体但奶白色。HTML/CSS 负责底部深色渐变影，按下时按钮整体向右下移动、阴影同步变短变浅。
- 第三轮预期验证：按钮位图透明且无文字/原始阴影；主次按钮共用同一布局和按压反馈；页面与导航壳周围底色连续；浮雕文字/SVG 无深咖啡侧壁且左上高光可见；食谱图标无方框；四页面在 320/390/430px 仍无溢出、切片露缝或标题偏移。
- 第三轮完成：使用 `gpt-image-2` 高质量 image-to-image 将用户 848×190 按钮参考编辑为透明、无文字、无外部投影的咖啡奶油色主按钮表面（2156×729 RGBA），再以该结果编辑出同形体暖奶白次按钮表面（2172×724 RGBA）；机械裁边、统一为 360px 高并各切为左端/可拉伸中心/右端三片。按钮使用 CSS `border-image` 三切片表面，底部投影由独立深色横向渐变生成；`:active` 时按钮向右下移动 3px，投影反向收缩、降低透明度并减小模糊。
- 第三轮导航与光照：顶部/底部壳层改用 RGBA 透明三切片，页面统一为 `#f2eee9` 暖奶白，去除导航资产周围的矩形底块。首次透明切片仍沿用 RGB 版 1px 重叠时出现半透明影叠加暗线，已取消重叠；目标宽度网格列为整数，三宽度均无露缝。共享浮雕 filter 删除深咖啡侧壁层，只保留浅咖啡底部渐变影；`feDistantLight` 方位从 315° 校正为 225° 左上光源。食谱分类图标去除内凹方框，改用图标自身 `drop-shadow`。
- 第三轮验证：主次按钮原始与切片文件均为有效 RGBA PNG，已人工确认无文字、无图标、无画布背景；透明导航母版和 6 张切片均为有效 RGBA PNG。Playwright CLI 人工检查首页、食谱、编辑、控件及按钮按住截图，确认页面底色连续、图标无方框、浮雕无深色实体侧壁，主次按钮形体/投影一致，按住时位移与影长变化可见。四页面在 320/390/430px 下标题中心偏差均为 `0.00px`、顶部露缝均为 `0.00px`、带底部导航页面的底部露缝均为 `0.00px`、横向溢出均为 `0px`；控制台 `0 error / 0 warning`。
- 第三轮未验证：未在 Safari/iOS WebView 比较 `border-image`、SVG filter 与 `drop-shadow` 的像素差异；未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第三轮下一步：评审透明导航、左上光源、无深色侧壁浮雕、食谱图标影和新主次按钮的静止/按压效果；确认后再进入共享应用组件实现。
- 第四轮评审反馈：用户指出当前页面背景、顶部/底部导航、奶白次按钮等整体偏冷，与最初 AGIC 期望图的暖黄色奶白不一致；危险按钮高光出现不合理绿色；文字/SVG 浮雕希望更凸、更深色。
- 第四轮取样基线：重新读取最初 1280×2773 AGIC 附件，顶部主体背景均值约为 `RGB(235,230,221)`，下部背景约为 `RGB(234,227,217)`，底部导航正面约为 `RGB(230,224,214)`；现原型页面背景为 `RGB(242,238,233)`，证实偏亮偏冷。本轮以原始附件实测暖奶白为唯一基准。
- 第四轮范围：统一暖化页面背景、透明顶部/底部导航、奶白次按钮、浅凸表面和弹窗；危险按钮不再使用会污染高光色相的 CSS `hue-rotate`，改为独立红色暖白光材质资产；加深文字/SVG 正面色并提高高度图/漫反射/高光对比，但继续禁止深咖啡实体侧壁。
- 第四轮预期验证：所有奶白表面与 `RGB(235,230,221)` 基准处于同一暖黄色系；危险按钮高光通道不偏绿；浮雕更凸、更深且仍为左上暖白光、底部浅影；四页面三宽度几何指标保持不变。
- 第四轮完成：页面背景从冷白 `#f2eee9` 调整为附件取样暖奶白 `#ebe6dd`；透明顶部/底部导航母版与切片、奶白次按钮表面执行保明暗层级的暖色校正，中心代表色分别约为 `RGB(236,228,219)` 与 `RGB(234,225,212)`；浅凸表面/弹窗统一为 `#f0eadf`。顶部标题、导航和图标正面从 `#d8c7b4` 加深为 `#bfa184`，活动态加深为 `#b48f6d`。
- 第四轮危险按钮：通过 `gpt-image-2` 高质量、高输入保真编辑生成独立砖红材质；模型输出错误地把透明棋盘绘入 RGB 背景，未直接使用。最终提取其砖红材质并套用已验证主按钮真实 Alpha 轮廓，生成 2065×360 RGBA 三切片；CSS 删除 `sepia/saturate/hue-rotate`，因此暖白左上高光不再被色相滤镜污染为绿色。
- 第四轮浮雕：高度图模糊从 `0.52` 调整为 `0.62`，漫反射表面高度从 `2.55` 提升为 `4.1`，镜面高度从 `3.1` 提升为 `4.5`，并提高漫反射/高光对比；光照颜色改为暖白 `#fff0d7/#fff5e6`，继续使用 225° 左上光源和浅色底影，不恢复深咖啡实体侧壁。
- 第四轮验证：人工检查 390px 首页、控件页和确认弹窗截图，确认页面/导航/次按钮/弹窗进入同一暖黄色奶白色系，危险按钮高光为暖白且无绿色，标题与 SVG 正面更深、起伏更明显。Playwright CLI 实测四页面在 320/390/430px 下标题中心偏差均为 `0.00px`、顶部露缝均为 `0.00px`、带底部导航页面的底部露缝均为 `0.00px`、横向溢出均为 `0px`；控制台 `0 error / 0 warning`。
- 第四轮未验证：未在 Safari/iOS WebView 比较暖色管理与 SVG filter 像素差异；未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第四轮下一步：评审暖色基准、独立砖红危险按钮和增强浮雕强度；确认后再进入应用共享组件实现。
- 第五轮需求：用户要求验证能否只用 CSS 做外凸，达到顶部标题栏和按钮的圆角凸起效果；本轮新增独立纯 CSS 外凸样例，与当前三切片按钮并排对照，不改变已确认页面壳和业务原型。
- 第五轮预期验证：纯 CSS 样例使用左上浅高光、右下接触影、底部柔和落影和按压位移；在 390px 以及 320/430px 几何回归下不溢出，便于决定后续应用实现采用 CSS 外凸还是位图三切片。
- 第五轮完成：在共享控件页新增“纯 CSS 外凸试验”，包含咖啡色主按钮、奶白色次按钮和图标按钮。样例使用普通 CSS 背景、`inset` 高光、左上外部浅光、右下多级阴影、独立底部渐变影和 `:active` 位移，不依赖按钮位图或导航资产。
- 第五轮验证：Playwright 390px 截图确认三种 CSS 样例均具有圆角实体厚度、左上高光和右下阴影；按住主按钮时向右下移动且阴影变短变浅。320px 与 430px 运行时指标均为标题中心偏差 `0.00px`、顶部露缝 `0.00px`、横向溢出 `0px`、圆端比例 `0.7857`；控制台 `0 error / 0 warning`。`node --check prototype.js` 与 `git diff --check` 通过。
- 第五轮未验证：尚未在 Safari/iOS WebView 比较纯 CSS 多重阴影的像素差异；本轮仍未修改应用代码，未运行前端测试、lint 或生产构建。
- 第五轮下一步：用户评审纯 CSS 外凸与当前位图三切片按钮的边缘、厚度和按压反馈，再决定后续应用组件采用 CSS 外凸、位图三切片或混合方案。
- 第六轮反馈：用户指出纯 CSS 外凸样例的边沿太小，希望边沿明显增厚且圆角坡度更陡；按钮上表面保持平整，不要用渐变把正面做成鼓包。
- 第六轮范围：只调整共享控件页的纯 CSS 外凸试验，保留现有位图三切片按钮作为对照；CSS 样例改为平面正面、外扩厚边、陡峭圆角和独立底部软影。
- 第六轮完成：纯 CSS 外凸样例改为“平整上表面 + 外扩 7px 厚边环带 + 独立底部软影”。外沿使用更大的圆角半径和 145° 明暗渐变，只在环带内显示；按钮中心使用纯色背景，避免渐变制造鼓包。按压态改为整体右下移动 4px，并同步降低环带/阴影强度。
- 第六轮验证：390px 截图确认咖啡色、奶白色和图标样例均显示明显陡峭圆角和厚边，中心面保持平整；按压截图确认位移和阴影收缩。320/430px 指标均为标题中心偏差 `0.00px`、顶部露缝 `0.00px`、横向溢出 `0px`、圆端比例 `0.7857`；控制台 `0 error / 0 warning`。`node --check prototype.js` 与 `git diff --check` 通过。
- 第六轮未验证：尚未在 Safari/iOS WebView 比较 CSS mask-composite 的兼容性；本轮仍未修改应用代码，未运行前端测试、lint 或生产构建。
- 第七轮反馈：用户指出外扩伪元素环带与按钮面视觉分离，当前上表面仍像缓慢凸起；需要一圈与按钮本体连续相连的厚倒角凸起。
- 第七轮范围：只替换纯 CSS 外凸试验的实现方式，改用同一元素的透明厚边框、`padding-box` 平面正面和 `border-box` 倒角渐变；保留按压位移和底部软影，位图三切片按钮不变。
- 第七轮完成：移除独立伪元素外环，纯 CSS 样例现在使用同一按钮元素的 `7px` 透明厚边框；`padding-box` 保持单色平面上表面，`border-box` 使用 145° 渐变形成连续陡峭倒角，外沿与面板共享同一圆角盒模型。底部软影与按压状态继续独立处理。
- 第七轮验证：390px 截图确认咖啡色、奶白色和图标样例的外沿与正面连续相连，正面保持平整；320/430px 指标均为标题中心偏差 `0.00px`、顶部露缝 `0.00px`、横向溢出 `0px`、圆端比例 `0.7857`；控制台 `0 error / 0 warning`。`node --check prototype.js` 与 `git diff --check` 通过。
- 第七轮未验证：尚未在 Safari/iOS WebView 比较 `border-box` 多背景层和厚透明边框的像素差异；本轮仍未修改应用代码，未运行前端测试、lint 或生产构建。
- 第八轮请求：用户决定放弃纯 CSS 外凸方案，恢复到加入纯 CSS 外凸试验之前的原型版本；保留位图三切片按钮、暖色主题、透明导航、浮雕和内凹控件。
- 第八轮完成：从 `skeuomorphic-capsule` 共享控件页移除纯 CSS 外凸试验 DOM 和全部 `.css-raised*` 样式，恢复位图三切片按钮作为唯一按钮外凸实现；未回退暖色资产、危险按钮材质、导航透明切片或其他已确认视觉调整。其他会话的 `skeuomorphic-css-relief`、`skeuomorphic-svg-relief` 独立原型未修改。
- 第八轮验证：`node --check prototype.js`、`git diff --check` 通过；本地原型 HTTP 200。恢复后的页面不再出现“纯 CSS 外凸试验”或 `.css-raised` 资源，位图主/次/危险按钮引用仍保留。
- 第九轮请求：用户指出底部导航右侧近边缘与底部边沿出现偏白叠色，需要确认是否为素材边缘而非页面层，并按暖奶白背景统一处理。
- 第九轮范围：仅检查并修正 `skeuomorphic-capsule` 底部导航 RGBA 母版及三切片；不修改顶部导航、按钮、应用代码或页面布局。
- 第九轮预期验证：底部导航右侧和底缘不再出现浅色画布残留，透明合成后与页面暖奶白背景连续；切片无露缝，原型 320/390/430px 几何指标保持不变。
- 第九轮完成：确认问题来自底部母版边缘的浅色画布残留与过亮下缘过渡，不是页面额外叠加层；对右侧抗锯齿面进行连续去底色处理，并压低底部倒角亮度，重新导出 `bottom-warm-transparent-master.png` 及左/中/右三切片。顶部导航、按钮、应用代码和页面布局保持不变。
- 第九轮验证：四张底部 PNG 均为有效 RGBA；`node --check docs/ui-assets/prototypes/skeuomorphic-capsule/prototype.js`、`git diff --check -- docs/progress-tracker.md docs/ui-assets/prototypes/skeuomorphic-capsule` 通过；Playwright 实测 320/390/430px 横向溢出均为 `0px`、标题按钮中心偏差均为 `0px`、底部切片最大接缝均为 `0px`，控制台 `0 error / 0 warning`；已生成 `output/playwright/bottom-nav-after-edge-fix-desktop.png` 供评审。
- 第九轮未验证：尚未在 Safari/iOS WebView 比较透明 PNG 边缘和色彩管理的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十轮请求：用户明确要求胶囊按钮实体不应有透明，只有右下投影、底缘暗影和外部柔影保留半透明。
- 第十轮范围：仅调整 `skeuomorphic-capsule` 顶部/底部导航母版及三切片的 alpha 分层；保留主体颜色、光照、几何、文字图标、页面布局和应用代码。
- 第十轮预期验证：按钮主体在有效圆角面内 alpha=255，阴影区域仍使用半透明 alpha；三切片无接缝，320/390/430px 不溢出。
- 第十轮完成：按每行实体面亮色区域重建 alpha，填充主体圆角面为 `alpha=255`；删除主体外的亮色半透明残留，仅保留暗色右下投影、底缘暗影和外部柔影的半透明 alpha。顶部/底部母版及左/中/右三切片均已重新导出。
- 第十轮验证：顶部/底部母版均统计为亮色半透明像素 `0`、暗色半透明像素保留；全部 PNG 为有效 RGBA；`node --check prototype.js`、`git diff --check` 通过；Playwright 实测 320/390/430px 横向溢出、标题中心偏差和底部切片接缝均为 `0`，控制台 `0 error / 0 warning`；已生成 `output/playwright/nav-body-opaque-desktop.png`。
- 第十轮未验证：尚未在 Safari/iOS WebView 比较硬边主体与 PNG 色彩管理的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十一轮反馈：用户指出上一轮处理仍未达到要求，并确认 `nav-item` 并非目标图片；要求导航胶囊除外部柔影外，实体面、深色倒角和底缘均不得半透明。
- 第十一轮完成：重新处理顶部/底部导航母版，按完整圆角实体轮廓将浅色面与深色倒角统一设为 `alpha=255`，仅保留轮廓外右下柔影半透明；重新导出三切片。`nav-item` 内联 SVG 未修改。
- 第十一轮验证：主体轮廓内 alpha=0/部分 alpha 均为 `0`，轮廓外亮色半透明残留为 `0`；`node --check prototype.js`、`git diff --check` 通过；Playwright 实测 320/390/430px 横向溢出、标题中心偏差和底部切片接缝均为 `0`，控制台 `0 error / 0 warning`；生成 `output/playwright/nav-body-only-shadow-desktop.png`。
- 第十一轮未验证：尚未在 Safari/iOS WebView 比较硬边主体与 PNG 色彩管理的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十二轮反馈：用户确认上一轮页面无可见改善，怀疑上下文污染，要求独立子代理复核并明确“除外部柔影外实体全部不透明”。
- 第十二轮处理：子代理独立复核指出上一版仍保留了导航母版横向透明尾巴；主代理据此将主体实体轮廓固定为全不透明，并按 alpha 有效横向边界裁掉左右透明尾巴，再以相同 470px 左右端重新切出中心可拉伸片。`nav-item` 仍未修改。
- 第十二轮验证：顶部/底部母版改为 2022×600 / 2025×600，左右切片均 470×600，中心片分别 1082×600 / 1085×600；实体轮廓内 alpha=0/部分 alpha 均为 `0`，轮廓外亮色半透明残留为 `0`，仅暗色柔影保留半透明；Playwright 320/390/430px 横向溢出、标题中心偏差和切片接缝均为 `0`，控制台 `0 error / 0 warning`；生成 `output/playwright/nav-alpha-repaired-desktop.png`。
- 第十二轮未验证：尚未在 Safari/iOS WebView 比较裁切后 PNG 的色彩和阴影像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十三轮请求：用户提供新的 2172×724 RGBA 底部导航素材，要求基于该图完成切片并替换原型；顶部导航移除 `top master` 背景，左右改为独立小方形次按钮，中间标题直接绘制在页面背景上。
- 第十三轮范围：处理用户提供的底部 PNG、顶部导航 DOM/CSS 和次按钮方形素材；不修改页面内容、底部导航交互、`nav-item` SVG 或应用代码。
- 第十三轮预期验证：底部主体比例与新图一致、中心可横向拉伸且无接缝；顶部不再请求 `top-warm-transparent-*`，左右按钮使用次按钮材质方形端片，标题位于页面背景；320/390/430px 无溢出。
- 第十三轮完成：读取用户提供的 `/Users/jason/Downloads/ChatGPT Image 2026年8月23日 01_32_24.png`，保留其 RGBA 材质与影子，将无效透明留白裁除并切为 470px 左端、1160px 中心、470px 右端，替换底部导航三切片。顶部移除 `top-warm-transparent-*` DOM 背景，新增由 `secondary-warm-master.png` 左端提取的 `secondary-square-warm.png` 方形次按钮材质；标题继续使用原有文字和浮雕滤镜，直接绘制在页面背景上。同步修正运行时指标，使无顶部切片时显示“不适用”而不报错。
- 第十三轮验证：底部母版为 2100×500 RGBA，三切片为 470×500 / 1160×500 / 470×500；顶部 DOM 不含 `.capsule--top .capsule-skin`，存在 2 个 `.top-action`；Playwright 实测 320/390/430px 横向溢出均为 `0px`、标题中心偏差均为 `0px`、底部切片接缝均为 `0px`，控制台 `0 error / 0 warning`；`node --check prototype.js`、`git diff --check` 通过；生成 `output/playwright/new-bottom-top-buttons-desktop.png`。
- 第十三轮未验证：尚未在 Safari/iOS WebView 比较用户新素材的透明阴影、方形次按钮裁片和色彩管理的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十四轮请求：用户提供第二张 2172×724 RGBA 底部导航素材，要求只能裁切、不得改动透明度；同时指出顶部右侧方形按钮的右边缘被裁切，要求左右外侧边缘完整，中间部分允许被覆盖。
- 第十四轮完成：仅将第二张素材按 `(40,90)-(2140,620)` 做几何裁切，并切为 470px 左端、1160px 中心、470px 右端；逐像素校验裁切结果与输入区域完全一致，未重算或修改 alpha。顶部左按钮继续使用次按钮左端片，右按钮改用次按钮右端片，保留两侧完整圆角。
- 第十四轮验证：底部母版为 2100×530 RGBA，三切片为 470×530 / 1160×530 / 470×530；alpha 裁切 exact match；Playwright 实测 320/390/430px 横向溢出均为 `0px`、标题中心偏差均为 `0px`、底部切片接缝均为 `0px`，顶部无 master 背景且两枚方形按钮宽度均为 `48px`，控制台 `0 error / 0 warning`；`node --check prototype.js`、`git diff --check` 通过；生成 `output/playwright/bottom-v2-top-edge-complete.png`。
- 第十四轮未验证：尚未在 Safari/iOS WebView 比较第二张用户素材的透明阴影、顶部左右端片和色彩管理的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十五轮请求：用户提供第三张 1672×941 RGBA 底部导航素材，要求继续试用；同时指出顶部左右按钮分别被截掉内侧边缘，要求统一样式并完整保留按钮两侧外框。
- 第十五轮范围：仅几何裁切第三张底部素材并替换底部三切片；顶部次按钮改为同一张次按钮母版的四边完整 9-slice，不再分别使用左/右端半片。禁止修改用户素材 alpha、颜色和阴影像素。
- 第十五轮预期验证：第三张底部素材裁切区域与输入逐像素一致；端片比例适配 128px 高度；顶部左右按钮尺寸和材质一致、两侧边框完整；320/390/430px 无溢出和接缝。
- 第十五轮完成：将第三张素材按 `(30,300)-(1642,680)` 纯几何裁切，得到 1612×380 母版并切为 300×380 / 1012×380 / 300×380；裁切区域与输入逐像素一致，未改 alpha。顶部两个按钮改用 `secondary-warm-master.png` 的四边 `border-image` 9-slice（150px source slice / 12px border），左右共用同一规则，保留完整四边圆角。
- 第十五轮验证：Playwright 实测 320/390/430px 横向溢出均为 `0px`、标题中心偏差均为 `0px`、底部切片接缝均为 `0px`，两个顶部按钮尺寸均为 `48×48px`，控制台 `0 error / 0 warning`；`node --check prototype.js`、`git diff --check` 通过；生成 `output/playwright/bottom-v3-top-9slice.png`。
- 第十五轮未验证：尚未在 Safari/iOS WebView 比较第三张用户素材的透明阴影、CSS `border-image` 四边切片和色彩管理的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十六轮请求：用户要求底部导航背景图高度缩小，以减少图标菜单上下空白；不改变底部素材内容和图标尺寸。
- 第十六轮范围：仅调整底部导航壳高度与内容区上下 padding；保留第三张用户素材、三切片比例、图标 SVG 和交互。
- 第十六轮预期验证：底部背景高度收紧、图标和文字完整可见，上下留白减少；320/390/430px 无溢出和切片接缝。
- 第十六轮完成：将底部导航壳高度从 `128px` 收紧为 `112px`，内容 padding 从 `14px 14px 27px` 调整为 `9px 14px 18px`；未修改第三张用户素材、三切片和 nav-item 图标。
- 第十六轮验证：Playwright 实测 320/390/430px 底部高度均为 `112px`、nav-item 高度保持 `82px`，横向溢出、标题中心偏差和切片接缝均为 `0`，控制台 `0 error / 0 warning`；生成 `output/playwright/bottom-height-tight-390.png`。
- 第十六轮未验证：尚未在 Safari/iOS WebView 比较收紧高度后的阴影裁切和安全区表现；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十七轮请求：用户指出底部导航最右侧阴影被截断，需要确认是容器 overflow、遮盖还是切图裁掉；同时要求顶部左右按钮取消次按钮背景，只保留直接绘制在页面背景上的图标，按下时颜色变深。
- 第十七轮范围：扩大第三张底部素材的几何裁切范围以保留右侧阴影，不修改输入 alpha；调整顶部按钮 CSS 为透明背景、无 border-image，仅保留 SVG 图标及按下颜色反馈。
- 第十七轮预期验证：右侧阴影完整可见，底部三切片无接缝；顶部两按钮无背景材质，默认图标平面显示，按下颜色加深；320/390/430px 无溢出。
- 第十七轮完成：将底部第三张素材横向裁切从 `(30,300)-(1642,680)` 扩大为 `(20,300)-(1672,680)`，得到 1652×380 母版和 300×380 / 1052×380 / 300×380 三切片；裁切区域 alpha 与输入逐像素一致，保留右侧低 alpha 阴影。顶部 `.top-action` 移除次按钮背景、border-image 和方形材质，仅保留透明背景 SVG 图标，并添加按下深色状态类。
- 第十七轮验证：Playwright 实测 320/390/430px 横向溢出均为 `0px`、标题中心偏差均为 `0px`、底部切片接缝均为 `0px`；顶部 computed style 为 `background-image: none`、`border: 0`，控制台 `0 error / 0 warning`；`node --check prototype.js`、`git diff --check` 通过；生成 `output/playwright/bottom-shadow-top-icons-transparent.png`。
- 第十七轮未验证：尚未在 Safari/iOS WebView 比较右侧低 alpha 阴影、pointer 按下状态和色彩管理的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。
- 第十八轮请求：用户指出底部导航整体向左，右侧存在空白，要求阴影覆盖到手机最右边框。
- 第十八轮范围：只调整底部导航胶囊的水平外边距；保持第三张用户素材、alpha、三切片、图标和顶部按钮不变。
- 第十八轮预期验证：底部胶囊右边界贴合手机内容右边框，右侧空白消失；左侧保留原间距，三视口无溢出和接缝。
- 第十八轮完成：确认右侧空白来自 `.capsule--bottom` 原有 `margin-right: 8px`，不是遮盖层；改为 `margin: 0 0 8px 8px`，让底部导航右边界贴合手机内容右边框，素材 alpha 和三切片保持不变。
- 第十八轮验证：Playwright 实测 320/390/430px 手机右边框与底部胶囊间距均为 `1px`（手机自身边框），横向溢出和三切片接缝均为 `0px`，控制台 `0 error / 0 warning`；生成 `output/playwright/bottom-shadow-to-right-edge.png`。
- 第十八轮未验证：尚未在 Safari/iOS WebView 比较贴边阴影与系统安全区的像素差异；本轮未修改应用代码，因此未运行前端测试、lint 或生产构建。

### 2026-08-21 — 拟物主题全局视觉方案实施（本次会话）

- 状态：待评审。
- 目标：依据已确认的 v5 拟物视觉方案，将暖奶油白应用壳、凸起顶部栏/底部导航、咖啡色控件和统一软浮雕光影接入手机端主题系统。
- 范围：`frontend/src/theme.ts`、共享 UI、主题样式与对应前端回归测试；保留现有页面骨架、交互、冰箱布局几何和物品图标资源，不修改冰箱预览布局或图标内容。
- 设计/需求基线：用户引用线程 `01a022f9-3b5b-7733-b51f-c0f0a34c7394` 的已确认 v5 结论；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §17.1；`docs/final-ui-designs.md`；`docs/ui-assets/manifest.json`；`docs/ui-assets/proposals/skeuomorphic-imagegen-system-v5.html/png`。
- 预期验证：主题令牌和共享壳层回归测试、前端测试、lint、生产构建、`git diff --check`；检查 320/390/430px 下顶部标题居中、底部导航不溢出，冰箱布局和物品图标渲染契约未被改动。视觉稿与程序生成的冰箱 framing 不纳入本次改动。
- 会话记录：已读取项目级 AGENTS、前端规则、跨页面 UI 规范、功能设计索引、最终设计注册表和 v5 进度结论；初版实现经用户指出仍是已否定的圆角矩形阴影方案后，进一步确认整张 1920×520 画布会造成胶囊出界，按拟物冰箱同类方式改为有效区域裁切和九切片拼接。用户随后确认光源应为左上高光、右下暗光/投影，并指出滤镜投影未合成、文字/SVG 高光不足；本轮按此修正。未修改冰箱布局组件、格位几何或物品图标资源。
- 完成：`frontend/src/theme.ts` 更新最终 v5 系统栏颜色；`frontend/src/styles.css` 使用像素边界 `border-image-slice` 响应式拼接顶部/底部胶囊；`frontend/src/sharedUi.tsx` 将动态标题/SVG 浮雕改为左上局部高光、右下挤出暗面和已合成的右下接触投影；新增裁切后的 `frontend/public/assets/theme/navigation-shell-top-v5-slice.png` 与 `navigation-shell-bottom-v5-slice.png`；`frontend/src/theme.test.ts`、`frontend/src/App.test.ts` 补充主题颜色、九切片资源、光照方向和冰箱选择器边界回归。
- 验证：`npm run --prefix frontend test -- --run`（27 个测试文件、243 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；切片 PNG 均为 1880×455 有效资源，本地服务器请求为 200；浏览器 CSSOM 在 320/390/430px 均命中切片资源且无横向溢出，顶部/底部壳层宽度与视口一致。
- 未验证：Playwright 截图命令在当前浏览器会话中等待字体后超时，未产出可交付截图；尚未在 Android/iOS/PWA 真机验收系统安全区、滤镜表现和设备字体渲染；冰箱布局和物品图标通过未改动选择器与现有回归测试间接确认。
- 下一步：评审拟物主题的暖奶油配色、顶部/底部壳层凸起程度、标题与图标浮雕强度及各页面控件层级；通过后再安排视觉回归和发布。

### 2026-08-21 — 生产容器资源边界与日志轮转（本次会话）

- 状态：已完成，待持续观测。
- 目标：在不修改服务器 systemd、Docker daemon、UFW 或 journal 配置的前提下，为 FridgeBoard 增加容器级资源边界和有上限的生产日志轮转，并与 flycn 侧配置保持一致。
- 范围：`compose.yaml`、生产文件日志处理器、日志回归测试和部署说明；不改变业务 API、数据库、前端和生产数据。
- 设计/需求基线：用户关于 RackNerd 内存压力、低开销监控和日志磁盘上限的要求；现有 FridgeBoard 单容器/单 Uvicorn 约束；生产固定 IP 部署规则。
- 预期验证：Compose 配置解析、日志按时间/大小轮转测试、后端 Ruff/测试、`git diff --check`；未授权主机级资源采集器之前不改服务器配置。
- 会话记录：已在 FridgeBoard Compose 增加 384 MiB 内存、512 MiB 内存加 swap 总上限、0.75 CPU、128 个 PID 上限；Docker stdout 改为 10 MiB × 3 轮转。flycn Compose 增加相同级别的健康检查、384 MiB 内存、512 MiB 内存加 swap 总上限、0.75 CPU、128 个 PID 上限和 10 MiB × 3 日志轮转。FridgeBoard 文件日志增加 10 MiB 大小边界，仍按 UTC 日期轮转并保留 7 个归档。
- 验证：FridgeBoard `uv run ruff check backend`、`uv run pytest -q`（172 passed，54 条既有警告）、`uv lock --check`；flycn Ruff、`python3 -m compileall app tests`、全量测试（30 passed）；两仓库 Compose 解析和 `git diff --check` 均通过。
- 完成：用户同意受限 Docker socket sidecar；资源 sidecar 已部署到 `/opt/flycn` 的 `production` profile，采集五个 Docker 服务及主机内存、swap、load、PSI，并轮转指标文件；CPA 与 NPM Compose 也已增加容器级资源/日志边界，CPA/NPM 应用日志目录纳入 7 天/100 MiB 清理预算。Hysteria 保持原 systemd 配置不变。
- 运行观测：`cli-proxy-api` 重建后从约 20 MiB 在数分钟内增长到约 512 MiB，日志显示外部 WebSocket 客户端连接和管理端 usage 队列轮询；按服务器最近一小时窗口统计，WebSocket 来源为 `154.198.52.100`（17 次）和一个 IPv6 来源（5 次），此前 `103.62.49.130`（15 次）集中在更早时段。用户要求后将 CLI 上限调整为 768 MiB、swap 总上限 896 MiB；调整后仍从约 138 MiB 增长到约 612 MiB，当前未发生 OOM 或容器重启，需确认来源是否均为用户本人并继续观察。


### 2026-08-21 — 拟物主题全局视觉设计补全（本次会话）

- 状态：已确认，待实施（v5 已按原始 AGIC 参考图完成配色校正，未接入代码）。
- 目标：在保留现有页面骨架、信息层级和交互的前提下，将已用于拟物冰箱和分类图标的 Soft-3D 语言扩展到整个手机 App，产出可评审的 HTML/PNG 设计板，本轮不修改应用代码。
- 范围：拟物主题的顶部栏、底部导航、搜索/输入、主次按钮、列表、食谱内容、二级表单、主题设置、居中弹窗和状态表达；不改页面布局、业务文案、冰箱几何、交互流程和 `frontend/src`。
- 设计/需求基线：用户提供的 AGIC 效果图及材质描述；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §17.1；`docs/final-ui-designs.md`；`docs/ui-assets/manifest.json`；现有 `theme-system-design` 冻结基线和当前拟物首页实现。
- 规范—参考图取舍：保留项目规范要求的三列居中顶部栏、安全区、单列内容和固定底部导航；只采纳参考图的暖奶油白材质、咖啡色控件/文字、凸起圆边应用壳和统一右下斜投影，不照搬其标题、搜索和冰箱的错位布局。
- 预期验证：产出 390×844px 代表性页面评审板，核对顶部栏与底部导航同材质、凸起图标/标题和普通文字的层级差异、控件内凹/凸起语义、倾斜阴影方向一致、最小热区和文字可读性；同步设计说明与未决策项。
- 会话记录：已阅读跨页面 UI 规范、功能设计索引、最终设计注册表、现有主题系统设计板与技术设计；确认本轮属于已确认拟物主题的视觉补全，不是重做信息架构。已产出 `docs/ui-assets/proposals/skeuomorphic-app-system-v3.html` 和同名 PNG，覆盖当前冰箱首页、全部物品、每周食谱、编辑物品、主题设置、组件与确认弹窗 6 个代表场景。首轮截图曾发现首页演示食材图标没有受共享布局计划约束，已移除该演示层，保留现有拟物冰箱渲染器作为材质参考。
- 完成：确定暖奶油白应用壳、燕麦咖啡内凹控件、深咖啡主操作和深咖啡文字的核心色板；顶部栏与底部导航使用同材质凸起圆边；页面标题与 SVG 图标凸起，其他文字保持平面；冰箱、应用壳、按钮和图标统一使用右下斜向软影；弹窗、状态和二级表单已纳入同一视觉系统。
- 验证：通过 Playwright CLI 以 1400×1000 评审板视口渲染 6 个 390×844px 页面；本地图片资产无加载失败，6 个手机页面的 `scrollWidth/clientWidth` 与 `scrollHeight/clientHeight` 无溢出，6 个顶部标题中心偏差均为 `0px`，控制台 `0 error / 0 warning`；生成最终 PNG 并人工检查未发现文字截断、元素重叠或边界漂移。`git diff --check` 待会话收尾执行。
- 评审反馈：用户指出首稿顶部标题栏与底部导航仍近似平面，未达到“扁平药丸/糖果”般大幅凸出、有实体厚度且底边微回凹的 3D 效果；标题和 SVG 也需要从平面投影升级为类似印章的多级实体挤出。
- 本轮迭代：应用壳增加正面、厚侧壁、底缘回凹暗面和落地斜影四层结构；标题与 SVG 增加左上亮边、连续咖啡色挤出层和右下接触影，同时保持哑光、低对比与无尖锐高光。
- v3 验证：通过 Playwright CLI 重新渲染高浮雕稿；6 个 390×844px 手机页面无横向或纵向溢出，本地图片资产加载失败数为 `0`，6 个顶部标题中心偏差均为 `0px`，控制台 `0 error / 0 warning`；人工截图检查确认顶部栏和底部导航已显示两级侧壁与底缘暗槽，标题和 SVG 已显示连续挤出层。
- 第二轮评审反馈：用户确认 v3 仍未达到目标，要求直接以附件 AGIC 效果图的底部导航栏为范本，通过 image-to-image 生成顶部与底部导航栏无文字/无图标底图。文字和 SVG 浮雕不能用固定偏移阴影近似，必须表达左上方向高光、右下暗面与右下落影的连续过渡，并随形状局部方向及其与左上光源的夹角变化。
- 本轮目标：遵循 `imagegen` skill 的编辑流程，以用户附件为风格输入，生产底部导航栏与顶部标题栏两个独立候选底图；约束为暖奶油白哑光材质、左上柔和漫反射、右下连续暗面/倾斜软影、底缘微回凹、无文字、无图标、无水印。
- 已执行：从 1280×2773 用户附件中精确裁出 1200×360 底部导航栏风格参考，保存为 `tmp/imagegen/agic-bottom-navigation-reference.jpg`，已人工检查裁图包含完整药丸形体、左上高光、右下暗面、底边回凹与倾斜软影。
- 阻塞证据：本会话未暴露内置 `image_gen` 工具；按 skill 要求检查 CLI fallback 时，命令输出为 `OPENAI_API_KEY=missing` 且 Python 导入失败 `No module named 'openai'`。项目规则禁止未经明确授权安装软件，因此未安装 `openai`/`pillow`，也未伪造图生图结果。
- 阻塞解除：用户指定参考 Codex 线程 `01a00bb5-5f59-73b3-b8a5-37cc4468d7b1`。已从本地会话记录确认该线程实际使用 `/Users/jason/.codex/skills/imagegen/scripts/codex_image_gen.py`：包装器动态从 `~/.codex/config.toml` 和 `~/.codex/auth.json` 解析 provider endpoint/API key，再以 `uv run --with openai` 调用 `gpt-image-2`。先前仅检查 shell 中的 `OPENAI_API_KEY` 而未执行包装器，结论不完整；现按用户明确指定的方式继续。
- 生成记录：先通过 provider-aware 包装器 dry-run 确认 `OPENAI_API_KEY is set`。首次图生图因 CLI 尺寸校验拒绝 `1920x640` 而失败；改为受支持的 `1536x1024` 后，第二次因 SOCKS 代理缺少 `socksio` 失败；最终使用 `uv run --with openai --with socksio` 成功并行调用 `gpt-image-2` `/v1/images/edits`，底部栏耗时 21.1s，顶部栏耗时 19.5s。两张原始输出实际均为 1920×819 RGB PNG，模型根据宽幅参考图保留了宽高比。
- 完成：在不改光影和色彩的前提下机械裁切为 1920×520 评审底图，保存为 `docs/ui-assets/proposals/theme-concepts/navigation-shell-bottom-imagegen-v1.png` 和 `navigation-shell-top-imagegen-v1.png`。候选图均无文字、无图标、无水印；表面已具备左上连续柔高光、随曲面方向变化的明暗过渡、右下暗面、底缘微回凹和独立右下软影。
- 验证：人工检查原始图和裁切图，确认完整保留左右圆端、底部侧壁和落影，无对象截断。两张评审图 SHA-256 分别为 `676d8f...df00` 和 `10b2ce...6cb0`；`git diff --check` 通过，`frontend/src` 与 `backend` 无变更。
- 用户确认：2026-08-21 用户确认 image-to-image 生成的顶部/底部胶囊材质方向，要求继续设计。
- 本轮范围：生成两个带内容的独立视觉样片：顶部栏保留现有“左侧物品列表图标｜居中可切换的厨房冰箱标题｜右侧扫码图标”三列结构；底部栏保留“首页｜食谱｜购物｜我的”四个入口。页面标题与 SVG 图标使用左上柔高光、随形状方向连续变化的右下暗面及独立右下软影；底部导航文字保持平面，符合“其他文字不凸起”的既有要求。
- 预期验证：两张样片无多余图标/文字/水印；顶部标题几何居中；图标与标题的高光、暗面和落影与胶囊共享同一左上光源，转角、圆弧和直线上的明暗过渡随局部法线连续变化。
- v4 评审反馈：用户确认整体方案基本无问题，但配色比原始参考图更深，奶油白被推成了浅咖啡色；配色必须以用户附件 AGIC 原图为唯一基准。冰箱位置、占比和 framing 由程序全局控制，不纳入本轮设计和评审。
- v5 范围：仅对已确认的顶部栏、底部栏和共享控件执行 image-to-image 配色/白平衡校正；必须保持所有尺寸、圆角、厚度、回凹、投影、图标几何、中文文案和布局不变。应用壳/页面背景恢复原图近中性暖奶油白，搜索/按钮恢复原图低饱和咖啡奶油色，文字和浮雕暗面恢复原图咖啡色，禁止额外偏黄、桃色或咖啡色遮罩。
- v5 预期验证：校色后的中文、图标数量/顺序、几何和边界无变化；无新增文字/水印；评审板不再把冰箱位置、占比作为待确认项。
- v4 完成：使用 `gpt-image-2` 和三图参考分别生成顶部栏（30.6s）、底部栏（29.3s）与共享控件（33.0s）带内容样片；中文“厨房冰箱”、“首页/食谱/购物/我的”、“搜索所有物品/添加物品/取消/保存修改”均生成正确，顶部标题和 SVG 使用方向相关印章浮雕，导航/控件文字保持平面。另生成首页组合稿仅验证材质协同，用户已明确冰箱位置/占比不纳入设计。
- v5 生成：以 v4 三张已确认样片为编辑对象，以原始 AGIC 底部导航裁图作为奶油白/浮雕咖啡色的唯一配色参考，以原始 AGIC 搜索区裁图作为咖啡奶油控件的唯一配色参考；通过三个 `gpt-image-2` 精确编辑任务仅校正色相、明度、饱和度和白平衡，保留布局、文字、图标、厚度、回凹和光照方向。
- v5 完成：产出 `navigation-top-populated-color-v2.png`（2172×560）、`navigation-bottom-populated-color-v2.png`（2172×560）和 `shared-controls-color-v2.png`（950×1655）；应用壳/页面背景已从偏黄浅咖啡恢复为原图近中性暖奶油白，搜索/主按钮保留原图低饱和咖啡奶油色，文字和浮雕暗面使用原图咖啡色。新增 `skeuomorphic-imagegen-system-v5.html/png` 作为唯一最新评审板，不展示首页冰箱组合稿，并明确冰箱位置、占比、缩放和 framing 属于共享程序几何，不在本轮设计范围。
- v5 验证：人工检查三张校色图，中文文案、图标数量/顺序、浮雕方向和胶囊几何保持正确，无额外文字或水印。Playwright CLI 以 1440×1050 视口渲染 v5 评审板，3 张图像无加载失败，页面横向溢出为 `0`，控制台 `0 error / 0 warning`；`git diff --check` 通过，`frontend/src` 和 `backend` 无变更。
- 用户确认：2026-08-21 用户确认 v5 配色方案可以进入实施，并确认冰箱位置/占比继续由程序全局控制。
- 未验证：尚未进行透明化、响应式九切片、动态文字/SVG 实现或应用代码修改；这些属于实施阶段的技术验证，不是待决设计方案。
- 下一步：进入实施任务；先将 v5 视觉母版转为共享主题令牌、胶囊导航壳、文字/SVG 浮雕效果和搜索/按钮控件，再按现有冻结页面逐页替换视觉令牌并做回归。

### 2026-08-21 — 排查 Android SSO 回跳与重复显示登录（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：基于生产日志定位 Android 登录后未回到 App、回到 App 后仍显示“注册或登录”的真实原因；补齐可关联的认证链路日志，并修复已确认的前端状态竞争和无反馈问题。
- 范围：FridgeBoard 移动 SSO 登录/回调/交换/刷新日志与前端登录完成状态；flycn 授权入口、网页登录提交和回跳日志；不记录授权码、访问令牌、刷新令牌、Cookie、密码或完整 state。
- 设计/需求基线：用户本次反馈；生产 `fridgeboard-app` 与 `flycn-app` 容器日志；`frontend/src/mobileAuth.ts`、`frontend/src/App.tsx`、`backend/fridgeboard/main.py`、`../flycn/app/routes/fridgeboard_sso.py`、`../flycn/app/routes/web.py`。
- 预期验证：生产日志能按认证事务关联授权入口、网页登录、授权回调、移动交换和 App 状态刷新；慢请求不会用旧结果覆盖登录成功状态；登录交换期间界面显示处理中状态；运行两仓库相关测试、静态检查和构建。
- 会话记录：已检查线上近 48 小时日志。FridgeBoard 记录到 3 次移动登录入口、2 次 callback、2 次 mobile exchange/status 成功，但旧版 Uvicorn access log 暴露了完整 query；flycn 只有启动日志，没有请求级日志，无法确认网页登录后是否保留待处理授权。当前生产 flycn 响应已带 `Domain=.flycn.fyi`，因此不能再把 cookie 共享缺失作为唯一根因。已增加两端认证阶段日志和不含 query 的请求日志，关闭原始 Uvicorn access log；移动回调改为先渲染 App 再完成 exchange，登录期间显示处理中状态；`loadOwner` 增加代次保护，并在 token exchange 到状态刷新结束前保持入口锁定，避免慢请求或旧结果把成功登录覆盖回未登录。
- 完成：FridgeBoard 增加 SSO start/callback/mobile exchange/mobile refresh 的指纹、上游状态、响应类型/长度和耗时日志；flycn 增加授权入口、网页登录恢复、授权码兑换和脱敏请求日志，并记录实际 cookie 域与 SSO host；前端增加移动认证进度事件、启动阶段回调处理和 Owner 加载竞态保护；新增日志脱敏和登录处理中回归断言。
- 验证：FridgeBoard 移动认证测试 10 passed；前端全量测试 27 个文件、241 passed，lint、生产构建和 `build:android` Debug APK 均通过；flycn 全量测试 30 passed、Ruff 通过；两仓库 `git diff --check` 通过。FridgeBoard 全量 pytest 为 170 passed、1 failed，失败是既有日期敏感测试 `test_recent_subcategories_are_unique_and_production_date_defaults_to_entry_date` 固定使用已过期的 `2026-08-20` BBD，与本次认证/日志改动无关。
- 发布记录：FridgeBoard 提交 `253ada8` 已通过 `scripts/deploy-image.sh` 发布，自动生成 release `260821003433`；数据库备份为容器内 `/data/fridgeboard.db.backup-20260820-163442`；容器 `healthy`、Alembic 当前为 `20260820_24 (head)`，`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`，镜像 manifest 为 `sha256:cbab06a7aa92b4d380b775358681b9bbc04cb9f1844b6d2ee707b80e6c65f968`。
- 发布记录：flycn 最终提交 `7492ed7`（包含 `7099474`、`a4d171c`、`875ab78`、`f781542`）已同步并重建，数据库备份为 `/data/app.sqlite3.backup-20260820-164700`；容器运行、重启次数为 0，`https://flycn.fyi/healthz` 返回 `ok`，镜像 manifest 为 `sha256:bd2ca43f41edaf42f9273dfb16d75e709ad195f6a8720af5b98e3c19648faf84`。诊断入口响应为 303，Cookie 域为 `.flycn.fyi`；启动日志已确认实际 `public_host=app.flycn.fyi`、`sso_redirect_host=fridge.flycn.fyi` 和共享 Cookie 配置。
- 验证：FridgeBoard 后端 `171 passed`、前端 `241 passed`、lint、生产构建、Android Debug APK、`uv lock --check` 均通过；flycn 全量 `30 passed`、Ruff 通过；两仓库 `git diff --check` 通过。首次 flycn 重建期间公网健康检查短暂返回 502，重试后恢复为 `ok`，容器未发生重启。
- 未验证：尚未在真实 Android 设备上完成首次登录、慢网回调、切换冰箱和重启验收；未完成真实账号密码提交后的完整网页登录回跳核验。应用诊断日志代码已发布，但本次无真实失败事务可关联验证完整 callback/exchange 日志链路。
- 下一步：在真实 Android 上验收上述四条路径；若仍失败，按同一 `state` 指纹核对 FridgeBoard callback、flycn pending authorization、移动 exchange 和 App status 刷新阶段。

### 2026-08-21 — 首页搜索栏下移与冰箱布局居中（本次会话）

- 状态：待评审。
- 目标：将首页顶部搜索栏下移半个搜索栏高度，并让下方冰箱布局图继续在搜索栏以下的剩余空间内上下居中。
- 范围：`frontend/src/styles.css` 首页搜索栏与预览区域布局、`frontend/src/App.test.ts` 样式契约测试；不改变搜索行为、冰箱几何、底部导航或其他页面布局。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §5、§6、§7；现有首页 `FridgeHome`、`.p7-status` 与 `.fridge-preview-frame--home` 实现。
- 预期验证：搜索栏相对原位置下移 `20px`，冰箱预览仍占据并居中于剩余空间；运行首页相关前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认首页内容按顶部栏、搜索栏、冰箱预览、底部导航顺序排列，预览通过 `flex: 1` 和 `place-items: center` 在剩余区域居中；本轮将搜索区域顶部留白增加 `20px` 并同步增加区域高度，保持预览的流式居中。
- 完成：`.p7-status` 增加 `20px` 顶部留白并将区域最小高度调整为 `72px`，搜索框相对原位置下移 `20px`；首页预览继续使用 `flex: 1` 与 `place-items: center`，在搜索栏下方剩余空间内上下居中；新增样式契约测试。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（117 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android/PWA 设备上进行人工视觉验收；未执行生产发布。
- 下一步：评审首页搜索栏下移幅度与冰箱图剩余空间居中效果，确认后按发布规则处理。

### 2026-08-20 — 提交并发布当前工作区改动（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前工作区已登记的首页入口/布局修复、应用偏好入口调整及相关测试发布到生产服务器。
- 范围：当前未提交改动、生产 Docker 镜像、服务器 SQLite 备份、容器健康检查和 HTTPS 健康检查；不修改生产数据内容。
- 设计/需求基线：当前 `main`、现有进度记录、`scripts/deploy-image.sh` 和项目发布规则。
- 会话记录：已确认当前工作区仅包含本轮登记的前端代码、测试和进度文档改动，发布配置使用生产固定 IP；正在执行发布前质量门禁。
- 预期验证：后端 Ruff、后端测试、锁文件检查、前端 lint、前端全量测试、前端生产构建、发布脚本语法和 `git diff --check`；提交后执行生产发布、数据库备份、容器健康检查和 HTTPS 健康检查。
- 发布记录：代码提交 `080a378`；自动生成 release `260820235034`；服务器数据库备份为 `/data/fridgeboard.db.backup-20260820-155044`；镜像 manifest digest 为 `sha256:fe150070f62d0ce730a76526a59ed5c7a5eb9c74e7db7fc31444fea252b6e618`。
- 完成：已通过 `scripts/deploy-image.sh --ref 080a378` 发布，服务器容器重建并变为 `healthy`，`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 验证：`uv run ruff check backend`、`uv run pytest`（171 passed，54 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 个文件、239 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过。
- 未验证：尚未在真实手机/PWA 或 Capacitor WebView 完成发布后人工视觉与交互验收；发布归档解包时服务器 tar 输出 macOS 扩展属性警告，但发布脚本最终成功且容器健康。
- 下一步：在真实设备刷新资源并验收首页入口、首页搜索栏宽度、主题选择返回和应用偏好入口。

### 2026-08-20 — 调整应用偏好入口与主题选择返回（本次会话）

- 状态：待评审。
- 目标：将“通知与权限”入口从“我的”移动到“应用偏好”；主题选择后立即应用并返回“应用偏好”；优化“我的”页顶部登录身份文案。
- 范围：`frontend/src/App.tsx`、`frontend/src/themeSettings.tsx` 及对应前端回归测试；不改变通知设置数据、主题存储机制和其他页面导航。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §5、§6、§7；`docs/functional-design-and-feasibility.md` §17.1；现有“我的”“应用偏好”“主题设置”页面实现。
- 预期验证：通知入口只出现在“应用偏好”；主题选项点击后先调用主题应用逻辑再返回偏好页；“主题设置”不再显示“选择后立即应用，只影响这台设备。”；“我的”顶部文案符合中文表达；运行相关前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认通知设置入口当前由 `MeHome` 直接渲染，应用偏好页面仅显示主题入口，主题选择回调没有导航副作用，身份区域硬编码为“flycn 所有者 / 当前登录账号”。本轮将通知入口下沉到 `ThemePreferencesPage`，由 `App` 统一处理主题应用后的返回，并将身份区域改为“当前登录账号 / 所有者”。
- 完成：从“我的”移除“通知与权限”，并在“应用偏好”新增同一入口；主题选项点击后调用 `setTheme` 并返回“应用偏好”；删除应用偏好和主题设置中的设备保存提示；将“我的”顶部身份文案改为“当前登录账号 / 所有者”；补充入口、文案和导航回归断言。
- 验证：`npm run --prefix frontend test -- --run src/themeSettings.test.ts src/App.test.ts`（2 个文件、118 passed）、`npm run --prefix frontend test -- --run`（27 个文件、239 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实手机/PWA 或 Capacitor WebView 进行人工点击和视觉验收；未执行发布。
- 下一步：评审“应用偏好”入口顺序、主题选择后的返回体验和“我的”顶部文案；通过后按发布规则处理。

### 2026-08-20 — 首页顶部标题栏入口调整（本次会话）

- 状态：待评审。
- 目标：将首页顶部左侧入口改为全部物品列表入口；为居中的当前冰箱名称增加下箭头并使其可打开“我的冰箱”；移除第二行左侧的库存数量入口，让搜索栏占满第二行。
- 范围：`frontend/src/App.tsx` 首页 `FridgeHome`、`frontend/src/sharedUi.tsx` 共享标题组件、`frontend/src/styles.css` 首页标题/搜索布局和首页回归测试；复用现有库存列表与冰箱切换状态，不新增 API 或路由。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5、§6.1、§6.2.1、§9；`docs/functional-design-and-feasibility.md` §17.1；`docs/final-ui-designs.md` 当前冰箱首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`；`docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 预期验证：首页顶部左侧列表按钮点击沿用全部物品列表行为，冰箱名称及下箭头点击沿用“我的冰箱”行为，第二行只显示满宽搜索栏；运行首页相关测试、前端 lint、生产构建和 `git diff --check`。
- 会话记录：已确认当前首页左侧仍打开“我的冰箱”，库存数量入口位于第二行，`HeaderTitle` 尚未支持可点击标题；已通过共享标题组件增加可选标题操作，保持三列顶部栏的几何约束和现有状态刷新提示。
- 完成：首页顶部左侧改为列表图标并复用全部物品列表入口；当前冰箱名称和下箭头合并为可点击标题按钮并复用“我的冰箱”入口；删除第二行“n件物品”和右箭头，搜索栏独占第二行并填满内容宽度；更新首页回归断言。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（115 passed）、`npm run --prefix frontend test -- --run`（27 个测试文件、238 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实手机/PWA 或 Capacitor WebView 进行人工点击与视觉验收；未执行发布。
- 下一步：评审首页顶部三个入口的图标顺序、标题下箭头和第二行搜索栏宽度；通过后按发布规则处理。

### 2026-08-20 — 修复首页冰箱预览横向溢出（本次会话）

- 状态：待评审。
- 目标：缩小并约束首页中间冰箱预览，确保宽体冰箱在 320/390/430px 手机视口内完整显示且页面不出现横向滚动条。
- 范围：首页 `FridgePreviewFrame` 的可用尺寸计算、首页响应式样式和回归断言；不改变冰箱几何布局、格位交互或其他页面预览尺寸。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §9、§9.1；`frontend/src/FridgeLayout.tsx`、`frontend/src/fridgePreview.css`、`frontend/src/styles.css`。
- 预期验证：补充首页预览尺寸约束回归，运行前端测试、lint、生产构建和 `git diff --check`；检查首页预览不会造成文档横向溢出。
- 会话记录：已确认首页预览使用容器查询按最长边缩放，但首页外层边距与 `width: 100%` 的盒模型组合会使预览外层在 390px 视口下变为 `x=4、width=390、right=394`。已将首页预览最大宽度限制为扣除左右 4px 边距后的可用宽度，保留最长边等比适配和完整高度。
- 完成：`fridge-preview-frame--home` 增加 `max-width: calc(100% - 8px)`；新增首页预览尺寸回归断言，不改变共享冰箱几何和其他页面尺寸。
- 验证：前端 `npm run --prefix frontend test -- --run` 通过（27 个测试文件、238 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 本地浏览器在 320/390/430px 视口及拟物主题下确认页面 `document.scrollWidth` 等于视口宽度，标准/宽体首页预览右边界均保留 4px 内边距，拟物 SVG 非空且未溢出。
- 未验证：尚未在真实 Android/iOS/PWA 设备上人工检查系统安全区、横向手势动画和不同浏览器内核下的视觉表现；未执行发布。
- 下一步：评审通过后按发布流程部署，并在真实手机/PWA 上验证 320/390/430px 首页及标准、宽体冰箱模板。

### 2026-08-20 — 排查图标长期缓存与身份无关下载（本次会话）

- 状态：待评审。
- 目标：核对图标是否仅在图标版本变化或用户点击“刷新应用”时重新下载，并确认图标缓存是否跨用户、跨设备复用且不依赖访问令牌。
- 范围：前端运行时图标缓存、PWA 刷新缓存清理、认证/设备切换生命周期、后端图标 URL 与访问权限、相关回归测试；本阶段先排查，不改变业务数据和图标内容。
- 设计/需求基线：用户本次反馈；`frontend/src/runtimeAssetCache.ts`、`frontend/src/pwaCache.ts`、`frontend/src/secureSession.ts`、`frontend/src/sharedUi.tsx`；后端内置图标路由和版本参数。
- 预期验证：确认缓存失效入口、缓存键是否与身份/设备绑定、图标下载是否需要 `Authorization` 或 Cookie、版本参数是否稳定；运行相关前端/后端测试或明确未覆盖项。
- 会话记录：已确认图标持久化缓存名为 `fridgeboard-icons-v1`，但缓存键直接使用带冰箱/设备作用域的 API URL；Capacitor 图标通过 `fetchRuntimeAsset` 走 Owner/Device Bearer，PWA 图标通过同源 Cookie 和 Service Worker 读取；退出登录、切换账号、切换设备和 401 处理会删除整个持久化图标缓存。PWA 首次显示还会同时触发运行时缓存下载和 Service Worker 图标下载。本轮按用户要求修复，内置图标与自定义用户图标分离处理。
- 完成：内置图标在 Owner、日常访问和显示设备三条清单接口中统一返回公共 `/api/icon-library/...` URL；公共图标响应增加长期 immutable 缓存头；版本参数改为图标内容摘要；Capacitor 公共图标下载显式使用 `credentials: omit`；认证/设备切换只清理内存 Blob URL，不删除公共持久化缓存；“刷新应用”会清理公共图标缓存；Service Worker 仅缓存公共内置图标，不缓存受保护用户图标；自定义用户图标仍使用受保护 URL 且不写入公共持久化缓存。
- 验证：前端 `npm run --prefix frontend test -- --run` 通过（27 个测试文件、238 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`；后端 `uv run pytest` 通过（171 passed，54 条既有警告）、`uv run ruff check backend`；`git diff --check` 通过。新增测试覆盖公共 URL、免令牌下载、跨认证清理边界、受保护图标不进入公共缓存、刷新应用清理公共缓存。
- 未验证：尚未在真实 PWA、Android/iOS 真机网络面板确认部署后请求次数；未执行生产发布。现有 pytest 的 54 条警告仍为既有依赖/迁移警告。
- 下一步：评审通过后按发布流程部署，并在 PWA、Android/iOS 真机分别验证首次加载、切换用户/冰箱、页面切换、重启、断网命中和“刷新应用”后的重新下载行为。

### 2026-08-20 — 修复 Android 长期登录与 flycn SSO 回跳（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：Android App 登录一次后持续保留登录状态；修复从 flycn 登录页完成账号密码登录后跳到 `app.flycn.fyi`、无法回到 App 的移动 SSO 回跳链路。
- 范围：FridgeBoard 移动访问/刷新会话生命周期、移动 SSO 授权地址和回跳状态；flycn FridgeBoard 授权路由的跨域会话连续性；相关后端、前端和 flycn 回归测试。不改变 PKCE、一次性授权码、App 专属 URI、主动退出和主动切换账号语义。
- 设计/需求基线：用户本次反馈；`frontend/src/mobileAuth.ts`、`frontend/src/secureSession.ts`、`backend/fridgeboard/auth.py`、`backend/fridgeboard/main.py`、`../flycn/app/routes/fridgeboard_sso.py`；现有移动认证设计和 SSO 契约。
- 预期验证：覆盖长期刷新会话、移动授权入口的 canonical host、flycn 跨 host 登录后仍能恢复待处理授权并回到 App；运行 FridgeBoard/flycn 相关测试、Ruff/lint/build、Android Debug 构建和 `git diff --check`。
- 会话记录：已确认移动刷新会话固定为 30 天，无法满足低安全内容 App 的长期登录诉求；已确认 flycn 的待处理授权状态写在 host-only 签名 session 中，`flycn.fyi` 与 `app.flycn.fyi` 之间跳转会丢失状态。本轮先修复服务端授权地址与状态连续性，再补充长期会话回归覆盖。
- 完成：移动刷新令牌改为可重复使用且无固定过期时间，仍可通过主动退出撤销；SQLite 迁移 `20260820_24` 将现有会话期限清空并允许空值；网络型刷新失败不再清理 Android 本地会话，明确 `400/401` 才会清理；flycn 生产 session cookie 共享 `.flycn.fyi`，跨 `flycn.fyi` 与 `app.flycn.fyi` 登录后可继续恢复 FridgeBoard 授权。
- 验证：FridgeBoard `uv run pytest`（171 passed，54 条既有警告）、`uv run ruff check backend`、`uv lock --check`、前端 `npm run --prefix frontend test -- --run`（27 个测试文件、235 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`（Debug APK）、flycn 全量测试（30 passed）、flycn Ruff、两仓库 `git diff --check` 均通过；Alembic head 为 `20260820_24`；新增测试确认 `/api/auth/login` 将 `app.flycn.fyi` 和 `www.flycn.fyi` 入口归一化到 `flycn.fyi`。
- 未验证：尚未在真实 Android 设备上完成“跨域登录回跳、次日启动、访问令牌过期后自动刷新、切换冰箱”人工验收；未执行生产发布。
- 下一步：发布 FridgeBoard 与 flycn 后，在真实 Android APK 上按上述四条路径验收；确认通过后将本条状态转为完成。
- 追加反馈：用户指出 30 天期限不能解释每天数次重新登录，并要求 flycn 授权入口只使用 `flycn.fyi`，不得展示 `www.flycn.fyi` 或 `app.flycn.fyi`。
- 追加排查：线上 `https://fridge.flycn.fyi/api/auth/login` 当前实际返回 `Location: https://app.flycn.fyi/integrations/fridgeboard/authorize?...`；确认问题2存在显式 canonical host 配置错误。问题1的高频触发点是旧实现访问令牌 15 分钟过期后，一次性刷新令牌轮换与刷新失败清理叠加，而非单纯 30 天期限。
- 追加完成：新增生产 flycn 授权入口 host 归一化，即使部署环境遗留 `app.flycn.fyi` 配置，移动与 PWA SSO 也统一从 `https://flycn.fyi/integrations/fridgeboard/authorize` 开始，并继续使用调用方传入的 FridgeBoard `redirect_uri`。
- 发布记录：FridgeBoard 提交 `1e26d9d` 完成首次发布后发现迁移文件漏入提交，已由提交 `2232d71` 补齐并重新发布；最终 release `260820230842`，镜像摘要 `sha256:6e603eefe5f9049bd2fafdd85d6847bc75b12bc417ef9bdb39e7432f5df423da`，数据库备份 `/data/fridgeboard.db.backup-20260820-150853`。flycn 提交 `b1529fd` 已部署，镜像摘要 `sha256:a878f30331b73698c7753131af4f9a27b122cfb8ba564055e2c0f81ec08dbc5e`，数据库备份 `/data/app.sqlite3.backup-20260820-150603`。
- 发布验证：两容器均已重建；FridgeBoard 为 `healthy`，flycn 为 `running`；FridgeBoard Alembic 为 `20260820_24 (head)`；`https://fridge.flycn.fyi/healthz`、`https://flycn.fyi/healthz` 和 `https://app.flycn.fyi/healthz` 均返回成功；线上移动登录 `Location` 已为 `https://flycn.fyi/integrations/fridgeboard/authorize?...`，flycn 登录状态 Cookie 已确认 `domain=.flycn.fyi`。
- 未验证：尚未在真实 Android APK 上完成首次登录、跨域回跳、次日启动、访问令牌过期自动刷新和切换冰箱人工验收；未执行真实账号登录操作。

### 2026-08-20 — 生产发布（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 及工作区内已登记的文档改动发布到生产服务器。
- 范围：发布提交 `2e3d496`、生产 Docker 镜像、服务器 SQLite 备份、容器健康检查和 HTTPS 健康检查；不修改生产数据内容。
- 设计/需求基线：当前 `HEAD`、现有发布脚本 `scripts/deploy-image.sh`、本文件发布规则。
- 会话记录：已将进度记录和拟物主题设计提案纳入发布提交 `2e3d496`；未创建分支，未推送远端。
- 完成：自动生成 release `260820190004`；服务器数据库备份为 `/data/fridgeboard.db.backup-20260820-110014`；容器状态为 `healthy`；镜像构建产物 manifest digest 为 `sha256:f03f8549765e02a4f3084309440540d4efa01f29b83c14874f84289d8581a016`。
- 验证：`uv run ruff check backend`、`uv run pytest`（169 passed，52 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 个测试文件、234 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实手机/PWA 或 Capacitor WebView 完成发布后人工验收。
- 下一步：在真实设备刷新资源并验证拟物主题、首次未登录首页、库存日期/分类匹配和通知入口。

### 2026-08-20 — 统一拟物主题全局皮肤：设计阶段（本次会话）

- 状态：待评审。
- 目标：先完成手机端全应用拟物主题的视觉方向与页面系统设计，再进入实现。
- 范围：色彩、材质、图标、一级页、列表、表单、食谱、设置与弹窗的设计提案；不修改应用代码。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4.4、§5–§8；`docs/theme-system-requirements-and-design.md` §6；`https://www.thiings.co/things` 图标集合。
- 会话记录：已撤回未经评审的 CSS 与图标实现草稿；当前仅提交设计提案，明确将 Thiings 3D 图标限定在语义入口与分类等可辨识尺寸，微操作使用统一实体符号以避免视觉噪音。
- 完成：新增 `docs/proposals/skeuomorphic-app-skin-design.md`，定义低饱和令牌、材质边界、页面系统、图标使用规则和高保真设计稿评审顺序。
- 设计资产：新增 `docs/ui-assets/proposals/skeuomorphic-app-skin.html`，包含 390×844 的首页、库存列表、添加物品、每周食谱、我的和确认弹窗六张高保真设计稿，用于先评审跨页面皮肤系统。
- 未验证：尚未制作或评审高保真页面设计稿；未修改应用代码，未执行发布。

### 2026-08-20 — 修复每周食谱分类图标未随编辑结果展示（本次会话）

- 状态：进行中。
- 目标：修复在“编辑食谱”中将食材分类改为“香辛”后返回“每周食谱”，食材名称前未显示对应分类图标的问题。
- 范围：前端每周食谱食材图标解析、分类数据传递及回归测试；保留旧食谱无分类 ID 时的库存图标回退，不改变食谱保存、库存匹配和缺货计算规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；现有每周食谱与编辑食谱实现及本地分类目录。
- 预期验证：分类 ID 对应的图标在每周食谱和补货清单中可展示，旧数据无分类 ID 时仍保持原行为；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认编辑接口和每周食谱接口均保留 `subcategory_id`，但 `RecipeIngredientList` 目前只使用库存同名物品的 `icon_key`，没有使用食谱食材自身的分类 ID。本轮将以当前分类目录解析图标，并保留库存图标作为兼容回退。
- 状态更新：待评审。
- 完成：每周食谱食材列表接收当前分类目录；有 `subcategory_id` 时按分类的 `icon_key` 展示图标，分类图标不可用时回退到库存同名物品图标；新增“京葱→香辛”图标回归用例。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts -t 'RecipeIngredientList'`（4 passed）、`npm run --prefix frontend test -- --run`（27 个测试文件、234 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实手机/PWA 或 Playwright 视口进行人工视觉验收；未执行发布。

### 2026-08-20 — 修复通知页冰箱上下文图标乱码（本次会话）

- 状态：待评审。
- 目标：将通知页冰箱名称前的 `▯` 占位字符替换为可识别的冰箱线框图标。
- 范围：`frontend/src/App.tsx` 通知页上下文行、`frontend/src/styles.css` 图标尺寸样式及前端回归测试；不改变通知数据和页面导航。
- 预期验证：通知页显示正常冰箱图标，不再出现 `▯` 字符；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 完成：通知页、通知设置页和临期规则页统一使用冰箱线框 SVG 上下文图标，移除 `▯` 占位字符；补充通知页图标回归断言。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（114 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 通过。
- 未验证：未进行真实手机或 Playwright 视觉验收；未执行发布。

### 2026-08-20 — 微调“我的”通知角标间距（本次会话）

- 状态：待评审。
- 目标：稍微增大“通知”行角标与最右侧箭头之间的留白，并降低角标高度以改善垂直对齐。
- 范围：`frontend/src/styles.css` 中 `.p7-link-badge` 样式；不改变通知数据、角标数量、页面结构或交互。
- 预期验证：通知角标与箭头间距更清晰、角标高度降低且不影响文字溢出；运行前端相关测试、lint、生产构建和 `git diff --check`。
- 完成：`.p7-link-badge` 高度调整为 `16px`，与右箭头之间增加 `8px` 间距；补充样式契约测试。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（114 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 通过。
- 未验证：未进行真实手机或 Playwright 视觉验收；未执行发布。

### 2026-08-20 — 首页提醒入口迁移至“我的”通知（本次会话）

- 状态：待评审。
- 目标：移除首页搜索框右侧的通知、临期和过期提醒标识，将消息提示迁移到底部导航“我的”右上角，并在“我的”新增“通知”消息列表入口。
- 范围：`frontend/src/App.tsx` 首页与“我的”页面、`frontend/src/sharedUi.tsx` 共享底部导航、`frontend/src/styles.css` 对应标识和消息列表样式、前端回归测试；沿用现有 `notifications/due` 数据，不新增后端接口或改变提醒生成/去重规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5、§6.2.1、§7、§8.2；`docs/functional-design-and-feasibility.md` P10 提醒规则；`docs/final-ui-designs.md` 通知与提醒草稿及 `docs/ui-assets/png/pwa-notifications.png`。
- 预期验证：首页搜索行不再渲染提醒标识或首页提醒弹窗；底部“我的”和“我的”内“通知”菜单在有消息时显示提示标识；通知页可查看各类消息并支持空状态；运行前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认首页 `p7-status` 当前同时渲染 `p7-status-notice`、临期和过期风险标识，且通知由首页弹窗承载；“我的”已有“通知与权限”设置入口。本轮将消息查看与设置拆开，消息列表沿用 `DueNotification[]`，底部导航接收可选消息数量以保持其他页面调用兼容。
- 完成：首页搜索行移除通知、临期和过期入口及首页通知弹窗；共享底部导航“我的”在有消息时叠加数量标识；“我的”新增“通知”菜单并保留“通知与权限”设置入口；新增通知列表页，展示食品/设备提醒和无消息空状态；提醒接口、每日去重和系统通知行为保持不变；切换冰箱时会同步清空上一台冰箱的消息状态。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（113 passed）、`npm run --prefix frontend test -- --run`（27 files、232 tests）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 通过。
- 未验证：未在真实手机/PWA、Capacitor WebView 或 320/390/430px 视口进行人工视觉验收；未执行发布。
- 下一步：评审底部“我的”角标位置、通知列表文案和空状态；通过后按发布规则处理。

### 2026-08-20 — 修复过期库存未进入“我的”通知（本次会话）

- 状态：待评审。
- 现象：库存存在 `expiry_status=expired` 的物品，但底部“我的”没有角标，通知页为空。
- 根本原因：迁移后前端仅展示 `notifications/due` 的一次性投递结果；该接口按每日通知审计去重，不能作为当前库存风险状态的唯一来源。
- 目标：将当前冰箱仍处于临期/过期状态的库存汇总为应用内食品通知，并与设备通知合并，确保角标和通知列表可见。
- 预期验证：过期或临期库存即使 `notifications/due` 返回空数组也显示食品通知；无风险库存保持空状态；前端测试、lint、生产构建和 `git diff --check` 通过。
- 完成：新增前端可见通知合并逻辑，以当前库存 `expiry_status` 作为食品提醒兜底来源；保留后端 `DueNotification` 中的设备提醒和其他通知；过期/临期库存、一次性接口已收取和无风险库存分别补齐回归覆盖。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（113 passed）、`npm run --prefix frontend test -- --run`（27 files、232 tests）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 通过。
- 验证补充：本地 `http://127.0.0.1:7001` 浏览器实测有 11 件库存的“北师大冰箱”，首页底部显示“我的，有 1 条通知”；进入“我的 → 通知”显示“西红柿临期或已过期，共 1 件”。
- 未验证：未在真实手机/PWA 或 Capacitor WebView 中使用真实过期库存和已收取提醒数据人工验收；未执行发布。
- 下一步：真实设备刷新资源后复核角标和通知正文；通过后按发布规则处理。

### 2026-08-20 — 首页顶部操作入口调整（本次会话）

- 状态：待评审。
- 目标：移除首页底部“添加物品”按钮，将添加入口迁移到顶部栏右侧加号按钮；顶部栏左侧改为原右侧的冰箱入口图标。
- 范围：`frontend/src/App.tsx` 首页 `FridgeHome` 顶部栏和底部操作区、首页相关回归断言；不改变添加物品流程、其他页面顶部栏或共享标题栏布局。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §6.1、§6.2.1、§8；`docs/functional-design-and-feasibility.md` §5.1、§17.1；`docs/final-ui-designs.md` 当前冰箱首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`；`docs/ui-assets/png/pwa-home.png`。
- 预期验证：首页底部不再渲染“添加物品”，顶部栏左侧可查看我的冰箱，右侧加号可进入原添加物品流程；运行首页相关测试、前端 lint、生产构建和 `git diff --check`。
- 会话记录：已确认当前 `FridgeHome` 顶部栏左侧为“管理冰箱”菜单、右侧为“查看我的冰箱”图标，底部仍有“添加物品”按钮；本轮将交换并替换这三个入口的职责，保留三列标题栏的视口居中约束。
- 完成：首页顶部栏左侧改为“查看我的冰箱”图标并保留原切换冰箱行为；右侧改为带可访问名称的 SVG 加号按钮并复用原 `onAdd` 流程；删除首页底部“添加物品”按钮和不再使用的首页“管理冰箱”入口。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（111 passed）、`npm run --prefix frontend test -- --run`（27 files、230 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实手机/PWA、Capacitor WebView 或 Playwright 中进行人工视觉验收；未执行发布。
- 下一步：评审首页顶部栏两个图标的视觉顺序和点击反馈；通过后按发布规则处理。
- 追加反馈：用户指出首页右上角加号视觉尺寸大于购物页面右上角入口，要求与购物页面一致。
- 追加方案：复用购物页面的 `p9-add-shopping-button` 类，使首页加号按钮保留 48×48 最小热区、图标统一为 24×24；不改变点击行为和顶部栏三列布局。
- 追加完成：首页加号按钮已复用 `p9-add-shopping-button`，与购物页面右上角入口保持相同的图标尺寸和热区。
- 追加验证：`npm run --prefix frontend test -- --run src/App.test.ts`（111 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。

### 2026-08-20 — 编辑食谱支持手工修改食材分类（本次会话）

- 状态：待评审。
- 目标：将“编辑食谱”页面各食材当前仅展示的分类改为带下划线的可点击链接，点击后打开底部上弹的“选择分类”面板，并在选择后更新当前食材分类。
- 范围：食谱编辑器分类入口、分类选择状态与保存数据；复用现有 `CategoryPickerPanel`、分类目录和底部抽屉样式；不改变食材名称、数量、删除和自动匹配规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.1–§9.2、§17.1；`docs/final-ui-designs.md` 单日食谱编辑草稿 `bbeda1ae-e99c-40d6-87b3-90cdedd7adfa`；`docs/ui-assets/png/pwa-recipe-edit.png`、`docs/ui-assets/html/pwa-recipe-edit.html`；现有 `CategoryPickerPanel` 底部抽屉实现。
- 预期验证：食谱编辑页分类链接可打开并关闭底部抽屉，选中分类后当前行显示新分类且保存请求携带新分类 ID；运行相关前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认食谱工作区目前没有接收分类目录，分类状态由 `matched_category_name` 只读展示；应用工作区已有按冰箱访问角色加载的 `categories`，选择器组件已具备大类、小类搜索、选中态和底部固定布局。
- 完成：`RecipeWorkspace` 接收工作区分类目录，食材分类改为带下划线链接；点击后复用 `CategoryPickerPanel` 底部抽屉，支持按大类、搜索小类和当前选中态选择；选择后更新当前食材的 `subcategory_id`、分类名称和匹配状态，保存继续走原有食谱接口；抽屉增加最大高度，长目录在面板内部滚动。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（111 passed）、`npm run --prefix frontend test -- --run`（27 files、230 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实手机/PWA、Capacitor WebView 或 320/390/430px 视口进行人工视觉验收；未执行发布。
- 下一步：评审食材分类链接的文字层级和底部抽屉高度；通过后按发布规则处理。

### 2026-08-20 — 首页冰箱布局去除外框并放大图标（本次会话）

- 状态：待评审。
- 目标：去掉首页冰箱布局的圆角外框，收紧冰箱周边留白并放大首页库存图标，提升小屏幕上的可读性。
- 范围：`frontend/src/styles.css` 首页冰箱预览容器、首页专用冰箱外壳圆角和库存图标尺寸；相关前端回归断言；不改变共享布局几何、库存定位、点击区域或其他页面预览。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §9.1；`docs/final-ui-designs.md` 当前冰箱首页草稿 `23329191-d0fa-48ca-a517-fe9e3eab9b`；`docs/ui-assets/png/pwa-home.png`。
- 预期验证：首页预览不再使用圆角外框，冰箱周边留白收紧，库存图标在 320/390/430px 宽度下保持可见且不裁切；运行首页相关前端测试、前端 lint、生产构建和 `git diff --check`。
- 会话记录：已确认首页通过 `FridgePreviewFrame variant="home"` 渲染，当前 `.p7-fridge-preview` 保留较大上下左右留白，首页库存图标被限制为 18px；共享柜体/门架圆角不能全局删除，因此改为首页范围覆盖。
- 完成：首页预览最大宽度改为跟随容器，周边留白收紧为 `4px 4px 8px`；首页柜体和门架覆盖为直角；首页库存图标由 18px 放大到 26px，数量、临期和过期角标同步放大。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（110 passed）、`npm run --prefix frontend test -- --run`（27 files、229 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实手机/PWA、Capacitor WebView 或 320/390/430px 视口进行人工视觉验收；未执行发布。
- 下一步：评审首页冰箱结构边缘和图标辨识度；通过后按发布规则部署并在真实设备验收。
- 追加反馈：用户确认首页仍存在外框，要求彻底删除外框，而不是仅将圆角改为直角；本轮将移除首页柜体和门架的外部 `3px` 边框，保留内部格位分隔线。
- 追加完成：首页 `.open-fridge-cabinet` 和 `.open-fridge-door` 已使用首页范围 `border: 0`，不再绘制柜体/门架外边框；内部格位线、门区分隔和合页继续保留。
- 追加验证：`npm run --prefix frontend test -- --run src/App.test.ts`（110 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 最新反馈：用户明确外框来自 `class="horizontal-swipe-area p7-fridge-preview"`，要求恢复冰箱布局本身的外框，并移除该首页包装 section。
- 最终调整：恢复共享柜体和门架的原有外边框及圆角；首页 `FridgePreviewFrame` 直接作为页面内容节点，移除 `horizontal-swipe-area p7-fridge-preview` 包装 section；左右滑动事件改挂到预览根节点，保留冰箱切换能力；首页图标放大与留白收紧继续保留。
- 最终验证：`npm run --prefix frontend test -- --run`（27 files、230 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实手机/PWA、Capacitor WebView 或 320/390/430px 视口进行人工视觉验收；未执行发布。
- 最新反馈：移除包装 section 后，用户要求首页顶部标题栏和底部导航使用原 section 的 `var(--surface)` 背景色，避免应用壳与原外框的颜色语义断开。
- 本轮完成：首页 `p7-shell` 的顶部标题栏和底部导航背景统一改为 `var(--surface)`，与原外框背景令牌一致；未改变内容区、冰箱本体和交互结构。
- 本轮验证：`npm run --prefix frontend test -- --run src/App.test.ts`（112 passed）、`npm run --prefix frontend test -- --run`（27 files、231 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 本轮未验证：未在真实手机/PWA、Capacitor WebView 或 320/390/430px 视口进行人工视觉验收；未执行发布。

### 2026-08-20 — 清理分类候选中的历史节点与错误语义映射（本次会话）

- 状态：已完成，待真实设备验收。
- 目标：阻止已从当前目录移除的历史分类进入自动分类候选，并修正“鸡蛋→蛋类”“牛仔骨→牛肉”“杂粮→主食”的分类结果。
- 范围：分类匹配候选白名单、图像/照片识别候选白名单、明确分类别名和相关回归测试；清理生产错误 AI 缓存并修正历史食谱、库存分类数据。
- 设计/需求基线：用户本次反馈；`catalog.json` 当前有效小类清单；生产数据库存在历史 `builtin-egg/鸡蛋` 节点；现有自动分类和识别候选构造路径。
- 预期验证：历史 `鸡蛋` 不再作为模型或确定性候选；`鸡蛋` 返回 `蛋类`；`牛仔骨` 返回 `牛肉`；`杂粮` 返回 `主食`；运行分类、识别相关测试、全量后端测试、Ruff 和 `git diff --check`。
- 会话记录：已确认分类候选目前只过滤 `parent_id IS NOT NULL`，会把目录已移除但因历史引用保留的 `builtin-egg` 继续暴露；此前目录还把不属于当前“添加物品”清单的“杂粮”声明为合法小类。本轮已将 `杂粮` 从版本化合法目录移除，将其作为输入别名归入“主食”，并让分类/图片/订单识别只使用当前目录小类和当前冰箱自定义小类。
- 完成：`鸡蛋` 自动归入 `蛋类`，`牛仔骨` 自动归入 `牛肉`，`杂粮` 自动归入 `主食`；模型返回的旧分类 ID 或错误有效分类会被物品名称确定性结果覆盖；历史分类仅保留兼容，不再进入新候选。
- 验证：分类、识别、库存和目录专项测试 69 passed；定向仓储/食谱边界测试 35 passed；全量 `uv run pytest` 通过（169 passed，52 条既有警告）；`uv run ruff check backend`、两个分类 JSON 解析和 `git diff --check` 均通过。
- 发布会话记录：用户明确要求提交、发布、清理错误缓存和纠正错误数据；发布前追加通过 `uv lock --check`、前端 lint、前端 27 个测试文件/229 tests 和前端生产构建，待提交后执行服务器备份、容器健康检查和数据修复复核。
- 发布会话记录：已提交 `065af82`（`修复自动分类合法性与历史分类映射`）并发布；自动生成 release `260820113838`；服务器数据库备份为 `/data/fridgeboard.db.backup-20260820-033847`；容器镜像 ID 为 `sha256:d9708bf90bbdc2478f9d0c2cc57686a928566e24ba79f1750f06a83ace7a472d`；容器状态为 `healthy`，`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 数据修复：删除本地 2 条、全局 1 条错误未确认 AI 缓存；修正 17 条食谱食材记录，并处理 6 条相关库存记录（其中 3 条从非法 ID 迁移）；全库不再引用 `builtin-egg`、`builtin-whole-grain`；目标冰箱中“鸡蛋→蛋类”“牛仔骨→牛肉”“杂粮→主食”已复核；`PRAGMA integrity_check` 为 `ok`，外键违规数为 0。
- 验证：`uv run ruff check backend`、`uv run pytest`（169 passed，52 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、229 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；生产健康检查和数据库修复后复核通过。
- 未验证：未在真实手机/PWA 或 Capacitor WebView 完成人工验收；发布归档解包时服务器 tar 输出 macOS 扩展属性警告，但发布脚本最终成功且容器健康。
- 下一步：在真实设备刷新资源并验证编辑食谱、添加物品和识别流程的分类展示。

### 2026-08-20 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的拟物主题图标及相关来源、回归测试和文档改动发布到生产服务器。
- 范围：提交 `692c641`、生产 Docker 镜像、服务器 SQLite 备份、容器健康检查和 HTTPS 健康检查；不修改生产数据内容。
- 设计/需求基线：当前工作区改动、`scripts/deploy-image.sh` 和生产发布规则。
- 会话记录：发布前完成后端、前端、锁文件、发布脚本语法和 diff 检查；未提交改动已按发布规则纳入发布提交，未包含敏感文件。
- 完成：提交 `692c641` 已部署；自动生成 release `260820030809`；服务器数据库备份为 `/data/fridgeboard.db.backup-20260819-190817`；容器状态为 `healthy`；镜像 ID 为 `sha256:bb59f198c5f23b4b23a05ea1a0c76dd96bf34bec96cd4d70087b28038728b2ba`。
- 验证：`uv run ruff check backend`、`uv run pytest`（168 passed，52 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、229 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过；生产 `https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；容器内前端产物确认包含 release `260820030809`。
- 未验证：尚未在真实手机/PWA 或 Capacitor WebView 完成发布后人工验收；发布归档解包时服务器 tar 输出 macOS 扩展属性警告，但发布脚本最终成功且容器健康。
- 下一步：在真实设备刷新资源并验证拟物主题图标、库存日期/分类匹配和登录流程；验收通过后将本条状态转为完成。

### 2026-08-20 — 拟物图标语义微调（本次会话）

- 状态：待评审。
- 目标：按用户指定的 Thiings 对象微调 8 个拟物主题分类图标：干货、饮料、羊肉、面膜、辣椒、扫拖、酒类、菌菇。
- 范围：对应 `icons/skeuomorphic/` PNG、`theme_variants.json`、Thiings 来源清单和本进度记录；不改变逻辑图标键、分类数据、API 或页面交互。
- 设计/需求基线：用户本次明确指定的 Thiings 对象名称；现有 Thiings 资产映射与无重复约束。
- 预期验证：8 个对象地址与本地文件一致，46 个拟物资产仍保持 256×256 RGBA 且无重复；图标专项测试、Ruff 和 `git diff --check`。
- 会话记录：已从 Thiings `/api/catalog` 核对 8 个对象的唯一图片 ID，其中“辣椒”对应 `chili-pepper`，扫拖对应 `robot-vacuum`，菌菇对应 `honey-mushroom`。
- 完成：干货改为 Dried Dulse，饮料改为 Strawberry Lime Boba Tea，羊肉改为 Lamb，面膜改为 Facial Mask，辣椒改为 Chili Pepper，扫拖改为 Robot Vacuum，酒类改为 Wine Glass，菌菇改为 Honey Mushroom；来源清单已同步。
- 验证：8 个新对象图片均为 256×256 RGBA；46 个拟物资产内容哈希无重复；`uv run pytest backend/tests/test_item_catalog_api.py -q`（17 passed）、`uv run ruff check backend` 和 `git diff --check` 均通过。上一轮完整后端 168 passed、前端 229 passed、lint/build 和 `uv lock --check` 已通过，本次仅变更图标资产与来源记录。
- 未验证：尚未在真实已安装 PWA、Capacitor WebView 和 320/390/430px 视口逐项进行人工视觉验收；Thiings 当前条款/署名与商业发布适用范围仍需在正式发布前按项目主体确认。
- 下一步：评审本轮 8 个图标的语义和视觉效果；正式发布前复核 Thiings 授权/署名要求并按发布规则执行。

### 2026-08-20 — 拟物主题图标替换为 Thiings 资产（本次会话）

- 状态：待评审。
- 目标：将拟物主题的 46 个内置分类图标全部替换为 Thiings 3D 图标，并保证每个逻辑图标使用不同的对象资产；猪肉、牛肉、羊肉、鸡肉按猪、牛、羊、鸡动物语义取图，不复用“肉类”图标。
- 范围：`backend/fridgeboard/assets/item_catalog/icons/skeuomorphic/`、`theme_variants.json`、第三方资产来源说明、图标资产回归测试和本进度记录；不改变分类键、数据库字段、图标 API、页面布局和主题 fallback。
- 设计/需求基线：用户本次指定的 Thiings 图标集合；`docs/ui-design-specification.md` §4.4、§8；`docs/theme-system-requirements-and-design.md` §6.3、§12.2；Thiings 图标集合与单图详情页。
- 预期验证：46 个 Thiings 来源对象与本地文件一一对应；PNG 统一为 256×256 RGBA、文件哈希无重复；主题变体清单无缺失/重复路径；后端图标专项测试、Ruff、前端测试/lint/build 和 `git diff --check`。
- 会话记录：已确认当前拟物变体实际只有 40/46 个文件，且现有来源为 Fluent Emoji；已从 Thiings `/api/catalog` 获取对象清单与唯一图片 ID，按逻辑图标语义建立不重复映射，并将肉类四项分别映射到 Domestic Chicken、Cow、Pig、Sheep。
- 完成：46 个拟物 PNG 全部替换为 Thiings 对象资产并补齐缺口；新增 `THIINGS_ASSET_SOURCES.md` 记录对象、详情页和原始图片 ID；删除不再使用的 Fluent Emoji 许可文件；主题变体清单达到 46/46；新增回归测试校验完整覆盖、唯一文件路径、唯一内容哈希和 `256×256 RGBA` 格式。
- 验证：资产审计确认目录/变体/文件均为 46，SHA-256 无重复；本地接触表确认鸡肉、牛肉、猪肉、羊肉实际为对应动物图，熟肉与肉类使用不同食物图；`uv run pytest backend/tests/test_item_catalog_api.py -q`（17 passed）、`uv run ruff check backend`、`uv run pytest`（168 passed，52 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、229 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实已安装 PWA、Capacitor WebView 和 320/390/430px 视口逐项进行人工视觉验收；Thiings 当前条款/署名与商业发布适用范围仍需在正式发布前按项目主体确认。
- 下一步：评审拟物主题下食材语义、图标辨识度和加载效果；正式发布前复核 Thiings 授权/署名要求并按发布规则执行。

### 2026-08-20 — 生产发布（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的拟物主题及此前已完成但未发布的修复发布到生产服务器。
- 范围：当前 `HEAD`、生产 Docker 镜像、服务器 SQLite 备份、容器健康检查和 HTTPS 健康检查；不修改生产数据内容。
- 设计/需求基线：当前 `HEAD` `bf95936`、本文件中最近未发布事项及 `scripts/deploy-image.sh` 发布约定。
- 预期验证：后端 Ruff/测试、前端 lint/测试/build、锁文件和 diff 检查；发布脚本远端数据库备份、容器 healthy、`/healthz` 返回成功。
- 会话记录：已确认工作区无未提交应用改动，`main` 比 `origin/main` 多 1 个提交；发布配置文件存在，发布脚本将自动生成 release 号并使用固定生产 SSH 主机校验。
- 完成：发布提交 `4c9f519`（包含拟物主题提交 `bf95936`）已部署；自动生成 release `260820015047`，服务器数据库备份为 `/data/fridgeboard.db.backup-20260819-175100`，容器状态为 `healthy`，镜像标识为 `sha256:60083b87bed6e147a48cb140f23d466c70951c9200c200936d88f74b93ab40bc`。
- 验证：`uv run ruff check backend`、`uv run pytest`（167 passed，52 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、229 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；远端 Docker 构建、容器健康检查和 `https://fridge.flycn.fyi/healthz`（`{"status":"ok"}`）均通过。
- 未验证：尚未在真实手机/PWA 或 Capacitor WebView 完成发布后人工验收；发布完成后工作区新增的 `frontend/src/App.test.ts` 和 `frontend/src/styles.css` 未包含在本次发布中。
- 下一步：在真实设备刷新资源并验证首次未登录首页、库存日期/分类匹配和拟物主题图标；另行评审当前未发布的角标样式改动。

### 2026-08-20 — 拟物主题首页物品徽标玻璃化（本次会话）

- 状态：待评审。
- 目标：将拟物主题首页冰箱内物品左上角的数量和状态标志，从黑底白字调整为半透明玻璃底黑字。
- 范围：`frontend/src/styles.css` 中首页 `.p7-food` 数量、临期和过期标志的视觉样式；不改变物品定位、尺寸、状态判断和其他页面徽标。
- 设计/需求基线：用户本次明确要求；首页现有 `.p7-food` 物品标记结构和拟物主题冰箱视觉。
- 预期验证：数量、临期、过期三种标记均为半透明浅色玻璃底和黑字，首页窄屏布局不发生溢出；前端 lint、测试、构建和 `git diff --check`。
- 会话记录：确认数量、临期和过期标记均由首页 `.p7-food` 规则控制；新增首页范围内的半透明浅色玻璃底、黑字、轻微边界和背景模糊，临期标志保留黑色斜纹，未改动位置和尺寸规则。
- 完成：`frontend/src/styles.css` 第 426–429 行新增首页物品标记玻璃化样式覆盖。
- 验证：`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run` 通过（27 files、229 passed）；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：未执行 Playwright 或真实 PWA/Capacitor 视觉检查，本次按项目 UI 规则未自动触发视觉核验。
- 下一步：待用户在拟物主题首页确认玻璃底透明度和标志可读性。

### 2026-08-20 — 首页物品玻璃角标尺寸与透明度微调（本次会话）

- 状态：待评审。
- 目标：减少首页物品数量/状态角标对食材图标的遮挡，使玻璃底更通透清晰。
- 范围：`frontend/src/styles.css` 首页 `.p7-food` 数量、临期和过期标志的尺寸、偏移和玻璃材质参数；不改变角标显示条件和库存业务逻辑。
- 设计/需求基线：用户本次反馈；现有拟物主题首页玻璃角标样式。
- 预期验证：数字周围留白减少、角标向右上偏移、透明度提高且模糊感降低；前端 lint、测试、构建和 `git diff --check`。
- 会话记录：数量角标由 `top/right: 0` 调整为 `-2px`，最小宽度由 `10px` 调整为 `9px`，内边距、字号和行高同步收紧；临期/过期标志同步向右上收缩。玻璃底白色不透明度由 72% 降至 42%，模糊由 3px 降至 1px，临期斜纹透明度同步降低。
- 完成：`frontend/src/styles.css:423-429` 完成首页数量、临期和过期角标的紧凑化、右上偏移和透明玻璃材质调整。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、229 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未执行真实 PWA/Capacitor 或 Playwright 视觉检查。
- 下一步：待用户确认角标在实际拟物冰箱图片上的遮挡和透明度是否合适。

### 2026-08-20 — 首页数字角标保留字号并收紧留白（本次会话）

- 状态：待评审。
- 目标：保持数字角标字体大小不变，仅缩小数字周围的留白。
- 范围：`frontend/src/styles.css` 首页 `.p7-food b` 的字号、最小宽度和内边距；不改变位置、玻璃透明度、警告标志和角标显示条件。
- 设计/需求基线：用户本次反馈；现有首页数字角标样式。
- 预期验证：数字字号恢复为 8px，角标宽度由内容自然撑开且无额外内边距；前端 lint、测试、构建和 `git diff --check`。
- 会话记录：确认上次调整将字号误改为 7px；本次恢复为 8px，仅将 `min-width` 设为 0、内边距设为 0，并保留原有右上偏移和玻璃材质参数。
- 完成：`frontend/src/styles.css:423` 仅收紧数字角标留白，不再缩小字体。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、229 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未执行真实 PWA/Capacitor 或 Playwright 视觉检查。
- 下一步：待用户确认字号和角标留白符合预期。

### 2026-08-20 — 首页单件无警告物品隐藏角标（本次会话）

- 状态：待评审。
- 目标：单个且没有临期/过期警告的首页物品不显示空数量角标。
- 范围：`frontend/src/App.tsx` 的首页物品标记渲染条件和相关回归测试；不改变多件数量、临期/过期警告及库存数据。
- 设计/需求基线：用户本次明确要求；现有 `.p7-food` 数量和状态标记规则。
- 预期验证：数量为 1 且无警告时不渲染 `<b>`；数量大于 1、临期或过期时仍保留对应角标；前端测试、lint、构建和 `git diff --check`。
- 会话记录：确认原实现始终渲染 `<b>`，数量为 1 时仅隐藏文本，导致玻璃样式仍显示为空角标；现改为仅在 `quantity > 1` 时渲染数量角标，临期/过期状态继续由独立伪元素显示。
- 完成：`frontend/src/App.tsx:230` 将数量角标改为条件渲染；`frontend/src/App.test.ts:869-870` 增加源码回归断言，防止恢复为空角标的实现。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts` 通过（110 passed）；`npm run --prefix frontend test -- --run` 通过（27 files、229 passed）；`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未执行真实 PWA/Capacitor 视觉检查。
- 下一步：待用户确认单件普通物品不再显示空角标，多件或有警告物品显示正常。

### 2026-08-20 — 拟物图标语义资产替换（本次会话）

- 状态：待评审。
- 目标：按用户指定的 Fluent Emoji 3D 资产替换牛肉、羊肉、猪肉、主食、调料、菌菇、饮料和精华图标，保持现有主题变体 API 与 fallback 契约不变。
- 范围：`backend/fridgeboard/assets/item_catalog/icons/skeuomorphic/`、`theme_variants.json`、图标资产回归检查；不改变分类键、数据库字段和页面交互。
- 设计/需求基线：用户本次指定的 8 个源文件；现有 Fluent Emoji MIT 来源说明和拟物主题图标变体实现。
- 预期验证：8 个 PNG 均为 256×256 RGBA；主题清单路径与文件一致；后端图标接口专项测试、Ruff、前端测试/lint/build 和 `git diff --check`。
- 会话记录：已确认 8 个源文件全部存在且为 256×256 RGBA PNG，并覆盖原先近似语义映射。
- 完成：牛肉、羊肉、猪肉、主食、调料、菌菇、饮料和精华已分别映射到用户指定的 Fluent Emoji 3D PNG；补充图标接口回归断言。
- 验证：8 个资产路径均存在；`uv run pytest backend/tests/test_item_catalog_api.py -q` 通过（16 passed）；`uv run ruff check backend/fridgeboard/item_catalog.py backend/tests/test_item_catalog_api.py`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、228 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；重启后的 `127.0.0.1:7002` 接口已返回 8 个 `variants.skeuomorphic` PNG URL。
- 未验证：尚未在真实已安装 PWA 和 Capacitor WebView 中逐项目视确认新图片；本地接口和前端自动化链路已验证。
- 下一步：待评审后在本地选择拟物主题确认对应分类图片。

### 2026-08-20 — 拟物主题图标切换不生效（本次会话）

- 状态：待评审。
- 目标：修复用户切换到拟物主题后仍显示水墨屏图标的问题，确保图标主题变体契约升级后不会继续复用旧页面缓存。
- 范围：前端页面缓存版本、工作区图标缓存读取和主题图标回归测试；不改变图标资产来源、分类业务字段和主题选择交互。
- 设计/需求基线：用户本次反馈；`frontend/src/pageCache.ts`、`frontend/src/App.tsx`、`frontend/src/iconVariants.ts`；拟物图标变体已接入但旧缓存仍可能缺少 `variants`。
- 预期验证：旧版本页面缓存被隔离或主动失效；重新请求工作区图标后 `skeuomorphic` 变体可被解析；前端测试、lint、构建和 `git diff --check`。
- 会话记录：初步确认主题状态和 `CategoryIcon` 的订阅链路存在；页面缓存升级已处理旧 `Icon.variants` 缺失问题。用户重启后仍无变化，进一步检查发现前端代理的 `7002` 被 8 月 19 日启动的旧 Uvicorn 进程占用，旧进程返回的 `IconResponse` 没有 `variants`，因此浏览器始终请求 SVG。
- 完成：页面缓存版本从 `v1` 升级为 `v2`，旧版本工作区缓存不再被读取；缓存清理函数同时清理 `v1` 和当前版本，避免 PWA 刷新留下旧数据；新增旧缓存回归测试。
- 验证：`npm run --prefix frontend test -- --run` 通过（27 files、228 passed）；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；`uv run pytest backend/tests/test_item_catalog_api.py -q` 通过（16 passed）；`uv run ruff check backend` 通过。
- 补充完成：停止占用 `7002` 的旧项目 Uvicorn 进程，由当前代码的 reload 服务接管端口；`/api/owner/.../icons` 已返回 `variants.skeuomorphic`，前端切换主题后实际发起 `...?theme=skeuomorphic...` PNG 请求。
- 验证：Playwright 本地 `http://127.0.0.1:7001` 实测 `data-theme=skeuomorphic`，首页 11 个图标的 `src` 均使用拟物主题 URL；资源请求 115–121 全部 `200`。旧进程 `7002` 返回旧格式、当前代码临时端口 `7003` 返回新格式的对比也已确认。
- 未验证：尚未在真实已安装 PWA 和 Capacitor WebView 中手动切换主题；本地浏览器链路已验证。
- 下一步：请在当前本地服务上刷新页面并复核；正式环境需确保前后端使用同一版本，避免旧 Uvicorn/容器继续占用 API 端口。

### 2026-08-20 — 分类匹配优先级与用户映射模糊匹配（本次会话）

- 状态：待评审。
- 目标：调整自动分类优先级，确保当前冰箱用户确认的名称映射和精确分类名称优先于 AI 自动分类及其临时缓存；为“猪肉水饺”优先命中用户确认的“水饺”分类增加安全的名称包含匹配。
- 范围：分类确定性匹配、当前冰箱用户分类映射读取、AI 缓存降级顺序、匹配单元/API 回归测试和本条进度记录；不改变库存分类字段、食谱库存扣减规则和大模型候选白名单。
- 设计/需求基线：用户本次关于分类匹配优先级的明确要求；现有 `category_match_routes.py`、`category_matching.py`、`ItemCategoryMapping` 与分类匹配测试；生产“牛仔骨”被 AI 缓存为“猪肉”而库存为“牛肉”的已确认现象。
- 预期验证：用户确认映射精确命中优先于 AI 缓存；精确分类名称优先于 AI 缓存；唯一的用户确认后缀匹配支持“猪肉水饺”→“水饺”；前缀或多候选冲突不自动匹配；运行后端分类专项测试、全量后端测试、Ruff 和 `git diff --check`。
- 会话记录：已确认当前实现先接受置信度达到 0.85 的未确认 AI 缓存，再执行内置名称/别名匹配，导致“牛仔骨”的错误 AI 缓存覆盖真实库存分类。本轮已改为用户确认映射精确命中、精确分类名称、用户确认映射安全后缀命中、内置确定性规则、AI 缓存、大模型的降级顺序；库存显式分类作为用户确认映射缺失时的兜底；内置牛肉别名补充“牛仔骨/牛骨仔”。
- 完成：新增确定性分类函数和当前冰箱用户/库存映射读取；“猪肉水饺”在用户确认“水饺”时命中主食，“牛奶巧克力”不会因前缀牛奶自动命中；同长度跨分类冲突保留未匹配；新增 AI 缓存不得覆盖用户映射或精确分类名称的 API 回归。
- 验证：`uv run pytest` 通过（167 passed，52 条既有警告）；`uv run ruff check backend` 通过；分类专项 `backend/tests/test_category_matching.py` 15 passed；`git diff --check` 通过。
- 未验证：尚未发布到生产；生产现有“牛仔骨”的错误 AI 缓存未清理，需发布后在“冰箱”上重新打开编辑/新增食材验证；未在真实手机/PWA 上验证输入防抖与大模型请求取消的视觉状态。
- 下一步：评审通过后按发布流程部署；部署后清理或覆盖生产“牛仔骨”的旧未确认缓存，并验证“黑椒牛仔骨”编辑页显示牛肉以及“猪肉水饺”匹配主食库存。

### 2026-08-20 — 拟物主题物品分类图标来源分析（本次会话）

- 状态：待评审。
- 目标：为 46 个内置物品分类接入拟物主题图标方案，优先使用许可清晰的 3D PNG，并为缺失分类保留统一 fallback。
- 范围：`backend/fridgeboard/assets/item_catalog/catalog.json` 的 46 个逻辑图标、现有图标 API 与 `CategoryIcon` 渲染入口；接入首批 38 个 Fluent Emoji 3D 资产，不改变分类、库存和食谱数据。
- 设计/需求基线：`docs/ui-design-specification.md` §4.4、§8；`docs/theme-system-requirements-and-design.md` §5、§6.3、§8；用户本次关于 Thiings 来源的明确要求。
- 预期验证：主题变体 API、owner/daily_access/显示设备三条读取路径、主题 fallback、PNG 尺寸/透明度、前后端质量门禁。
- 会话记录：Thiings 页面提供单个 PNG 下载，样本为 1024×1024 RGBA；官方当前条款规定免费单图仅限个人非商业使用且需显著署名，商业项目需购买 Indie/Business/Enterprise，且不得将图标作为独立资产再分发。进一步检查发现 3dicons 主要是通用对象图标，无法覆盖食品分类；Microsoft Fluent Emoji 仓库提供 MIT 许可的 3D PNG，能覆盖更多食品、个护和清洁语义。本轮采用 Fluent Emoji 作为首批可商用 3D 资产来源，未覆盖项保留统一 fallback，待 `OPENAI_API_KEY` 可用后再生成同风格自有资产。
- 完成：新增 `theme_variants.json` 和 MIT 来源说明；接入 38 个 256×256 RGBA Fluent Emoji 3D PNG；`IconResponse` 新增 `variants`；owner、daily_access 和显示设备图标端点支持主题变体 URL；前端统一由 `resolveIconVariant` 和 `CategoryIcon` 解析，缺失变体回退主 SVG，自定义 PNG 保持原行为。
- 验证：`uv run pytest` 通过（167 passed，52 条既有警告）；`uv run ruff check backend`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 files、227 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；38 个拟物 PNG 均检查为 RGBA。
- 未验证：剩余 8 个分类尚未生成自有 3D 资产；当前环境未配置 `OPENAI_API_KEY`，未执行图像生成；未做真实手机/Capacitor 离线缓存和视觉截图验收。
- 下一步：配置图像生成环境后补齐缺失分类并做统一画布/光照/透明边界验收；用户评审首批拟物图标密度和风格后，再考虑卡通主题变体。

### 2026-08-19 — 单腔/双腔拟物母版分层接入（本次会话）

- 状态：待评审。
- 目标：将拟物结构资产明确拆为单腔与双腔两套母版；单腔模板保持现有已验收母版和坐标，宽体模板使用新生成的双腔母版及独立左右几何，不再从单腔母版切割、拉伸或镜像拼装。
- 范围：拟物场景计划的母版类型、双腔左右腔体/左右门独立坐标、完整母版渲染和相关回归测试；动态隔板、门架和交互热区继续由共享业务布局生成。不修改后端、布局 API、单腔视觉或其他主题。
- 设计/需求基线：用户确认新双腔图效果良好，同时明确指出双腔左右门、左右内腔光影和中央分格均不同，不能替代单腔母版，也不能继续使用单腔切片镜像方案。
- 预期验证：单腔模板只引用原单腔母版；`side_by_side`、`french_door` 只引用完整双腔母版；宽体渲染不存在切片 SVG、镜像变换或后叠加中框；计划层提供独立左右门和双腔内容区域；定向测试、前端全量测试、lint、构建及独立测试页视觉检查。
- 会话记录：现有 `wide-sliced` 同时依赖单腔柜体横向拉伸、右门切片镜像成左门和运行时拼接中框，与新母版的真实左右光影冲突。本轮将该隐含假设替换为显式结构母版和独立几何。
- 完成：计划层新增 `single-cavity` / `dual-cavity` 结构母版选择和具体腔体列表。单腔场景继续使用 1005×1227 原母版及既有右门坐标；宽体场景改用 1427×1102 双腔母版，左右腔体、左门和右门均为独立坐标，不再调用镜像函数。渲染器删除 `WideSlicedSoftShell`、`WideCenterDivider` 及全部宽体切片 SVG，宽体背景只绘制一张完整双腔图。跨中央分格的业务区域仍保留统一交互区，但横隔板按左右真实腔体拆分，不能遮盖中框。
- 资产：双腔无损候选已压缩为 `frontend/src/assets/fridge/empty-fridge-soft3d-wide-double-door-v1.webp`，1427×1102 RGBA、约 48KB；原单腔 `empty-fridge-soft3d-top-freezer-single.webp` 保持不变。两套母版均进入带内容哈希的生产构建产物。
- 验证：先补失败用例锁定结构母版选择、双腔完整单图、无切片/镜像/后叠加中框和隔板不跨腔体；定向测试 9 passed。前端全量测试 222 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；构建产物中单腔母版 37.69KB、双腔母版 49.64KB。Playwright 在独立测试页 390×844 检查 `side_by_side` 和 `french_door`，确认双腔原生光影、中框、左右门完整，隔板分别止于内框，控制台 0 error / 0 warning；截图：`output/playwright/fridge-dual-master-side_by_side-final-390.png`、`output/playwright/fridge-dual-master-french_door-final-390.png`。
- 未验证：真实生产数据下的最大格位密度、双腔门架承载食品后的遮挡、320/430px、Android/iOS 真机、离线缓存及卡通主题结构母版。
- 下一步：用户评审两种宽体模板的隔板和门架落点；通过后沿同一结构族协议制作卡通双腔母版。

### 2026-08-19 — 双腔隔板中框侧直角与端点校准（本次会话）

- 状态：待评审。
- 目标：修正双腔柜体隔板靠中央分格一侧仍使用单腔梯形收口的问题，使中框侧为直角边，并校准左右腔隔板端点。
- 范围：双腔隔板多边形端点和回归测试；不修改双腔母版、中框、门体、门架、单腔隔板、业务布局或其他主题。
- 设计/需求基线：用户指出左腔隔板整体偏左，右端应贴合中隔亮边；右腔隔板左端盖住中隔，应向右移动数像素；两侧靠中框边均不得再使用斜角。
- 预期验证：左腔隔板前后右端同 X 且贴近中框亮边；右腔隔板前后左端同 X 且位于右内框内，不遮盖中框；单腔既有透视端点不变；定向测试、全量测试、lint、构建和 390px 独立页截图。
- 完成：双腔隔板按腔体索引识别中框侧。左腔隔板的前后右端统一固定为 `x=689`（左腔右边界内缩 3px），形成直角并延长到中框亮边；右腔隔板的前后左端统一固定为 `x=738`（右腔左边界右移 5px），形成直角且不再覆盖中框。左右腔靠外壁一侧继续使用原有透视收口；单腔隔板算法未修改。
- 验证：先补失败用例复现中框侧仍为斜边；新增断言锁定左右中框侧前后端同 X 及 `689/738` 端点。定向测试 9 passed；前端全量测试 222 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `side_by_side`、`french_door`，控制台 0 error / 0 warning；截图：`output/playwright/fridge-dual-divider-square-side_by_side-390.png`、`output/playwright/fridge-dual-divider-square-french_door-390.png`。
- 未验证：真实最大格位密度、320/430px、Android/iOS 真机和带食品内容时的中框遮挡。
- 下一步：用户评审双腔隔板中框侧端点；若仍需微调，只调整 `689/738` 两个母版像素坐标，不再改变透视算法。

### 2026-08-19 — 双腔柜体/门架端点与底部白色分格校准（本次会话）

- 状态：待评审。
- 目标：收回双腔柜体隔板对中框和左外框的覆盖；将左右门架缩入门内胆的内侧内沿，并在每扇门最下层以白色分格替换玻璃分格。
- 范围：双腔柜体隔板端点、双腔左右门独立内平面、门架材质选择及回归测试；不修改母版、单腔坐标、业务布局、食品内容或其他主题。
- 设计/需求基线：用户明确要求左右腔靠中框端各缩短 2px、左腔外侧右移 4px；左门架缩入内侧内沿，右门左端向左 2px且右端缩入内侧内沿；左右门最下面玻璃分格替换为白色分格。
- 预期验证：柜体隔板不覆盖中框或左外框；左右门架均落在门内胆内沿，右门左端按 2px 校准；双腔每扇门只有最下层为白色分格；单腔门架材质和坐标保持不变。
- 完成：左腔隔板中框侧从 `x=689` 收至 `x=687`，右腔中框侧从 `x=738` 收至 `x=740`，两侧各离开中框 2px且继续保持直角；左腔隔板靠外框的前后端整体右移 4px。左门内平面横向坐标从 `85..329` 收入白色内胆内沿 `101..318`；右门左端从 `1098` 左移至 `1096`，右端从 `1342` 收入内沿 `1326`，左右门不做镜像推算。
- 材质规则：门架新增独立 `material` 语义，CSS 从温区类 `cold/frozen` 改为材质类 `glass/white`。单腔仍按既有温区决定白色/玻璃；双腔每扇门仅最后一个门架为白色，其余为玻璃，因此最下面玻璃分格被白色分格替换且保留白色上下沿。
- 验证：失败用例覆盖柜体新端点、左右门独立内沿坐标和双腔每门 `glass, white` 材质序列；定向测试 9 passed。前端全量测试 222 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `side_by_side`、`french_door`，确认隔板不压中框/左外框、门架落入内胆内沿、每扇门最下层为白色，控制台 0 error / 0 warning；截图：`output/playwright/fridge-dual-racks-inset-white-bottom-side_by_side-390.png`、`output/playwright/fridge-dual-racks-inset-white-bottom-french_door-390.png`。
- 未验证：真实最大门架数量及食品遮挡、320/430px、Android/iOS 真机、卡通主题。
- 下一步：用户评审左右门架宽度和底部白色分格；后续像素微调保持左右门独立坐标，不引入镜像约束。

### 2026-08-19 — 双腔隔板与门架外侧再次收边（本次会话）

- 状态：待评审。
- 目标：继续将双腔柜体隔板和左右门架收进真实内框，消除隔板/门架骑在内框外沿的视觉问题。
- 范围：双腔隔板左右端点、左右门外侧内沿坐标及回归测试；不修改母版、中央分隔、合页侧端点、单腔模板、材质和业务布局。
- 设计/需求基线：用户要求左腔隔板两边分别向腔体中间再缩短 2px，右腔隔板靠中框左侧再向右缩短 2px；左右门隔板的外侧均需继续向内缩入门内框。
- 预期验证：左腔隔板外侧/中框侧分别从当前坐标再收 2px，右腔中框侧再收 2px；左门最左端、右门最右端各向内 4px，合页侧不变；独立测试页无溢出、隔板不压框、控制台无错误。
- 完成：左腔中框端由 `x=687` 收至 `685`，左腔外侧从相对边界 `+4` 调整为 `+6`；右腔中框端由 `x=740` 收至 `742`。左门外侧内沿由 `x=101` 收至 `105`，右门外侧内沿由 `x=1326` 收至 `1322`，合页侧坐标保持不变。
- 验证：更新像素断言覆盖 `685/左腔外侧+6/742/105/1322`；定向测试 9 passed。前端全量测试 222 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `side_by_side`、`french_door`，确认柜体隔板与门架均缩入内框，控制台 0 error / 0 warning；截图：`output/playwright/fridge-dual-racks-final-side_by_side-390.png`、`output/playwright/fridge-dual-racks-final-french_door-390.png`。
- 未验证：真实最大格位密度、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户评审本次外侧收边；后续仅按截图中的实际内沿继续做小幅像素校准。

### 2026-08-19 — 拟物主题背景改为白色（本次会话）

- 状态：待评审。
- 目标：将拟物主题的应用背景从浅绿色改为纯白，确认冰箱外圈绿色是否来自页面底色还是母版边缘。
- 范围：拟物主题背景令牌和独立测试页视觉检查；不修改冰箱 WebP、柜体/门架几何、卡通/水墨主题或控件层次。
- 设计/需求基线：用户指出当前底色为浅绿色，应用背景应为白色，并要求先观察白底下的冰箱外圈效果。
- 预期验证：拟物主题页面和独立测试页背景为 `#FFFFFF`；冰箱母版透明区域不再显示浅绿色；冰箱主体光影和内胆颜色保持不变。
- 完成：将拟物主题 `--paper` 和 `--chrome` 从浅绿色/浅灰改为 `#FFFFFF`，并同步修正独立测试页自身覆盖的 `--paper`。冰箱母版保持透明 WebP，不修改图像像素。
- 验证：Pillow 确认双腔 WebP 无半透明像素且无绿色透明边缘；Playwright 390×844 的 `side_by_side`、`french_door` 页面截图确认白色底色、冰箱光影保持，控制台 0 error / 0 warning。截图：`output/playwright/fridge-white-background-side_by_side-390.png`、`output/playwright/fridge-white-background-french_door-390.png`。
- 未验证：真实生产首页所有页面的白底视觉、Android/iOS 系统主题和卡通主题。
- 下一步：用户确认白色背景后，继续处理拟物主题其他页面的背景层级。
- 补充修正：白底复核发现模型绿幕编辑在透明边界内侧留下绿色溢色，且完全透明像素仍携带绿色 RGB，WebP 重采样后形成冰箱外圈绿边。仅对透明边界做去绿处理，并将完全透明像素 RGB 统一为白色；冰箱主体内部像素保持不变。
- 补充验证：处理后边界最大绿色通道偏移从 76 降至 4；透明 WebP 为 1427×1102、约 46KB。最终白底 Playwright 截图 `output/playwright/fridge-white-background-decontaminated-side_by_side-390.png` 确认底色和外圈均无明显绿色，控制台 0 error / 0 warning。前端全量测试 222 passed（26 files）、lint、构建和 `git diff --check` 均通过。

### 2026-08-19 — 双腔隔板材质端点与右腔深角对齐（本次会话）

- 状态：待评审。
- 目标：按隔板材质和腔体侧继续校准双腔隔板端点，使左腔玻璃右侧、右腔白色左侧以及右腔外侧深角分别对齐母版内胆边界。
- 范围：双腔柜体隔板多边形端点及像素回归测试；不修改母版、隔板材质顺序、外框、门架、单腔模板或页面背景。
- 设计/需求基线：用户要求左腔所有玻璃隔板右侧左移 1px；右腔白色隔板左侧左移 1px；右腔玻璃和白色隔板的右上内角向右对齐到内胆最深色竖线。
- 预期验证：左腔玻璃右侧为 `684`、右腔白色左侧为 `741`；右腔各材质后方右上角向右校准 4px；其他隔板端点和单腔坐标不变。
- 完成：左腔玻璃隔板后/前右端从 `685` 收至 `684`；右腔白色隔板后/前左端从 `742` 收至 `741`。右腔玻璃和白色隔板的后方右上角统一向右校准，保证至少比对应前沿右 4px，并限制在右内胆边界内，解决不同层高下内角未对齐的问题。
- 验证：新增材质级端点断言；定向测试 9 passed。前端全量测试 222 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `side_by_side`、`french_door`，确认左右腔端点和右腔深角对齐，控制台 0 error / 0 warning；截图：`output/playwright/fridge-shelf-material-edge-align-side_by_side-390.png`、`output/playwright/fridge-shelf-material-edge-align-french_door-390.png`。
- 未验证：真实最大格位密度、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户评审材质差异下的隔板端点与右腔深角；后续继续保持材质级几何规则。

### 2026-08-19 — 双腔隔板暗色内胆线重新对齐（本次会话）

- 状态：待评审。
- 目标：继续收回左右腔材质端点，并将右腔隔板后方右上角从外框高光线改回内胆深色竖线。
- 范围：双腔隔板材质端点和右腔后方右上角坐标；不修改母版、前沿端点、门架、单腔模板或背景。
- 设计/需求基线：用户要求左腔玻璃右侧再左移 1px、右腔白色左侧再左移 1px；上一轮右腔右上角对到了外框高光线，需重新定位到颜色接近黑的内胆暗线。
- 预期验证：左腔玻璃右侧为 `683`、右腔白色左侧为 `740`；右腔玻璃/白色后方右上角统一落在母版内胆暗线，不落在外框高光线。
- 完成：左腔玻璃隔板后/前右端由 `684` 收至 `683`；右腔白色隔板后/前左端由 `741` 收至 `740`。重新读取双腔母版右腔内壁的颜色剖面，确认近黑内胆竖线位于 `x=1031`，将右腔玻璃和白色隔板的后方右上角固定到该坐标，撤回上一轮错误对齐到外框高光线的 `x=1038` 方案。
- 验证：新增材质端点和右腔暗线坐标断言；定向测试 9 passed。前端全量测试 222 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `side_by_side`、`french_door`，确认右上角对齐内胆暗线，控制台 0 error / 0 warning；截图：`output/playwright/fridge-shelf-dark-line-align-side_by_side-390.png`、`output/playwright/fridge-shelf-dark-line-align-french_door-390.png`。
- 未验证：真实最大格位密度、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户评审右腔深角对齐位置；后续保持母版颜色剖面坐标，不再使用外框高光作为隔板定位基准。

### 2026-08-19 — 白色隔板材质侧边微调（本次会话）

- 状态：待评审。
- 目标：按白色隔板材质分别微调双腔中框侧和单腔左侧端点。
- 范围：单腔/双腔白色隔板多边形端点和回归测试；不修改玻璃隔板、右腔暗色内胆角、门架、母版或背景。
- 设计/需求基线：用户要求左腔白色隔板右侧右移 2px、右腔白色隔板左侧左移 2px；单体冰箱白色隔板左侧左移 2px。
- 预期验证：双腔白色中框端分别调整为左腔 `687`、右腔 `738`；单腔白色隔板前后左端相对当前值均左移 2px；玻璃隔板坐标保持不变。
- 完成：双腔左腔白色隔板右端由 `685` 右移至 `687`，右腔白色隔板左端由 `740` 左移至 `738`；单腔白色隔板前后左端均在原坐标基础上左移 2px。玻璃隔板及右腔暗色内胆角坐标不变。
- 验证：新增单腔白色隔板左端和双腔材质端点断言；定向测试 9 passed。前端全量测试 222 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `side_by_side` 和 `top_freezer_single`，确认白色隔板端点变化且无溢出，控制台 0 error / 0 warning；截图：`output/playwright/fridge-white-shelf-final-side_by_side-390.png`、`output/playwright/fridge-white-shelf-final-top_freezer_single-390.png`。
- 未验证：真实最大格位密度、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户评审单腔与双腔白色隔板的端点关系。

### 2026-08-19 — 白色隔板端部暗线移除（本次会话）

- 状态：待评审。
- 目标：去掉白色隔板两端由全边缘投影滤镜产生的深色线，只保持现有上下方向的隔板几何、厚度和颜色关系。
- 范围：白色隔板 SVG 组的滤镜绑定和渲染契约；不修改隔板坐标、上下沿、玻璃隔板阴影、母版或门架。
- 设计/需求基线：用户指出白色隔板两端疑似存在深色边框，要求去掉两端深色边框，上下方向保持不变。
- 预期验证：白色隔板组不再使用全边缘 `shelf-shadow`；白色隔板上下沿坐标/厚度不变；玻璃隔板继续保留原阴影；独立测试页无溢出。
- 完成：移除白色柜体隔板 `<g>` 上的 `shelf-shadow` 滤镜，保留白色隔板原有透视多边形、上下表面渐变和向下前沿；玻璃隔板继续使用 `shelf-shadow`。
- 验证：新增渲染契约，确认白色隔板不挂全边缘滤镜且玻璃隔板仍挂滤镜；前端全量测试 223 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `top_freezer_single`、`side_by_side`，确认白色隔板两端暗线消失、上下方向未改变，控制台 0 error / 0 warning；截图：`output/playwright/fridge-white-shelf-no-side-shadow-top_freezer_single-390.png`、`output/playwright/fridge-white-shelf-no-side-shadow-side_by_side-390.png`。
- 未验证：真实食品内容遮挡、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户评审白色隔板端部边缘；后续保持白色隔板无全边缘投影规则。

### 2026-08-19 — 侧门隔板底部定向投影（本次会话）

- 状态：待评审。
- 目标：为侧门玻璃隔板和白色隔板增加仅位于下方的接触投影，保持左右两侧和上方无投影。
- 范围：门架 SVG 底边阴影路径、投影滤镜和渲染契约；不修改门架多边形、端点、材质、柜体隔板或冰箱母版。
- 设计/需求基线：用户要求侧门玻璃/白色隔板下方有投影，但左右和上方保持干净。
- 预期验证：每个门架只有一条下方定向阴影路径；门架组和多边形不挂全边缘滤镜；玻璃与白色门架均保留原边沿规则；独立测试页无溢出。
- 完成：门架新增独立底边阴影路径，沿底边下移 4px并使用窄向高斯模糊；阴影不挂在门架组或多边形上，因此不产生左右/上方投影。玻璃和白色门架共用该底边投影，原有玻璃下沿和白色上下沿保持不变。
- 验证：新增契约确认单门 5 个门架各有 1 条底边阴影，门架组不使用全边缘滤镜；前端全量测试 224 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 检查 `side_by_side`、`top_freezer_single`，确认底部有轻微接触投影、左右和上方无新增暗线，控制台 0 error / 0 warning；截图：`output/playwright/fridge-door-bottom-shadow-side_by_side-390.png`、`output/playwright/fridge-door-bottom-shadow-top_freezer_single-390.png`。
- 未验证：真实食品内容遮挡、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户评审侧门底部投影的强度和扩散范围。

### 2026-08-19 — 三门柜体/门侧腔体分格与中层竖框（本次会话）

- 状态：待评审。
- 目标：完善 `three_door` 拟物结构：中层增加中央竖框及两侧暗色渐变，上/中/下腔体之间使用单个白色分格，腔体内部使用玻璃；门侧按相同腔体边界规则渲染白色分格和玻璃分格。
- 范围：三门共享布局映射、拟物计划层柜体竖框/隔板材质、门分段材质、三门独立测试布局和回归测试；不修改单腔/双腔母版、其他模板的既有几何和主题。
- 设计/需求基线：用户指出三门中层存在竖向分格但当前未绘制；要求竖框使用双腔中框颜色并在两侧有暗色渐变阴影；要求上中下腔体之间及门侧不同腔体之间使用白色分格，腔体内部使用玻璃。
- 预期验证：三门柜体产生 1 条中层竖框及两侧阴影；柜体横隔板材质顺序体现内部玻璃、腔体边界白色；门侧每个分段的最后一个门架为白色，其余为玻璃；其他模板材质和分格数量不回归。
- 完成：三门布局新增 `cabinetDividers`，从中层 `single_row` 生成 1 条冰箱框色竖框，并在左右绘制渐变暗影。柜体分格材质改为按 `cabinetBands` 腔体边界判定，三门上中/中下边界为白色，腔体内部为玻璃；同一高度的多个横向格位先合并为一块完整隔板，避免中层白板重复或变短。门槽增加分段末位标记，三门门侧每个上/中/下分段的最后门架为白色，其余为玻璃；测试页三门改为三个独立门分段。
- 验证：新增三门计划断言，覆盖中层竖框数量、腔体边界白色/内部玻璃材质顺序和门侧 `glass, white, white, glass, white` 分段材质；定向测试 12 passed。前端全量测试 225 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 三门测试页确认中层竖框、两侧渐变阴影、两条完整白色腔体边界、内部玻璃和门侧分段材质，控制台 0 error / 0 warning；截图：`output/playwright/fridge-three-door-divider-materials-final-390.png`。
- 未验证：真实生产数据下三门门分段数量、食品内容遮挡、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户评审三门中层竖框宽度、阴影强度和门侧白色分格位置。

### 2026-08-19 — 三门隔板下沿与内容层起点校准（本次会话）

- 状态：待评审。
- 本次修正目标：将三门中层竖框下端从下方白色隔板的后沿改为其前沿下端；只调整竖框，不改变食品内容区的既有边界。
- 本次设计/需求基线：用户明确要求竖线下端落在下面隔板梯形上表面前沿（下边）的上端，而非后沿；上一次回复未实际写入代码，本次以源码和自动化断言为准完成修正。
- 本次预期验证：竖框底部 Y 值等于下方白色隔板 `frontEdge` 的 Y 值，且不影响内容热区、其他模板和既有隔板几何。
- 本次层级修正目标：中层竖框在视觉上覆盖下方白色隔板的前沿，而不是被其绘制层遮挡；仅调整 SVG 元素层级，不改变竖框几何、食品内容区或隔板材质。
- 本次层级完成：`CabinetDivider` 从柜体隔板循环之前移动到之后输出，因此竖框下端位于白色隔板前沿的前景层。先新增静态渲染断言复现旧顺序失败（竖框位置 1792 小于最后隔板位置 3420），再完成最小层级调整。
- 本次层级验证：定向计划/渲染测试 13 passed；前端全量测试 229 passed（27 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build` 与 `git diff --check` 均通过。Playwright 390×844 独立三门测试页确认竖框下端覆盖下方白色隔板前沿，控制台 0 error / 0 warning；截图：`output/playwright/fridge-three-door-divider-foreground-390.png`。
- 本次完成：`cabinetDividers` 的下端锚点由 `lowerShelf.rearEdge[0].y` 实际改为 `lowerShelf.frontEdge[0].y`；新增断言锁定竖框底部必须与下方白色隔板前沿对齐。
- 本次验证：定向计划测试 7 passed；前端全量测试 228 passed（27 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build` 与 `git diff --check` 均通过。Playwright 打开独立三门测试页，控制台 0 error / 0 warning；截图：`output/playwright/fridge-three-door-divider-front-edge-390.png`。
- 目标：修正三门中层竖框穿过上方隔板、以及分带内容贴着隔板上沿导致物品视觉上移的问题。
- 范围：三门柜体内容矩形和中层竖框的 Y 起止位置、相关回归测试和独立测试页；不改变母版整体坐标、单腔/双腔其他模板或门侧横向几何。
- 设计/需求基线：用户指出竖线应从上方白色隔板下沿向下延伸，且三门所有物品都向上偏移并跑到外框上；需要区分母版整体坐标与腔体边界厚度造成的内容层偏移。
- 预期验证：三门下方分带的内容起点在上一白色隔板下沿之后；中层竖框从上方白色板下沿开始，到下方白色板上沿结束；物品覆盖区不再覆盖隔板或外框；其他模板计划不变。
- 根因：不是拟物母版整体坐标偏移，而是三门分带把白色隔板的上沿当作下方内容的起点；中层竖框也直接从分带顶部开始，因而穿过上方隔板。之前没有把隔板透视面、白色前沿厚度和内容热区作为同一边界计算。
- 完成：新增隔板边界反算，三门下方 slot 生成 `contentY/contentHeight`，内容从上一隔板前沿下沿开始，并在下一隔板后沿前结束；上层首个分带保持原起点。中层竖框起点改为上方白色隔板下沿，终点改为下方白色隔板上表面，避免与两块横板交叉。
- 验证：新增三门内容覆盖区断言，确认中层/下层 `contentY > slot.y` 且高度收短；前端全量测试 225 passed（26 files），`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 三门测试页确认竖框从白色隔板下沿开始并在下方隔板前结束，控制台 0 error / 0 warning；截图：`output/playwright/fridge-three-door-divider-content-offset-390.png`。
- 未验证：真实食品数据下的图标视觉位置、最大物品密度、320/430px、Android/iOS 真机和卡通主题。
- 下一步：用户在真实三门数据下确认物品位置；若仍有个别物品偏移，继续调整内容区边界而不移动母版。

### 2026-08-19 — 宽体拟物冰箱原生中框母版生成（本次会话）

- 状态：待评审。
- 目标：停止使用单门母版切片拼接中框，改为以已验收的 Soft-3D 空冰箱母版为结构和材质参考，通过图像编辑模型生成一张原生带中央竖框的宽体双腔空冰箱背景。
- 范围：本轮先生成并视觉检查新的宽体透明位图候选；只包含柜体、左右空腔、中央竖框和左右对称开启的空门体，不烘焙横隔板、门架、抽屉、食品、文字或交互元素；候选通过前不覆盖单门母版、不替换正式运行时背景。
- 设计/需求基线：`frontend/src/assets/fridge/empty-fridge-soft3d-top-freezer-single.webp` 已验收母版；用户否决切片中框，明确要求由大模型在原冰箱基础上生成带中框分格的图。必须保持奶油白哑光材质、真实凹腔、现有视角与柔光，中央竖框应是柜体原生结构并在两侧形成圆角内框。
- 预期验证：候选图保持透明背景和完整轮廓；左右腔体均向内凹，中央竖框无拼接缝、重复高光或暗槽遮盖；左右门透视对称且向观察者打开；图中没有动态布局元素。通过视觉评审后再接入 `side_by_side` 和 `french_door` 的共享布局计划。
- 会话记录：已读取 1005×1227 RGBA 单门母版并确认其适合作为精确对象编辑输入。当前会话未暴露内置图像生成工具，因此复用项目此前已验证的 ImageGen CLI、Codex API Key 配置和 `gpt-image-2`，以高保真精确对象编辑方式生成宽体候选。接口忽略透明背景参数输出了近白实底，随后仅将背景编辑为绿色，并以边缘连通色键恢复真实 alpha。
- 完成：生成 1427×1102 RGBA 宽体空冰箱候选并压缩为 `frontend/src/assets/fridge/empty-fridge-soft3d-wide-double-door-v1.webp`。候选保留原母版的奶油白哑光材质和凹腔光影，柜体原生包含一根全高中央竖框及左右独立圆角内框；左右门体为空且对称向观察者打开，没有横隔板、门架、抽屉、食品、文字或品牌。后续已由“单腔/双腔拟物母版分层接入”任务正式接入宽体模板。
- 验证：`file`、Pillow 和 `sips` 确认候选为 1427×1102 RGBA PNG，alpha 范围 0–255，四角透明，色键后可见强绿色像素为 0；深色背景合成图 `output/imagegen/qa-wide-dark-final.jpg` 确认主体轮廓完整、无绿色边缘，中框无切片缝或暗槽。`git diff --check -- docs/progress-tracker.md` 通过。
- 未验证：尚待用户确认新母版的中框宽度、双门姿态和整体构图；未接入 `side_by_side` / `french_door`，未校准动态横隔板、门架和交互热区，也未执行前端测试、lint 或构建。
- 下一步：用户确认母版后，将其压缩为透明 WebP，并以新母版坐标重算宽体模板的左右腔、隔板、门架和热区；删除旧的运行时切片中框。

### 2026-08-19 — 拟物主题通用模板布局算法（本次会话）

- 状态：待评审。
- 目标：修复切换拟物主题后非 `top_freezer_single` 首页仍显示旧 DOM 的问题，建立由共享布局计划驱动的通用 Soft-3D 柜体、隔板、门板和门架映射算法。
- 范围：`fridgeIllustrationPlan`、拟物预览渲染器、主题切换后的正式首页/大预览、七种固定模板和动态增减隔板；不改变业务布局 API、Kindle 水墨屏渲染、卡通皮肤或图标变体。
- 设计/需求基线：用户确认的 Soft-3D 空冰箱母版和“同一拼接方法适配不同模板、隔板数量由布局决定”的要求；`docs/theme-system-requirements-and-design.md` §7.1–§7.4。
- 预期验证：主题切换为拟物后不再因模板键回退 DOM；模板计划可生成标准单门、宽体和迷你布局；隔板数量随布局槽位变化，柜体/门体热区与共享布局一致；前端测试、lint、生产构建、`git diff --check` 和 390px 独立视觉验证。
- 会话记录：已确认当前条件在 `FridgeLayout.tsx` 中把拟物硬限制为 `top_freezer_single`，计划函数也直接拒绝其他模板；因此用户切换主题后若当前冰箱不是该模板，首页没有任何变化。本轮将模板判断从皮肤入口移除，改由通用计划提供场景几何和动态隔板。
- 用户复核：`top_freezer_single` 保持正确，但上一版为其他模板临时绘制的渐变 SVG 外壳与已验收母版差距过大，不能作为同一拟物皮肤。用户要求把成功母版拆为柜体和门体切片进行拉伸拼接；对开门左门必须由右门连同门架严格镜像。
- 宽体复核：用户指出 `side_by_side` 和 `french_door` 缺少竖向中隔板；要求从 `top_freezer_single` 左侧外框裁切完整高度边框，在中心叠加原片与镜像片，使中隔板左右两侧都保留原母版圆角。
- 中隔板光影复核：用户指出原 `x=0..82` 左框切片包含左侧外圆角和侧沿高光，导致中柱偏厚；要求排除外圆角，并让中柱左侧内圆角直接取自母版右内框，保留柜体左右内沿不同的真实光影。
- 中隔板局部替换复核：上一版整条替换左右内沿移除了必要边框。用户确认中框右侧原版本正确；左侧也必须保留顶部/底部圆角及圆角右侧边框，只移除圆角左侧白色高光，并仅把上下内圆角之间的竖向中段替换为柜体右内框内壁。
- 中隔板凸角复核：用户指出 `x=500..580` 取到的是柜体最深处的暗色凹角；目标应为靠门相接位置的亮色凸角，并且替换片只能覆盖中框左侧边缘，不能遮挡中框中间原有亮色框体。
- 当前修正：保留完整单门母版；标准、迷你和多层模板复用完整母版并由共享计划改变隔板；宽体模板使用母版柜体切片横向拉伸、右门切片复用、左门及门架镜像，不再使用简化 SVG 外壳。
- 完成：移除拟物入口对 `top_freezer_single` 的模板硬限制；`createFridgeIllustrationPlan` 消费共享计划并动态生成柜体格位、隔板、一个或多个门平面、门架和热区。标准、迷你和多层模板复用已验收完整 Soft-3D WebP 母版；宽体模板从同一母版拼接横向拉伸的柜体片和右门片，左门连同门架由右门严格镜像。上一版简化渐变 SVG 外壳已删除。
- 中隔板完成：恢复上一正确版本的右侧半框，并用去掉左侧高光的 `x=41..82` 半片镜像恢复左侧顶部、底部圆角和圆角右侧边框；仅在两个内圆角之间的 `y=160..1040` 中段，以靠门位置的亮色凸角 `x=575..610` 覆盖左侧边缘。覆盖宽度由 34px 收窄为 18px，中框中间及右侧亮色框体保持不动。中柱仍在横隔板之后绘制，`side_by_side` 和 `french_door` 共用该结构。
- 验证：新增七模板计划、动态隔板数量、宽体六切片、左右门/门架镜像及“右半框保持、左中段窄幅亮凸角替换”测试；前端全量测试 222 passed（26 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 390×844 确认暗色凹角消失，左侧中段显示亮色凸边，中框中央亮条连续保留且页面无溢出；截图：`output/playwright/fridge-convex-divider-side_by_side-390.png`、`output/playwright/fridge-convex-divider-french_door-390.png`。
- 未验证：真实七模板生产数据的业务分区差异、卡通主题、主题图标变体、Android/iOS 真机和离线资产缓存。
- 下一步：用户评审切片后的对开门、法式门和标准模板；按真实模板需求继续校准柜体分区与门架数量。

### 2026-08-19 — 拟物主题正式场景接入（本次会话）

- 状态：待评审。
- 目标：将已通过视觉验收的 `top_freezer_single` Soft-3D 拼接皮肤接入拟物主题的正式单门操作场景，不再只依赖独立测试页。
- 范围：`FridgePreviewFrame` 的首页、创建、布局编辑和物品位置选择场景；保留缩略图及其他六种模板的 DOM 回退；补齐拟物预览中的分区选择交互和回归测试。不扩展卡通皮肤、不修改业务布局/API/数据库。
- 设计/需求基线：用户确认的空拟真冰箱母版、玻璃/白色隔板、固定右门透视及“空母版 + 数据叠加层 + DOM 交互热区”方案；`docs/theme-system-requirements-and-design.md` §7。
- 预期验证：拟物单门四个正式大预览场景使用同一 SVG/透明热区渲染器；编辑器点击格位仍能选中分区；缩略图和非目标模板继续使用 DOM；前端测试、lint、生产构建、`git diff --check` 及独立测试页视觉验证。
- 会话记录：当前渲染器已经被 `FridgePreviewFrame` 接入首页和创建预览，但 `editor/location` 仍使用旧 DOM，导致拟物主题在添加物品和编辑布局流程中断裂。本轮沿用已验收几何和材质，只扩大正式场景边界并补齐分区点击语义。
- 完成：`FridgePreviewFrame` 现在在拟物主题下为 `top_freezer_single` 的 `home`、`setup`、`editor`、`location` 四个大预览统一使用 `FridgeIllustrationPreview`；编辑器格位热区可将点击映射回原有分区回调，并按分区显示选中态。缩略图及其他模板继续使用 `OpenFridge` DOM 回退。
- 验证：新增正式场景和回退契约测试；前端全量测试 220 passed（26 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。独立测试页 `http://127.0.0.1:5173/fridge-illustration-test.html` 在 390×844 确认 URL 为测试页、renderer 为 `top_freezer_single`、API 请求数为 0、无溢出、上沿 1 条、下沿 5 条；截图：`output/playwright/fridge-illustration-theme-integrated-390.png`。
- 未验证：其他六种模板、卡通主题、缩略图高分辨率皮肤、真实 Android/iOS 设备。
- 下一步：用户评审正式首页、添加物品位置选择和布局编辑中的拟物视觉与交互；通过后再为其他模板准备对应空母版皮肤。

### 2026-08-19 — 单门拟物隔板独立视觉测试页（本次会话）

- 状态：待评审。
- 目标：提供只渲染单门拟物冰箱的独立测试入口，视觉验收不再启动完整应用首页、业务数据、安装提示或导航。
- 范围：新增 `fridge-illustration-test.html`、固定 `top_freezer_single` 测试布局和测试页样式；不替换产品首页，不修改业务 API/数据库。
- 设计/需求基线：用户要求视觉验收页不要反复弹出整个应用主页面；现有 `FridgeIllustrationPreview` 和拟物单门隔板方案。
- 会话记录：新增 `http://127.0.0.1:5173/fridge-illustration-test.html`，页面直接挂载 `FridgeIllustrationPreview`，固定使用玻璃、玻璃、白色、玻璃隔板顺序和门体边沿规则。
- 完成：独立页面不加载 `App`、不注册业务服务、不请求 `/api/`，保留产品首页 `/` 不变；补充 favicon，避免测试页控制台 404。
- 验证：Playwright 390×844 确认页面 URL 为测试页、`data-illustration-template=top_freezer_single`、API 请求数为 0、无横向溢出；截图为 `/Users/jason/projects/FridgeBoard/output/playwright/fridge-illustration-test-page-390.png`。前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。
- 未验证：真机、其他模板和卡通主题测试页。
- 下一步：后续视觉调整直接使用该独立测试页，不再使用完整首页作为验收入口。

### 2026-08-19 — 白色门架上下沿可见性回归修复（本次会话）

- 状态：待评审。
- 目标：按 `skeuomorphic-bottom-rack-lift-390.png` 参考版本恢复侧门最上面白色隔板的可见上沿和下沿；玻璃门架继续只保留下沿，所有门架不恢复左右竖边。
- 根因：此前只验证了门架路径数量，没有验证白色顶层两条横沿的视觉对比；同时白色门架上下沿使用接近门内胆的同色，路径存在但视觉上不可见，且多次在“所有门架加边”和“玻璃门架去边”之间修改，缺少按材质隔离的回归断言。
- 范围：白色顶部门架上下沿的颜色/对比度、门架边沿测试和独立测试页截图；不修改门架坐标、18px 最下层补偿、玻璃下沿和柜体材质。
- 预期验证：白色顶层有两条可见横沿，分别为亮色上沿和稍暗的奶油色下沿；玻璃层只有下沿；无左右竖边；前端测试、lint、生产构建、`git diff --check` 和独立测试页截图。
- 会话记录：已确认问题不是门架几何或斜率，而是白色门架两条边线没有材质级语义，且原先共用接近门内胆的浅色，导致路径存在但视觉不可见。本轮将白色门架上沿和下沿拆成独立 class，分别使用亮色高光和较暗奶油色阴影；玻璃门架继续只渲染下沿，门架 polygon 仍无左右描边。
- 完成：`DoorRack` 已明确渲染白色顶层上沿、白色顶层下沿和玻璃层下沿；新增静态渲染契约测试，防止后续调整玻璃门架时再次丢失白色顶层边沿。
- 验证：定向测试 6 passed；前端全量测试 219 passed（26 files）；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。独立测试页 `http://127.0.0.1:5173/fridge-illustration-test.html` 在 390×844 视口确认 URL 为测试页、API 请求数为 0、无溢出、上沿 1 条、下沿 5 条；计算样式分别为 `#fffef8 / 5px` 和 `#cfc6b8 / 4px`。截图：`output/playwright/fridge-illustration-test-top-rack-390.png`。
- 未验证：真实食品密度、Android/iOS 真机、其他模板和卡通主题。
- 下一步：请用户在独立测试页确认白色顶部门架的上沿/下沿明暗关系；确认后再继续处理其他视觉细节。

### 2026-08-19 — 隔板上表面亮度与门体上下沿规则纠正（本次会话）

- 状态：待评审。
- 目标：将柜体白色隔板上表面最亮端压暗到低于奶油白正面；恢复参考截图 `skeuomorphic-bottom-rack-lift-390.png` 对白色顶部门架的上下沿表现；其他侧门玻璃门架只保留下沿，所有门架不绘制左右竖边。
- 范围：白色隔板渐变末端、门架上/下沿条件渲染、相关测试和独立测试页截图；不修改隔板材质顺序、门架坐标、斜率补偿、母版、交互热区或产品首页。
- 设计/需求基线：用户明确指定的参考截图；用户本轮给出的“白色顶部门架上下沿、玻璃门架仅下沿、无左右边沿”规则。
- 预期验证：柜体上表面最亮色仍暗于前沿；门体路径为白色顶层上下沿加玻璃层下沿，无左右边沿；独立测试页无 API 请求和首页遮罩；前端测试、lint、生产构建、`git diff --check` 和 390px 截图。
- 会话记录：用户确认参考版本为 `output/playwright/skeuomorphic-bottom-rack-lift-390.png`，要求柜体白色隔板上表面最亮端仍暗于正面；门体白色顶层恢复上下沿，玻璃层只保留下沿，所有层无左右边沿。本轮按该规则修正。
- 完成：白色隔板上表面渐变末端从正面奶油白压暗为 `#e8e2d8`，保持前沿奶油白；门架改为白色顶层绘制上沿和下沿、玻璃层只绘制下沿，polygon 继续无描边。
- 验证：独立测试页 390px 确认 API 请求数为 0、无横向溢出、门架路径数为 6（白色顶层 2 条 + 4 层玻璃下沿），截图确认柜体上表面最亮端暗于正面且玻璃层无上沿；前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。
- 未验证：真实食品密度、Android/iOS 真机、其他模板和卡通主题。
- 下一步：完成亮度与门体边沿规则修正并交由用户评审。

### 2026-08-19 — 侧门门架斜率连续性校准（本次会话）

- 状态：待评审。
- 目标：保持侧门最上层和最下层门架当前已确认斜率，修正中间门架右端上抬量的突变，使各层随高度平滑过渡；倒数第二层右端相对当前版本再上调约 2 个母版像素。
- 范围：`fridgeIllustrationPlan` 的门架右端补偿曲线、相关单元测试和拟物单门 390px 视觉复核；不修改母版、柜体隔板、门架宽度/厚度、交互热区、其他模板或主题。
- 设计/需求基线：用户确认当前最上层与最下层斜率正确，倒数第二层右端仍偏低；现有门平面双线性映射负责基础斜率，额外右端上抬只补偿母版透视误差。
- 预期验证：顶部补偿保持 10px、底部保持 18px；中间补偿随归一化层高单调且平滑变化，倒数第二层约 12px；定向测试、前端全量测试、lint、生产构建、`git diff --check` 和 390px 截图。
- 会话记录：当前普通层统一上抬 10px、最下层单独上抬 18px，导致倒数第二层与底层之间存在 8px 跳变；本轮采用底部加权的连续曲线，而不是继续增加逐层硬编码特例。
- 完成：将门架右端补偿从“普通层固定 10px、最下层 18px”的突变规则改为按归一化层高计算的连续曲线 `10 + 8 × level⁵`；顶部保持 10px、底部保持 18px，五层测试布局的倒数第二层为约 11.9px，满足再上调约 2px 的要求。门平面双线性映射、右侧 1.08 倍厚度、门架宽度、玻璃材质和点击热区均未修改。
- 验证：新增断言覆盖首尾补偿、倒数第二层约 12px及各层补偿单调递增；前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。Playwright 390px 使用只读路由夹具确认 `data-fridge-renderer=illustration`、无横向溢出、透明热区 `box-shadow: none`；截图确认顶部/底部斜率保持不变，倒数第二层右端轻微上抬，底部前不再出现补偿突跳。
- 未验证：真实食品密度、Android/iOS 真机、其他模板和卡通主题。
- 下一步：用户评审门架层间斜率连续性；通过后继续单模板内容密度验收或扩展其他模板。

### 2026-08-19 — 玻璃与白色隔板材质校准（本次会话）

- 状态：待评审。
- 目标：将玻璃隔板调整为更白、更通透的冷白玻璃；将冷藏/冷冻分格用白色隔板的前沿加厚，并与冰箱框使用同色，使白色隔板和柜体框形成一体化结构。
- 范围：拟物单门隔板 SVG 材质与前沿参数、相关测试和 390px 视觉复核；不修改冰箱母版、门架透视、格位坐标、交互热区、其他模板或主题。
- 设计/需求基线：用户本轮材质反馈；现有 Soft-3D 奶油白哑光冰箱母版；当前白色隔板/玻璃隔板的透视四边形拼接方案。
- 预期验证：玻璃填充更接近白色且保持透明，后壁可见；白色隔板前沿明显比主体厚，颜色与冰箱框一致，视觉上与框相连；前端测试、lint、生产构建、`git diff --check` 和 390px 截图。
- 会话记录：用户要求玻璃板更白、更透明，白色隔板前沿更厚并与冰箱框同色、一体化表现；本轮调整 SVG 渐变、描边、不透明度和白色隔板前沿厚度。
- 完成：玻璃渐变由青灰色改为低不透明度冷白色，保留后壁可见性；玻璃边缘改为浅灰白。白色隔板主体调整为奶油白，前沿由 9px 加厚为 18px，并使用与冰箱框一致的 `#f5f1e8`，使隔板前沿与柜体框视觉连接。
- 验证：390px Playwright 截图确认玻璃板颜色更白且仍透明，白色隔板前沿明显加厚并与柜体框融合；前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。
- 未验证：真实食品密度、Android/iOS 真机、其他模板和卡通主题。
- 下一步：用户评审玻璃和白色隔板材质；通过后继续单模板内容密度验收或扩展其他模板。

### 2026-08-19 — 门体隔板材质与白色前沿结构校准（本次会话）

- 状态：待评审。
- 目标：同步侧门玻璃隔板的冷白高透明材质；将柜体白色隔板前沿改为只向下增厚的奶油白唇板，并让两侧与柜体框连接；移除侧门白色门架两端竖向描边，使其与门框融合。
- 范围：`fridgeIllustrationPreview` 和 `fridgePreview.css` 的隔板/门架材质与 SVG 结构、相关测试和 390px 视觉复核；不修改母版、门架坐标、斜率补偿、格位交互、其他模板或主题。
- 设计/需求基线：用户本轮反馈；现有柜体冷白玻璃渐变、奶油白冰箱框和固定透视门架计划。
- 预期验证：侧门玻璃门架整体变白且保持透明；柜体白色前沿不覆盖上方透视面、向下加厚并与框同色；侧门白色门架不再出现左右竖线；前端测试、lint、生产构建、`git diff --check` 和 390px 截图。
- 会话记录：用户指出上轮只调整了柜体玻璃，侧门玻璃仍使用旧的青灰 CSS；同时要求柜体白色隔板前沿向下增厚、侧边融框，侧门白色隔板取消两端竖道。本轮同步侧门 CSS 材质，并将柜体白色前沿改为向下展开的独立唇板。
- 完成：侧门冷藏玻璃门架改为白色半透明填充和冷白前沿；侧门白色门架 polygon 移除轮廓描边，只保留横向前沿，从而取消两端竖道。柜体白色隔板保留透视主体，新增同色奶油白下向唇板，前沿厚度为 18px，不覆盖上方倾斜透视面，两侧延伸到原有框边界。
- 验证：390px Playwright 截图确认侧门玻璃整体变白且保持透明，侧门白色隔板没有左右竖道，柜体白色前沿只向下加厚并与框色连接；前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。
- 未验证：真实食品密度、Android/iOS 真机、其他模板和卡通主题。
- 下一步：完成门体材质和白色前沿结构调整并交由用户评审。

### 2026-08-19 — 白色隔板上表面阴影与门体上下沿细化（本次会话）

- 状态：待评审。
- 目标：为柜体白色隔板的梯形上表面增加探入内胆的柔和阴影，去除两侧异色描边使其与冰箱框融合；侧门白色隔板保留少量上下沿，继续取消左右边沿。
- 范围：拟物单门 SVG 白色隔板与门架边缘绘制、相关测试和 390px 视觉复核；不修改母版、玻璃材质、门架坐标/斜率、前沿宽度、交互热区、其他模板或主题。
- 设计/需求基线：用户本轮反馈；现有奶油白柜体框、梯形透视隔板和无左右边沿的门体白色隔板。
- 预期验证：柜体白色梯形上表面可见后向内的阴影层次且两侧不出现异色边；门体白色隔板只显示轻微上沿/下沿，不显示左右竖边；前端测试、lint、生产构建、`git diff --check` 和 390px 截图。
- 会话记录：用户要求柜体白色隔板梯形上表面增加探入内胆的阴影，去除两侧异色边；侧门白色隔板保留少量上下沿，左右边沿继续取消。本轮增加后深前浅的白色上表面渐变，取消柜体白色隔板主体和前沿唇板描边，并为门架补充下沿。
- 完成：柜体白色隔板上表面使用 `soft-white-shelf-top` 渐变，在后部增加阴影、向前逐渐接近奶油白；主体和向下唇板不再绘制异色侧边。侧门门架 polygon 继续无描边，仅绘制横向上沿和下沿，保留少量上下厚度且左右边沿消失。
- 验证：390px Playwright 截图确认柜体白色隔板有内探阴影、两侧与框融合；侧门白色隔板保留上下沿且无左右竖边；前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。
- 未验证：真实食品密度、Android/iOS 真机、其他模板和卡通主题。
- 下一步：完成上表面阴影及门体上下沿调整并交由用户评审。

### 2026-08-19 — 单门隔板材质顺序与门体边沿回归（本次会话）

- 状态：待评审。
- 目标：按用户指定的从上到下顺序将柜体隔板调整为“玻璃、玻璃、白色、玻璃、玻璃”；侧门仅最上面的白色隔板保留上下沿，玻璃隔板取消上下沿，左右边沿全部保持无描边。
- 范围：拟物单门隔板材质序列、门架上下沿条件渲染和相关测试/390px 视觉复核；不修改母版、柜体/门架坐标、斜率补偿、透明热区、其他模板或主题。
- 设计/需求基线：用户本轮明确指定的柜体材质顺序；用户确认之前“最下层右端上抬 18px”版本的门架透视；现有奶油白隔板上表面阴影与无左右描边规则。
- 预期验证：柜体顶部两层变玻璃、第三层使用当前白色隔板结构、其余保持玻璃；侧门白色顶层有上下沿，玻璃层无上下沿，所有层无左右竖边；前端测试、lint、生产构建、`git diff --check` 和 390px 截图。
- 会话记录：用户指定柜体从上到下改为“玻璃、玻璃、白色、玻璃”，并要求侧门只有最上面的白色隔板保留上下沿，玻璃隔板恢复无上下沿状态。本轮将隔板材质从温度模式中独立出来，并按材质条件渲染门架边沿。
- 完成：`cabinetShelves` 现在明确输出 `glass, glass, white, glass` 材质序列；第三层复用奶油白上表面阴影和向下前沿结构，其余层使用冷白透明玻璃。侧门仅 `frozen` 顶层门架绘制上沿和下沿，`cold` 玻璃门架只保留透明填充，所有门架继续无左右描边；既有右端补偿曲线和最下层 18px 保持不变。
- 验证：新增材质顺序测试；Playwright 390px 确认柜体顶两层玻璃、第三层白色、其余玻璃，门架路径数量为 2（仅顶层白色隔板上下沿），无横向溢出；前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。
- 未验证：真实食品密度、Android/iOS 真机、其他模板和卡通主题。
- 下一步：完成材质顺序和门体边沿回归并交由用户评审。

### 2026-08-18 — 空拟真冰箱母版生成与模板拆分验证（本次会话）

- 状态：待评审。
- 目标：先生成并验收一张固定视角的空拟真冰箱母版，确认柜体是向内凹陷的真实空间，右门从合页向观察者方向打开且自由边更近、更大；母版通过后再拆分为柜体、门体和可叠加内容层。
- 范围：本轮先生产空冰箱位图资产并做视觉检查；母版不含隔板、分格、抽屉、门架、食品、文字、品牌或应用界面，不接入未确认资产，不修改后端/API/数据库。
- 设计/需求基线：用户本轮透视纠正意见；用户提供的 Soft-3D 参考图及“奶油 3D / 写实黏土拟物”提示词；固定视角、奶油浅米色哑光材质、柔和棚拍光、干净极简和透明背景要求。
- 预期验证：检查柜口外框、内侧壁和后壁构成清晰凹腔；右门合页位于柜体右侧，远离合页的自由边向观察者突出且视觉尺寸更大；整机无内部结构和食品，轮廓完整、背景透明、无文字水印。母版视觉通过后再制定切片和格位覆盖层。
- 会话记录：用户否决上一版 SVG 拼接结果，指出柜体被画成凸起结构，右门透视方向相反，整体质量明显低于参考图；决定停止在该 SVG 上修补，改为“高质量空冰箱母版 -> 资产拆分 -> 业务格位叠加”的流程。
- 本轮校准：用户确认继续生成玻璃隔板，并指出柜体横隔板左端正确、右端越过内胆外框，门架右端正确、左端未延伸到门框边沿；本轮保持两个已正确端点不动，只校正相反端点，并将柜体隔板改为随层高变化的透视四边形玻璃面。
- 本轮复核：用户指出柜体玻璃板上方的白色前沿高光没有必要且右端越过内边框，并指出侧门最下层门架的右端偏低、斜率与门内框底边不一致；本轮删除该装饰高光，仅抬高最下层门架右端，保持其余端点和交互区域不变。
- 再次复核：用户确认上轮删除对象错误；与玻璃前沿等长的高光应保留，应删除的是玻璃后沿上方的独立长白线。侧门不应只校正最下层，所有门架右端均需轻微上调；同时右侧前沿厚度应略大于左侧，以表达右侧更靠近观察者的近大远小关系。
- 根因定位：用户进一步指出残留长白线类似 `p7-food-cluster` 上下边。浏览器计算样式确认 cluster 本身无边框、背景和阴影，真正来源是父级 `.fridge-illustration-slot` 按钮继承拟物主题通用 `--control-shadow`：白色 inset 高光和外投影经门格位四边形 `clip-path` 裁剪后沿上下边显示，既越过玻璃板端点，也以原始格位斜率遮盖 SVG 门架，造成“右端反而下降”的错觉。本轮应取消冰箱透明交互热区的控件阴影，保留其 active 状态描边和现有 SVG 玻璃几何。
- 门架回归：用户指出此前“仅最下层右端上抬 14px”的版本最接近正确；改为所有层统一上抬 10px 后，最下层相对该版本实际下降 4px。本轮保留普通层上抬 10px，最下层以 14px 为基准再上抬 4px，即总上抬 18px；右侧 1.08 倍厚度和交互热区保持不变。
- 完成：使用用户提供的拟物参考图和 `gpt-image-2` 生成无隔板、无分格、无抽屉、无门架、无食品、无文字的空冰箱母版；母版采用真实凹腔结构，右门自由边朝观察者展开且视觉跨度大于合页边。因图片接口返回了绘制的 RGB 棋盘格，追加纯绿色背景编辑并以边缘色键生成真实 alpha，随后裁去无效透明边；运行时编码为 1005×1227 RGBA WebP。`FridgeIllustrationPreview` 改为母版底图承载柜体和门体透视，仅在其上按共享布局计划叠加白色/玻璃隔板、门架、食品内容和 DOM 点击热区；玻璃隔板现按层高生成独立透视四边形，越靠下可见纵深越大，并增加半透明顶面、前沿厚度和柔和投影。柜体隔板保持左端 `x=64`，右端收至 `x=594`；门架保持右端 `x=886`，左端延长至门框 `x=630`。玻璃前沿等长高光保留，删除后沿上方独立白线；普通门架右端上抬 10 个母版像素，最下层右端上抬 18 个母版像素，即在此前最接近正确的 14px 版本上再抬高 4px；右侧厚度为左侧的 1.08 倍。拟物主题通用按钮阴影明确排除 `.fridge-illustration-slot`，透明格位热区不再沿四边形上下边绘制越界白线和投影，active 状态描边及点击区域保持不变。仍只覆盖拟物 `top_freezer_single` 首页与创建预览，其他模板和场景保持 DOM 回退。
- 验证：Pillow、`file` 和 `sips` 确认中间母版为真实 RGBA、alpha 范围 0–255；最终 WebP 为 1005×1227 RGBA、约 38KB，低于 500KB 单模板预算。新增测试锁定隔板逐层纵深、柜体左右端点、门架左右端点、普通层右端上抬 10px、最下层上抬 18px、右侧厚度 1.08 倍及交互热区不继承拟物控件阴影；前端全量测试 218 passed（25 files）、lint、生产构建和 `git diff --check` 均通过。Playwright 使用只读路由夹具映射 `top_freezer_single`，既有 320/390/430px 均无横向溢出；本轮浏览器计算样式继续确认门格位 `box-shadow: none`，390px 截图确认最下层右端相对当前版本上抬 8px，其他层和长白线修复保持不变。
- 未验证：尚待用户确认本次母版造型和材质；未验证带真实食品内容时的遮挡密度、Android/iOS 真机、离线缓存、其他六种模板、卡通母版和主题图标变体。
- 下一步：用户评审本次玻璃隔板及端点校准；通过后以相同“空母版 + 数据叠加层”协议生产其他模板和卡通皮肤。

### 2026-08-18 — 单门模板拟物 2.5D 皮肤验证（本次会话）

- 状态：已终止（用户否决视觉方案）。
- 目标：按用户确认的资产驱动 2.5D 方案，为 `top_freezer_single` 验证 Soft-3D 拟物皮肤；柜体、内胆和边框合并表现，冷藏使用玻璃隔板、冷冻使用白色隔板，省略抽屉，右门及门架采用固定透视。
- 范围：主题冰箱预览渲染器、单门 2.5D 几何/皮肤、格位内容和交互覆盖层、相关前端测试与视觉验证；本轮不扩展其他六种模板、不实现卡通皮肤、不修改后端/API/数据库。
- 设计/需求基线：用户提供的 Soft-3D 参考图及提示词；2026-08-18 确认的“共享拼接器 + 主题皮肤”方案；`docs/ui-design-specification.md` §4.4、§9.1；现有 `fridgeLayoutCore` 唯一业务几何。
- 预期验证：单元测试覆盖单门柜体、隔板材质、门体/门架透视和 DOM 回退；前端全量测试、lint、生产构建和 `git diff --check`；Playwright 在 320/390/430px 检查拟物皮肤完整显示、无横向溢出、格位内容和点击热区对齐。
- 会话记录：用户明确否决纯程序化 Three.js 盒体视觉，并确认柜体/内胆/边框可合并、隔板简化为白色/玻璃、抽屉省略；门角固定，因此改用 SVG/透明图层与固定透视坐标，不再依赖运行时 3D 引擎。
- 完成：新增主题无关的 `fridgeIllustrationPlan`，从共享 `fridgeLayoutCore` 计划生成单门柜体矩形格位、固定透视右门四边形格位和合页；新增拟物 SVG 拼接器，使用奶油色合并柜体/内胆/边框皮肤、冷冻白色隔板、冷藏玻璃隔板、斜向门体、门架和软阴影，并以 DOM 矩形/多边形按钮承载格位内容和交互；仅在拟物首页/创建大预览且模板为 `top_freezer_single` 时启用，其他场景保持 DOM 回退；移除 Three.js 文件、依赖和锁文件记录。
- 验证：新增计划测试覆盖温区隔板语义、门格位四边形、合页和非目标模板拒绝；前端全量测试 215 passed（25 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 使用路由夹具把现有只读工作区映射为 `top_freezer_single`，未写入业务数据；320/390/430px 均确认 `data-fridge-renderer=illustration`、无横向溢出、柜体和门完整显示，并实际点击 `freezer-1` 进入“冷冻室 · 第 1 格”列表。
- 未验证：拟物食材图标变体尚未生产，当前仍使用水墨屏图标；尚未验证真实 `top_freezer_single` 业务数据、Android/iOS 真机、离线皮肤缓存、其余六种模板、卡通皮肤、editor/location/thumbnail 2.5D 场景和皮肤解码失败回退；setup 使用同一组件但尚未单独截图。
- 用户验收：用户指出柜体视觉为向外凸起而非凹腔，右门自由边反而缩小，形成向后翻门的错误透视；整体拟真质量与参考图差距过大，因此本方案不继续扩展。
- 下一步：由“空拟真冰箱母版生成与模板拆分验证”替代，先获得合格位图母版，再决定切片和格位覆盖实现。

### 2026-08-17 — 单门冰箱主题 3D 视觉优化（本次会话）

- 状态：已终止（用户否决视觉方案）。
- 目标：承接单门 Three.js Spike 的用户反馈，强化拟物/卡通冰箱的三分之四透视、真实门轴和门内层次，同时保持共享 `fridgeLayoutCore` 几何与格位交互不变。
- 范围：`frontend/src/fridgeScenePlan.ts`、`frontend/src/fridgeScenePreview.tsx`、`frontend/src/fridgePreview.css` 及相关回归测试；本轮不扩展七模板、不生产主题图标变体、不修改后端 API/数据库。
- 设计/需求基线：`docs/theme-system-requirements-and-design.md` §7.2、§7.4–§7.6、§12.1；`docs/ui-design-specification.md` §4.4、§9.1；`docs/final-ui-designs.md` 主题设计板与拟真/卡通概念图；用户已确认基础主题切换可用但门体缺少明显倾斜/三分之三视角。
- 预期验证：场景计划与投影契约测试、前端测试、lint、生产构建、`git diff --check`；使用本地浏览器检查拟物/卡通单门预览在桌面及 320/390/430px 下的非空 Canvas、完整 framing、门体透视和交互热区。七模板、真机和 context lost 仍不作为本轮已验证项。
- 会话记录：已确认当前 `rotation.y` 只作用于单个薄门盒，缺少门轴可见结构、门内胆/门架和柜体侧深度，导致门看起来像平面缩窄而非绕左侧合页打开；将新增主题无关的门轴/层次语义和投影参数，主题只提供材质与颜色。
- 完成：待实现。
- 验证：待实现。
- 未验证：待实现。
- 下一步：由 2026-08-18 的单门模板拟物 2.5D 皮肤验证替代，不继续扩展纯程序化 Three.js 方案。

### 2026-08-17 — 单门冰箱主题 3D 场景 Spike（本次会话）

- 状态：待评审。
- 目标：在不改变现有 `fridgeLayoutCore` 业务几何和格位交互的前提下，建立单门模板的主题无关 3D 场景计划，并为拟物/卡通预览接入可降级的 Three.js 渲染边界。
- 范围：`frontend/src` 场景计划、主题化冰箱预览适配、WebGL 初始化失败回退和前端回归测试；首轮只覆盖单门模板，暂不扩展七模板矩阵、主题图标变体、资产缓存或后端 API。
- 设计/需求基线：`docs/theme-system-requirements-and-design.md` §7、§10.2–§10.3；`docs/ui-design-specification.md` §4.4、§6、§8；`docs/final-ui-designs.md` 主题设计板与拟真/卡通概念图；现有 `frontend/src/fridgeLayoutPlan.ts` 和 `FridgeLayout.tsx`。
- 预期验证：场景计划单元测试覆盖单门分带、门轴、隔板和格位语义；主题渲染回退契约测试；前端测试、lint、生产构建和 `git diff --check`。Three.js 真实 WebGL 视觉、移动端性能和真机安全区暂不作为本轮已验证项。
- 会话记录：已确认现有共享布局计划可作为唯一业务几何来源；用户已明确授权本轮添加并安装 `three`，运行时继续复用同一计划，避免复制模板尺寸或在主题层重新推导分区。
- 完成：新增 `frontend/src/fridgeScenePlan.ts`，从现有 `createFridgeRenderPlan` 生成归一化柜体、单门、分区、格位、门深度、56° 门角和合页计划；新增 `fridgeScenePreview.tsx`，为拟物/卡通主预览懒加载 Three.js，使用程序化柜体、分区、格位、斜向门板、材质和光照；通过投影后的 DOM 按钮保留分区/格位语义；WebGL 初始化失败、模块加载失败或上下文丢失时回退现有 DOM；缩略图不创建独立 WebGL context；场景销毁释放几何和材质；添加 `three` 与 `@types/three` 依赖。
- 验证：新增场景计划测试覆盖单门纵向/横向格位、单门冷藏区门段、门深度、合页位置和宽体拒绝；前端全量测试 214 passed（25 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 在桌面和 390×844 视口确认拟物/卡通 `data-fridge-renderer=three`、画布 WebGL context 和非空像素（最终移动画布 300×397，非空像素 66220），并检查主题切换后画布截图。
- 用户验收：用户确认可以切换并看到拟物、卡通冰箱，基础功能验证通过；同时反馈当前视觉质量不足，冰箱门没有形成明显倾斜/三分之四透视感。该反馈作为本 Spike 的视觉缺口记录，不将本条标记为完整视觉验收通过。
- 未验证：尚未强制模拟 WebGL 初始化失败/上下文丢失；尚未完成 320/430px、真实 Android/iOS 设备、七模板 3D 矩阵、Three.js 性能预算、主题图标变体和离线资源 fallback 验收；宽体模板当前按 DOM 回退；门体透视、合页、门内胆和门架的视觉优化尚未完成。
- 下一步：先评审单门拟物/卡通视觉和交互命中，再扩展七模板 3D 矩阵；随后实现主题图标变体与离线资源 fallback。

### 2026-08-17 — PWA 与手机端主题基础设施（本次会话）

- 状态：进行中。
- 目标：承接已确认的三主题设计，完成主题类型/注册表、本机偏好持久化、React 挂载前首帧应用、共享语义令牌，以及“我的 → 应用偏好 → 主题设置”入口和即时切换。
- 范围：`frontend/src` 主题模块、共享 CSS 令牌、P7 设置导航和前端回归测试；保持水墨屏默认视觉、业务数据、冰箱几何和图标 API 不变，不在本轮实现 Three.js 冰箱或主题图标变体。
- 设计/需求基线：`docs/ui-design-specification.md` §4.4、§5–§6；`docs/functional-design-and-feasibility.md` §2.2；`docs/final-ui-designs.md` 的主题设计板；`docs/theme-system-requirements-and-design.md` §5、§6、§10.1。
- 预期验证：主题偏好默认/损坏值/持久化/首帧属性测试；主题设置页面静态契约；前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认现有“我的”页的“应用偏好”入口尚未接线，PWA 与 Capacitor 共用 `App.tsx`/`styles.css`；本轮采用版本化键 `fridgeboard-theme-v1`，主题属性写入 `<html data-theme>` 并同步运行时 `theme-color`，所有主题保留 `ink` 的业务状态语义和布局热区。
- 完成：新增 `frontend/src/theme.ts` 主题注册表与本机偏好模块，支持未知值回退、存储异常降级、订阅更新、首帧 `data-theme`/`color-scheme`/`theme-color` 应用；新增 `frontend/src/themeSettings.tsx`，接通“我的 → 应用偏好 → 主题设置”，三主题点击后即时切换并持久化；共享 CSS 增加 `ink`、`skeuomorphic`、`cartoon` 语义令牌和主题设置页响应式样式。
- 验证：主题单元测试与页面静态契约通过；前端全量测试 210 passed（24 files）、`npm run lint`、`npm run build`、`git diff --check` 均通过。生产构建产物包含首帧主题脚本和三主题样式。
- 未验证：尚未用 Playwright/真机检查 320/390/430px 主题设置页、系统安全区和主题切换视觉；Three.js 拟物/卡通冰箱、七模板 3D 矩阵、主题图标变体和离线资产 fallback 尚未实现。
- 下一步：先做单门模板的 `createFridgeScenePlan` 与 Three.js 技术 Spike，接入主题化冰箱预览并验证 WebGL 回退；随后扩展七模板和分类图标变体。

### 2026-08-17 — 修复主题基础设施审查中的两个 P1（本次会话）

- 状态：待评审。
- 目标：修复代码审查发现的旧页面固定颜色未接入主题令牌、卡通主题全局圆角覆盖既有控件形状两个问题；明确不修改既有全局焦点隐藏规则。
- 范围：`frontend/src/styles.css` 主题令牌和固定颜色引用、卡通主题控件覆盖、对应前端回归测试；不实现 P2 焦点显示，不修改业务流程、主题持久化或 3D/图标变体。
- 设计/需求基线：`docs/ui-design-specification.md` §4.4、§6、§10；本次代码审查结论；现有 P5/P7/P9/P7.1 页面控件形状和状态语义。
- 预期验证：三主题固定颜色契约、卡通主题保留圆形/胶囊控件形状；前端测试、lint、生产构建和 `git diff --check`。
- 会话记录：已确认旧版流程和 P5/P9/P7.1 选中态仍有固定背景、边框和文字色，且卡通主题的 `[data-theme="cartoon"] button` 覆盖会把 `.p7-switch`、圆形通知按钮等既有形状改成 10px 圆角；本轮仅修复这两个 P1，保留全局 `:focus`/`:focus-visible` 隐藏规则。
- 完成：新增 `surface-muted`、`surface-selected`、冰箱轮廓/填充和温区语义令牌；为旧启动、配对、设备、冰箱预览、库存选中、食谱周切换和 P7.1 提示等选择器增加拟物/卡通主题令牌覆盖；移除卡通主题全局按钮圆角规则，既有圆形/胶囊控件继续由自身选择器控制形状。
- 验证：前端全量测试 211 passed（24 files）、`npm run lint`、`npm run build` 和 `git diff --check` 均通过；新增主题颜色/控件形状契约测试。未修改 P2 焦点显示行为。
- 未验证：尚未用 Playwright 或真机逐页检查三主题的最终视觉差异；Three.js 冰箱、主题图标变体和离线资源 fallback 仍未实现。
- 下一步：完成三主题 320/390/430px 视觉验收；再进入单门模板 Three.js 场景 Spike。

### 2026-08-17 — PWA 与手机端主题系统需求分析及设计（本次会话）

- 状态：视觉方向已确认，3D 冰箱概念资产已生成，待 3D 实现。
- 目标：为 PWA 与 Capacitor 手机端设计“水墨屏、拟物、卡通”三套主题，覆盖“我的”页面入口、应用壳视觉、冰箱布局和分类图标；先完成需求、资产规范、数据模型、接口、迁移、缓存及验收设计，不修改应用代码。
- 范围：现状审计、主题偏好边界、三主题视觉语义、内置及自定义图标变体、冰箱程序化 3D 渲染、离线缓存、兼容迁移和测试计划；冰箱显示设备/Kindle 主题切换及完全自由冰箱结构暂不纳入首期。
- 设计/需求基线：用户本次需求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §16–§17.1；`docs/final-ui-designs.md`；现有 `FridgeLayout`/`fridgeLayoutCore`、分类目录、图标服务和运行时资产缓存。
- 预期验证：核对现有代码与数据库边界；产出独立需求与技术设计提案；执行文档格式和差异检查，不执行应用测试、构建或视觉核验。
- 会话记录：已确认手机 PWA 与 Capacitor 共用 React 页面；“我的”页已有未接线的“应用偏好”入口；冰箱几何由手机与 Kindle 共用的 `fridgeLayoutCore` 生成；当前 46 个内置分类图标均只有一个 SVG 版本，自定义图标按冰箱保存一个透明 PNG；现有 `IconAsset` 仍是一条逻辑记录对应一个文件。
- 完成：新增 `docs/theme-system-requirements-and-design.md`，定义三主题范围、主题设置交互、受控视觉例外、七种现有冰箱模板的 3D 渲染、138 个内置图标变体矩阵、自定义图标 fallback、逻辑图标/主题变体数据模型、API、迁移、缓存、性能预算、测试矩阵和分阶段实施顺序。
- 阶段一验证：对照 `backend/fridgeboard/layouts.py` 确认现有产品固定支持七种模板；使用 `jq` 确认目录有 46 个内置图标和 46 个内置小类；`git diff --check` 通过。阶段一只修改设计文档，未运行应用测试、lint、构建或视觉核验。
- 产品确认：2026-08-17 用户确认“按推荐方案”；主题按本机保存、仅覆盖 PWA/Capacitor、作用于整个手机应用、首期只支持七种固定模板，Kindle 保持水墨屏。
- 本轮范围：同步功能设计和 UI 规范；制作“我的/应用偏好/主题设置/首页”三主题本地 HTML 与 PNG 视觉基线；不修改应用代码、API 或数据库。
- 视觉阶段预期验证：HTML 语法与文档差异检查；使用 Playwright CLI 导出并检查设计板截图；3D 冰箱和 92 个新增图标变体另行设计与生产。
- 本轮完成：更新 `docs/functional-design-and-feasibility.md` 与 `docs/ui-design-specification.md`，将确认边界升级为项目规则；新增 `docs/ui-assets/proposals/theme-system-design.html` 和 1700×1923 PNG，使用 8 个 390×844 页面展示设置入口、三主题选择和同构首页。
- 本轮验证：Playwright CLI 通过本机 HTTP 服务加载设计板，最终控制台 0 errors/0 warnings；8 个顶部标题相对页面中心误差均为 0px；人工检查截图未发现裁切、文字溢出或控件重叠；`file`/`sips` 确认 PNG 为 1700×1923。文档和设计资产执行 `git diff --check`。
- 视觉阶段未验证：当时未生成或核验 3D 冰箱与 92 个新增内置图标变体；未修改应用代码，因此未运行后端/前端测试、lint 或构建；320px/430px 响应式属于实现阶段验收，方向稿按冻结的 390×844 基准制作。
- 视觉确认：2026-08-17 用户确认八屏视觉设计稿，并确认需要继续使用 `gpt-image-2` 生成冰箱概念资产。
- 方案调整：用户指出九切片无法表达斜向打开冰箱门的真实 3D 透视；拟真与卡通冰箱主体改为 Three.js 程序化 3D，生成图片只用于材质、光照和造型方向，不承担布局几何、透视映射或点击命中。
- 本轮预期验证：更新冻结设计注册表和主题技术设计；使用 CLI/`gpt-image-2` 生成拟真概念图并派生同构卡通概念图；检查透明背景、构图、门角度、内部可见性和文件属性。
- 本轮完成：`docs/final-ui-designs.md` 已登记八屏 HTML/PNG 为冻结视觉基线；主题技术设计改为共享布局计划 + Three.js 程序化 3D，定义正交相机、合页轴、52–60° 开门、动态隔板、图标平面、投影可访问按钮、按需渲染、缩略图共享 renderer 和 WebGL 降级。
- 模型调用：沿用 Codex 配置中的 `https://cpa.flycn.fyi/v1`，使用 `gpt-image-2` 生成拟真图，再以同一图片做高保真卡通编辑；两次请求均成功。
- 本轮完成：拟真图输出 1086×1448 RGBA；卡通编辑输出 1087×1447，原始响应为棋盘格 RGB，已通过边缘连通背景清理生成透明 RGBA；两张图已复制到 `docs/ui-assets/proposals/theme-concepts/`。
- 本轮验证：`file`、`sips` 和 Pillow 确认两张最终参考图均为 PNG RGBA 且 alpha 范围包含透明与不透明像素；人工检查确认整机、右门、上下合页、五层隔板和四层门架完整可见。未改用其他模型。
- 本轮未完成：概念图尚不用于运行时，Three.js 方案尚未进入应用实现；未安装项目依赖或运行应用测试。
- 下一步：以两张概念图校准拟物/卡通材质令牌，进入单门模板的 `createFridgeScenePlan` 与 Three.js 技术 Spike；随后再扩展七种模板和分类图标变体。

### 2026-08-17 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD` `dd81b71` 发布到生产服务器，生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：当前提交对应的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；工作区当前无未提交改动。
- 设计/需求基线：本次用户发布请求；项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`README.md` 发布流程；`scripts/deploy-image.sh`。
- 预期验证：后端 Ruff/pytest/锁文件检查、前端 lint/test/build、部署脚本语法检查与 dry-run、远端容器健康检查、HTTPS `/healthz` 和发布 release 核对。
- 会话记录：已确认工作区干净、`HEAD` 为 `dd81b71`，不需要自动提交未提交改动；发布脚本使用 `root@107.174.152.245:/opt/fridgeboard` 完成归档传输和远端重建。
- 完成：发布提交 `dd81b71`，生成 release `260817005933`；生产容器重建成功并保持 `running/healthy`，镜像 ID 为 `sha256:ceeb9b5186523eea6f7fe2b5548a75ca568dedae9b3ec26e6323bdb823a640fb`；数据库备份为 `/data/fridgeboard.db.backup-20260816-165941`，权限为 `600`，大小为 `1110016` 字节。
- 验证：`uv run ruff check backend`、`uv run pytest`（161 passed，52 条既有依赖弃用警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（203 passed，22 files）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、`git diff --check` 均通过；公网 `/healthz` 返回 `{"status":"ok"}`；容器重启次数为 0，容器内前端产物确认包含 release `260817005933`。
- 未验证：尚未在真实 PWA、Android/iOS 真机完成本次发布涉及功能的人工验收；发布构建过程输出了 macOS 扩展属性 tar 警告，但归档和容器构建均成功，未发现伪迁移文件。
- 下一步：在真实 PWA、Android/iOS 真机清除旧资源或安装最新包，验收首次未登录首页、移动登录回调、图标离线缓存和冰箱排序拖动流程。

### 2026-08-16 — 我的冰箱列表改进排序拖动入口（本次会话）

- 状态：待评审。
- 目标：将“我的冰箱”列表的排序操作从整行长按改为左侧竖条把手或冰箱布局缩略图立即拖动，降低部分设备上的长按响应延迟和误触成本。
- 范围：`frontend/src/App.tsx` 的冰箱列表拖动事件与可访问语义、`frontend/src/sharedUi.tsx` 的下拉刷新触摸隔离、`frontend/src/styles.css` 的 P7.1 列表行布局和拖动状态、前端相关回归测试；不改变冰箱排序规则、本地持久化键、打开冰箱和冰箱设置操作。
- 设计/需求基线：用户已确认的竖条把手方案；`docs/ui-design-specification.md` §4、§6.2、§7、§8；`docs/fridge-management-requirements-and-ui.md` §4.1、§6.1；`docs/final-ui-designs.md` P7.1 本地确认材料；390×844px 视觉基线并兼顾 320px 与 430px 宽度。
- 预期验证：新增或调整拖动入口回归测试；运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test`、`npm run --prefix frontend build` 和 `git diff --check`；不自动执行真实设备或 Playwright 视觉核验。
- 会话记录：已确认当前 `FridgeSwitcher` 在整行 `article` 上注册 Pointer 事件，并在 350ms 后进入拖动；已确认用户要求把手和冰箱布局图标均可立即拖动，文字区域仍打开冰箱，设置按钮保持独立。用户反馈单根竖条视觉不佳，且上下拖动会触发页面下拉刷新；根因是共享 `PullToRefresh` 未排除排序热区。
- 本轮会话：用户反馈六点抓手两侧空白过大；当前 SVG 画布为 24px、点阵可见宽度约 12px，需将可见图形左右留白收窄至接近点间距，不改变 48px 触摸热区。
- 完成：移除整行长按计时器；左侧竖条把手和冰箱布局缩略图在 Pointer 按下时立即进入拖动；拖动中的行保留半透明虚线状态和上下插入线；文字区域打开冰箱，设置按钮保持独立；320px 以下将把手/缩略图列收缩为 40px/48px。
- 补充完成：将单根竖条改为两列三行六点抓手；给把手和布局缩略图增加下拉刷新忽略标记，`PullToRefresh` 在触摸开始时跳过排序热区，避免上下拖动触发页面刷新。
- 本轮完成：将六点抓手 SVG 画布从 24px 收窄为 20px，点阵左右可见留白约 4px，与点间距保持一致；48px 把手触摸热区不变。
- 本轮补充完成：把手和冰箱缩略图合并为 76px 的左侧紧凑拖动区域，左边界到左点、两点之间、右点到冰箱图标均按约 4px 对齐；排序区域整体仍保持至少 48px 高的触摸范围。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（107 passed）、`npm run --prefix frontend test -- --run`（203 passed，22 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Android/iOS 设备或 320/390/430px 视口人工验证手指按住把手、缩略图拖动、滚动冲突和设置按钮误触；未执行 Playwright 视觉核验。
- 下一步：评审时在手机设备确认两处拖动热区的触摸响应、拖动到列表首尾及短列表状态；确认后将本条状态改为完成。

### 2026-08-16 — 排查移动端退出确认与 SSO 重复回调（本次会话）

- 状态：待评审。
- 目标：阻止手机端“切换登录账号”误触即退出；当 SSO 回调或移动登录兑换失败时展示用户友好页面，不向用户暴露 JSON 源码；确认生产日志中的“授权码无效”是否由真实超时导致。
- 范围：生产认证日志、FridgeBoard 移动登录回调、Capacitor 登录错误呈现、“我的”页确认弹窗和相关回归测试；不改变账号身份源、PKCE、一次性授权码和移动专属回调 URI 协议。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §8.2–§8.2.1；`frontend/src/App.tsx`、`frontend/src/mobileAuth.ts`、`backend/fridgeboard/main.py`；RFC 8252 原生应用 OAuth 外部用户代理登录约束。
- 预期验证：覆盖重复 SSO 回调、回调 HTML 错误页、移动登录错误状态和退出确认；运行后端/前端相关测试、Ruff/lint/build 与 `git diff --check`；记录生产日志时间线、未验证的真实设备行为和 SSO 最佳实践取舍。
- 会话记录：已读取生产 `fridgeboard-app` 日志。`13:28:05Z` 发起移动登录，`13:30:27.958Z` 首次 `/api/auth/callback` 调用 flycn token 接口返回 `200` 并完成 `303`，`13:30:28.242Z` 同一授权码再次回调并返回 `401`；登录起始到首次成功回调约 142 秒，未超过 FridgeBoard 5 分钟事务窗口，根因是重复回调消费一次性授权码而非超时。已在回调错误、参数校验和未处理异常路径返回不暴露原始 JSON 的 HTML 友好页；移动 App 启动阶段保留友好错误提示；“切换登录账号”需先确认，取消不会退出；移动回调消费增加单飞保护，避免 App 内重复事件并发兑换。
- 完成：代码和回归测试已完成，未执行生产发布。
- 验证：认证/配对专项测试 `28 passed`；后端全量 `uv run pytest -q` 为 `161 passed`；前端全量测试 `203 passed`（22 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Android/iOS 设备确认 Custom Tab/系统浏览器是否仍产生重复 HTTP 回调、首次登录、取消切换和错误页回跳；当前生产仍运行旧版本，需按发布规则发布后再复测。
- 下一步：评审通过后发布 FridgeBoard，在 Android/iOS 真机分别验证正常登录、不到 5 分钟完成登录、重复回调、取消确认和错误恢复；若重复回调仍出现，继续将 flycn/FridgeBoard 回调链路改为可幂等的标准 OAuth 授权端点。

### 2026-08-16 — 发布图标持久化缓存修复（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前工作区未提交的图标持久化缓存修复自动提交并发布到生产服务器。
- 范围：提交当前未提交改动；执行后端/前端质量门禁；通过 `scripts/deploy-image.sh` 生成 release、备份生产 SQLite、重建容器并完成容器与 HTTPS 健康检查。
- 设计/需求基线：用户本次明确要求“没有发布就自动提交未提交的改动，然后发布”；当前图标缓存修复记录；`README.md` 发布流程；`scripts/deploy-image.sh`。
- 预期验证：提交前质量门禁、Git 提交、生产容器 `healthy`、公网 `/healthz` 正常，并记录 release、镜像摘要和数据库备份路径。
- 会话记录：已确认 `HEAD` 为 `ae1f956`，工作区存在未提交前端改动；本次按用户授权自动提交后发布，不创建分支。图标缓存代码已由提交 `8b31737` 纳入当前历史，本次发布记录由提交 `9b8cacc` 补齐。
- 完成：正式发布当前 `HEAD`，生成 release `260816191731`；生产容器重建成功，镜像标识为 `sha256:c47e8dbb...60b32a`；数据库备份为 `/data/fridgeboard.db.backup-20260816-111739`，权限为 `600`，大小为 `1110016` 字节。
- 验证：`uv run ruff check backend`、`uv run pytest`（160 passed，52 条既有依赖弃用警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（202 passed，22 files）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、`git diff --check` 均通过；公网 `/healthz` 返回 `{"status":"ok"}`；生产容器为 `running/healthy` 且重启次数为 0；容器内前端产物已包含 release `260816191731`。
- 未验证：尚未在真实 PWA、Android 真机和 iOS 真机清除网络后确认页面切换及 App 重启流程；若系统主动清理 WebView 的 Cache Storage，仍需重新在线加载。
- 下一步：安装最新 APK/IPA，在线打开首页并等待图标全部显示，再断网切换首页、食谱、库存并重启 App 验证；PWA 同样验证刷新和离线启动后将本条状态转为完成。

### 2026-08-16 — 购物清单缺货项目增加分类图标（本次会话）

- 状态：待评审。
- 目标：让手机端购物清单中的每个缺货项目在名称前显示与食谱页面一致的分类图标，提升清单扫描辨识度。
- 范围：`frontend/src/RecipeWorkspace.tsx`、`frontend/src/styles.css`、购物清单前端回归测试和本进度记录；复用现有库存物品名称到分类图标的匹配逻辑，不改变缺货计算、数量、复制内容、自定义购物项或页面壳。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §7–§8；`docs/functional-design-and-feasibility.md` §9.3；冻结草稿 `903728d2-d6b9-4918-82b5-9d3ab6b3aafb` 及本地 `docs/ui-assets/png/pwa-restock-list.png`、`docs/ui-assets/html/pwa-restock-list.html`。
- 预期验证：购物清单图标渲染回归测试、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；不自动执行真实设备或 Playwright 视觉验收。
- 会话记录：已确认 `RecipeIngredientList` 通过库存 `item_name` 反查 `icon_key`，而 `RestockMissingLine` 当前只输出纯文本；将把同一匹配逻辑接入购物清单，并为每个缺货项目增加独立的图标和文本节点。
- 完成：购物清单每道食谱的缺货项目复用食谱页的库存名称到分类图标匹配逻辑；有匹配图标时在项目名称前显示 20px 图标，项目仍在同一道食谱的一行内并保留数量和中文逗号分隔。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（106 passed）、`npm run --prefix frontend test -- --run`（202 passed，22 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 PWA、Android/iOS 真机或 320/390/430px 视口执行购物清单视觉验收；名称没有对应库存图标的自定义购物项仍不显示分类图标，未改变其现有自由文本语义。
- 下一步：在评审设备打开包含多个缺货项目和自定义购物项的购物清单，确认图标与名称对齐、长名称换行不溢出；确认后将本条转为完成。

### 2026-08-16 — 修复图标持久化缓存未生效导致的断网加载失败（本次会话）

- 状态：待评审。
- 目标：让 PWA、Android 和 iOS 在图标首次在线加载后，从持久化缓存读取图标；页面切换、App 重启和断网时不重复请求已缓存图标。
- 范围：前端图标 Cache Storage 持久化读写、PWA Service Worker 缓存保留策略、PWA/原生共用图片组件、认证上下文清理和回归测试；不改变图标接口、资源版本参数和业务页面缓存。
- 设计/需求基线：用户本次反馈；现有 `frontend/src/runtimeAssetCache.ts`、`frontend/src/sharedUi.tsx`、`frontend/public/sw.js`、`frontend/src/pwaCache.ts` 和认证/设备切换生命周期。
- 预期验证：覆盖持久化缓存命中、离线读取、缓存未命中联网加载和认证上下文清理；运行前端测试、lint、生产构建、Android Debug 构建、iOS Simulator 构建和 `git diff --check`。
- 会话记录：已确认上一轮只增加了进程内 Blob URL 缓存，App 重启或 PWA Service Worker 未命中后仍会重新请求；本轮改为 PWA 与 Capacitor 共用 `fridgeboard-icons-v1` 持久化 Cache Storage，缓存命中先于网络加载，并防止 Service Worker 更新或“刷新应用”误删该缓存。启动认证网络异常不再被误判为未登录，避免离线启动时清理本地数据和图标缓存。
- 完成：PWA 和 Android/iOS 均通过 `RuntimeImage` 读取持久化缓存；首次成功加载后写入图标缓存，后续页面切换、App 重启和断网优先读取缓存；明确 401、退出账号和设备切换仍会清理认证上下文资源。
- 验证：新增持久化缓存命中、断网读取和首次写入测试；前端全量测试 202 passed（22 files）、lint、生产构建、Android Debug APK 构建、iOS Simulator Debug 构建和 `git diff --check` 均通过。
- 未验证：尚未在真实 PWA、Android 真机和 iOS 真机清除网络后确认页面切换及 App 重启流程；若系统主动清理 WebView 的 Cache Storage，仍需重新在线加载。
- 下一步：安装最新 APK/IPA，在线打开首页并等待图标全部显示，再断网切换首页、食谱、库存并重启 App 验证；PWA 同样验证刷新和离线启动后将本条状态转为完成。

### 2026-08-16 — 缓存原生 App 图标资源，避免页面切换重复加载（本次会话）

- 状态：待评审。
- 目标：让 Android/iOS 原生 App 在首页、食谱、库存等页面之间切换时复用已经认证加载的分类图标，避免每次组件重新挂载都重新请求全部图片。
- 范围：原生图片 Blob URL 的进程内缓存、并发请求合并、Owner 会话退出和日常设备切换时的缓存清理、相关回归测试；不改变图标 API、资源版本参数和 PWA Service Worker 缓存策略。
- 设计/需求基线：用户本次反馈；当前 `frontend/src/sharedUi.tsx` 的 `RuntimeImage`、`frontend/src/appApi.ts` 的原生图片请求和 `frontend/src/secureSession.ts` 的会话/设备切换生命周期。
- 预期验证：覆盖同一图标重复读取只发起一次请求、缓存命中复用 Blob URL、缓存清理释放资源；运行前端测试、lint、生产构建、Android Debug 构建、iOS Simulator 构建和 `git diff --check`。
- 会话记录：已确认页面数据缓存正常，重复请求来自 `RuntimeImage` 每次挂载都会用 `cache: 'no-store'` 拉取图片并在卸载时释放 Blob URL；已新增共享资源缓存，可保留已认证图片并合并并发请求，账号退出和设备切换时主动清理。
- 完成：同一资源 URL 在当前 App 进程内只请求一次并复用 Blob URL；带 `?v=` 的资源版本变化使用新缓存键；退出 Owner 会话、设备凭证失效或切换日常设备会释放旧 Blob URL。
- 验证：新增图标缓存复用/释放测试；前端全量测试 200 passed（22 files）、lint、生产构建、Android Debug APK 构建、iOS Simulator Debug 构建和 `git diff --check` 均通过。
- 未验证：尚未在真实 Android/iOS 设备通过网络面板人工确认首页—食谱—首页切换不再产生图标请求；App 完全退出后重新启动会重新加载图标，属于当前进程内缓存的预期行为。
- 下一步：在真机安装新包，连续切换首页、食谱、库存并观察图标请求；确认无重复请求后将本条状态转为完成。

### 2026-08-16 — 修复 Android/iOS 原生 App 分类图片不显示（本次会话）

- 状态：待评审。
- 目标：修复 Android APK 与 iOS App 中所有受保护分类图标无法显示的问题，并确认 PWA、Android、iOS 使用同一套图标加载逻辑时不回归。
- 范围：前端原生运行时图标资源请求、分类/库存/食谱图标显示组件、Android/iOS 共用 Capacitor WebView 行为和回归测试；不改变图标资产权限、API 路径或 PWA Service Worker 策略。
- 设计/需求基线：用户本次反馈；`frontend/src/runtime.ts`、`frontend/src/appApi.ts`、`frontend/src/sharedUi.tsx`；Owner/Device Bearer 认证约束；Android/iOS 共用的 Capacitor 前端产物。
- 预期验证：补充原生受保护图片请求回归测试，运行前端测试、lint、生产构建、Android Debug 构建、iOS Simulator 构建和 `git diff --check`；真实 Android/iOS 设备图片显示仍需人工验收。
- 会话记录：已确认图标列表接口返回的图片地址指向需要 Owner/Device Bearer 的 API 路由；原生 `<img>` 请求无法携带 `Authorization`，因此 Android 与 iOS 均会加载失败，而 PWA 同源 Cookie 不受影响。已新增统一原生资源读取函数和 `RuntimeImage`，原生先使用当前 Owner/Device Bearer 获取 Blob URL，PWA 继续直接使用同源 URL；分类选择器、库存图标、食谱图标和自定义图标候选均已切换。
- 完成：未修改后端图标权限和 API 路径；Android 与 iOS 共用的 Capacitor 前端产物均已包含修复。
- 验证：原生受保护图片契约测试确认请求携带 `Authorization: Bearer owner-token`；前端全量测试 198 passed（21 files）、lint、生产构建、`git diff --check`、Android Debug APK 构建和 iOS Simulator Debug 构建均通过。
- 未验证：尚未在真实 Android APK 和 iOS 真机登录后打开分类选择器、库存、食谱和自定义图标页面进行图片显示人工验收；未验证网络中断、令牌过期时的人工恢复体验。
- 下一步：在 Android/iOS 真机安装新包并完成登录，确认所有分类图标和自定义图标显示；通过后将本条状态转为完成。

### 2026-08-16 — 修复空免登录配置误判为已登录（本次会话）

- 状态：已完成，待真实设备验收。
- 目标：修复生产环境 `FRIDGEBOARD_LOCAL_OWNER_USER_ID` 为空字符串时，`/api/auth/status` 错误返回 `authenticated: true`，导致新安装 App 直接显示“我的冰箱”而没有“登录或注册”按钮的问题。
- 范围：认证状态判断、空配置回归测试、生产发布和匿名接口验收；不改变 SSO、PKCE、移动令牌或局域网免登录的有效配置行为。
- 设计/需求基线：用户本次反馈；`backend/fridgeboard/main.py` 的 `authentication_status` 与 `configured_local_owner` 解析逻辑。
- 预期验证：空字符串配置返回未认证，非空局域网所有者仍返回已认证；运行后端测试、前端回归检查并发布后验证生产 `/api/auth/status`。
- 会话记录：已通过生产匿名请求确认 `/api/auth/mode` 返回 `sso` 但 `/api/auth/status` 返回 `authenticated: true`；根因为认证状态分支使用 `configured_local_owner is not None`，与模式分支的真值判断不一致。
- 完成：统一规范 `FRIDGEBOARD_LOCAL_OWNER_USER_ID` 空值，空字符串不再绕过 SSO；新增匿名认证状态回归测试。提交 `b080c26` 已发布，生成 release `260816041851`，镜像摘要为 `sha256:f6c26698617c826573309a3caa3da7e98b8d3d4b8340646bdd2400a6ab1e99c3`。
- 验证：后端全量测试 160 passed、前端全量测试 197 passed、Ruff/lint/build/锁文件/部署脚本检查通过；生产 `/api/auth/mode` 返回 `sso`，匿名 `/api/auth/status` 返回 `{"authenticated":false}`，匿名 `/api/refrigerators` 返回 401，HTTPS `/healthz` 返回 `{"status":"ok"}`，容器为 healthy；数据库备份为 `/data/fridgeboard.db.backup-20260815-201859`。
- 未验证：真实设备重新安装后的首次启动和登录回跳仍需人工验收。
- 下一步：在设备上彻底卸载旧 App 后安装新 APK，确认首次启动显示“登录或注册”，再完成登录回跳。

### 2026-08-16 — 调整登录会话策略为用户主动切换（本次会话）

- 状态：已完成，待真实设备验收。
- 目标：保留浏览器已有 flycn 会话作为默认登录结果，仅在用户主动选择“切换登录账号”时清除会话并重新显示账号密码表单。
- 范围：移动 SSO 发起参数、App 登录入口状态、flycn `prompt=login` 契约和相关测试；不改变 PKCE、专属 App 回调 URI、一次性授权码或本地令牌存储协议。
- 设计/需求基线：用户本次反馈；现有 `frontend/src/mobileAuth.ts`、`frontend/src/App.tsx`、`backend/fridgeboard/main.py`、`../flycn/app/routes/fridgeboard_sso.py`。
- 预期验证：默认登录不携带强制重新认证参数，显式切换账号携带 `prompt=login` 并回到 flycn 登录表单；运行 FridgeBoard/flycn 相关测试、lint/build 和 `git diff --check`。
- 会话记录：用户确认清除已存会话应由用户决定。已移除普通移动登录的自动 `prompt=login`；“切换登录账号”会清理 App 本地会话，并让下一次登录仅携带 `prompt=login`。
- 完成：默认登录复用已有 flycn 会话；显式切换账号才清除本地会话并请求 flycn 登录表单；后端校验并转发可选 `prompt=login`，不接受其他 prompt 值。
- 验证：FridgeBoard `uv run ruff check backend`、移动认证测试（8 passed）、前端 lint、前端全量测试（197 passed）、前端生产构建、Android Debug 构建、flycn `ruff check app tests`、flycn SSO 相关测试（3 passed）和 `git diff --check` 均通过；上一轮全量 FridgeBoard 测试 159 passed。
- 完成发布：FridgeBoard commit `7c93adf` 已发布，生成 release `260816041002`；flycn commit `55167db` 已更新到 `/opt/flycn` 并重建容器。FridgeBoard 镜像摘要为 `sha256:71d2f0aa696b358cf7577c13669d525fcf312f02fe7498ef5534e5de04ba7666`，flycn 镜像摘要为 `sha256:abc1eaa1039003365784f502845cd8f47d8cabc7c37e2b9d33b73729313226e9`。
- 验证发布：`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；普通移动登录生产 307 地址不含 `prompt`，主动重新认证生产 307 地址包含 `prompt=login`；FridgeBoard 容器为 `healthy`，flycn 容器为 `running`；数据库备份分别为 `/data/fridgeboard.db.backup-20260815-201009` 和 `/data/app.sqlite3.backup-20260816-040838`。
- 未验证：真实设备上普通登录复用与主动切换账号后的登录表单仍需人工验收；flycn 容器没有 Docker healthcheck，已通过首页 HTTPS 请求验证服务可用。
- 下一步：在真机分别验证默认登录和“切换登录账号”两条路径。

### 2026-08-16 — 修复移动端登录自动复用旧账号（本次会话）

- 状态：待评审。
- 目标：解决 Android 点击“登录或注册”后因 Custom Tab 复用已有 flycn 浏览器会话而直接回到“我的冰箱”、没有用户名密码输入的问题；为用户提供可控的重新登录/切换账号路径。
- 范围：FridgeBoard 移动 SSO 发起参数、flycn FridgeBoard 授权入口契约、相关自动化测试和登录异常恢复文案；不改变 PKCE、专属 App 回调 URI、一次性授权码和本地令牌存储协议。
- 设计/需求基线：用户本次反馈；RFC 8252 外部用户代理登录约束；`frontend/src/mobileAuth.ts`、`backend/fridgeboard/main.py`、`../flycn/app/routes/fridgeboard_sso.py`。
- 预期验证：覆盖强制重新登录参数传递及默认会话复用行为，运行 FridgeBoard 前后端相关测试、flycn SSO 测试、lint/build 和 `git diff --check`；生产部署和真实账号输入仍需发布后人工验收。
- 会话记录：已确认线上自动回跳不是用户名密码表单丢失，而是 Custom Tab 中已有 flycn session 被授权接口直接使用；本地 flycn 授权路由原本没有 `prompt`/切换账号参数。已让移动 SSO 传递 `prompt=login`，由 flycn 清理浏览器会话并回到登录表单；App “我的”页增加“切换登录账号”，并在服务端退出失败时仍清理本机会话。
- 完成：FridgeBoard 移动登录请求加入强制重新认证参数；`../flycn/app/routes/fridgeboard_sso.py` 支持并校验 `prompt=login`；补充 FridgeBoard 与 flycn 的回归测试。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（159 passed，52 条既有依赖警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（197 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`（Debug APK 构建成功）、flycn `ruff check app tests`、flycn SSO 相关测试（3 passed）和 `git diff --check` 均通过。
- 未验证：生产 FridgeBoard/flycn 尚未部署；真实 Android/iOS 账号切换和首次登录输入仍需发布后人工验收；flycn 独立仓库改动不包含在 FridgeBoard 发布脚本的源码归档中。
- 下一步：按发布流程分别部署 FridgeBoard 和 flycn，随后在真机点击“切换登录账号”，确认出现用户名/密码表单并完成回跳。

### 2026-08-16 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD`（`3fa05cc`）发布到生产服务器，自动生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不包含工作区未提交改动。
- 设计需求基线：项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`README.md` 发布流程；`scripts/deploy-image.sh`。
- 预期验证：后端 Ruff/pytest、前端 lint/test/build、部署脚本语法检查与 dry-run、远端容器健康检查和 HTTPS `/healthz`。
- 完成：正式发布 `HEAD`，生成 release `260816034334`；生产容器重建并变为 `healthy`；镜像 ID 为 `sha256:4d555b774ba041a5ad67a9bc25e7ec29d1d4f2731387ff880fac9810396d26ff`；数据库备份为 `/data/fridgeboard.db.backup-20260815-194343`；HTTPS `/healthz` 返回 `{"status":"ok"}`；容器内前端产物确认包含 release `260816034334`。
- 验证：`uv run ruff check backend`、`uv run pytest`（159 passed，52 条依赖弃用警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（197 passed）、`npm run --prefix frontend build`、`uv lock --check`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、`git diff --check`、远端容器状态/release/数据库备份核对均通过。
- 未验证：真实 iOS/Android PWA、冰箱或 Kindle 设备人工验收；发布构建日志中的 Node `EBADENGINE` 和 npm audit 警告未影响本次构建，但未在本次发布中处理。
- 下一步：在真实设备复测本次发布涉及的页面、登录和原生能力流程；验收通过后将本条状态转为完成。

### 2026-08-16 — 使用系统默认浏览器 Custom Tabs 登录（本次会话）

- 状态：待评审。
- 目标：移除 Android 登录流程对 Chrome 的硬编码，改用用户默认浏览器提供的 Custom Tabs；未安装 Chrome 时仍可使用 Edge、Firefox 等支持 Custom Tabs 的浏览器。
- 范围：AndroidX Browser 依赖、Android 原生浏览器启动桥、前端登录调用契约、原生桥回归测试和移动部署说明；保持 `fridgeboard://mobile/auth/callback`、PKCE、state、一次性 code 和 iOS 登录行为不变。
- 设计/需求基线：用户本次明确要求；Android Custom Tabs 官方能力；RFC 8252 原生 OAuth 外部用户代理要求；当前 `NativeCapabilitiesPlugin.openExternalUrl` 固定 Chrome 实现。
- 预期验证：覆盖 Custom Tabs provider 选择、无可用浏览器错误、前端测试/lint/build、Android Debug 构建、iOS Simulator 构建和 `git diff --check`；真实无 Chrome 设备及不同浏览器的 Custom Tabs 支持仍需人工验收。
- 会话记录：已确认当前实现把 `com.android.chrome` 写死在 Android 原生桥中，导致未安装 Chrome 时登录不可用。已改为 `CustomTabsClient.getPackageName()` 选择设备可用的 Custom Tabs provider，并在没有 provider 时尝试明确启动默认浏览器；没有可用浏览器则在 App 内报错，不弹应用选择框。
- 完成：新增 AndroidX Browser 1.8.0；Android `NativeCapabilitiesPlugin` 使用 Custom Tabs 承载登录，移除 Chrome 包名依赖；更新原生桥契约测试和移动部署说明，未改变 WebView 业务页面及 OAuth 回调 URI。
- 验证：前端全量测试（197 passed，20 files）、前端 lint/build、移动端权限审查、`npm run --prefix frontend build:android`（含前端构建和 Capacitor sync）、`git diff --check` 均通过；设备 `28ffa63d` 安装最新 APK 后点击登录，顶部 Activity 为 `com.android.chrome/...CustomTabActivity`，未出现 `ResolverActivity`。
- 未验证：未在卸载 Chrome 后的设备上实测 Edge/Firefox Custom Tabs provider 选择及无浏览器错误回退；iOS 本次未改动；生产 FastAPI 尚未部署本地回调白名单改动。
- 追加验证：`curl https://fridge.flycn.fyi/api/auth/login` 携带 `redirect_uri=fridgeboard://mobile/auth/callback` 返回 400 `移动端登录参数无效`；同接口使用旧 HTTPS 回调返回 307，确认线上容器仍是旧版本，不是 Custom Tabs 或 APK 参数拼接错误。
- 下一步：按正式发布流程部署包含 `fridgeboard://mobile/auth/callback` 白名单的后端版本；发布后在至少一台无 Chrome 的 Android 设备上安装 Edge/Firefox 验证 Custom Tabs、App 回跳和会话恢复完整链路。

### 2026-08-16 — 修复原生登录回调“打开方式”选择框（本次会话）

- 状态：待评审。
- 目标：修复 Android 原生 App 点击“登录或注册”后，系统因 HTTPS 登录回调的 App Link 未完成域名/签名关联而弹出 Chrome 与“家常食橱”选择框的问题。
- 范围：移动 SSO 回调 URI、前端深链白名单、后端移动回调白名单、Android/iOS 原生 URL 注册和回归测试；保留二维码配对使用的 HTTPS App Link，不改变 PKCE、state、一次性 code 或会话交换协议。
- 设计/需求基线：用户本次反馈；`docs/mobile-deployment-design.md` §5.2、§6；`frontend/src/mobileAuth.ts`、`frontend/src/deepLink.ts`；线上 `https://fridge.flycn.fyi/.well-known/assetlinks.json` 当前返回空数组。
- 预期验证：覆盖应用专属回调 URI 的前后端白名单、Android/iOS URL 注册和旧 HTTPS 回调拒绝；运行前端测试、lint、生产构建、后端 Ruff/pytest、Android Debug 构建和 `git diff --check`；真实浏览器 SSO 完整回跳仍需设备人工验收。
- 会话记录：已确认设备选择框有两段触发原因：当前 Debug APK 的 HTTPS App Link 未完成签名关联，登录起始地址会被系统交给 Resolver；旧 HTTPS 回调也会在回跳阶段与 Chrome 竞争。移动登录改用仅由本 App 注册的 URI，并由 Android 原生桥明确启动 Chrome；二维码配对继续使用 HTTPS App Link。
- 完成：移动认证统一使用 `fridgeboard://mobile/auth/callback`；后端仅对固定 App URI 或兼容的正式 HTTPS 回调做白名单校验；Android/iOS 注册 App URI；Android 登录浏览器固定为 Chrome；移除认证回调的 HTTPS App Link/AASA 声明；`build:android` 自动执行前端构建和 Capacitor sync。
- 验证：前端全量测试（197 passed）、后端全量测试（159 passed，52 条既有依赖警告）、前端 lint/build、后端 Ruff、移动端权限审查、Android/iOS sync、Android Debug 构建、iOS Simulator Debug 构建和 `git diff --check` 均通过；设备 `28ffa63d` 安装最新 APK 后点击“登录或注册”，顶部 Activity 为 Chrome，未出现 `ResolverActivity`，日志确认回调 URI 为 `fridgeboard://mobile/auth/callback`；直接触发该 URI 时只启动“家常食橱”。
- 未验证：生产后端尚未部署本轮新回调白名单，正式签名 APK/IPA、真实 OAuth 完整登录回跳、无 Chrome 设备和 iOS 真机仍需验收。
- 下一步：部署前后端新版本后，在 Android 真机完成 Chrome 登录、flycn 授权、App 回跳和会话恢复；再验证正式签名包的二维码 HTTPS App Link 关联。

### 2026-08-16 — 修复原生登录安全存储写入失败（本次会话）

- 状态：待评审。
- 目标：修复 Android 原生 App 在“开始使用家常食厨”页面点击“登录或注册”后，PKCE 登录事务写入 Android Keystore 失败并显示 `secure storage write failed` 的问题。
- 范围：Android `SecureSessionPlugin` 的 Keystore/SharedPreferences 写入、失效密钥恢复、同步写入结果和原生契约回归测试；不改变登录协议、令牌内容、后端认证接口或 Web/PWA 存储策略。
- 设计/需求基线：用户本次反馈；`frontend/src/mobileAuth.ts`、`frontend/src/secureSession.ts`；Android Keystore AES-GCM 约束；现有移动端安全存储实现。
- 预期验证：补充原生存储失败恢复与同步持久化静态回归断言，运行前端测试、lint、生产构建、Android Debug 构建和 `git diff --check`；真实 Android 设备登录及旧安装升级场景需人工验收。
- 会话记录：已确认点击登录首先调用 `createMobileAuthTransaction()`，在浏览器跳转前写入 `SecureSession.set`；真实 Android 设备日志显示原始异常为 `InvalidAlgorithmParameterException: Caller-provided IV not permitted`，根因是 Android Keystore 默认要求 GCM IV 由 `Cipher.init()` 生成，而旧实现手工传入 IV。本轮保持 Keystore 随机化保护，改为读取 `cipher.getIV()`，并同时增加失效密钥恢复和同步写入结果检查。
- 完成：Android GCM 加密改为由 Keystore 生成 IV 后保存，明确 AES-256 参数；`SharedPreferences` 改为同步提交并检查持久化结果；对永久失效或不可恢复密钥清理后重建并重试；新增 Android 原生契约回归断言。
- 验证：`npm run --prefix frontend test -- --run`（196 passed，20 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、`npm run --prefix frontend check:mobile-permissions`、`git diff --check` 均通过；已安装最新 Debug APK 到设备 `28ffa63d`，在“开始使用家常食厨”页点击“登录或注册”，`SecureSession.set` 成功并打开系统浏览器选择器，日志未再出现 `secure storage write failed`。
- 未验证：未清除设备数据验证全新 Keystore 生成路径，未完成正式签名包、iOS 设备及发布后生产包验收；当前设备验证保留了原有 App 数据。
- 下一步：发布正式移动包后，在 Android 真机完成首次安装、升级安装和登录回跳验收；若覆盖 iOS 原生登录，再在 iOS 真机验证 Keychain 写入和登录回跳。

### 2026-08-16 — 修复共享页面标题栏宽度受限（本次会话）

- 状态：待评审。
- 目标：修复手机端共享页面标题栏在宽屏 PWA、平板/横屏和原生 WebView 中被 430px 页面壳或页面内边距限制的问题，确保标题栏背景横向铺满视口。
- 范围：`PageShell` 共享页面壳、所有使用 `PageShell` 的手机页面宽度规则、标题栏与主内容区宽度回归测试；保留 430px 内容阅读宽度，不改变底部导航、底部操作条、弹窗和业务交互。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5、§6.2.1、§9.1 关于标题栏位于页面顶部、标题视口居中和内容容器居中的约束；现有 `frontend/src/sharedUi.tsx`、`frontend/src/styles.css`。
- 预期验证：覆盖共享 `PageShell` 标题栏/内容区结构和宽度 CSS 契约；运行前端测试、lint、生产构建和 `git diff --check`；确认所有 `PageShell` 页面不再由根壳限制标题栏宽度。
- 会话记录：已确认 `.mobile-page`、`.p4-flow`、`.p5-flow`、`.p7-shell` 等页面根类均存在 `max-width: 430px`，且 `owner-start` 等页面的 16px 根内边距会进一步缩窄标题栏；这些规则由 PWA 与 Capacitor 共用，属于跨平台共享前端问题。已将根壳改为满视口宽度，并让 `mobile-page-body` 继续居中限制为 430px；带页面内边距的标题栏统一抵消安全边距。
- 完成：共享标题栏在所有 `PageShell` 页面中横向铺满视口；正文仍保持 430px 阅读宽度；补充安全区页面壳 CSS 契约测试，未改变底部导航、底部操作条和弹窗的内容级宽度。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（105 passed）、`npm run --prefix frontend test -- --run`（195 passed，20 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npx cap sync android`、`npx cap sync ios` 和 `git diff --check` 均通过。
- 未验证：宽屏 PWA、平板/横屏和 Android/iOS 真机视觉截图。
- 下一步：在宽屏 PWA、平板/横屏和 Android/iOS 真机确认标题栏无两侧色带、标题仍位于视口中心；确认后将本条转为完成。

### 2026-08-16 — 统一移动端状态栏与 safe-area 处理（本次会话）

- 状态：待评审。
- 目标：修复 Android 首次启动“开始使用家常食厨”页面顶部系统状态区与应用标题栏颜色不一致的问题，并统一审查 Android/iOS 的状态栏、导航栏和 WebView safe-area 处理。
- 范围：Capacitor Android 主题与窗口系统栏配置、iOS App 窗口/状态栏外观、网页 viewport 与共享页面壳安全区令牌、移动端静态回归检查；不改变业务页面信息层级、登录流程或系统权限。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 共享页面壳规则；`frontend/src/styles.css` 的 `env(safe-area-inset-*)` 使用；当前 Capacitor Android/iOS 工程配置。
- 预期验证：前端 lint/test/build、Android Debug 构建、iOS 工程静态检查或 Debug 构建（环境可用时）、状态栏/safe-area 配置回归检查和 `git diff --check`；真实 Android/iOS 设备的刘海屏、挖孔屏、底部手势区仍需人工验收。
- 会话记录：已确认网页声明了 `viewport-fit=cover`，但 Android 仍使用默认 `colorPrimaryDark` 且 iOS 仅声明状态栏控制；共享 CSS 的顶部安全区没有与系统状态栏颜色形成统一原生背景。已按 Capacitor 8 `SystemBars` 实现统一系统栏样式和安全区变量，并让 Android splash 后窗口、iOS WebView 背景与标题栏白色保持一致。
- 完成：`capacitor.config.ts` 已配置白色背景、`SystemBars` 的 `LIGHT/css` 和 iOS `contentInset: never`；Android 主题已配置白色窗口背景、透明状态栏/导航栏及 splash 后主题；iOS 已配置深色状态栏内容回退；共享 CSS 的顶部/底部/左右安全区统一通过 `--app-safe-*` 消费；补充移动端原生配置回归测试和部署文档。
- 验证：`npm run --prefix frontend test -- --run`（195 passed，20 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npx cap sync android`、`npx cap sync ios`、Android `./gradlew assembleDebug`、iOS `xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build`、iOS `plutil -lint`、APK `aapt dump permissions` 和 `git diff --check` 均通过；构建产物核对到 Android 权限清单未新增权限，iOS 包内包含 `UIStatusBarStyleDarkContent`。
- 未验证：真实 Android/iOS 设备上的不同状态栏模式、刘海/挖孔屏、手势导航和横屏 safe-area 行为。
- 下一步：在 Android 真机和 iOS 真机/刘海屏模拟器安装最新包，检查首次页及深色扫码页的状态栏图标对比度、顶部/底部手势区、横屏 cutout 和键盘弹出后的内容边界；通过后将本条转为完成。

### 2026-08-16 — 修复 Kindle 别名地址导致手机扫码失败（本次会话）

- 状态：待评审。
- 目标：允许手机原生 App 和 PWA 扫描 `kindle.` 快捷域名生成的冰箱配对二维码，并继续拒绝真正外部域名的二维码。
- 范围：前端配对二维码 Origin 判断、原生壳扫码时的 API Origin、深链配对解析和回归测试；不修改二维码 token、后端配对接口、登录回调域名白名单或 DNS/Nginx 配置。
- 设计/需求基线：用户本次反馈；`docs/architecture/README.md` 关于 `kindle.flycn.fyi` 与 `fridge.flycn.fyi` 共用 FridgeBoard 服务的说明；`docs/pairing-and-onboarding-redesign.md` §5.2；现有 `frontend/src/pairingFlow.ts`、`frontend/src/deepLink.ts` 和 `frontend/src/App.tsx`。
- 预期验证：覆盖 `fridge.`/`kindle.` 配对域名别名、外部域名拒绝、PWA 与原生扫码入口共用解析策略；运行前端 lint、测试、生产构建和 `git diff --check`。
- 会话记录：已确认 PWA 和原生 App 共用 `PwaScanner`，当前均以严格 `window.location.origin` 校验二维码；原生壳当前 WebView Origin 为 `https://localhost`，应使用 `appRuntime.apiOrigin`。即使 `kindle.flycn.fyi` 与 `fridge.flycn.fyi` 由同一服务器提供，现有逻辑仍会提示地址不同。
- 完成：共享配对二维码解析已允许当前 `fridge.` 地址对应的 `kindle.` 快捷地址；PWA 和 Capacitor 共用该规则，Capacitor 扫码及配对跳转使用配置的 API Origin；登录回调仍保持严格的 `fridge.` Origin 校验。
- 验证：`npm run --prefix frontend test -- --run pairingFlow.test.ts`（10 passed）、`npm run --prefix frontend test -- --run`（193 passed，20 files）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：真实 Android/iOS 相机扫码、DNS/代理转发和生产设备人工验收。
- 下一步：在真实 Android/iOS 设备及已安装 PWA 上分别扫描 `kindle.flycn.fyi` 生成的首次绑定和添加手机二维码；确认后将本条转为完成。

### 2026-08-15 — 修复 APK/IPA 扫码相机权限并审查移动端系统权限（本次会话）

- 状态：待评审。
- 目标：修复 Android APK 扫描冰箱端二维码时未弹出系统相机权限请求的问题，并核对 APK/IPA 当前所有原生能力对应的系统权限声明与运行时请求链路。
- 范围：Android `CAMERA` Manifest 声明、iOS 相机用途说明、扫码/识图失败回退文案与权限审查测试/文档；不新增原生扫码、原生推送或媒体库权限。
- 设计/需求基线：用户本次反馈；`docs/mobile-deployment-design.md` P13/P13.5；Capacitor Android `BridgeWebChromeClient` 的 WebView `getUserMedia` 权限处理；当前前端相机、文件选择、通知、网络、Keychain/Keystore、深链和分享能力实现。
- 预期验证：前端 lint/test/build、Android Debug 构建、iOS Simulator Debug 构建（环境可用时）、APK/IPA 权限声明静态检查和 `git diff --check`；真实设备系统弹窗、权限拒绝后重试和已永久拒绝场景需手工验收。
- 会话记录：已确认扫码页与物品识别页都调用 `navigator.mediaDevices.getUserMedia`；Android Manifest 缺少 `android.permission.CAMERA`，iOS `Info.plist` 缺少 `NSCameraUsageDescription`，二者均会阻断系统相机授权链路。当前其他权限调用未发现遗漏：网络权限已声明，文件选图使用系统 picker，音频、定位、蓝牙、媒体库读取和原生推送均未使用。已补齐两端声明，扫码页复用相机错误分类，并新增 `check:mobile-permissions` 静态审查入口。
- 完成：Android Manifest 已加入 `CAMERA`；iOS `Info.plist` 已加入 `NSCameraUsageDescription`；移动部署设计新增系统权限矩阵，明确当前未使用音频、定位、蓝牙、媒体库读取和原生推送权限。
- 验证：`npm run --prefix frontend check:mobile-permissions`、`npm run --prefix frontend lint`、前端测试（192 passed）、`npm run --prefix frontend build`、`npx cap sync android && npx cap sync ios`、Android Debug APK 构建、iOS Simulator Debug 构建、iOS `plutil -lint`、APK `aapt dump permissions` 和 `git diff --check` 均通过；最终 APK 包含 `CAMERA`、`INTERNET`、`ACCESS_NETWORK_STATE`，Simulator App 包内包含 `NSCameraUsageDescription`。
- 未验证：未在真实 Android/iOS 设备确认首次系统授权弹窗、拒绝后重试、永久拒绝后的设置引导、前后摄像头可用性和扫码成功；未生成正式签名 IPA。AndroidX 合并出的内部 `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` 为框架内部权限，不是业务能力遗漏。
- 下一步：在 Android 12–15+ 真机和 iPhone 真机安装本次构建，分别执行冰箱端二维码扫码、物品识别相机、首次允许、首次拒绝后重试和系统设置中永久拒绝后的回退验收；通过后再将本条转为完成。

### 2026-08-15 — 补充本地移动设备一键构建部署命令（本次会话）

- 状态：待评审。
- 目标：参考 `../HermitReader`，为 FridgeBoard 提供 Android/iOS 本地 Debug 构建、安装并启动设备的一条命令。
- 范围：`frontend/package.json`、`README.md` 和本进度记录；复用 Capacitor CLI 的 `cap run`，不改变发布签名流程、业务代码或原生能力。
- 设计/需求基线：用户本次需求、`../HermitReader` 的 `install:android:debug`/`install:ios:debug` 入口、Capacitor `cap run` 的 sync/build/deploy 行为。
- 预期验证：package JSON 解析、前端 lint/test/build、Android/iOS 命令入口静态检查和 `git diff --check`；真实设备安装需本机连接设备并完成 Android/iOS 签名信任。
- 会话记录：确认 Capacitor 8 的 `cap run` 已内置 sync、Debug 构建和 native-run 部署；新增 `install:android:debug` 与 `install:ios:debug`，两者先构建 `dist` 再调用对应平台的 `cap run`。README 增加多设备 target 传递、iOS Team/开发者模式/证书信任前置，并保留手动命名 APK 流程。
- 完成：Android/iOS 本地一键构建、安装并启动入口和使用说明已完成；未改变正式签名 APK/IPA 发布流程。
- 验证：package JSON 解析、`npm run --prefix frontend lint`、前端测试（192 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、Capacitor `run` 帮助检查和 `git diff --check` 均通过；Android Debug APK 构建成功。
- 未验证：未在本次会话实际连接 Android/iOS 设备执行安装启动；iOS 真机需要本机 Xcode Team、开发者模式和证书信任，模拟器/真机 target 需按 README 指定或选择。
- 下一步：在连接的 Android 真机和已配置签名的 iPhone/模拟器上分别执行 `install:android:debug`、`install:ios:debug`，确认安装、启动及多设备 target 选择后转为完成。

### 2026-08-15 — P13.6 GitHub-hosted 移动构建与门户发布 workflow（本次会话）

- 状态：进行中。
- 目标：将 P13.6 从本机可调用脚本升级为 GitHub-hosted runner 自动构建 Android APK/iOS IPA，并在构建、包内校验和产物归档通过后上传 `app.flycn.fyi`；不接入 Google Play、Apple App Store 或 TestFlight。
- 范围：`.github/workflows/mobile-release.yml`、Android/iOS GitHub Secrets 注入、iOS distribution certificate/provisioning profile 导入、flycn 发布条件、workflow 使用说明和 P13.6 进度记录；不修改业务 API、数据库、flycn 门户代码或 PWA 发布 workflow。
- 设计/需求基线：`scripts/mobile-release.sh`、`scripts/verify-mobile-artifact.mjs`、`docs/mobile-deployment-design.md` §9、`docs/development-execution-plan.md` P13.6、`../HermitReader/.github/workflows/release-apple-mobile-selfhosted.yml` 的多平台资产收集思路；本项目使用 GitHub-hosted runner，不复用 HermitReader 的 self-hosted 约束。
- 预期验证：workflow YAML 静态检查、Android/iOS job 条件与 Secrets 不落日志、前端/移动脚本门禁、`git diff --check`；真实 GitHub Actions 构建和门户上传需在仓库 Secrets 配置完成后运行。
- 会话记录：已确认当前仓库只有通用 `.github/workflows/ci.yml`，没有移动构建 workflow；本轮将按 Android Ubuntu runner、iOS macOS runner、构建后 `actions/upload-artifact`、可控 publish 输入和 flycn Bearer API 的顺序接入。
- 完成：新增 `.github/workflows/mobile-release.yml`，使用 GitHub-hosted `ubuntu-latest` + JDK 21 构建 Android、`macos-latest` 导入 `.p12`/provisioning profile 构建 iOS；两端均先归档 Actions artifact，再按 `publish` 开关调用 flycn。iOS workflow 会校验 Team ID、`application-identifier` 和签名身份；本机发布脚本支持 profile UUID/签名身份的手动导出。
- 验证：Ruby/PyYAML workflow YAML 解析、`bash -n scripts/mobile-release.sh`、`node --check scripts/verify-mobile-artifact.mjs`、all-platform dry-run、手动 iOS 签名参数 dry-run、前端 lint/测试（192 passed）/build 和 `git diff --check` 通过；未输出 Secrets 内容。
- 未验证：未在 GitHub Actions runner 实际执行 Android/iOS 构建、未执行真实 flycn 上传和真机安装；这些需要配置仓库 Secrets、`fridgeboard` App 和 `FLYCN_PUBLISH_TOKEN` 后通过 Actions 手工触发。
- 下一步：在 GitHub 仓库配置 README 列出的 Android/iOS/flycn Secrets，先以 `publish=false` 触发 `Mobile Release` 验证 APK/IPA artifact，再以 `publish=true` 发布到门户并记录版本、构建号、SHA256 和真机验收结果。

### 2026-08-15 — P13.6 移动包构建与 flycn 门户发布流程（本次会话）

- 状态：进行中。
- 目标：参考 `../HermitReader` 的发布资产命名和多平台构建方式，为 FridgeBoard 建立可重复的 Android APK/iOS IPA 构建、产物校验和 `app.flycn.fyi` 发布流程；不接入 Google Play、Apple App Store 或 TestFlight。
- 范围：移动端版本/构建号注入、Android release APK、iOS device IPA、签名配置注入、产物包名与完整性校验、flycn Bearer API 上传脚本、构建与发布说明；不修改业务 API、数据库、PWA 发布脚本或 flycn 门户代码。
- 设计/需求基线：`docs/mobile-deployment-design.md` §9–§10、`docs/development-execution-plan.md` P13.6–P13.7、`docs/architecture/adr/0004-capacitor-mobile-and-pwa.md`、`../HermitReader/.github/workflows/release-apple-mobile-selfhosted.yml`、`../flycn/docs/API.md`。
- 预期验证：脚本静态检查和 dry-run、前端 lint/test/build、Android release/AAB（若本机 Java 21 可用）、iOS device archive/IPA（若本机签名环境可用）、APK/IPA 包名和版本校验、敏感文件排除、`git diff --check`；真实门户上传和真机安装仅在 token/签名环境可用时执行。
- 会话记录：已确认 `app.flycn.fyi` 是现有受保护的 flycn Software Delivery Portal，发布接口按 App slug 接收单平台制品；本机未发现 FridgeBoard 发布 token 或正式 Android/iOS 签名材料，后续验证必须区分“流程已实现”“构建已验证”和“门户已发布”。
- 完成：新增 `scripts/mobile-release.sh`，统一执行前端构建、按平台 Capacitor sync、Android release APK/可选 AAB、iOS device archive/export 和 flycn Bearer API 上传；新增 `scripts/verify-mobile-artifact.mjs` 校验 `com.fridgeboard.app`、版本号和构建号；Android Gradle release 签名与版本读取改为环境注入；补充 README、移动部署设计和执行计划。
- 验证：`sh -n scripts/mobile-release.sh`、`node --check scripts/verify-mobile-artifact.mjs`、发布脚本 all-platform dry-run、`git diff --check`、前端 lint/测试（192 passed）/build、`uv run ruff check backend`、`uv lock --check`、`uv run pytest -q`（157 passed）均通过；校验器已读取现有 debug APK 的包名/版本/构建号；Xcode iOS Release `CODE_SIGNING_ALLOWED=NO` device archive 成功；临时测试 keystore 已验证 Gradle release 配置顺序，随后因本机仅 Java 17 而被 Java 21 source requirement 阻断。
- 未验证：未生成可分发 Android APK/IPA，未执行 flycn 上传，未完成真实 Android/iOS 设备安装、OTA/App Links/Universal Links 和升级回归；原因是本机缺少 JDK 21、正式 Android keystore、Apple Team/分发签名和 `FLYCN_PUBLISH_TOKEN`，SSH 只读检查生产门户也未返回结果。临时 keystore 仅用于构建配置验证，不可作为正式发布密钥。
- 下一步：提供正式 JDK 21、Android keystore、Apple 分发签名/Team ID 和 flycn `fridgeboard` App 的 Bearer token；随后执行 Android/iOS 构建、包内校验、门户上传和真实设备安装验收，再进入 P13.7。

### 2026-08-15 — 修复 P13.5 原生分享与网络状态审查问题（本次会话）

- 状态：待评审。
- 目标：修复 P13.5 审查发现的网络状态未接入、剪贴板 fallback 错误提示、原生分享取消不可感知和 iOS 后台线程通知问题。
- 范围：共享页面网络状态提示、购物清单分享结果处理、Android/iOS 原生分享完成回调、iOS 网络事件线程切换及相关测试；不实现原生扫码、APNs/FCM 推送、正式签名发布或真机验收。
- 设计/需求基线：`docs/mobile-deployment-design.md` §7–§8、`docs/development-execution-plan.md` P13.5、当前 `nativeBridge` 审查 findings。
- 预期验证：前端 lint/test/build、Android Debug 构建、iOS Simulator Debug 构建、后端最低门禁、`uv lock --check` 和 `git diff --check`；记录真实设备分享取消、网络切换和手势仍未验证。
- 会话记录：已在共享 `PageShell` 接入 `getNetworkStatus`/`subscribeNetworkStatus`，离线时显示不阻断操作的状态提示；购物清单按分享成功、取消、复制成功和不可用分别反馈。Android 分享改用 Capacitor ActivityCallback，iOS 使用分享完成回调；iOS `NWPathMonitor` 事件切到主线程后再调用 Capacitor bridge。新增取消状态回归和原生契约断言。
- 完成：本轮审查发现的四项 P13.5 问题已修复，未宣称原生扫码、推送或真机能力完成。
- 验证：前端 20 个测试文件、192 项测试通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、iOS Simulator Debug `xcodebuild`、`uv run ruff check backend`、`uv run pytest -q`（157 passed，52 条既有依赖/迁移警告）、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：真实 Android/iOS 系统分享完成/取消、系统无可用分享目标、网络切换线程时序和真机视觉。
- 下一步：在真机验证 Android/iOS 分享完成与取消、无可用分享目标、网络切换提示、返回手势和键盘/抽屉/表单/扫码边界。

### 2026-08-15 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD`（`89bf32a`）发布到生产服务器，自动生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不包含工作区未提交改动。
- 设计需求基线：项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`README.md` 发布流程；`scripts/deploy-image.sh`。
- 完成：正式发布 `HEAD`，生成 release `260815030913`；生产容器重建并变为 `healthy`；镜像 ID 为 `sha256:41715e2d0152ba46a42cf619271e3dab20da260c2efc5d7084d8eef9ee613164`；数据库备份为 `/data/fridgeboard.db.backup-20260814-190921`；HTTPS `/healthz` 返回 `{"status":"ok"}`；容器内前端产物确认包含 release `260815030913`。
- 验证：`uv run ruff check backend`、`uv run pytest`（157 passed，52 条依赖弃用警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（189 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run 和 `git diff --check` 均通过。
- 未验证：未进行真实 iOS/Android PWA、冰箱或 Kindle 设备人工验收；传输阶段有 macOS tar 扩展属性警告，未影响归档、构建和健康检查。
- 下一步：在真实设备复测本次发布涉及的页面、登录和原生能力流程；工作区未提交改动需后续单独提交并重新发布。

### 2026-08-15 — P13.5 原生返回与分享降级续做（本次会话）

- 状态：待评审。
- 目标：补齐 P13.5 原生返回手势的系统配置与触摸降级边界，确保原生分享失败时仍保留 Web/剪贴板 fallback。
- 范围：Android predictive back Manifest 配置、iOS 边缘手势触摸行为、`nativeBridge` 分享降级和回归契约测试；不实现原生扫码、APNs/FCM 推送、正式签名发布或真机验收。
- 设计/需求基线：`docs/mobile-deployment-design.md` §7–§8、`docs/development-execution-plan.md` P13.5、现有 `nativeBridge` 和 P13.5 原生插件实现。
- 预期验证：前端 lint/test/build、Android Debug 构建、iOS Simulator Debug 构建、后端最低门禁、`git diff --check`；记录真实设备手势和系统分享仍未验证。
- 会话记录：已将 Android Manifest 的 `android:enableOnBackInvokedCallback` 设为 `true`，Android 原生返回回调在 Activity 销毁时移除；iOS 边缘手势增加监听器门控和 `cancelsTouchesInView = false`，没有 React 返回处理器时不占用 WebView 触摸。`nativeBridge.shareContent` 统一拼接文本与 URL，原生/Web Share 失败时复制完整内容，保留取消操作的中止语义。
- 完成：本轮 P13.5 原生返回配置、手势触摸降级和分享 fallback 已完成，未宣称真机能力完成。
- 验证：前端 20 个测试文件、191 项测试通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、iOS Simulator Debug `xcodebuild`、`uv run ruff check backend`、`uv run pytest -q`（157 passed，52 条既有依赖/迁移警告）、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：真实 Android/iOS 设备 predictive back、边缘触摸冲突、系统分享取消/无可用目标和原生扫码/推送。
- 下一步：在真机按 P13.5 清单验收 Android 12–15+ 返回手势、iOS 页面边缘返回、键盘/抽屉/表单/扫码边界，以及系统分享完成/取消/无可用目标三种状态。

### 2026-08-15 — 修复 P13.5 原生能力桥接审查问题（本次会话）

- 状态：待评审。
- 目标：修复 Android 返回监听异步清理/无处理器吞键、iOS 手势未接入 React 导航、系统分享未接入业务入口和文本/URL 丢失问题。
- 范围：`nativeBridge` 生命周期、共享返回页头、Android/iOS `NativeCapabilities` 原生桥、购物清单分享入口及回归契约测试；不扩展原生扫码、推送、签名发布或真机验收范围。
- 设计/需求基线：本次代码审查结论、`docs/mobile-deployment-design.md` §7–§8、`docs/ui-design-specification.md`、现有购物清单页面和 P13.5 原生能力桥。
- 预期验证：补返回监听竞态/分享 payload 契约用例；运行前端 lint/test/build、Android/iOS 构建、后端最低门禁和 `git diff --check`。
- 会话记录：已修复 `subscribeNativeBack`/`subscribeNetworkStatus` 的异步注册清理竞态，`PageHeader` 仅在有 `onBack` 时注册原生返回监听；Android 分享同时保留文本和 URL，并拒绝空 payload；购物清单在 Capacitor 中调用系统分享、PWA 继续复制。iOS 新增 `NativeCapabilitiesPlugin`，通过屏幕左边缘手势通知 React `backButton`，接入分享和网络状态，并关闭 WebView history 手势避免重复导航；已将 Swift 文件加入 Xcode Sources。
- 完成：审查发现的监听吞键、iOS 手势未接入、分享未调用和文本/URL丢失问题已修复。
- 验证：`npm run --prefix frontend test -- --run`（189 passed，20 files，含 2 条监听生命周期回归）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、iOS Simulator Debug `xcodebuild`、`uv run ruff check backend`、`uv run pytest -q`（157 passed，52 条既有依赖警告）、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：真实 Android/iOS 设备返回手势、系统分享面板和取消行为。
- 下一步：在真实 Android/iOS 设备验证根页面退出、二级页返回、表单/抽屉/扫码页边缘手势和系统分享取消/完成行为。

### 2026-08-15 — 修复我的冰箱长按触发文字选择（本次会话）

- 状态：待评审。
- 目标：阻止“我的冰箱”条目长按时被 Android/WebView 原生文字选择接管，保持拖动排序入口可用。
- 范围：冰箱条目基础触摸样式和对应前端样式契约测试；不改变拖动判定、插入位置、列表排序或其他页面文本选择行为。
- 设计/需求基线：用户反馈；现有 `FridgeSwitcher` Pointer Events 交互；`docs/fridge-management-requirements-and-ui.md` §4.1；UI 设计规范触摸交互要求。
- 预期验证：前端 lint、前端测试、前端生产构建和 `git diff --check`；记录真实 Android/iOS WebView 未验证项。
- 会话记录：已定位 `.p71-fridge-card` 仅在 React 状态类 `.is-pressing`/`.is-dragging` 下禁用选择，原生长按可能在状态样式生效前进入选择模式；已将 `user-select`、`-webkit-user-select` 和 `-webkit-touch-callout` 提升到基础卡片样式，并加入样式契约断言。
- 完成：冰箱卡片从初始触摸阶段即禁止文字选择和 WebKit 长按呼出菜单，拖动状态继续禁用系统拖拽行为，未改变排序和插入逻辑。
- 验证：`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run` 通过（187 passed，19 files）；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：真实 Android/iOS WebView 的长按选择、系统触摸反馈和拖动手感。
- 下一步：在真实 Android/iOS WebView 上确认长按不再出现文字选择，并复测拖动排序；通过后将本条标记为完成。

### 2026-08-15 — 修复价格排序未在既有 PWA 中显示（本次会话）

- 状态：待评审。
- 目标：让已安装或已有缓存的 PWA 获取包含价格排序菜单的最新应用壳。
- 范围：Service Worker 应用壳缓存版本和对应前端缓存契约测试；不改变价格排序业务逻辑、菜单顺序或后端接口。
- 设计/需求基线：用户反馈；线上当前 bundle 已包含“价格最低/价格最高”，现有 `frontend/public/sw.js` 的 `cacheFirst` 应用壳策略和 `frontend/src/pwaCache.ts`。
- 预期验证：覆盖缓存版本升级及旧缓存清理；运行前端 lint、测试、生产构建和 `git diff --check`。
- 会话记录：已通过本地页面和线上静态 bundle 确认价格排序代码已发布；发现 Service Worker 缓存名仍为 `fridgeboard-app-v3`，旧设备持续缓存旧 `index.html` 和 JS，因此菜单显示为三项旧版本。本次将应用壳缓存升级为 `fridgeboard-app-v4`，激活新 Service Worker 后自动清理旧缓存。
- 完成：已升级 Service Worker 应用壳缓存版本，并同步前端缓存契约测试；价格排序业务逻辑和五项菜单顺序保持不变。
- 验证：`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run` 通过（186 passed，19 files）；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：真实 Android/iOS 已安装 PWA 的自动更新时机和系统 WebView 的缓存更新行为。
- 下一步：在下一次部署后通过“关于与帮助 → 刷新应用”或重新打开 PWA，确认旧缓存被替换并显示五个排序项；确认后将本条标记为完成。

### 2026-08-15 — P13.5 原生能力桥接与系统手势（本次会话）

- 状态：待评审。
- 目标：为 P13.5 建立集中式 native bridge，接入 Android 系统返回事件、系统分享和网络状态，并保持相机/扫码/通知在原生桥不可用时使用现有 Web fallback。
- 范围：`frontend/src/nativeBridge.ts` 及契约测试、Android `NativeCapabilities` 插件、iOS WKWebView 返回手势配置、前端 App 返回事件接线和分享/网络能力适配；不引入新的原生依赖，不实现正式推送、原生扫码 UI、签名发布或真机验收。
- 设计/需求基线：`docs/mobile-deployment-design.md` §7–§8、`docs/development-execution-plan.md` P13.5、现有 `camera.ts`、ZXing 扫码、页面级 `edgeSwipeBack.ts` 和 Capacitor P13.1–P13.4 原生桥。
- 预期验证：Web fallback 与 Capacitor 能力检测契约、Android/iOS 构建、前端 lint/test/build、后端最低门禁和 `git diff --check`。
- 会话记录：已新增 `frontend/src/nativeBridge.ts`，统一封装 Capacitor 原生分享、网络状态和系统返回监听；浏览器继续使用 Web Share、Clipboard 与 `online/offline` 事件 fallback。Android 新增 `NativeCapabilitiesPlugin`，通过系统分享 Intent、`ConnectivityManager` 和 `OnBackPressedDispatcher` 提供能力；带页面返回按钮的共享 `PageHeader` 接入原生返回事件；iOS `CAPBridgeViewController` 开启 WKWebView 返回手势。
- 完成：P13.5 本轮桥接代码和自动化契约已完成，未宣称原生扫码、推送或真机能力完成。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（186 passed，19 files）、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、iOS Simulator Debug `xcodebuild`、`uv run ruff check backend`、`uv run pytest -q`（157 passed，55 条既有依赖/异步线程警告）和 `git diff --check` 均通过；新增原生能力契约测试 2 passed。
- 未验证：真实 Android/iOS 设备返回手势、键盘/抽屉/表单/扫码页边界、原生相机扫码、APNs/FCM 推送权限和系统分享面板。
- 下一步：在真机按 P13.5 清单验收页面返回、系统分享和网络变化；原生扫码/推送若仍需正式插件，单独评估依赖与权限方案。

### 2026-08-15 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD`（`89bf32a`）发布到生产服务器，自动生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不修改业务代码、生产配置或手工 release 号。
- 设计/需求基线：项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`README.md` 发布流程；`scripts/deploy-image.sh`。
- 预期验证：后端/前端质量门禁、锁文件检查、发布脚本语法与 dry-run；发布脚本成功、远端容器变为 `healthy`、HTTPS `/healthz` 返回成功；记录 release、镜像摘要和未验证项。
- 会话记录：已确认当前 `main` 指向 `89bf32a`，发布配置和正式发布脚本存在；本次发布将从该提交归档并由脚本注入 release。
- 完成：正式发布当前 `main` 的 `HEAD`（`89bf32a`），生成 release `260815014822`；生产容器完成 Docker 重建并健康启动；远端数据库备份为 `/data/fridgeboard.db.backup-20260814-174830`；容器镜像 ID 为 `sha256:a2244b63b2cc7707972091c58c4cc33f4a96ceb3264c2233adde89e9c71d0333`。
- 验证：`uv run ruff check backend`、`uv run pytest`（157 passed，56 条既有依赖/异步线程收尾警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（184 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run 和 `git diff --check` 均通过；远端构建前端成功；容器 `healthy`；容器内确认 release `260815014822` 已进入前端构建产物；生产数据库为 `20260814_23 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未进行真实 iOS/Android PWA、冰箱或 Kindle 设备人工验收；远端构建保留既有 tar 扩展属性、npm engine/audit 和 pip root 用户警告，未影响构建与发布。
- 下一步：在真实设备复测本次发布涉及的页面、登录和排序/拖动流程；发现问题时使用本次数据库备份及上一版镜像处理回滚。

### 2026-08-15 — 物品列表增加价格排序（本次会话）

- 状态：待评审。
- 目标：在物品列表右上角排序菜单增加“价格最低”和“价格最高”，有价格的物品按价格排序，无价格的物品排在末尾并沿用默认排序。
- 范围：前端物品列表排序纯函数、排序偏好校验、右上角排序菜单及相关前端测试；不修改后端接口、价格存储和其他列表字段展示。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §8.3；`docs/functional-design-and-feasibility.md` §3.6；现有 `frontend/src/inventoryListFilters.ts`、`frontend/src/inventoryList.tsx` 和价格字段契约。
- 预期验证：覆盖最低价/最高价、无价格项默认排序、排序偏好持久化及菜单文案；运行前端 lint、测试、生产构建和 `git diff --check`。
- 会话记录：已确认当前排序方案由前端共享工具统一处理，价格金额以 API 返回的两位小数字符串保存；新增 `price-low`/`price-high` 两个排序键，复用分值解析进行精确比较，价格相同或无价格时回退到最近添加顺序；菜单沿用现有顶部栏弹出结构并新增对应图标。
- 完成：物品列表右上角排序菜单已增加“价格最低”和“价格最高”；最低价升序、最高价降序，有价格的项目优先，无价格项目最后且按默认“最近添加”顺序排列；排序偏好可继续跨物品列表保存和恢复；功能设计文档已同步。
- 验证：`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run App.test.ts` 通过（102 passed）；`npm run --prefix frontend test -- --run` 通过（184 passed，18 files）；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：真实手机 WebView 和视觉像素核验。
- 下一步：在评审环境打开物品列表排序菜单，人工确认五个选项、价格升降序、无价格项末尾顺序和切换页面后的偏好保持；确认后将本条标记为完成。

### 2026-08-15 — 修复 P13.4 后台 SSO 与深链初始化审查问题（本次会话）

- 状态：进行中。
- 目标：修复后台恢复完成移动 SSO 后 UI 不刷新，以及深链原生桥初始化失败后永久失去深链能力的问题。
- 范围：移动认证完成事件、App 所有者状态刷新、深链初始化状态机与失败重试；不扩展深链路径、正式签名配置或 P13.5 原生能力。
- 设计/需求基线：本次代码审查结论、`frontend/src/mobileAuth.ts`、`frontend/src/deepLink.ts`、`frontend/src/main.tsx` 和 `docs/development-execution-plan.md` P13.4。
- 预期验证：覆盖后台 SSO 成功后的所有者刷新、深链监听/冷启动初始化成功与失败重试；运行前端 lint/test/build、Android/iOS 构建、后端质量门禁和 `git diff --check`。
- 会话记录：待实现。
- 完成：待实现。
- 验证：待执行。
- 未验证：真实设备系统浏览器回跳、原生桥故障恢复和 P13.5–P13.7。
- 下一步：完成修复后重新审查后台登录和深链恢复路径。

### 2026-08-15 — 我的冰箱长按拖动排序（本次会话）

- 状态：待评审。
- 目标：在“我的冰箱”页支持长按冰箱条目进入拖动排序，并以目标条目上下半区判断前插/后插，实时显示和清除插入位置横线。
- 范围：前端冰箱列表交互、本机排序顺序持久化、首页横扫顺序复用、相关纯函数与组件契约测试；不新增后端排序字段或接口，不改变冰箱业务数据。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §8、§9；最终设计注册表“我的冰箱切换”草稿 `6e7893ee-74d5-4aa4-9db4-45be02e7f9b5` 及本地 `docs/ui-assets/html/pwa-fridge-switcher.html`。
- 预期验证：前端 lint、前端测试、前端生产构建和 `git diff --check`；核对 320/390/430px 下列表无横向溢出，记录未执行的真机/视觉核验项。
- 会话记录：已确认现有列表使用 `/api/refrigerators` 返回顺序，未发现服务端排序契约；采用本机 localStorage 记录 ID 顺序并在服务端列表变化后合并新条目。拖动使用 Pointer Events 和长按计时，只有指针位于其他条目的上/下半区才显示插入线；拖动结束后抑制随后的误点击，取消拖动时清除计时器和插入状态。
- 完成：新增 `frontend/src/fridgeOrdering.ts` 处理本机顺序合并、前后插入和半区命中；`FridgeSwitcher` 支持长按 350ms 进入拖动、8px 移动阈值取消长按、卡片上下半区插入线和 Pointer Capture；App 状态、页面缓存、启动选择及首页横扫均复用排序后的冰箱数组；需求文档已补充本机排序规则。
- 验证：`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run` 通过（182 passed）；`npm run --prefix frontend build` 通过；`git diff --check` 通过；本地开发服务已启动于 `http://localhost:7003/`。
- 未验证：真实 Android/iOS WebView 的长按与滚动手感、不同系统触摸事件实现、登录后真实数据列表的人工拖动和 320/390/430px 截图核验。
- 下一步：在评审环境登录后人工验证长按、前后半区插入、移出插入区间、排序持久化和首页横扫顺序；确认后将本条标记为完成。

### 2026-08-15 — 修复 P13.4 深链审查问题（本次会话）

- 状态：进行中。
- 目标：修复 P13.4 审查发现的 Android 深链前缀误匹配、原生深链桥初始化失败阻断 App 渲染、以及 React 监听注册竞态导致后台配对链接丢失问题。
- 范围：Android Manifest 路径匹配、前端深链初始化降级与 pending link drain、对应前端契约测试和 P13.4 验证记录；不扩展正式签名配置、真实设备验收或 P13.5 原生能力。
- 设计/需求基线：本次代码审查结论、`docs/mobile-deployment-design.md` §6、`docs/development-execution-plan.md` P13.4、现有 `frontend/src/deepLink.ts` 和 Capacitor 原生桥。
- 预期验证：非法前缀路径不再匹配、深链桥失败时 App 仍渲染、监听注册后可消费已暂存配对链接；运行前端 lint/test/build、Android/iOS 构建、后端质量门禁和 `git diff --check`。
- 会话记录：已将 Android Manifest 的两个 `pathPrefix` 改为精确 `path`，避免错误路径被 App 接管；原生深链初始化失败时继续渲染前端；React 注册深链事件后立即 drain 已暂存配对链接，补充 Manifest 静态契约测试。
- 完成：审查发现的三个问题已修复，P13.4 业务代码和原生构建范围未扩展。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（157 passed，54 条依赖/迁移及既有异步线程警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（179 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、iOS Simulator Debug `xcodebuild`、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：真实 Android/iOS 设备系统路由、正式关联文件部署和 P13.5–P13.7。
- 下一步：完成修复后重新进行 P13.4 真实设备验收。

### 2026-08-15 — P13.4 App Links、Universal Links 和二维码配对（本次会话）

- 状态：待评审。
- 目标：让公开登录/配对 URL 在已安装 Capacitor App 时进入 App，未安装时继续进入 PWA；完成深链接收、白名单校验、短效配对 token 消费和状态清理。
- 范围：公开深链路径与 PWA fallback、Android App Links/iOS Universal Links 关联文件、Capacitor 冷启动/后台恢复 URL 处理、配对 token 前端消费与回归测试；不实现 P13.5 原生扫码/分享/通知/系统手势，不生成正式签名或商店产物。
- 设计/需求基线：`docs/mobile-deployment-design.md` §5.4、§6，`docs/architecture/adr/0004-capacitor-mobile-and-pwa.md`，`docs/development-execution-plan.md` P13.4，现有 P13.3 移动认证和二维码配对协议；正式包名为 `com.fridgeboard.app`，公开域名为 `https://fridge.flycn.fyi`，待环境确认正式 Android SHA-256 指纹和 Apple Team ID。
- 预期验证：覆盖深链路径白名单、恶意/错误域名参数、App 冷启动和后台恢复、token 清理、过期/重复消费、未安装 PWA fallback；运行后端/前端质量门禁、Android/iOS 可用构建和 `git diff --check`。
- 会话记录：已确认当前项目已有移动 SSO 回调 `/mobile/auth/callback`、PWA `/pair` 入口和 `pairingFlow` 消费逻辑；本轮新增 `DeepLink` Capacitor 原生桥，接收 Android/iOS 冷启动与后台恢复 URL，前端只接受公开域名白名单路径并将配对 token、SSO code/state 保存在 App 内存；后端新增环境变量驱动的两份关联文件，未配置正式签名信息时保持 PWA fallback。
- 完成：Android Manifest 已声明 `/pair` 与 `/mobile/auth/callback` App Links；iOS Associated Domains、SceneDelegate URL 转发和 Xcode Sources 已接入；移动 SSO 回调与配对消费复用现有 P13.3 流程；新增前后端深链/关联文件契约测试和部署文档。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（157 passed，52 条既有依赖/迁移警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（178 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、iOS Simulator Debug `xcodebuild`、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：正式 Android SHA-256 签名指纹、Apple Team ID、生产关联文件部署、真实 Android/iOS App Links/Universal Links 系统接管、冷启动/后台恢复真机流程和未安装回退；P13.5–P13.7 未实施。
- 下一步：先在正式签名配置和真实设备上验收 P13.4，再进入 P13.5 原生扫码、分享、通知和系统手势。

### 2026-08-14 — 修复 P13.3 审查问题（本次会话）

- 状态：待评审。
- 目标：修复 P13.3 审查发现的 App Owner Bearer 未覆盖 `owner_or_device`、设备 401 错误刷新 Owner 会话、已有冰箱首次配对缺少移动设备凭证、多冰箱设备凭证选择错误和配对响应契约缺失问题。
- 范围：后端认证依赖与配对响应模型、前端移动设备凭证安全存储和请求重试策略、首次配对 payload、专项回归测试；不扩展 P13.4 深链、正式签名或真机验收范围。
- 设计/需求基线：本次代码审查结论、`docs/mobile-deployment-design.md` §5、`docs/development-execution-plan.md` P13.3、PWA Cookie 与 App Bearer/设备 Bearer 分离约束。
- 预期验证：覆盖 Owner Bearer 识别/扫码、设备 401 不刷新 Owner、已有冰箱移动配对、多冰箱设备凭证选择和响应模型；运行后端/前端质量门禁、Android/iOS 构建和 `git diff --check`。
- 会话记录：已在 `owner_or_device` 接入 App Owner Bearer；前端按 Owner/设备认证类型分流，`/api/daily/*` 和 `/api/devices/*` 不再触发 Owner refresh，设备 401 只清理当前设备凭证；首次配对所有分支均发送 `client=mobile`，设备凭证按冰箱 ID 存储并在切换日常冰箱时激活；配对接口恢复显式响应模型。
- 完成：新增 Owner Bearer 路由回归、移动配对响应和设备凭证分流逻辑；PWA 默认 Cookie 与响应 JSON 兼容性保持不变。
- 验证：专项后端 23 passed；`uv run ruff check backend`、`uv run pytest -q`（156 passed，53 条警告，其中包含既有 aiosqlite 线程收尾警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（176 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、iOS Simulator Debug `xcodebuild`、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：未在真实 Android/iOS 设备验证多台冰箱切换、设备撤销后的 UI 恢复、系统浏览器 SSO 和深链；P13.4–P13.7 仍未实施。
- 下一步：人工验收原生 App 的 Owner/daily 双身份切换和设备撤销恢复；通过后继续 P13.4 深链与二维码配对。

### 2026-08-14 — P13.3 App 会话、安全存储和撤销（本次会话）

- 状态：待评审。
- 目标：实现 Capacitor App 的一次性授权码交换、短期访问令牌、刷新令牌轮换、退出/服务端撤销，并建立 Android Keystore/iOS Keychain 安全存储桥；保持 PWA 的 HttpOnly Cookie 认证不变。
- 范围：AppSession/移动授权码数据库模型与迁移、`/api/auth/mobile/*` 协议、Owner/Bearer 请求适配、原生安全存储桥、认证单元/接口测试和日志脱敏契约；不实现 App Links/Universal Links 关联文件、原生扫码或正式签名发布。
- 设计/需求基线：`docs/mobile-deployment-design.md` §5–§6、`docs/architecture/adr/0004-capacitor-mobile-and-pwa.md`、`docs/development-execution-plan.md` P13.3、现有 `OwnerSession`/`DeviceCredential`/PWA 配对协议；一次性 code + state/PKCE，长期凭证不得进入 URL、Web Storage、日志或普通 WebView Cookie。
- 预期验证：新增有效/过期/重复 code、PKCE/state 不匹配、刷新轮换、退出/撤销后 401、前端不使用 Web Storage 保存令牌、原生桥接注册和日志脱敏测试；运行后端 Ruff/pytest、前端 lint/test/build、Android debug 构建和 `git diff --check`。
- 会话记录：已确认当前 OwnerSession 只支持 Cookie、设备凭证虽支持 Bearer 但配对接口只写 Cookie，Capacitor 没有安全存储插件；本轮新增 `20260814_23` 移动授权码/AppSession、固定公开回调路径、PKCE S256、15 分钟访问令牌、30 天刷新令牌轮换和 logout 撤销。Owner Bearer 只进入所有者依赖，配对 `client=mobile` 只返回一次设备 Bearer；PWA 默认行为不变。
- 完成：Android `SecureSession` 插件使用 Android Keystore + AES-GCM，iOS `SecureSession` 插件使用 `WhenUnlockedThisDeviceOnly` Keychain；前端认证事务/令牌不写 `localStorage` 或 `sessionStorage`，Capacitor 请求在 401 时单飞刷新，刷新失败清理安全存储；Android/iOS 原生工程已注册桥接。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（156 passed，52 条既有警告）、`uv lock --check`、`uv run alembic upgrade head`（包含 `20260814_23`）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（176 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend build:android`、`xcodebuild -project frontend/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/fridgeboard-ios-derived CODE_SIGNING_ALLOWED=NO build` 和 `git diff --check` 均通过。
- 未验证：未在真实 Android/iOS 设备完成系统浏览器 SSO 回跳、杀进程重启后的 Keychain/Keystore 读取、服务端撤销后真机 401 清理；App Links/Universal Links、正式签名、P13.4 深链和 P13.5 原生扫码仍未实施。
- 下一步：进入 P13.4 前先准备正式包名/Team ID/签名指纹和公开 HTTPS 关联文件，完成已安装/未安装 App 的深链与二维码配对回归。

### 2026-08-14 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD`（`7a49f62`）发布到生产服务器，自动生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不修改业务代码、生产配置或手工 release 号。
- 设计/需求基线：项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`README.md` 发布流程；`scripts/deploy-image.sh`。
- 预期验证：后端/前端质量门禁、锁文件检查、发布脚本语法与 dry-run；发布脚本成功、远端容器变为 `healthy`、HTTPS `/healthz` 返回成功；记录 release、镜像摘要和未验证项。
- 会话记录：已确认工作区无未提交改动，发布配置文件存在，脚本将从当前 `HEAD` 归档并在发布归档中注入 release。
- 完成：正式发布当前 `main` 的 `HEAD`（`7a49f62`），生成 release `260814180840`；生产容器完成 Docker 重建并健康启动；远端数据库备份为 `/data/fridgeboard.db.backup-20260814-100849`；容器镜像 ID 为 `sha256:d6fb3433d341ab09a9496748ba24dd58ae57c8ef9f3b19e07c496f28c50eb1fd`，Compose 构建镜像摘要为 `sha256:6353501805313a34cbd3fe3c5884a460034847efc37e3823b35d9492b6e87287`。
- 验证：`uv run ruff check backend`、`uv run pytest`（151 passed，52 条既有警告）、`uv lock --check`、前端 lint、前端测试（174 passed）、前端生产构建、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run 和 `git diff --check` 均通过；发布脚本远端容器健康检查通过；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未进行真实 iOS/Android PWA、冰箱或 Kindle 设备人工验收；远端构建保留既有 npm `EBADENGINE`、npm audit 和 pip root 用户警告，未影响构建与发布。
- 下一步：在真实设备复测本次发布涉及的页面、登录和订单/库存流程；发现问题时使用本次数据库备份及上一版镜像处理回滚。

### 2026-08-14 — 将冰箱布局外框改为圆角（本次会话）

- 状态：待评审。
- 目标：将共享冰箱布局预览的外框改为圆角，保持现有外壳尺寸、内部结构、模板比例和交互不变。
- 范围：`frontend/src/styles.css` 中 `OpenFridge` 使用的柜体与冰箱门外框样式；不修改布局计划、分区尺寸和页面壳。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §4.2、§9.1；最终设计注册表中的“冰箱布局预览”草稿 `e5c35dea-610f-42f9-878b-1f716c2e7d4f` 及本地 `docs/ui-assets/png/pwa-layout-preview.png`、`docs/ui-assets/html/pwa-layout-preview.html`。
- 预期验证：前端 lint、前端测试、生产构建和 `git diff --check`；确认变更只作用于共享冰箱外框。
- 会话记录：已定位共享 `OpenFridge` 的 `.open-fridge-cabinet` 与 `.open-fridge-door` 外框当前未设置圆角；计划使用规范允许范围内的统一小圆角，并通过样式与现有组件回归检查确认不改变布局尺寸和内容裁切。
- 完成：新增 `--fridge-frame-radius: 4px` 令牌，柜体与门架外框统一使用该圆角；内部区域和格位继续保持直角，未改变布局计划、尺寸或交互；新增样式契约测试。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（174 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实手机或不同浏览器 WebView 中进行触摸与像素级视觉验收。
- 下一步：评审环境检查标准、迷你、双门/法式及布局编辑状态下的外框圆角是否符合预期；确认后将本条标记为完成。
- 会话追加：用户反馈 `4px` 圆角视觉上不明显；本次将共享 `--fridge-frame-radius` 调整为 `10px`，同步更新样式契约测试，并重新执行前端 lint、测试、构建和 `git diff --check`。
- 验证追加：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（174 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。

### 2026-08-14 — 规范 Android APK 产物名称并补充部署说明（本次会话）

- 状态：完成。
- 目标：将 Android Debug APK 重命名为项目相关名称，并在 README 中补充不依赖开发者本机绝对路径的构建、安装和启动流程。
- 范围：`frontend/scripts/build-android.sh` 与 `README.md`；不改变 Android 包名、签名配置或业务代码。
- 设计/需求基线：用户本次明确要求；现有 Android Java 21 构建脚本和 Debug APK 部署流程。
- 预期验证：shell 语法检查、Android Debug 构建、产物名称检查和 `git diff --check`。
- 完成：Debug 构建脚本在 `assembleDebug` 成功后生成项目相关名称 `FridgeBoard-debug.apk`，README 补充了相对路径构建、ADB 安装、启动、多设备选择和卸载命令。
- 验证：`sh -n frontend/scripts/build-android.sh`、`npm run --prefix frontend build:android` 和 `git diff --check` 均通过；构建实际生成 `frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk`。
- 会话追加：已在 ADB 设备 `28ffa63d` 上执行 `adb install -r` 并成功启动 `com.fridgeboard.app/.MainActivity`；前台 Activity 和应用进程正常，设备截图显示“我的冰箱”首页，启动后未发现崩溃日志。
- 未验证：尚未验证登录、扫码、新建冰箱、相机权限和远程 API 等完整业务流程。
- 下一步：按 P13 真机验收清单继续验证登录、扫码、新建冰箱和远程 API 流程。

### 2026-08-14 — 移除 Android 手机触摸与焦点视觉反馈（本次会话）

- 状态：待评审。
- 目标：禁止 Android 手机网页/PWA 中控件因触摸或获得焦点而变色、显示蓝色触摸背景、橙色/其他焦点框或焦点阴影。
- 范围：手机端共享 `frontend/src/styles.css` 及对应静态契约测试；保留控件可操作性和键盘/屏幕阅读器语义，不改变业务状态选中态、错误态和识别取景框等主动视觉状态；不修改 Kindle 独立页面样式。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §8.3 的触摸焦点规则与本次需求冲突，本次需求覆盖该规则中的可见焦点框要求；现有 Android 10 橙色焦点框和高版本 Android 蓝色触摸背景问题经验。
- 预期验证：新增共享样式静态契约断言；运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；未连接 Android 真机时记录为未验证。
- 会话记录：已确认 `styles.css` 存在未覆盖按钮/自定义控件的 `:focus-visible` 外框、冰箱格位 `:active` 反色，以及搜索容器 `:focus-within` 改边框颜色；在共享 CSS 末尾增加 Android 触摸高亮透明、所有元素 focus/focus-visible 外框和阴影归零、搜索边框颜色归零及冰箱格位触摸态归零，并覆盖食谱空状态按钮的 focus 颜色。
- 完成：Android/PWA 共享样式不再显示系统蓝色 tap highlight、焦点框或焦点阴影；冰箱库存格位触摸不再黑底反色；搜索容器获得焦点不再变边框色；新增 CSS 静态契约测试，保留业务选中态、错误态和扫描取景框等主动状态。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（173 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未连接 Android 10 或更高版本真机/PWA，未实测不同 Android WebView/Chrome 版本中的系统焦点框和触摸高亮；未执行 Playwright 视觉核验和生产发布。
- 下一步：评审环境使用 Android 10 及更高版本手机逐一点击按钮、链接、输入框、选择框、冰箱格位和底部导航，确认无蓝色触摸背景、焦点框或触摸变色；通过后再将本条标记为完成。

### 2026-08-14 — 修复 P13 审查问题（本次会话）

- 状态：待评审。
- 目标：修复 P13 审查发现的原生 API 跨源请求、登录跳转、图标资源地址、Android instrumentation 测试、前端 lint 扫描范围和 Java 运行时绑定问题。
- 范围：Capacitor/PWA 运行时适配、FastAPI CORS 配置与测试、Android 构建脚本和测试夹具；不在本次实现 App SSO、Keychain/Keystore、深链或正式签名。
- 设计/需求基线：`docs/mobile-deployment-design.md`、`docs/architecture/adr/0004-capacitor-mobile-and-pwa.md`、上一轮 P13 代码审查结果；PWA 继续同源 Cookie/Service Worker，原生端继续 Bearer 会话待 P13.3 接入。
- 预期验证：前端 lint/test/build；后端 Ruff/pytest；Android `assembleDebug`、单元测试和可用环境下 instrumentation 构建；`git diff --check`。
- 完成：Capacitor 原生请求和图标资源统一解析到 API Origin；所有者登录跳转改为远程 API 地址；FastAPI 仅允许 `https://localhost` 与 `capacitor://localhost` 的 CORS，拒绝未知 Origin；原生目录不再被前端 lint 扫描；修正 Android instrumentation 包名和 Kotlin jdk7/jdk8 重复类；移除 Gradle Java 绝对路径，新增标准 `JAVA_HOME`/Android Studio JBR 自动发现脚本。
- 验证：前端 lint、测试（172 passed）、build；后端 Ruff、pytest（151 passed）；Android `assembleDebug`、`testDebugUnitTest`、`assembleDebugAndroidTest`；脚本 `sh -n`；`git diff --check` 均通过。
- 未验证：未连接 Android 真机/模拟器执行 `connectedDebugAndroidTest`；未执行 Android AAB、iOS archive/IPA、真机登录、深链、相机权限、系统返回手势和远程 API 实测。
- 待决策：无。第 6 项采用标准环境变量/IDE 配置方案，不绑定任何开发者本机路径。
- 下一步：P13.3 App 会话、安全存储和撤销 Spike；进入前先完成 CORS 真实 WebView 请求、系统浏览器 SSO 回跳和 Bearer 会话协议设计。

### 2026-08-14 — 固定 Android Gradle 使用 Java 21（本次会话）

- 状态：待评审。
- 目标：为 FridgeBoard Android 工程固定 Gradle Daemon 使用 Java 21，避免本机默认 Java 25 触发 `Unsupported class file major version 69`，且不改变其他工程和桌面应用的 Java 环境。
- 范围：`frontend/android` Gradle Daemon JVM 配置、P13 进度和本会话验证记录；不修改全局 `JAVA_HOME`、DBeaver/Oracle 配置或其他项目。
- 设计/需求基线：用户本次明确要求；Gradle 8.14.3 项目级 Daemon JVM 配置；P13 Android 构建阻塞记录。
- 预期验证：在默认 Java 25 环境下确认 Gradle 使用项目指定的 Java 21，并执行 Android debug 构建；运行 `git diff --check`。
- 会话记录：已确认本机默认 Java 25 会复现 Groovy `Unsupported class file major version 69`；首次新增 `gradle/gradle-daemon-jvm.properties` 后 Gradle 虽识别 Java 21 要求，但因未配置下载源而尝试自动下载并失败。现改为在 `frontend/android/gradle.properties` 显式指向已验证存在的 Android Studio 内置 JBR Java 21，避免自动下载并保持配置只对本 Android 工程生效。
- 完成：在不设置 `JAVA_HOME` 的默认 Java 25 shell 中，Gradle `-version` 显示 Daemon 使用 `/Applications/Android Studio.app/Contents/jbr/Contents/Home`；`env -u JAVA_HOME ./gradlew --no-daemon assembleDebug` 成功生成 `frontend/android/app/build/outputs/apk/debug/app-debug.apk`。`git diff --check` 通过。
- 未验证：尚未在其他 Mac、Android 真机或 release/AAB 签名构建上验证；本次只解决本机 Android debug 构建的 Java 兼容性。
- 下一步：评审环境执行 Android Studio/命令行 debug 构建；后续正式签名发布按独立发布任务配置 release JDK 和签名环境。

### 2026-08-14 — 收紧“选择存放位置”模态框底部空白（本次会话）

- 状态：待评审。
- 目标：让“选择存放位置”弹窗的“确认位置”按钮紧接内容底部排列，仅保留适当的底部 margin，消除当前弹窗固定高度造成的过大空白。
- 范围：P5/P6 位置选择弹窗共享 CSS；不改变位置选择、订单编辑、保存和关闭交互，不调整其他模态框。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §8.2.1；确认位置设计稿 `0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8` 及本地 `docs/ui-assets/png/pwa-confirm-location.png`、`docs/ui-assets/html/pwa-confirm-location.html`。
- 预期验证：确认位置弹窗样式契约/前端相关测试（如有）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认 `p5-location-dialog` 当前设置 `min-height: min(80dvh, ...)`，并让预览网格填满剩余空间；这会把按钮推到弹窗底部并在按钮下方留下过多空白。已移除固定最小高度和 `1fr` 撑满行，改为内容高度收缩；弹窗继续保留最大高度约束，底部由 `16px` padding 提供 margin。
- 完成：P5/P6 两个“选择存放位置”入口共用的 `p5-location-dialog` 现在按预览、位置标签和“确认位置”按钮的实际内容收缩，按钮紧接内容末项排列，不再被弹窗固定高度推离内容。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（171 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实手机或 320/390/430px 浏览器视口进行人工视觉验收；未执行生产发布。
- 下一步：评审环境打开识别订单和添加物品的位置选择弹窗，确认“确认位置”按钮下方仅保留适当 margin，并检查窄屏及较高冰箱布局下内容不会溢出。

### 2026-08-14 — 修复识别订单跨冰箱分类复用与无分类兜底（本次会话）

- 状态：待评审。
- 目标：让识别订单的同名商品分类缓存跨冰箱复用；当历史没有分类记录或模型没有返回有效分类时，尽可能基于全局缓存、当前候选名称和订单识别模型结果自动选择小类，避免订单项直接成为无分类。
- 范围：P6 订单识别分类解析、全局内置小类映射缓存、库存/手工分类写入缓存、相关后端迁移与回归测试、必要的前端订单识别回归测试及本进度记录；不跨冰箱复用冰箱专属自定义小类，不改变订单数量/价格/位置和普通手工录入语义。
- 设计/需求基线：用户本次明确反馈；`docs/functional-design-and-feasibility.md` §6.4、§6.8–§6.9；现有 `item_category_mappings`、订单识别路由和 P6 订单识别页面。
- 预期验证：补充跨冰箱同名分类、无历史分类时的订单分类兜底和全局缓存写入回归；运行 `uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认前端订单识别只从当前冰箱库存继承同名商品的存放位置，后端分类缓存以 `refrigerator_id + normalized_item_name` 为键，订单识别不会查询或写入该缓存；模型分类无效时直接返回无分类。计划新增仅指向内置小类的全局商品名映射，并在订单识别解析阶段按全局缓存、当前候选名称和有效模型分类顺序兜底。
- 完成：新增仅指向内置小类的全局商品名映射表及 `20260814_22` 迁移；历史冰箱确认映射按确认状态和置信度回填；库存保存会同步写入全局确认映射。订单识别按当前冰箱确认映射、全局确认/高置信度映射、模型有效分类和当前候选最接近项顺序选择分类，并继续校验分类属于当前冰箱候选，冰箱专属自定义分类不会跨冰箱复用；同步强化订单分类提示词。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（148 passed）、`uv lock --check`、`uv run pytest backend/tests/test_category_matching_migration.py -q`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（171 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增跨冰箱订单分类及迁移回填测试。
- 未验证：尚未在真实手机和真实 Agnes 订单截图上确认不同商品的分类准确率、模型返回异常时的最终候选选择体验；尚未执行生产发布。
- 下一步：评审环境使用两台冰箱分别保存/识别同名商品，确认内置分类跨冰箱复用、自定义分类不泄漏；用无历史分类订单截图确认每项均尽可能自动选中分类后，再按发布门禁部署。

### 2026-08-14 — 修复小类图标重复网络加载（本次会话）

- 状态：待评审。
- 目标：普通页面访问尽可能复用已缓存的静态资源，避免冰箱小分类图标每次进入页面都在后台重复请求；保留“刷新应用”作为主动更新前端静态资源的入口。
- 范围：PWA Service Worker 静态资源缓存策略、对应前端静态契约测试和本进度记录；不改变 `/api` 业务请求、登录状态、页面业务缓存和图标资产内容。
- 设计/需求基线：用户本次反馈；现有 `frontend/public/sw.js`；`frontend/src/pwaCache.ts` 的“刷新应用”清缓存流程；PWA 静态资源与同域 API 约束。
- 预期验证：补充 Service Worker 缓存优先回归断言；运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认 Service Worker 当前对所有非 API GET 先返回缓存、同时后台 `fetch` 并覆盖缓存，小类图标因此每次显示时都会触发后端静态请求；图标 URL 由 `/api/.../icons` 返回，但图标文件本身走同域非 API GET。现有“刷新应用”已负责 Service Worker 更新、删除应用壳缓存和重载页面，可作为唯一主动静态资源更新入口。
- 完成：Service Worker 升级为 `fridgeboard-app-v3`；应用壳和带版本图标资产改为缓存优先，缓存命中不再后台请求后端，缓存未命中才首次加载并写入缓存；普通 `/api` 请求继续绕过 Service Worker。旧缓存由激活阶段自动删除，点击“刷新应用”仍会清理并重载以获取新静态资源。
- 验证：新增 Service Worker 缓存策略静态契约测试；`npm run --prefix frontend test -- --run`（171 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实手机 PWA 的 DevTools 网络面板确认重复进入首页/分类抽屉时图标请求为缓存命中；尚未执行生产发布。
- 下一步：发布后在真实手机首次加载和重复进入冰箱页面复测图标请求；点击“刷新应用”确认能获取新版本静态资源后，将本条标记为完成。

### 2026-08-13 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD`（`b85472c`）发布到生产服务器，自动生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不修改业务代码、生产配置或手工 release 号。
- 设计/需求基线：项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`scripts/deploy-image.sh`。
- 预期验证：后端/前端质量门禁、锁文件检查、发布脚本语法与 dry-run；发布脚本成功、远端容器变为 `healthy`、HTTPS `/healthz` 返回成功；记录 release、镜像摘要和未验证项。
- 会话记录：已确认工作区干净、当前分支为 `main`，发布配置指向生产固定 IP；本次发布包含价格输入框、订单批量添加状态合并和食谱历史返回白屏修复。
- 完成：正式发布当前 `main` 的 `HEAD`（`b85472c`），生成 release `260813141326`；生产容器完成 Docker 重建并健康启动；远端数据库备份为 `/data/fridgeboard.db.backup-20260813-061334`，镜像摘要为 `sha256:8f5edcd10a48ccb8e87fce809e22b62a9f7934fcfeb1ed7682fe4bd1ca550f96`。
- 验证：`uv run ruff check backend`、`uv run pytest`（146 passed，45 条既有警告）、`uv lock --check`、前端 lint、前端测试（170 passed）、前端生产构建、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run 和 `git diff --check` 均通过；发布脚本远端容器健康检查通过；首次本机 HTTPS 检查因代理链路超时退出 28，重试 `https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`，服务器日志中的健康探针返回 200。
- 未验证：真实手机、冰箱或 Kindle 设备人工验收。
- 下一步：按本次涉及功能执行真实设备验收；重点复测添加物品价格保存、订单识别多项连续添加、分类/位置保存及食谱历史详情返回。

### 2026-08-13 — 添加物品页面增加价格输入（本次会话）

- 状态：待评审。
- 目标：在“添加物品”页面增加可选价格输入框，并确保手工录入的价格随现有库存保存链路提交。
- 范围：P5 添加物品前端表单、价格字段样式与前端回归测试；不修改后端价格字段、编辑物品价格、订单识别价格和价格计算规则。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §7 表单规范；`docs/functional-design-and-feasibility.md` §3.4、§6.5；最终设计注册表中的“添加物品：识别与基础信息”稿及本地 `docs/ui-assets/png/pwa-add-food.png`；现有编辑物品价格控件和 `saveP5Inventory` 提交链路。
- 预期验证：新增添加物品价格字段渲染回归断言；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认添加页草稿初始化和现有 `saveP5Inventory` 已支持 `price`，缺口仅为添加页表单控件；按编辑物品的既有价格控件复用人民币前缀、两位小数输入和可选空值语义。
- 完成：添加物品页在“品牌 / 规格 / 备注”右侧增加“价格”输入框，填写内容复用现有 `draft.price` 并随加入冰箱请求提交；新增添加页价格字段渲染回归测试。
- 验证：聚焦价格测试通过；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（170 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实 iOS/Android 设备上进行键盘、金额输入法和触摸布局验收；未执行生产发布。
- 下一步：提交评审；如进入发布流程，按既有发布门禁在真实设备复测添加物品价格填写、保存后列表价格展示和合计。

### 2026-08-13 — 修复识别订单批量添加只保留最后一项（本次会话）

- 状态：待评审。
- 目标：修复扫描照片识别订单后，逐项修改分类和同一冰箱内存放位置并点击“添加”时，冰箱最终只显示最后一项的问题。
- 范围：P6 识别订单前端提交链路、库存新增接口调用/事务边界、必要的后端与前端回归测试、线上容器日志排查及本进度记录；不改变普通手工录入、订单识别字段解析和跨冰箱移动语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §6.8–§6.9；现有 `frontend/src/InventoryFlow.tsx` 订单识别流程、库存保存接口和 P6 订单识别回归测试。
- 预期验证：线上日志与请求链路核对；新增可复现回归用例；`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认订单页在 `addSelectedOrderItems` 中逐项调用 `onSave`；生产日志显示同一次操作连续收到多次 `POST /api/owner/refrigerators/{id}/inventory` 且均为 `201 Created`，后端没有批量写入失败。根因是 `saveP5Inventory` 每次用旧的 `inventory` 闭包构造本地列表，连续保存时后一次响应覆盖前一次响应，导致页面只显示最后一项；数据库写入仍已成功。
- 完成：新增 `upsertInventoryBatch`，并由 `App` 使用库存 ref 基于最新列表合并每次保存响应；工作区刷新、删除和批量删除同步维护 ref，避免连续订单添加或后续操作继续使用旧状态。新增三项连续保存回归测试。
- 验证：生产容器 `fridgeboard-app` 健康运行；线上日志核对到该识别流程的连续库存 POST 全部为 `201 Created`；`npm run --prefix frontend test -- --run`（169 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实手机上使用包含多项、不同分类和不同存放位置的订单截图点击“添加”完成人工验收；未执行生产发布，当前修复仅在工作区。
- 下一步：发布包含本修复的前端资源后，使用真实订单截图复测多项添加、分类/位置保存、同名归并和失败重试；确认通过后将本条标记为完成。

### 2026-08-13 — 发布当前 main 到生产（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD`（`31ff6e8`）发布到生产服务器，自动生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不修改业务代码、生产配置或手工 release 号。
- 设计/需求基线：项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`scripts/deploy-image.sh`。
- 预期验证：后端/前端质量门禁、锁文件检查、发布脚本语法与 dry-run；发布脚本成功、远端容器变为 `healthy`、HTTPS `/healthz` 返回成功；记录 release、镜像摘要和未验证项。
- 完成：正式发布当前 `main` 的 `HEAD`（`31ff6e8`），生成 release `260813015447`；生产容器完成 Docker 重建并健康启动；远端数据库备份为 `/data/fridgeboard.db.backup-20260812-175455`。
- 验证：`uv run ruff check backend`、`uv run pytest`（146 passed，45 条既有警告）、`uv lock --check`、前端 lint、前端测试（168 passed）、前端生产构建、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run 和 `git diff --check` 均通过；发布脚本容器健康检查通过；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未进行真实手机、冰箱或 Kindle 设备人工验收；构建日志存在既有 npm engine/audit 警告，但未影响构建和发布。
- 下一步：按既有待评审事项在目标设备进行人工验收；如发现问题，优先使用已生成的数据库备份和上一版镜像回滚方案。

### 2026-08-13 — 修复食谱历史详情返回白屏（本次会话）

- 状态：待评审。
- 目标：修复从“食谱历史”某周详情点击左上角返回后出现白屏、无法回到历史列表的问题。
- 范围：手机端 P9 食谱历史列表/详情页面壳身份与返回动画状态、相关前端回归测试和本进度记录；不改变历史食谱读取、复制到本周/下周及底部导航语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §5–§10；P9 功能规则 `docs/functional-design-and-feasibility.md` §9；既有 `RecipeWorkspace`、共享 `PageHeader`/`PageShell` 和历史详情本地设计资产。
- 预期验证：新增历史详情返回回归断言；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认历史列表与详情使用相同标题和页面壳，React 会复用返回动画已标记退出的 `PageHeader`/`PageShell` 实例；已将两页改为不同稳定 key，使详情返回时重新挂载历史列表页面壳，避免退出状态泄漏。
- 完成：历史列表使用 `recipe-history`，历史详情使用 `recipe-history-detail`；新增页面身份纯函数和回归断言，返回详情后重新渲染历史列表，不改变历史读取和复制操作。
- 验证：聚焦回归测试通过；`npm run --prefix frontend test -- --run`（166 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 上点击历史详情左上角返回键进行触控和视觉验收；未执行生产发布。
- 下一步：评审环境进入“食谱历史”并打开任一周，点击左上角返回，确认回到历史列表且不白屏；通过后并入 P9/P11 设备验收。

### 2026-08-12 — 移除首页无意义的“正在管理”警告（本次会话）

- 状态：待评审。
- 目标：移除首页右上角由“正在管理：冰箱”触发的无意义警告图标和“首页提示”弹窗，同时保留真正的临期、过期和设备通知。
- 范围：手机端首页提醒展示条件、首页回归测试和本进度记录；不改变冰箱管理操作、通知轮询或真实通知内容。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §8.2；`docs/functional-design-and-feasibility.md` §9.3；最终本地 `pwa-home` 设计资产；现有 `FridgeHome` 与 `dueNotifications` 链路。
- 预期验证：新增首页通用消息不显示警告、真实通知仍显示的回归断言；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已定位首页将通用 `notice` 与 `dueNotifications` 共用右上角感叹号入口；`openSettings` 成功后写入的“正在管理：冰箱”因此被错误展示为“首页提示”。
- 完成：`FridgeHome` 不再接收或展示通用 `notice`，首页感叹号仅由真实 `dueNotifications` 触发；新增回归断言覆盖无通知和有通知两种状态。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（165 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 上点击首页管理入口并确认返回首页后的视觉状态；未执行生产发布。
- 下一步：评审环境打开首页，进入并返回冰箱管理页，确认不再出现“正在管理：冰箱”警告；确认存在临期/设备通知时感叹号仍正常显示。

### 2026-08-12 — 修复数量输入中间态被刷新覆盖（本次会话）

- 状态：待评审。
- 目标：统一物品列表、编辑食谱食材和购物清单数量框的输入行为，允许先删空或输入小数中间态，失焦时才恢复最近一次有效值。
- 范围：共享数量控件调用链、库存列表草稿同步、食谱食材和自定义购物项数量草稿；不改变加减 1、最小值和保存接口。
- 设计/需求基线：用户明确反馈“单个数字不能删除，停顿后被恢复”；现有 `QuantityStepper`、`parseQuantity` 和各页面保存逻辑。
- 预期验证：浏览器实际模拟删空、输入小数和失焦恢复；前端 lint、测试、构建和 `git diff --check`。
- 会话记录：定位到库存列表刷新 effect 会无条件把服务端数量写回草稿，且空值不会排队保存；编辑食谱和购物清单则需要保留空字符串并按该行旧值恢复。
- 完成：共享数量输入改为可保留中间字符串的文本输入，继续使用十进制键盘；库存列表不再用服务端刷新覆盖空草稿；编辑食谱和购物清单记录最近一次有效数量，失焦时才恢复；非法中间态不触发保存。
- 验证：Playwright 实测物品列表删空后等待 `1.5s` 仍为空，失焦恢复原值，重新输入 `1.5` 保持小数；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（164 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 下一步：提交评审；真实设备键盘和触摸热区仍按既有发布验收流程执行。

### 2026-08-12 — 修复小数食谱完成接口 500（本次会话）

- 状态：完成。
- 目标：修复最新版发布后，点击每周食谱完成按钮因 `ck_consumption_line_quantity` 仍要求整数而返回 500 的问题。
- 范围：Alembic 数量迁移约束、食谱完成接口回归测试、生产迁移与线上验证；不改变库存扣减和撤销语义，不直接修改生产数据库业务数据。
- 设计/需求基线：线上容器日志（`POST .../recipes/{id}/complete`、`sqlite3.IntegrityError`）；`20260812_20` 小数数量迁移；现有 P9 食谱完成/撤销流程。
- 预期验证：新增小数食谱完成接口测试；迁移后检查 `consumption_lines` 约束；`uv run ruff check backend`、`uv run pytest`；发布后容器健康、数据库迁移 head 和完成接口回归验证。
- 会话记录：已确认生产数据库已在 `20260812_20`，但该迁移只修改了列类型，未移除旧的 `quantity >= 1` 检查约束；新增前向迁移 `20260812_21`，删除旧约束并改为 `quantity >= 0.01`，避免修改已执行迁移。
- 完成：新增半份食谱完成/撤销接口回归测试，以及从 `20260812_20` 升级到 head 后检查消费审计约束的迁移测试。
- 验证：`uv run ruff check backend`、`uv run pytest`（146 passed，45 条既有警告）、聚焦测试（17 passed）和 `git diff --check` 均通过；首次正式发布生成 release `260812223204` 并完成健康检查；因未提交迁移文件未生效后，单独补传已验证的 `20260812_21`，再次备份数据库并重建容器；生产数据库为 `20260812_21 (head)`，`consumption_lines` 约束为 `quantity >= 0.01`，容器 `healthy`，公网 `/healthz` 返回 `{"status":"ok"}`，重建后无迁移异常、500 或 traceback。
- 未验证：未使用真实用户凭证再次点击线上每周食谱完成按钮；当前工作区新增迁移尚未提交，后续正式发布前必须提交该迁移，否则 `git archive HEAD` 不会包含它。
- 下一步：提交并评审本次修复文件后再进行下一次常规发布；真实设备点击一次半份食谱完成并撤销作为人工验收。

### 2026-08-12 — 发布当前版本并更新本地数据库（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 发布到生产服务器，并把本地开发环境数据库升级到当前 Alembic head。
- 范围：正式发布脚本、生产数据库在线备份与容器迁移、本地 SQLite 迁移和发布后健康检查；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh`；当前 Alembic 迁移 `20260812_19`、`20260812_20`。
- 预期验证：后端/前端质量门禁、锁文件检查、发布脚本语法与 dry-run、本地数据库升级到 `head`、生产容器健康和公网 `/healthz`。
- 会话记录：已确认当前工作区干净且生产发布脚本会在重建前在线备份数据库、容器启动时自动执行前向迁移；本次同时更新本地开发数据库结构。
- 完成：本地根目录 `fridgeboard.db` 已确认升级到 `20260812_20 (head)`；正式发布当前 `main` 的 `HEAD`，release `260812201315`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260812-121325`，生产容器重建后运行迁移并达到 `healthy`。
- 验证：`uv run ruff check backend`、`uv run pytest`（144 passed，43 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（164 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check` 均通过；生产容器数据库版本为 `20260812_20`，公网 `/healthz` 返回 `{"status":"ok"}`，release 已进入生产静态资源。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；传输过程出现 macOS `com.apple.provenance` 扩展属性提示，不影响发布结果。
- 下一步：在真实设备复测首页冰箱入口、一级导航、购物清单和本次涉及的识图/分类流程；通过后将本条标记为完成。

### 2026-08-12 — 按发布截图恢复物品列表横向数量框视觉（本次会话）

- 状态：待评审。
- 目标：以用户提供的 2026-08-11 晚间发布截图为唯一视觉基线，恢复物品列表右下方 `[-数字+]` 数量框的外框、圆角、按钮字号、分隔线、列宽和行内位置。
- 范围：物品列表横向数量框共享样式及必要的编辑食谱/购物清单兼容规则；不改变添加物品页上下箭头、小数输入、步进加减 1、保存接口或删除语义。
- 设计/需求基线：用户提供的 `codex-clipboard-d620df46-07ed-4b2c-a68d-0f5bf778b10f.jpg`；昨天发布前 Git 提交 `888805a` 及其物品列表页面；现有共享 `QuantityStepper`。
- 预期验证：截图尺寸与 CSS/浏览器实际测量对齐；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：此前只按文字/提交片段恢复了 `− / ＋`，但用户确认仍与发布截图不同；本次将用户当前 `784×1212` 截图按 2x 像素密度模拟为 `392×606` CSS 视口，并复核 `430×932` 视口，确认发布基线是 `106×34px`、`1px` 外框、`8px` 圆角、`1px` 中间分隔线和半角 `+`。
- 完成：修复共享 `.p5-quantity-control` 的 `border-box` 内部轨道溢出：恢复 `106×34px`、`1px` 外框、`8px` 圆角、`1px` 分隔线和 `18px/700` 加减号；补充尺寸契约注释，明确横向 `QuantityStepper` 与添加物品页纵向 SVG `QuantityArrowControl` 必须分离。
- 验证：Playwright 截图 `output/playwright/inventory-392x606-after.png`、`inventory-430x932-after.png`、`inventory-784x1212-after.png` 均确认控件四边框线完整且横向布局稳定；DOM 测量确认控件为 `106×34px`；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（164 passed）、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：未在真实 320/390/430px 手机和 iOS/Android PWA 上确认触摸热区；未验证生产数据库迁移和真实设备回滚。
- 会话追加：用户提供当前版本 `784×1212` 测试截图，显示横向数量框右侧/下侧被裁切；本次必须在 `784×1212` 与 `430×932` 两个固定视口执行浏览器截图和 DOM 尺寸检查，不能只依赖静态 CSS 或单一手机视口。
- 会话追加：用户指出上一轮截图仍与正确发布截图不同，具体为外框圆角不可见、左右加减按钮背景错误地呈白色；本次按正确截图重新采样视觉颜色和边框层级，并重新执行浏览器截图。
- 完成：横向数量框增加 `overflow: hidden` 保留外框圆角；左右 `− / +` 按钮恢复 `var(--paper)` 灰色底，中央数字输入保持 `var(--surface)` 白色底。
- 验证：Playwright `430×932` 截图 `output/playwright/inventory-430x932-gray-buttons.png` 确认圆角、灰色按钮底和白色数字区；DOM 实测外框 `106×34px`、`1px` 边框、`8px` 圆角、`overflow: hidden`，按钮背景 `rgb(242,242,238)`，输入背景 `rgb(255,255,255)`；前端 lint、164 个测试、生产构建、`git diff --check` 均通过。
- 下一步：提交评审；真实设备触摸热区与生产发布仍按既有发布验收流程执行。

### 2026-08-12 — 对齐编辑食谱食材行控件（本次会话）

- 状态：待评审。
- 目标：使编辑食谱食材行的横向数量框和删除图标，与前方食材名称文字输入框首行垂直居中对齐。
- 范围：编辑食谱食材行布局样式和截图验证；不改变小数输入、步进规则、删除语义或其他页面数量控件。
- 设计/需求基线：用户本次明确反馈；现有 P9 编辑食谱食材行和共享 `QuantityStepper`。
- 预期验证：Playwright 编辑食谱截图与 DOM 对齐测量；前端 lint、测试、构建和 `git diff --check`。
- 会话记录：DOM 测量确认分类状态把食材行撑到 `67.6px`，数量框和删除按钮按整行居中，较 `48px` 名称输入框下移约 `10px`；本次改为以前方文字输入框首行作为对齐基准。
- 完成：编辑食谱食材行改为顶端对齐，数量框通过 `7px` 上边距补偿自身 `34px` 高度，删除按钮图标与名称输入框首行中心线对齐。
- 验证：Playwright 截图 `output/playwright/recipe-edit-aligned.png` 确认三行布局；DOM 测量第一行数量框中心线偏差 `0px`、删除图标中心线偏差 `0px`；前端 lint、164 个测试、生产构建、`git diff --check` 均通过。
- 下一步：提交评审；真实设备触摸热区与生产发布仍按既有发布验收流程执行。

### 2026-08-12 — Capacitor APK/IPA 与 PWA 共存方案设计（本次会话）

- 状态：待评审。
- 目标：为手机端增加 APK/IPA 部署方案，同时保留 PWA；确定静态资源、API、认证、深链、系统手势、构建发布和验收边界，供后续独立会话实施。
- 范围：新增移动端部署设计文档和 ADR，更新分会话执行计划与本进度记录；不修改前端、后端、数据库迁移、Docker、发布脚本或应用配置。
- 设计/需求基线：用户本次明确需求；现有 React/Vite PWA、FastAPI 同域 API、HttpOnly Cookie/设备 Bearer 认证、二维码配对、`edgeSwipeBack`、Service Worker 和单容器部署约束；Capacitor、Android、Apple 官方资料。
- 预期验证：文档链接、任务依赖、认证边界和发布门禁自洽；`git diff --check` 通过。
- 会话记录：已比较 Tauri 与 Capacitor，并结合当前项目的约 1.1 MB `frontend/dist`、相对 `/api` 请求、同源 Cookie、SSE、扫码/相机和现有手势逻辑，决定采用 Capacitor 原生壳承载本地 Web 资源，远程 FastAPI 提供 API；PWA 继续走现有同域部署。原生 App 不复用跨源 HttpOnly Cookie 作为唯一认证方案，改用系统浏览器 SSO 回跳和 Keychain/Keystore 保存的 Bearer 会话。
- 完成：新增 [手机端 APK/IPA 与 PWA 部署设计](mobile-deployment-design.md)、[ADR-0004](architecture/adr/0004-capacitor-mobile-and-pwa.md)，更新 ADR 索引、P13 分会话执行计划和任务依赖图；明确 Capacitor 本地静态资源、远程 FastAPI API、PWA 同源 Cookie、App SSO 深链、Keychain/Keystore Bearer 会话、原生手势、构建签名和三端验收边界。
- 验证：`git diff --check` 通过；设计文档和 ADR 文件存在，P13.1–P13.7 顺序、依赖和验收门禁已完成静态检查。
- 未验证：未创建 Capacitor 工程，未构建 APK/IPA，未实测 Android/iOS 手势、SSO 回调、相机、推送或商店包体积；这些属于后续 P13 实施与 Spike。
- 下一步：在其他会话按 P13.1 开始 Capacitor 骨架与工具链 Spike；本条等待评审。

### 2026-08-13 — P13 Capacitor 原生壳实施（本次会话）

- 状态：待评审（P13.1–P13.2 完成，P13.3 起未开始）。
- 目标：按 P13.1 → P13.2 → P13.3 → P13.4 → P13.5 → P13.6 → P13.7 顺序实施 Capacitor APK/IPA 与 PWA 共存部署；本轮先完成 P13.1 工程骨架和工具链 Spike，并以构建证据决定后续适配边界。
- 范围：Capacitor 配置、Android/iOS 原生工程、前端资源同步与构建基线、PWA 回归；不在本轮实现 App SSO、长期凭证安全存储、深链关联文件、正式签名或商店发布。
- 设计/需求基线：`docs/ui-design-specification.md`（本轮无 UI 改动）、`docs/functional-design-and-feasibility.md` §17.1、`docs/final-ui-designs.md`、`docs/mobile-deployment-design.md`、`docs/architecture/adr/0004-capacitor-mobile-and-pwa.md`、`docs/development-execution-plan.md` P13.1–P13.7；当前 React/Vite PWA、`frontend/src/appApi.ts`、`frontend/src/main.tsx`、现有 Android SDK/Xcode 工具链。
- 会话记录：在 `frontend/` 接入 Capacitor `8.5.0`，生成 `frontend/android` 与 `frontend/ios` 原生工程；配置包名 `com.fridgeboard.app`、应用名“家常食橱”和 `dist` 资源同步。P13.2 增加集中式运行时边界：PWA 使用相对 `/api`、同源 Cookie 和 Service Worker；Capacitor 使用 `VITE_CAPACITOR_API_ORIGIN`（默认 `https://fridge.flycn.fyi`）解析绝对 API 地址、`credentials: omit`，暂不把跨源 Cookie 当作认证方案。
- 完成：P13.1 工程骨架和 P13.2 API/Service Worker 运行时适配已实现；未实现 App SSO、Keychain/Keystore、安全 Bearer 会话、深链、原生相机/扫码、系统手势、正式签名和商店发布。
- 验证：`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run` 通过（168 passed）；`npm run --prefix frontend build` 通过；`npx cap sync` 通过；`xcodebuild -list -project frontend/ios/App/App.xcodeproj` 通过；iOS Simulator Debug 无签名构建通过；`git diff --check` 通过。
- 未验证：Android debug/AAB 未通过，当前仅 Java 25，Gradle 8.14.3 在 Groovy 阶段报 `Unsupported class file major version 69`；iOS archive/IPA、Android/iOS 真机或模拟器实际启动、飞行模式静态壳、远程 API、相机权限和返回手势均未验证。当前 `frontend/dist` 约 1.1 MB；Android `minSdk 24`、`compileSdk/targetSdk 36`；iOS Deployment Target 15.0；Xcode 26.6；Capacitor 8.5.0。
- 待决策：无。进入 P13.3 前必须准备 Java 21/Android 构建环境，并评审 App SSO exchange、Bearer 会话轮换和 Keychain/Keystore 存储协议；不得把当前 `credentials: omit` 误认为已完成 App 登录。
- 下一步：P13.3 App 会话、安全存储和撤销 Spike；输入为本次 `runtime.ts`、后端现有 Bearer 校验与 `OwnerSession` 模型，完成认证方案评审后再新增迁移或公开 API。

### 2026-08-12 — 食谱食材数量步进框与小数输入（本次会话）

- 状态：待评审。
- 目标：编辑食谱页的食材行复用统一 `[-数字+]` 数量输入框，删除操作改为统一图标按钮；数量输入支持非负两位小数，步进加减仍按 1。
- 范围：共享前端数量步进组件、编辑食谱食材行、食谱/库存/自定义购物项数量 API 与持久化类型、数据库迁移、相关回归测试和本进度记录；不改变食谱匹配、缺货计算和扣减规则。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §7、§8、§10；`docs/functional-design-and-feasibility.md` §9；最终本地 `docs/ui-assets/html/pwa-recipe-edit.html`、`docs/ui-assets/png/pwa-recipe-edit.png`；现有共享 `QuantityStepper`、`p9-remove-shopping-row` 图标按钮和 P9 食谱编辑流程。
- 预期验证：新增/更新数量小数与食谱编辑器回归测试；`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：已确认共享 `QuantityStepper` 仍使用整数校验和 `inputMode="numeric"`，编辑食谱食材行单独使用原生数字输入框与文字 `×` 删除按钮；后端 API、领域模型和 SQLite 列也均为整数。为避免前端输入小数后保存失败，本次按两位小数贯通数量读写链路，同时保留库存/购物清单当前最小值约束。
- 完成：共享 `QuantityStepper` 使用 `step="0.01"` 与十进制输入，食谱食材行改用统一步进框；删除按钮改为垃圾桶图标按钮；库存、食谱食材、消费审计和自定义购物项数量改为两位小数定点数，并新增 Alembic `20260812_20` 迁移；食谱文本导入支持 `×0.5` 等小数数量。
- 验证：`uv run ruff check backend`、`uv run pytest`（144 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（164 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增小数步进逻辑和食谱 API `0.5` 保存/数值 JSON 响应回归测试通过；Alembic 空库升级到 `head` 已成功。
- 未验证：尚未在真实 320/390/430px 手机和 iOS/Android PWA 上确认食谱编辑行的小数输入、加减按钮和垃圾桶触摸热区；尚未在生产数据库执行迁移或进行真实设备回滚演练。
- 下一步：评审环境执行 `20260812_20` 数据库迁移后，在真实手机验收编辑食谱小数输入、`0.5 → 1.5 → 2.5` 步进和删除食材流程。

### 2026-08-12 — 修复编辑食谱食材行步进框换行（本次会话）

- 状态：待评审。
- 目标：修复编辑食谱页食材行中 `[-数字+]` 控件被窄网格列挤压后换行、撑高行的问题，并为共享控件补充布局契约注释，避免调用方再次用不匹配的列宽覆盖内部布局。
- 范围：共享 `QuantityStepper` 的紧凑横向变体、编辑食谱食材行布局与注释、前端回归测试和本进度记录；不改变数量精度、步进规则、删除语义或后端接口。
- 设计/需求基线：用户本次明确反馈；`codex://threads/019ff3f4-b3ac-7d62-9435-a1f1376bdf00` 中同类布局问题；`docs/ui-design-specification.md` §7、§8、§9、§10；本地 `docs/ui-assets/png/pwa-recipe-edit.png` 与 `docs/ui-assets/html/pwa-recipe-edit.html`；现有共享 `QuantityStepper`。
- 预期验证：新增共享控件/编辑食材行布局回归断言；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：已定位根因：共享控件默认是三行纵向网格，食材行却为数量控件只分配 `40px` 网格列，导致控件内部宽度不足并溢出换行；用户进一步确认添加物品页的纵向上下箭头与其他页面横向 `[-数字+]` 并非同一控件。本次拆分为 `QuantityArrowControl` 和横向 `QuantityStepper`，并把“横向控件不得被页面窄列压缩”的约束写入共享接口与样式注释。
- 完成：编辑食谱食材行使用 `136px` 横向数量列和独立 `48px` 删除按钮列；添加物品页恢复独立上下箭头控件；移除共享控件方向参数，避免通过参数误把两种语义重新混用。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（164 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；静态检查确认添加物品页只引用 `QuantityArrowControl`，库存/购物清单/编辑食谱只引用横向 `QuantityStepper`。
- 未验证：尚未在真实 320/390/430px 手机和 iOS/Android PWA 上确认最终触摸热区与视觉间距；本地浏览器已启动用于人工复核。
- 下一步：在评审环境打开添加物品页和编辑食谱页，确认前者为上下箭头、后者食材行保持单行横向 `[-数字+]` 和垃圾桶按钮。

- 根因补充：用户进一步确认“添加物品”页的纵向上下箭头与其他页面横向 `[-数字+]` 是两种不同控件；本次改为独立 `QuantityArrowControl` 与 `QuantityStepper`，不再通过同一组件的方向参数表达两种语义。

### 2026-08-12 — 恢复数量控件历史视觉与添加物品箭头（本次会话）

- 状态：待评审。
- 目标：按 Git 历史恢复“添加物品”页的 SVG 上下箭头，并统一库存、购物清单、编辑食谱的横向 `[-数字+]` 外框、分隔线、按钮底色和尺寸。
- 范围：共享数量控件 CSS、添加物品页箭头图标、数量控件调用 class、前端回归测试和本进度记录；不改变小数输入、步进规则、保存接口或删除语义。
- 设计/需求基线：用户本次明确反馈；Git 历史提交 `9d64859`、`56ff81c`、`44d262b`；现有共享 `QuantityStepper`、`QuantityArrowControl` 和 P5/P9 页面。
- 预期验证：补充控件结构/样式静态回归；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：历史查询进一步确认 2026-08-11 物品列表基线为 Git `888805a`，其横向数量框使用文字 `− / ＋`；横向数量框视觉由 `106px × 34px` 外框、`30/44/30px` 三列、输入框左右分隔线和按钮底色构成。仅“添加物品”页使用独立的内联 SVG 上下箭头。
- 完成：横向 `QuantityStepper` 恢复文字 `− / ＋`，独立 `QuantityArrowControl` 保留上下 SVG 箭头；横向控件统一由 `.p5-quantity-control` 提供外框、分隔线和按钮底色；编辑食谱行补充控件内部输入框覆盖，避免 `.p9-edit input` 普通表单规则撑高数字框，并写入“横向控件不得被页面窄列压缩”的 CSS 契约注释。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（164 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；静态回归确认物品列表横向按钮输出文字 `− / ＋`，添加物品页面仍输出 SVG 上下箭头。
- 未验证：未在真实 320/390/430px 手机和 iOS/Android PWA 上确认触摸热区；未验证生产数据库迁移和真实设备回滚。
- 会话追加：用户核对了 2026-08-11 物品列表页面，确认右侧横向数量框的历史按钮是文字 `− / ＋`，不是 SVG。Git `888805a` 的前端测试也断言按钮文本，因此撤回横向 SVG 恢复；SVG 仅保留在“添加物品”页的独立上下箭头控件。
- 下一步：按 `888805a` 基线重新执行前端门禁和物品列表/编辑食谱视觉核验。

### 2026-08-12 — 调整删除按钮右侧留白（本次会话）

- 状态：待评审。
- 目标：在删除按钮不贴边的前提下保留适量右侧留白。
- 完成：自定义清单行右侧外扩从 `24px` 调整为 `12px`，删除按钮保留约 `12px` 的弹窗内侧留白。
- 验证：待运行。
- 未验证：尚未在真实手机确认实际像素位置。

### 2026-08-12 — 收紧自定义清单删除按钮留白（本次会话）

- 状态：待评审。
- 目标：减少编辑购物清单弹窗中删除按钮两侧留白，特别是右侧不重复叠加弹窗内容内边距。
- 范围：自定义购物清单行 CSS 和本进度记录；不改变删除按钮语义、删除接口和其他弹窗布局。
- 设计/需求基线：用户本次明确反馈；现有弹窗 `24px` 内容内边距及自定义清单三列布局。
- 完成：删除按钮列由 `40px` 收窄为 `32px`，列间距由 `8px` 收窄为 `4px`，清单行向右延伸至弹窗边框内侧，避免重复右侧留白。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（162 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实手机确认 320/390/430px 下的删除按钮触摸热区和视觉位置。
- 下一步：运行前端 lint、测试、构建和 `git diff --check`。

### 2026-08-12 — 自定义购物清单编辑与删除（本次会话）

- 状态：待评审。
- 目标：将自定义购物清单弹窗改为编辑器，打开时加载现有项目，并支持修改数量、删除行和新增项目。
- 范围：购物清单前端编辑弹窗、owner/daily 自定义项更新/删除接口、回归测试和本进度记录；不改变动态缺货清单和复制格式。
- 设计/需求基线：用户本次明确需求；现有 `AddCustomShoppingDialog`、`custom_shopping_items` 表及共享横向数量控件。
- 预期验证：后端接口测试、前端 lint、测试、生产构建和 `git diff --check`。
- 会话记录：当前弹窗只初始化空白新增行，后端只有批量追加接口；已改为打开时实时读取当前自定义项，保留已有项目 ID 作为编辑草稿，删除在保存时同步到后端。
- 完成：弹窗标题改为“编辑购物清单”；打开时加载现有名称和数量；每行数量框右侧增加删除按钮；保存时支持已有项更新、新增项批量创建和删除项同步删除；无已有项目时仍保留一行空白新增行。
- 验证：`uv run ruff check backend`、`uv run pytest backend/tests/test_recipe_api.py -q`（14 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（162 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增已有项目加载、删除按钮、更新和删除接口测试通过。
- 未验证：尚未在真实手机确认编辑弹窗加载、删除和多行保存的触摸行为；尚未运行全量后端测试。
- 下一步：全量后端测试通过后，在真实手机验收自定义清单编辑、删除和新增流程。

### 2026-08-12 — 移除添加购物清单模态底部取消按钮（本次会话）

- 状态：待评审。
- 目标：移除添加购物清单模态框底部重复的“取消”按钮，保留弹窗关闭按钮和“添加”主操作。
- 范围：`AddCustomShoppingDialog`、对应前端回归测试和本进度记录；不改变关闭按钮、数据提交和其他模态框。
- 设计/需求基线：用户本次明确反馈；共享 `Dialog` 和现有购物清单模态实现。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`。
- 会话记录：已确认底部“取消”仅由购物清单添加模态生成，其他确认/通知弹窗不受影响；已移除该模态底部次操作，保留共享关闭按钮。
- 完成：添加购物清单模态框底部仅保留“添加”主按钮，不再显示重复的“取消”按钮。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（162 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增模态框无“取消”按钮断言通过。
- 未验证：尚未在真实手机确认关闭按钮的触摸热区和模态底部间距。
- 下一步：在真实手机打开添加购物清单模态，确认通过关闭按钮退出、通过添加按钮提交。

### 2026-08-12 — 自定义购物项输入行与复制内容修复（本次会话）

- 状态：待评审。
- 目标：修复添加购物清单模态框中数量控件被挤到第二行、物品名称输入框宽度不足，以及复制按钮遗漏自定义购物项的问题。
- 范围：购物清单模态框行布局、购物清单复制文本生成、前端回归测试和本进度记录；不改变自定义购物项接口、数据库结构和动态缺货计算。
- 设计/需求基线：用户本次明确反馈；现有物品列表横向数量控件 `p5-inventory-quantity`、`formatRestockClipboardText` 和购物清单页面实现。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`；新增模态框布局与自定义项复制测试。
- 会话记录：已定位物品列表数量控件的后置 `grid-row: 2` 规则泄漏到模态框，造成输入框与数量框分行；复制函数当前只接收动态缺货列表，未接收自定义购物项。已覆盖模态框内数量控件的网格定位，并将复制文本扩展为动态缺货项与自定义购物项合并。
- 完成：模态框每行使用 `minmax(0, 1fr) 106px`，物品名称输入框占据剩余空间，横向数量控件固定在同一行；复制按钮包含自定义项名称和数量。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（162 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增自定义项复制回归测试通过。
- 未验证：尚未在真实手机上确认模态框 320/390/430px 宽度下的横向布局和复制结果。
- 下一步：在真实手机打开添加购物清单模态框，确认名称输入框占满剩余宽度、数量框同排显示，并验证复制内容包含自定义项。

### 2026-08-12 — 购物清单自定义项目与共享数量输入修复（本次会话）

- 状态：待评审。
- 目标：调整购物清单顶部操作，新增自定义购物清单录入模态框与持久化列表，补充“本周/自定义”分隔线，并统一修复各页面 `[-数字+]` 输入框允许清空后重新输入的问题。
- 范围：购物清单前后端接口、数据库迁移、购物清单页面与模态交互、共享数量步进输入组件、相关前端/后端回归测试和本进度记录；不改变动态缺货计算、食谱数据和复制文本格式。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §6.1、§8.2.1、§10；最终本地 `docs/ui-assets/html/pwa-restock-list.html` 与 `docs/ui-assets/png/pwa-restock-list.png`；现有 `RecipeWorkspace`、`Dialog`、食谱路由和库存数量控件。
- 预期验证：新增接口/组件回归测试、`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认当前购物清单只有动态本周/下周缺货和复制按钮；自定义项没有数据模型；物品列表与添加物品页的步进输入各自实现，空值会被即时数字化回写。已新增冰箱级自定义购物项持久化表，owner/daily_access 均可读取和追加，并复用共享模态与数量控件。
- 完成：购物清单复制按钮移至左上角，右上角新增按钮打开“添加购物清单”模态；支持回车或行加号追加输入行，提交后批量保存；页面增加“本周”“下周”“自定义”分隔线，自定义项按逗号展示。新增 `custom_shopping_items` Alembic 迁移、owner/daily API 和前端缓存同步；新增共享 `QuantityStepper` 并替换物品列表、添加物品页的重复步进输入，允许清空后重新输入。
- 验证：`uv run ruff check backend`、`uv run pytest`（143 passed，43 条既有依赖弃用警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（160 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增自定义购物项批量追加/持久化后端测试及购物页结构断言通过。
- 未验证：尚未在真实 iOS/Android PWA 上复测模态框触摸、回车/加号连续录入、空值数量编辑和 320/390/430px 视觉布局；尚未执行生产迁移和设备验收。
- 下一步：在真实手机验收购物清单录入、刷新持久化和数量清空重输流程；通过后将本条标记为完成。
- 追加会话记录：用户反馈添加购物清单模态中的数量框误用了纵向步进样式；已改为直接复用物品列表的 `p5-inventory-quantity` 横向样式，并为该控件保留同样的 106px 宽度。

### 2026-08-12 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `db1a501` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前后端质量门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认工作区干净，当前分支为 `main`，发布引用为 `db1a501`；发布配置使用仓库根目录 `.deploy.env`，正式发布仅通过生产固定 IP SSH。
- 完成：正式发布当前 `main` 的 `db1a501`，release `260812021647`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260811-181655`，权限为 `600`；未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（142 passed，43 条既有依赖弃用警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（160 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run` 和 `git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260810_18 (head)`，release 已进入 `/app/frontend/dist/assets/index-BD-8o-8S.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；传输过程出现 macOS `com.apple.provenance` 扩展属性提示，不影响发布结果。
- 下一步：在真实设备复测首页冰箱入口、一级导航、购物清单和本次涉及的识图/分类流程；通过后将本条标记为完成。

### 2026-08-12 — 一级导航壳统一与购物/食谱切换修复（本次会话）

- 状态：待评审。
- 目标：统一首页右上角冰箱按钮与一级页顶部栏的三列布局；将“购物清单”改为一级页面壳并移除返回键；移除“食谱”页顶部购物车入口；保证食谱页可直接通过底部导航切换到购物页。
- 范围：共享一级页面导航栏、`RecipeWorkspace` 的食谱/购物视图结构、首页冰箱图标尺寸约束、相关前端回归测试和本进度记录；不改变食谱数据、购物清单计算、复制操作和冰箱列表二级页返回行为。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §5–§6.2.1、§8.3；`docs/functional-design-and-feasibility.md` §9.1；既有 `PageShell`、`AppHeader`、`P7Navigation` 共享实现及本地 `pwa-home`、`pwa-weekly-recipes`、`pwa-restock-list` 设计资产。
- 预期验证：前端导航/页面壳回归测试、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；必要时验证 320/390/430px 结构无溢出。
- 会话记录：已确认首页右侧按钮、食谱页和购物清单页分别使用不同的顶部栏/视图组合；先收敛为共享一级页导航和共享底部导航，再补充直接从食谱页切换购物的状态回归。
- 完成：共享 `.p7-icon-button` 增加网格居中约束，首页冰箱图标与其他一级页按钮使用同一 48px 热区；购物清单改用 `AppHeader`、一级页刷新壳和底部导航，移除返回按钮；食谱页移除顶部购物车，底部购物入口在 `RecipeWorkspace` 内部直接切换到购物清单视图。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（159 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增一级页面壳、返回按钮移除和食谱页购物入口静态回归断言。
- 未验证：尚未在真实 iOS/Android PWA 上确认首页冰箱图标与其他顶部图标的像素级位置、下拉刷新区域和 320/390/430px 触摸布局；未执行生产发布或设备端验收。
- 下一步：在真实手机依次打开首页、食谱、购物清单和我的页面，确认顶部栏中心对齐、食谱页直接点击“购物”可切换、购物清单无返回键；验收通过后将本条标记为完成。

### 2026-08-12 — 初始化与绑定流程导航层级审查（本次会话）

- 状态：待评审。
- 目标：审查一级导航调整对首次登录、无冰箱创建、手机扫码绑定、继续创建布局和冰箱端设备绑定流程的影响。
- 范围：`frontend/src/App.tsx` 的初始化条件、`FridgeSwitcher` 入口、创建布局、BootstrapPairing 和 FridgeDeviceBinding 路由；本次不修改业务代码。
- 审查结论：无冰箱时 `loadOwner` 会将 `p7View` 设为 `switcher`，创建和扫码入口仍可用；二维码绑定后按 `setup_status` 正确分流到继续布局或首页；现有冰箱从首页打开列表时二级返回行为正确。发现一个层级问题：`!layout` 分支仍向 `FridgeSwitcher` 传入 `onBack={() => setP7View('switcher')}`，因此首次登录无冰箱时会显示一个点击后无变化的返回按钮；该状态应使用一级 `AppHeader` 或不传返回回调。未发现创建/绑定请求、缓存或成功回首页状态被本次导航改动破坏。
- 完成：`FridgeSwitcher` 的返回回调改为可选；无当前冰箱时使用共享 `AppHeader` 一级壳，已有冰箱从首页进入时继续使用共享 `PageHeader` 二级壳；补充两种状态的标题栏/返回按钮回归断言。
- 验证：基于 `App.tsx:594–630`、`App.tsx:705–739`、`App.tsx:1048–1087`、`BootstrapPairing.tsx` 和 `FridgeDeviceBinding.tsx` 完成静态路径审查；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（160 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 上验证首次登录无冰箱、创建布局、手机扫码绑定和已有冰箱返回路径的真实触摸与视觉效果；未执行生产发布或设备端验收。
- 下一步：在真实手机复测无冰箱初始化页、创建/扫码绑定、布局完成后的继续/打开首页分流，以及已有冰箱列表返回首页；通过后将本条标记为完成。
- 追加会话记录：用户确认修复该初始化层级问题；本次只调整页面壳选择和回归测试，不改变创建、扫码绑定、缓存或绑定成功后的状态流转。

### 2026-08-12 — 统一批量分类抽屉外观与创建能力（本次会话）

- 状态：待评审。
- 目标：修复物品列表批量分类抽屉被拉伸为满屏的问题，使其与其他分类选择入口使用相同的定位参数、组件和创建分类能力。
- 范围：共享分类抽屉调用参数、物品列表分类入口的锚点与创建大类/新建小类回调、相关前端验证和本进度记录；不改变批量分类 API 与移动/删除行为。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §5–§6；`docs/functional-design-and-feasibility.md` §3.7；现有 `CategoryPickerPanel`、`p5-catalog-panel` 样式和 `InventoryFlow` 分类创建流程。
- 预期验证：前端测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已改为读取列表内容锚点的实际 `getBoundingClientRect().top`，与录入/订单入口使用相同的 `top + bottom: 0` 抽屉定位；列表入口复用了现有添加大类弹窗和新建小类流程，新建完成后继续批量分类所选物品。
- 完成：所有分类选择入口继续使用共享 `frontend/src/CategoryPickerPanel.tsx`；物品列表不再传固定 `top={0}`，并具备“添加大类”“新建小类”和失败反馈能力。
- 验证：`npx vite build`、`git diff --check` 通过；前端测试为 157 passed、1 failed，失败是其他会话将底部导航改为“购物”后，`App.test.ts` 仍断言旧文案“冰箱”；`npm run --prefix frontend lint` 被其他会话的 `App.tsx:285` 未使用 `refreshError` 阻塞；`npx tsc -b` 被其他会话的 `onShopping`/导航类型不一致阻塞，未出现本次分类抽屉代码的报错。
- 未验证：尚未在真实手机上核对抽屉起始位置、内部滚动和创建分类返回批量分类流程；由于工作区已有前端门禁错误，未能完成全量前端质量门禁。
- 下一步：待其他会话的购物导航类型、测试和 lint 问题修复后重跑前端全量门禁，再在真实手机上验收抽屉和创建分类流程。

### 2026-08-12 — 一级冰箱入口调整为二级页与购物导航（本次会话）

- 状态：待评审。
- 目标：将一级页面“冰箱”列表改为带返回按钮的二级页，由首页右上角 `solar:fridge-outline` 图标进入；底部导航第三项改为“购物”并打开购物清单，补货清单标题改为“购物清单”。
- 范围：手机端首页顶部入口、冰箱管理页返回导航、底部导航文案/图标/点击路由、补货清单标题及相关前端回归测试；不改变冰箱管理数据、购物清单计算和其他底部导航入口。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §6.1–§6.2.1、§8；`docs/functional-design-and-feasibility.md` §3.3、§5.2、§17.1；最终本地设计资产 `pwa-home`、`pwa-fridge-management`、`pwa-restock-list`、`pwa-weekly-recipes`。
- 预期验证：前端相关测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认当前首页右上角入口仍为菜单/管理语义，底部导航第三项仍显示“冰箱”，冰箱管理页通过状态切换打开但缺少返回入口；将复用共享 `PageHeader`、`P7Navigation` 和现有补货列表状态，不新增路由或重复页面壳。
- 完成：首页右上角改为带 `solar:fridge-outline` 标识的冰箱线框按钮并进入带返回按钮的“我的冰箱”二级页；共享底部导航第三项改为购物车图标和“购物”，点击直接打开“购物清单”；每周食谱页原购物车入口和购物清单底部导航保持同一购物清单视图。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（159 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 上验证二级页返回手势、顶部图标触摸热区和购物清单跨页面切换；未执行生产发布或设备端验收。
- 下一步：在真实手机上从首页右上角进入并返回“我的冰箱”，从首页/食谱页/“我的”页点击“购物”确认均进入“购物清单”；验收通过后将本条标记为完成。

### 2026-08-12 — 物品列表批量修改分类（本次会话）

- 状态：待评审。
- 目标：在物品列表多选底部操作区增加“分类”，打开现有“搜索全部小类”分类抽屉，批量更新所选物品的小类；同时将分类选择抽屉左上角误写的“选择物品”更正为“选择分类”。
- 范围：物品列表多选交互、分类选择抽屉复用、批量分类更新 API/服务、相关前后端测试与本进度记录；不改变移动、删除和单项编辑分类语义。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3.6–§3.7；最终小类图库本地设计资产 `pwa-subcategory-library` 及现有 `CategoryPickerPanel`。
- 预期验证：前端相关测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、后端相关测试、`uv run ruff check backend`、`uv lock --check` 和 `git diff --check`。
- 会话记录：已将分类抽屉提取为共享 `frontend/src/CategoryPickerPanel.tsx`，物品列表多选底部按所有者权限显示“分类”，选择小类后调用新的批量更新接口；录入/订单分类抽屉标题统一改为“选择分类”。服务端按当前冰箱、目标小类和全部批次位置逐项校验，并同步更新用户手工分类映射。
- 完成：新增 `POST /api/owner/refrigerators/{refrigerator_id}/inventory/category` 批量分类接口、API 回归测试、前端分类抽屉交互和四按钮响应式布局；分类失败不清空选择，成功后刷新库存和缓存。
- 验证：`uv run pytest -q`（142 passed，43 条既有依赖弃用警告）、`uv run ruff check backend`、`uv lock --check`、`npm run --prefix frontend test -- --run`（158 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 上验证抽屉滚动、四按钮小屏布局、网络失败提示和真机触摸操作；未执行生产发布或数据库部署验证。
- 下一步：在真实手机上复测多选分类成功、失败重试、取消选择和原有移动/删除流程；通过后将本条标记为完成。

### 2026-08-11 — P6 图片识别上传压缩与长截图传输优化（本次会话）

- 状态：待评审。
- 目标：在不明显降低订单截图文字识别质量的前提下，减少照片识别跨境传输体积和等待时间；普通照片缩放压缩，订单长截图保持宽度并按目标大小自适应 JPEG 质量。
- 范围：`frontend/src/InventoryFlow.tsx` 图片预处理与识别请求、前端图片处理回归测试及本进度记录；不改变扫码链路、识别 SSE 契约、识别结果字段和后端图片持久化语义。
- 设计/需求基线：用户关于高分辨率照片和订单长截图传输耗时的反馈；样本 `1220 × 5418`、原图约 `1.14 MB` 的压缩测试；`docs/functional-design-and-feasibility.md` §6.4–§6.5；现有 P6 相机/照片识别实现。
- 预期验证：验证长截图保持宽度、普通照片限制长边、JPEG 质量降级和 `512 KB` 目标大小；运行前端测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认相机识图当前按视频原始尺寸以 JPEG `0.82` 编码，照片上传直接发送原文件；使用本地样本测试后，JPEG `0.75` 可将 `1.14 MB` 长截图压缩到约 `376 KB`，先实现前端预处理，后端暂不增加二次重编码。新增独立图片处理工具：普通照片最大边 `1920`，订单长截图按竖向宽高比 `2.5` 识别并保持原尺寸，识图/照片先用 `0.75`，超过 `512 KB` 再用 `0.70`，扫码保持原尺寸和 `0.82`。
- 完成：相机识图和相册照片均在请求前通过 Canvas 转换为 JPEG；照片文件优先使用支持 EXIF 方向的位图解码，再做格式归一化和 base64 输出；请求使用处理后的 `content_type`，不再直接发送原始文件类型。
- 验证：`npm run --prefix frontend test -- --run`（156 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增尺寸规划、扫码保留原始尺寸、质量降档和 `512 KB` 阈值回归测试。
- 未验证：尚未在真实 iOS/Android PWA 和 Agnes 网关上测量浏览器实际 JPEG 编码体积、跨境端到端耗时及订单小字识别准确率；未改变后端 5 MB 校验和模型调用。
- 下一步：用该订单截图和高分辨率相机照片在真实手机上分别验证上传体积、识别耗时，以及商品名称、数量、实付金额和日期字段准确率；通过后再将本条标记为完成。
- 追加会话：代码审查发现极长截图没有像素/高度上限、`512 KB` 只是降档触发条件、后端可被旧客户端绕过，以及相机压缩失败会显示为相机错误；已增加前端极端尺寸和硬体积处理、后端 Pillow 尺寸校验、独立图片处理错误提示与对应测试。
- 修复：订单长截图默认保持尺寸，但限制最大高度 `8192` 和总像素 `1200 万`；JPEG 两档仍超出 `512 KB` 时最多继续缩小 3 次，达到最小宽度仍超限则提示截取局部；普通图片和长截图均不再无条件发送超预算结果。后端在临时文件和 Agnes provider 之前校验真实图片格式、最大边 `8192` 和总像素 `1600 万`，使用受限线程隔离 Pillow 头解析；相机图片处理异常不再显示为相机权限错误。
- 验证：`uv run ruff check backend`、`uv run pytest`（141 passed）、`uv lock --check`、`npm run --prefix frontend test -- --run`（158 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增极端长截图、尺寸/像素校验、真实 JPEG 测试夹具和超预算重试回归。
- 未验证：尚未在真实 iOS/Android PWA 和 Agnes 网关上测量不同浏览器实际 JPEG 编码体积、跨境端到端耗时及订单小字识别准确率；尚未在真实设备触发超长截图内存压力路径。
- 下一步：用订单截图、高分辨率相机照片和超过 8192px 的长截图在真实手机上复测成功识别、错误提示和上传体积；通过后再将本条标记为完成。

### 2026-08-11 — P6 识别动画与模型流式文字叠加回归修复（本次会话）

- 状态：待评审。
- 目标：审查照片识别页中半透明识别动画与大模型流式文字的叠加关系，修复首个流式文本出现后动画不可见的问题，并用模拟时序验证动画在空文本、首个增量、长文本和滚动状态下持续存在。
- 范围：`frontend/src/InventoryFlow.tsx` 的识别进度组件、相关样式和前端回归测试；不改变识别 SSE 事件契约、识别结果字段、照片上传和相机释放语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §6.4–§6.9；最终 P6 识别/添加食材本地设计资产 `pwa-add-food` / `pwa-ai-recognition`；现有识别流实现与测试。
- 预期验证：补充动画与文本同时存在及增量更新的回归断言，运行相关前端测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、必要时 Playwright 模拟截图/布局检查和 `git diff --check`。
- 会话记录：已确认工作区仅有既有 `docs/progress-tracker.md` 未提交变更；现有 `RecognitionProgress` 始终渲染动画节点，但动画位于滚动输出容器内，文本增量触发自动滚动后会把动画一起滚出可视区域，且呼吸动画覆盖了居中定位的 `transform`。已将文本改为独立滚动层、动画改为固定覆盖层，并保留透明度呼吸效果。
- 完成：识别进度输出区现在由固定高度的输出视口、独立自动滚动文字层和半透明动画覆盖层组成；长文本滚动不会移动或裁剪动画，动画居中定位不再被呼吸动画覆盖。新增静态结构回归断言，约束动画必须位于滚动层之外。
- 验证：`npm run --prefix frontend test -- --run`（151 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 模拟空文本、首个增量、长文本自动滚动并在 320/390/430px 检查，动画位置和 `transform` 保持稳定，三种视口文档宽度无溢出且动画完整位于输出区内。
- 未验证：未在真实 iOS/Android PWA 或真实 Agnes 网关环境验证代理缓冲、设备字体渲染和真机动画合成效果；本次未改变 SSE 或后端识别逻辑。
- 下一步：在评审设备通过照片识别复测后，将本条标记为完成。

### 2026-08-11 — 发布当前版本（本次会话）

- 状态：待评审。
- 目标：将当前 `main` 的 `52fd959` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：发布前质量门禁、`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的生产固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：后端 Ruff/pytest、锁文件检查，前端 lint/test/build，发布脚本语法和 dry-run；生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认当前分支为 `main`，工作区干净，发布配置使用仓库根目录 `.deploy.env`，正式发布通过生产固定 IP SSH。
- 完成：正式发布当前 `main` 的 `52fd959`，release `260811173517`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260811-093525`，未覆盖生产 `.env` 或业务数据。远端镜像摘要为 `sha256:b997a3ff8bb2ba6e8f2610f97ecca19c040ed59cf24700646bfef28cea4da492`。
- 验证：`uv run ruff check backend`、`uv run pytest`（140 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（151 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run 和正式发布均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy` 且重启次数为 0，容器内迁移版本为 `20260810_18`，公网 `/healthz` 返回 `{"status":"ok"}`，备份权限为 `600`、大小 `888832` 字节。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；传输阶段出现 macOS `com.apple.provenance` 扩展属性警告，不影响发布结果。
- 下一步：在真实设备上复测核心流程；通过后将本条标记为完成。

### 2026-08-11 — 修复模型等待期间数据库连接长期占用（本次会话）

- 状态：待评审。
- 目标：修复图片识别和 AI 图标生成在外部模型等待期间长期持有 SQLite 连接的问题，并补齐可还原请求阶段、模型耗时、上游响应和连接池上下文的错误日志。
- 范围：认证依赖只读事务、图片识别 SSE、AI 图标生成及其事务边界、连接池观测日志、对应后端回归测试；不改变识别结果、图标候选和确认业务语义，不删除本次未要求移除的 API。
- 设计/需求基线：用户本次“不得长期占用数据库连接、增加日志”要求；`AGENTS.md` 错误日志与异步 I/O 规则；`backend/fridgeboard/persistence/database.py`、`main.py`、`owner_routes.py`、`inventory_routes.py` 和 `icon_service.py` 当前实现。
- 预期验证：先补充连接生命周期和图标模型等待的失败回归，再运行 `uv run ruff check backend`、相关 `pytest`/全量 `pytest`、`uv lock --check` 和 `git diff --check`；记录未覆盖的生产并发复现项。
- 会话记录：已确认认证依赖的所有者分支在数据库查询后未 `commit/rollback`，识别 SSE 会在同一请求中等待模型；图标生成旧 JSON 路由仍被 SSE 复用，事务覆盖 `await service.generate()`，而图像 provider 连续执行 4 次最长 120 秒读取。已用同一 SQLAlchemy 会话工厂验证查询后连接保持 checkout、`rollback()` 后归还连接；先补充连接池回归测试，再实施修复。
- 完成：所有者认证依赖在返回身份前立即回滚只读事务；图标模型调用抽离为 `generate_icon_images()`，授权事务结束后才调用模型，模型完成后通过短事务保存候选；PNG 归一化和异步文件写入也移到数据库 flush 之前，数据库只在最终记录写入阶段短暂 checkout。新增连接池快照、识别/图标阶段耗时、上游响应状态/Content-Type/长度、候选数量和异常堆栈日志，未记录图片、Token、Cookie 或 Authorization。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（140 passed）、`uv lock --check`、`git diff --check` 通过；新增识别和图标模型等待期间 `pool.checkedout == 0` 的回归测试，并验证关键阶段日志存在。
- 未验证：尚未在生产环境重新发布后做真实并发压测；现有测试仍有依赖库的 43 条弃用/兼容性警告，不影响本次测试结果。
- 下一步：发布到测试/生产环境后复现一次照片识别，核对日志中 `pool.checkedout` 在模型等待阶段保持为 0，并确认 QueuePool 超时不再出现。

### 2026-08-11 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `c0a239f` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：发布前质量门禁、`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的生产固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：后端 Ruff/pytest、锁文件检查，前端 lint/test/build，发布脚本语法和 diff 检查；生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认当前分支为 `main`，工作区干净，`HEAD` 为 `c0a239f`；发布配置使用仓库根目录 `.deploy.env`，正式发布通过生产固定 IP SSH。
- 追加会话：首次发布生成 release `260811125504` 并完成生产数据库在线备份 `/data/fridgeboard.db.backup-20260811-045513`，但新容器启动迁移因镜像缺少 `aiosqlite` 失败，容器进入重启循环；已确认 `pyproject.toml` 已声明该依赖而 `requirements.lock` 未包含，先重新导出锁文件，再重新执行门禁和发布。
- 完成：按项目锁文件导出命令补齐 `requirements.lock` 中的 `aiosqlite==0.22.1`；由于未获授权提交 Git，保留工作区锁文件改动并将其单独同步到本次发布目录，使用已生成的 release `260811125504` 重建容器。首次发布备份 `/data/fridgeboard.db.backup-20260811-045513` 保留，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（138 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（151 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、发布脚本 dry-run、`git diff --check` 均通过；本地 Docker 构建已确认读取 `aiosqlite`，但首次本地构建因 `files.pythonhosted.org` 下载超时退出，远程构建随后成功安装 `aiosqlite-0.22.1`；生产容器为 `running/healthy` 且重启次数为 0，容器内 Alembic 为 `20260810_18 (head)`，release 已进入 `/app/frontend/dist/assets/index-B_9gMVj4.js`，公网 `/healthz` 返回 `{"status":"ok"}`，备份权限为 `600`、大小 `888832` 字节。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；本地 Docker 构建仍受外部 Python 包下载超时影响，但不影响已成功的生产构建。
- 下一步：在真实设备上复测 SSE 状态展示、识别/订单归并、批量删除和分层自定义名称等核心流程；通过后将本条标记为完成。

### 2026-08-11 — “确认位置”页显示分层自定义名称（本次会话）

- 状态：待评审。
- 目标：修复“确认位置”页面未显示用户为冰箱分层设置的自定义名称的问题。
- 范围：手机端新增物品和批量移动位置选择页面的位置标签、对应前端回归测试和本进度记录；不改变位置选择、保存/移动提交和默认名称显示规则。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3.7；确认位置设计稿 `0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8` 及本地设计资产；既有 `formatStorageSlotLabel` 和分层自定义名称实现。
- 预期验证：补充自定义名称显示回归，运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认 `InventoryFlow` 和 `InventoryMoveFlow` 的位置标签直接拼接系统分区名与格位键，未复用已支持 `custom_name` 的格式化函数；先登记任务，再按最小范围修复并验证新增物品、批量移动两条流程的默认名称和自定义名称两种情况。
- 完成：新增物品和批量移动“确认位置”页均改用 `formatStorageSlotLabel` 渲染选中位置；有自定义名称时显示自定义名称，无自定义名称时保留区域和格位序号回退文案，并补充位置格式化回归断言。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（151 passed）、`npm run --prefix frontend test -- --run src/App.test.ts`（88 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实 iOS/Android PWA 上点击批量移动流程确认触摸交互和自定义名称的最终视觉显示；按项目约定未自动执行 Playwright。
- 下一步：评审设备分别从新增物品和批量移动进入确认位置页，选择带自定义名称的目标分格，确认页面下方位置文案显示自定义名称；再选择未命名分格确认默认区域和格位序号仍正常。

### 2026-08-11 — 更新本地调试环境数据库（本次会话）

- 状态：完成。
- 目标：按 VS Code 本地调试配置执行 Alembic 前向迁移，使根目录 `fridgeboard.db` 与当前迁移头一致。
- 范围：根目录 `.env` 指向的本地 SQLite 数据库、Alembic 版本状态和数据库完整性检查；不清空、重建或修改业务数据，不触碰现有未提交应用代码。
- 设计/需求基线：用户本次明确要求“更新本地调试环境数据库”；`.vscode/migrate-local.sh`、`.vscode/launch.json` 和 `alembic.ini` 的本地迁移约定。
- 预期验证：运行 `uv run alembic upgrade head`，随后确认 Alembic 版本为 `20260810_18`、SQLite `integrity_check` 为 `ok`，并记录是否存在待执行迁移。
- 会话记录：已确认 `.env` 使用相对路径 `sqlite:///./fridgeboard.db`，VS Code 调试工作目录为项目根目录；根目录数据库当前已为 `20260810_18 (head)`，`backend/fridgeboard.db` 不属于当前调试目标。
- 完成：通过 `.vscode/migrate-local.sh` 执行 `uv run alembic upgrade head`；命令成功且未发现待执行迁移，数据库保持在 `20260810_18 (head)`。
- 验证：`uv run alembic current` 返回 `20260810_18 (head)`；`sqlite3 fridgeboard.db 'PRAGMA integrity_check; SELECT version_num FROM alembic_version;'` 返回 `ok` 和 `20260810_18`。本次未修改代码或业务数据。
- 未验证：未运行后端/前端全量测试，因为本次仅执行幂等数据库迁移且未修改应用代码。

### 2026-08-11 — 全项目 SQLAlchemy 异步化与 SQLite aiosqlite 接入（本次会话）

- 状态：待评审。
- 目标：将应用运行时所有 SQLAlchemy 数据库访问统一迁移到 `AsyncEngine`、`async_sessionmaker` 和 `AsyncSession`，生产 SQLite 使用 `aiosqlite`，消除同步 Session/Engine 对协程请求链路的阻塞。
- 范围：数据库连接与事务基础设施、FastAPI lifespan/启动清理、repository/service、所有数据库路由和异步测试夹具；同步 Alembic 迁移入口同步改为异步迁移；应用和测试数据库统一使用 `sqlite+aiosqlite`，不改变领域模型和 API 业务语义。
- 设计/需求基线：用户本次明确要求“SQLAlchemy 也必须都改用异步的”，并随后澄清数据库为 SQLite；项目异步 I/O 规则；现有 `backend/fridgeboard/persistence/database.py`、路由上下文与 Alembic 配置。
- 预期验证：新增 async session/事务/SQLite 外键与 WAL 回归覆盖；运行 `uv run ruff check backend`、`uv run pytest`、`uv lock --check`、前端已有 lint/test/build 和 `git diff --check`；静态核验应用代码不再导入同步 `Session`/`create_engine`，并验证 SQLite URL 自动使用 `aiosqlite`。
- 会话记录：已完成同步数据库边界盘点，确认迁移涉及所有 API 路由、服务层、启动任务和测试初始化；先登记本任务，再按数据库基础设施→服务/repository→路由/夹具的顺序迁移，保留迁移脚本的同步 DSL 仅作为 Alembic 版本脚本实现细节。此前误按 PostgreSQL 设计的说明已根据用户澄清改回 SQLite，未保留 asyncpg 依赖或 PostgreSQL 默认配置。
- 完成：数据库基础设施改为 `AsyncEngine`、`async_sessionmaker`、`AsyncSession`，SQLite URL 统一转换为 `sqlite+aiosqlite`；所有服务、repository、FastAPI 路由、lifespan 清理任务和启动目录同步均改为异步事务。Alembic 在线迁移入口也通过异步引擎执行，保留版本脚本内部所需的 `run_sync` 迁移 DSL 桥接。同步兼容边界仅用于既有同步 `TestClient` 测试夹具，不进入应用请求路径。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（137 passed）、`uv lock --check`、`python -m compileall -q backend` 和 `git diff --check` 通过；迁移测试已改用异步 SQLite 连接；静态核验 `backend/fridgeboard` 不再导入同步 `Session`/`create_engine`。
- 验证补充：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（148 passed）、`npm run --prefix frontend build` 通过；`git diff --check` 和 SQLite URL 异步驱动断言通过。
- 未验证：未在真实生产 SQLite 数据库上执行在线迁移和长时间并发压测。
- 下一步：评审异步数据库事务边界，并在测试环境用现有 SQLite 数据库执行一次备份后的 Alembic 升级与回滚演练。

### 2026-08-11 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `46bc1c1` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：发布前质量门禁、`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的生产固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：后端 Ruff/pytest、锁文件检查，前端 lint/test/build，发布脚本语法和 diff 检查；生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认当前分支为 `main`，工作区干净，`HEAD` 为 `46bc1c1`；发布配置使用仓库根目录 `.deploy.env`，正式发布使用生产固定 IP `107.174.152.245`。
- 完成：正式发布当前 `main` 的 `46bc1c1`，release `260811011200`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260810-171210`（容器内权限 `600`，大小 `888832` 字节），未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（136 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（148 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`git diff --check` 和发布脚本 dry-run 均通过；生产容器为 `running/healthy` 且重启次数为 0，容器内 Alembic 为 `20260810_18 (head)`，release 已进入 `/app/frontend/dist/assets/index-CH-gj4Zi.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；传输阶段出现 macOS `com.apple.provenance` 扩展属性提示，不影响发布结果。
- 下一步：在真实设备上复测 SSE 状态展示、识别/订单归并和批量删除等核心流程；通过后将本条标记为完成。

### 2026-08-11 — P5/P6 大模型调用统一 SSE 与流式状态反馈（本次会话）

- 状态：待评审。
- 目标：所有大模型调用使用 SSE 传输；相机/照片识别在识别动画下显示灰色多行流式状态与模型输出，并自动上滚；无识别动画的模型调用显示单行变化状态，必要时附收到文本字数。
- 范围：Agnes 文本/图片/分类/图标模型调用、后端 SSE 事件协议与错误边界、P6 识别和 P5 分类相关前端状态展示、回归测试及受影响文档；不改变识别结果字段、库存保存权限和分类业务规则。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §6.4–§6.9；最终 P6 识别/添加食材与 P5 分类本地设计资产；现有 `backend/fridgeboard/recognition.py`、识别路由和 `frontend/src/InventoryFlow.tsx`。
- 预期验证：覆盖 SSE 事件顺序、文本增量/字数、异常与断流、前端识别滚动框和无动画单行状态；运行 `uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 本次会话目标：按用户确认的 `output/playwright/p6-recognition-stream-design-390.png` 实施 P6 识别页视觉状态；范围为关闭相机时隐藏取景框、保留共享标题栏和底部操作区、将无边框灰色流式文字与 132px 半透明动画叠加显示；预期验证为识别 UI 回归测试、前端 lint/test/build、390/320/430px 布局检查和 `git diff --check`。
- 会话记录：已完成项目级规则和 Python/前端专项规则阅读，确认识别、二维码、分类和 AI 图标生成均存在模型调用；实现统一 SSE 事件契约（status/token/result/error/done），同步升级 Agnes Chat Completions 为 `stream=true`，并为图标候选生成增加 SSE 状态心跳。识别页在动画下展示灰色多行模型输出并自动上滚，分类和图标生成等无识别动画场景展示单行状态，分类状态附累计文本字数。
- 完成：新增 `/api/recognition/stream`、`/api/owner/product-lookup/qr/stream`、所有者/PWA 分类 `category-match/ai/stream` 和 AI 图标候选 `icon-candidates/stream`；前端识别、二维码、手工/食谱自动分类和 AI 图标生成均改用 SSE 消费，旧 JSON 接口仅作为 deprecated 兼容层保留。模型增量只用于等待反馈，最终结构化结果和库存/分类业务语义不变；识别临时图片清理和取消边界保持原规则。
- 验证：后端 `uv run ruff check backend`、`uv run pytest -q`（137 passed）、`uv lock --check`；前端 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（148 passed）、`npm run --prefix frontend build`；`git diff --check` 均通过。新增 `[DONE]` 结束帧、图片识别 SSE 阶段顺序/累计字数、分类 SSE 增量/结果和识别动画文字层回归断言均通过。
- 未验证：未在真实 Agnes 网关验证其图片/文本 SSE 响应格式、上游代理缓冲和真实推理取消；未在真实 iOS/Android PWA 验证窄屏滚动框、触摸返回和长文本视觉；按项目约定未自动执行 Playwright 视觉核验。
- 下一步：评审设备上验证识图、照片、二维码、手工分类、食谱分类和 AI 图标生成的阶段状态/文本流；重点确认反向代理关闭缓冲、模型输出中途断网和返回页面后的相机释放。
- 追加会话：用户要求所有可异步化的模型链路改为原生协程，并在项目规则中禁止使用 `urlopen` 等同步网络操作。目标是移除识别、二维码和图标生成生产适配器的同步 HTTP 与 `to_thread` 包装；同步 provider 仅保留在明确的兼容/测试边界，补充异步取消、结束帧和错误日志回归验证。
- 本次预期验证：`uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 追加完成：识别、二维码、分类和图标生成 provider 全部改为 `async def`，Agnes Chat Completions、图标生成、公开条码库和 SSO 兑换统一改用 `httpx.AsyncClient`；SSE 包装器直接管理可取消协程任务，移除生产代码中的 `asyncio.to_thread`、`urlopen` 和同步 provider 兼容接口。临时识别文件读写、图标候选文件读写改用 AnyIO 异步路径 API；分类和识别 SSE 增加长等待心跳，客户端 SSE 超时会主动 abort。
- 追加验证：`uv run ruff check backend`、`uv run pytest -q`（137 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（148 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；`rg` 确认生产 `backend/fridgeboard` 不再包含 `urlopen`、`urllib.request` 或 `asyncio.to_thread`。
- 追加未验证：未在真实 Agnes 网关验证异步 HTTP 的实际 SSE/图片响应格式、代理缓冲和连接取消；未在真实设备验证长等待心跳和超时后的网络恢复。
- 追加会话：真实照片识别发现状态长期停留在“正在上传图片并请求识别”，下方文字流显示完整 JSON/Markdown 围栏后直到客户端超时；同时识别动画下的文本层错误使用了带边框背景卡片，未实现动画半透明覆盖滚动文字。先复现上游 SSE 结束帧处理和前端事件分层，再修复阶段状态、结束收尾和视觉层。
- 追加完成：上游 Chat Completions 和分类 SSE 读取器消费 `data: [DONE]` 后立即结束，不再等待连接自然关闭；识别 SSE 增加读取照片、上传、等待响应、接收输出和解析结果阶段状态，最终结果前发送明确收尾状态。识别动画保持 132px 原尺寸，移入更大的无边框滚动文字层并以半透明覆盖文字，移除文字层边框和背景卡片。
- 追加验证：新增 `[DONE]` 后立即停止读取、模型增量转发和阶段状态断言；专项识别 SSE 测试 2 passed，前端 lint、识别 UI 测试和构建通过。全量验证见本条主记录。
- 追加未验证：未在真实 Agnes 网关和真实移动设备上验证代理缓冲、实际结束帧格式、动画覆盖文字的最终视觉密度；按约定未自动执行 Playwright。
- 追加会话：针对异步模型重构后的 SSE 二次审查与修复。目标是逐项关闭长等待心跳、上游超时、断开取消、旧同步模型接口、异常日志和前端 SSE 消费边界；范围覆盖识别、二维码、分类、图标生成及统一前端流式请求；设计基线沿用本条 SSE 事件契约和功能设计 §6.4–§6.9；预期验证为对应失败测试、后端/前端全量门禁、锁文件与 diff 检查。
- 追加完成：确认异步重构已移除生产网络 I/O 的同步线程包装，识别/二维码/分类/图标流统一发送长等待心跳并在取消时传播到原生异步 HTTP；修复模型任务异常二次抛出、分类首个增量缺少阶段状态、分类/食谱前端忽略服务端阶段文案、SSE 非流式响应误解析和旧 JSON 模型接口未标记弃用等问题。图像生成上游按当前接口契约继续使用异步 JSON HTTP，浏览器到本服务仍以 SSE 返回阶段状态。
- 追加验证：分类专项失败回归、前端状态/SSE 消费回归、后端 Ruff 和前端 lint 已通过；全量 `uv run pytest -q` 为 138 passed，前端测试为 151 passed，前端生产构建、`uv lock --check` 和 `git diff --check` 均通过。
- 追加未验证：尚未连接真实 Agnes 网关验证图像生成接口的实际返回契约、反向代理缓冲和真实取消；尚未在 iOS/Android PWA 真机验证阶段文案、长等待心跳、返回取消和窄屏显示；旧 JSON 兼容接口仅完成 deprecated 标记，仍需确认外部客户端迁移情况。
- 下一步：评审环境优先验证识图、照片、二维码、自动分类和 AI 图标生成的 SSE 事件顺序与长等待状态；确认旧 JSON 客户端迁移完成后再移除兼容路由。
- 追加会话：生产环境复测后先按部署文档读取容器和持久日志，排查“无提示退出”与 P6 流式识别页面设计偏差；范围为服务器容器状态、数据库连接池错误、静态资源状态和独立 P6 识别流式效果图，不修改应用实现，等待 UI 确认后再进入修复。
- 追加完成：服务器 `fridgeboard-app` 当前 `running/healthy`、退出码 0、OOM=false、重启次数 0，未发生进程崩溃；06:32 和 06:46 的主要错误为 `QueuePool limit of size 5 overflow 10 reached`，集中出现在图标资源与通知请求。代码证据显示图标生成 SSE 仍通过 `generate_icon_candidates()` 持有数据库事务跨越 `await service.generate()`，模型/图像生成等待期间占满连接池；`sw.js` 和 `manifest.webmanifest` 当前服务器均可返回 200，早先 404 不是当前静态资源缺失。已生成独立 390×844 效果图 `output/playwright/p6-recognition-stream-design-390.png`，展示无边框灰色多行文字、132px 半透明动画覆盖和累计字数。
- 追加未验证：尚未修复连接池长事务问题，也未在真实设备确认效果图；等待用户确认效果后再修改 P6 UI 和图标生成事务边界。
- 追加会话：按当前 `InventoryFlow.tsx` 的关闭相机识别状态重制效果图；移除不属于该状态的取景框、取景提示和说明性文案，保留共享白色标题栏、黑色识别区、`RecognitionProgress` 状态、无边框灰色文字流、132px 半透明动画及现有底部操作区的压暗状态。
- 追加验证：已更新 `output/playwright/p6-recognition-stream-design.html` 并用 Playwright 在 390×844 视口生成 `output/playwright/p6-recognition-stream-design-390.png`；视觉核对确认未出现相机拍照框。
- 本次完成：将确认效果落到 P6 识别页；照片选择后立即显示“正在读取照片…”，上传阶段更新为“正在上传照片并请求识别…”，识别中无论相机状态更新是否完成都隐藏取景框和相机提示，保留动画覆盖文字流与压暗底部操作区；移除 P6 顶部栏先设置深色、再由后续规则覆盖的冲突样式。
- 本次验证：P6 识别 UI 专项测试通过；`npm run --prefix frontend test -- --run`（151 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；效果图 Playwright 390×844 截图已更新，320/430px 视口无文档溢出。
- 本次未验证：尚未在真实 iOS/Android PWA 上从照片选择、相机识图和扫码三条路径确认相机释放、阶段状态切换及反向代理下的 SSE 展示；需评审环境验收后再标记完成。

### 2026-08-11 — P5 物品列表批量真删除（本次会话）

- 状态：待评审。
- 目标：物品列表多选后增加“删除”操作；确认后按库存批次执行批量真删除，不将数量改为 0 的软删除。
- 范围：所有者物品列表/全冰箱搜索的选择态与确认弹窗、批量删除 API、库存缓存刷新和前后端回归测试；不改变数量调整、恢复数量、跨冰箱移动和日常访问权限语义。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3.5–§3.7；编辑既有食材草稿 `7224e71b-8055-40ec-a9a9-db68b6744764` 及对应本地 PNG/HTML；现有图标多选、单条删除和批量移动实现。
- 预期验证：覆盖批量删除的所有者校验、真删除及消费审计引用清理、确认弹窗取消/确认和删除失败状态；运行 `uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认现有列表已具备图标多选及“取消/移动”，后端仅有单条真删除接口；数量归零属于保留批次的软删除，不能复用。已完成项目规范、前端规则、UI 规范、功能规则、最终设计注册表和相关本地设计资产索引阅读，先补批量删除接口与权限边界，再实现确认交互和缓存同步。
- 完成：新增所有者批量真删除接口，服务端校验批次均属于当前所有者的活跃冰箱，并清理消费审计引用后永久删除；物品列表和全冰箱搜索在所有者选择态显示“删除”，通过确认弹窗后提交，取消或失败保留选择，成功后同步当前库存、首页库存和全冰箱搜索缓存。数量归零软删除、跨冰箱移动和日常访问权限保持不变；同步更新功能规则 §3.7。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（135 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（148 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增批量真删除 API 回归覆盖正库存与零库存批次永久消失，并已对照编辑既有食材草稿 `7224e71b-8055-40ec-a9a9-db68b6744764` 的本地 `pwa-edit-food` PNG/HTML。
- 未验证：未在真实 iOS/Android PWA 上验证删除确认弹窗的触摸、窄屏布局和删除失败后的网络恢复；按项目约定未自动执行 Playwright 视觉核验；Python 测试仍有现有依赖弃用警告，不影响结果。
- 下一步：在评审设备以所有者账号选择一个正库存批次和一个数量为 0 的批次，分别取消和确认删除，确认两条记录都从物品列表消失且不会生成可恢复数量；再以日常访问账号确认不显示删除按钮。

### 2026-08-11 — P6 订单识别名称、价格与库存归并（本次会话）

- 状态：待评审。
- 目标：订单截图识别只保留物品核心名称，准确提取“实付”价格；在识别订单页面为每组物品提供可修改的冰箱位置，并在已有同名库存时复用对应位置、累加数量而不是新增重复物品。
- 范围：订单识别响应清洗与价格字段、识别订单页面的位置选择交互、库存保存时的同名归并、相关后端/前端回归测试和文档同步；不改变普通相机/照片识别、手工编辑和跨冰箱移动语义。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §6.4、§6.8、§6.9；P6 识别/添加食材设计稿 `36284a96-d2ad-4fce-96b8-c59af859dc8d`、`e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 及对应本地 PNG/HTML；现有订单识别与位置记忆实现。
- 预期验证：新增名称/实付价格解析、位置默认/修改、同名库存数量合并回归；运行 `uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：先登记任务，再检查订单识别接口、库存合并条件和现有页面位置选择边界；实现后同步 P6 看板、功能规则/验收文档中的新增语义，并记录未完成的真实设备和识别准确率验收。
- 完成：新增订单商品名标准化（促销标签、品牌、规格、括号和组合后缀清洗）及实付金额解析；Agnes 提示词要求订单项返回核心名称和 `paid_price`，接口以 `price` 返回两位小数。识别订单列表在“分类：”行右侧显示位置和箭头，默认按同名库存位置、最近添加位置、首个有效位置依次回退，点击后可通过共享冰箱预览修改。订单提交使用显式同名合并标记，在同一小类和选定格位复用批次并累加数量，空价格/描述只按需补齐；普通录入的不同价格批次规则不变。另修复工作区中待完成库存删除入口未解构 `onDeleteSelected` 导致列表渲染崩溃的问题。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（135 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（148 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；其中 P6 订单专项测试 3 passed。
- 未验证：未在真实 iOS/Android PWA 上验证订单截图识别准确率、触摸位置选择和实付金额在真实 Agnes 响应中的表现；未执行 Playwright，符合本次未要求自动视觉核验的约定。
- 下一步：用真实订单截图和包含同名/不同价格库存的冰箱数据验收；通过真实设备验收后再将 P6 本条标记为完成。

### 2026-08-10 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `618f36c` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：发布前质量门禁、`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的生产固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：后端 Ruff/pytest、锁文件检查，前端 lint/test/build，发布脚本语法和 diff 检查；生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认当前分支为 `main`，工作区干净，`HEAD` 为 `618f36c`；发布配置使用仓库根目录 `.deploy.env`，正式发布通过生产固定 IP SSH。
- 完成：正式发布当前 `main` 的 `618f36c`，release `260810234551`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260810-154609`（权限 `600`），未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（130 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（146 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy` 且重启次数为 0，容器内 Alembic 为 `20260810_18 (head)`，release 已进入 `/app/frontend/dist/assets/index-2CwBOCYR.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；归档传输过程出现 macOS `com.apple.provenance` 扩展属性提示，不影响发布结果。
- 下一步：在真实设备上复测核心流程；通过后将本条标记为完成。

### 2026-08-10 — Agnes 识别错误诊断日志与生产模型切换（本次会话）

- 状态：待评审。
- 目标：补齐 Agnes 图片/订单识别失败所需的异常链、上游响应元信息和解析阶段日志，配置日志按天轮换且最多保留 7 天；将生产识别模型切换为 `agnes-2.5-flash` 并适当提高输出上限。
- 范围：`AGENTS.md` 日志规范、后端 Agnes 识别适配器与错误日志、日志轮换配置、识别回归测试、生产 `/opt/fridgeboard/.env` 和容器重建；不记录 Token、Cookie、Authorization、原始图片或无关业务数据，不修改数据库结构和库存数据。
- 设计/需求基线：用户本次明确要求；既有“Agnes 返回格式无效”生产日志分析；`backend/fridgeboard/recognition.py`、`backend/fridgeboard/main.py`、`backend/fridgeboard/logging_support.py` 现有异常处理；单容器部署约束。
- 预期验证：后端日志/识别回归测试、`uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`git diff --check`；生产模型/输出上限、日志轮换文件、容器健康和 `/healthz` 验证。
- 会话记录：已确认生产当前使用 `agnes-2.0-flash`，过去识别请求 12 次中 6 次返回 503；现有日志只保存路径、状态和异常类型，无法判断 Agnes 原始响应是否截断或结构不符。先登记本任务，再补安全的错误上下文和每日轮换，最后更新生产配置并重建容器。
- 完成：`AGENTS.md` 新增错误日志强制规范；Agnes 图片、二维码和分类请求分别记录异常链、脱敏 endpoint、模型、耗时、上游状态、响应类型/长度、`finish_reason` 和有界脱敏响应正文；HTTP 错误详情、识别字段和订单商品项校验失败均保留服务端上下文；生产文件日志按 UTC 日轮换，Docker stdout/stderr 限制为 20 MB × 7 个文件；生产模型切换为 `agnes-2.5-flash`，`FRIDGEBOARD_AGNES_MAX_TOKENS=2048`。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（130 passed）、`uv lock --check`、`git diff --check`；生产数据库备份 `/data/fridgeboard.db.backup-20260810-153651` 已创建，容器重建后为 healthy，公网 `/healthz` 返回 `{"status":"ok"}`；`/data/logs/fridgeboard.log` 已实际写入，权限为 `640`，Docker 日志配置为 `max-size=20m`、`max-file=7`。
- 未验证：尚未用真实购物清单截图确认 Agnes 在 2.5/2048 配置下的成功率，也未观察跨日轮换后归档删除；本次无害 404 已确认持久日志落盘。
- 下一步：请用此前会失败的购物清单截图重试；若仍失败，可直接按失败时间在 `/data/logs/fridgeboard.log` 查询完整上游响应和 `finish_reason`，再针对实际响应调整解析或提示词。

### 2026-08-10 — 手机端数据刷新频率与重复加载收口（本次会话）

- 状态：待评审。
- 目标：将手机端页面缓存自动刷新周期从 2 小时调整为每天一次，除用户主动下拉刷新、程序更新和必要业务操作外，避免因页面切换或首页左右滑动重复读取已缓存的冰箱数据。
- 范围：React 手机端页面缓存、应用启动/冰箱切换/食谱预热/冰箱概览预热/全冰箱搜索的数据加载入口及相关回归测试；不改变用户主动下拉刷新、保存/删除/移动等业务操作后的必要同步，不改变设备绑定流程的状态轮询和 Kindle 端设备同步协议。
- 设计/需求基线：用户本次明确需求；现有 `frontend/src/pageCache.ts` 缓存约定；`docs/architecture/README.md` 的设备同步边界；前端页面壳和刷新交互约定。
- 预期验证：补充缓存周期和切换复用回归，运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已定位应用启动无条件刷新当前工作区、预热食谱/概览、缓存过期时冰箱切换后台刷新、通知每分钟轮询和全冰箱搜索每次进入重新读取等入口；先更新进度，再按“启动时仅按每日缓存策略自动刷新、已读冰箱切换和搜索只复用缓存、手动刷新继续强制读取”的边界实现。
- 完成：页面缓存 TTL 改为 24 小时；启动仅在当前工作区缓存不存在或过期时自动读取；冰箱切换/设置页复用已有工作区快照，不因过期缓存自动后台刷新；移除启动时食谱和冰箱概览预热；通知改为当前冰箱进入时读取一次，不再每分钟轮询；全冰箱搜索按冰箱缓存库存与图标，库存保存/删除、临期设置更新、食谱扣减和跨冰箱移动会主动失效受影响缓存；修复库存变更后的食谱刷新标记不会在后续每次进入时持续强制刷新。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（146 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增 24 小时过期和“启动/页面切换/主动刷新”加载策略回归断言。
- 未验证：未在真实 iOS/Android PWA 上长时间观察跨日自动刷新、左右滑动切换和离线恢复；未执行 Playwright，符合本次未要求自动视觉核验的项目约定。
- 下一步：在真实手机上验证首次打开、24 小时后重新打开、同一会话左右切换冰箱、重复进入搜索页和主动下拉刷新，确认页面不跳转且库存变更后的搜索/食谱数据仍及时更新。

### 2026-08-10 — P6 照片识别后相机释放与返回修复（本次会话）

- 状态：待评审。
- 目标：点击“照片”后立即停止实时相机；取消照片选择或照片识别完成后，识别页左上角返回按钮保持可用。
- 范围：`frontend/src/InventoryFlow.tsx` 的照片入口、相机释放和照片选择回调；相关前端回归测试与本进度记录；不改变扫码、实时识图和识别结果字段处理。
- 设计/需求基线：用户本次反馈；P6 相机页返回即释放相机规则；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §6；P6 本地识别页/添加物品设计资产。
- 预期验证：补充照片入口/相机释放/返回导航回归，运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已定位照片按钮仅触发隐藏文件输入且取消选择没有 `change` 回调；先登记任务，再以最小改动收口相机会话，并为取消选择和识别完成路径补回归验证。
- 完成：照片按钮改为先停止所有活动媒体轨道、暂停视频并清空 `srcObject`，再打开照片选择器；取消选择会清理文件输入值；识别成功后的页面切换和识别页返回统一复用相机关闭状态。共享 `PageHeader` 在标题切换后重置返回动画保护，避免同一页面壳复用时返回按钮被残留状态锁死。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（145 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增相机关闭 UI 状态回归断言。
- 未验证：未在真实 iOS/Android PWA 上确认系统照片选择器取消、选图和相机占用指示灯消失时序；未执行 Playwright，符合本次未要求自动视觉核验的项目约定。
- 下一步：在真实设备打开“识别物品”，确认点击“照片”后相机立即停止；取消选图后返回键可用；选图识别成功进入添加物品后，返回键可正常退出添加流程。

### 2026-08-10 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `0c4307d` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的生产固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认当前分支为 `main`，工作区干净，发布配置使用仓库根目录 `.deploy.env`，正式发布通过生产固定 IP SSH。
- 完成：正式发布当前 `main` 的 `0c4307d`，release `260810195730`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260810-115741`，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（128 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（144 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `healthy`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；传输阶段出现 macOS `com.apple.provenance` 扩展属性提示，不影响发布结果。
- 下一步：在真实设备上复测核心流程；通过后将本条标记为完成。

### 2026-08-10 — 修复食谱自动分类审查问题（本次会话）

- 状态：待评审。
- 目标：修复手工新增食谱快速保存后 AI 分类请求被取消，以及所有者食谱接口过度排除空值的问题。
- 范围：食谱编辑器后台分类生命周期、食谱响应模型与回归测试；不改变食材名称严格匹配、分类缓存和设备/PWA 只读响应规则。
- 设计/需求基线：上一条 P5 食谱食材后台自动分类实现；本次代码审查结论；现有食谱 API 兼容约定。
- 预期验证：补充保存后后台回写和空值字段兼容回归，运行后端 Ruff/pytest、前端 lint/test/build、锁文件和 diff 检查。
- 会话记录：先将保存后的食谱响应纳入与导入相同的后台分类回写路径，再用独立缺货食材响应模型替代全路由 `response_model_exclude_none`。
- 完成：保存食谱成功后继续后台匹配并回写保存快照，即使编辑页已离开也不会丢失自动分类；导入流程仍在用户停留列表时回写，避免覆盖正在编辑的内容。所有者食谱接口保留原有空值字段，仅缺货列表使用不含分类字段的兼容模型。
- 验证：`uv run pytest -q`（128 passed）、`uv run ruff check backend`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（144 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright 和真实设备验收；保存后后台 AI 回写依赖浏览器仍可发出请求，网络断开时会保留缓存并可在下次编辑重试。
- 下一步：评审快速保存新食谱、保存后离开页面以及旧客户端读取空值字段的兼容性。

### 2026-08-10 — P5 食谱食材后台自动分类（本次会话）

- 状态：待评审。
- 目标：在新增或导入食谱时，后台为食材名称自动匹配当前冰箱小类，保留手工修改优先和无法确认时的原始文本。
- 范围：食谱新增/导入 API、当前冰箱分类匹配与缓存复用、前端食材编辑状态和回归测试；不改变食谱文本导入的覆盖/追加语义，不自动创建分类。
- 设计/需求基线：用户本次明确需求；既有 P5 自动分类实现及 `docs/functional-design-and-feasibility.md` §6.4–§6.7；现有食谱编辑和文本导入链路。
- 预期验证：补充后端食谱保存/导入分类回归、前端食谱食材自动匹配状态与手工优先回归，运行后端 Ruff/pytest、前端 lint/test/build 和 diff 检查。
- 会话记录：先检查食谱食材当前是否仅保存名称，再决定以现有冰箱级名称缓存为快速路径、以后台 AI 为兜底，且不让分类请求阻塞食谱保存。
- 完成：食谱导入、手工新增和编辑保存均复用当前冰箱内置分类/缓存快速匹配；编辑页对未分类食材进行 450ms 防抖后台匹配，展示“正在自动匹配分类/正在使用智能匹配分类”状态，名称修改会清除旧分类并保护用户输入优先。导入后的 AI 结果通过现有分类接口写入冰箱级缓存，并在用户仍停留在食谱列表时后台回写当前食谱分类；食谱扣减和补货仍严格按原始食材名称，不以分类替代名称匹配。所有者食谱响应返回分类信息，设备/PWA 只读响应保持原有字段兼容。
- 验证：`uv run pytest -q`（128 passed）、`uv run ruff check backend`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（144 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright、真实设备触摸和真实 Agnes 分类准确率验收；导入后台回写仅在用户仍停留在食谱列表且请求成功时执行，失败时保留缓存并在下次编辑/保存时回填。
- 下一步：评审导入后打开编辑页的分类回填、手工改名时的晚到结果保护，以及小屏状态文字布局。

### 2026-08-10 — 修复 Iconoir 时钟被通用填充覆盖（本次会话）

- 状态：待评审。
- 现象：手机首页的 `iconoir:clock` 时钟图标外圈显示为黑色实心圆，时针和外圈不清晰。
- 根本原因：通用 `.p7-risk-icon` 将 `fill: currentColor` 应用到时钟 SVG，覆盖 Iconoir 的 `fill="none"`。
- 完成：仅对 `data-icon="iconoir:clock"` 使用无填充、线框描边；过期警告仍保持填充路径。
- 范围：手机首页风险图标 CSS 和回归检查，不改计数、角标和列表筛选行为。
- 验证：新增时钟 SVG 无填充断言，运行前端测试、lint、构建和 `git diff --check`。

### 2026-08-10 — P5 自动分类审查问题修复（本次会话）

- 状态：待评审。
- 目标：修复自动分类实现审查发现的相机分类 ID 被过滤、订单分类 ID 未校验、分类缓存阻塞目录删除、取消状态泄漏、缓存无过期和自动匹配状态标题布局问题。
- 范围：识别响应白名单与当前冰箱分类校验、分类缓存迁移/清理/过期、取消状态生命周期、前端分类标题布局和专项回归测试；不改变两级分类模型、用户手工优先和库存保存权限规则。
- 设计/需求基线：用户本次明确修复要求；上一轮自动分类实现审查结论；`docs/functional-design-and-feasibility.md` §6.4.1；现有 `20260810_17` 分类缓存迁移和 `InventoryFlow` 自动分类交互。
- 预期验证：新增非法分类 ID、分类删除缓存、取消状态生命周期和标题布局回归；运行 `uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：已确认审查问题均可在现有代码中定位；先补失败用例，再修复服务端白名单与外键/清理边界，最后处理前端布局和缓存生命周期。
- 完成：相机识别和订单识别的分类 ID 现在只接受当前冰箱的小类候选，非法 ID 会按名称尝试保守回填，否则丢弃；新增 AI 分类缓存过期字段和 `20260810_18` 迁移，用户确认会清除过期时间；目录同步删除小类前清理缓存外键；取消请求改为带 5 分钟 TTL 的消费式状态，前端状态标题改为独立容器避免网格列错位；新增对应后端回归测试。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（118 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（141 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：分类模型正在进行中的真实网络请求仍是“结果丢弃”而非中断底层同步 HTTP；未在真实 iOS/Android/PWA 设备上复测标题密度、取消竞态和线上分类准确率。
- 下一步：评审设备验证相机/订单分类、打开分类页取消匹配和小屏标题布局；如需真正中断 Agnes 请求，另行将同步 HTTP 客户端改为可取消的异步实现。

### 2026-08-10 — P5 自动填写物品分类（本次会话）

- 状态：待评审。
- 目标：为相机/照片/订单识别和手工填写物品增加自动选择小类；优先使用预定义别名与冰箱级缓存，未命中时后台调用 Agnes，并支持用户打开分类选择器取消自动匹配。
- 范围：分类标准化与匹配服务、物品分类缓存及迁移、手工录入防抖/状态/取消、相机识别返回合法小类 ID、订单逐项分类和相关回归测试；不改变两级分类目录、库存严格按小类保存、用户手工修改优先和 AI 不创建新分类规则。
- 设计/需求基线：用户本次明确需求；`docs/functional-design-and-feasibility.md` §2.1、§3.4、§6.4–§6.7；`docs/ui-design-specification.md` 共享页面壳和状态反馈规范；现有 `backend/fridgeboard/recognition.py`、`frontend/src/InventoryFlow.tsx` 识别/录入链路。
- 预期验证：后端匹配、缓存作用域、取消和识别响应回归；前端防抖、用户优先、过期结果和订单分类回归；运行 `uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：已完成方案设计与现有分类/识别链路核对；先补充名称标准化、别名优先、歧义不自动选择和 API 白名单失败用例，再实现确定性匹配→AI 兜底链路。相机/照片请求携带冰箱 ID，识别结果按已有小类校验；订单项目保留逐项分类，未分类项目不再落到首个分类。
- 完成：新增版本化分类别名清单、冰箱级 `item_category_mappings` 缓存和 `20260810_17` 迁移；新增所有者/PWA 快速匹配、AI 匹配和取消接口，AI 结果只允许当前冰箱候选小类并在事务中写入未确认缓存；新增库存保存时的用户确认映射回写。手工录入加入 450ms 防抖、快速命中、后台状态“正在自动匹配分类…”、分类页取消、手工选择优先和晚到结果保护；相机识别按当前冰箱小类名称回填 ID，订单识别按逐项小类保存；同步功能规则文档。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（115 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（141 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；自动分类专项测试覆盖别名精确命中、歧义不匹配、AI 候选白名单、AI 缓存回读和前端过期/取消保护。
- 未验证：真实 Agnes 分类准确率与超时体验；真实 iOS/Android 相机、PWA 设备上的分类状态视觉、取消竞态和订单逐项分类操作；尚未执行 Playwright 视觉核验。
- 下一步：评审设备上分别验证“牛奶/品牌商品/自定义商品/歧义名称”、打开分类选择器取消模型、相机照片识别和订单截图逐项分类；根据真实纠正率调整别名和匹配阈值后再标记完成。

### 2026-08-10 — P5 自动填写物品分类收口（本次会话）

- 状态：待评审。
- 目标：完成上一会话遗留的可取消模型请求、自定义小类候选、订单逐项手工分类和 AI 缓存过期清理。
- 范围：分类模型异步取消边界、相机/订单识别候选注入、订单页面分类选择、缓存过期字段与清理、专项回归测试和文档同步；不改变现有两级分类目录、用户手工优先和库存保存规则。
- 设计/需求基线：上一会话自动分类方案与实现；本进度条目中记录的未完成项；`docs/functional-design-and-feasibility.md` §6.4.1、§6.5–§6.7；单进程单容器约束。
- 预期验证：后端分类取消/候选/缓存生命周期测试，前端订单分类交互测试，以及 `uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`uv lock --check`、`git diff --check`。
- 会话记录：上一版已通过本地测试，但确认同步 `urlopen()` 只能丢弃晚到结果，无法停止已发出的模型请求；图片提示词也未包含当前冰箱自定义小类，订单未分类项目没有逐项选择入口，AI 缓存没有过期时间。将先补失败用例再逐项收口。
- 缓存生命周期子任务：补齐 AI 临时映射的明确有效期、实际使用模型版本记录与按请求清理策略；清理只允许删除“未确认且已过期”的记录，任何已确认用户映射均永久保留。专项验证覆盖过期清理、确认映射保护和模型标识持久化。
- 缓存生命周期完成：`20260810_18` 为升级前已有 AI 临时映射回填 90 天有效期；新 AI 结果保存实际配置模型名，快速/AI 匹配在事务内机会式清理过期未确认映射；确认映射忽略历史过期脏值且不会被晚到 AI 降级。专项迁移与接口测试通过（10 passed），Ruff 专项检查通过。
- 前端订单交互子任务：为每个识别商品显式展示小类并复用分类抽屉手工更正；未分类项目禁用勾选，仅在选定合法小类后纳入批量添加。
- 前端订单交互完成：订单页逐项显示当前小类，已分类和未分类项目都可打开共享分类抽屉更正；未分类或失效小类项目禁用勾选，手工选定合法小类后自动纳入待添加列表；底部数量和批量保存再次按当前冰箱小类白名单过滤，不使用首个分类兜底。
- 前端订单交互验证：先补充未分类/失效分类失败用例；实现后 `npm run --prefix frontend test -- --run` （143 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。未自动执行 Playwright，保留真实手机抽屉触摸与小屏高度验收。
- 可取消模型完成：默认 Agnes 分类适配器改用可取消的异步 HTTP 客户端；分类路由登记活动任务，取消接口中断本进程等待中的任务并丢弃晚到结果；同步注入适配器继续通过线程兼容。修复 Alembic 迁移配置不应禁用应用 logger 的测试顺序回归。
- 相机自定义小类完成：识别前仅注入当前冰箱的全局内置和自定义小类候选，普通项与订单项响应均按当前候选 ID 白名单规范化，隔离其他冰箱分类。
- 缓存与模型标识完成：AI 临时映射统一 90 天有效期，机会式清理只删除过期且未确认记录；确认映射永久保留，晚到 AI 不得降级；持久化实际模型名。
- 最终验证：`uv run ruff check backend`、`uv run pytest -q`（124 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（143 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 Agnes 取消行为、真实照片/订单识别准确率、真实 iOS/Android PWA 视觉和触摸体验。
- 下一步：评审时在真实设备验证照片/订单分类、打开分类页取消匹配、订单逐项选择及小屏触摸布局；若 Agnes 服务端提供独立取消 API，再补充服务端推理停止验证。

### 2026-08-10 — P5 自动分类代码审查修复（本次会话）

- 状态：待评审。
- 目标：修复代码审查发现的无冰箱上下文分类丢失、空白物品名写入缓存和图片 provider 参数名耦合问题。
- 范围：识别响应兼容、分类请求输入校验、图片识别 provider 签名适配及对应回归测试；不改变 Agnes 远程服务行为和分类业务规则。
- 设计/需求基线：上一条 P5 自动分类收口实现；本次代码审查结论；`RecognitionRequest` 的可选冰箱上下文兼容约定。
- 预期验证：新增三条回归用例，运行后端 Ruff、相关测试、全量测试、锁文件和 diff 检查。
- 会话记录：先保留无冰箱上下文的名称分类但不信任分类 ID，再阻止空白名称进入 AI 缓存，最后按 provider 可绑定签名传递候选参数。
- 完成：无冰箱上下文时保留名称分类并丢弃未经白名单验证的 ID；空白物品名在请求模型层拒绝；图片 provider 按可绑定签名支持任意第三参数名称及关键字参数。
- 验证：相关测试 25 passed；后端全量 `uv run pytest -q`（127 passed）、`uv run ruff check backend`、`uv lock --check`、`git diff --check` 均通过。
- 未验证：未新增真实设备或 Playwright 验证；Agnes 远程服务不在本次修复范围内。
- 下一步：进入代码评审和真实设备验收。

### 2026-08-10 — 每周食谱每天标题行新增食谱入口（本次会话）

- 状态：待评审。
- 目标：在每周食谱页面每一天标题行最右侧增加加号图标，点击后打开该天对应的新增食谱编辑页；新增页沿用编辑食谱表单，但不显示底部删除按钮。
- 范围：手机端 P9 每周食谱日分组标题行、新增食谱入口的可访问性与星期预填、相关前端回归测试和进度记录；不改变食谱保存、编辑、删除、完成/撤销、周切换和权限语义。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §6.2、§7、§8、§9；`docs/functional-design-and-feasibility.md` §9.1–§9.4；冻结草稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`、`bbeda1ae-e99c-40d6-87b3-90cdedd7adfa` 及本地 `docs/ui-assets/png/pwa-weekly-recipes.png`、`docs/ui-assets/png/pwa-recipe-edit.png` 和对应 HTML。
- 预期验证：补充静态交互回归，运行 `npm run --prefix frontend test -- --run`、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`；按项目约定不自动执行 Playwright，记录 320/390/430px 与真实设备视觉验收项。
- 会话记录：已确认每日标题行是现有 P9 分组的稳定布局边界；新增入口复用编辑页已有 `id` 判定，空 id 表示新增，因此不显示删除按钮；仅所有者显示入口，保持只读访问权限语义。
- 完成：每个可编辑日分组标题行右侧新增 48×48 热区的 24px 线框加号，使用 `周X添加食谱` 可访问名称；点击后进入“编辑食谱”并预填对应星期；空天移除重复的整行添加按钮，保留空状态文本；新增草稿构造抽到 `recipeDraft.ts` 供组件和测试复用。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts`（82 passed）、`npm run --prefix frontend test -- --run`（140 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；已阅读并对照本地 P9 周食谱/编辑食谱 PNG 与 HTML 资产。
- 未验证：按项目约定未自动执行 Playwright；尚未在 320/390/430px 视口和真实 iOS/Android PWA 确认加号行的最终视觉密度、触摸反馈与新增保存流程。
- 下一步：在评审设备切换本周/下周，逐一点击七天加号，确认星期预填、保存后列表归属及新增页没有删除按钮；通过后将本条标记为完成。

### 2026-08-10 — 风险汇总时钟图标改为 Iconoir（本次会话）

- 状态：待评审。
- 目标：将手机 PWA 和冰箱端首页的临期汇总时钟图标统一改为正确拼写的 `iconoir:clock`。
- 范围：两端临期汇总 SVG 路径、图标名称静态回归断言与进度记录；不改过期警告图标、数字角标和风险计数。
- 设计/需求基线：用户本次明确指定；Iconify `iconoir:clock` standard SVG；既有冰箱端冻结草稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 和手机首页冻结草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`。
- 预期验证：新增正确图标名称与路径回归，运行前端测试、lint、构建和 `git diff --check`。
- 完成：手机和冰箱端临期汇总均改为 `iconoir:clock`；手机端使用 24px 线框 SVG，Kindle ES5 使用同一路径语义并保持旧 WebKit 兼容。
- 验证：图标名称回归先因仍输出旧名称而失败，实现后 `npm run --prefix frontend test -- --run`（139 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py::test_kindle_home_risk_summary_uses_clock_warning_and_corner_counts -q`（1 passed）、`node --check frontend/public/kindle.js` 和 `git diff --check` 均通过。
- 未验证：未在真实 iOS/Android PWA 或 DP75SDI 上复测图标线宽、角标清晰度和触摸效果。

### 2026-08-10 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `63efba6` 发布到生产服务器，并将本地调试数据库升级到当前 Alembic head。
- 范围：本地 `./fridgeboard.db` 的 Alembic 前向迁移；`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布与本地数据库同步要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的生产固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定；当前迁移 head `20260810_18`。
- 预期验证：本地数据库迁移至 `head`；发布前质量门禁通过，生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认当前分支为 `main`，修复提交为 `63efba6`；`.env` 使用仓库根目录 `./fridgeboard.db`，正式发布使用仓库根目录 `.deploy.env` 和生产固定 IP。
- 完成：本地调试数据库已从 `20260810_16` 升级到 `20260810_18 (head)`；修复 `requirements.lock` 缺失的 `httpx==0.28.1`、`httpcore` 和 `certifi` 等传递依赖，并提交为 `63efba6`；正式发布最终 release `260810175001`。
- 发布记录：首次发布 release `260810173541` 因缺少 `httpx` 启动失败；已保留生产数据库备份 `/data/fridgeboard.db.backup-20260810-093551`（权限 `600`），移除异常重启的临时容器但未删除数据卷，再用修复归档重建恢复服务；未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（127 passed）、`uv lock --check`、前端 lint/test/build、`sh -n scripts/deploy-image.sh`、`git diff --check`、本地 `docker build --tag fridgeboard:local .` 和镜像内 `httpx` 导入检查均通过；生产容器为 `running/healthy` 且重启次数为 0，容器内 Alembic 为 `20260810_18 (head)`，release 已进入 `/app/frontend/dist/assets/index-LcdRS4LA.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测核心流程；通过后将本条标记为完成。

### 2026-08-10 — P7 手机首页临期/过期图标与数字角标纠正（本次会话）

- 状态：待评审。
- 现象：用户在手机 PWA 首页未看到上一次图标变化。
- 根本原因：上一次把“首页顶端右侧”误解为冰箱显示设备首页，只修改了 `frontend/public/kindle.js`；手机首页 `FridgeHome` 仍渲染旧的斜纹方框和黑底感叹号。
- 建议解决方案：手机首页临期改为 `iconoir:clock` 语义图标，过期改为 `ant-design:warning-outlined` 语义图标，数字均定位在各自图标右上角；计数直接来自当前冰箱正库存的临期/过期批次，点击进入对应筛选列表。
- 范围：手机 PWA 首页风险汇总、过期列表筛选入口、共享样式及前端回归测试；不改风险计算规则、通知轮询、食材单批次标记或 API。
- 设计/需求基线：用户本次纠正；`docs/ui-design-specification.md` §6.1、§8、§10；`docs/functional-design-and-feasibility.md` §5.1、§5.3、§17.1；手机首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `pwa-home` PNG/HTML；用户指定的新图标语义覆盖冻结稿旧图形。
- 预期验证：先补失败用例覆盖两个 SVG、右上角数字和过期列表筛选；运行前端测试、lint、生产构建与 `git diff --check`；按项目约定不自动执行 Playwright。
- 完成：手机首页临期提示已替换为 Iconoir Clock，过期提示已替换为 Ant Design Warning Outlined，两个数字角标均绝对定位在图标右上角；计数排除零库存批次。点击时分别进入临期/过期物品列表，原有首页通知弹窗入口保留并位于风险图标左侧。
- 验证：新增用例先因手机首页仍输出旧斜纹方框而失败，实现后通过；`npm run --prefix frontend test -- --run`（139 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：按项目约定未自动执行 Playwright；尚未在真实 iOS/Android PWA 确认 320/390/430px 下的顶部换行、角标清晰度和触摸进入筛选列表。
- 下一步：刷新手机 PWA 首页，用同时包含临期和过期的库存确认时钟、警告图标与右上角数字，并分别点击验证列表只显示对应状态。

### 2026-08-10 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `b77cfb4` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的生产固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认当前分支为 `main`，HEAD 为 `b77cfb4`，工作区无未提交改动；发布配置使用仓库根目录 `.deploy.env`，正式发布仅通过生产固定 IP SSH。
- 完成：正式发布当前 `main` 的 `b77cfb4`，release `260810114800`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260810-034811`，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（111 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（138 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `healthy`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；归档传输过程出现 macOS `com.apple.provenance` 扩展属性提示，不影响发布结果。
- 下一步：在真实设备上复测核心流程；通过后将本条标记为完成。

### 2026-08-10 — 我的冰箱列表显示实际布局缩略图（本次会话）

- 状态：待评审。
- 目标：将“我的冰箱”列表每行左侧的通用冰箱图形替换为该冰箱当前实际布局的缩略图。
- 范围：手机端 `FridgeSwitcher` 列表行、布局摘要加载/页面缓存和缩略图样式；保留无布局或布局读取失败时的可用兜底，不改变打开冰箱、设置入口、权限和布局数据语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §9.1、§10；`docs/functional-design-and-feasibility.md` §3.1–§4.1、§17.1；冻结草稿 `6e7893ee-74d5-4aa4-9db4-45be02e7f9b5` 及本地 `docs/ui-assets/png/pwa-fridge-switcher.png`、`docs/ui-assets/html/pwa-fridge-switcher.html`；现有共享 `FridgePreviewFrame`/`OpenFridge`。
- 预期验证：补充列表缩略图静态回归，运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；按项目约定不自动执行 Playwright，记录 320/390/430px 与真实设备未验证项。
- 会话记录：已确认列表行当前使用 `large-fridge` 占位图形，`FridgePreviewFrame` 已支持 `thumbnail` 变体；摘要加载现在同时保留每台可读取冰箱的 `Layout`，由列表行消费共享缩略图组件。
- 完成：`FridgeSwitcher` 为每台可读取布局的冰箱渲染共享 `FridgePreviewFrame` 实际结构缩略图；布局缺失、待完成布局或读取失败时保留原 `large-fridge` 兜底；布局数据随冰箱列表摘要写入并读取页面缓存；补充三门实际布局缩略图静态契约测试。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（138 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：按项目约定未自动执行 Playwright；尚未在 320/390/430px 视口及真实 iOS/Android PWA 上确认标准、宽体、法式、迷你模板缩略图的最终视觉尺寸和极窄屏文本布局。
- 下一步：在评审设备打开“我的冰箱”，确认不同模板每行左侧均显示对应实际结构，待完成布局仍显示可识别的兜底图形。

### 2026-08-10 — P8 冰箱端首页风险提醒图标替换（本次会话）

- 状态：待评审。
- 目标：将冰箱端首页顶部右侧的临期汇总改为 `iconoir:clock` 语义的时钟图标，过期汇总改为 `ant-design:warning-outlined` 语义的警告图标，两者均在右上角保留数字角标。
- 范围：冰箱端 ES5 首页风险汇总图标、角标样式及相关静态回归检查；不改动风险计算、食材图标上的单批次风险标记、手机端首页或 API 语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §6.3、§8、§10.1；`docs/functional-design-and-feasibility.md` §5.1、§5.3、§17.1；冰箱端首页冻结草稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 及本地 `eink-home` PNG/HTML。
- 预期验证：补充图标路径与右上角角标的静态契约回归，运行 Kindle 脚本语法检查、前端测试、lint、生产构建和 `git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：已确认现有 `actionBadge` 已将数字绝对定位在图标右上角，只需替换 `svgIcon` 中临期/过期的路径并收敛角标外观；用户之前的图标名称误读已按本次指定纠正为 `iconoir:clock`。
- 完成：临期汇总替换为 Iconoir Clock 的线框图标，过期汇总替换为 Ant Design Warning Outlined 警告图标；两者继续使用现有相对容器和绝对定位数字，确保角标位于图标右上角。单个食材批次的风险符号保持不变。
- 验证：新增静态契约用例先因旧三角/方框路径失败，实现后通过；`node --check frontend/public/kindle.js`、`npm run --prefix frontend test -- --run`（137 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest backend/tests/test_health.py -q`（10 passed）和 `git diff --check` 均通过。已对照草稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 的本地 `eink-home` PNG/HTML，本次用户指定的图标语义覆盖冻结稿旧的 timer/感叹号表现。
- 未验证：按项目约定未自动执行 Playwright 视觉核验；尚未在真实 DP75SDI 上确认 28/32px 尺寸的时钟指针、警告轮廓和右上角数字在刷新后的清晰度。
- 下一步：在 DP75SDI 首页准备同时包含临期和过期数据，确认顶部右侧显示时钟与警告图标，两个数字均位于各自图标右上角。

### 2026-08-10 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `e19865a` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认工作区干净、当前分支为 `main`、发布引用为 `e19865a`，并检查发布脚本参数校验与目标配置。
- 完成：正式发布当前 `main` 的 `e19865a`，release `260810111426`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260810-031434`，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（110 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（137 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `healthy`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测核心流程；通过后将本条标记为完成。

### 2026-08-10 — 编辑页面保存按钮统一为保存图标（本次会话）

- 状态：待评审。
- 目标：将“编辑食谱”和“编辑物品”顶部右侧保存操作统一替换为 `icon-park-outline:save` 风格图标按钮。
- 范围：手机端两个编辑页面的顶部栏保存按钮、无障碍名称与相关前端回归检查；不改变保存接口、保存禁用条件和页面布局结构。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §6.2、§8；编辑物品稿 `7224e71b-8055-40ec-a9a9-db68b6744764`、单日食谱编辑稿 `bbeda1ae-e99b-40d6-87b3-90cdedd7adfa` 及对应本地 UI 资产。
- 预期验证：前端 lint、测试、构建和 `git diff --check`；按项目约定不自动执行 Playwright，记录真实设备图标视觉验收项。
- 会话记录：已完成项目规则、前端专项规则、顶部栏规范、最终 UI 注册表及两个编辑页面本地 HTML/PNG 的阅读；已定位两个页面的顶部保存入口。
- 完成：新增共享 `SaveIcon`，两个编辑页面顶部右侧均改用 `icon-park-outline:save` 风格的线框图标按钮；保留原保存动作、禁用条件和 48×48 点击热区，并为编辑物品按钮补充无障碍名称。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（137 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：按项目约定未自动执行 Playwright；尚未在真实 iOS/Android PWA 的 320/390/430px 视口复测图标视觉尺寸和触摸效果。
- 下一步：在评审设备打开“编辑食谱”和“编辑物品”，确认顶部右侧均显示保存图标并可正常保存。

### 2026-08-10 — 分层改名菜单文案与分隔线强调（本次会话）

- 状态：待评审。
- 目标：将分层菜单项文案从“修改分层名字”调整为“修改名字”，并将该菜单项上方的分隔线改为黑色，其他筛选菜单分隔线保持灰色。
- 范围：手机端物品列表排序菜单文案与局部分隔线样式、相关回归检查和本进度记录；不改变改名接口、弹窗流程和其他菜单项样式。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §8.3；上一会话已确认的分层自定义名称功能。
- 预期验证：前端测试、lint、构建和 `git diff --check`；不自动执行 Playwright，记录真实设备未验证项。
- 会话记录：已定位 `frontend/src/inventoryList.tsx` 中的菜单文案和 `frontend/src/styles.css` 中的分隔线规则。
- 完成：菜单项文案改为“修改名字”；仅该菜单项上方的分隔线改为黑色，三个筛选项之间的分隔线仍使用灰色。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（137 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：按项目约定未自动执行 Playwright；尚未在真实 iOS/Android PWA 复测菜单颜色和触摸显示效果。
- 下一步：在评审设备确认“修改名字”文案和黑色分隔线与灰色筛选分隔线的对比效果。

### 2026-08-10 — 顶部栏弹出菜单统一点击外部关闭（本次会话）

- 状态：待评审。
- 目标：物品/食材列表及其他右上角顶部栏弹出菜单统一支持点击菜单外区域自动隐藏，并复用共享实现保持一致行为。
- 范围：前端顶部栏弹出菜单共享交互、物品列表排序菜单、每周食谱菜单及相关回归测试；不改变菜单项、菜单视觉令牌和业务操作语义。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §8.3；`docs/functional-design-and-feasibility.md` §3.6、§4.3；现有每周食谱与物品列表顶部栏菜单实现。
- 预期验证：补充点击菜单外区域关闭的共享行为测试，运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；按项目约定不自动执行 Playwright，记录真实设备/浏览器触摸回归未验证项。
- 会话记录：已阅读项目规则、前端专项规则、UI 规范、功能规则和进度看板；确认顶部栏弹出菜单目前由物品列表与每周食谱两处实现，食谱页内联了点击外部关闭逻辑，物品列表缺失该行为。
- 完成：新增 `frontend/src/menuBehavior.ts` 共享菜单 hook；物品列表排序菜单与每周食谱菜单统一使用同一容器外部点击关闭逻辑，并补充 Escape 关闭；保留按钮再次点击、菜单项选择后的既有关闭语义。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（137 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；检索确认所有 `role="menu"` 顶部菜单均接入 `useDismissibleMenu`。
- 未验证：按项目约定未自动执行 Playwright；尚未在真实 iOS/Android PWA 和桌面浏览器触摸/鼠标环境复测菜单外点击、Escape 关闭及 320px 视口下的交互。
- 下一步：在评审设备打开物品列表和每周食谱菜单，分别点击标题栏外内容、列表区域和菜单项外部，确认菜单即时隐藏；再验证 Escape 关闭和菜单项原有操作。

### 2026-08-10 — 冰箱分层自定义名称与列表菜单入口（本次会话）

- 状态：待评审。
- 目标：允许用户为冰箱布局中的具体分层自定义名称；从首页点击分层进入物品列表后，在右上角排序菜单的分隔线下增加带 SVG 图标的“修改名字”入口。
- 范围：分层名称持久化、布局读写 API、手机端分层物品列表菜单与编辑交互、相关自动化测试和本进度记录；不改变分层几何、物品归属、排序规则和冰箱模板结构。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §6、§8.1、§8.3；`docs/functional-design-and-feasibility.md` §3.3、§3.6、§4.3；冻结首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 预期验证：补充分层名称读写和菜单入口回归；运行后端 `uv run ruff check backend`、`uv run pytest`，前端 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；按项目约定不自动执行 Playwright，记录本地设计资产对照及真实设备未验证项。
- 会话记录：已完成项目规范、进度看板、功能规则、最终设计注册表、UI 规范和对应首页本地 PNG/HTML 的阅读；已定位需要同时修改的布局模型、API 响应/替换接口、物品列表排序菜单链路。
- 完成：新增 `storage_slots.custom_name` 字段及 `20260810_16` 迁移；布局 API 返回自定义名称；owner/daily 工作区均提供分层名称更新接口；首页分层物品列表菜单新增黑色分隔线、铅笔 SVG 图标和“修改名字”入口；保存后更新布局状态、页面标题和位置文案。
- 验证：`uv run ruff check backend`、`uv run pytest`（110 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（136 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；新增布局 API 的自定义名称保存、持久读取、空名称和未知分层回归测试；已对照冻结首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `pwa-home` PNG/HTML，保持现有顶部栏和排序菜单令牌。
- 未验证：按项目约定未自动执行 Playwright；尚未在真实 iOS/Android PWA 验证菜单点击、改名弹窗键盘输入、320/390/430px 视口和 daily_access 设备端实际权限流程。
- 下一步：在评审设备从首页点击不同分格，确认排序菜单分隔线与 SVG 图标、改名保存后标题和位置文案即时更新；通过后再纳入发布验收。

### 2026-08-10 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `66d56de` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：工作区干净，当前分支为 `main`，发布引用为 `66d56de`；正式发布使用仓库根目录 `.deploy.env` 和生产固定 IP。
- 完成：正式发布当前 `main` 的 `66d56de`，release `260810023824`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260809-183832`，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（108 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（132 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `healthy`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测核心流程；通过后将本条标记为完成。

### 2026-08-10 — 手机端横扫返回可用性与首页循环切换冰箱（本次会话）

- 状态：待评审。
- 目标：找出带返回按钮页面从左向右横扫难触发的原因并提高真机容错；在手机首页冰箱布局区域内支持左右横扫依次切换可访问冰箱，首尾循环。
- 范围：手机端共享手势判定、二级页返回手势、首页冰箱预览与现有工作区切换链路、相关前端回归测试和本进度记录；不改变冰箱列表排序、后端 API、格位点击语义或页面视觉布局。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §6、§7、§9.1、§10–§11；`docs/functional-design-and-feasibility.md` §17.1；首页冻结草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 与冰箱切换草稿 `6e7893ee-74d5-4aa4-9db4-45be02e7f9b5`，及对应本地 PNG/HTML；W3C Pointer Events 的 `touch-action` 与取消事件规则。
- 预期验证：先补失败用例，覆盖容错后的右扫返回、横竖意图过滤、首尾循环与单冰箱不切换；运行 `npm run --prefix frontend test -- --run`、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`；按项目约定不自动执行 Playwright，记录真实 iOS/Android PWA 触摸验收项。
- 会话记录：已确认原返回手势没有速度门槛；难触发的主因是起点必须严格落在距左边 `56–128px` 的窄带、横向位移至少 `72px`，且按钮/链接/输入控件覆盖区都不允许起手；同时未预先用 `touch-action` 告知浏览器仅保留纵向平移。按 W3C 手势竞争规则改为共享位移/方向判定，并复用现有 `openLayout` 工作区切换语义。
- 完成：返回手势可从避开系统边缘后的页面左半区及中部起手，统一使用 `64px` 最小横向位移与方向比判定，不限速；按钮/链接可作为起点且横扫后不会误点，表单编辑控件仍会过滤。带返回页面和首页冰箱区域都声明 `touch-action: pan-y`，保留纵向滚动并减少浏览器接管横向事件。首页冰箱区域左扫下一台、右扫上一台，仅在已配置冰箱间首尾循环，并复用现有缓存、请求、本地最近冰箱和页面切换链路。
- 验证：先运行新测试并确认因缺少共享横扫模块、旧返回起点限制而失败；实现后 `npm run --prefix frontend test -- --run`（132 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。已对照首页/冰箱切换草稿及本地 PNG/HTML，本次不改变视觉布局。
- 未验证：按项目约定未自动执行 Playwright；尚未在真实 iOS/Android PWA 确认页面中部右扫返回、按钮列表上起手、纵向滚动/下拉刷新不冲突，以及首页格位点击不误触与多冰箱循环顺序。
- 下一步：在至少一台 iOS 和一台 Android 真机上从页面中部慢速/快速右扫返回，并在首页用三台冰箱验证 `1 → 2 → 3 → 1` 与 `1 → 3` 循环；同时回归格位点击、纵向滚动和下拉刷新。

### 2026-08-10 — 横扫手势过渡动画（本次会话）

- 状态：待评审。
- 目标：首页横扫切换冰箱时按手势方向让当前布局滑出、新布局滑入；带返回按钮的二级页右扫返回时让当前页向右滑出并显示上级页。
- 范围：手机端页面过渡状态、首页冰箱切换和二级页返回动画、相关测试和进度记录；不改变后端 API、冰箱布局、手势方向语义和非手势点击路径。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §5、§6.2、§7、§9；已确认的首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`、冰箱切换草稿 `6e7893ee-74d5-4aa4-9db4-45be02e7f9b5`和本地 PNG/HTML 资产。
- 预期验证：补充过渡状态和方向分支回归；运行 `npm run --prefix frontend test -- --run`、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`；按项目约定不自动执行 Playwright，记录真机动画验收项。
- 会话记录：已确认 `PageShell` 在页面切换时会被新页面立即替换，因此采用“退出动画、延迟页面状态切换、入场动画”状态机制；首页切换复用现有 `openLayout`，只在数据加载成功后进入新布局。按 `prefers-reduced-motion` 直接切换，不强制动画。
- 完成：新增 `pageTransition.ts` 统一维护 220ms 过渡时长与过渡类名；二级页返回使用当前页向右滑出、上级页从左滑入；首页每种横扫方向分别使用对应的退出/进入动画，切换失败时恢复原状态。
- 验证：新增过渡类名、PageShell 入场标记和首页方向类名回归；`npm run --prefix frontend test -- --run`（135 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：按项目约定未自动执行 Playwright；尚未在真实 iOS/Android PWA 观察滑出/滑入时长、动画与下拉刷新和格位点击的冲突，以及系统动画减少模式下的降级行为。
- 下一步：在真机上验收二级页慢扫返回、首页多冰箱左右扫和动画可读性；重点确认加载较慢时旧布局滑出后的等待体验。

### 2026-08-10 — 食谱导入覆盖/添加与编辑页操作调整（本次会话）

- 状态：待评审。
- 目标：为选中周的文本食谱导入提供“导入并覆盖”和“导入并添加”两种明确操作；覆盖模式清空目标周已有食谱后导入，添加模式保持现有追加行为；将导入页标题统一为“导入食谱”；编辑食谱页增加删除操作并将保存改为顶部右侧保存图标按钮。
- 范围：食谱导入 API/服务事务语义、食谱删除 API、手机端食谱导入页与单日编辑页、相关自动化测试和验收文档；不改变历史复制的覆盖语义、食谱完成/撤销规则及非食谱页面。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §6.2、§7、§8.2；`docs/final-ui-designs.md` 中“粘贴食谱导入”草稿 `ef62678e-0a73-431a-93c6-794f646f5c74` 与“单日食谱编辑”草稿 `bbeda1ae-e99c-40d6-87b3-90cdedd7adfa`；本地资产 `docs/ui-assets/png/pwa-recipe-import.png`、`docs/ui-assets/png/pwa-recipe-edit.png` 及对应 HTML。
- 预期验证：补充覆盖/添加、删除及已完成食谱删除的后端接口测试；运行 `uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test`、`npm run --prefix frontend build` 和 `git diff --check`；按项目约定不自动执行 Playwright 视觉核验，记录本地设计资产对照及未完成的真实设备验收项。
- 会话记录：已确认当前 `RecipeWorkspace` 导入按钮单一调用 `/recipes/import`，后端 `RecipeService.import_text` 始终追加；编辑页保存位于固定底部操作栏，后端尚无删除食谱 API。现已新增导入模式字段，覆盖模式在事务内清理目标周的食谱、食材和完成审计；新增删除接口并清理关联审计；页面已使用“导入并覆盖/导入并添加”、统一标题、右上角保存图标、底部删除按钮和删除确认弹窗。新增空白食谱草稿不显示删除按钮。
- 验证：`uv run ruff check backend`、`uv run pytest`（108 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（127 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；食谱定向测试 12 passed；已对照本地 `pwa-recipe-import` 与 `pwa-recipe-edit` PNG/HTML 资产及 UI 规范完成结构复核。
- 未验证：未自动执行 Playwright 或真实 iOS/Android PWA 视口、键盘和触摸验收；本次用户未要求视觉核验，仍需评审时确认双底部按钮在 320/390/430px 视口下的最终观感。
- 下一步：评审覆盖/添加操作、已完成食谱删除的库存语义及手机端视觉布局；如评审通过，再按发布流程验收。

### 2026-08-10 — 发布含数据库结构变更的当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `ffaf1b9` 发布到生产服务器，执行待发布的 Alembic 数据库结构迁移，并完成数据库备份、容器重建和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次数据库迁移验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、SQLite 在线备份、容器启动迁移和健康检查约定；当前迁移 `20260809_15_recipe_methods.py`。
- 预期验证：发布前质量门禁通过，生产数据库在线备份成功，容器为 `healthy`，容器内 Alembic 到达 `head`，公网 `/healthz` 正常。
- 会话记录：当前 `main` 与 `origin/main` 均指向 `ffaf1b9`，工作区干净；生产上次已验证版本为 `20260808_14 (head)`，本次预期升级到 `20260809_15 (head)`。
- 完成：正式发布当前 `main` 的 `ffaf1b9`，release `260810014857`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260809-174906`，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（106 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（127 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 已升级至 `20260809_15 (head)`，release 已进入 `/app/frontend/dist/assets/index-wUo6juUZ.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测本次版本的手机端核心流程、Kindle 冰箱布局和数据库变更影响的食谱流程；通过后将本条标记为完成。

### 2026-08-10 — 手机与冰箱端共享冰箱布局算法（本次会话）

- 状态：待评审。
- 目标：以当前手机端拟物冰箱为唯一几何基准，抽取手机端与 Kindle 冰箱端共同消费的布局渲染计划，永久消除两端独立推导造成的结构漂移；同时修复冰箱端缺少两块合页和中层结构分隔线未贯穿整行的问题。
- 范围：共享冰箱结构算法、手机端 `FridgeLayout` 适配、Kindle ES5 布局适配及样式、布局回归测试和相关设计/运行文档；不改变后端模板、用户已保存布局、格位 ID、库存归属、食物图标分散算法或页面导航。
- 设计/需求基线：用户本次明确要求以当前手机端为准；`docs/ui-design-specification.md` §9.1、§10.1、§12.4；`docs/functional-design-and-feasibility.md` §4、§5、§17.1；冻结拟物冰箱首页草稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 与本地 `docs/ui-assets/png/eink-home.png`、`docs/ui-assets/html/eink-home.html`；手机端共享 `FridgePreviewFrame`/`OpenFridge` 现有几何。
- 预期验证：共享算法单元测试覆盖七种模板、标准/宽体门分段、合页列和整行分带；Kindle 静态契约覆盖共享脚本加载、两块合页及整行结构分隔；运行 `node --check`、前端全量测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、相关后端静态契约测试和 `git diff --check`。按项目约定不自动执行 Playwright；DP75SDI 实机 3:4 截图作为未自动化验收项记录。
- 会话记录：已确认两端只复制了外壳常量和部分门分段规则，手机端由 React/CSS Grid 绘制，Kindle 端由独立 ES5 绝对定位代码再次推导；Kindle 在间隙中未创建合页节点，横排中层还同时把格位宽、高都设为 `1/n`，导致两个格位只有半层高、竖向分格线只显示半高。采用“共享渲染计划 + 两端薄渲染器”：共享层唯一计算外壳、分带、区域位置、门分段和合页，终端层只负责 DOM/CSS 与各自食物图标尺寸。
- 完成：新增唯一 ES5 `fridgeLayoutCore`，手机端构建直接导入同一源，Vite 同时原样输出 `/fridge-layout-core.js` 给 Kindle；React `OpenFridge` 与 Kindle `buildFridge` 均改为消费共享计划，删除 Kindle 中 191 行重复的外壳、分带、门拆分和缩略图几何；标准冰箱显示上下两块合页、宽体冰箱显示两组合页，柜体粗分隔线改由完整 band 绘制，横排中层格位固定占满层高并使用完整竖向细分隔线；两端各自的食物图标尺寸与分散算法保持不变。
- 验证：先建立缺少共享模块的失败用例；共享计划测试覆盖七种模板、标准/宽体外壳、法式左右门拆分、同层双区域、合页轨道和中层方向。`node --check frontend/src/fridgeLayoutCore.js frontend/public/kindle-layout.js frontend/public/kindle.js`、前端全量测试（127 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、共享源与构建产物 `cmp`、`uv run ruff check backend`、完整 `uv run pytest`（106 passed）和 `git diff --check` 均通过。
- 未验证：按项目约定未自动执行 Playwright；尚未在 DP75SDI 实机 3:4 视口确认合页尺寸、整行结构线和中层满高分格线，也未在手机 320/390/430px 视口截图确认重构前后像素一致。
- 下一步：在手机端 320/390/430px 与 DP75SDI 3:4 实机对照同一台三门/中层布局；确认柜体比例、两块合页、完整中层分格线和门分段一致后，将本条标记为完成。

### 2026-08-10 — P9 食谱与补货清单行底部留白收敛（本次会话）

- 状态：待评审。
- 目标：去掉食谱列表和补货清单每行底部近似一整行的空白，仅保留适当的行内与分组间距。
- 范围：手机端 P9 列表样式、相关前端回归检查和本进度记录；不改变食谱/补货数据、排序、缺货计算、复制内容和操作语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §4.3、§7、§9；P9 功能规则 `docs/functional-design-and-feasibility.md` §9；现有 `p9-list` 行与分组布局。
- 预期验证：前端全量测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`；不自动执行真实设备或 Playwright 视觉验收。
- 会话记录：首轮调整已解决补货清单的行底部空白；用户反馈确认“每周食谱”仍受每天分组 section 底部留白影响，因此为每周食谱增加 `p9-week-list` 作用域，移除该页面分组底部 padding，同时保留文章行内 padding及天与天之间的 12px 间距。
- 完成：每周食谱和补货清单均不再在每行底部额外占据近似一整行空白，同时保留行内 padding、分隔线和分组间合理留白。
- 验证：前端全量测试（118 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 设备确认 320/390/430px 下行间距的最终视觉密度；未执行真实设备视觉验收。
- 下一步：在评审设备打开食谱列表和补货清单，确认行底部不再出现空白行且分组之间仍有适当间距；通过后将本条标记为完成。

### 2026-08-10 — 临期按钮视觉回调与列表备注价格排布（本次会话）

- 状态：待评审。
- 目标：恢复首页临期按钮原有尺寸，修正文字颜色不可读问题，并将物品列表备注与价格放在同一行且备注位于价格前。
- 范围：手机端首页临期提示按钮、共享物品列表信息排布与相关回归测试/进度记录；不改变临期入口筛选、临期计算、过期状态和数量操作语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §4.1、§4.3、§6.1、§7；`docs/functional-design-and-feasibility.md` §5.5–§5.6；冻结稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`，共享物品列表现有布局。
- 预期验证：前端全量测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`；不自动执行真实设备或 Playwright 视觉验收。
- 会话记录：已确认按钮化后的临期提示继承全局按钮最小高度和默认文字色，导致尺寸放大、白字不可读；已确认备注和价格当前为临期信息后的独立行，已恢复按钮尺寸/黑色文字/灰色边框，并合并备注价格行。
- 完成：首页临期按钮恢复原紧凑尺寸，文字改为黑色，外框改为灰色；物品列表信息改为“日期/临期”一行、“备注 价格”一行，备注固定排在价格前。
- 验证：`npm run --prefix frontend test -- --run`（118 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；新增静态回归断言覆盖备注价格同一行及顺序。
- 未验证：尚未在真实 iOS/Android PWA 或 Playwright 视口中确认临期按钮在 320/390/430px 下的最终尺寸、灰色边框对比度和长备注换行；未执行真实设备视觉验收。
- 下一步：在评审设备确认首页临期按钮尺寸和黑色文字可读性；确认列表长备注与价格同一行时的换行/截断表现。

### 2026-08-10 — 首页临期入口与物品列表临期样式（本次会话）

- 状态：待评审。
- 目标：修复首页临期提醒图标无响应的问题，点击后进入物品列表并仅列出临期物品；将列表中的“还有 n 天”从黑框/斜纹背景改为加粗下划线。
- 范围：手机端首页、共享物品列表筛选与样式、相关前端回归测试和本进度记录；不改变后端临期计算、提醒接口、过期样式和列表数量/编辑语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §4.3、§7、§8；`docs/functional-design-and-feasibility.md` §5.1、§5.4、§3.5–§3.6、§7.2；冻结稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`，并参考共享物品列表实现。
- 预期验证：前端全量测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`；不自动执行真实设备或 Playwright 视觉验收。
- 会话记录：已确认首页临期提示当前为无点击事件的普通文本，物品列表临期标签由边框和斜纹背景强调；已将首页提示改为可访问按钮并复用物品列表增加临期筛选，样式改为加粗下划线。
- 完成：首页临期提示按钮进入“临期物品”列表，仅显示 `expiry_status=expiring` 的当前冰箱物品；普通列表入口、分格入口和新增入口会清除临期筛选；“还有 n 天”移除边框、背景和阴影，改为加粗下划线。
- 验证：`npm run --prefix frontend test -- --run`（118 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；静态回归覆盖首页临期按钮语义和临期筛选排除普通/过期物品。
- 未验证：尚未在真实 iOS/Android PWA 设备或 Playwright 视口中确认首页按钮触摸热区、临期列表空态及 320/390/430px 下划线观感；未执行真实设备视觉验收。
- 下一步：在评审设备点击首页临期图标，确认进入临期列表且只显示临期物品；确认普通物品列表仍显示全部物品，并复核“还有 n 天”无外框/阴影。

### 2026-08-10 — P9 补货清单增加下周分隔线（本次会话）

- 状态：待评审。
- 目标：在手机端补货清单中明确区分本周和下周；两组之间显示横向铺满内容区的黑色分隔线，并在中间标注“下周”。
- 范围：`frontend/src/RecipeWorkspace.tsx`、`frontend/src/styles.css`、相关前端回归测试和本进度记录；不改变补货接口、缺货计算、复制内容和页面壳。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §4、§7、§9；`docs/functional-design-and-feasibility.md` §9.3、§13.1；冻结稿 `903728d2-d6b9-4918-82b5-9d3ab6b3aafb` 及本地 `docs/ui-assets/png/pwa-restock-list.png`、`docs/ui-assets/html/pwa-restock-list.html`。
- 预期验证：补货清单分组/标记回归测试、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；不自动执行真实设备或 Playwright 视觉验收。
- 会话记录：已确认当前补货清单按接口返回顺序连续渲染各食谱，没有周次分组；将按 `week_start` 把本周与下周分开渲染，仅在下周组存在时插入全宽黑色分隔线。
- 完成：手机端补货清单按 `week_start` 分成本周和下周；下周组存在时在两组之间显示带“下周”标签的两侧满宽 2px 黑色分隔线；缺少 `week_start` 的旧缓存条目继续归入本周，复制内容和接口语义不变。
- 验证：补货周次分组/分隔线回归测试及前端全量测试（116 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：`npm run --prefix frontend lint` 仍被工作区原有 `RecipeWorkspace.tsx` 第 47/64 行 React Compiler `useCallback` 手动 memoization 错误阻断；本次未修改该既有逻辑，也未执行真实 iOS/Android 设备或 Playwright 视觉验收。
- 下一步：在评审设备打开补货清单，确认本周/下周条目顺序、分隔线两侧铺满内容区且 320px 宽度不溢出；通过后将本条标记为完成。

### 2026-08-09 — P9 食谱食材列表数量与缺货排序（本次会话）

- 状态：已完成。
- 目标：食谱列表中数量为 1 的食材省略 `×1`，数量大于 1 时保留 `×数量`；缺货食材排在充足食材之前。
- 范围：手机端 `RecipeIngredientList` 展示逻辑、相关前端回归测试和本进度记录；不改变后端缺货计算、库存扣减、食谱编辑数据和 Kindle 页面。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §7–§8；P9 功能规则 `docs/functional-design-and-feasibility.md` §9；现有 `RecipeIngredientList` 缺货颜色与缺口数量展示契约。
- 预期验证：前端食材列表回归测试、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已定位 `frontend/src/sharedUi.tsx` 中由原始食材顺序直接渲染的 `RecipeIngredientList`；使用两个稳定筛选组实现“缺货在前、充足在后”，组内保留原顺序，并将数量为 1 的标签改为不显示数量后缀。本次确认列表使用 `entry.method && <em className="p9-method">{entry.method}</em>`，空值不会生成做法行，且没有“做法”文字前缀；同时补充静态契约断言并升级本地根数据库。
- 完成：食谱列表缺货食材统一排在充足食材前；数量为 1 时省略 `×1`，数量大于 1 时显示 `×数量`；缺货颜色和 `-缺少数量` 后缀保持不变。
- 验证：前端全量测试（118 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；本地根数据库从 `20260808_14` 成功升级至 `20260809_15 (head)`，`recipe_entries.method` 为 `VARCHAR(2000)`，已有记录做法填充数为 0。
- 未验证：尚未在真实 iOS/Android PWA 设备上确认空做法不占行、长做法单行截断和列表整体视觉密度；未执行真实设备视觉验收。
- 下一步：在评审设备打开含空做法和已填写做法的食谱列表，确认空值不显示做法行、已填写内容不带“做法”前缀。

### 2026-08-09 — P9 食谱增加做法字段（本次会话）

- 状态：待评审。
- 目标：在食谱编辑页新增位于备注之前的多行“做法”输入框，并在食谱列表中于备注之前以单行文本展示；做法随食谱保存、编辑和读取。
- 范围：食谱数据库模型与迁移、API schema/服务、手机端食谱编辑与列表展示、相关回归测试和本进度记录；不改变食材匹配、缺货计算、完成/撤销、备注语义和 Kindle 只读页面。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md`；P9 功能规则 `docs/functional-design-and-feasibility.md` §9；冻结草稿 `bbeda1ae-e99c-40d6-87b3-90cdedd7adfa`（单日食谱编辑）和 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`（本周/下周食谱）及对应本地 PNG/HTML 资产。
- 预期验证：后端食谱接口回归测试、`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`uv lock --check` 和 `git diff --check`；未执行真实设备视觉验收则记录为未验证项。
- 会话记录：已确认现有备注字段使用 `recipe_entries.note`，编辑页和周食谱列表共用 `RecipeWorkspace.tsx`；新增 `recipe_entries.method`，采用同样的可选文本语义并保持空值时不显示。完成态保留“只能修改描述字段”的约束，历史周复制同时迁移做法。
- 完成：新增 `recipe_entries.method` 可空字段及 Alembic `20260809_15` 迁移；食谱新增/编辑/读取、完成态描述编辑和历史复制支持做法；手机端编辑页在备注前增加多行“做法”输入框，周食谱及历史详情在备注前以单行文本展示。
- 验证：食谱接口测试（10 passed）、`uv run ruff check backend`、完整 `uv run pytest`（106 passed）、`npm run --prefix frontend test -- --run`（113 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv lock --check`、临时 SQLite `alembic upgrade head/current`（`20260809_15 (head)`）和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 设备上确认长做法在 320/390/430px 页面中的截断效果；未执行 Playwright 或真实设备视觉验收。`alembic check` 仍因既有 `item_catalog_legacy_parentage` 元数据漂移失败，本次未修改该无关问题。
- 下一步：在评审设备打开编辑食谱和本周/历史食谱，确认做法位于备注前、长文本列表保持单行省略；若需完整 schema 漂移门禁，另行处理既有 legacy 表元数据问题。

### 2026-08-09 — Kindle 首页顶部图标按钮增加间距（本次会话）

- 状态：待评审。
- 目标：增大 Kindle 冰箱端首页顶部右侧多个图标按钮之间的水平间距，降低相邻按钮误触概率。
- 范围：`frontend/public/kindle.css`、`frontend/public/kindle.js`、Kindle 静态契约测试和本进度记录；不改变按钮顺序、入口语义、操作热区尺寸、图标尺寸或后端接口。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §6.3、§10.1；Kindle 顶部栏操作单元格 72px、图标 60px 和首页 `actions` 统一实现约束。
- 预期验证：Kindle 静态契约、`node --check frontend/public/kindle.js`、前端 lint/test/build 和 `git diff --check`；DP75SDI 3:4 实机截图作为未自动化验收项记录。
- 会话记录：已确认首页多个图标按钮当前连续排列、没有额外水平间距；计划在不缩小 72px 交互热区和 60px 图标的前提下，为每个首页图标按钮增加统一的 8px 左间距，并同时覆盖 CSS 与 ES5 运行时样式。
- 完成：首页顶部每个图标按钮增加统一 8px 左间距；保留 72px 操作热区、60px 图标尺寸、按钮顺序和入口语义；CSS 与 ES5 运行时样式及静态契约同步更新。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 实机 3:4 视口确认新增间距的最终像素观感及风险图标存在时顶部操作区是否仍满足可读性。
- 下一步：在 DP75SDI 首页截图复测多个图标按钮的误触间隔和窄屏布局；通过后将本条标记为完成。

### 2026-08-09 — Kindle 食材列表边距与数量控件对齐（本次会话）

- 状态：待评审。
- 目标：修复 Kindle 食材列表左右贴边问题，确保列表内容左右至少保留 20px；修复数量控件中数字相对 `−` 和 `+` 垂直偏低的问题。
- 范围：`frontend/public/kindle.css`、Kindle 静态契约测试和本进度记录；不改变食材信息、数量操作、分页及后端接口。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §4.3、§5、§12.4；现有 Kindle 页面 20px 外层留白与手机端数量控件布局。
- 预期验证：Kindle 静态契约、`node --check frontend/public/kindle.js`、前端 lint/test/build 和 `git diff --check`。
- 会话记录：确认 Kindle 页面壳的旧 WebKit 宽度计算不能单独保证列表视觉留白；本次为食材列表内容区增加明确左右 20px 内边距，并将窄屏样式中原有的 10px 页面留白改回 20px；数量按钮和数字统一使用中线对齐、固定行高。
- 完成：食材列表左右至少保留 20px；`− / 数字 / +` 三个控件垂直对齐。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 实机确认 20px 留白在实际视口下的最终像素值，以及旧 WebKit 对数量控件基线的最终视觉效果。
- 下一步：在 DP75SDI 3:4 视口复测列表两侧留白和数量控件对齐；通过后将本条标记为完成。

### 2026-08-09 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `01a9c8c` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：当前 `main` 与 `origin/main` 均指向 `01a9c8c`；工作区已有进度文档未提交修改，将保留且不纳入发布归档；发布配置使用仓库根目录 `.deploy.env`，正式发布仅通过生产固定 IP SSH。
- 完成：正式发布当前 `main` 的 `01a9c8c`，release `260809044049`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-204056`，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（106 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，公网 `/healthz` 返回 `{"status":"ok"}`，release 已进入 `/app/frontend/dist/assets/index-O6zna7tQ.js`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测 Kindle 首页、食材列表、每周食谱和补货清单，以及手机端核心流程；通过后将本条标记为完成。

### 2026-08-09 — Kindle 食材列表移除重复下架按钮（本次会话）

- 状态：待评审。
- 目标：食材列表右侧已有 `− 数字 +` 数量控件时，移除重复的“拿走/下架”按钮；数量减为 0、软删除、撤销和分页语义保持不变。
- 范围：`frontend/public/kindle.js`、Kindle 静态契约测试和本进度记录；不改变手机端列表、后端库存接口和首页冰箱布局。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §7–§8、§12.4；`docs/functional-design-and-feasibility.md` §5.6；上一会话确认的 Kindle 食材列表布局。
- 预期验证：Kindle 静态契约、`node --check frontend/public/kindle.js`、前端 lint/test/build 和 `git diff --check`。
- 需求补充：用户进一步明确 Kindle 每行除“冰箱名称 + 右箭头”外，其他内容必须与手机端 `InventoryList` 完全一致，包括食材名、小类、已添加天数、有效期、备注、价格和数量控件；不再显示“剩 n · 可食用”这套 Kindle 专用文案。
- 会话记录：对照 `frontend/src/inventoryList.tsx` 和 `inventoryListUtils.ts`，将 Kindle 行内容改为手机端同样的名称/小类、已添加天数、有效期、备注和价格格式；移除 Kindle 专用的“剩 n · 可食用”文案。数量控件统一为 `− 数字 +`，减至 0 仍复用既有软删除与撤销链路。
- 完成：Kindle 食材列表每行除冰箱上下文和右箭头外，已与手机端保持同一信息结构；不再显示“拿走/全部拿走”按钮，所有数量统一使用 `− 数字 +`。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 实机确认长备注、价格、日期标签和数量控件在 3:4 视口中的换行与宽度；未在真机确认旧 WebKit 下 SVG/文本组合的最终视觉效果。
- 下一步：在 DP75SDI 实机复测多条食材、不同数量、无 BBD、临期/过期、备注和价格行；通过后将本条标记为完成。

### 2026-08-09 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将发布开始时确认的提交 `d4fb073` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：发布开始时 `main` 与 `origin/main` 指向 `d4fb073`；工作区未提交修改按发布脚本约定未纳入本次归档；发布过程中本地分支随后更新到 `01a9c8c`，不影响已完成的固定提交发布；发布配置使用仓库根目录 `.deploy.env`，正式发布仅通过生产固定 IP SSH。
- 完成：正式发布 `d4fb073`，release `260809040524`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-200532`，权限为 `600`；未覆盖生产 `.env` 或业务数据。
- 验证：发布前 `uv run ruff check backend`、`uv run pytest`（106 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，release 已进入 `/app/frontend/dist/assets/index-nC1WjtqG.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测 Kindle 首页、食材列表、每周食谱和补货清单，以及手机端核心流程；通过后将相关条目标记为完成。

### 2026-08-09 — Kindle 首页全部食材入口与列表布局（本次会话）

- 状态：待评审。
- 目标：点击 Kindle 首页“n 件物品”进入全部食材列表，并让该页面与点击冰箱分格进入的食材列表复用同一实现；按手机端物品列表调整顶部布局，移除冰箱缩略图和手机端“冰箱”返回入口，修正分页下一页图标方向，并将最左侧食材图标外框改为可兼容 Kindle 的 SVG 圆圈叠加样式。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、Kindle 静态契约测试和本进度记录；不改变手机端列表、库存排序/数量语义、Kindle 分页机制及同步接口。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md` §5、§6.3、§8、§12.4；`docs/functional-design-and-feasibility.md` §3.5–§3.6、§5.4–§5.6、§17.1；冻结冰箱端分区详情稿 `11377443-ce1a-49d7-8c87-9860db491c17` 及本地 `docs/ui-assets/png/eink-shelf-detail.png`、`docs/ui-assets/html/eink-shelf-detail.html`；手机端首页与物品入口稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 预期验证：Kindle 静态契约、`node --check frontend/public/kindle.js`、前端 lint/test/build 和 `git diff --check`；DP75SDI 3:4 实机截图作为未自动化验收项记录。
- 会话记录：确认首页总数原先只是文本、分区列表原先会插入冰箱缩略图、分页下一页依赖 CSS 旋转返回图标，且食材图片边框由 CSS 方框提供；本次按用户明确更新覆盖冻结稿中的缩略图要求，使用统一的 `renderDetail` 数据路径、首页总数按钮、显式 SVG 右箭头和 SVG 圆环叠加。
- 完成：点击首页“n 件物品”进入“全部食材”列表；点击冰箱分格继续进入同一列表页面；列表顶部移除冰箱缩略图和手机端冰箱上下文行；保留 Kindle 多页及数量操作；最左侧食材图标改为圆圈；分页右下角使用独立向右箭头路径。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 实机加载首页并点击“n 件物品”、点击分格、翻页和确认 SVG 圆环显示；本机浏览器未作为 Kindle 旧 WebKit 兼容性结论。
- 下一步：在 DP75SDI 3:4 视口完成首页入口、分区入口、列表分页、数量操作和圆环/右箭头截图验收；通过后将本条标记为完成。

### 2026-08-09 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `2ad1ea2` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：当前工作区干净，`main` 与 `origin/main` 均为 `2ad1ea2`；发布配置使用仓库根目录 `.deploy.env`，正式发布仅通过生产固定 IP SSH。
- 完成：正式发布当前 `main`，release `260809030124`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-190133`，权限为 `600`；未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（106 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，release 已进入 `/app/frontend/dist/assets/index-BG8gV7K6.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测 Kindle 首页、每周食谱和补货清单，以及手机端核心流程；通过后将本条标记为完成。

### 2026-08-09 — Kindle 首页顶部库存总数需求更正（本次会话）

- 状态：待评审。
- 目标：按用户更正后的需求恢复首页顶部物品总数；顶部继续显示临期/过期图标及数量，仅将“最后同步……”保留在底部。
- 范围：`frontend/public/kindle.js`、Kindle 静态契约测试和本进度记录；不改变购物车图标、数量角标、同步接口或风险统计。
- 设计/需求基线：用户本次明确更正；`docs/ui-design-specification.md` §5、§9、§10.1；`docs/functional-design-and-feasibility.md` §5.1–§5.3；冻结首页稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 及本地首页资产。
- 预期验证：运行 Kindle 静态契约、`node --check frontend/public/kindle.js`、前端 lint/test/build 和 `git diff --check`；DP75SDI 3:4 实机截图作为未自动化验收项记录。
- 会话记录：根据用户更正，将顶部空白标题区恢复为仅显示 `X 件物品`，不拼接同步状态；临期/过期汇总图标仍由顶部操作区按数量动态显示，底部继续渲染同步状态。
- 完成：顶部显示物品总数、临期/过期图标及数量；“最后同步……”仅显示在底部。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在真实 DP75SDI 上加载首页并留存 3:4 截图，需确认顶部总数、风险图标和底部同步文案的旧 WebKit 显示效果。
- 下一步：在 DP75SDI 打开 `/fridge/device` 完成视觉验收；通过后将本条标记为完成。

### 2026-08-09 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `19145ed` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：当前工作区干净，`main` 与 `origin/main` 均为 `19145ed`；发布配置使用仓库根目录 `.deploy.env`，正式发布仅通过生产固定 IP SSH。
- 完成：正式发布当前 `main`，release `260809022352`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-182401`，权限为 `600`；未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（106 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check` 均通过；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，release 已进入 `/app/frontend/dist/assets/index-DIJjkY9F.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次 Kindle 食谱页、首页入口、补货清单及完整用户流程与视觉布局。
- 下一步：在真实设备上复测 Kindle 首页、每周食谱和补货清单，以及手机端核心流程；通过后将本条标记为完成。

### 2026-08-09 — Kindle 首页图标与数量角标调整（本次会话）

- 状态：进行中。
- 目标：将首页顶部补货清单按钮改为与手机端一致的购物车图标，并移除冰箱布局中物品数量数字的方框，仅保留数字。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、Kindle 静态契约测试和本进度记录；不改变补货入口、库存数量或风险角标语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §5、§9、§10.1；`docs/functional-design-and-feasibility.md` §5.1–§5.3；冻结首页稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 及本地 `docs/ui-assets/png/eink-home.png`、`docs/ui-assets/html/eink-home.html`；手机端购物车图标实现 `frontend/src/RecipeWorkspace.tsx`。
- 预期验证：运行 Kindle 静态契约、`node --check frontend/public/kindle.js`、前端 lint/test/build 和 `git diff --check`；DP75SDI 3:4 实机截图作为未自动化验收项记录。
- 会话记录：已对照手机端 `RecipeWorkspace.tsx` 的购物车 SVG 路径，补货按钮改用同一购物车轮廓和轮子；数量角标保留原位置，仅去除边框、背景和方框尺寸约束，临期/过期风险角标保持不变。
- 完成：首页顶部补货按钮改为手机端购物车图标；冰箱布局中数量角标仅显示加粗数字，不再显示方框。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在真实 DP75SDI 上加载首页并留存 3:4 截图，需确认购物车轮廓、数字位置和旧 WebKit 下的显示效果。
- 下一步：在 DP75SDI 打开 `/fridge/device`，确认补货入口图标与手机端一致、数量角标无背景边框；通过后将本条标记为完成。

### 2026-08-09 — Kindle 首页同步信息位置调整（本次会话）

- 状态：待评审。
- 目标：删除冰箱端首页顶部的库存/同步副标题，将“最后同步……”移到底部原图例位置显示。
- 范围：`frontend/public/kindle.js`、Kindle 静态契约测试和本进度记录；不改变同步接口、临期/过期统计或顶部风险图标。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §9、§10.1；`docs/functional-design-and-feasibility.md` §5.1、§12.4；冻结首页稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 及本地 `docs/ui-assets/png/eink-home.png`、`docs/ui-assets/html/eink-home.html`。
- 预期验证：运行 Kindle 静态契约、`node --check frontend/public/kindle.js`、前端 lint/test/build 和 `git diff --check`；DP75SDI 3:4 实机截图作为未自动化验收项记录。
- 会话记录：确认顶部副标题同时承载库存总数和同步时间；本次保留顶部临期/过期图形化数量提示，移除副标题节点及其样式，并让底部原图例位置渲染动态同步状态。
- 完成：冰箱端首页顶部不再显示库存/同步副标题；底部改显示“同步中……”或“最后同步……”等同步状态；离线状态仍沿用原有离线横幅，不改变同步重试和接口行为。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在真实 DP75SDI 上加载首页并留存 3:4 截图，需确认底部同步文案在旧 WebKit 下的字号、换行和可读性。
- 下一步：在 DP75SDI 打开 `/fridge/device`，确认顶部副标题消失、底部同步时间位置和离线状态展示；通过后将本条标记为完成。

### 2026-08-09 — Kindle 每周食谱页与首页入口（本次会话）

- 状态：待评审。
- 目标：为 Kindle 冰箱端增加只读“每周食谱”页面，按手机端页面展示本周/下周食谱；将手机端左上角购物清单调整为 Kindle 页面右上角，左上角使用返回首页按钮；在 Kindle 首页顶部操作区增加食谱入口。
- 范围：`backend/fridgeboard/device_routes.py`、`frontend/public/kindle.js`、`frontend/public/kindle.css`、Kindle/API 回归测试和本进度记录；新增 Kindle 只读食谱读取接口，不改变手机端食谱编辑、完成扣减、库存匹配和现有补货接口语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §6.3、§9、§10.1；`docs/functional-design-and-feasibility.md` §9、§12.4、§13.1；手机端冻结稿 `pwa-weekly-recipes`（草稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`）及本地 `docs/ui-assets/png/pwa-weekly-recipes.png`、`docs/ui-assets/html/pwa-weekly-recipes.html`。
- 预期验证：Kindle 页面保持 ES5/XHR、普通块级元素/table/inline-block 布局，隐藏手机端右上角导入/历史弹出菜单；运行 Kindle 脚本语法、静态契约、前端 lint/test/build 和 `git diff --check`；DP75SDI 3:4 实机截图作为未自动化验收项记录。
- 会话记录：已确认当前 Kindle 仅有首页、分区详情和补货页；现有设备 API 已提供按 `week_start` 返回本周与下周食谱的 `RecipeDayResponse`，本次将复用该只读数据链路并让页面高度和行间距比手机稿更紧凑。
- 2026-08-09 修复会话：用户反馈首页食谱入口图标和每周食谱行尾完成/未完成控件必须与手机端一致；本次仅调整 Kindle 静态图标与样式，不改变食谱读取、排序、缺货计算和只读语义。
- 2026-08-09 视觉修复会话：用户反馈锅具完成图标尺寸过小，且食材前缺少手机端分类图标；本次补充 Kindle 食谱页读取当前库存/图标资产，按手机端严格名称匹配规则渲染分类图标，并将完成控件放大到与顶部操作图标同级。
- 视觉修复完成：完成/未完成锅具图标和按钮均调整为 60×60，与 Kindle 顶部操作图标同级；食谱页新增当前库存与图标资产读取，按手机端严格名称匹配规则在食材名称前显示分类图标，缺少匹配时保持无图标。
- 视觉修复验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py backend/tests/test_pairing_api.py -q`（26 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 视觉修复未验证：尚未在 DP75SDI 实机确认 60×60 锅具图标、28×28 食材图标的墨水屏清晰度、长食材名称换行和图标加载失败时的页面观感。
- 下一步：在 DP75SDI 打开首页和 `/fridge/device/recipes`，确认锅具图标尺寸及食材分类图标与手机端信息层级一致；通过后将本条标记为完成。
- 修复完成：首页食谱入口改用手机底部导航“食谱”图标的三段 SVG 路径；每周食谱行尾改用手机端相同的完成/未完成锅具 SVG，Kindle 端保持禁用只读状态。
- 修复验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 修复未验证：尚未在 DP75SDI 实机确认入口图标、完成/未完成 SVG 的实际墨水屏渲染尺寸和线条观感。
- 下一步：在 DP75SDI 打开首页和 `/fridge/device/recipes`，确认两个图标与手机端视觉一致；通过后将本条标记为完成。
- 完成：新增 `/api/devices/current/recipes` Kindle 只读食谱接口；新增 `/fridge/device/recipes` 页面和首页食谱入口，按手机端保留本周/下周切换、完成状态、动态缺货、备注和补货入口；Kindle 页面左上角改为返回首页，右上角仅保留购物清单，不加载导入/历史弹出菜单；页面关键布局使用 table/块级元素并收紧标题、食谱行和底部间距。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py backend/tests/test_pairing_api.py -q`（26 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（106 passed）、`git diff --check` 均通过；已对照本地冻结稿 `pwa-weekly-recipes` PNG/HTML（390×844）完成结构和文案核对。
- 未验证：尚未在 DP75SDI 静态 Kindle 路由加载新页面并留存 3:4 截图，旧 WebKit 下四个首页入口、长食谱名、长食材行、本周/下周切换和空日期的最终换行仍需实机确认。
- 下一步：在 DP75SDI 打开 `/fridge/device/recipes`，确认首页入口、返回/购物清单位置、两周切换、缺货标识和紧凑高度；通过后将本条标记为完成。

### 2026-08-09 — Kindle 补货清单紧凑双栏布局（本次会话）

- 状态：待评审。
- 目标：让 Kindle 补货清单尽量在一页内显示，移除说明文案和其下分隔线，将本周/下周改为左右分栏，并把同一食谱的缺货食材合并到一行；刷新按钮右对齐并保留最右侧 20px 留白。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、Kindle 静态契约/布局回归测试、本进度记录；不改变补货接口、缺货计算、返回首页和同步语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §6.3、§10.1；`docs/functional-design-and-feasibility.md` §9.3、§13.1；动态补货清单注册稿 `903728d2-d6b9-4918-82b5-9d3ab6b3aafb` 及本地 `docs/ui-assets/png/pwa-restock-list.png`、`docs/ui-assets/html/pwa-restock-list.html`。
- 预期验证：先补/更新 Kindle 静态契约或布局回归，再运行 `node --check frontend/public/kindle.js`、前端 lint/test/build、Kindle 相关后端测试和 `git diff --check`；DP75SDI 实机 3:4 截图作为未自动化验收项记录。
- 会话记录：已确认当前补货页渲染“本周和下周未完成食谱的缺货食材。”说明行，并按食谱将缺货食材拆成多行；本次采用 ES5 兼容的普通块级元素/table 结构，不引入 Flex/Grid。
- 完成：移除补货页说明行及原列表分隔线；增加合法 table 双栏结构，左列本周、右列下周；每道食谱将缺货食材拼接为同一行；刷新按钮右对齐，右侧由页面壳保留 20px 留白；补充 Kindle 静态契约断言。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（105 passed）、`git diff --check` 均通过。
- 未验证：尚未在真实 DP75SDI 上加载补货页并留存 3:4 截图，暂未确认旧 WebKit 下长菜名、两列长列表和空列的最终换行/单页表现。
- 下一步：在 DP75SDI 打开 `/fridge/device/restock`，确认本周/下周列位置、缺货食材单行拼接、刷新按钮右侧 20px 留白及长列表可读性；通过后将本条标记为完成。

### 2026-08-08 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交 `4050e79` 发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：当前工作区干净，发布配置使用仓库根目录 `.deploy.env`；先执行本地质量门禁，再运行正式发布脚本。
- 完成：正式发布当前 `main`，release `260808235602`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-155611`，权限由发布脚本设置为 `600`；生产容器已重建并运行健康。
- 验证：`uv run ruff check backend`、`uv run pytest`（105 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check`；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，release 已进入前端静态产物，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测本次版本的扫码绑定、物品价格展示与合计，以及 Kindle 首页、分区、补货和离线流程。

### 2026-08-08 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前质量门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：当前工作区干净，HEAD 为 `e3415c9`，发布配置使用仓库根目录 `.deploy.env`；已确认正式发布不会修改本地工作区、生产 `.env` 或业务数据。
- 完成：正式发布当前 `main`，release `260808230536`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-150548`，权限由发布脚本设置为 `600`；生产容器已重建并运行健康。
- 验证：`uv run ruff check backend`、`uv run pytest`（105 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check`；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，release 已进入 `/app/frontend/dist/assets/index-BEFymm8c.js`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测本次版本的扫码绑定、物品价格展示与合计，以及 Kindle 首页、分区、补货和离线流程。

### 2026-08-08 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交发布到生产服务器，完成 release 注入、生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程及本次发布验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的固定 IP、release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布前门禁通过，归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认工作区干净，当前 HEAD 为 `f5c569d`，发布配置使用仓库根目录 `.deploy.env`，SSH 主机为生产固定 IP；完成发布前门禁后执行正式发布，未创建分支、提交 Git 或覆盖生产 `.env` 与业务数据。
- 完成：正式发布当前 `main`，release `260808211845`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-131854`，权限为 `600`；生产容器已重建并运行健康。
- 验证：`uv run ruff check backend`、`uv run pytest`（105 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check`；发布归档内置图标资产校验通过（46 个）；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，release 已进入前端静态产物，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局。
- 下一步：在真实设备上复测本次版本的手机端扫码绑定、弹窗、价格展示，以及 Kindle 首页、分区、补货和离线流程。

### 2026-08-08 — Kindle 首页布局与操作热区修复（本次会话）

- 状态：待评审。
- 目标：修复 Kindle 冰箱页布局图左偏、顶部重复显示冰箱名、页面标题不含冰箱名、边框贴边遮挡和操作按钮过小的问题，并移除“补货清单”按钮独有的黑框；正式页面左右留白调整为各 20px。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、Kindle 静态契约/相关前端验证和本进度记录；不改变 Kindle API、同步、库存、补货计算和路由语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §9/§10.1；`docs/functional-design-and-feasibility.md` §5.1/§5.7；最终设计注册表 `eink-home`、`eink-shelf-detail` 及对应本地 PNG/HTML 资产。
- 预期验证：先补或更新可复现的静态契约/前端检查，再运行 `node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`；以 600×800 Kindle 设计稿和约 3:4 页面检查留白、居中与按钮尺寸。
- 会话记录：用户明确指出本机现代浏览器不能证明 DP75SDI 的实际 CSS 行为；本次新增 `/fridge?spike=1` 的“页边距实现对比”，并将诊断页外层也改为 ES5 计算宽度 + inline style，避免诊断外壳自身横向溢出污染实机观察。为减少局域网 Kindle 输入成本，新增短入口 `/k`，专用于打开该 Spike。用户提供 DP75SDI 实机照片，确认 A 父元素 inline padding、B 子元素 inline margin、D table 空白单元格有效，C/E 右侧宽度不一致，F 仅适合文字缩进；随后将正式页面目标留白从各 10px 调整为各 20px。本次确认刷新按钮不应有独立下移规则，已移除该特例，并将 20px 留白要求写入 Kindle 设计规范和能力基线。用户进一步确认所有页面的刷新图标均存在向下偏移/底部裁切；对照手机端历史修复，确认两条独立 path 已解决顶部坐标差异，但圆弧底部仍过于接近容器边界，本次改为保持顶部 y=4、半径 7 的 Kindle 安全内缩路径。
- 完成：新增父级 padding、子级 margin、计算像素宽度、table 空白单元格、inline-block 偏移、HTML 不换行空格六种实机对比样例；新增局域网短入口 `/k`，无需输入查询参数即可打开 Spike；正式页面留白实现改为实机已确认的兼容写法；首页三个操作按钮恢复同一套垂直尺寸和位置规则；所有页面的刷新 SVG 统一采用手机端兼容规则及精确路径；更新 Kindle 设计规范、能力 Spike 和 README 的局域网使用说明。
- 验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；局域网 `http://10.10.10.209:7001/k` 返回 200 和 Kindle 静态页；正式页面静态契约确认左右各 20px，首页顶部行确认有独立 20px padding，刷新图标契约确认 Kindle 内缩圆弧 `M19 11a7 7 0 1 0 1.9 4.7`、箭头 `M19 4v7h-7`、`overflow:visible` 和 `vertical-align:middle`。本机浏览器仅用于代码/页面生成检查，不作为 Kindle 兼容性结论。
- 未验证：正式首页、补货页和分区详情应用各 20px 留白后的 DP75SDI 实机截图；刷新图标在 Kindle 上恢复垂直位置及底部不裁切仍需回归。
- 本次补充结论：页面壳的 20px 留白有效；非首页共用 `header()` 的左右操作单元格为 112px、图标为 60px，图标居中后额外向内缩进约 26px；首页使用 72px 操作单元格所以靠右。修复目标是统一所有 Kindle 顶部栏为 72px 操作单元格和 60px 图标，并保留左右至少 20px 实机留白。
- 下一步：在 DP75SDI 上复测 `/fridge/device` 首页、补货页和分区详情，确认正式页面边框两侧不再裁切；若仍有页面级差异，继续沿用 A/B/D 的兼容写法逐页定位。
- 本次补充完成：共用 `header()` 的左右操作单元格统一为 72px、图标统一为 60px，移除食谱页 42px 图标特例；结论和尺寸基线已同步到 Kindle Spike 与 UI 设计规范。
- 本次补充验证：`node --check frontend/public/kindle.js`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、前端 lint、112 个前端测试、前端 build、`git diff --check` 均通过；仍需 DP75SDI 实机确认各页面右上角图标距离屏幕右侧约 20px。
- 复盘：仅修改 112px 为 72px 仍未解决实机问题；首页与其他页面的关键差异是首页将按钮放在 table 单元格内部并使用 inline-block 右对齐，而其他页面把按钮本身作为 table-cell。下一步改为完全复用首页的 table 单元格 + inline-block 结构。
- 修复完成：普通顶部栏现在采用与首页一致的“table cell 包裹 inline-block 按钮”结构，并通过 ES5 inline style 固定左右 cell、按钮和图标尺寸；食谱页不再单独缩小图标。
- 修复验证：静态契约 9 passed、前端 112 tests passed、Lint、build、`git diff --check` 和 `node --check` 均通过；仍需 DP75SDI 实机确认右上角视觉留白。
- 复测反馈：普通页图标改为 inline-block 后仍贴近右边，确认普通 `header()` 还缺少首页已有的 header 自身左右 20px padding；本次将该 padding 同步到所有普通顶部栏，作为首页正确布局的完整基准。
- 本次修复验证：普通 `header()` 已同步首页 header 自身左右 20px inline padding；静态契约 9 passed、前端 112 tests passed、Lint、build、`git diff --check` 和 `node --check` 均通过，仍需 DP75SDI 实机复测各页面右上角视觉留白。

### 2026-08-08 — 真实 UI 逐页复现并修复弹窗覆盖与挂载问题（本次会话）

- 状态：待评审。
- 目标：针对真实截图中仍透明、关闭按钮下沉和部分弹窗无测试条件的问题，使用 390×844 浏览器视口逐页模拟业务条件并修复实际问题。
- 范围：共享模态框 CSS 优先级、关闭按钮定位、添加物品页“添加大类”弹窗挂载；真实测试覆盖首页安装提示、换绑确认、添加大类、位置选择、移动目标选择和确认位置全屏流程；底部抽屉与 Kindle 不在范围内。
- 会话记录：Playwright 实测确认 `.device-manager section` 覆盖了 `.modal-dialog` 的背景、边框和内边距，导致换绑确认实际计算样式为透明/无边框/无内边距；同时确认 `groupDialog` 只挂在编辑物品分支，添加物品分支点击后不会显示弹窗。已提高共享弹窗选择器优先级、将关闭热区固定到卡片右上角，并在添加物品分支挂载共享弹窗。
- 完成：补充共享弹窗标题结构断言，真实模拟已绑定冰箱端、打开换绑确认、添加大类、位置选择、批量移动和确认位置流程，并保存逐页截图到 `output/playwright/`。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；真实页面计算样式确认换绑确认卡片为白底、2px 边框、32px/24px 内边距，截图确认关闭按钮位于卡片右上角。
- 未验证：尚未在真实 iOS/Android PWA 设备上复测系统安全区、触控反馈和键盘弹出后的弹窗高度；未触碰底部物品选择抽屉与 Kindle 页面。
- 下一步：评审设备按截图逐项复测换绑确认、添加大类和位置选择；若设备端仍有差异，基于对应视口截图继续调整，不再凭静态 markup 判断视觉结果。

### 2026-08-08 — 发布最新版并同步本地数据库定义（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 最新提交 `061c6c3` 发布到生产服务器，并将本地开发数据库升级到当前 Alembic head。
- 范围：本地 `backend/fridgeboard.db` 的 Alembic 前向迁移；`scripts/deploy-image.sh` 正式发布、生产数据库在线备份、容器重建、迁移和健康检查；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布与本地数据库同步要求；`README.md` 发布流程；`scripts/deploy-image.sh` 的 release 注入、SQLite 在线备份、容器启动迁移和健康检查约定；当前迁移 head `20260808_14`。
- 预期验证：本地数据库迁移至 `head`；发布归档资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；记录 release、备份路径和未验证项。
- 会话记录：已确认工作区干净，当前 HEAD 为 `061c6c3`，本地数据库配置来自 `.env`，生产发布配置使用固定 IP；本地数据库已执行前向迁移，随后完成发布前门禁和正式发布。
- 完成：本地数据库从 `20260807_13` 升级到 `20260808_14 (head)`；正式发布 release `260808181318`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-101327`，未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（105 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`git diff --check`；生产容器为 `running/healthy`，容器内 Alembic 为 `20260808_14 (head)`，release 已进入前端静态产物，公网 `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实手机/PWA 和 DP75SDI Kindle 实机完成本次版本的完整回归验收；发布传输阶段出现 macOS 扩展属性提示，但归档、构建、迁移和健康检查均成功。
- 下一步：在真实设备复测价格编辑/合计、统一弹窗、扫码绑定刷新，以及 Kindle 首页、分区、补货和离线流程。

### 2026-08-08 — 手机端物品价格编辑、展示与合计（本次会话）

- 状态：待评审。
- 目标：为手机端物品增加可选价格的编辑和展示；编辑页在“品牌规格备注”行右侧提供价格输入框，物品列表显示单项价格，并在“n 件物品”后显示仅统计已填写价格物品的合计金额。
- 范围：库存批次价格字段的数据库迁移、API 读写与移动/恢复链路；手机端编辑表单、物品列表和首页物品入口相关展示；价格格式化/合计工具与自动化测试；不改变数量、日期、分类、位置和食谱扣减规则。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3.5–§3.6；冻结稿 `pwa-edit-food`、`pwa-home` 及对应本地 HTML/PNG 资产；现有共享 `PageShell`、`PageHeader` 和物品列表布局。
- 预期验证：价格 API 新增/编辑/无价格/移动与恢复回归测试；`uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：已确认现有库存批次没有价格字段，商品描述仍为独立的 `product_description`；本次采用可空两位小数金额字段，列表合计只累加当前仍有库存且已填写价格的物品，未填写价格按 0 处理，数量为 0 的记录仍按既有统计规则排除但其价格字段保留。编辑页“品牌规格备注”与价格输入按左右两列布局实现，新增和编辑请求均向 API 传递价格，批次合并条件包含价格，跨冰箱移动和旧客户端恢复链路保留该字段。
- 完成：新增 Alembic `20260808_14`；库存 API、服务层、响应映射和手机端类型均支持价格；列表逐行显示已填写价格，标题在物品数量后显示价格合计；新增不同价格批次不合并、价格回填、金额分计算合计和无价格按 0 的回归测试。
- 验证：`uv run ruff check backend`、`uv run pytest`（105 passed）、`uv lock --check`、临时 SQLite `uv run alembic -c alembic.ini upgrade head`/`current`（`20260808_14 (head)`）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run App.test.ts`（71 passed）、`npm run --prefix frontend test -- --run`（112 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在真实手机/PWA 视口下人工确认 320/390/430px 价格输入宽度、长商品描述与金额对齐；本次未触发 Playwright 视觉核验。
- 下一步：在评审设备进入“物品列表 → 编辑物品”，确认价格输入、保存回填、单项价格和合计金额显示；确认无价格显示合计 `¥0.00`，并确认零库存恢复行不计入当前合计。

### 2026-08-08 — 重新修复换绑确认模态框层级与关闭按钮（本次会话）

- 状态：待评审。
- 目标：将“更换冰箱端设备”的确认交互明确实现为模态弹出框，避免不透明全屏背景伪装成页面窗口，并修复右上角关闭按钮压住标题/正文的问题。
- 范围：换绑确认组件结构与专用样式、相关回归验证及本进度记录；不改变换绑业务流程、确认文案和绑定 API。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/pairing-and-onboarding-redesign.md` §5.5、§6.5；本地 `docs/ui-assets/proposals/pairing-onboarding-redesign.{png,html}` 第 11 个手机端换绑确认稿。
- 预期验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`；390×844px 模态框视觉核验。
- 会话记录：已确认此前专用类将整个视口背景改为不透明，视觉上像全屏窗口；关闭按钮沿用绝对定位并与标题/正文共享顶部区域，导致小屏或长文案时发生叠加。本次恢复半透明遮罩，按冻结稿移除重复的右上角关闭按钮，并在独立白色弹窗内用专用操作区布局标题、正文和按钮。
- 完成：换绑确认现在明确为模态弹出框：视口仅显示半透明遮罩，中央白色圆角卡片承载标题、说明和两个操作按钮；移除右上角重复关闭按钮，避免文字叠加；按钮不再继承页面级底部大留白。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（109 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 的 390×844px 视口上人工确认弹窗位置、遮罩深度和触控反馈。
- 下一步：在评审设备进入“冰箱设置 → 更换冰箱端设备”，确认中央白色弹窗与底层页面层级清晰，并验证“扫描新设备”和“取消”均按预期工作。

### 2026-08-08 — 手机端居中模态框规范与共享组件统一（本次会话）

- 状态：待评审。
- 目标：按已确认方案统一手机端 PWA 的居中模态框样式与可复用实现，明确其与一级页面、二级流程页和底部抽屉的边界。
- 范围：`docs/ui-design-specification.md`；手机端 `Dialog`、`NoticeDialog`、`ConfirmDialog` 共享组件；首页提示、安装提示、换绑确认、添加大类、位置选择和移动目标选择等居中弹窗迁移；确认位置全屏流程页的 dialog 语义清理；相关前端测试和本进度记录。不修改底部物品选择抽屉，不修改 Kindle 页面及样式。
- 设计/需求基线：用户本次确认的统一方案；`docs/ui-design-specification.md` §6.4、§8.2–§8.2.1、§10；本地 `docs/ui-assets/proposals/pairing-onboarding-redesign.{png,html}` 换绑确认稿；现有 `PageShell`、`AppHeader`、`PageHeader` 共享页面壳。
- 预期验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`；手机端居中弹窗和全屏流程页的 320/390/430px 视觉验收。
- 会话记录：确认现有实现存在多套居中弹窗遮罩、内容面和关闭按钮样式；已在规范中补充居中模态框、全屏流程页、底部抽屉的分类与令牌约束，并以共享 `Dialog` 为基础完成首页提示、安装提示、换绑确认、添加大类、位置选择和移动目标选择迁移；关闭按钮改为共享标题栏中的独立 48px 热区，换绑确认使用无关闭按钮的双操作确认框；底部抽屉和 Kindle 明确排除在本次迁移范围外。
- 完成：新增 `Dialog`、`NoticeDialog`、`ConfirmDialog` 共享组件；统一半透明遮罩、白色内容面、边框圆角、按钮高度、标题/正文/操作区间距和可访问性语义；“确认位置”改回带左上返回键的全屏流程页，不再伪装成居中模态框。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（110 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；旧的 `notice-modal`、`p7-notice-modal`、页面专用关闭按钮 class 已从前端源码清理。
- 未验证：尚未在真实 iOS/Android PWA 的 320/390/430px 视口上人工确认遮罩深度、标题栏关闭按钮触控反馈和长文案下的滚动表现。
- 下一步：在评审设备进入“冰箱设置 → 更换冰箱端设备”，确认中央白色确认框清晰遮盖背景但不呈现为全屏页面，并验证“扫描新设备”和“取消”；随后抽查首页提示、安装提示、添加大类和位置选择的标题/关闭按钮布局。

### 2026-08-08 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交 `85cede3` 发布到生产服务器，自动生成 release 号，完成生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程、生产数据库备份/迁移、容器健康检查和公网 `/healthz` 验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 单容器发布流程；`scripts/deploy-image.sh` 的 release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；发布结果、验证证据和未验证项回写本记录。
- 会话记录：已确认工作区干净，发布配置使用生产固定 IP；先执行本地质量门禁，再运行正式发布脚本。
- 完成：正式发布当前 `HEAD`，release `260808162917`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260808-082926`，权限为 `600`；未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（104 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（109 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run` 和 `git diff --check` 均通过；生产容器为 `running/healthy`，容器内 Alembic 为 `20260807_13 (head)`，release 已进入前端静态产物，公网 `https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在 DP75SDI 实机完成本次 Kindle 全页面设计和触摸流程的 3:4 截图验收；发布脚本传输阶段出现远端 tar 对 macOS 扩展属性的提示，但发布、构建和健康检查均成功。
- 下一步：在 DP75SDI 上逐页复测首页、分区详情、配对、补货和断网/撤销状态；如发现设备级兼容问题，另行登记修复任务。

### 2026-08-08 — Kindle 全页面设计一致性修复（本次会话）

- 状态：待评审。
- 目标：审查并修复 Kindle 冰箱首页、分区详情、补货/配对及设备状态页面与冻结设计、手机端冰箱布局几何和 DP75SDI Kindle Spike 不一致的问题。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle-layout.js`、`frontend/public/kindle.css` 及相关静态契约/布局回归测试；不改变 Kindle API、库存业务规则和配对权限语义。
- 设计/需求基线：`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §5；`docs/final-ui-designs.md` 冰箱端显示设备；`docs/pairing-and-onboarding-redesign.md` §7.1；`docs/ui-assets/png/eink-home.png`、`eink-shelf-detail.png`、`eink-pairing-qr.png`、`eink-unconfigured.png`；`docs/ui-assets/proposals/pairing-onboarding-redesign.png`；`docs/kindle-capability-spike.md`。
- 预期验证：Kindle ES5 静态契约与布局几何回归、`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Ruff/pytest、`uv lock --check`、`git diff --check`；DP75SDI 实机 3:4 截图作为未自动化验收项记录。
- 会话记录：已确认当前首页独立使用 `62%/38%` 冰箱结构，未按手机端共享几何绘制；顶部使用 Unicode 伪图标并重复渲染操作入口；已按页面逐一对照本地冻结 PNG/HTML 和 Kindle Spike 约束。
- 完成：Kindle ES5 布局脚本同步手机端标准/宽体/法式/迷你冰箱外壳比例、主柜分区带、门区映射和中间双功能区分栏；首页改为单一顶部操作栏并统一线框 SVG 图标；分区详情补充分区缩略图、5 条分页、底部自动回首页和分页操作；配对页、补货页、六位码页及状态页统一返回/刷新图标；首次绑定标题改为“绑定手机端”；二维码和配对说明按 540×720 视口重新适配。
- 验证：`node --check frontend/public/kindle.js`、`node --check frontend/public/kindle-layout.js`、Kindle 静态契约和几何回归（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（109 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest backend/tests/test_health.py -q`（9 passed）、`uv lock --check`、`git diff --check`；本地浏览器 540×720 已截图核验首页、分区详情、配对二维码和补货空态。
- 未验证：尚未在 DP75SDI 实机完成首页、分区详情、配对、等待布局、补货、断网/撤销状态的 3:4 截图与触摸流程验收；需确认老 WebKit 下内联 SVG 线宽、传统字号、缩放后的食物图标和长文案换行。
- 下一步：在 DP75SDI 上逐页复测主流程并记录截图；若实机发现 SVG 或缩放兼容问题，优先回退到同语义的传统 HTML 线框实现，不改变页面信息层级。

### 2026-08-08 — 新增 Kindle 专用入口（本次会话）

- 状态：进行中。
- 目标：新增 DNS-only 的 `kindle.flycn.fyi`，使根路径直接提供现有 Kindle 静态入口，并为老 Kindle 使用 RSA HTTPS 证书。
- 范围：NPM 根路径 Location 重写、部署/运行文档、NPM 代理与证书、Cloudflare DNS 记录；不改变现有 `fridge.flycn.fyi` 的访问方式、应用代码和业务语义。
- 设计/需求基线：用户本次明确要求；`docs/kindle-capability-spike.md`；现有 `/fridge` Kindle 路由和绝对路径资源约束。
- 预期验证：NPM `nginx -t`、RSA 证书公钥类型、`https://kindle.flycn.fyi/` 返回 Kindle 页面、`/healthz` 正常；记录 DNS 传播和真实 Kindle 验收未覆盖项。
- 会话记录：Cloudflare 已创建 `kindle.flycn.fyi` DNS-only A 记录；NPM 代理主机已绑定 RSA Let's Encrypt 证书，`= /` Location 内部重写到 `/fridge`；应用代码无需修改或重新部署。
- 完成：源站直连 `https://kindle.flycn.fyi/` 返回 200 和 998 字节 Kindle 页面；证书 CN 为 `kindle.flycn.fyi`，公钥类型为 RSA，NPM `nginx -t` 通过；证书有效期至 2026-11-06。
- 验证：后端 Ruff、104 项测试，前端 lint、109 项测试、生产构建和差异检查通过；Cloudflare API 记录状态为 DNS-only。权威 NS 和公共递归 DNS 当前仍未返回该 A 记录。
- 未验证：`kindle.flycn.fyi` 的公网 DNS 发布及真实 DP75SDI Kindle 访问；Cloudflare DNS 节点发布完成后需执行公网 HTTPS 和 Kindle 实机验收。

### 2026-08-08 — 修复手机端换绑确认框透明叠层（本次会话）

- 状态：待评审。
- 目标：修复手机端“更换冰箱端设备”点击“扫描新设备”后确认框背景透明、与页面内容叠加导致文字难以辨认的问题。
- 范围：前端换绑确认层遮罩样式、相关回归验证及本进度记录；不改变换绑确认文案、扫码流程或绑定 API。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §10.4；本地 `docs/ui-assets/proposals/pairing-onboarding-redesign.{png,html}` 的手机端换绑流程基线。
- 预期验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`；390×844px 手机端确认框视觉核验。
- 会话记录：已确认换绑确认层复用 `.p7-notice-modal`，当前遮罩为半透明，底层页面内容会透出；已为该确认层增加专用类并将遮罩调整为不透明，保持对话框本体与按钮交互不变。
- 完成：点击“扫描新设备”后，换绑确认层使用不透明页面背景，底层“更换冰箱端设备”内容不再透出；其他 `p7-notice-modal` 通知保持原有遮罩样式。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（109 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 的 390×844px 视口上人工确认遮罩覆盖和系统安全区表现。
- 下一步：在评审设备进入“冰箱设置 → 更换冰箱端设备”，点击“扫描新设备”，确认警告框文字清晰且取消/扫描按钮行为不变。

### 2026-08-08 — 手机端扫码绑定状态自动刷新（本次会话）

- 状态：待评审。
- 目标：手机端扫描冰箱二维码后立即返回“冰箱设置”，显示“正在绑定”，每 5 秒刷新绑定状态，最多等待 1 分钟；绑定完成后同步更新“我的冰箱”和“冰箱设置”，超时显示可操作的失败状态。
- 范围：`frontend/src/App.tsx`、`frontend/src/FridgeDeviceBinding.tsx`、绑定状态纯逻辑/测试、本进度记录；不改变二维码格式、绑定 API 和 Kindle 端轮询语义。
- 设计/需求基线：`docs/ui-design-specification.md`、`docs/pairing-and-onboarding-redesign.md` §5.4–§5.6/§6.2.4、`docs/functional-design-and-feasibility.md` §10.4/§17.1；本地 `pairing-onboarding-redesign` 手机端设置与“我的冰箱”设计资产。
- 预期验证：补充可复现的轮询/超时回归测试，运行 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`；真实 iOS/Android PWA 扫码绑定流程作为设备验收项记录。
- 会话记录：已确认 claim 接口返回时冰箱端凭证可能尚未由 Kindle 创建，当前页面只读取一次状态；现改为以目标冰箱设备列表和冰箱摘要接口作为服务端真值，绑定后立即进入设置页并保持状态提示；换绑时记录旧设备 ID，避免旧设备被误判为新绑定。
- 完成：新增 5 秒轮询、60 秒截止时间、单次网络失败继续等待、绑定成功后的列表/设置页/页面缓存同步，以及超时后的重新绑定入口；“我的冰箱”和“冰箱设置”均显示绑定中状态。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（109 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；纯逻辑测试覆盖普通绑定、换绑设备 ID 变化、5 秒/60 秒常量和设置页进行中/超时文案。
- 未验证：尚未在真实 iOS/Android PWA 与在线/离线 Kindle 上完成扫码后异步绑定、超时和页面切换验收；未运行后端门禁，因本次未修改后端代码或 API。
- 下一步：在真实设备上复测扫码后设置页自动返回、5 秒状态更新、换绑旧设备保护和 1 分钟超时文案。

### 2026-08-08 — 发布当前版本（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交 `d1b429a` 发布到生产服务器，自动生成 release 号，完成生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程、生产数据库备份/迁移、容器健康检查和公网 `/healthz` 验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；`README.md` 单容器发布流程；`scripts/deploy-image.sh` 的 release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常；发布结果、验证证据和未验证项回写本记录。
- 会话记录：已确认工作区干净，发布配置使用生产固定 IP；先执行本地质量门禁，再运行正式发布脚本。
- 完成：正式发布当前 `HEAD`，release `260808045333`；生产数据库在线备份为 `/data/fridgeboard.db.backup-20260807-205344`，权限为 `600`；未覆盖生产 `.env` 或业务数据。
- 验证：`uv run ruff check backend`、`uv run pytest`（104 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run` 和 `git diff --check` 均通过；生产容器为 `running/healthy`，容器内 Alembic 为 `20260807_13 (head)`，release 已进入前端静态产物，公网 `https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实 iOS/Android PWA 和 DP75SDI Kindle 上复测本次发布涉及的完整用户流程与视觉布局；发布脚本传输阶段出现远端 tar 对 macOS 扩展属性的提示，但发布、构建和健康检查均成功。
- 下一步：在真实设备上复测 Kindle 同步/离线恢复、配对和手机端扫码主流程；如发现设备级问题，另行登记修复任务。

### 2026-08-08 — 修复 Kindle 同步状态审查问题（本次会话）

- 状态：进行中。
- 目标：修复同步代码审查发现的补货失败误报成功、首次失败缺少离线重试、补货页快照丢失、客户端时间覆盖服务端时间和重复渲染调用问题。
- 范围：`frontend/public/kindle.js`、相关 Kindle 静态契约测试、本进度记录；不改变同步接口和库存/补货计算规则。
- 设计/需求基线：`docs/kindle-capability-spike.md` §8–§10、`docs/functional-design-and-feasibility.md` §12.1–§12.3；上一轮 Kindle 同步实现代码审查结论。
- 会话记录：先加入同步重试、快照保留、补货错误返回和服务端时间的失败回归约束；首轮契约测试按预期失败，修复后重新通过。
- 完成：补货请求失败不再继续上报同步成功；首次同步失败显示离线与最后同步时间并安排 30 分钟自动重试；补货页成功加载后保留可用快照；最后同步时间改为读取服务端 POST 后返回值；详情页同步横幅只渲染一次。
- 验证：`node --check frontend/public/kindle.js`、`backend/tests/test_health.py`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（103 passed）、`uv lock --check`、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 实机验证首次断网错误页、已有快照断网保留、30 分钟自动重试、恢复后的服务端时间显示和 3:4 视口布局。
- 下一步：在 DP75SDI 执行首页、分区详情和补货页的断网—恢复、刷新及重新打开路径，确认离线状态和最后同步时间文案符合实机可读性要求。

### 2026-08-08 — 修复 Kindle 其他页面正文字号兜底（本次会话）

- 状态：待评审。
- 目标：按 DP75SDI Spike 为等待页、首页、分区详情、补货页、六位码页、配对页及错误/撤销状态的关键正文补充传统 `<font size="4|5">` 兜底，保留现有 CSS 作为增强。
- 范围：`frontend/public/kindle.js`、Kindle 静态契约测试、本进度记录；不改变页面路由、接口、同步、补货和库存业务语义。
- 设计/需求基线：`docs/kindle-capability-spike.md` §5/§8–§10、`docs/functional-design-and-feasibility.md` §12.4；当前已确认的 DP75SDI 传统字号兼容结论。
- 预期验证：先补失败的静态契约断言，再运行 `node --check frontend/public/kindle.js`、前端 lint/test/build、`uv run pytest`、`git diff --check`；DP75SDI 实机字号和分页作为未自动化验收项记录。
- 会话记录：当前二维码页已使用传统字号，但其他动态页面仍有正文和按钮通过普通文本节点渲染；本次复用统一的 ES5 文本更新路径，在节点标记为传统字号后由 `text()` 重新生成 `<font>`，避免异步状态更新时丢失兜底。
- 完成：新增 `markLegacy`、`legacyElement` 和 `legacyButton`；等待页、错误/撤销页、六位码页、添加手机页、首页、分区详情和补货页的关键正文、状态、按钮、空态与操作反馈均补充 `<font size="4|5">` 兜底；同步保留现有 CSS 字号作为增强；增加静态契约断言覆盖统一包装和关键页面调用。
- 验证：`node --check frontend/public/kindle.js`、Kindle 静态契约测试（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv lock --check`、`uv run pytest`（103 passed）、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 实机确认各页面传统字号实际大小、长文案换行、按钮布局和 3:4 视口分页。
- 下一步：在 DP75SDI 依次打开 `/fridge/passcode`、`/fridge/device`、`/fridge/device/restock`、`/fridge/device` 分区详情和 `/fridge/pair`，确认正文、错误态和操作按钮均达到可读字号后标记完成。

### 2026-08-08 — 实现 Kindle 同步失败、离线和最后同步时间（本次会话）

- 状态：待评审。
- 目标：按 Kindle Spike 和功能基线，为已配置 Kindle 增加同步中、同步成功、同步失败/离线、最后成功同步时间和 30 分钟低频重试；页面重新打开或唤醒后继续执行补同步。
- 范围：`backend/fridgeboard/api_models.py`、`backend/fridgeboard/device_routes.py`、`frontend/public/kindle.js`、`frontend/public/kindle.css`、相关回归测试、本进度记录；不改变库存、补货计算和设备凭证语义。
- 设计/需求基线：`docs/kindle-capability-spike.md` §5/§8–§10、`docs/functional-design-and-feasibility.md` §5.1、§12.1–§12.3、§13.1；现有 `POST /api/devices/current/sync-status` 记录接口。
- 预期验证：先补同步状态读取与失败反馈的失败测试，再运行 `node --check frontend/public/kindle.js`、前端 lint/test/build、`uv run ruff check backend`、`uv run pytest`、`git diff --check`；DP75SDI 实机断网/恢复和 3:4 截图作为未自动化验收项记录。
- 会话记录：已确认当前代码只在成功渲染后静默 POST 同步时间，未读取最后成功同步时间，也没有离线标记和低频重试；本次将同步状态读取与页面显示统一接入 ES5/XHR 流程。
- 完成：新增 `GET /api/devices/current/sync-status` 返回最后成功同步时间；Kindle 首页、分区详情和补货页显示同步中/最后同步/离线状态；同步失败保留已有快照并显示离线标记，按 30 分钟低频重试；成功后更新库存状态、刷新最后同步时间并清除离线标记；同步读取和写入均处理超时、网络错误、非 2xx、过期和撤销状态。
- 验证：先运行的失败 API 用例按预期暴露 GET 接口缺失；修复后 `node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv lock --check`、`uv run pytest`（103 passed）、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 实机验证断网后保留页面、30 分钟重试、网络恢复、唤醒补同步和 3:4 视口下同步状态文案布局。
- 下一步：在 DP75SDI 上执行首页/分区详情/补货页的断网—恢复和手动刷新路径，确认离线标记、最后同步时间及恢复后的清除行为。

### 2026-08-08 — 修复 Kindle 补货清单审查问题（本次会话）

- 状态：待评审。
- 目标：修复补货读取失败时首页反馈不可读、补货提醒按钮文字溢出，以及本周/下周同日食谱缺少周次区分的问题。
- 范围：Kindle 补货首页与清单页、补货响应模型与服务、相关回归测试、本进度记录；不改变缺货计算和只读权限规则。
- 设计/需求基线：`docs/kindle-capability-spike.md`、`docs/ui-design-specification.md` §6.3/§10.1、`docs/functional-design-and-feasibility.md` §5.7/§9.3；上一条 Kindle 补货实现审查结论。
- 预期验证：先补失败的 API/静态契约测试，再运行 Kindle 脚本语法、前端 lint/test/build、后端 Ruff/测试和 `git diff --check`。
- 完成：首页补货读取失败时改为显示可读错误文案和“重试”按钮；补货提醒按钮使用更高优先级的自适应宽度规则并允许操作区换行，避免“补 10”等文字被固定 56px 宽度截断或与其他操作挤出区域；补货响应增加 `week_start`，Kindle 清单标题显示“本周/下周”，避免相同星期和菜名混淆；增加跨周 API 回归覆盖。
- 验证：先运行的失败契约/API 用例按预期暴露问题；修复后 `node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（103 passed）、`git diff --check` 均通过。
- 未验证：DP75SDI 实机上的错误提示布局、长按钮文字和跨周重复食谱视觉验收。
- 下一步：在 DP75SDI 上验证首页补货接口失败提示、较大缺货数量按钮和本周/下周同日食谱标题；通过后将本条标记为完成。

### 2026-08-08 — 实现 Kindle 只读补货清单（本次会话）

- 状态：待评审。
- 目标：为已配置 Kindle 首页增加动态补货提醒入口，实现按星期/食谱分组的只读补货清单、无缺货空态、加载/错误/离线反馈和 10 分钟自动回首页。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、`backend/fridgeboard/device_routes.py`、Kindle 静态契约测试、本进度记录；复用 `RecipeService` 的动态缺货计算，不改变食谱或库存业务规则。
- 设计/需求基线：`docs/kindle-capability-spike.md`、`docs/ui-design-specification.md` §6.3/§10.1、`docs/functional-design-and-feasibility.md` §5.7/§9.3/§17.1；Kindle 首页冻结稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2` 的购物篮入口与本地 PNG/HTML 资产。
- 预期验证：先补失败的 Kindle 静态契约，再运行 `node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`、`git diff --check`；DP75SDI 实机 3:4 截图作为未自动化验收项记录。
- 完成：新增 Kindle 专用只读接口 `/api/devices/current/restock`；首页在存在缺货时显示“补”入口，补货页按星期/食谱展示缺少食材与数量；补货为空、网络失败、撤销和未完成布局均有可读状态；补货页支持刷新并在 10 分钟后返回首页；增加 ES5 静态契约和 Kindle/PWA 权限回归测试。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv lock --check`、`uv run pytest`（103 passed）、`git diff --check` 均通过。
- 未验证：尚未在 DP75SDI 上实际加载 `/fridge/device`、点击补货入口并留存 3:4 截图；旧 WebKit 下传统字号、长食谱名称、多个缺货条目和 10 分钟自动返回仍需实机确认。
- 下一步：在 DP75SDI 上完成首页补货图标、补货清单正常/空态/错误态及返回首页路径验收后，将本条标记为完成。

### 2026-08-08 — 修复既有布局冰箱绑定时误报二维码不可识别（本次会话）

- 状态：待评审。
- 目标：修复手机端在“冰箱设置 → 绑定冰箱端设备”扫描 Kindle 首次绑定二维码时，因手机入口地址与二维码生成地址不同而误报“这不是家常食橱可识别的冰箱二维码”。
- 范围：手机端配对二维码解析、绑定扫码回归测试、本进度记录；不改变二维码令牌格式、绑定用途和服务端设备绑定事务。
- 设计/需求基线：用户本次复现路径；`docs/pairing-and-onboarding-redesign.md` §5.2、§5.4；线上首次绑定会话返回的 `/pair?bootstrap=...` 地址；现有 PWA/Kindle 同后端多入口部署约束。
- 完成：保持不同域名二维码不可绑定；扫码页先识别“合法配对格式但域名不同”，改为提示“扫描的二维码地址与本App服务器不同。请确保 Kindle 地址和本App地址相同。”，其他二维码继续提示不可识别。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（101 passed）、`git diff --check` 均通过。
- 未验证：真实手机相机在局域网入口和线上公网入口的设备验收，需部署后复测。
- 下一步：部署后复测不同域名提示，并确认同域二维码仍可完成绑定。

### 2026-08-08 — Kindle 既有 Spike 经验合并为全页面基线（本次会话）

- 状态：待评审。
- 目标：把 2026-07-28 既有 Kindle Spike 与本次 DP75SDI 实机诊断结果合并，明确所有 Kindle 页面必须遵守的 HTML/CSS/JS、数据请求、错误处理和实机验收规则。
- 范围：`docs/kindle-capability-spike.md`、`docs/functional-design-and-feasibility.md` §12.4、`docs/ui-design-specification.md` §10.1、本进度记录；不修改业务流程。
- 设计/需求基线：既有 2026-07-28 DP75SDI Spike 记录；2026-08-08 用户提供的能力诊断截图；现有 Kindle ES5/XHR 页面约束。
- 完成：补录 AppleWebKit 534.26+、DOM/JSON/Canvas/SVG/storage/Cookie/XHR 可用、Promise/fetch/ES Module/URL/箭头函数/`const`/`let` 不可用、XHR 401 诊断、Vite SPA fallback 陷阱、服务端二维码和请求超时规则；新增“所有 Kindle 页面强制实现规则”，同步到功能设计和 UI 规范。
- 验证：文档与现有实机截图结论一致；此前诊断页本地语法、前端 lint/test/build、后端测试/Ruff 和 diff 检查均通过。
- 未验证：其他 Kindle 型号、固件或浏览器版本未覆盖；全页面逐一 DP75SDI 主流程截图仍需按规则执行。
- 下一步：完成当前 Spike 后关闭临时诊断开关，后续每个 Kindle 页面按该基线实现并在 DP75SDI 验收。

### 2026-08-08 — Kindle 恢复正常二维码绑定页（本次会话）

- 状态：待评审。
- 目标：关闭临时 Kindle 能力诊断开关，恢复 `/fridge` 原有二维码绑定页面。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.html`、`docs/kindle-capability-spike.md`、本进度记录；保留 `/fridge?spike=1` 作为后续诊断入口。
- 完成：`FORCE_CAPABILITY_SPIKE` 已关闭；`/fridge` 恢复正常首次绑定二维码流程；版本时间更新为 `2026-08-08 02:04:43 CST`，资源查询版本更新为 `2026080808`。
- 验证：`node --check frontend/public/kindle.js`、`git diff --check`；普通入口和诊断入口的路由分流由现有静态契约覆盖。
- 未验证：未在 DP75SDI 上重新加载恢复后的二维码页并截图确认。
- 下一步：在 Kindle 打开 `/fridge`，确认二维码绑定页恢复；需要复测能力时使用 `/fridge?spike=1`。

### 2026-08-08 — Kindle 二维码页尺寸与底部链接调整（本次会话）

- 状态：待评审。
- 目标：继续缩小正常二维码页二维码，调整倒计时和底部六位码链接字号，修正安装网址，并移除生产页面版本时间戳及静态资源 query 版本。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.html`、`frontend/public/kindle.css`、Kindle 能力文档和本进度记录；不改变绑定接口。
- 设计/需求基线：用户本次明确反馈；DP75SDI 实机能力 Spike 已确认的传统 `<font>` 字号兜底规则。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`。
- 会话记录：正常二维码页将二维码缩放因子从 0.75 调至约 0.68；倒计时改用较小的 CSS 和传统字号；底部链接单独使用大号传统字号；移除时间戳显示和 CSS/JS 资源 query 版本，能力 Spike 文档保留历史实机证据但不再把时间戳作为页面强制规则。
- 完成：网址改为 `https://fridge.flycn.fyi`；二维码缩放因子改为 0.68；倒计时 CSS 字号从 22px 调为 20px，传统字号从 5 调为 4；底部“无法扫码？”保持普通文字，六位码链接改为大号传统字号；删除正常页和诊断页的版本时间显示，并移除 `kindle.css/js` 的 query 版本。
- 验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`。
- 未验证：未在 DP75SDI 上重新加载二维码页确认二维码比例、倒计时字号和底部链接可读性。
- 下一步：在 Kindle 打开 `/fridge`，确认二维码、倒计时、HTTPS 网址和底部六位码链接的最终视觉效果。

### 2026-08-08 — Kindle 底部扫码提示字重与字号修正（本次会话）

- 状态：待评审。
- 目标：恢复底部“无法扫码？”的可读字号，并移除六位绑定码链接的加粗效果。
- 范围：`frontend/public/kindle.js`、本进度记录；不改变链接目标和绑定流程。
- 设计/需求基线：用户本次反馈；DP75SDI 传统 HTML 字号兼容基线。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`。
- 会话记录：底部普通文本在旧 WebKit 中继承后显示过小，本次用传统 `<font size="4">` 明确设置“无法扫码？”字号；链接继续使用大号传统字号，但移除 `font-weight:700`。
- 完成：底部“无法扫码？”改为传统字号 4；“打开六位数字绑定码页”保留大字号但字重改为 400，不再加粗。
- 验证：`node --check frontend/public/kindle.js`、前端 lint、105 个测试、前端构建、后端 7 个契约测试、Ruff、`git diff --check` 均通过。
- 未验证：未在 DP75SDI 上重新确认底部两段文字的最终字号和字重。
- 下一步：在 Kindle 打开 `/fridge` 验收底部提示与链接的视觉比例。

### 2026-08-08 — Kindle 底部扫码提示统一字号（本次会话）

- 状态：待评审。
- 目标：让“无法扫码？”与“打开六位数字绑定码页”使用完全相同的传统 HTML 字号，保持链接正常字重。
- 范围：`frontend/public/kindle.js`、本进度记录；不改变链接目标和绑定流程。
- 设计/需求基线：用户本次反馈；DP75SDI 传统字号兼容基线。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`。
- 会话记录：底部提示当前为 `<font size="4">` 而链接为 `<font size="5">`；本次统一改为 `size="5"`，只保留链接的正常字重设置。
- 完成：两段底部文字现在均使用 `<font size="5">`，链接保持正常字重。
- 验证：`node --check frontend/public/kindle.js`、前端 lint、后端 7 个契约测试、`git diff --check` 均通过。
- 未验证：未在 DP75SDI 上重新确认底部两段文字的最终视觉一致性。
- 下一步：在 Kindle 打开 `/fridge` 验收底部两段文字。

### 2026-08-08 — Kindle 绑定二维码与六位码页面拆分（本次会话）

- 状态：待评审。
- 目标：优化 `/fridge` 首次绑定手机端页面在 Kindle 竖屏上的单页显示；缩小二维码、放大并铺开扫码说明，将无法扫码说明拆到独立六位绑定码页，并提供页面链接。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、Kindle 静态页面行为及本进度记录；不改变绑定 API、二维码内容或手机端配对语义。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §6.3、§9、§10.1；`docs/functional-design-and-feasibility.md` §12.4；现有 Kindle 六位绑定码流程。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、`git diff --check`；未具备 DP75SDI 实机时记录真实设备视觉验收为未验证项。
- 会话记录：已确认二维码页当前同时渲染首次使用、已经安装和六位码输入，`fitQr` 还为这些内容预留了过大的底部高度；本次将六位码输入移至 `/fridge/passcode`，二维码页通过普通链接进入，并按视口高度缩小二维码、提高说明字号和内容宽度。
- 完成：`/fridge` 首次绑定页移除六位码表单，仅保留二维码、全宽扫码说明和“打开六位数字绑定码页”链接；新增 `/fridge/passcode` 路由视图，复用原六位码绑定提交、错误和成功跳转逻辑；首次绑定二维码尺寸重新按较小高度预算计算。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv lock --check`、`git diff --check` 均通过；后端路由契约已覆盖 `/fridge/passcode`。
- 未验证：未在真实 DP75SDI 上加载页面并留存 540×720 截图，需在 Kindle 上确认二维码实际缩小幅度、中文字体可读性和链接点击后的页面高度。
- 下一步：在 DP75SDI 实机完成 `/fridge` 首次绑定二维码页、`/fridge/passcode` 六位码页及绑定成功跳转验收后，将本条标记为完成。

### 2026-08-08 — Kindle 绑定页二维码与说明栏压缩（本次会话）

- 状态：待评审。
- 目标：进一步压缩 `/fridge` 首次绑定页纵向空间，将二维码缩至当前尺寸的 3/4，改用完整标题，并把首次使用、已经安装、无法扫码和二维码倒计时安排为无边框左右两栏，以便增大说明文字。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、本进度记录；不改变六位码页和绑定 API 语义。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §6.3、§9、§10.1；`docs/functional-design-and-feasibility.md` §12.4；现有 Kindle 首次绑定流程。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：已确认上一版仍将首次使用和已经安装纵向堆叠，标题与二维码下方状态占用较多高度；本次改为基础 HTML table 布局，避免依赖 Kindle 不确定的 Grid/Flex 能力。
- 完成：首次绑定标题改为“请用手机相机扫码绑定手机端或安装程序”；二维码下方独立扫码提示已删除；二维码按原计算结果缩至 75%；首次使用/已经安装及无法扫码/二维码倒计时改为无边框左右两栏，并提高说明字号。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：未在真实 DP75SDI 上确认 540×720 设备中的最终分页、字号和长标题换行效果。
- 下一步：在 DP75SDI 实机检查标题、二维码比例、两栏文字可读性和六位码链接后，再将本条标记为完成。

### 2026-08-08 — Kindle 绑定页文字与底部操作位置调整（本次会话）

- 状态：待评审。
- 目标：将绑定页文字整体放大 2px，调整信息顺序为二维码下方显示倒计时，页面底部显示无法扫码入口，并移除底部二维码更新提示。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、本进度记录；不改变绑定接口和六位码页业务逻辑。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §6.3、§9、§10.1；`docs/functional-design-and-feasibility.md` §12.4；现有 Kindle 绑定页。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：已确认上一版将倒计时与无法扫码入口并列在第二行；本次将倒计时移至二维码下方，将无法扫码链接移入页面最底部，并同步提高绑定页各级文字字号。
- 完成：二维码下方现在直接显示“二维码将在……”倒计时；首次使用/已经安装说明保持左右分栏；底部改为可点击的“无法扫码？打开六位数字绑定码页”，移除“二维码更新后……”提示；绑定页相关字号整体增加 2px。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：未在真实 DP75SDI 上确认长标题和放大后的两栏文字是否仍完整显示在 540×720 视口内。
- 下一步：在 DP75SDI 实机检查最终排版和链接触达后，再将本条标记为完成。

### 2026-08-08 — Kindle 绑定页说明留白与样式缓存刷新（本次会话）

- 状态：待评审。
- 目标：增大“首次使用”和“已经安装”两组说明的留白，并确保 Kindle 不再继续使用旧版 `kindle.css` 缓存。
- 范围：`frontend/public/kindle.html`、`frontend/public/kindle.css`、本进度记录；不改变绑定流程和接口。
- 设计/需求基线：用户本次反馈；现有 Kindle 绑定页布局和 DP75SDI 静态资源缓存表现。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：已确认 CSS 中绑定页正文和标题字号已经分别为 23px/24px，但 `/kindle.css` URL 没有缓存版本标识；本次增加说明单元格内边距并为 CSS 链接加入版本参数，便于实机强制读取新样式。
- 完成：首次使用/已经安装两栏顶部留白由 12px 增至 24px、列间内边距增至 18px；`kindle.html` 的 CSS 引用增加版本参数 `v=2026080803`，避免 Kindle 继续复用旧样式缓存。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：未在真实 DP75SDI 上确认缓存刷新后的实际字号和两栏间距；需要重新打开 `/fridge` 或刷新页面观察。
- 下一步：在 DP75SDI 上重新加载带 `kindle.css?v=2026080803` 的页面，确认字号和两组说明留白后再将本条标记为完成。

### 2026-08-08 — Kindle 静态入口整体缓存与左栏边距修正（本次会话）

- 状态：待评审。
- 目标：修正“首次使用”左侧缺少内边距的问题，并同时刷新 Kindle HTML、CSS、JS 三个静态入口，避免设备继续组合使用旧版资源。
- 范围：`frontend/public/kindle.html`、`frontend/public/kindle.css`、`frontend/public/kindle.js`、本进度记录；不改变绑定业务流程。
- 设计/需求基线：用户本次反馈；DP75SDI 已验证的基础 CSS/ES5 能力；现有 Kindle 绑定页布局。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：已确认当前实现使用的是 DP75SDI 支持的 table、font-size 和 padding；更可能的问题是旧版 `kindle.html` 仍引用旧资源地址，因此本次同时升级 CSS/JS 查询版本，并给左右两栏统一显式左右内边距。
- 完成：CSS/JS 资源版本统一升级为 `2026080804`；首次使用和已经安装两栏均显式设置 18px 左右内边距，首次使用不再贴左；保持绑定页文字字号和布局调整不变。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：未在真实 DP75SDI 上确认新 HTML 及 `kindle.css/js?v=2026080804` 的实际加载结果；若仍无变化，需要检查部署版本是否已更新而非继续调整 CSS。
- 下一步：在 Kindle 重新打开 `/fridge`，确认地址加载新版本资源；若网络请求仍返回旧文件，则检查服务端部署/缓存层。

### 2026-08-08 — Kindle 绑定页关键样式改为内联（本次会话）

- 状态：待评审。
- 目标：绕过外部 `kindle.css` 可能未生效的问题，将绑定页关键字号、边距和分栏布局直接内联到动态生成的 HTML 元素。
- 范围：`frontend/public/kindle.js`、本进度记录；不改变绑定流程、文案和资源请求逻辑。
- 设计/需求基线：用户本次反馈；DP75SDI 基础 HTML/ES5 能力；现有 Kindle 绑定页。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：用户确认此前 JS 驱动的文字布局已经刷新，但字号没有变化，因此本次不再依赖外部 CSS 选择器，直接为绑定页生成节点设置 `style` 属性。
- 完成：绑定二维码页标题、倒计时、两栏文字字号与内边距、底部链接均改为内联样式；六位码页的标题、说明、输入框、按钮和反馈文字也补充内联字号/布局，外部 CSS 未生效时仍能显示新版尺寸。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：未在真实 DP75SDI 上确认新版 `kindle.js?v=2026080804` 已部署并执行；若仍无变化，应直接检查 `/kindle.js?v=2026080804` 返回内容是否为当前构建版本。
- 下一步：在 Kindle 重新打开 `/fridge`，确认两栏字号和“首次使用”左侧内边距；若不变，检查部署产物而非 CSS 规则。

### 2026-08-08 — Kindle 绑定页增加版本时间戳（本次会话）

- 状态：待评审。
- 目标：在 Kindle 绑定页底部显示固定版本时间戳，用于确认设备实际执行的静态 JS 是否已更新。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、本进度记录；不改变绑定业务流程。
- 设计/需求基线：用户本次反馈；当前 Kindle 静态资源版本排查方案。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：将在底部绑定页 footer 显示固定版本时间 `2026-08-08 01:30:21 CST`；后续每次修改 Kindle 页面同步更新该常量，避免把设备当前时间误认为新 JS 已加载。资源查询版本同步升级为 `2026080805`。
- 完成：二维码页和六位码页底部均显示固定版本时间 `2026-08-08 01:30:21 CST`；资源查询版本升级到 `2026080805`，便于定位设备实际执行的 HTML/JS 版本。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：未在真实 DP75SDI 上确认时间戳是否出现；如果看不到该时间，需检查服务端是否已部署当前 `kindle.js`，而不是继续调整 CSS。
- 下一步：在 Kindle 重新打开 `/fridge`，确认底部出现 `版本时间：2026-08-08 01:30:21 CST`。

### 2026-08-08 — Kindle 绑定页增加旧 WebKit 字号兜底（本次会话）

- 状态：待评审。
- 目标：在确认新版 JS 已执行但 CSS `font-size` 视觉仍无变化后，为绑定页文字增加旧式 HTML `<font size="5">` 字号兜底。
- 范围：`frontend/public/kindle.js`、本进度记录；不改变绑定流程和页面文案。
- 设计/需求基线：用户本次反馈；DP75SDI 旧 WebKit 兼容性基线；现有绑定页内联样式实现。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 会话记录：时间戳已能在设备出现，证明新版 JS 已执行；本次不再继续提高 CSS px 数值，而是用 Kindle 更可能遵循的传统 HTML 字号属性包裹绑定页文字，同时保留内联 CSS 作为现代浏览器回退。
- 完成：绑定页标题、两栏标题与正文、倒计时、底部提示和六位码页文字增加传统 `<font size="5">`/`<font size="4">` 兜底；版本时间更新为 `2026-08-08 01:33:40 CST`，资源查询版本更新为 `2026080806`。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：未在真实 DP75SDI 上确认传统 HTML 字号的最终视觉大小；若时间戳出现但字号仍不变，则需检查设备浏览器自身的字体缩放/显示设置。
- 下一步：在 Kindle 重新打开 `/fridge`，确认底部出现 `版本时间：2026-08-08 01:33:40 CST`，并观察标题、两栏正文和倒计时是否明显变大。

### 2026-08-08 — Kindle DP75SDI HTML/CSS/JS 能力 Spike（本次会话）

- 状态：待评审。
- 目标：建立可在 DP75SDI 上反复执行的基础能力诊断页，确认 Kindle 对 HTML、CSS、JavaScript 和关键 Web API 的真实支持，避免后续页面重复试错。
- 范围：`frontend/public/kindle.js`、`frontend/public/kindle.css`、新增 `docs/kindle-capability-spike.md`、本进度记录；诊断通过 `/fridge?spike=1` 进入，不改变普通 `/fridge` 绑定页。
- 设计/需求基线：用户本次明确要求；`docs/functional-design-and-feasibility.md` §12.4 DP75SDI 兼容性基线；现有 Kindle ES5/XHR 页面约束。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；在 DP75SDI 上打开诊断 URL 并记录截图/逐项结果。
- 会话记录：诊断页将同时呈现外链 CSS、内联 CSS、传统 `<font>`、table、inline-block、Flex/Grid 对比样例，并用 ES5 代码输出 DOM、JSON、XHR、Canvas、SVG、localStorage、URL、Promise、fetch 等能力检测结果；普通入口继续执行当前绑定流程。
- 完成：新增 `/fridge?spike=1` 诊断模式；普通 `/fridge` 不受影响。诊断页包含视觉样例、自动能力检测、版本时间戳和实机记录说明；后端静态路由契约覆盖带 query 的入口。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_health.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 均通过。
- 未验证：尚未在真实 DP75SDI 上打开诊断页、截图并填写逐项结果；目前 `docs/kindle-capability-spike.md` 的结果表仍待实机数据。
- 下一步：在 DP75SDI 打开 `/fridge?spike=1`，记录版本时间、视口、User-Agent、视觉样例和自动检测结果，再回填能力基线文档。

### 2026-08-08 — Kindle 二维码入口临时切换为能力 Spike（本次会话）

- 状态：待评审。
- 目标：让用户直接打开现有 `/fridge` 二维码入口即可看到能力诊断页，免去手工输入 query；仅临时替换首次二维码入口。
- 范围：`frontend/public/kindle.js`、`docs/kindle-capability-spike.md`、本进度记录；`/fridge/passcode`、`/fridge/pair` 和已配置设备页面不切换。
- 设计/需求基线：用户本次明确要求；当前 Kindle 能力 Spike 诊断页。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、`git diff --check`；在 DP75SDI 直接打开 `/fridge` 记录截图和结果。
- 会话记录：新增临时开关，首次二维码入口默认渲染诊断页；版本时间更新为 `2026-08-08 01:42:08 CST`，资源查询版本更新为 `2026080807`；`/fridge?normal=1` 保留原二维码页回退入口，完成 Spike 后关闭该开关即可恢复。
- 完成：DP75SDI 实机已打开 `/fridge` 诊断页并提供截图；确认外链/内联 CSS 基础样式生效、传统 `<font size>` 字号最可靠，Flex/Grid/URL/Promise/fetch 不可用；结果已回填 `docs/kindle-capability-spike.md`。
- 验证：实机版本时间为 `2026-08-08 01:42:08 CST`；本地 `node --check frontend/public/kindle.js`、前端 lint、105 个测试、前端构建、后端 7 个契约测试、Ruff、`git diff --check` 均通过。
- 未验证：尚未在其他 Kindle 型号或不同固件上复测；本结论针对 DP75SDI 这台设备。
- 下一步：完成能力基线评审后关闭 `FORCE_CAPABILITY_SPIKE`，恢复 `/fridge` 正常二维码页；后续 Kindle 页面按该基线实现。

### 2026-08-07 — 发布 SSH 主机防误用（本次会话）

- 状态：已完成。
- 目标：禁止发布流程连接 `flycn.fyi`，统一使用生产固定 IP `107.174.152.245`，并在脚本层拒绝错误主机配置。
- 范围：`scripts/deploy-image.sh`、本机忽略配置 `.deploy.env`、发布说明和本进度记录；不执行真实发布，不修改生产配置或业务数据。
- 设计/需求基线：用户明确要求发布时不得 SSH 连接 `flycn.fyi`；现有发布脚本的 SSH 参数校验和生产固定 IP 约定。
- 会话记录：已确认此前误用原因是 `.deploy.env` 默认仍为 `flycn.fyi`，发布脚本没有在 SSH 前设置禁用规则；本次将默认主机改为 `107.174.152.245`，并在脚本参数校验阶段拒绝 `flycn.fyi`、大小写变体和末尾点形式。
- 完成：发布脚本在任何 SSH 命令前拒绝 `flycn.fyi`；README 和本机 `.deploy.env` 均改为固定 IP 发布说明；未执行真实发布。
- 验证：`sh -n scripts/deploy-image.sh`、默认 `scripts/deploy-image.sh --dry-run`、`--host flycn.fyi --dry-run`、大写和末尾点变体拒绝检查、`git diff --check` 均通过；错误主机检查返回退出码 2，未启动 SSH。
- 未验证：未执行真实生产发布；本次修复仅改变发布入口防护和文档。
- 下一步：后续正式发布直接使用默认配置或显式 `--host 107.174.152.245`，若误传 `flycn.fyi` 应在本地立即失败。

### 2026-08-07 — 发布最新版（本次会话）

- 状态：已完成，待真实设备验收。
- 目标：将当前 `main` 最新提交 `504a6b2` 发布到生产服务器，自动生成 release 号，完成生产数据库在线备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 正式发布流程、生产数据库备份/迁移、容器健康检查和公网 `/healthz` 验证；不创建分支、不提交 Git、不覆盖生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；README 单容器发布流程；`scripts/deploy-image.sh` 的 release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：发布归档内置图标资产校验通过，生产容器为 `healthy`，容器内 Alembic 为 `head`，公网 `/healthz` 正常，发布结果和未验证项回写本记录。
- 会话记录：已确认工作区改动已提交为 `504a6b2`；发布配置使用 `flycn.fyi` SSH 主机和 `/opt/fridgeboard`。
- 发布：首次使用 `flycn.fyi` 连接因 Cloudflare DNS 地址的 22 端口超时；改用生产固定 IP `107.174.152.245` 成功发布，release `260807192713`；生产数据库备份为 `/data/fridgeboard.db.backup-20260807-112722`，权限为 `600`；未覆盖生产 `.env` 或业务数据。
- 验证：后端 Ruff、101 个测试、`uv lock --check`，前端 lint、105 个测试和生产构建均通过；发布归档内置图标资产校验通过（46 个）；生产容器状态为 `running/healthy`，`frontend/src/release.ts` 已注入 release `260807192713`，公网 `https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未执行真实 iOS/Android PWA、Kindle 设备和视觉回归验收。
- 下一步：在评审设备验证本次配对、首次使用、冰箱端绑定及补货清单功能，并确认关于页面显示 release `260807192713`。

### 2026-08-07 — P3/P7 冰箱端设备绑定页与设备访问状态闭环（本次会话）

- 状态：待评审。
- 目标：按冻结 UI 设计重整“冰箱端设备”信息层级；将状态卡片留在冰箱设置页，绑定页只负责扫码、换绑确认和六位码流程；补齐 Kindle 六位码入口、设备列表加载错误态和绑定后的状态刷新。
- 范围：手机端 `FridgeDeviceBinding`、冰箱设置设备区块与设备列表加载；Kindle 静态绑定码入口；相关前后端/前端回归测试和受影响文档；不改变库存、布局和设备权限模型。
- 设计/需求基线：`docs/ui-design-specification.md`；`docs/pairing-and-onboarding-redesign.md` §5.5；`docs/final-ui-designs.md` 中冰箱管理与设备访问稿 `1bfa869c-6942-4c89-b275-83e9a02c04e1` 及 `docs/ui-assets/proposals/pairing-onboarding-redesign.html`；本次审查确认的二维码用途分流、六位码闭环和设备列表错误态问题。
- 预期验证：手机端未绑定/已绑定/换绑确认/扫码/六位码、Kindle 六位码输入、设备列表加载/空/错误状态和绑定成功刷新；前端 test/lint/build、后端 Ruff/pytest、`git diff --check`。
- 会话记录：已确认当前组件把设备摘要、手机访问占位、扫码流程和未完成六位码输入混在一个页面；已确认已配置 Kindle 的 `grant_pwa_access` 二维码不能直接调用显示设备绑定接口；本次按“设置页状态卡片 + 短流程页”拆分，并由子代理分工实现后由主代理复核整合。
- 2026-08-07 修复会话：代码审查发现从首页进入设置未触发设备列表请求、`DeviceListState` 与 `devices` 重复保存列表数据，以及 Kindle 六位码仅有静态资源契约测试；本次目标是修复入口加载、收敛状态来源并补齐六位码行为验证。
- 修复完成：首页进入设置统一调用 `openSettings`，设备列表状态成为设置页唯一设备数据源；设置页回归覆盖有效设备展示，Kindle 静态契约补充成功跳转和未完成布局等待分支断言。
- 完成：冰箱设置页现在将“冰箱端设备”和“手机访问”分区展示；绑定流程页只负责扫码、二维码用途校验、换绑确认和六位码生成；Kindle 未配置页可输入六位绑定码并沿用现有绑定状态流；设备列表请求失败显示重试而不再伪装为空；绑定成功后刷新冰箱摘要和工作区缓存；设备响应补充最近成功同步时间。
- 验证：`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`node --check frontend/public/kindle.js`、`uv run ruff check backend`、`uv run pytest`（101 passed）、`uv lock --check`、`git diff --check` 均通过。
- 未验证：未执行真实 iOS/Android PWA、Kindle 实机和 320/390/430px 视觉核验；后端测试存在既有依赖弃用警告。
- 下一步：在真实手机和 Kindle 上验收首次绑定、已配置 Kindle 添加手机、显示设备换绑、六位码、二维码用途错误和设备列表网络错误状态。

### 2026-08-07 — P9 补货清单复制内容收敛（本次会话）

- 状态：进行中。
- 目标：复制补货清单时仅复制缺货物品及数量，不复制星期、日期或菜名。
- 范围：前端 P9 补货清单复制文本格式、相关回归测试和本进度记录；不改变补货清单页面展示、缺货计算、食谱数据或剪切板反馈行为。
- 设计/需求基线：用户本次明确反馈；现有 `RecipeWorkspace.copyRestock` 实现及补货清单数据契约。
- 预期验证：复制文本只包含缺货物品和数量、每个缺货项独立一行；前端 test、lint、build 和 `git diff --check`。
- 会话记录：已确认当前复制文本为 `${item.label} ${item.dish_name}：${missing.subcategory_name}×${missing.quantity}`，本次将移除星期/日期和菜名，仅保留缺货物品及数量，并为格式化结果补充静态回归测试。
- 完成：新增独立的补货复制文本格式化模块；剪切板内容现在仅按行输出 `缺货物品×数量`，不再包含星期、日期或菜名；页面展示和复制成功/失败反馈保持不变。
- 验证：`npm run --prefix frontend test -- --run`（101 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机/PWA 剪切板权限与系统字体验收；本次未修改布局和视觉样式。
- 下一步：在评审设备复制一份包含多个日期和菜名的补货清单，确认剪切板仅有缺货物品及数量。

### 2026-08-07 — P5/P7 零库存软删除记录不计入物品统计（本次会话）

- 状态：待评审。
- 目标：数量为 0 的软删除物品继续保留在物品列表和搜索结果中供恢复，但不计入首页右上角、物品列表和库存搜索页的物品统计数字。
- 范围：前端首页、统一物品列表/搜索页的统计口径与回归测试；不改变零数量记录的展示、排序、数量恢复、库存 API 和首页冰箱图标数据。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3.5、§3.6；`docs/final-ui-designs.md` 当前冰箱首页 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及物品列表复用布局规则。
- 预期验证：正库存与零库存混合时，首页仅统计正库存；物品列表和搜索结果保留零库存行但统计数字只计算正库存；前端 lint、test、build 和 `git diff --check`。
- 会话记录：已确认首页统计使用 `homeInventory.length`，统一物品列表/搜索统计使用筛选后 `items.length`；两条路径均需保留零库存记录展示，因此按展示数量与统计数量分离处理，不改 API 的 `include_zero=true` 语义。
- 会话记录：已新增统一的正库存批次数量统计函数：首页统计和首页冰箱图标均防御性排除数量为 0 的记录；物品列表与搜索页继续展示零数量行，但统计数字按当前筛选结果中数量大于 0 的批次计算，数量编辑中的本地草稿也即时反映到统计。
- 完成：修复首页右上角“n 件物品”、物品列表“共/找到 n 件物品”和库存搜索页“n 条结果”将软删除记录计入的问题；新增正库存/零库存混合场景的列表、搜索和统计规则回归测试。
- 验证：`npm run --prefix frontend test -- --run App.test.ts`（64 passed）；`npm run --prefix frontend test -- --run`（106 passed）；`npm run --prefix frontend build` 通过；`git diff --check` 通过。`npm run --prefix frontend lint` 仍受本工作区既有 Kindle 路由改动阻断（`App.tsx` 中 2 个未使用符号 error，另有 5 个既有 warning）。
- 未验证：未执行 Playwright 或真实手机/PWA 视觉核验；本次未改变布局、尺寸或样式。
- 下一步：在评审设备确认首页、物品列表和搜索页的统计数字；另行处理既有 Kindle 路由 lint error 后再执行完整前端 lint 门禁。

### 2026-08-07 — DP75SDI Kindle 冰箱端兼容性修复（本次会话）

- 状态：待评审。
- 目标：修复提交 `c0ae5ca18309b454992136acbc330ddff6557e9f` 中 Kindle 冰箱端仅首次二维码页使用 ES5、绑定后仍进入 React/Vite 页面的问题；补齐等待布局、已配置添加手机、首页/分区详情、XHR 超时、540×720 自适应布局和回归验证。
- 范围：独立 Kindle 静态页面与路由、ES5/XHR 数据层、二维码刷新与状态流、首页/分区详情交互、Kindle 页面 CSS、前端/后端回归测试和相关文档；不修改手机端 PWA 业务语义、不执行发布、不创建分支或提交 Git。
- 设计/需求基线：`docs/ui-design-specification.md` §6.3、§9、§10.1；`docs/functional-design-and-feasibility.md` §12.4；`docs/final-ui-designs.md` 冰箱端四个场景；`docs/ui-assets/proposals/pairing-onboarding-redesign.html/png` 的 540×720 Kindle 三状态基线。
- 预期验证：Kindle 路由不加载 React/ES Module；静态资源仅使用 ES5、`XMLHttpRequest` 和基础 CSS；覆盖首次绑定、等待布局、已配置添加手机、撤销、二维码过期/网络错误、首页/分区详情和 540×720 尺寸计算；前端 lint/test/build、后端 Ruff/测试及 `git diff --check`。
- 会话记录：代码审查确认 `/fridge` 之外的 `/fridge/device`、`/fridge/pair` 会回退到 React `index.html`，首次绑定页忽略 `setup_status`，二维码尺寸在 540×720 下计算到约 420px，XHR 未设置超时；本次按独立 ES5 页面架构修复，不复用 React Kindle 组件。
- 完成：新增 `frontend/public/kindle.html`、`kindle.css`、`kindle.js` 独立入口；`/fridge`、`/fridge/device`、`/fridge/pair` 统一返回该入口；删除旧 `fridge-qr.html` 和 React Kindle 页面；补齐 `setup_status` 等待布局、已配置添加手机、二维码过期/错误、XHR 15 秒超时、首页/分区详情/库存调整/撤销和 540×720 尺寸计算；同步移除手机端 bundle 中已无入口的旧 Kindle 组件与样式。
- 验证：`node --check frontend/public/kindle.js`、Kindle 静态资源 ES5/基础 CSS 回归测试、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（101 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（101 passed）、`uv lock --check`、`git diff --check` 均通过；构建产物包含 `dist/kindle.html`、`dist/kindle.css`、`dist/kindle.js`。
- 未验证：真实 DP75SDI 加载、配对/刷新路径和 3:4 竖屏截图验收；这些仍是待评审设备项，未执行发布。
- 下一步：在 DP75SDI 上验证 `/fridge` 首次绑定、布局等待、`/fridge/pair` 添加手机、刷新/过期和分区库存调整，并留存 540×720 截图。
- 会话记录：复审发现轮询超时会静默无限重试、`/fridge/pair/` 会误判为首次入口、库存操作缺少并发保护，以及二维码图片加载失败没有反馈；本次仅修复 Kindle 静态页面与对应回归测试，不修改手机端业务语义、不发布、不提交 Git。
- 完成：轮询遇到超时、非成功 HTTP 状态或无效响应时改为显示可见错误和重试入口；路径判断统一去除尾斜杠；库存调整与撤销增加请求锁并禁用操作按钮直到刷新完成；二维码图片增加 `onerror` 反馈和重新生成入口。
- 验证：`node --check frontend/public/kindle.js`、`backend/tests/test_health.py`（7 passed）、前端 lint、前端全量测试（101 passed）、前端构建、后端 Ruff、后端全量测试（101 passed）、`uv lock --check`、`git diff --check` 均通过。
- 未验证：真实 DP75SDI 加载、配对/刷新路径和 3:4 竖屏截图验收；这些仍是待评审设备项，未执行发布。
- 下一步：在 DP75SDI 上验证 `/fridge` 首次绑定、布局等待、`/fridge/pair/` 尾斜杠入口、二维码图片失败重试和连续库存操作，并留存 540×720 截图。

### 2026-08-07 — 发布最新数据库结构和代码（本次会话）

- 状态：已完成。
- 目标：将本地 `main` 最新提交发布到生产服务器，并把本地开发数据库升级到当前 Alembic head。
- 范围：本地根目录 SQLite 数据库 Alembic 迁移、`scripts/deploy-image.sh` 正式发布、生产数据库在线备份/迁移/健康检查；不创建分支、不提交 Git、不修改生产 `.env` 或业务数据。
- 设计/需求基线：用户本次明确发布要求；README 单容器发布流程；`scripts/deploy-image.sh` 的 release 注入、SQLite 在线备份、容器启动迁移和健康检查约定。
- 预期验证：本地 Alembic 为 `head`，生产容器 healthy、生产 Alembic 为 `head`、公网 `/healthz` 正常，发布前后 Git 工作区和数据库完整性状态可追溯。
- 会话记录：确认本地 `main` 的发布提交为 `c0ae5ca`，工作区原本无未提交应用代码；根目录 `fridgeboard.db` 已执行 `alembic upgrade head`，当前为 `20260807_13 (head)`，SQLite `integrity_check` 为 `ok` 且外键检查为空。使用生产固定 IP `107.174.152.245` 执行正式发布，未覆盖生产 `.env` 或业务数据。
- 发布：release `260807144602`；生产数据库备份为 `/data/fridgeboard.db.backup-20260807-064614`；备份权限为 `600`。
- 验证：发布脚本内置图标资产校验通过（46 个）；后端 Ruff、101 个测试、`uv lock --check`，前端 lint（0 errors，5 个既有 Fast Refresh warnings）、103 个测试和生产构建均通过；生产容器状态为 `running/healthy`，容器内 Alembic 为 `20260807_13 (head)`，release 已进入前端静态产物，公网 `https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未执行真实 iOS/Android PWA、Kindle 设备和视觉回归验收。
- 下一步：在评审设备验证本次配对、首次使用、冰箱端绑定及补货清单等待评审功能。

### 2026-08-07 — P9 补货清单缺少项合并展示（本次会话）

- 状态：待评审。
- 目标：补货清单中每道食谱只显示一行缺少货品及数量，在同一行连续列出项目并允许自然换行；缺少货品及数量复用食谱列表缺少项的警告红色。
- 范围：前端 P9 补货清单展示结构与样式、相关回归测试和本进度记录；不改变缺货数据、复制清单内容或食谱列表匹配语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；P9 动态补货清单设计稿 `903728d2-d6b9-4918-82b5-9d3ab6b3aafb` 及本地 `docs/ui-assets/png/pwa-restock-list.png`、`docs/ui-assets/html/pwa-restock-list.html`；食谱列表现有 `var(--danger)` 缺少项颜色。
- 预期验证：补货清单每道食谱最多一行缺少货品文本、多个项目使用中文逗号连接且可换行、货品及数量颜色为 `var(--danger)`；前端 lint、test、build 和 `git diff --check`。
- 会话记录：已定位 `RecipeWorkspace.tsx` 当前按缺少项目逐项渲染多行 `<p>`，并确认食谱列表 `.p9-ingredient-chip.is-missing` 使用 `var(--danger)`；已合并为单行语义，项目之间使用中文逗号，保留项目加粗。根据用户最终确认，移除“缺少”文字，仅将缺少货品及数量设为红色。
- 完成：每道食谱的缺少项目改为一个段落，长列表通过 `overflow-wrap: anywhere` 自然换行；移除“缺少”文字，仅将缺少货品及数量使用 `var(--danger)`；新增 `RestockMissingLine` 静态渲染回归测试。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（105 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机/PWA 视觉核验。
- 下一步：在 320/390/430px 评审设备打开补货清单，确认只显示红色缺少货品及数量、长文本换行自然且颜色与食谱列表一致。

### 2026-08-07 — P5 个护美妆小类命名与图标恢复（本次会话）

- 状态：待评审。
- 目标：恢复原调色盘图标并新增为“眼妆”，保留“眼部”的 `ph:eye-bold` 图标；将“底妆”改名为“面妆”。
- 范围：版本化分类目录、原调色盘 SVG 资产、分类接口回归断言、功能文档和本进度记录；不改变库存批次、已有分类 ID 或分类选择器交互。
- 设计/需求基线：用户本次明确的分类名称与图标调整；当前数据驱动分类目录及既有 `ph:eye-bold`、`makeup-base` 资产。
- 预期验证：目录与图标资产一致性、分类父子关系和图标库回归测试、后端 Ruff/pytest、前端 lint/test/build、JSON/XML 与差异检查。
- 会话记录：已确认当前“眼部”使用 `ph:eye-bold`，“底妆”使用 `makeup-base`；本次将原调色盘图标作为独立“眼妆”恢复，不覆盖现有“眼部”，并只更新显示名称而保留“面妆”的分类 ID 和图标键。
- 完成：恢复 `pepicons-pop:paint-pallet-circle` 为“眼妆”小类；“底妆”改名为“面妆”；同步图标清单、分类接口断言和功能规则文档。
- 验证：目录与 46 个图标资产一一对应，全部 SVG XML 校验通过；`uv run ruff check backend`、`uv run pytest`（85 passed）、`uv lock --check`、专项分类测试（17 passed）和 `git diff --check` 均通过。
- 未验证：真实手机/PWA 中新增“眼妆”和改名后“面妆”的人工视觉核验。
- 下一步：在评审设备打开“添加物品”分类选择器，确认“个护美妆/面妆、眼部、眼妆”的归属、顺序与图标显示。

### 2026-08-07 — P3/P4/P7/P12 首次使用、配对与冰箱端绑定流程重设计（本次会话）

- 状态：待评审；`daily_access` 多冰箱工作区和页面权限门禁已实现，真机验收仍待完成。
- 目标：解决 Kindle 首次显示二维码但手机首页缺少扫码入口、安装引导与短效配对地址关系不清、布局未完成状态无法恢复，以及已有布局用户找不到冰箱端绑定/换绑入口的问题。
- 范围：按 `docs/pairing-and-onboarding-redesign.md` 重构领域状态、后端 API、手机端首次使用/扫码/未完成布局恢复、冰箱设置绑定与换绑、Kindle 二维码状态；同步自动化测试和受影响文档，不修改部署配置或执行发布。
- 设计/需求基线：用户本次讨论结论；`docs/ui-design-specification.md`；功能设计 §10；ADR-0002；现有安装、配对成功、Kindle 二维码、创建布局和冰箱设置设计资产。
- 完成：新增 `setup_status/setup_draft` 和配对用途迁移，历史冰箱回填 `ready`；实现待完成冰箱无布局创建、布局保存转 `ready`、手机授权幂等、跨账号仅日常访问、单活跃 Kindle、普通绑定冲突、原子换绑及失败保留旧端；增加 Kindle 页面/二维码状态与 PNG 接口；新增前端二维码解析、登录意图、URL 清理、结果分流和冰箱状态摘要模块；接入手机空首页扫码/登录、统一扫码、未完成冰箱继续设置、配对结果分流、冰箱设置冰箱端绑定/换绑与六位码入口；Kindle 状态组件接入冰箱端入口，并继续保留“我的冰箱”和“冰箱设置”既有入口。
- 验证：基础配对阶段验证通过；本次追加会话另行验证 `uv run ruff check backend`、`uv run pytest`（100 passed）、`uv lock --check`、`npm run --prefix frontend test -- --run`（102 passed）、`npm run --prefix frontend lint`（0 errors，5 个 Fast Refresh warnings）、`npm run --prefix frontend build`、`git diff --check`。
- 会话记录：本次由主代理协调 5 个并行 `gpt-5.6-luna` 子代理，分别处理领域/迁移、配对服务/API、手机入口与状态机、冰箱设置/布局恢复、Kindle 端与测试审查；主代理复核并接入跨模块组件，未创建分支、未提交 Git。
- 未验证：真实 iOS/Android PWA、Kindle 设备和 320/390/430px 截图验收未执行；前端仍保留 5 个既有 Fast Refresh warning。
- 下一步：在评审设备验证跨账号扫码、多冰箱切换、撤销后重新扫码，以及 daily_access 不能进入所有者设置/设备绑定/删除页面。

#### 追加会话：daily_access 多冰箱工作区与页面权限

- 目标：让当前 PWA 实例通过扫码获得的 `daily_access` 冰箱进入统一“我的冰箱”列表，并允许库存/食谱等日常操作；隐藏或拒绝名称、布局、设备、删除和恢复等所有者管理能力。
- 范围：统一冰箱摘要接入、实例凭证可访问的日常工作区 API、前端 `access_role` 页面门禁、跨账号和撤销回归测试；不改变所有者流程、设备绑定语义或部署配置。
- 设计/需求基线：`docs/pairing-and-onboarding-redesign.md` §3、§5.6、§6.3；`RefrigeratorResponse.access_role` 和现有 `/api/refrigerators` 契约；本次用户确认继续实施。
- 预期验证：跨账号扫码后同一 PWA 可见并可操作、其他 PWA 不自动继承、撤销后列表和工作区失效、非所有者管理接口返回拒绝；后端 Ruff/pytest、前端 test/lint/build、`git diff --check`。
- 会话记录：主代理并行协调 5 个 `gpt-5.6-luna` 子代理，分别完成后端日常 API、前端访问辅助模块、权限矩阵、测试审查和设备绑定门禁；主代理接管并完成 `App.tsx`、库存/食谱日常路径、统一摘要列表和最终验证。保留当前未提交工作区，不创建分支、不提交 Git。
- 完成：新增 `/api/daily/refrigerators/{id}` 布局、分类、图标、默认位置、库存读写、食谱读取/完成/撤销接口；统一 `/api/refrigerators` 列表映射 owner 与 daily_access；daily_access 仅进入首页、库存和食谱日常工作区，不能管理名称、布局、设备、提醒设置、删除/恢复或自定义食谱；补齐跨账号、撤销和工作区读写回归测试。
- 未完成：真实设备与视觉验收仍待执行。

#### 追加会话：daily_access 代码审查问题修复

- 状态：待评审。
- 目标：修复审查发现的多 daily_access 凭证切换、库存搜索/移动仍走 owner API、工作区刷新竞态、所有者入口显示和撤销提示问题；同时移除响应映射对 ORM 实体的副作用。
- 范围：设备凭证目标冰箱选择、daily/owner 工作区路径、库存搜索与移动页面门禁、App 工作区刷新并发、撤销提示、响应映射及回归测试；不改变配对业务规则和部署配置。
- 设计/需求基线：本次代码审查结论；`docs/pairing-and-onboarding-redesign.md` §3、§5.6、§6.3；现有 `access_role` 权限矩阵和 `/api/daily/refrigerators/{id}` 契约。
- 预期验证：同一 PWA 持有多台 daily_access 冰箱时可按目标切换；daily 搜索/库存编辑不调用 owner API；快速切换冰箱不会复用错误刷新请求；daily 不显示所有者入口；撤销提示明确；后端 Ruff/pytest、前端 test/lint/build、锁文件和 diff 检查通过。
- 会话记录：主代理根据只读代码审查直接修复，不创建分支、不提交 Git；新增按目标冰箱选择凭证的后端回归测试。
- 完成：daily API 支持同一浏览器多 PWA 凭证按目标冰箱切换；库存搜索改用 owner/daily 角色路径；daily_access 禁止跨冰箱移动；工作区刷新按冰箱 ID 管理并发；撤销提示补充重新扫码文案；移除响应映射对 ORM 实体的 SQL `null()` 副作用。
- 验证：`uv run ruff check backend`、`uv run pytest`（101 passed）、`uv lock --check`、`npm run --prefix frontend test -- --run`（103 passed）、`npm run --prefix frontend lint`（0 errors，5 个 Fast Refresh warnings）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未完成：真实 iOS/Android PWA、Kindle 设备和 320/390/430px 截图验收仍待执行；当前改动尚未提交或发布。

#### 追加会话：P7/P7.1 我的冰箱既有 UI 回归修复

- 状态：待评审。
- 目标：恢复原有“我的冰箱”列表的页面布局、卡片信息层级、设置图标和设置入口语义；保留本次新增的 owner/daily_access 权限行为，不删除或改写既有冰箱列表和设置功能。
- 范围：对比基线版本与当前工作区的 `FridgeSwitcher`、P7/P7.1 样式、共享页面壳和设置入口；修复发现的 UI 回归并补充静态/组件回归检查，不改变配对 API 和业务数据。
- 设计/需求基线：项目级 `AGENTS.md`；`docs/ui-design-specification.md`；`docs/final-ui-designs.md`；原始 `HEAD` 中的 P7/P7.1 实现和本地 UI 资产。
- 预期验证：顶部右侧只保留一个规范化添加入口；新建与扫码仍可用；列表卡片保留整卡打开和独立设置热区；owner/daily_access 入口门禁只影响权限，不改变 owner 页面视觉；前端 test/lint/build、320/390/430px 浏览器核验和 `git diff --check` 通过。
- 会话记录：主代理对照 `docs/ui-assets/png/pwa-fridge-switcher.png`、对应 HTML、项目 UI 规范和当前/基线代码，确认原实现的卡片列表与设置入口被重复操作图标挤压；将顶部扫码/新建两个文字图标收敛为一个冰箱加号 SVG 入口，并按统一顶部菜单规范展开“新建冰箱”和“扫码加入冰箱”；移除卡片中与整卡点击重复的打开箭头，保留 48px 设置热区和 24px 线框齿轮；补回左侧返回按钮；隔离食谱菜单对最后一项文字的全局 CSS 覆盖，避免扫码入口显示或读成“食谱历史”。未创建分支、不提交 Git。
- 完成：我的冰箱页面已恢复稳定的三列顶部栏、卡片列表层级和设置入口；多冰箱、最近删除、新建、扫码、继续设置、卡片打开和冰箱设置均保留；daily_access 的页面权限逻辑未改写。
- 验证：`npm run --prefix frontend lint` 通过（0 errors，5 个既有 Fast Refresh warnings）；`npm run --prefix frontend test -- --run`（103 passed）；`npm run --prefix frontend build`；`git diff --check` 均通过。Playwright 本地核验了 390×844、320×844、430×844：标题中心分别对齐视口中心，`scrollWidth` 与视口宽度一致；菜单无障碍名称为“新建冰箱/扫码加入冰箱”；点击“设置北师大冰箱”可进入“冰箱设置”。截图保存在 `output/playwright/fridge-switcher-390.png`、`output/playwright/fridge-switcher-320.png`、`output/playwright/fridge-switcher-430.png` 和菜单截图。
- 未完成：真实 iOS/Android PWA 与用户实际设备上的人工视觉验收仍待执行；后端本会话未修改，上一会话的后端门禁结果保持有效。

#### 追加确认：我的冰箱顶部仅保留扫码入口

- 目标：移除顶部“新建冰箱”重复入口，顶部仅保留扫码加入冰箱；底部“＋ 新建冰箱”按钮继续保留。
- 范围：`FridgeSwitcher` 顶部操作按钮及其菜单状态/CSS；不改变冰箱列表、卡片设置、底部新建、扫码行为和权限门禁。
- 预期验证：顶部只存在“扫描冰箱二维码”按钮，底部仍存在“＋ 新建冰箱”；前端 lint/test/build 和 `git diff --check` 通过。
- 状态：待评审。
- 完成：顶部已仅保留“扫描冰箱二维码”图标入口；底部“＋ 新建冰箱”继续保留并作为唯一新建入口，移除了顶部菜单状态和重复的新建入口。
- 验证：前端 lint/test/build 与 `git diff --check` 已重新执行；顶部扫码入口和底部新建按钮均保留。

#### 追加修复：扫码页统一返回栏与手势

- 目标：修复从“我的冰箱”进入扫码页后顶部返回按钮不可见的问题，使扫码页复用统一二级页面返回栏和边缘右滑返回行为。
- 范围：PWA 扫码页 `PwaScanner` 的页面壳、顶部栏和扫码页样式；不改变二维码解析、相机权限和扫码结果分流。
- 预期验证：返回按钮在扫码页可见且可点击；左边缘右滑触发返回；前端 lint/test/build、浏览器核验和 `git diff --check` 通过。
- 状态：待评审。
- 完成：移除扫码页旧的宽泛 `header`/`h1` 样式覆盖，恢复共享 `PageHeader` 的三列布局、48px 返回热区和黑底白字对比；`PageHeader` 继续复用统一的边缘右滑返回监听。
- 验证：Playwright 390×844 核验扫码页返回按钮可见，顶部栏为黑底、返回按钮为白字、布局为 grid、热区为 48×48；点击返回可回到“我的冰箱”；扫码页相机失败状态仍正常显示。前端 lint/test/build、`git diff --check` 均通过。
- 未完成：真实 iOS/Android PWA 上的相机权限和实机右滑手势仍待验收。

#### 追加调整：移除“我的冰箱”页多余返回键

- 目标：移除顶级“我的冰箱”列表页左上角多余的返回按钮；保留扫码二级页的返回按钮和统一右滑返回。
- 范围：`FridgeSwitcher` 顶部栏左侧槽位及仅供该入口使用的图标样式；不改变扫码页、冰箱列表、底部导航和设置入口。
- 预期验证：我的冰箱页左侧保持空槽位、标题仍视口居中；扫码页仍显示返回按钮；前端 lint/test/build 和 `git diff --check` 通过。
- 状态：待评审。
- 完成：移除 `FridgeSwitcher` 顶部左侧返回按钮和仅供该按钮使用的样式；“我的冰箱”页左侧保持统一空槽位，标题继续视口居中；扫码页仍使用 `PageHeader` 返回按钮和右滑返回。
- 验证：Playwright 390×844 确认“我的冰箱”页不再出现左上角“返回”，右上角扫码入口和底部新建按钮仍存在；进入扫码页后“返回”按钮仍存在。前端 lint/test/build、`git diff --check` 均通过。
- 未完成：真实 iOS/Android PWA 上的相机权限和实机右滑手势仍待验收。

### 2026-08-06 — 发布当前最新版（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交 `e06a44f` 发布到生产服务器，自动生成 release 号，完成发布前数据库备份、容器重建、迁移和健康检查。
- 范围：执行 `scripts/deploy-image.sh --host 107.174.152.245`；因生产域名使用 CDN 且无法连接真实服务器，本次强制使用服务器 IP；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不修改生产业务数据。
- 设计/需求基线：用户本次明确发布要求；README 单容器发布流程；`scripts/deploy-image.sh` 的 SQLite 在线备份、自动 release 注入和健康检查约定。
- 预期验证：发布归档内置图标资产校验、服务器数据库备份、容器 `healthy`、容器内迁移状态和公网 `/healthz` 检查。
- 会话记录：已确认工作区在本次发布前无未提交改动，当前 `main` 与 `origin/main` 均指向 `e06a44f`；按要求未使用 CDN 域名连接 SSH，全程使用生产服务器固定 IP `107.174.152.245`。
- 发布：release `260806233757`；生产数据库备份为 `/data/fridgeboard.db.backup-20260806-153807`，权限 `600`；不覆盖生产 `.env` 和数据卷。
- 验证：发布前后端门禁通过（后端 Ruff、85 个测试；前端 lint、71 个测试、生产构建；`uv lock --check`、脚本语法和 IP dry-run）；源码归档内置图标资产校验通过（45 个）；容器状态 `running/healthy`；容器内 Alembic 为 `20260805_12 (head)`；release `260806233757` 已进入前端静态产物；SQLite `PRAGMA integrity_check` 为 `ok`、外键检查为空；服务器迁移目录无 `._*.py` 残留；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：真实 iOS/Android PWA 的人工刷新和关于页面 release 展示。
- 下一步：在真实设备刷新 PWA，确认本次功能和关于页面显示 release `260806233757`。

### 2026-08-06 — P5 内置物品小类补充（本次会话）

- 状态：待评审。
- 目标：在“个护美妆”下新增“底妆”，将既有“眼部”图标替换为 `ph:eye-bold`；在“熟食主食”下新增“速食”，并为新增图标补齐内置 SVG 资产。
- 范围：版本化分类目录、内置 SVG 图标、分类接口回归断言和本进度记录；不改变库存批次、用户自定义分类和分类选择器交互。
- 设计/需求基线：用户本次明确的小分类与图标清单；项目数据驱动分类目录约定；`output/面部.jpg` 作为“底妆”图标描摹源，要求 SVG 线条加粗。
- 预期验证：目录与图标资产一一对应、分类父子关系和图标键回归测试、后端 Ruff/pytest、前端 lint/test/build、JSON 解析与差异检查。
- 会话记录：已确认“眼部”已存在但当前使用调色盘图标，因此按用户指定更新其图标而不重复创建；“底妆”和“速食”使用新的稳定内置 ID；已读取 `output/面部.jpg`，按其粉盒轮廓重描为加粗单色线稿 SVG；旧“眼部”调色盘图标因无其他引用从内置图库清理。
- 完成：新增“底妆”和“速食”分类；“眼部”改用 `ph:eye-bold`；新增 `makeup-base.svg`、`ph-eye-bold.svg`、`boxicons-bowl-noodles.svg`，同步更新图标库和分类接口回归断言；功能规则文档已同步。
- 验证：目录 JSON 与 45 个图标资产一一对应，全部 SVG XML 校验通过；`uv run ruff check backend`、`uv run pytest`（85 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（71 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机/PWA 中新增分类及底妆图标的小尺寸人工视觉核验。
- 下一步：在评审设备打开“添加物品”分类选择器，确认“个护美妆/底妆、眼部”和“熟食主食/速食”的归属、顺序与图标显示。

### 2026-08-06 — 发布当前最新版（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交 `2846fdc` 发布到生产服务器，自动生成 release 号，完成发布前数据库备份、容器重建、迁移和健康检查。
- 范围：执行 `scripts/deploy-image.sh` 当前默认发布流程；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不修改生产业务数据。
- 设计/需求基线：用户本次明确发布要求；README 单容器发布流程；`scripts/deploy-image.sh` 的 SQLite 在线备份、自动 release 注入和健康检查约定。
- 预期验证：发布归档内置图标资产校验、服务器数据库备份、容器 `healthy`、容器内迁移状态和公网 `/healthz` 检查。
- 会话记录：已确认工作区在本次发布前无未提交改动，当前 `main` 与 `origin/main` 均指向 `2846fdc`；默认域名 `flycn.fyi:22` 首次连接超时，未进入远程备份或重建，随后使用同一生产服务器固定 IP `107.174.152.245` 重试成功，未修改生产配置或业务数据。
- 发布：release `260806221202`；生产数据库备份为 `/data/fridgeboard.db.backup-20260806-141215`，权限 `600`；不覆盖生产 `.env` 和数据卷。
- 验证：发布前后端门禁通过（后端 lint、85 个测试；前端 lint、72 个测试、生产构建；`uv lock --check`、脚本语法和 dry-run）；源码归档内置图标资产校验通过（43 个）；容器状态 `running/healthy`；容器内 Alembic 为 `20260805_12 (head)`；release `260806221202` 已进入前端静态产物；SQLite `PRAGMA integrity_check` 为 `ok`、外键检查为空；服务器迁移目录无 `._*.py` 残留；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：真实 iOS/Android PWA 的人工刷新和关于页面 release 展示。
- 下一步：在真实设备刷新 PWA，确认本次功能和关于页面显示 release `260806221202`。

### 2026-08-06 — 发布当前最新版（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交 `aa48e8e` 发布到生产服务器，自动生成 release 号，完成发布前数据库备份、容器重建、迁移和健康检查。
- 范围：执行 `scripts/deploy-image.sh` 当前默认发布流程；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不修改生产业务数据。
- 设计/需求基线：用户本次明确发布要求；README 单容器发布流程；`scripts/deploy-image.sh` 的 SQLite 在线备份、自动 release 注入和健康检查约定。
- 预期验证：发布归档内置图标资产校验、服务器数据库备份、容器 `healthy`、容器内迁移状态和公网 `/healthz` 检查。
- 会话记录：已确认工作区干净，当前 `main` 为 `aa48e8e`，默认 `.deploy.env` 指向 `flycn.fyi`；已通过发布脚本语法检查和 dry-run 参数检查。
- 发布尝试：默认域名 `flycn.fyi:22` 首次连接超时，未进入远程备份或重建；确认同一生产服务器固定 IP `107.174.152.245` SSH 可达后使用 `--host` 覆盖参数重试，未修改生产配置或数据。
- 发布：release `260806201124`；生产数据库备份为 `/data/fridgeboard.db.backup-20260806-121140`；不覆盖生产 `.env` 和数据卷。
- 验证：源码归档内置图标资产校验通过（43 个）；容器状态 `running/healthy`；容器内 Alembic 为 `20260805_12 (head)`；release `260806201124` 已进入前端静态产物；SQLite `PRAGMA integrity_check` 为 `ok`、外键检查为空；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：真实 iOS/Android PWA 的人工刷新和关于页面 release 展示。
- 下一步：在真实设备刷新 PWA，确认本次功能和关于页面显示 release `260806201124`。

### 2026-08-06 — P6 识别中状态视觉反馈（本次会话）

- 状态：待评审。
- 目标：调用后台模型识别物品期间，在识别页中央显示明显的大型动画状态，移除空闲态“选择一种方式开始识别”提示，避免用户误解当前识别状态。
- 范围：`frontend/src/InventoryFlow.tsx` 的识别中状态结构、`frontend/src/styles.css` 的居中大动画及 reduced-motion 降级、前端回归验证和本进度记录；不改变扫码、识图、照片识别请求和识别结果处理逻辑。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §6.2–§6.5、§17.1；`docs/final-ui-designs.md` 的 P5/P6 草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`、`36284a96-d2ad-4fce-96b8-c59af859dc8d` 及对应本地 PNG/HTML 资产。
- 会话记录：已确认识别页当前将“选择一种方式开始识别”作为相机关闭时的空闲内容，并把“正在识别…”与 16px spinner 放在底部附近；本次将识别中反馈提升为页面中间的大型动画状态，并删除空闲提示文案。
- 完成：新增 `RecognitionProgress` 中央状态层，使用 132px 大型循环/呼吸动画、22px“正在识别…”主文案和辅助说明；识别期间覆盖底部入口并保留顶部返回；移除空闲态“选择一种方式开始识别”和重复的小号识别状态；新增静态渲染回归测试。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（4 个测试文件、70 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；识别请求期间三入口仍由原有 `recognizing` 状态禁用，错误/相机状态文案逻辑未改变。
- 未验证：真实 iOS/Android PWA 与 320/390/430px 设备上的人工视觉核验。
- 下一步：在评审设备打开“识别物品”页，点击识图或选择照片，确认 390px 视口下动画位于页面中央且足够醒目，并确认扫码/识图/照片请求完成后状态层正常消失。

### 2026-08-06 — P7.1 我的冰箱设置页加载反馈（本次会话）

- 状态：待评审。
- 目标：点击“我的冰箱”卡片的设置按钮后，在布局和设备数据加载完成前显示明确的加载动画，避免用户误以为点击无效。
- 范围：前端 P7.1 设置入口的加载状态、手机端共享页面加载动画样式及相关回归验证；不改变设置页数据请求、导航目标或业务数据。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/final-ui-designs.md` 登记的 P7.1 冻结本地资产 `docs/ui-assets/proposals/fridge-management-enhancement.{png,html}`；现有 `openSettings` 并行读取布局和设备的流程。
- 会话记录：已定位设置入口在 `openSettings` 完成布局与设备请求后才切换页面，当前等待期间没有可见状态；新增请求开始即显示设置加载页，完成后才进入设置页，返回时使未完成请求失效。
- 完成：新增“正在读取冰箱设置…”状态文案、旋转加载动画和 `role="status"` 无障碍语义；加载页复用 P7.1 页面壳与返回按钮，并支持 `prefers-reduced-motion` 静态降级。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（4 个测试文件、69 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 及 320/390/430px 设备上的人工视觉核验。
- 下一步：在评审设备点击“我的冰箱”各卡片设置按钮，确认慢网络下立即显示加载动画，成功后正常进入设置页，返回或失败后不会被迟到请求再次切回设置页。

### 2026-08-06 — P9 每周食谱备注展示文案（本次会话）

- 状态：待评审。
- 目标：每周食谱及历史周详情显示备注内容时，不再显示“备注：”前缀。
- 范围：前端食谱列表备注展示和相关回归验证；不改变备注编辑、保存和空备注隐藏语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；最终每周/下周食谱设计稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及食谱功能规则。
- 会话记录：已定位本周食谱与历史周详情共用的备注渲染位置，移除展示前缀；编辑页字段标签保持不变。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（4 个测试文件、68 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机/PWA 视觉核验；本次仅调整文本展示，不改变布局和交互。
- 下一步：评审设备打开本周/下周食谱及历史周详情，确认有备注时仅显示备注内容、无备注时仍隐藏。

### 2026-08-06 — P9 每周食谱完成态排序与菜名删除线（本次会话）

- 状态：待评审。
- 目标：每周食谱按“未完成在前、已完成在后”展示，两个分组内按周一至周日排序；已完成食谱的菜名显示删除线。
- 范围：前端每周/下周食谱列表排序工具、完成态菜名样式、回归测试及相关功能规则和本进度记录；不改变完成/撤销接口、库存扣减和编辑语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md`；最终每周/下周食谱设计稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及本地 `docs/ui-assets/html/pwa-weekly-recipes.html`、PNG 资产；P9 食谱完成规则。
- 会话记录：已确认现有前端仅在本周按今天旋转星期顺序，完成态样式曾被后置样式覆盖而取消菜名删除线；已改为未完成食谱、空白日期、已完成食谱三组顺序，组内按周一至周日排列，同一天多道菜按完成状态排列。
- 完成：本周和下周均使用新的完成态排序；已完成菜名恢复 1px 删除线；未改变完成/撤销接口、库存扣减和备注编辑语义；旧的“本周从今天开始”排序测试替换为完成态排序回归测试。
- 验证：`npm run --prefix frontend test -- --run`（4 个测试文件、71 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机/PWA 视觉核验；未在真实设备上抽样确认完成后条目跨星期分组的人工观感。
- 下一步：评审设备打开本周和下周食谱，完成不同星期的菜目，确认未完成项始终在前、已完成项在后，且菜名显示删除线；再撤销一项确认其回到未完成分组。

### 2026-08-06 — P7 首页分格图标二维分布（本次会话）

- 状态：待评审。
- 目标：重做首页冰箱分格内库存图标的二维分布，让横格和竖格都能尽量均匀填充；图标少时按中心、三等分和三角形分布，图标较多时允许受控重叠但必须同时产生上下、左右错位，并保留至少 2px 外框留白。
- 范围：前端首页图标位置算法、分格布局上下文传递、图标定位样式、算法回归测试及本进度记录；不改变库存数据、数量、过期状态、分格点击和图标资源语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` 的冰箱预览完整显示契约；最终手机首页设计稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地资产 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 会话记录：已确认现有实现仅按横向等分点排列，并通过固定 `±6px` 垂直偏移交错；用户确认采用“确定性蓝噪声采样 + 轻量排斥”，本次继续将 2–5 个图标也统一纳入该算法，仅保留单个图标居中。
- 完成：单个图标居中；2 个及以上图标均由 `ResizeObserver` 获取格子实际尺寸，使用确定性 Halton 低差异候选点和最大最小实际像素距离选点，并通过轻量排斥避免规则行列；空间不足时保持上下左右错位；图标主体定位轨道距分格外框至少 2px。
- 验证：`npm run --prefix frontend test -- --run`（4 个测试文件、71 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；新增 2–5 个统一采样、高密度蓝噪声、确定性、实际宽高方向覆盖测试；已核对冻结首页本地资产 `docs/ui-assets/png/pwa-home.png` 与 `docs/ui-assets/html/pwa-home.html`。
- 未验证：真实手机/PWA 视觉核验及不同设备缩放下的人工确认。
- 下一步：在 320/390/430px 设备上抽样确认 1–8 个图标的填充、2px 留白和高密度错位效果；确认后可标记完成。

### 2026-08-06 — 发布当前最新版（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交 `936ec33` 发布到生产服务器，自动生成 release 号，完成发布前数据库备份、容器重建、迁移和健康检查。
- 范围：执行 `scripts/deploy-image.sh` 当前默认发布流程；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不修改生产业务数据。
- 设计/需求基线：用户本次明确发布要求；README 单容器发布流程；`scripts/deploy-image.sh` 的 SQLite 在线备份、自动 release 注入和健康检查约定。
- 预期验证：发布归档内置图标资产校验、服务器数据库备份、容器 `healthy`、Alembic 迁移状态和公网 `/healthz` 检查。
- 会话记录：确认工作区干净且当前 `main` 与 `origin/main` 均指向 `936ec33`；使用仓库默认 `.deploy.env` 发布配置执行正式发布。
- 发布尝试：默认域名 `flycn.fyi:22` 首次连接超时，未进入远程备份或重建；确认固定 IP `107.174.152.245` SSH 可达后改用该地址重试，未修改生产配置或数据。
- 发布：release `260806023555`；生产数据库备份为 `/data/fridgeboard.db.backup-20260805-183603`；不覆盖生产 `.env` 和数据卷。
- 验证：源码归档内置图标资产校验通过（43 个）；容器状态 `healthy`；容器内 Alembic 为 `20260805_12 (head)`；release `260806023555` 已进入前端静态产物；SQLite `PRAGMA integrity_check` 为 `ok`、外键检查为空；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；`git diff --check` 通过。
- 未验证：真实 iOS/Android PWA 的人工刷新和关于页面 release 展示。
- 下一步：在真实设备刷新 PWA，确认本次功能和关于页面显示 release `260806023555`。

### 2026-08-06 — P5/P9 零数量软删除与库存日期恢复（本次会话）

- 状态：待评审。
- 目标：将数量为 0 的库存批次视为软删除；隐藏其添加日期和保质期且不参与过期提醒；食谱完成/撤销时同步恢复日期与提醒；用户手工修改数量后重置添加日期和保质期。
- 范围：库存领域规则、物品列表数量编辑与完整编辑、食谱完成/撤销、提醒统计、相关后端/前端回归测试及需求文档；不改变真正删除按钮和库存批次身份。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3、§7、§9；P5 添加/编辑物品本地设计资产及现有 P9 食谱完成扣减流程。
- 验证：数量为 0 的领域风险排除、库存 API 日期隐藏/手工改数重置、食谱完成/撤销日期恢复、零数量提醒排除均有回归测试；`uv run ruff check backend`、`uv run pytest`（85 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（66 passed）、`npm run --prefix frontend build`、`uv lock --check`、`git diff --check` 均通过。
- 会话记录：先定位现有零数量、食谱消费审计和日期字段的写入/读取链路，补充“完成—撤销”和“手工改数”边界测试，再实现并同步功能规则与验证证据。
- 完成：数量为 0 的库存批次保留数据库记录和食谱撤销所需原日期，但 API、物品列表和过期提醒均隐藏/排除日期风险；食谱撤销恢复数量后恢复原添加日期与 BBD；物品列表加减/输入和编辑页改数统一由后端将添加日期重置为当天，旧 BBD 清空，填写新的 BBD 时按新日期计算。
- 未验证：未执行 Playwright 或真实手机视觉核验；本次仅改变日期/提醒状态和编辑保存语义，没有调整页面布局或视觉资产。
- 下一步：在评审设备验证“列表数量加回”“编辑页改数并填写/不填写 BBD”“食谱完成到 0 后撤销”三条真实操作链路。

#### 追加修复记录

- 状态：待评审。
- 目标：修复数量改动时重新填写与旧值相同的 BBD 会被误清空的问题，并统一冰箱端数量归零为软删除记录。
- 范围：库存更新请求的数量编辑意图、冰箱端数量调整/恢复接口、前端设备撤销状态、回归测试和相关功能文档；不改变用户主动删除物品的硬删除语义。
- 设计/需求基线：本次代码审查结论及用户明确修复要求；P5/P9 数量为 0 软删除规则；现有冰箱端“已更新 · 撤销”流程。
- 完成：数量改动请求新增明确的 BBD 编辑意图；用户重新填写与旧值相同的 BBD 时不再误清空，未填写新 BBD 时仍会清空旧值。冰箱端归零改为保留软删除批次，设备库存快照隐藏零数量记录，撤销通过原批次 ID 恢复数量与日期；旧版无批次 ID 的恢复请求仍兼容创建新批次。
- 验证：`uv run ruff check backend`、`uv run pytest`（85 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（66 passed）、`npm run --prefix frontend build`、`uv lock --check`、`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机/冰箱视觉核验；本次未调整布局和视觉资产。
- 下一步：在评审设备验证冰箱端“全部拿走—撤销”、同日期 BBD 重新填写、清空 BBD 和手机端零数量恢复四条链路。

### 2026-08-06 — P9 食谱食材使用冰箱库存图标（本次会话）

- 状态：待评审。
- 目标：食谱食材前的图标直接复用当前冰箱库存中同名食材批次的 `icon_key`，不再用食材名称直接匹配图标库分类标签。
- 范围：前端食谱图标查找、食谱页库存数据传递、图标回归测试和本进度记录；不改变食谱名称匹配、库存扣减、分类选择或库存图标保存语义。
- 设计/需求基线：用户本次明确反馈；现有 `InventoryBatch.item_name`/`icon_key` 数据结构、P5 物品列表图标显示和 P9 食谱食材列表。
- 完成：食谱页按当前冰箱库存的 `item_name → icon_key` 关系显示食材图标；名称与分类标签不一致时仍能显示库存实际使用的图标；无匹配库存或无图标时保持无图标状态。
- 验证：新增“库存食材名称与分类名称不同仍显示库存图标”回归测试；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机视觉核验；未在真实设备上抽样确认自定义 PNG 图标的食谱列表显示。
- 下一步：评审设备上准备库存名称与分类名称不同的物品（例如“土鸡蛋”/“鸡蛋”），打开食谱确认前置图标与物品列表一致。

### 2026-08-06 — P5/P7 物品多选批量移动（本次会话）

- 状态：待评审。
- 目标：支持在统一物品列表中勾选多条物品，选择目标冰箱和目标位置后批量移动；保留单选列表的原有编辑/数量调整语义，并按需求更新位置确认文案和多选摘要。
- 范围：前端物品列表多选状态、底部取消/移动操作区、目标冰箱列表、确认位置流程、多选摘要、后端跨冰箱批量移动接口及回归测试；不改变删除、编辑、数量防抖和食谱扣减规则。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md`；现有 P5 `InventoryFlow` 的“确认位置”流程；`docs/final-ui-designs.md` 的确认位置设计稿及对应本地 PNG/HTML。
- 完成：物品列表分类图标支持多选，底部操作区切换为“取消/移动”；新增目标冰箱选择和“确认位置”流程，多选摘要按第一项名称截断且不显示数量；新增所有者批量移动接口并校验批次、目标冰箱、目标位置权限；同步功能规则与 UI 风格规范。
- 验证：前端全量 `npm run --prefix frontend test -- --run`（4 个测试文件、65 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`；后端全量 `uv run pytest`（84 passed）、`uv run ruff check backend`；`git diff --check` 均通过。
- 未验证：未执行 Playwright/真实手机视觉核验；未覆盖极窄屏长名称的人工体验。
- 下一步：运行全量门禁后，在 320/390/430px 设备上验收图标选择、目标冰箱弹出层、确认位置摘要和跨冰箱移动结果。

#### 追加需求记录

- 目标：在“选择目标冰箱”弹出框中标记当前冰箱。
- 范围：目标冰箱列表的当前项线框对勾、对应回归测试和 UI 规范说明；不改变目标冰箱选择与移动逻辑。
- 设计基线：用户本次补充要求；`docs/ui-design-specification.md` §8.3 顶部栏菜单的对勾位置规则。
- 完成：目标冰箱列表左侧固定保留 24px 对勾位，仅当前冰箱显示线框对勾，冰箱名称和右箭头位置不跳动。
- 验证：`npm run --prefix frontend test -- --run`（4 个测试文件、66 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。

### 2026-08-06 — 安卓安全区域右滑返回（本次会话）

- 状态：待评审。
- 目标：修复 Android 设备上左边缘右滑可能触发系统/浏览器关闭手势的问题，将页面快速返回手势移到不与系统边缘手势竞争的屏幕内缩区域。
- 范围：共享页面返回手势的起始区域、边缘手势冲突边界与前端回归测试；不改变返回按钮、返回目标和其他页面交互。
- 设计/需求基线：用户本次真实 Android 测试反馈；现有 `PageHeader` 页面级触摸监听；Android 系统手势区域由系统/浏览器保留，网页不能声明原生手势排除矩形。
- 完成：将手势起点从屏幕最左侧系统边缘区域移至横坐标 56–128px 的安全区域；只有向右至少 72px 且横向为主时触发返回，系统边缘区域、过深内容区域、纵向滚动和反向滑动均不触发。
- 验证：新增安全区域起点、系统边缘区域和过深内容区域回归测试；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run`（4 个测试文件、63 passed）通过；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：真实 Android 设备在不同系统导航模式、浏览器和 PWA 安装状态下的人工触摸体验。
- 下一步：在真实 Android/PWA 的带返回按钮页面抽样确认从约 56–128px 位置快速右滑可返回，确认贴近屏幕边缘滑动不会关闭浏览器。

### 2026-08-05 — 发布当前最新版（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的最新提交发布到生产服务器，自动生成 release 号，完成发布前数据库备份、容器重建、迁移和健康检查。
- 范围：执行 `scripts/deploy-image.sh` 当前默认发布流程；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不修改生产业务数据。
- 设计/需求基线：用户本次明确发布要求；README 单容器发布流程；`scripts/deploy-image.sh` 的 SQLite 在线备份、自动 release 注入和健康检查约定。
- 预期验证：发布脚本源码归档校验、服务器数据库备份、容器 `healthy`、Alembic 迁移状态和公网 `/healthz` 检查。
- 发布尝试：改用 `107.174.152.245` 连接成功；首次构建因服务器残留 12 个 macOS `._*.py` 元数据迁移文件启动失败，已删除这些精确匹配的服务器残留文件，并在发布脚本中禁用传输归档的 macOS 文件元数据；随后重新发布成功。
- 发布：release `260805235837`；生产数据库备份为 `/data/fridgeboard.db.backup-20260805-155523`；不覆盖生产 `.env` 和数据卷。
- 验证：容器状态 `healthy`；容器内 Alembic 为 `20260805_12 (head)`；release `260805235837` 已进入前端静态产物；服务器迁移目录无 `._*.py` 残留；SQLite `PRAGMA integrity_check` 为 `ok`、外键检查为空；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；`git diff --check` 通过。
- 未验证：真实 iOS/Android PWA 的人工刷新和关于页面 release 展示。
- 下一步：在真实设备刷新 PWA，确认新功能和关于页面显示 release `260805235837`。

### 2026-08-05 — 共享页面左边缘右滑返回（本次会话）

- 状态：待评审。
- 目标：为所有带左上角返回按钮的手机端页面增加从左侧屏幕边缘向右滑触发返回的手势。
- 范围：共享 `PageHeader` 的边缘滑动识别、与滚动/表单触摸操作的冲突边界、前端回归测试和本进度记录；不改变已有返回按钮、首页主导航或业务返回目标。
- 设计/需求基线：用户本次明确反馈；现有 `PageHeader` 共享顶部栏与各页面传入的 `onBack` 返回行为；`docs/ui-design-specification.md` 页面导航栏规范。
- 完成：在共享 `PageHeader` 中安装页面级左边缘右滑返回；从 28px 内开始、向右至少 72px 且横向为主时触发对应 `onBack`；按钮、链接、输入控件和多指/纵向滚动触摸不触发；保留原有返回按钮和返回目标。
- 验证：新增左边缘、内容区域、向左滑和纵向滚动边界测试；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test -- --run`（4 个测试文件、63 passed）通过；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：真实 iOS/Android 设备及不同浏览器内核的触摸体验；本次未执行 Playwright 视觉核验，因为未修改布局、样式或页面视觉资产。
- 下一步：在真实手机/PWA 的任一带返回按钮页面上抽样验证左边缘右滑、纵向滚动、输入框操作和返回按钮点击；确认后可将本条标记为完成。

### 2026-08-05 — P9 食谱按库存食材名称匹配（本次会话）

- 状态：待评审。
- 目标：让食谱食材文本与当前冰箱库存批次的食材名称严格匹配，不再按物品分类匹配；动态缺货、完成扣减和撤销恢复统一使用该名称语义。
- 范围：食谱领域匹配键、食谱服务缺货/完成/撤销链路、相关接口与领域回归测试、功能规则和本进度记录；不改变库存分类、位置、数量或已有消费审计结构。
- 设计/需求基线：用户本次明确反馈；现有 `RecipeService` 食谱解析与 `InventoryBatchModel.item_name` 库存字段；P9 食谱完成与动态补货规则。
- 完成：食谱缺货计算、完成扣减和撤销恢复统一改为按库存批次 `item_name` 严格匹配；分类 ID 不再参与新食谱匹配，保留旧字段以兼容历史数据；更新界面提示、API 文档和功能规则。
- 验证：新增“同分类不同食材不得匹配”回归测试；`uv run ruff check backend`；`uv run pytest -q`（83 passed）；`npm run --prefix frontend lint`；`npm run --prefix frontend test -- --run`（61 passed）；`npm run --prefix frontend build`；`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机视觉核验；未在真实设备上抽样验证历史食谱和自定义库存名称的人工操作。
- 下一步：评审设备上用库存名称“鸡蛋”创建食谱，确认会扣减“鸡蛋”而不会扣减同分类的“鹌鹑蛋”；再验证名称不一致时显示缺货。

### 2026-08-05 — P9 食谱完成联动冰箱库存（本次会话）

- 状态：待评审。
- 目标：完成食谱时按食材需求扣减当前冰箱库存，数量减为 0 时保留库存记录；再次点击完成状态时恢复本次实际扣减的数量，并让首页/物品列表立即看到最新库存。
- 范围：P9 食谱完成/撤销后的手机端库存工作区同步、已有后端扣减与恢复契约的回归覆盖、功能规则和本进度记录；不改变严格小类匹配、最早 BBD 扣减和库存手工编辑语义。
- 设计/需求基线：用户本次明确要求；`docs/functional-design-and-feasibility.md` §9.4；现有 `RecipeService.complete/undo`、`complete_recipe` 领域规则和 P5 零数量库存规则。
- 完成：食谱完成/撤销后刷新当前冰箱库存工作区，首页预览、物品列表和本地工作区缓存立即反映扣减/恢复；数量减为 0 的批次不删除，撤销时恢复本次实际扣减数量；补充接口回归断言并同步功能规则。
- 验证：`uv run pytest backend/tests/test_recipe_api.py backend/tests/test_inventory_rules.py -q`（21 passed）；`uv run pytest -q`（82 passed）；`uv run ruff check backend`；`npm run --prefix frontend test -- --run`（61 passed）；`npm run --prefix frontend lint`；`npm run --prefix frontend build`；`git diff --check` 均通过。
- 未验证：未执行 Playwright 或真实手机视觉核验；未在真实设备上人工确认食谱完成后切换首页/物品列表的即时显示。
- 下一步：评审设备上完成一条已匹配食材的食谱，确认库存扣减到 0 仍保留；再次点击撤销，确认库存恢复且首页图标重新出现。

### 2026-08-05 — P9 本周食谱按今天起始排列（本次会话）

- 状态：待评审。
- 目标：本周食谱列表从今天开始显示，今天之后的日期顺序保持不变，今天之前的日期依次移到列表末尾；下周列表继续按周一至周日显示。
- 范围：前端每周食谱列表展示顺序、日期排列工具函数及回归测试；不改变食谱接口返回顺序、食谱保存/完成语义、下周列表和历史详情顺序。
- 设计/需求基线：用户本次明确要求；P9 功能规则 `docs/functional-design-and-feasibility.md` §9；最终设计稿 `pwa-weekly-recipes`（`b2e77ba8-52dd-4722-8e89-accdf9f3569f`）及本地 UI 资产；`docs/ui-design-specification.md`。
- 完成：新增本地日期排列工具；“本周”按今天、未来日期、过去日期排列，“下周”保持周一至周日；补充周三和周日边界回归测试。
- 验证：目标日期测试 5 passed；前端全量测试 4 个测试文件、61 passed；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright/真实手机视觉核验；未覆盖系统字体放大和设备旋转下的人工表现，按本次任务范围不改变布局样式。
- 下一步：评审设备刷新“每周食谱”，确认本周第一行随当天变化，切换下周仍从周一开始。

### 2026-08-05 — P5/P7 统一物品列表布局与库存筛选（本次会话）

- 状态：待评审。
- 目标：让首页全局搜索的“搜索物品”结果页、首页物品入口和冰箱格位物品列表复用同一页面布局；在物品行中将数量控件下移，并在上方显示可跳转的冰箱名称与右箭头；增加按添加时间和有效期的筛选菜单。
- 范围：前端库存列表/全冰箱搜索结果布局、跨冰箱结果的冰箱跳转、筛选状态与排序工具、相关前端回归测试及进度/功能文档；不新增后端接口，不改变库存编辑和数量保存语义。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md`；现有 P5 物品列表实现；P7 首页搜索规则；`docs/final-ui-designs.md` 中 P5 添加/编辑物品与 P7 首页设计资产。
- 完成：搜索物品页改为复用 `InventoryList`；普通列表和跨冰箱搜索结果统一为“冰箱名称/右箭头 → 物品信息 → 数量加减框”的行布局；标题栏新增 SVG 筛选按钮和三种排序；搜索结果数量修改按所属冰箱保存；同步功能规则与回归测试。
- 验证：`npm run --prefix frontend test -- --run`（4 个测试文件、57 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行 Playwright/真实手机视觉核验；未验证极窄屏、系统字体放大、长冰箱名称和多冰箱大量结果下拉菜单的人工表现。
- 本次修正完成：按评审反馈保留左侧物品名称、类别、添加天数、有效期和备注的原位置与样式；仅将右侧冰箱名称/箭头置于数量框上方，并恢复原物品行高度。
- 本次调整：筛选菜单改为复用“每周食谱”页面右上角弹出菜单的视觉样式，不再使用独立黑框下拉样式。
- 本次调整完成：筛选按钮和弹出选项已按 `RecipeWorkspace` 的 `p9-header-menu` / `p9-menu` 视觉基线对齐；修正后前端测试 57 passed、Lint、生产构建和 `git diff --check` 均通过。
- 文档同步完成：`docs/ui-design-specification.md` 新增 §8.3“顶部栏弹出菜单”，固化按钮热区、菜单宽度、边框圆角、图标、菜单项、无障碍语义和关闭行为；功能规则同步引用该规范。
- 验证补充：修正后 `npm run --prefix frontend test -- --run`（57 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 下一步：在评审设备重新确认三条入口的原左侧信息布局、右侧上下排列和整行高度。

#### 2026-08-06 会话补充

- 状态：待评审。
- 目标：保存用户最近选择的物品排序方案；再次打开任一物品列表时沿用该方案，并在弹出菜单当前项右侧显示对勾。
- 范围：前端物品列表排序状态、本地存储键、筛选菜单当前项标记、相关测试和功能/UI 文档；不改变排序规则、库存数据或后端接口。
- 完成：新增全局 `fb-inventory-sort-key` 本地存储；首次无偏好时默认“最近添加”，选择后所有物品列表沿用该方案；当前菜单项右侧显示对勾并保留固定空位；同步 UI 规范 §8.3、功能规则和回归测试。
- 验证：`npm run --prefix frontend test -- --run`（4 个测试文件、64 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未进行真实手机/PWA 重启后的本地存储和菜单视觉人工验收。

### 2026-08-05 — P6 Android PWA 相机权限回归排查（本次会话）

- 状态：待评审。
- 目标：排查 Android 手机安装 PWA 后打开“识别物品”页面无法打开相机、未出现权限请求且提示相机权限未开启的问题，恢复第一版拍照识别的可用链路。
- 范围：前端相机调用、Android/PWA 兼容性、权限/安全上下文错误分类、相机流生命周期和回归测试；不改变识图/扫码接口及识别结果业务规则。
- 设计/需求基线：用户本次反馈；P6 功能规则 `docs/functional-design-and-feasibility.md` §6；历史可用实现及提交 `c75239f^`、当前相机重构 `273c461`。
- 完成：首次相机请求恢复为仅指定后置摄像头意图，移除高分辨率和对焦能力等 Android 设备约束；视频元数据短暂未就绪不再把已获得媒体流误判为相机启动失败；相机错误文案区分 HTTPS、浏览器能力、权限拒绝、无摄像头、占用和约束失败；新增相机约束与错误分类回归测试。
- 验证：`npm run --prefix frontend test -- --run`（4 个测试文件、54 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 Android 手机/已安装 PWA 的权限弹窗、系统设置权限状态和摄像头取景画面；若系统权限已被拒绝，浏览器不会再次弹框，需先在 Android 应用信息或浏览器站点权限中允许相机。
- 下一步：在 HTTPS 生产 PWA 刷新应用缓存后，分别验证首次授权、已允许权限、系统拒绝权限和相机被占用四种状态；确认取景画面可见后再将 P6 本条记录标记完成。

### 2026-08-05 — P11 发布最近分类一次性回填修复（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将最近分类一次性数据库回填、创建时初始化和只读读取修复发布到生产服务器。
- 范围：发布当前 `HEAD` `d5e7263`；执行发布前数据库备份、容器重建、Alembic 前向迁移和公网健康检查；不修改生产 `.env`、数据卷，不执行 Git 提交或危险回滚。
- 设计/需求基线：本次 P5 分类回填修复；README 单容器发布流程；SQLite 在线备份和 Alembic 前向迁移约定。
- 发布：当前 `HEAD` `d5e7263` 已同步并重建生产容器；首次重建因服务器 Docker 缓存中的 macOS `._*.py` Alembic 元数据导致启动失败，已清理服务器迁移目录中的精确匹配垃圾文件并执行一次无缓存重建。
- 验证：生产备份 `/data/fridgeboard.db.backup-20260804-182150` 已存在；容器状态 `healthy`；容器内 Alembic 为 `20260805_12 (head)`；生产 5 台活跃冰箱均有 16 个唯一图标记录；SQLite `PRAGMA integrity_check` 为 `ok`、外键检查为 0；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；首页 HTTP 200。
- 未验证：未在真实手机/PWA 中人工确认 2×8 分类视觉布局；首次失败重建遗留的旧 Docker 镜像仍由 Docker 保留，未执行镜像清理。
- 下一步：在真实设备刷新 PWA，打开已有冰箱的添加物品页确认 16 个图标全部显示。

### 2026-08-05 — 关于页面显示发布 release 号（本次会话）

- 状态：待评审。
- 目标：关于页面显示发布时生成的 `yymmddhhMMss` release 号，并将每次发布自动生成 release 号的规则固化到项目开发约定。
- 范围：前端关于页面的 release 展示、源码发布脚本的 release 注入、`AGENTS.md` 发布规则、发布文档和前端回归测试；不改变现有语义版本号、生产数据或发布目标。
- 设计/需求基线：用户本次明确要求；现有 `frontend/package.json` 版本读取逻辑、`scripts/deploy-image.sh` 单容器发布流程和关于页面实现。
- 完成：关于页面在保留语义版本号的同时显示 release 号；正式发布脚本在临时归档中生成 `yymmddhhMMss` release 并注入前端；`AGENTS.md` 和 README 已补充发布规则与说明。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（51 passed）、`npm run --prefix frontend build`、`bash -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、release 格式检查和 `git diff --check` 均通过。
- 未验证：真实生产发布及设备端关于页面人工验收。
- 下一步：用户执行正式发布后，在设备端打开“关于与帮助”确认 release 号。

### 2026-08-05 — P6 免费条码商品查询接入（本次会话）

- 状态：待评审。
- 目标：首次扫码时通过无需账号/API Key 的公开商品数据库查询商品信息，不再依赖当前冰箱历史条码；查询不到时保留条码并回到手动填写。
- 范围：Open Food Facts、Open Products Facts 服务端查询适配器、所有者条码查询接口、前端扫码填充链路及回归测试；不接入需要付费或商业 API Key 的服务。
- 设计/需求基线：用户关于中国商品免费扫码查询的明确需求；Open Food Facts/Open Products Facts 官方 API 约定；现有 P6 扫码后进入添加物品页的交互。
- 完成：新增服务端免费查询适配器，依次调用 Open Food Facts 与 Open Products Facts；新增无需历史库存的所有者条码查询接口；前端扫码改为调用新接口，成功时填充商品名称/品牌/规格，未收录或网络失败时保留条码并进入手动填写。
- 验证：`uv run ruff check backend`、`uv run pytest`（78 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（51 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；已用公开条码验证 Open Food Facts 返回结构。
- 未验证：真实中国食品、日用品的覆盖率和手机端联网请求耗时；Open Products Facts 对中国非食品的收录仍需实际条码抽样确认。
- 下一步：用户在真实设备扫码抽样验收；如需更高的中国商品覆盖，再评估商业 API Key 服务，不把其作为免费基础功能依赖。

### 2026-08-05 — P6 条码查询审查问题修复（本次会话）

- 状态：待评审。
- 目标：修复代码审查发现的二维码未分类、查询超时过短、外部商品名可能超过库存字段限制等问题，并同步 P6 功能文档。
- 范围：二维码文本的大模型解析接口、免费商品库查询超时、商品名称自动截断、前端扫码分流、识别文档和回归测试；不改变现有图片识别和订单截图流程。
- 设计/需求基线：本次代码审查结论及用户明确修复要求；现有 Agnes OpenAI-compatible 多模态识别适配器；`docs/functional-design-and-feasibility.md` §6。
- 完成：二维条码/二维码格式改为调用独立二维码文本解析接口，由 Agnes 大模型判断商品、网址或普通文本；一维条码继续查询免费商品库；商品库单个供应商超时改为 30 秒；外部商品名自动截断至 160 字符；功能文档同步补充二维码分流规则。
- 验证：`uv run ruff check backend`、`uv run pytest`（82 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（51 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；新增二维码接口、30 秒超时和商品名截断回归测试。
- 未验证：真实 Agnes 二维码文本解析准确率、真实 iOS/Android 摄像头识别和外部 API 长等待期间的设备体验。
- 下一步：在真实设备分别测试商品二维码、网址二维码和普通一维条码；确认 Agnes 环境变量已配置后再验收二维码商品自动填充。

### 2026-08-05 — P5 首次打开补齐最近分类（本次会话）

- 状态：完成。
- 目标：添加物品页首次打开某台冰箱时，最近分类区域始终补齐 2×8 共 16 个图标；已有冰箱也通过最近分类接口兼容补齐。
- 范围：最近小类服务端回退/补齐逻辑、默认目录顺序、分类接口回归测试、功能规则和本进度记录；保留真实最近添加记录的优先顺序，不改变库存保存和分类选择交互。
- 设计/需求基线：用户本次反馈；现有 P5 两行 8 列最近小类设计与 `docs/functional-design-and-feasibility.md` §2.1。
- 完成：新增 `20260805_12` Alembic 迁移，为已有冰箱一次性回填缺少的 16 项并用 `is_bootstrap` 标记；新建冰箱在创建事务中初始化前 16 个；最近分类读取接口改为纯只读，真实新增分类仍会更新为最新顺序；移除旧的 14 项默认目录字段。
- 验证：迁移回填/降级、创建初始化和读取不写入均有回归覆盖；`uv run pytest backend/tests/test_item_catalog_api.py backend/tests/test_item_catalog_migration.py -q`（17 passed）、`uv run pytest`、`uv run ruff check backend`、`uv lock --check`、`git diff --check` 均通过。
- 未验证：未进行真实手机/PWA 视觉核验；本次未修改前端代码，需在设备上确认现有 2×8 网格实际显示无空位。
- 下一步：在 P5 综合验收时刷新已有冰箱并确认最近分类区域显示完整 16 项。

### 2026-08-05 — P5 物品列表日期与备注信息布局（本次会话）

- 状态：完成。
- 目标：将物品列表中的“生产/添加日期”改为相对天数文案；有保质期时紧跟显示剩余天数；备注独占下一行显示。
- 范围：前端 P5 物品列表信息展示、日期文案工具函数及回归测试；同步功能规则和本进度记录，不改变库存字段、保存接口和编辑流程。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；P5 添加/编辑物品本地设计资产 `docs/ui-assets/png/pwa-add-food.png`、`docs/ui-assets/html/pwa-add-food.html`、`docs/ui-assets/png/pwa-edit-food.png`、`docs/ui-assets/html/pwa-edit-food.html`。
- 完成：物品列表按自然日显示“已添加 n 天”；有 BBD 时在同一行紧跟“还有 m 天”；备注/商品描述另起一行，无日期或无备注时不产生多余占位行；新增日期文案工具函数并补充有/无 BBD、备注和边界日期回归测试。
- 验证：`npm run --prefix frontend test -- --run`（3 个测试文件、51 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未进行 Playwright 或真实设备视觉核验；未专项验证系统字体放大、320px 窄屏及旋转状态下的长备注截断表现。
- 下一步：P5 综合验收时在真实设备确认日期首行与备注次行的视觉间距及长文本表现。

### 2026-08-04 — Agnes 识别模型切换与失败原因审查（本次会话）

- 状态：待评审。
- 目标：审查 Agnes 识别适配器导致请求失败或结果解析失败的原因，并将识别模型切换为 `agnes-2.5-flash`。
- 范围：`backend/fridgeboard/recognition.py`、Agnes 配置默认值、识别适配器回归测试及本次验证记录；不更换 API token、不修改图像生成模型、不部署生产容器。
- 设计/需求基线：用户本次反馈；服务器上对 `agnes-2.5-flash` 与 `agnes-2.0-flash` 的 curl 结果；现有 P6 Agnes 多模态识别契约。
- 完成：识别适配器默认模型切换为 `agnes-2.5-flash`；请求增加 `max_tokens=1024`，避免推理输出无界导致响应内容被截断；请求超时从 20 秒提高到 60 秒；Compose、环境示例和功能可行性文档同步更新；新增请求契约回归测试。
- 验证：服务器宿主机 curl 对 `agnes-2.5-flash` 和 `agnes-2.0-flash` 均返回 HTTP 200；`uv run ruff check backend`、`uv run pytest`（76 passed）、`uv lock --check`、`git diff --check` 均通过。
- 未验证：未部署新代码，生产容器当前仍使用既有环境变量中的 `agnes-2.0-flash`；未进行真实包装图片的人工作业验收。
- 下一步：用户确认后执行生产发布，并在 PWA 中用真实包装图片完成一次识别验收。

### 2026-08-04 — 配置 VS Code F5 前后端双端调试（本次会话）

- 状态：完成。
- 目标：配置 VS Code 按 F5 启动前端 7001 端口和后端 7002 端口，便于本地联合调试。
- 范围：仅新增或调整 `.vscode` 调试/任务配置及本进度记录；复用项目现有前后端启动命令，不改变应用业务代码和生产配置。
- 设计/需求基线：用户本次明确要求；现有 `frontend/package.json`、`frontend/vite.config.ts`、后端 FastAPI/Uvicorn 启动方式。
- 完成：保留原有数据库迁移、`.env` 和 Chrome 调试入口；前端 Vite 固定监听 `0.0.0.0:7001`，后端 Uvicorn 监听 `0.0.0.0:7002`，Vite `/api` 代理同步指向 7002；F5 联合配置会同时启动浏览器前端和后端调试。
- 验证：`.vscode/launch.json`、`.vscode/tasks.json` JSON 解析通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；此前 6000/6001 端口的本机服务和代理已验证，7000/7001 配置已完成静态检查。
- 未验证：未实际按 F5 启动长期开发进程；需要本机已安装 VS Code Python/Debugpy 与 Chrome 调试支持。
- 下一步：在 VS Code 选择“F5：前后端联合调试”按 F5，确认本机访问 `http://127.0.0.1:7001`，局域网设备通过 `http://电脑局域网IP:7001` 访问。

#### 端口修正

- 原因：浏览器将 `6000` 视为不安全端口并拦截，出现 `ERR_UNSAFE_PORT`。
- 调整：前端先改为 `0.0.0.0:7000`，后因端口占用短暂改为 3000，最终按用户要求改为相邻的 `0.0.0.0:7001`；后端改为 `0.0.0.0:7002`，Vite `/api` 代理改为 `127.0.0.1:7002`。
- 检查：`4000` 被 PID 637 的 Python 进程占用；`3000`、`2000` 空闲；`9000` 空闲但不选用以避免浏览器端口安全策略。

### 2026-08-04 — P7 首页过期提示点击无响应修复（本次会话）

- 状态：待评审。
- 目标：修复首页右上角 `p7-danger` 通知数量提示显示但点击无动作的问题。
- 范围：仅首页通知提示的数量来源、弹窗交互语义、无障碍标签和前端回归验证；不跳转库存列表，不新增后端接口。
- 设计/需求基线：用户本次反馈；现有 P7 首页实现、P5 物品列表入口和 `docs/ui-design-specification.md`。
- 状态修正：第一次修复曾将 `p7-danger` 错误绑定到“全部物品”入口，已在本次修正中撤回该语义。
- 完成内容：`p7-danger` 现在使用待处理 `DueNotification[]` 的数量，点击打开首页通知弹窗；同一条通知不再重复渲染另一个叹号入口，库存列表入口保持独立。
- 验证证据：`npm run --prefix frontend test -- --run`（3 个测试文件、49 个测试通过）；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：未进行 Playwright 或真实设备视觉核验；通知接口未返回通知时未模拟真实提醒数据做手动点击验收。
- 下一步：请用户刷新首页并点击 `! 1`，确认弹窗显示食品过期等通知内容。

### 2026-08-04 — P11 修复库存删除与食谱消费审计外键冲突（本次会话）

- 状态：完成。
- 目标：修复生产环境库存批次被已撤销食谱消费审计引用时无法删除并返回 500 的问题。
- 范围：库存删除服务、消费审计引用清理、接口回归测试、生产发布与对应文档；不直接修改生产数据库，除非另行确认数据修复。
- 设计/需求基线：本次生产日志与数据库排查结果；`InventoryService.delete_batch`、`RecipeService.undo`、`consumption_lines.inventory_batch_id` 外键约束及单容器 SQLite 事务约定。
- 完成：`InventoryService.delete_batch` 在删除批次前清理 `consumption_lines` 对应引用；新增食谱完成、撤销后删除库存批次的接口回归覆盖。
- 验证：相关回归测试通过；`uv run ruff check backend`、`uv run pytest`（74 passed）、`uv lock --check`、`git diff --check` 通过；生产数据库备份为 `/data/fridgeboard.db.backup-20260804-024014`；容器重建后为 `healthy`；Alembic 为 `20260802_11 (head)`；生产 `PRAGMA foreign_key_check` 返回空；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未直接删除用户生产中的“豆角”记录，避免未经确认的业务数据删除；需用户在页面重试该删除操作完成真实接口验收。

### 2026-08-04 — P11 再次发布当前最新代码（本次会话）

- 状态：待评审。
- 目标：将 `main` 最新提交 `c75239f` 发布到生产环境，完成数据库备份、容器重建、迁移和公网健康检查。
- 范围：仅发布已提交源码归档；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不执行危险回滚。
- 设计/需求基线：用户本次再次发布要求；README 单容器源码发布流程；SQLite 前向兼容迁移和发布前备份约定。
- 发布：服务器在重建前创建 `/data/fridgeboard.db.backup-20260804-121928`；源码归档校验通过（43 个内置图标资产）；服务器完成镜像构建、`fridgeboard-app` 容器重建和启动。
- 验证：发布脚本 dry-run 通过；生产容器为 `healthy`；容器内 Alembic 为 `20260802_11 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；首页 HTTP 200 且包含“家常食橱”。
- 未验证：真实 iOS/Android PWA 与冰箱端的人工刷新、数量修改和缓存更新验收仍待 P11 综合验收。
- 下一步：在真实设备上刷新 PWA，确认物品数量编辑及相关页面缓存更新后再完成 P11 验收。

### 2026-08-04 — P5 物品列表行内信息与数量延迟保存（本次会话）

- 状态：完成。
- 目标：优化物品列表的信息密度和日常编辑效率；分类紧跟名称显示，数量移动到每行末尾并支持直接输入及 +/- 调整，数量变化停止 1 秒后再保存。
- 范围：前端物品列表行布局、数量本地草稿与 1 秒防抖保存、保质期剩余天数/生产日期/可选品牌备注展示；后端新增或编辑物品时未填写生产日期自动使用当前日期；不改变分类、位置、删除和完整编辑流程。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md`；功能设计 §3.5、§7；P5 添加物品稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`、编辑物品稿 `7224e71b-8055-40ec-a9a9-db68b6744764` 及本地 HTML/PNG 资产。
- 预期验证：前端列表组件/保存回归测试，后端生产日期默认值测试；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`、`git diff --check`。
- 完成：列表分类已并入名称同行；数量位于每行最右侧，支持直接输入和 +/- 调整，并按物品在最后一次变更后延迟 1 秒排队保存；保质期显示剩余天数（无 BBD 隐藏），生产/添加日期显示，空品牌/备注不再显示占位文案；新增和编辑保存缺失生产日期时自动使用当天，旧数据读取时用创建日期补齐展示。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（48 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（74 passed）、`git diff --check` 均通过；新增列表信息布局/有效期文案断言和后端默认生产日期断言。用户已实际测试列表展示、数量编辑和保存，确认无问题。
- 未验证：未进行 Playwright 视觉核验；未覆盖不同系统字体放大和设备旋转下的专项视觉回归。
- 下一步：随 P5 综合验收保留本条记录，后续若列表字段或保存策略变更需同步更新本节和功能规则。

### 2026-08-04 — P5 修正物品列表数量控件与右箭头位置（本次会话）

- 状态：完成。
- 目标：让物品列表数量输入复用“添加物品”页的数字输入框和上下箭头组合，并确保每行右箭头固定在整行最右侧。
- 范围：仅调整物品列表 JSX/CSS 的数量控件和行列布局；不改变数量防抖保存、列表筛选、编辑入口或后端接口。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；P5 添加物品稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`、编辑物品稿 `7224e71b-8055-40ec-a9a9-db68b6744764` 及本地 HTML/PNG 资产。
- 预期验证：前端 lint、测试、生产构建、`git diff --check`；确认数量控件使用上下箭头且右箭头位于行末。
- 完成：列表数量控件改为添加物品页同款的上箭头、数字输入、下箭头组合；编辑右箭头拆为独立的行末列，不再位于数量控件左侧；数量保存和编辑入口语义保持不变。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（48 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；用户已实际测试数量上下箭头和最右侧编辑箭头，确认无问题。
- 未验证：未进行 Playwright 视觉核验；未覆盖不同系统字体放大和设备旋转下的专项视觉回归。
- 下一步：随 P5 综合验收保留本条记录，后续若列表行布局变更需同步更新本节。

### 2026-08-04 — P5 物品列表保留零数量项目（本次会话）

- 状态：完成。
- 目标：允许物品列表将数量调整为 0 并保留记录；零数量项目名称显示中划线并统一排到列表末尾，加回正数后恢复正常显示并回到非零项目区域。
- 范围：物品列表数量输入、零数量排序与状态样式、所有者库存编辑接口数量下限及回归测试；不改变“编辑物品”删除按钮、冰箱端拿走到 0 的删除语义或数量防抖机制。
- 设计/需求基线：用户本次明确反馈；现有物品列表交互、P5 添加/编辑物品设计资产和库存批次接口。
- 预期验证：前端列表排序/状态断言、后端数量为 0 的保存回归测试；前端 lint、测试、生产构建，后端 Ruff、pytest、`git diff --check`。
- 完成：列表允许数量输入/下调到 0；0 数量项目保留、名称加中划线并排到所有非零项目之后；从 0 加回正数时立即移除中划线并回到非零项目区域。所有者更新接口允许 0，新增物品仍要求至少 1；编辑页打开零数量物品后保存不会强制恢复为 1。
- 验证：前端 lint、测试（49 passed）、生产构建、后端 Ruff、pytest（74 passed）、`git diff --check` 均通过；新增零数量 API、列表中划线和排序断言。用户已实际测试数量归零、加回和列表重排，确认无问题。
- 未验证：未进行 Playwright 视觉核验；未覆盖不同系统字体放大和设备旋转下的专项视觉回归。
- 下一步：随 P5 综合验收保留本条记录，后续若数量或删除语义变更需同步更新本节和功能规则。

### 2026-08-04 — P5 首页隐藏零数量图标与列表数量控件横向化（本次会话）

- 状态：待评审。
- 目标：数量为 0 的物品不在首页冰箱预览显示图标；物品列表数量控件改为横向 `[- 数字 +]`，移除行末右箭头。
- 范围：首页 P7 冰箱预览库存图标过滤、P5 物品列表数量控件和行布局；不改变零数量项目保留、末尾排序、中划线、数量防抖保存或编辑入口语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；现有 P5/P7 页面实现和本地 UI 资产。
- 完成内容：首页按分格仅渲染数量大于 0 的库存图标；列表数量改为横向“− 数字 ＋”控件并移除行末右箭头；新增首页过滤和列表结构回归测试；功能规则同步记录 0 数量不显示首页图标。
- 验证证据：`npm run --prefix frontend test`（3 个测试文件、50 个测试通过）；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：未进行 Playwright 视觉核验；未覆盖不同系统字体放大、窄屏和设备旋转下的专项视觉回归。
- 下一步：数量控件尺寸问题已在下方会话修正，待用户进行页面视觉确认。

### 2026-08-04 — P5 数量控件外框尺寸修正（本次会话）

- 状态：待评审。
- 目标：修正物品列表数量控件外框过高、数字输入框溢出外框的问题。
- 范围：仅调整 P5 物品列表数量控件的 CSS 尺寸与网格布局；不改变数量编辑、保存防抖、零数量排序或首页图标过滤语义。
- 设计/需求基线：用户提供的实际页面截图；`docs/ui-design-specification.md`；现有横向 `[- 数字 +]` 控件实现。
- 完成内容：修正通用纵向数量控件样式覆盖列表样式的问题；列表控件固定为 106×34px，使用单行三列网格，输入框和加减按钮均保持在外框内。
- 验证证据：`npm run --prefix frontend test`（3 个测试文件、50 个测试通过）；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：未进行 Playwright 或真实设备视觉截图核验。
- 下一步：请用户刷新页面确认数量控件外框与输入框的实际视觉尺寸。

### 2026-08-04 — P7/P5 首页与物品列表库存读取分流（本次会话）

- 状态：待评审。
- 目标：将数量为 0 的首页过滤从纯前端判断改为后端接口参数控制，同时保证物品列表继续读取并恢复 0 数量记录；修正数量加减号居中。
- 范围：所有者库存读取接口、首页/物品列表/全冰箱搜索请求、工作区缓存中的首页与完整库存分流、数量按钮样式和接口回归测试；不改变 0 数量保留、列表排序、中划线或延迟保存语义。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；现有 P5/P7 库存读取链路。
- 完成内容：新增 `include_zero` 查询参数，默认保留 0 数量；首页和冰箱概览传 `false`，物品列表及全冰箱搜索传 `true`；工作区分别缓存完整库存和首页库存；加减号显式使用网格居中布局。
- 验证证据：`uv run ruff check backend` 通过；`uv run pytest`（74 passed）；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend test`（49 passed）；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：未进行 Playwright 或真实设备视觉截图核验。
- 下一步：列表加减按钮宽度覆盖问题已在下方会话修正，待用户视觉确认。

### 2026-08-04 — P5 修正加减按钮宽度溢出（本次会话）

- 状态：待评审。
- 目标：让物品列表数量控件中的加减按钮宽度与黑框内对应网格列一致，解决按钮超出黑框导致符号偏右的问题。
- 范围：仅调整 P5 数量控件 CSS 的最终覆盖规则；不改变库存接口、数量保存、零数量语义或首页库存读取分流。
- 设计/需求基线：用户本次明确反馈；现有 P5 横向 `[- 数字 +]` 控件和通用添加页数量控件规则。
- 完成内容：在通用数量按钮规则之后增加列表专用覆盖，按钮宽度改为 `100%`、最小宽度清零，使按钮严格填满黑框内的 30px 网格列。
- 验证证据：`npm run --prefix frontend test`（3 个测试文件、49 个测试通过）；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：未进行 Playwright 或真实设备视觉截图核验。
- 下一步：请用户刷新页面确认加减号已在黑框内居中。

### 2026-08-03 — P7/P9/P7.1 下拉刷新时移除标题重复动画（本次会话）

- 状态：待评审。
- 目标：移除首页、食谱和冰箱页面标题在下拉刷新期间显示的额外旋转动画，仅保留下拉刷新区域的刷新动画。
- 范围：前端共享 `HeaderTitle` 刷新状态展示、对应回归测试和本进度记录；不改变下拉刷新触发、数据刷新、刷新失败提示或其他页面动画。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；首页稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`、食谱稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及冰箱管理稿 `1bfa869c-6942-4c89-b275-83e9a02c04e1`。
- 预期验证：前端 lint、测试、生产构建、`git diff --check`；确认下拉刷新区域仍保留 spinner，标题不再渲染刷新 spinner，刷新失败提示仍可用。
- 完成：共享 `HeaderTitle` 在 `loading` 状态不再渲染标题 spinner；下拉刷新区域继续使用原有 spinner，刷新失败警告和错误弹窗保持不变；新增标题不渲染 spinner 的回归测试。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（46 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 触控下拉与设备级视觉表现；未进行 Playwright 视觉核验。
- 下一步：评审环境刷新首页、食谱和冰箱页面，确认下拉时仅显示内容区刷新动画。

### 2026-08-03 — P11 再次发布最新代码（本次会话）

- 状态：待评审。
- 目标：将当前 `main` 最新提交 `daec2bb` 再次发布到生产环境。
- 范围：仅发布当前 Git 提交源码归档；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不执行回滚。
- 发布：内置图标资产校验通过（43 个）；服务器重建前创建 `/data/fridgeboard.db.backup-20260803-060754`；完成镜像构建、`fridgeboard-app` 容器重建和启动。
- 验证：容器状态为 `healthy`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；发布流程完成。
- 未验证：真实 PWA、冰箱端和手机端人工回归仍待 P11 综合验收。

### 2026-08-03 — P1 应用启动数据库操作移入 FastAPI lifespan（本次会话）

- 状态：待评审。
- 现象：GitHub Actions 在导入 `fridgeboard.main` 进行测试收集时，`create_app()` 提前执行内置目录同步；CI 尚未初始化数据库表，导致 `food_categories` 不存在。
- 目标：让应用导入和 `create_app()` 只完成应用装配；在 FastAPI lifespan 启动阶段、开始接收请求前执行一次内置目录同步，保持生产入口负责 Alembic 结构迁移。
- 范围：后端应用生命周期、目录同步启动回归测试及 CI 失败路径文档；不改变 Alembic 迁移职责、目录内容或业务接口。
- 设计/需求基线：用户本次明确要求；FastAPI lifespan 启动约定；生产单进程/单容器 SQLite WAL 约束；现有 `ensure_builtin_catalog` 幂等同步实现。
- 预期验证：后端启动生命周期回归测试、`uv run ruff check backend`、`uv run pytest`、`git diff --check`。
- 根本原因：`create_app()` 在应用对象装配期间调用 `ensure_builtin_catalog()`，导致测试收集阶段导入 `fridgeboard.main` 时直接查询 `food_categories`；而 FastAPI `TestClient` 只有进入上下文才会执行 lifespan。
- 完成：移除 `create_app()` 内的目录同步，将同步放入 lifespan 的首个 `yield` 之前；生产入口仍先执行 Alembic，应用启动后再同步目录。新增未初始化 SQLite 的应用装配回归测试，并统一测试客户端进入/退出 lifespan。
- 验证：`uv run ruff check backend`、`uv run pytest`（74 passed）、`git diff --check` 均通过。
- 未验证：真实生产容器启动及数据库迁移后的人工部署验收。
- 下一步：提交并触发 GitHub Actions，确认 CI 在 Linux runner 上通过；保留真实生产发布前的容器启动验收。

### 2026-08-03 — P7 首页移除状态区分隔线并收紧预览间距（本次会话）

- 状态：待评审。
- 现象：首页“n 件物品”和搜索框下方的横线与冰箱预览之间留白偏大，视觉上割裂。
- 目标：移除首页状态区底部横线，并减少状态区与冰箱预览图之间的顶部间距。
- 范围：仅调整前端首页 P7 状态区和冰箱预览区样式；不修改搜索逻辑、库存数据、预览几何、点击行为或后端接口。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §5、§7、§9、§10；首页最终稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地首页 UI 资产。
- 预期验证：前端 lint、测试、生产构建、`git diff --check`。
- 完成：首页状态区移除底部横线；冰箱预览区顶部间距从 24px 收紧为 8px，未修改搜索逻辑、库存数据、预览几何和交互行为。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（45 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 的字体放大、触控和安全区表现；未进行 Playwright 视觉核验。
- 下一步：评审环境刷新首页，确认 320/390/430px 视口下分隔线已移除且预览间距符合预期。

### 2026-08-03 — P4 “名称与布局”页面紧凑化（本次会话）

- 状态：待评审。
- 现象：已有冰箱的“名称与布局”页面底部说明单独占行；页面底部和布局说明行上下留白偏大，内容密度低。
- 目标：将“已有冰箱不能更换外形”并入“选择外形”标题行，移除 `layout-caption` 上下留白，并适度收紧固定底部操作区预留空间。
- 范围：仅调整前端 P4 名称与布局页面的 JSX 排版和样式；不修改冰箱预览几何、模板数据、名称保存、布局编辑或后端接口。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §5、§7、§9、§11；功能设计 §4.1/§17.1；P4 最终稿 `7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d` 及本地 `docs/ui-assets/png/pwa-create-fridge.png`、`docs/ui-assets/html/pwa-create-fridge.html`。
- 预期验证：前端 lint、测试、生产构建、`git diff --check`；核验 320/390/430px 下标题行不换行、说明行不重叠且底部操作区不遮挡内容。
- 完成：已有冰箱的锁定说明已并入“选择外形”标题行；预览与 `layout-caption` 收口到同一文档流组，取消两者之间的上下留白；P4 内容底部预留从 112px 收紧为 96px，未改变新建流程和冰箱几何。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（45 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 本地浏览器在 320/390/430×844px 核验标题行保持单行、预览与说明无间距且无重叠，三种视口 `scrollWidth` 均等于视口宽度。
- 未验证：真实 iOS/Android PWA 的字体放大、触控和安全区表现。
- 下一步：人工在真实手机上确认“名称与布局”页面的紧凑间距和底部操作区观感。

### 2026-08-03 — P7 首页冰箱预览最长边缩放与防复发约束（本次会话）

- 状态：待评审。
- 现象：首页冰箱预览图下部被截断；当前实现没有始终按预览容器的最长边进行等比缩放。
- 目标：修复首页预览在宽矮、窄高和标准手机容器中的截断问题，并明确“完整显示优先于放大”的尺寸契约，降低重复回归概率。
- 范围：共享冰箱预览尺寸计算、首页遗留样式清理、前端尺寸回归测试、代码注解及 UI/进度文档检查项；不修改冰箱内部几何、库存数据、点击行为或后端接口。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5、§9、§11；功能设计 §17.1；首页最终稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 预期验证：前端测试覆盖四类模板和窄高/窄宽容器下的最长边缩放；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`；浏览器核验首页 320/390/430px 及模拟宽矮容器。
- 根本原因：统一 `FridgePreviewFrame` 重构时只迁移了页面宽度上限，没有把旧首页的 `container-type: size` 和“容器宽度、容器高度换算宽度、展示上限取最小值”的公式一起迁移；后续的 `max-height` 只能限制盒子高度，不能保证宽度按同一比例回缩，因此窄高时出现下部截断。首页旧的 `.p7-fridge-preview .open-fridge` 还保留了页面级尺寸职责，增加了复发风险。
- 完成：共享几何层新增 `getFridgePreviewFitSize` 和回归测试；`OpenFridge` 输出外壳宽高比，首页 `FridgePreviewFrame` 使用容器查询按最长边等比缩放并移除首页遗留尺寸覆盖；代码注解和 UI 规范新增禁止 `max-height` 截短、禁止页面重新接管尺寸、必须覆盖窄高/宽矮矩阵的检查项。
- 验证：前端测试（45 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 核验 390×500、320×844、430×932，首页冰箱均保持 `238/315` 比例且完整落在预览容器内，390×500 窄高场景实际为约 `126.5×167.4px`。
- 未验证：真实 iOS/Android PWA 在系统字体放大、安全区和旋转状态下的人工视觉验收；仍需按 P11 综合验收执行。
- 下一步：评审环境刷新 PWA，确认首页标准、宽体、法式多门和迷你模板在真实设备上均完整显示；若后续改动共享预览尺寸，必须同步运行几何测试和 320/390/430px + 窄高/宽矮核验。

### 2026-08-03 — P7 搜索结果数量同行显示（本次会话）

- 状态：待评审。
- 目标：将搜索结果中的数量与物品名称、冰箱名称放在同一行。
- 范围：仅调整搜索结果首行布局，不改变搜索逻辑和条件字段展示。
- 预期验证：前端 lint、测试、构建、`git diff --check`，并核验 390px 结果行布局。
- 完成：数量已移动到物品名称和冰箱名称所在的首行。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（40 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机字体放大和触控表现。
- 下一步：随 P7 首页搜索功能在真实手机/PWA 上一起验收。

### 2026-08-03 — P7 搜索结果信息行精简（本次会话）

- 状态：待评审。
- 目标：将冰箱名称与物品名称放在同一行，并仅在有值时展示有效期、出厂/生产日期和备注。
- 范围：仅调整全冰箱搜索结果字段布局与条件展示，不改变搜索、切换冰箱和编辑物品行为。
- 预期验证：前端 lint、测试、构建、`git diff --check`，并核验有/无日期和备注的结果行。
- 完成：冰箱名称已与物品名称同一行显示；有效期、出厂/生产日期和备注仅在字段有值时渲染，空字段不再占行。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（40 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 390px 核验结果行布局及空字段隐藏。
- 未验证：真实手机字体放大和触控表现。
- 下一步：随 P7 首页搜索功能在真实手机/PWA 上一起验收。

### 2026-08-03 — P7 修复首页搜索框换行（本次会话）

- 状态：待评审。
- 目标：修复首页搜索框继承全局 `form` 的换行规则，确保搜索图标、输入框和占位文案始终保持单行。
- 范围：仅调整首页搜索框样式与对应验证记录，不改变搜索逻辑、结果页或接口。
- 预期验证：前端 lint、测试、构建、`git diff --check`，并在 320/390/430px 视口确认图标与文字不换行。
- 完成：覆盖搜索框的全局 `form` 换行规则，图标、输入框和占位文案保持同一行。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（40 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 320px 截图确认搜索图标与“搜索所有冰箱”保持单行。
- 未验证：真实手机字体放大和触控表现。
- 下一步：随 P7 首页搜索功能在真实手机/PWA 上一起验收。

### 2026-08-03 — P7 首页全冰箱库存搜索（本次会话）

- 状态：待评审。
- 目标：在首页“n 件物品”后增加默认不聚焦的搜索框；回车后打开全冰箱库存搜索页，并支持从结果切换当前冰箱或进入“编辑物品”。
- 范围：前端首页搜索入口、跨冰箱库存结果页、结果字段展示、冰箱上下文切换、编辑物品入口及相关回归测试；复用现有库存接口和 `InventoryFlow`，不新增后端 API。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §5–§10；功能设计 §3.1、§3、§17.1；首页稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`、食谱稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`、编辑物品稿 `7224e71b-8055-40ec-a9a9-db68b6744764` 与对应本地 UI 资产。
- 预期验证：覆盖搜索过滤、结果字段和点击语义；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 完成：首页“n 件物品”后新增默认不聚焦的搜索框，回车进入全冰箱库存搜索页；结果显示名称、数量、有效期、备注和冰箱名称；点击冰箱名称切换共享当前冰箱，点击其他区域进入对应冰箱的“编辑物品”页。跨冰箱读取复用现有库存接口，未新增后端 API。
- 验证：前端测试（40 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 390×844px 核验搜索结果和结果行进入编辑物品，320×844px 与 430×844px 核验首页搜索框无溢出。
- 未验证：真实 iOS/Android PWA 触控和多台冰箱真实切换的人工验收；当前本地数据仅有一台可访问冰箱，跨冰箱切换需在评审环境补验。
- 下一步：评审环境准备至少两台可访问冰箱，确认搜索结果跨柜汇总、点击冰箱名称后首页与食谱上下文一致，并回归保存/删除物品。

### 2026-08-03 — P11 发布当前最新代码（本次会话）

- 状态：待评审。
- 目标：将当前 `main` 最新提交 `afaab07` 发布到生产环境，完成数据库备份、容器重建、迁移和公网健康检查。
- 范围：仅发布已提交源码归档；保留生产 `.env`、SQLite 数据卷和单容器约束；不创建分支、不提交 Git、不执行危险回滚。
- 设计/需求基线：用户本次发布要求；README 单容器源码发布流程；SQLite 前向兼容迁移和发布前备份约定。
- 发布：服务器在重建前创建 `/data/fridgeboard.db.backup-20260802-192708`；源码归档校验通过（43 个内置图标资产）；服务器完成镜像构建、`fridgeboard-app` 容器重建和启动。
- 验证：本地后端 Ruff、`pytest`（73 passed）、`uv lock --check`，前端 lint、测试（38 passed）、生产构建、`git diff --check` 和发布 dry-run 均通过；生产容器为 `healthy`；容器内 Alembic 为 `20260802_11 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；首页 HTTP 200 且包含“家常食橱”。
- 未验证：真实 iOS/Android PWA 刷新、顶级页面导航、首页格位新增物品和冰箱端显示设备的人工验收仍待 P11 综合验收。
- 下一步：在真实手机/PWA 和冰箱端刷新缓存后，按 P4/P5/P7/P8/P12 的待评审链路执行人工回归。

### 2026-08-03 — P5 首页区域进入添加物品时沿用已选位置（本次会话）

- 状态：待评审。
- 现象：首页点击某个区域进入物品列表后，在列表底部点击“添加物品”并继续“加入冰箱”，录入流程会重新要求选择位置，之前点击的区域没有稳定沿用。
- 目标：从区域物品列表新增物品时，直接使用进入列表时的存放位置完成保存；普通“添加物品”入口仍保留位置确认流程。
- 范围：前端 `InventoryFlow` 的位置初始化与“加入冰箱”流程、对应回归测试和本次进度记录；不修改库存 API、位置记忆规则、布局数据或其他入口。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §5–§8、§11；功能设计 §5.1/§17.1；最终设计稿“添加食材” `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 与“确认位置与数量” `0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8`，本地资产 `docs/ui-assets/html/pwa-add-food.html`、`docs/ui-assets/html/pwa-confirm-location.html`。
- 预期验证：前端回归测试覆盖区域列表进入添加物品后的槽位沿用及普通添加物品入口仍使用默认位置；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 完成：新增有效预选槽位判断；从首页格位进入物品列表后点击“添加物品”并提交时，直接将物品保存到原格位，不再请求默认位置或打开位置选择；普通添加入口保持原有默认位置确认流程。布局变更导致原格位失效时回退到普通位置流程。
- 验证：`npm run --prefix frontend test -- --run`（37 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：尚未在真实手机/PWA 上人工点击完整链路；需在首页点击具体格位后确认新增物品直接回到该格位列表并显示新物品。
- 下一步：评审环境人工验收首页格位 → 物品列表 → 添加物品 → 加入冰箱链路。

### 2026-08-03 — P4 设置页预览框与说明行文档流修复（本次会话）

- 状态：进行中。
- 现象：部分布局的 `div.fridge-preview-frame.fridge-preview-frame--setup.<template> setup-preview` 高度计算不足，后续 `p.layout-caption` 与冰箱预览图重叠。
- 目标：确保说明文字始终位于设置页预览框之后，不依赖具体模板的 Grid 行高推断。
- 范围：仅调整 `FridgePreviewFrame` 的 setup 外层和相邻说明行样式；不修改冰箱内部几何、模板数据或布局业务规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；P4 最终 UI 设计资产和当前 `fridgePreview.css` 尺寸契约。
- 预期验证：Playwright 检查 390px 下标准、三门、宽体、迷你模板的预览框底部不晚于说明行顶部；前端 lint/test/build 和 `git diff --check`。
- 完成：将 `.fridge-preview-frame--setup` 从 Grid 改为块级正常文档流，并让相邻 `.layout-caption` 使用明确的 `8px` 上间距；预览框内部冰箱仍由统一尺寸契约控制，未修改内部几何。
- 验证：Playwright 本地 390px 页面核验 `three_door`：预览框 `bottom=437px`，说明行 `top=457px`，间隔 20px，无重叠；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（35 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机视口和触控效果。
- 下一步：人工在 320/390/430px 视口检查标准、三门、宽体和迷你布局的说明行位置。

### 2026-08-03 — P12 持久化缓存、后台刷新与启动直达首页（本次会话）

- 状态：完成。
- 目标：为首页、食谱和冰箱三个顶级页面增加持久化缓存与 stale-while-revalidate 刷新机制；程序启动优先恢复缓存并直接进入上次冰箱首页，后台按启动、缓存超过 2 小时或用户下拉刷新获取最新数据。
- 范围：前端缓存存储、启动路由/冰箱上下文恢复、首页/食谱/冰箱列表数据加载、30 秒请求超时、统一加载/错误状态、三页下拉刷新、缓存失效与相关测试；首页移除显式刷新按钮。不修改后端业务 API、数据模型和冰箱端页面同步规则。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §5–§8；首页稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`、食谱稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`、冰箱切换稿 `6e7893ee-74d5-4aa4-9db4-45be02e7f9b5` 及对应本地 UI 资产；现有 P7/P9/P11 实现。
- 完成：新增版本化 `localStorage` 页面缓存，按冰箱和食谱周隔离；启动先恢复冰箱列表、上次冰箱和首页工作区缓存，存在冰箱时直接进入首页；首页、食谱、冰箱列表均通过共享 `PageShell`/`PullToRefresh` 使用下拉刷新，标题旁统一显示加载动画或可点击警告；请求默认 30 秒超时；库存、分类、布局、名称和食谱写操作会同步更新或清理相关缓存。
- 验证：页面缓存测试、前端测试（35 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 的下拉触控、启动恢复视觉、320/390/430px 截图和网络断开后警告弹窗，属于 P11 的人工 UI/设备综合验收范围，不影响 P12 的实现、自动化测试和代码交付。
- 下一步：无 P12 实现遗留；真实设备验收随 P11 综合验收执行。

### 2026-08-03 — P7 顶级页面底部导航布局统一（本次会话）

- 状态：待评审。
- 现象：用户反馈首页、食谱、冰箱、我的四个顶级页面的底部导航条出现错位，页面之间的应用壳不一致。
- 目标：统一四个顶级页面的顶部标题栏、独立滚动内容区和底部导航栏结构，复用同一组页面壳与导航组件，避免导航因渲染层级或定位上下文不同而偏移。
- 范围：前端共享页面壳、四个顶级页面的导航挂载位置和相关回归测试；不改变页面业务内容、路由和导航行为。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §6.2；功能设计 §17.1；最终设计稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`、`b2e77ba8-52dd-4722-8e89-accdf9f3569f`、`6e7893ee-74d5-4aa4-9db4-45be02e7f9b5` 及对应本地 HTML/PNG。
- 预期验证：四个顶级页面共享同一壳结构且导航水平位置一致；前端 lint/test/build；目标文件 `git diff --check`。
- 根本原因：首页和“我的”把共享 `P7Navigation` 放在可滚动 body 内，食谱页绕过 `PageShell` 自己拼装 `<main>`；四页因此拥有不同的导航定位上下文，而 `.p7-nav` 的 `position: fixed` 又依赖未明确设置的静态水平位置。
- 完成：四个顶级页面统一使用 `PageShell` 的 `header → mobile-page-body → footer` 结构；首页、“我的”和食谱改为通过 footer 挂载 `P7Navigation`，冰箱切换页沿用同一 footer 结构；导航改为应用壳内的非 fixed footer，保持四列等宽和安全区内边距。
- 验证：新增共享应用壳结构回归测试；`npm run --prefix frontend test -- --run`（32 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 iOS/Android PWA 上进行 320/390/430px 视觉截图和触控验收。
- 下一步：人工刷新 PWA，分别打开首页、食谱、冰箱、我的，确认四项导航的左右边界和底部安全区在目标设备上保持一致。

### 2026-08-03 — P5 内置目录同步移出读取请求（本次会话）

- 状态：完成。
- 现象：`/categories` 和 `/icons` 每次请求都会触发内置分类/图标目录同步；切换冰箱或打开设置时，多条请求并发执行 SQLite 写事务，远程环境偶发卡顿。
- 目标：将内置目录同步收口到 Python 后端启动阶段，保证服务开始接收请求前完成一次同步；读取接口只执行查询，不再争抢目录同步写锁。
- 范围：后端应用 lifespan、分类/图标读取路径、启动同步回归测试及本进度记录；不改变分类目录内容、迁移版本、库存数据或目录同步规则。
- 设计/需求基线：用户本次明确要求；生产单进程/单容器 SQLite WAL 约束；现有 `ensure_builtin_catalog` 幂等同步实现与 P5 目录资产发布规则。
- 预期验证：目录同步启动时执行且读取接口不再调用同步函数的测试；`uv run ruff check backend`、`uv run pytest`、`git diff --check`。
- 完成：应用创建阶段在 Alembic 之后执行一次 `ensure_builtin_catalog`；`categories`、最近小类、图标列表和单个图标资产读取路径改为只读；自定义分类等写入路径保留同步兜底。目录清理测试改为显式模拟下一次启动同步。
- 验证：`uv run pytest backend/tests/test_item_catalog_api.py -q`（15 passed）、`uv run ruff check backend`、`uv run pytest`（73 passed）和 `git diff --check` 均通过。
- 未验证：尚未重新发布远程容器并用真实手机确认切换冰箱/打开设置的实际耗时；现有测试仅验证数据库读写语义。
- 下一步：发布包含本次变更的镜像，确认启动日志中的目录同步只出现一次，并用浏览器 Network waterfall 对比 `/categories`、`/icons` 的响应耗时。

### 2026-08-02 — P4/P5/P7 冰箱预览尺寸契约重构（本次会话）

- 状态：待评审。
- 现象：共享冰箱几何改造后连续出现首页标准/迷你冰箱缩小、位置选择预览收缩等回归；创建预览、编辑器、首页、位置弹窗和模板缩略图仍由多套 CSS、内联尺寸及 `!important` 共同控制。
- 目标：将冰箱内部几何与各页面展示尺寸彻底分离，让所有页面复用同一绘制结构，并恢复改造前已确认的页面尺寸与响应式策略。
- 范围：`OpenFridge` 尺寸契约、统一预览外层、相关页面调用、历史冲突 CSS、前端回归测试与本进度记录；不修改布局业务语义、库存数据、后端接口或设计稿信息层级。
- 设计/需求基线：用户要求审查并修正全部结构性问题；`docs/ui-design-specification.md`；功能设计 §4、§17.1；P4/P5/P7 最终设计稿 `7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d`、`e5c35dea-610f-42f9-878b-1f716c2e7d4f`、`145b32f6-007a-4698-9ea7-3963dfc04a38`、`0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8`、`23329191-d0fa-48ca-a517-fee9ff3eab9b` 及对应本地 PNG/HTML。
- 预期验证：先建立标准/宽体/迷你模板在首页、创建预览、布局编辑、位置选择和模板缩略图中的尺寸回归路径；前端 lint/test/build；Playwright CLI 核验 320/390/430px；目标文件 `git diff --check`。
- 根本原因：虽然各页面都渲染 `OpenFridge`，但组件内联宽高、旧基础样式、首页/编辑器/位置弹窗/缩略图的页面级覆盖同时参与最终尺寸计算；同一模板因此会因父级 Grid 的固有尺寸、选择器优先级和后加载覆盖产生不同结果。首页与位置页的问题不是原放缩算法失效，而是“内部几何”和“页面展示上限”没有明确所有权。
- 完成：新增统一 `FridgePreviewFrame`，由 `setup/editor/location/home/thumbnail` 五个场景显式声明展示边界；`OpenFridge` 只输出模板外壳比例和内部列结构变量，不再内联页面宽高。首页、创建/已有布局、布局编辑、位置确认/弹窗和模板缩略图全部改用同一外层；清理旧基础、编辑器、模板实验和缩略图中的重复尺寸声明，保留原页面可用空间和 320px 小屏缩放策略。
- 功能回归：对开门编辑器实测左右门均存在；左侧冷冻门从不可用改为 4 格后立即渲染 4 个格位，右侧冷藏门设为不可用后仅该门进入不可用态。迷你冰箱主柜继续使用 `1fr 1fr`。增加“连续创建第三台冰箱均返回 201”的后端回归测试，确认当前默认名称递增和接口无数量上限回归。
- 浏览器验证：Playwright CLI 使用本地真实数据验证 320×720、390×844、430×932。首页“家里冰箱 4”分别为 `260×354`、`330×450`、`358×487`，390px 下两主区各约 `222px`；位置弹窗 390/430px 下为 `322×438`，320px 下按既有 `.9` 规则为 `227×309`；均无横向溢出。对开门布局编辑的左右门格位变化通过 DOM 尺寸和可访问名称双重确认。
- 自动化验证：`uv run ruff check backend`、`uv lock --check`、`uv run pytest`（71 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（31 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：真实手机/PWA 缓存刷新后的最终触控与视觉观感待人工确认。
- 下一步：刷新本地 PWA，人工查看首页“家里冰箱 4”、对开门布局编辑和添加物品的位置弹窗；确认后可将 P4/P5/P7 转为完成。

### 2026-08-02 — P5 选择存放位置预览缩放回归修复（本次会话）

- 状态：待评审。
- 现象：“选择存放位置”页面的冰箱图比改造前明显变小，其他页面修复不应改变该页面原有尺寸。
- 目标：恢复位置选择弹窗原先基于可用高度和弹窗宽度的缩放效果，同时继续复用共享冰箱内部几何。
- 范围：位置选择预览的页面级尺寸适配、真实浏览器回归验证及本进度记录；不修改首页缩放、冰箱内部布局、库存保存或后端逻辑。
- 设计/需求基线：用户本次明确反馈；现有位置弹窗原本使用最高 480px 的可用高度缩放，统一几何改造新增的 `OpenFridge` 内联宽高和页面级变量不得使其缩小。
- 预期验证：在本地真实数据中打开“选择存放位置”，记录修复前实际尺寸；恢复原尺寸策略后核验 320/390/430px、前端 lint/test/build 和目标文件 `git diff --check`。
- 根本原因：位置弹窗本身是 CSS Grid，预览项使用自动宽度和水平自动外边距；共享组件改为 `min(100%, …)` 内联宽度后，父项的固有宽度计算与子项百分比形成循环，父项收缩到合页的最小内容宽度，普通冰箱最终仅为 `26.3×40px`。
- 完成：仅为弹窗内 `.p5-location-preview` 明确设置 `width: 100%`，恢复其占满弹窗内容区；没有修改任一模板的展示上限、外壳比例、内部布局或首页缩放规则。
- 浏览器验证：Playwright CLI 在 390×844px 下，普通模板从 `26.3×40px` 恢复为 `322×426.2px`，对开门为 `322×251.8px`，迷你模板为 `322×438.3px` 且上下区域各约 216.13px；迷你模板在 320px 下为 `226.8×308.7px`、430px 下为 `322×438.3px`，均无横向溢出。截图保存于 `output/playwright/location-picker-mini-390-fixed.png`。
- 自动化验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（29 passed）、`npm run --prefix frontend build` 和目标文件 `git diff --check` 均通过。
- 未验证：真实手机/PWA 的最终视觉与触控观感待人工确认。
- 下一步：刷新本地应用，分别在普通、对开门和迷你冰箱中打开“添加物品 → 选择存放位置”，确认图形尺寸恢复且位置可正常点选。

### 2026-08-02 — P5 图标发布约束与冰箱切换性能修复（本次会话）

- 状态：完成。
- 目标：明确内置图标随源码归档和 Docker 镜像发布的规则，并消除 `/icons` 请求内重复目录同步导致的冰箱切换、设置页加载变慢。
- 范围：`.gitignore`、发布脚本和 README 的资产发布校验；`ensure_builtin_catalog` 的单会话幂等优化及回归测试；不改变分类、库存和数据库迁移语义。
- 设计/需求基线：生产日志与代码分析确认 `asset_path()` 为每个图标重复调用目录同步；发布脚本通过 `git archive` 构建，未被 Git 跟踪的资产不会进入镜像。
- 预期验证：后端 Ruff/pytest、前端 lint/test/build、部署归档资产校验、生产接口和容器健康检查。
- 完成：放行 `backend/fridgeboard/assets/item_catalog/` 的 Git 跟踪；发布脚本在传输前校验 `catalog.json` 的全部图标资产；同一 SQLAlchemy 会话内的内置目录同步改为只执行一次。
- 验证：`uv run ruff check backend`、`uv run pytest`（70 passed）、前端 lint/test（29 passed）/build、`git diff --check` 均通过；发布归档资产校验通过（43 个）；生产提交 `fd7e857` 容器 `healthy`，`alembic current` 为 `20260802_11 (head)`，数据库备份为 `/data/fridgeboard.db.backup-20260802-113220`。
- 未验证：尚未用真实手机录制切换冰箱和打开设置的端到端耗时；需要用户刷新 PWA 后人工确认体感。
- 下一步：刷新生产 PWA 后人工操作切换冰箱和设置页；若仍慢，再基于浏览器 Network waterfall 继续拆分前端并行请求。

### 2026-08-02 — P7 首页迷你冰箱缩放回归修复（本次会话）

- 状态：待评审。
- 现象：本地“家里冰箱 4”首页预览周围留白明显大于其他冰箱，图形仅约 180px 宽。
- 目标：恢复迷你冰箱在首页按可用空间自适应放大，同时保留迷你外壳比例和上下区域各占 50% 的共享几何。
- 范围：仅修正首页迷你冰箱的页面级最大宽度变量、相关验证及本进度记录；不修改其他模板、内部布局、库存或后端逻辑。
- 设计/需求基线：用户截图与本地数据库；“家里冰箱 4”的 `template_key` 为 `mini`；首页其他模板使用 358px 展示上限，迷你模板当前误把 180px 外壳基准宽度同时作为展示上限。
- 预期验证：先以真实浏览器复现迷你冰箱宽度，再修正 CSS；前端 lint、测试、生产构建、390×844px 视觉核验和目标文件 `git diff --check`。
- 完成：首页迷你冰箱的普通和容器查询分支展示上限从 180px 调整为统一的 358px；迷你外壳 `180:245` 比例、容器高度约束和上下 50/50 分区保持不变。
- 浏览器验证：Playwright CLI 在 390×844px 下修复前实测 `180×245px`，修复后为 `330.4×449.7px`，上下区域均为 `221.86px`；320px 视口为 `260.4×354.4px`，430px 视口为 `358×487.3px`，均无横向溢出。截图保存于 `output/playwright/home-mini-390-fixed.png`。
- 自动化验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（29 passed）、`npm run --prefix frontend build` 和目标文件 `git diff --check` 均通过。
- 未验证：真实手机/PWA 的最终视觉观感待人工确认。
- 下一步：刷新本地页面并打开“家里冰箱 4”，确认迷你冰箱占用空间与其他模板一致且上下区域仍各占一半。

### 2026-08-02 — P7 首页标准冰箱缩放回归修复（本次会话）

- 状态：待评审。
- 现象：首页“上冷冻门/下冷冻门”标准冰箱周围留白明显增多，冰箱预览比原设计小。
- 目标：恢复首页标准冰箱原有的自适应放大尺寸，不改变共享内部几何、容器放缩算法或其他冰箱模板的尺寸策略。
- 范围：仅修正首页标准冰箱的页面级最大宽度变量及本进度记录；不修改对开门、法式多门、迷你冰箱、布局方案或后端逻辑。
- 设计/需求基线：用户本次明确反馈；统一几何改造前首页标准冰箱使用 358px 最大宽度及容器宽高共同约束的缩放规则；现有 `OpenFridge` 共享几何保持不变。
- 预期验证：确认目标 CSS 仅恢复标准冰箱原值；前端 lint、测试、生产构建和目标文件 `git diff --check`。
- 完成：将首页标准冰箱的普通及容器查询分支最大宽度从误设的 238px 恢复为原有 358px；保留 `100%/100cqw/100cqh` 自适应约束及共享外壳比例，对开门、法式多门和迷你冰箱的覆盖值未改动。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（29 passed）、`npm run --prefix frontend build` 和目标文件 `git diff --check` 均通过。
- 未验证：按项目约定未自动进行 Playwright 视觉核验；真实手机/PWA 首页视觉效果待人工确认。
- 下一步：人工打开“上冷冻门/下冷冻门”冰箱首页，确认预览恢复原有大小且周围留白正常。

### 2026-08-02 — P5 生产图标资产缺失修复（本次会话）

- 状态：完成。
- 目标：修复生产环境打开食物清单时 `/icons` 返回 500 的问题，确保目录声明的内置 SVG 会随部署归档进入镜像。
- 范围：补齐被 `.gitignore` 误排除的内置 SVG 资产、增加目录资产完整性回归测试、重新发布并核验生产食物清单相关接口；不改变库存数据和分类业务规则。
- 设计/需求基线：生产日志中 `IconService.asset_path` 抛出“图标文件不存在”；`catalog.json` 的内置图标路径与镜像文件清单必须一一对应；本地工作区存在但 Git 归档缺失的资产为根因证据。
- 预期验证：资产完整性测试、后端 Ruff/pytest、前端 lint/test/build、部署后生产 `/icons` 不再 500，并核验库存接口和健康检查。
- 完成：将 12 个被 `.gitignore` 排除但被 `catalog.json` 声明的内置 SVG 纳入 Git；新增目录资产完整性测试；以修复提交 `f34175a` 重建并发布生产容器。
- 验证：`uv run ruff check backend`、`uv run pytest`（69 passed）、图标资产完整性测试（12 passed）和 `git diff --check` 通过；生产镜像内目录声明资产无缺失；生产容器 `healthy`；`/api/owner/refrigerators/{id}/icons` 未登录返回 401（不再因缺图标触发 500）；`alembic_version` 保持 `20260802_11`；数据库备份为 `/data/fridgeboard.db.backup-20260802-111938`。
- 未验证：已登录真实手机 PWA 的人工点击与浏览器缓存刷新；需用户刷新应用后再次打开食物清单确认视觉结果。
- 下一步：生产 PWA 执行“关于与帮助 → 刷新应用”或强制刷新后，重新进入食物清单完成人工回归。

### 2026-08-02 — P4 保持模板卡片尺寸，仅放大卡片内预览图（本次会话）

- 状态：进行中。
- 目标：保持“上置冷冻单门”等模板卡片原有尺寸和四列布局，仅放大卡片内部冰箱预览图，消除图标周围过多空白。
- 范围：仅修正模板缩略图的内联宽度覆盖；保留上一会话已修复的名称与布局页预览占位高度；不改变卡片外框、模板数据或布局语义。
- 设计/需求基线：用户本次明确反馈及截图；`docs/ui-design-specification.md`；P4 最终设计资产 `7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d`。
- 预期验证：确认模板卡片尺寸恢复原值、卡片内预览图放大；前端 lint、测试、生产构建和 `git diff --check`。
- 完成：恢复模板卡片原有四列布局与约 `85.75×94px` 尺寸；缩略图窗口保持 `56×54px`，仅通过 `!important` 覆盖 `OpenFridge` 的内联宽度，使首个模板预览实际显示约 `35.5×47px`，不再被压缩成过小图标；同时保留预览说明行不重叠修复。
- 验证：Playwright 390×844 核验卡片尺寸和首个模板预览尺寸，截图保存于 `output/playwright/name-layout-390-card-size-restored.png`；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（29 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机各模板小尺寸视觉效果。
- 下一步：人工在 320/390/430px 手机视口确认图标比例和触控热区。

### 2026-08-02 — P4 “名称与布局”预览间距与模板缩略图放大（本次会话）

- 状态：进行中。
- 目标：修复不同模板预览高度不一致导致的说明文字重叠，并放大“上置冷冻单门”等模板按钮内的冰箱预览图。
- 范围：仅调整名称与布局页的预览容器和模板选择卡片样式；不修改模板数据、共享冰箱几何、布局语义或业务流程。
- 设计/需求基线：用户本次反馈及截图；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §4.2；P4 最终设计资产 `7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d` 及本地 `pwa-create-fridge` 资产。
- 预期验证：前端 lint、前端测试、前端生产构建和目标文件 `git diff --check`；检查 320/390/430px 下模板卡片不裁切、不横向溢出。
- 完成：名称与布局页按模板类型为预览容器提供实际占位高度，避免预览图溢出后覆盖说明行；模板选择改为两列大卡片，普通/宽体/迷你预览分别放大到约 0.6/0.45/0.75 倍，并保留模板比例差异。
- 验证：Playwright 390×844 浏览器核验中，当前三门布局预览容器为 315px 高，预览图底部为 464px，说明行从 484px 开始；模板卡片为约 178.5×258px，缩略图窗口为 160.5×210px，未发生横向裁切；截图保存于 `output/playwright/name-layout-390-fixed-final.png`。`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（29 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机触控与最终视觉效果。
- 下一步：人工在 320/390/430px 手机视口确认模板卡片滚动、点击热区和各模板预览比例。

### 2026-08-02 — P4 “名称与布局”首个布局说明行下移（本次会话）

- 状态：进行中。
- 目标：修复“名称与布局”页面选中“上置冷冻单门”时，“上冷冻 · 下冷藏”说明文字与冰箱预览重叠的问题。
- 范围：仅调整名称与布局页预览说明行的垂直间距；不修改共享冰箱几何、模板数据、布局语义或业务流程。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §4.2；P4 最终设计资产 `7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d` 及本地 `pwa-create-fridge` 资产。
- 预期验证：前端 lint、前端生产构建、前端测试和目标文件 `git diff --check`。
- 完成：在 `.p71-name-layout` 页面范围内将 `.layout-caption` 的上边距调整为 8px，使“上冷冻 · 下冷藏”说明行与预览图保持间距；未修改共享冰箱几何和其他页面。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（29 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机 320/390/430px 视觉效果，按项目约定待人工 UI 验收。
- 下一步：人工打开“名称与布局”页面，确认“上置冷冻单门”的说明文字不再与预览图重叠。

### 2026-08-02 — P5 替换鸡肉与酱菜图标（本次会话）

- 状态：待评审。
- 目标：将“鸡肉”图标替换为 `fluent-emoji-high-contrast:chicken`，将“酱菜”图标替换为 `flowbite:jar-wheat-outline`。
- 范围：内置分类目录、两个 SVG 图标资产、分类接口回归断言和本进度记录；不改变分类 ID、名称、库存及食谱业务数据。
- 设计/需求基线：用户本次明确要求；现有 P5 数据驱动分类目录与内置图标资产约定。
- 预期验证：目录 JSON/资产一致性检查、相关后端测试、`uv run ruff check backend`、`uv run pytest` 和目标文件 `git diff --check`。
- 完成：将“鸡肉”绑定到 `fluent-emoji-high-contrast:chicken`，将“酱菜”绑定到 `flowbite:jar-wheat-outline`，并更新对应 SVG 资产与接口断言。
- 验证：`python -m json.tool backend/fridgeboard/assets/item_catalog/catalog.json`、相关后端测试（18 passed）、`uv run ruff check backend`、`uv run pytest -q`（68 passed）和目标文件 `git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的小尺寸图标视觉观感，待人工验收。
- 下一步：人工在分类选择器、PWA 和冰箱端确认鸡肉与酱菜图标的小尺寸视觉效果。

### 2026-08-02 — P4/P7 冰箱布局统一与重复创建修复（本次会话）

- 状态：待评审。
- 现象：布局方案需调整为 0–8 格；对开门左右门调整分格时预览不变化；创建后的对开门首页布局错乱；迷你冰箱上下区域比例及首页高度错误；不同页面虽调用共享组件但最终渲染不一致；第三次创建冰箱时接口返回 400。
- 目标：统一全部页面的冰箱几何和尺寸策略，修复对开门门格响应、迷你冰箱 50/50 比例及首页显示；将分格范围改为 0–8；修复重复进入创建流程时沿用旧名称导致的同名 400。
- 范围：共享 `OpenFridge` 几何/样式、布局编辑选项和后端校验、创建流程初始化、相关前后端回归测试与功能文档；不改变名称唯一性业务规则或已有库存迁移规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §4；P4 本地最终设计资产；现有共享冰箱组件和跨页面容器样式。
- 预期验证：先补失败用例；相关前后端测试；Ruff、pytest、锁文件、前端 lint/test/build；Playwright CLI 在 320/390/430px 对照创建预览、布局方案和首页；目标文件差异检查。
- 根本原因：页面确实复用了 `OpenFridge` DOM，但首页、创建预览和编辑页分别用 CSS 重写了组件的宽高、长宽比和 `grid-template-columns`；宽体组件升级为五列后，首页仍强制三列并使后两列换行。同时门区选中态把门段的 `position: absolute` 覆盖为 `relative`，左门宽度变为 0。迷你冰箱模板本身使用 33/67，且受同类页面尺寸覆盖。第三次创建的 400 是创建页状态沿用“家里冰箱”，命中后端正常的同名校验。
- 完成：将 0–8 选项和后端范围统一，0 使区域不生成格位；冰箱外壳比例、三/五列结构和迷你冰箱 50/50 分区收口到共享几何模块，页面仅设置缩放上限；修复门段选中定位；每次新建按当前冰箱列表建议最小未使用的“家里冰箱 N”名称，保留后端唯一性保护。
- 浏览器验证：临时数据库中实际创建三台冰箱，默认名称依次为“家里冰箱”、“家里冰箱 2”、“家里冰箱 3”，第三次 `POST /api/owner/refrigerators` 返回 201。对开门在 320/390/430px 的五个子列顶坐标一致，未换行；左门改为 4 格后门段保持绝对定位且显示 4 个格位。迷你冰箱编辑预览两区各 103.16px，首页两区各 119.5px。截图保存于 `output/playwright/`。
- 自动化验证：`uv run ruff check backend`、`uv run pytest`（68 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（29 passed）和 `npm run --prefix frontend build` 均通过。
- 未验证：真实手机/PWA 触控与高密度屏视觉效果待人工验收。当前工作区另有未提交的图标资产改动，会使新冰箱 `/icons` 请求因缺文件返回 500；本次布局验证中仅在 Playwright 会话内将该请求替换为空列表，未修改图标代码或资产。
- 下一步：人工在真实手机上确认对开门/法式多门比例、迷你冰箱 50/50 分区与 0–8 选项的触控密度。

### 2026-08-02 — P5 酱菜加粗与酱料改名调料（本次会话）

- 状态：待评审。
- 目标：在当前“酱菜”轮廓基础上增加线条厚度，并将内置小类“酱料”统一改名为“调料”。
- 范围：当前 `outlook-酱菜.svg`、物品目录与对应接口测试；不改变图标键、目录 ID、父级大类或历史数据迁移语义。
- 设计/需求基线：用户本次明确反馈；现有 P5 小类图库设计与当前 SVG 轮廓。
- 预期验证：SVG/XML 检查、目录同步与接口测试、后端 Ruff、全量 pytest、前端 lint/build、`git diff --check`。
- 完成：当前 `outlook-酱菜.svg` 保留现有路径并增加 `stroke-width="8"` 圆角描边；内置小类“酱料”改名为“调料”，同步更新 `condiment` 图标无障碍标签，并从移除名单中解除“调料”。
- 验证：SVG/XML 与目录检查通过；分类/库存专项测试 17 passed；`uv run ruff check backend`、`uv run pytest -q`（67 passed）、前端 lint/build、`git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的加粗图标小尺寸视觉观感，待人工确认。
- 下一步：人工在添加物品分类选择器、PWA 和冰箱端确认“酱菜”粗细与“调料”名称显示。

### 2026-08-02 — P5 增加扫拖并删除耗材分类（本次会话）

- 状态：待评审。
- 目标：在“个护美妆”大类中增加“扫拖”，并删除“耗材”分类及其图标。
- 范围：内置分类目录、`solar:smart-vacuum-cleaner-linear` SVG 图标资产、分类接口回归断言和本进度记录；不改变其他分类、库存及食谱业务数据。
- 设计/需求基线：用户本次明确要求；现有 P5 数据驱动分类目录与内置图标资产约定。
- 预期验证：目录 JSON/资产一致性检查、相关后端测试、`uv run ruff check backend`、`uv run pytest` 和目标文件 `git diff --check`。
- 完成：新增“扫拖”小类并绑定 `solar:smart-vacuum-cleaner-linear`；删除“耗材”小类及其内置 SVG 资产。
- 验证：`python -m json.tool backend/fridgeboard/assets/item_catalog/catalog.json`、相关后端测试（17 passed）、`uv run ruff check backend`、`uv run pytest -q`（67 passed）和目标文件 `git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的小尺寸图标视觉观感，待人工验收。
- 下一步：人工在分类选择器、PWA 和冰箱端确认“扫拖”显示及“耗材”不再出现。

### 2026-08-02 — P5 个护分类增删与图标替换（本次会话）

- 状态：待评审。
- 目标：替换“纸品、眼部、面部”图标，新增“洗浴”，删除“洗护”，并按要求处理“面部”图标中的中间十字。
- 范围：内置分类目录、四个 SVG 图标资产、分类接口回归断言和本进度记录；不改变其他分类、库存及食谱业务数据。
- 设计/需求基线：用户本次明确要求；现有 P5 数据驱动分类目录与内置图标资产约定。
- 预期验证：目录 JSON/资产一致性检查、相关后端测试、`uv run ruff check backend`、`uv run pytest` 和目标文件 `git diff --check`。
- 完成：将“纸品”绑定到 `hugeicons:tissue-paper`；新增“洗浴”并绑定 `lucide-lab:shower`；删除“洗护”；将“眼部”绑定到 `pepicons-pop:paint-pallet-circle`；将“面部”绑定到 `covid:personal-hygiene-hand-sanitizer-spray`，并移除其中间十字路径。
- 验证：`python -m json.tool backend/fridgeboard/assets/item_catalog/catalog.json`、相关后端测试（17 passed）、`uv run ruff check backend`、`uv run pytest -q`（67 passed）和目标文件 `git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的小尺寸图标视觉观感，待人工验收。
- 下一步：人工在分类选择器、PWA 和冰箱端确认“洗浴”及四个替换图标的名称、归属和小尺寸视觉效果。

### 2026-08-02 — P5 图标资源缓存失效修复（本次会话）

- 状态：待评审。
- 目标：修复更新内置 SVG 后“添加物品”页继续显示旧图标的问题，让浏览器在图标文件发生变化时自动请求新资源。
- 范围：图标 API 返回的 `asset_url` 版本化与相关测试；不改变图标路径、分类目录、图标视觉设计或前端交互。
- 设计/需求基线：用户本次反馈；现有 `frontend/src/appApi.ts` 的 JSON `cache: no-store` 约定；后端 `inventory_routes.py`、`owner_routes.py` 的图标资源接口；P5 图标线宽会话与小类图库最终设计资产。
- 预期验证：图标 URL 版本参数回归测试、后端 Ruff、全量 pytest、前端 lint/build、`git diff --check`。
- 完成：内置 SVG、已确认 PNG 和设备端图标 API 的 `asset_url` 均追加文件修改时间版本参数；同一图标文件更新后 URL 自动变化，浏览器会重新请求资源。
- 验证：图标/库存专项测试 17 passed、Ruff 通过、前端 lint/build 通过、`git diff --check` 通过；本地 8000 端点已返回 `outlook-酱菜.svg?v=...`。
- 未验证：真实手机 PWA 中已有旧缓存的现场升级体验；全量 pytest 有 2 个与本次无关的布局测试失败（`backend/tests/test_layout_api.py`，工作区已有布局扩展改动）。
- 下一步：人工刷新一次“添加物品”页面，确认新图标加载；如仍有旧页面壳缓存，可使用“关于与帮助 → 刷新应用”。

### 2026-08-02 — P5 酱菜 JPG 图标更新（本次会话）

- 状态：待评审。
- 目标：根据更新后的 `output/酱菜.jpg` 重生成对应的连续线稿 SVG。
- 范围：仅更新 `outlook-酱菜.svg` 及本进度记录；不改变分类名称、图标键、目录结构或其他图标资产。
- 设计/需求基线：用户本次请求；现有内置图标的 `currentColor`、`1em` 和连续 SVG 路径约定。
- 预期验证：源图与 SVG 时间/内容更新确认、SVG 结构检查、分类图标接口专项测试和 `git diff --check`。
- 完成：根据更新后的 `output/酱菜.jpg` 重生成 `outlook-酱菜.svg`，保留现有分类键、目录路径和连续线稿 SVG 结构。
- 验证：`uv run pytest backend/tests/test_item_catalog_api.py -q`（10 passed）、酱菜 SVG 结构检查和 `git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的图标小尺寸视觉观感，需按 UI 验收流程人工确认。
- 下一步：人工确认更新后的酱菜图标在分类选择器和冰箱端的辨识度。

### 2026-08-02 — P5 个护/酱料图标线宽统一（本次会话）

- 状态：待评审。
- 目标：将“酱菜、洁面、洗护、精华、纸品、耗材、面部”七个图标的线条加粗到接近“辣椒”的视觉粗细。
- 范围：仅调整七个内置 SVG 图标资产及本进度记录；不改变图标键、分类目录、库存数据或前端交互。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §8 的 24/32 网格与 2–3px 描边约定；`docs/functional-design-and-feasibility.md` §8、§17.1；小类图库最终设计稿 `284a5039-9042-484e-b683-b8504875a7e4`（本地 `docs/ui-assets/png/pwa-subcategory-library.png`、`docs/ui-assets/html/pwa-subcategory-library.html`）。
- 预期验证：SVG 结构与线宽属性检查、相关后端分类测试、`uv run ruff check backend`、`uv run pytest`、前端 lint/build、`git diff --check`；按用户要求不自动进行 Playwright 视觉核验。
- 完成：七个目标 SVG 均保留原始路径与 `currentColor`，统一增加 `stroke-width="8"`、圆角线帽和连接，使线宽接近“辣椒”图标在 24/32px 网格下的视觉粗细。
- 验证：7 个 SVG XML/属性检查、目录 JSON 解析、分类与库存测试（17 passed）、`uv run pytest -q`（67 passed）、前端 lint、前端生产构建和 `git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的小尺寸图标视觉观感，按 UI 验收流程待人工确认；`uv run ruff check backend` 受工作区既有 `backend/fridgeboard/layout_service.py:109` E501 阻断，与本次图标资源无关。
- 下一步：人工在小类图库、PWA 首页和冰箱端确认七个图标的粗细、细节可辨识度及是否存在局部轮廓粘连。

### 2026-08-02 — P4/P7 宽体冰箱双侧门与布局方案扩展（本次会话）

- 状态：待评审。
- 目标：让“对开门”和“法式多门”的开门布局左右两侧都显示通过合页连接到主体的门；将“布局方案”分格选择扩展为 1–8，并增加“不可用”选项表示该区域不能存放物品。
- 范围：共享冰箱布局预览、布局方案编辑控件、布局保存校验及相关前后端回归测试；不改变冰箱外形模板选择、温区定义、已有库存自动归位语义或其他页面信息层级。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` 的布局与位置规则；`docs/final-ui-designs.md` 登记的 P4 本地最终设计资产；现有共享 `OpenFridge` 实现。
- 预期验证：相关前后端自动化测试、`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、目标文件 `git diff --check`；按用户要求不自动进行 Playwright 视觉核验。
- 完成：宽体模板改为“左门—左合页—主体—右合页—右门”五列结构。门区按所面对的主柜区域独立建模，冷藏和冷冻对侧门都可选择“不可用”或 1–8 格；对开门左右门区分别对应左右主柜，法式多门同一门区的格位在左右门之间无重复分配。旧 `door` 及库存继续作为原冷藏对侧门，新增门区默认不可用并在用户保存后补齐。0 格区域不产生可选位置；仍有物品的区域不能直接设为不可用，避免库存悬空。
- 验证：`uv run pytest backend/tests/test_layout_api.py -q`（3 passed）、`uv run ruff check backend`、`uv run pytest`（67 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（26 passed）、`npm run --prefix frontend build` 和本次涉及文件 `git diff --check` 均通过。
- 未验证：按项目约定未自动运行 Playwright；320/390/430px 下宽体双门比例、十个布局选项的滚动密度，以及真实手机/PWA 的触控与视觉效果待人工评审。
- 下一步：人工分别选择“对开门”“法式多门”，确认左右门和两组合页的视觉关系；在布局方案中逐项确认“不可用”、1 格和 8 格，并验证有物品区域设为不可用时的提示。

### 2026-08-02 — P5 调整菌菇、酒类与茶咖图标分类（本次会话）

- 状态：待评审。
- 目标：将“菌菇”图标改为 `mingcute:mushroom-line`，并在“酒水饮料”大类中增加“酒类”和“茶咖”分类。
- 范围：内置分类目录、三个 SVG 图标资产、分类接口回归断言和本进度记录；不改变既有分类 ID、库存及食谱业务数据。
- 设计/需求基线：用户本次明确要求；现有 P5 数据驱动分类目录与内置图标资产约定。
- 预期验证：目录 JSON/资产一致性检查、相关后端测试、`uv run ruff check backend`、`uv run pytest` 和目标文件 `git diff --check`。
- 完成：将“菌菇”绑定到 `mingcute:mushroom-line`；新增“酒类”（`lucide:wine`）和“茶咖”（`mdi:coffee-outline`）两个“酒水饮料”小类。
- 验证：`python -m json.tool backend/fridgeboard/assets/item_catalog/catalog.json`、相关后端测试（17 passed）、`uv run ruff check backend`、`uv run pytest -q`（67 passed）和目标文件 `git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的小尺寸图标视觉观感，待人工验收。
- 下一步：人工在分类选择器、PWA 和冰箱端确认“菌菇/酒类/茶咖”的名称、归属和小尺寸图标效果。

### 2026-08-02 — P9 完成食谱备注编辑修复（本次会话）

- 状态：待评审。
- 目标：完成状态下的每周食谱仍可打开编辑框并修改备注；星期、菜名、食材和数量不可修改。
- 范围：食谱周视图编辑入口、完成食谱备注专用更新接口/规则、相关前后端回归测试和本进度记录；不改变完成/撤销完成、食材匹配和库存扣减语义。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` §17.1、既有 P9 食谱备注功能与 `pwa-weekly-recipes`/`pwa-recipe-edit` 本地设计资产。
- 预期验证：相关前后端测试、`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`git diff --check`。
- 完成：完成状态食谱条目可打开编辑页；星期、菜名、食材名称/数量及食材增删控件均只读或禁用；备注可编辑并通过既有保存接口提交；服务端拒绝完成状态下的其他字段变更。
- 验证：`uv run pytest backend/tests/test_recipe_api.py -q`（10 passed）、`uv run ruff check backend`、`uv run pytest`（67 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、本次涉及文件 `git diff --check` 均通过。
- 未验证：真实手机/PWA 触控与完成状态下输入框的人工视觉验收；全量 `git diff --check` 仍提示工作区原有 `.gitignore` 末尾空行。
- 下一步：人工在每周食谱页点击已完成条目，确认可修改备注且其他控件不可编辑；验收后可将 P9 条目标记为完成。

### 2026-08-02 — P5 替换“洗剂”分类图标（本次会话）

- 状态：待评审。
- 目标：将内置“洗剂”分类的图标替换为 `lucide-lab:bottle-spray`。
- 范围：内置分类目录、对应 SVG 图标资产、分类接口回归断言和本进度记录；不改变分类名称、归属、库存及食谱业务数据。
- 设计/需求基线：用户本次明确要求；现有 P5 数据驱动分类目录与内置图标资产约定。
- 预期验证：图标资产/目录一致性检查、相关后端测试、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build（如受影响）和 `git diff --check`。
- 完成：将“洗剂”分类的图标键替换为 `lucide-lab:bottle-spray`，并将其 SVG 资产更新为对应的线性喷雾瓶图标；分类名称、归属和业务数据保持不变。
- 验证：`python -m json.tool backend/fridgeboard/assets/item_catalog/catalog.json`、`uv run pytest backend/tests/test_item_catalog_api.py -q`（10 passed）、`uv run ruff check backend`、`uv run pytest -q`（66 passed）均通过；目标文件差异检查通过。
- 未验证：真实手机和冰箱端设备上的小尺寸图标视觉观感，待人工验收。
- 下一步：人工在分类选择器、PWA 和冰箱端确认小尺寸图标视觉效果；部署后确认已有实例的目录同步结果。

### 2026-08-02 — P5 指定分类与图标清理（本次会话）

- 状态：待评审。
- 目标：从分类选择器中移除用户指定的“风干肠、鱼、苹果、橘子、生菜、其他、调料、果汁、牛奶、鸡蛋”，并清理仅属于这些分类的图标，不影响相近但未指定的分类和共享图标。
- 范围：版本化分类目录、已有数据库中的精确名称清理/隐藏、分类可见性与图标资产回归测试；不修改库存、食谱及未指定分类的业务数据。
- 设计/需求基线：用户 2026-08-02 分类清理要求；现有 `ensure_builtin_catalog` 的“未引用清理、已引用隐藏”规则。
- 预期验证：后端相关测试、`uv run ruff check backend`、`uv run pytest`、`uv lock --check`、前端 lint/test/build（如受影响）、`git diff --check`。
- 完成：目录清单移除 8 个指定内置小类；“风干肠/调料”及其他同名历史小类按精确名称清理或隐藏；删除仅属于“其他/生菜”的内置 SVG，保留“水产/水果/饮料/奶品/蛋类/酱料”等未指定分类及共享图标；最近分类默认列表同步排除“牛奶/鸡蛋”。
- 验证：`uv run pytest`（66 passed）、`uv run ruff check backend`、`uv lock --check`、针对本次变更文件的 `git diff --check` 均通过。
- 未验证：真实生产数据库和手机/PWA界面尚未人工刷新确认；被历史库存或食谱引用的同名分类按规则保留历史记录但隐藏，需在评审环境核验。
- 下一步：部署/启动后刷新分类选择器，确认 10 个名称均不可选且未提到的分类与共享图标仍可见。

### 2026-08-02 — P5 编辑物品类别抽屉复用（本次会话）

- 状态：待评审。
- 目标：让“编辑物品”页面的小类支持编辑，复用“添加物品”的类别选择抽屉，并将编辑页小标题改为“类别”。
- 范围：仅修改手机端库存编辑/添加共用的类别选择交互、编辑页文案、相关前端测试与本进度记录；不改变库存 API、分类数据、保存和删除语义。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5–§10；功能设计 §17.1 中“编辑既有食材”登记；编辑既有食材稿 `7224e71b-8055-40ec-a9a9-db68b6744764`；添加物品分类稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 与小类图库稿 `284a5039-9042-484e-b683-b8504875a7e4`。
- 预期验证：前端相关测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`；核对 320×844、390×844、430×844px 下抽屉和编辑页标题/热区无溢出。
- 完成：编辑页原不可编辑的“小类”行改为“类别”按钮，打开与添加物品相同的类别抽屉；选择已有小类后立即回填并关闭抽屉；从编辑页进入“新建小类”后，创建或返回均回到编辑页；添加页既有类别选择流程保持不变。
- 验证：`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、针对本次变更文件的 `git diff --check` 均通过。
- 未验证：未自动执行 Playwright/真实手机 320×844、390×844、430×844px 视觉核验；按项目约定保留给人工 UI 验收。
- 下一步：人工在三种手机视口确认编辑页类别按钮、抽屉热区和编辑→新建小类→返回链路，然后并入 P5 总体验收。

### 2026-08-02 — P5/P11 旧版分类数据转换与库存图标恢复（本次会话）

- 状态：待评审。
- 目标：将生产数据库中的旧版通用小类和历史食谱食材引用转换到新版正式小类，恢复库存图标并保留物品业务数据。
- 范围：新增一次性数据迁移、旧小类 ID 到新版小类 ID 的精确映射、无精确分类的食谱名称近似映射、迁移前数据库备份、远程数据核验和本进度记录；不保留运行时向后兼容回退。
- 设计/需求基线：用户本次反馈与明确的数据转换要求；P5 通用物品分类与图标资产重构；生产 SQLite 备份和单容器部署约定。
- 预期验证：远程迁移前备份、迁移后分类/库存/食谱引用核验、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build、差异检查。
- 根因确认：生产仍有 20 个旧版无图标小类被 99 条库存引用；前端第一项图标为 `chicken`，因此所有这些库存统一显示鸡肉。
- 完成：远程事务内将 20 个旧版小类转换到新版正式小类，迁移 95 条库存引用、3 条已有旧分类食谱引用，并按名称为 27 条原本未绑定小类的食谱原料补齐近似分类；删除 20 个无引用旧小类；自定义“风干肠”“调料”保留不动。未保留运行时兼容代码。
- 备份：`/data/fridgeboard.db.backup-icon-migration-20260801-203347`，SQLite `PRAGMA integrity_check` 为 `ok`，大小 479232 bytes。
- 验证：远程数据库仍为 Alembic `20260802_11`；99 条库存均有存在且带图标的新版小类，32 条食谱原料均已绑定小类，旧版小类引用数为 0；本地针对性后端测试 8 passed、前端测试 24 passed、前端 build 通过。
- 未验证：生产 PWA/冰箱显示设备尚未人工刷新确认，需按 P11 清单刷新页面后确认图标视觉和缓存表现。
- 下一步：人工刷新生产 PWA 与冰箱端库存页，确认图标已按分类恢复；如无异常，将本条并入 P5/P11 验收。

### 2026-08-02 — P9 未完成食谱图标顶部结构调整（本次会话）

- 状态：待评审。
- 目标：让每日食谱页面未完成状态的 `p9-completion-icon` 基于已完成图标的主体结构，仅将顶部三个小竖条替换为一横连接半圆的未完成盖子。
- 范围：`frontend/src/sharedUi.tsx` 中 P9 完成状态图标、必要的前端样式和本进度记录；保持已完成状态图标、完成/撤销交互和其他页面图标不变。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` §17.1、`docs/final-ui-designs.md` 及 `pwa-weekly-recipes` 本地设计资产。
- 预期验证：前端 lint、前端测试、前端 build、`git diff --check`。
- 完成：保留两套原始 SVG 路径，仅通过裁剪和相对位置进行拼接：已完成图标原路径提供锅体，未完成图标的横线与半圆原路径提供盖子；锅盖与锅体上下留出间隙，不重绘、不改动几何形状。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机 320/390/430px 视觉与触控效果，待人工 UI 验收。
- 下一步：人工确认未完成图标与已完成图标在每日食谱页面中的主体比例、线条粗细和顶部盖子辨识度。

### 2026-08-02 — P11 发布当前版本并执行数据库迁移（本次会话）

- 状态：完成。
- 目标：将当前 `main` 发布到生产环境，包含食谱备注迁移 `20260802_11` 及此前未发布的目录同步修复，并确认数据库备份、容器健康和 Alembic 版本。
- 范围：当前 `HEAD` 的生产镜像发布、生产 SQLite 在线备份、容器启动时的前向迁移、健康检查和发布证据同步；不执行危险回滚、不删除历史业务数据。
- 设计/需求基线：项目 README 的单容器发布流程、SQLite WAL/单副本约束、Alembic 前向兼容迁移约定；当前 `main` 提交 `2813387`。
- 预期验证：后端与前端质量检查、部署脚本 dry-run、生产容器健康检查、生产 `alembic current` 和健康接口验证。
- 完成：发布提交 `c91e70d`；服务器在重建容器前创建 `/data/fridgeboard.db.backup-20260801-190908`；容器以单副本启动并自动执行前向迁移。
- 验证：`uv run ruff check backend`、`uv run pytest`（65 passed）、前端 lint/test（22 passed）/build、`uv lock --check`、`scripts/deploy-image.sh --dry-run` 均通过；生产容器状态为 `healthy`；容器内 `alembic current` 和 `alembic_version` 均为 `20260802_11 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；数据库备份文件存在且权限为 `600`。
- 未验证：本次未进行真实手机、冰箱显示设备和 PWA 缓存刷新验收；这些仍属于 P11 的人工验收项。
- 下一步：按 P11 清单完成真实设备和生产 PWA 的人工回归；如发现问题，使用已保留的数据库备份和容器日志单独制定恢复方案，不执行自动危险回滚。

### 2026-08-02 — P5 修复已运行实例仍显示“面条”（本次会话）

- 状态：待评审。
- 目标：修复旧数据库中仍被历史库存/食谱引用的 `builtin-noodle` 未被删除时，分类接口仍将其返回的问题；刷新应用后“选择物品”不得再显示“面条”及 `rice` 图标。
- 范围：内置目录同步、分类/最近小类查询、旧图标引用清理、分类接口回归测试和本进度记录；保留历史库存与食谱记录，不做破坏性删除。
- 设计/需求基线：用户反馈的实际页面现象；P5 数据驱动分类目录约定；既有历史数据保护约束。
- 预期验证：分类接口回归测试、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build、`git diff --check`。
- 完成：分类和最近小类查询仅返回当前目录中的内置节点；被历史库存/食谱引用的旧“面条”记录继续保留，但从选择器和图标库隐藏；同步时解除旧 `rice` 图标引用并清理旧内置图标。
- 验证：`uv run pytest backend/tests/test_item_catalog_api.py -q`（9 passed）、`uv run ruff check backend`、`uv run pytest -q`（65 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实运行实例刷新后的页面显示，需在服务重启/部署新代码后人工确认。
- 下一步：完成自动化验证并重新部署后，人工刷新“关于与帮助 → 刷新应用”确认“面条”及 `rice` 不再出现。

### 2026-08-02 — P5 Iconify 图标绑定物品列表（本次会话）

- 状态：待评审。
- 目标：将已注册的洁牙、体护、香氛、面膜、洗碗和洗衣图标绑定到物品选择器的小类列表。
- 范围：内置物品目录的 `subcategories`、分类接口回归测试和本进度记录；不改变最近/默认 16 项展示策略、库存模型或前端交互。
- 设计/需求基线：用户本次反馈；现有 P5 数据驱动分类目录与“个护美妆”导航大类。
- 预期验证：分类接口测试、`uv run ruff check backend`、`uv run pytest`、`git diff --check`。
- 完成：新增“洁牙”“体护”“香氛”“面膜”“洗碗”“洗衣”六个内置小类，全部归入“个护美妆”，并分别绑定用户指定的六个图标键；物品选择器展开对应大类后可显示这些条目。
- 验证：`uv run pytest backend/tests/test_inventory_api.py backend/tests/test_item_catalog_api.py`（15 passed）、`uv run ruff check backend`、`uv run pytest`（64 passed）、JSON 解析和 `git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的新增小类排序及小尺寸图标视觉观感，需人工验收。
- 下一步：人工展开“个护美妆”确认六个条目和图标显示后并入 P5 总体验收。

### 2026-08-02 — P5 删除“面条”分类及图标（本次会话）

- 状态：待评审。
- 目标：彻底移除内置“面条”分类及其 `rice` 图标，确保已有实例同步后不再显示或保留无业务引用的旧图标。
- 范围：内置分类 JSON、内置图标资产、目录同步逻辑、分类/图标回归测试和本进度记录；不影响仍被其他分类使用的图标及历史库存/食谱引用。
- 设计/需求基线：用户本次请求；P5 数据驱动分类目录与内置节点幂等同步约定。
- 预期验证：分类与图标相关测试、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build、`git diff --check`。
- 完成：从内置目录移除“面条”及其 `rice` 图标；目录同步会清理无库存、无食谱引用且已不在清单中的旧内置小类，并清理无分类引用的旧内置图标；保留仍被历史数据引用的分类/图标。
- 验证：`uv run pytest backend/tests/test_item_catalog_api.py -q`（8 passed）、`uv run ruff check backend`、`uv run pytest -q`（64 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、JSON 解析、图标资产存在性和 `git diff --check` 均通过。
- 未验证：真实运行实例中存在历史库存或食谱引用时的人工迁移结果；本次按数据保护约束不删除这些引用。
- 下一步：完成自动化验证后人工确认分类选择器和图标库均不再显示“面条”/`rice`。

### 2026-08-02 — P5 JPG 分类图标导入（本次会话）

- 状态：进行中。
- 目标：将 `output/` 中现有的 10 个中文命名 JPG 线稿转为 SVG，并按文件名新增到分类列表中。
- 范围：P5 内置分类 JSON、内置 SVG 图标资产、分类接口回归测试和本进度记录；不改变库存模型、用户自定义分类或分类选择交互。
- 设计/需求基线：用户本次请求；现有 P5 数据驱动分类目录和单色线稿图标约定。仓库中未发现 `outlook/` 目录，当前按根目录 `output/` 下同名 JPG 作为输入来源。
- 预期验证：目录 JSON/资产一致性检查、分类接口测试、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build 和 `git diff --check`。
- 完成：将 `洁面`、`洗剂`、`洗护`、`生菜`、`眼部`、`精华`、`纸品`、`耗材`、`酱菜`、`面部` 作为 10 个内置小类接入目录；按语义分别归入“个护美妆”“水果蔬菜”“粮油酱料”；重新矢量化为使用 `currentColor`、`1em` 尺寸和连续轮廓路径的 SVG，替换原像素矩形拼接版本。
- 验证：`uv run pytest backend/tests/test_item_catalog_api.py -q`（8 passed）、`uv run ruff check backend`、`uv run pytest -q`（64 passed）、连续路径 SVG 结构检查、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的新增图标小尺寸视觉观感，需按 UI 验收流程人工确认。
- 下一步：人工确认 10 个新增分类的归属、名称和图标辨识度后并入 P5 总体验收。

### 2026-08-01 — P5 个护图标补齐（本次会话）

- 状态：待评审。
- 目标：补齐个护与家居相关内置图标，覆盖洁牙、体护、香氛、面膜、洗碗和洗衣六个常用场景。
- 范围：仅更新 `backend/fridgeboard/assets/item_catalog/catalog.json`、对应 SVG 资产和相关回归断言；不改变分类结构、库存逻辑或前端交互。
- 设计/需求基线：用户本次反馈；现有内置图标库统一单色线稿资产约定。
- 预期验证：后端图标 API 相关测试、前端 lint/test/build、`git diff --check`，并确认新增图标可被图标库枚举和访问。
- 完成：新增 `personal-hygiene-clean-toothpaste`、`shampoo`、`perfume-outline`、`mask-one`、`dishwasher`、`washing-machine` 六个内置 SVG 图标，并同步更新 `catalog.json` 的图标清单。
- 验证：`uv run ruff check backend`、`uv run pytest backend/tests/test_inventory_api.py backend/tests/test_item_catalog_api.py`（15 passed）、`uv run pytest`（64 passed）、`python -m json.tool backend/fridgeboard/assets/item_catalog/catalog.json`、`git diff --check` 均通过。
- 未验证：真实手机和冰箱端设备上的小尺寸视觉观感，需按 UI 验收流程人工确认。
- 下一步：如后续继续扩展个护或家居类目，再按同一目录流程补充图标资产与回归断言。

### 2026-08-02 — P5 鸡肉图标翅膀改为空心半圆（本次会话）

- 状态：待评审。
- 目标：将鸡肉图标固定为 Fluent Emoji High Contrast `rooster`，并把中间半圆形黑色翅膀改为空心半圆。
- 范围：仅调整 `chicken` 内置 SVG 资产及对应图标 API 回归断言；不改变图标键、分类数据、库存逻辑和展示流程。
- 设计/需求基线：用户 2026-08-02 最新反馈；`docs/ui-design-specification.md` §8 的 24/32 网格与统一单色线稿要求；当前工作区已有 rooster 图标改动。
- 预期验证：后端图标 API 相关测试、前端 lint/test/build、`git diff --check`，并确认翅膀不再使用实心填充。
- 完成：移除会重画整只图形外轮廓的形态学滤镜；保留 Fluent Emoji High Contrast `rooster` 的主路径，仅通过 mask 挖空中间半圆翅膀，再单独绘制翅膀边界。
- 验证：`uv run pytest backend/tests/test_inventory_api.py`（7 passed）、`uv run ruff check backend`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 和 SVG mask/XML 结构核验均通过。
- 未验证：真实手机和冰箱端设备上的最终小尺寸视觉观感，需待评审环境人工确认。
- 下一步：在添加物品页和冰箱端确认 rooster 外轮廓无双线、空心翅膀与相邻图标的视觉粗细及辨识度。

## 状态定义

- `未开始`：尚未领取，前置条件可能未满足。
- `进行中`：当前会话已领取，尚未达到完成条件。
- `阻塞`：已完成可行检查，但需要产品、架构、权限或外部状态决定。
- `待评审`：实现和验证完成，等待人工/PR 审查。
- `完成`：验收条件、验证记录和交接信息齐全。

## 任务总表

| ID | 任务包 | 状态 | 前置 | 当前会话/负责人 | 完成证据 |
| --- | --- | --- | --- | --- | --- |
| P0 | 架构与 ADR | 完成 | — | 2026-07-19 架构会话 | [架构概览](architecture/README.md)、[ADR 索引](architecture/adr/README.md) |
| P1 | 工程骨架与质量门禁 | 待评审 | P0 | 2026-07-29 P1 合规问题闭环修复 | [README](../README.md)、[项目约定](../AGENTS.md)、CI 配置；软删除授权、API 状态码和食谱周边界已完成闭环修复并通过独立复审 |
| P2 | 领域模型、迁移与核心规则 | 待评审 | P1 | 2026-08-11 全项目 SQLAlchemy 异步化与 SQLite aiosqlite 接入会话 | 应用运行时数据库访问已统一至 AsyncEngine/AsyncSession；Alembic async 入口、SQLite 异步连接和全量回归已通过，待评审事务边界与备份后的真实库演练 |
| P3 | 无账号配对与设备授权 | 完成 | P1、P2 | 2026-07-23 P3 验收 | 首次冰箱端二维码、PWA 登录/本地领取、设备撤销/重配对、自动续期与 UI 验证；P11 补真实手机扫码验收 |
| P4 | 冰箱模板、布局配置与位置选择 | 待评审 | P2、P3 | 2026-08-03 “名称与布局”页面紧凑化会话 | `OpenFridge` 只负责模板几何，五类页面展示边界统一由 `FridgePreviewFrame` 管理；名称与布局页的锁定说明已并入“选择外形”行，`layout-caption` 和底部内容预留已收紧；0–8 格、宽体双门和迷你 50/50 在 320/390/430px 回归通过，待真机视觉评审。 |
| P5 | 库存、分类与图标库 | 待评审 | P2、P4 | 2026-08-06 零数量软删除修复会话 | 物品列表和编辑页改数会重置添加日期，旧 BBD 按是否明确填写新值处理；数量 0 保留软删除批次并隐藏日期风险；全量后端 85 项、前端 66 项测试及 lint/build 通过，待真机验收。 |
| P6 | 相机、条码与 AI 增量识别 | 待评审 | P1、P3、P5 | 2026-08-13 照片识别截断与静默失败修复会话 | 订单项已清洗为核心名称并提取实付金额，识别订单页支持逐项位置修改和同名库存数量合并；照片入口会立即释放相机，Agnes 2.5/8192、截断诊断和失败提示已完成；待正式发布、真实订单截图、设备触摸与视觉验收。 |
| P7 | 手机端日常首页与冰箱管理 | 待评审 | P3、P4、P5 | 2026-08-20 修复过期库存未进入“我的”通知会话 | 首页搜索行提醒入口已迁移至底部“我的”角标和通知列表；当前临期/过期库存会作为食品通知兜底；前端 27 个测试文件/232 tests、lint/build 通过，待真机视觉评审。 |
| P7.1 | 冰箱资料、已有布局与删除 | 待评审 | P4、P7、P10 | 2026-07-31 我的冰箱设置图标尺寸会话 | 设置图标已放大至 40px，按钮外框已隐藏，48px 触控热区与独立设置行为保留；等待人工评审。 |
| P8 | 冰箱端显示设备视图与低频同步 | 进行中 | P3、P4、P5 | 2026-08-10 冰箱端首页风险提醒图标替换会话 | Kindle 首页临期/过期汇总已改为 Iconoir Clock 和 Ant Design Warning Outlined，两者保留右上角数字角标；静态契约、前端 137 项测试、lint/build 和 Kindle 脚本语法检查通过，仍待 DP75SDI 真机验收。 |
| P9 | 食谱、动态补货与库存扣减 | 待评审 | P2、P5 | 2026-08-20 修复每周食谱分类图标未随编辑结果展示会话 | 每周食谱食材列表按 `subcategory_id` 使用当前分类图标，旧数据无分类 ID 时回退库存同名图标；新增“京葱→香辛”回归用例；前端 27 个测试文件/234 tests、lint/build 和 diff 检查通过，待真实设备视觉验收。 |
| P10 | 提醒、同步与设备健康 | 待评审 | P7、P8、P9 | 2026-08-20 修复过期库存未进入“我的”通知会话 | 现有每日去重提醒继续由首页进入应用壳时收取；前端额外用当前库存临期/过期状态兜底应用内食品通知，未改变提醒服务、设置 API 或系统通知增强；前端质量门禁通过，真实 iOS/Android Web Push 与目标设备断网恢复仍待验收 |
| P10.5 | AI 小类图标生成与审核 | 待评审 | P5、P10 | 2026-08-01 通用物品分类与图标资产重构 | Agnes AI text2image 四候选、透明 PNG 归一化、确认持久化及未选/过期候选清理已实现；真实 Agnes 调用和目标显示设备可读性待验收。 |
| P11 | 端到端验收与发布准备 | 进行中 | P3、P6、P8、P9、P10、P10.5 | 2026-08-04 修复库存删除与食谱消费审计外键冲突会话 | 修复已发布；容器健康、Alembic `20260802_11 (head)`、生产外键检查和公网健康检查通过；本次真实删除仍待用户重试，原有真实 PWA/冰箱端刷新验收仍待完成。 |
| P12 | 顶级页面持久化缓存与后台刷新 | 完成 | P7、P9 | 2026-08-03 P12 持久化缓存、后台刷新与启动直达首页会话 | 三个顶级页面持久化缓存、启动直达首页、2 小时后台刷新、共享下拉刷新、30 秒请求超时和错误状态已实现；前端测试、lint、build 和 diff 检查均已通过，真实设备验收统一纳入 P11 综合验收。 |
| P13 | Capacitor APK/IPA 与 PWA 共存部署 | 进行中 | P11、ADR-0004 | 2026-08-24 Android/iOS 原生 App 锁定竖屏会话 | [移动端部署设计](mobile-deployment-design.md)、[ADR-0004](architecture/adr/0004-capacitor-mobile-and-pwa.md)；P13.1–P13.5 已实施并通过后端/前端质量门禁、Android Debug 和 iOS Simulator Debug 构建；本次补充原生 App 竖屏锁定，仍待真实设备方向行为、正式签名和发布验收。 |

## 会话记录

### 2026-08-05 — P6 对焦引导与相机释放修复

- 状态：待评审。
- 目标：为单帧扫码提供对焦/对准引导，并确保退出识别页或相机初始化异常后不再残留摄像头占用；按 ZXing 官方浏览器能力补强单帧解码参数。
- 范围：`frontend/src/InventoryFlow.tsx` 的取景引导、相机异步启动取消和媒体流释放、ZXing hints 与失败重试；`frontend/src/styles.css` 的扫码框与对焦提示；不改变单帧识别、AI 识图、照片入口和订单分流。
- 设计/需求基线：用户本次反馈；P6 识别页实时取景与拍后释放约束；相机页允许使用沉浸式取景，但页面标题和返回入口仍遵守统一页面壳；ZXing 单帧未命中条码属于前端本地结果。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`；确认取景时显示对准框，退出后轨道停止且异步返回的流也会立即停止。
- 完成：取景阶段新增二维码/条码/物品通用对准框和中心脉冲对焦点；相机轨道请求增加后置摄像头、较高分辨率和浏览器支持时的连续自动对焦；拍摄前等待短暂稳定时间。ZXing 单帧解码启用 `TRY_HARDER` 并限定 QR、Data Matrix、Aztec、PDF417、EAN/UPC、Code 128/39、ITF 等常见格式。修复视频元数据初始化异常时只关闭 UI 却未释放已获得媒体流的问题；相机请求增加会话序号校验，并集中停止所有活动媒体流、暂停 video、清空 `srcObject`。条码、AI 和照片识别失败后立即重新打开相机取景，不再停留在无取景的空状态。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（49 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 的对焦能力、对准框视觉位置和系统摄像头占用指示灯消失时序；浏览器不一定开放真实焦点坐标，只能提供视觉对准引导和可选连续对焦约束。
- 下一步：在 HTTPS 的 iOS/Android PWA 中刷新最新构建，验证对准框、扫码成功率、返回后摄像头指示消失；若仍显示占用，关闭其他可能使用摄像头的浏览器标签/PWA 窗口后再复测。

### 2026-08-05 — P6 ZXing 条码格式与日志修正

- 状态：待评审。
- 目标：根据用户提供的实际日志区分“已成功读码”和“未知条码关联”，减少多格式解码器对无关格式的误导性警告。
- 范围：`frontend/src/InventoryFlow.tsx` 的 ZXing `POSSIBLE_FORMATS`；保留二维码、Data Matrix、Aztec、EAN/UPC、Code 128/39 和 ITF，不改变拍照、相机释放、条码回填和未知条码继续手工添加的语义。
- 设计/需求基线：用户提供的 `InventoryFlow.tsx:307` 日志；日志已包含成功解码值 `6937351711344`，后续条码查询 404 对应“当前冰箱尚未确认过该商品”。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`；确认格式列表变更不影响现有条码识别流程。
- 完成：移除 PDF417 格式尝试，避免该无关 reader 在商品扫码时输出误导性的 `NotFoundException` 调试警告；保留二维码、Data Matrix、Aztec、EAN/UPC、Code 128/39 和 ITF。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（51 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实设备上的同一条码再次扫描；当前日志已经证明 ZXing 成功读出 `6937351711344`，但该条码未在当前冰箱历史库存中关联。
- 下一步：刷新最新前端构建后重新扫码；若仍看到 404，它表示未关联商品，扫码结果仍应进入添加物品页并允许继续填写。

### 2026-08-05 — P6 取景框尺寸调整

- 状态：待评审。
- 目标：让识别页的对准框尽量大，便于用户将条码、二维码或物品放入有效识别区域。
- 范围：仅调整 `frontend/src/styles.css` 的 P6 对准框尺寸和比例；不改变相机流、拍照、ZXing 解码、AI 识别和底部按钮布局。
- 设计/需求基线：用户本次反馈；P6 沉浸式相机页规则；取景框不能遮挡底部操作区，且需保留手机屏幕边缘安全间距。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`；确认 320/390/430px 下取景框仍完整可见且不压住按钮。
- 完成：取景框宽度从 `min(78vw, 320px)` 放大为 `min(92vw, 520px)`，比例调整为 1.45，并同步增大四角引导线；未改变底部按钮和识别逻辑。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（51 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 的不同系统安全区、横竖屏和手指操作下的视觉观感。
- 下一步：刷新最新前端构建，在 320/390/430px 手机宽度确认取景框足够大且不遮挡底部操作区。

### 2026-08-05 — P6 识别页实时取景与拍后释放

- 状态：待评审。
- 目标：恢复识别物品页的实时相机取景和进入页面时的权限申请；点击扫码/识图后只拍摄一帧，关闭相机画面后再进行识别。
- 范围：`frontend/src/InventoryFlow.tsx` 的预览流状态、单帧采集后的媒体释放和失败重试；`frontend/src/styles.css` 的取景/识别动画显示。继续删除连续二维码检测，不改变条码/二维码一次性识别、AI 识图、照片识别和订单流程。
- 设计/需求基线：用户本次反馈；P6 三入口识别流程；识别页实时取景、拍摄后识别的交互约束。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`；确认进入页面显示取景，拍摄后停止媒体轨道并显示识别状态，权限失败仍留在当前页。
- 完成：恢复进入识别页时的相机权限申请和实时取景；扫码/识图拍摄后停止媒体轨道、清空 video 画面并进入识别动画；没有连续 ZXing 监听；权限失败仍留在识别页显示错误，照片入口不受相机失败影响。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（49 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；同时将物品列表中随日期漂移的固定“还有 6 天”断言改为语义匹配。
- 未验证：真实 iOS/Android PWA 的权限提示、实时取景和拍后系统录像指示灯消失时序；需在 HTTPS 设备上验收。
- 下一步：在 iOS/Android PWA 打开识别物品页确认取景和权限提示，点击扫码/识图确认拍照后取景关闭并显示识别动画。

### 2026-08-04 — Agnes 识别模型切换与失败原因审查

- 状态：待评审。
- 目标：审查 Agnes 识别请求失败原因并切换识别模型。
- 现象：服务器可访问 Agnes，两个模型的基础 curl 请求均返回 HTTP 200；应用适配器额外存在固定 20 秒超时和无输出长度上限，模型推理阶段较长时会被归类为“Agnes 识别暂时不可用”，响应内容为空或非 JSON 时会被归类为“Agnes 返回格式无效”。
- 处理：默认识别模型改为 `agnes-2.5-flash`，请求增加 `max_tokens=1024`，超时改为 60 秒；补充请求体、默认模型、超时和响应解析回归测试。
- 验证：`uv run ruff check backend`、`uv run pytest`（76 passed）、`uv lock --check`、`git diff --check`；生产服务器 curl 测试两个模型均成功。
- 未验证：未部署，未进行真实包装图片的端到端人工验收。

### 2026-08-04 — P6 相机按次采集与跨平台权限排查

- 状态：待评审。
- 目标：停止识别页常驻相机录像；用户点击扫码或识图时才短暂打开相机、拍摄一帧并释放媒体流；识别期间显示动画；修复 iOS 重复权限提示和 Android 无提示/无错误反馈的状态处理。
- 范围：`frontend/src/InventoryFlow.tsx` 的媒体流生命周期、拍照等待/释放、权限错误与识别状态 UI；不改变三入口、条码/二维码、订单识别和表单回填逻辑。真实设备权限是否由系统持久化仍需按平台验收。
- 设计/需求基线：用户本次反馈；P6 三入口流程；浏览器 `getUserMedia` 仅在安全上下文可用、权限由浏览器/系统按来源管理的约束。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`；检查相机成功、权限拒绝、API 不可用、识别中和识别失败状态均留在可操作页面。
- 完成：识别页进入时不再申请相机；扫码/识图点击后才调用 `getUserMedia`，拍摄一帧后立即停止所有媒体轨道并清空 video；AI/ZXing 处理期间显示“正在识别”旋转动画。权限拒绝、非 HTTPS、无摄像头、相机占用和浏览器不支持均留在识别页显示明确提示，安卓失败不再静默跳回添加页。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（49 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 是否按系统策略持久化相机授权；JavaScript 无法强制保存或绕过浏览器/系统权限，需在 HTTPS 真实设备上验收。
- 下一步：iOS 再次打开识别页时确认不弹权限；点击扫码/识图后确认只短暂出现录像指示；Android 分别验证 HTTPS、拒绝权限、无摄像头和正常拍摄路径。

### 2026-08-04 — P6 三入口图标优化

- 状态：待评审。
- 目标：将识别页底部“扫码、识图、照片”三个按钮的临时字符图标替换为清晰、统一的线性 SVG 图标。
- 范围：仅调整 `frontend/src/InventoryFlow.tsx` 的三个按钮图标和相关 SVG 样式；不改变按钮文案、交互逻辑、识别请求和订单流程。
- 设计/需求基线：用户本次反馈；现有 P6 三入口页面实现、`docs/ui-design-specification.md` 的统一按钮/触控热区规则。
- 预期验证：前端 lint、测试、生产构建和 `git diff --check`。
- 完成：扫码使用取景框 SVG，识图使用图片与识别闪光 SVG，照片使用相册图片 SVG；三个图标统一为 24px 线性风格，并保持原有按钮热区和交互。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（49 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实手机上进行视觉和触控验收。

### 2026-08-04 — P6 拍照识别入口与订单截图流程重构

- 状态：待评审。
- 目标：将识别功能改为用户点击后才采集和识别，支持扫码、识图、相册照片三种入口，并能从订单截图提取商品名称、规格和数量后批量添加。
- 范围：手机端 P6 相机/相册入口、条码与二维码单次识别、物品/标签/订单图片识别响应、订单商品勾选列表与批量写入、识别失败提示、相机页顶部可见性；删除连续识别和条码画面覆盖率分流。暂不保存识别原图，不改变已有单个物品编辑与位置选择流程。
- 设计/需求基线：用户本次需求；`docs/ui-design-specification.md`；P6/P5 冻结稿 `36284a96-d2ad-4fce-96b8-c59af859dc8d`、`e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 及本地 PNG/HTML；功能规则 §6 的现有标签字段约定。
- 完成：识别页底部改为“扫码”“识图”“照片”三个显式按钮；扫码只在点击后采集一帧并用 ZXing 识别条码/二维码，识图只在点击后调用 AI，照片调用系统相册并复用 AI；删除连续监听、重复条码去重状态和画面覆盖率阈值。识别响应新增 `kind` 与订单商品数组；订单结果进入默认全选的商品列表，可取消勾选后按默认分类/位置批量加入冰箱；标签/普通物品仍回填添加物品表单；无结果、权限失败、条码未关联和请求失败均有提示；识别页顶部改为白底黑字，返回按钮可见。
- 验证：`uv run ruff check backend`、`uv run pytest`（75 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（49 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；新增订单识别响应契约测试；已对照 P5/P6 本地冻结 PNG/HTML 复用页面壳和操作区。
- 未验证：真实 iOS/Android 后置相机、系统相册选择器、真实条码/二维码、标签日期 OCR 和订单截图模型准确率；本地自动化环境无真实摄像头输入。订单商品的默认分类为“其他”（不存在时取首个小类），需要人工确认批量添加后可逐项编辑的体验。
- 下一步：在 HTTPS 的 iOS/Android PWA 分别验收扫码、识图、照片、标签日期和订单截图；确认订单中的“京东自营店”不会被列为商品，并检查批量添加后的默认位置与逐项编辑。

### 2026-08-02 — P9 食谱备注行顺序修正

- 状态：待评审。
- 目标：将每周食谱和历史周详情中每道食谱的备注移动到食材与缺货信息之后，作为最后一行展示。
- 范围：仅调整 `frontend/src/RecipeWorkspace.tsx` 的信息渲染顺序及本进度记录，不改变备注数据结构、API、迁移和业务规则。
- 设计/需求基线：用户本次反馈；既有 P9 食谱备注功能和共享列表样式。
- 预期验证：前端 lint、前端测试、前端 build、`git diff --check`。
- 完成：调整周食谱条目渲染顺序，使信息按菜名、食材、缺少、备注排列；历史周详情原本已将备注置于最后，保持不变。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机 320/390/430px 视觉与触控效果，待人工 UI 验收。
- 下一步：人工确认长备注和缺货信息同时存在时的换行与视觉顺序。

### 2026-08-02 — P9 食谱备注功能

- 状态：待评审。
- 目标：为每道食谱增加可编辑备注，并在每周食谱与食谱历史页面的对应食谱下展示备注。
- 范围：食谱数据库字段与迁移、读写 API、复制历史周时保留备注、编辑食谱页面输入框、周食谱/历史列表展示、相关测试和本进度记录；不改变食材匹配、库存扣减和完成/撤销规则。
- 设计/需求基线：用户本次请求；`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` §17.1、`docs/final-ui-designs.md` 及 `pwa-weekly-recipes`、`pwa-recipe-edit` 本地设计资产。
- 预期验证：后端食谱 API 测试、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build、`git diff --check`；必要时补充迁移升级验证。
- 完成：新增 `recipe_entries.note` 可空字段及 Alembic `20260802_11` 迁移；食谱新增/编辑/读取 API 支持备注；历史周复制保留备注；编辑食谱页增加备注输入框；每周食谱和历史周详情在对应食谱下显示备注，空备注隐藏。
- 验证：`uv run ruff check backend`、`uv run pytest backend/tests/test_recipe_api.py`（9 passed）、`uv run pytest`（64 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、Alembic 全新库 `upgrade head` → `downgrade 20260801_10` → `upgrade head`、`git diff --check` 均通过。
- 未验证：真实手机 320/390/430px 视觉与触控效果尚未使用 Playwright/设备截图复核，待人工 UI 验收；本次未修改补货清单以展示备注。
- 下一步：人工确认编辑页备注输入和周食谱/历史详情备注长文本在目标设备上的换行、滚动与视觉层级。


### 2026-08-02 — P5 “添加大类”定制输入弹窗

- 状态：待评审。
- 目标：将“选择物品”展开框中点击“添加大类”后出现的系统 `prompt` 替换为符合家常食橱视觉规范的网页输入弹窗。
- 范围：添加物品页的大类创建交互、弹窗状态与样式、相关前端回归测试和本进度记录；不改变大类创建 API、分类数据结构或小类选择逻辑。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§7、§8.2、§10、§11；现有共享通知弹窗令牌与 P5 选择物品抽屉。
- 完成：移除 `window.prompt`；新增符合工程通知弹窗基线的网页输入弹窗，支持自动聚焦、回车提交、取消、空名称提示、提交中禁用和创建失败后原地重试；创建成功后刷新分类并自动选中新建大类。
- 验证：`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 的弹窗触控、系统字体放大和安全区观感，需人工设备验收。
- 下一步：人工在“添加物品”页展开“选择物品”，点击“添加大类”，确认弹窗与现有通知弹窗视觉一致并完成新大类创建。

### 2026-08-02 — P5 分类名称与目录清理

- 状态：待评审。
- 目标：将内置分类“葱姜”更名为“香辛”，删除“面条”分类，并确保已运行实例按最新目录同步。
- 范围：内置分类 JSON、目录同步逻辑、相关回归测试和本进度记录；保留既有“葱姜”分类 ID/图标键以避免历史库存引用失效。
- 设计/需求基线：用户本次反馈；P5 数据驱动分类目录与内置节点幂等同步约定。
- 完成：将分类展示名“葱姜”改为“香辛”，保留原分类 ID 和图标键；从内置目录移除“面条”并将旧数据库中无库存/食谱引用的同 ID 分类清理掉；补充目录同步回归测试。
- 验证：相关分类测试 15 passed；`uv run ruff check backend`、`uv run pytest`（64 passed）、JSON、目录静态检查和 `git diff --check` 均通过。
- 未验证：若生产数据库中存在历史“面条”库存或食谱引用，本次保留该记录以保护历史数据，未执行数据迁移或人工清理。
- 下一步：人工确认分类选择器显示“香辛”且不再显示“面条”；如需强制删除历史引用，再单独确定数据迁移策略。

### 2026-08-01 — P5 分类 Iconify 图标导入

- 状态：待评审。
- 目标：将用户指定的 Iconify 图标导入内置分类，已存在的“葱姜”等分类覆盖原图标，并补齐“瓜豆、辣椒、杂粮、唇膏”分类。
- 范围：`backend/fridgeboard/assets/item_catalog/catalog.json`、内置 SVG 资产、必要的迁移/接口回归测试和本进度记录；不改变库存数据、用户自定义分类和分类选择交互。
- 设计/需求基线：用户本次指定的 Iconify 图标集合；现有 P5 数据驱动分类目录与六大导航分组约定。
- 完成：从 Iconify 导入 10 个指定 SVG；复用既有分类键覆盖“葱姜、主食、干货、甜点、奶品”资产；将“叶菜”改用白菜图标；新增“瓜豆、辣椒、杂粮、唇膏”小类，并恢复“个护美妆”导航组；更新分类接口回归断言。
- 验证：`uv run ruff check backend`、`uv run pytest`（63 passed）、`python -m json.tool backend/fridgeboard/assets/item_catalog/catalog.json`、图标路径/文件一致性检查、`git diff --check` 均通过。
- 未验证：真实手机/PWA 和冰箱显示设备上的图标尺寸、线条可读性与“个护美妆”导航视觉布局，待人工验收。
- 下一步：人工确认新增分类的分组顺序和小尺寸图标辨识度后并入 P5 总体验收。

### 2026-08-01 — P5/P10.5 通用物品分类与图标资产重构

- 状态：待评审。
- 目标：把库存管理从食品扩展为通用物品；库存只保存小类；八个无图标大类仅用于展开选择器导航；添加页显示横向滑动的 2×8 最近小类；分类和图标改为数据驱动；图标同时支持 SVG 与透明 PNG；补齐 AI 四候选图标生成、确认和清理闭环。
- 范围：P5 分类/库存模型与迁移、分类和图标 API、最近小类记录、手机端新增/编辑物品流程、P10.5 图标生成适配器与临时/持久资产管理、相关测试和功能/架构文档；食谱录入、严格小类匹配、扣减与撤销行为保持不变；现有冰箱布局暂不改造为其他柜体布局。
- 设计/需求基线：用户本次需求及补充说明；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3.4、§6、§8、§9、§15.4；原添加食材和小类图库冻结资产仅作旧布局参考，本次明确需求替代其分类选择交互。
- 技术基线：运行时分类与图标不得继续存放在 Python/TypeScript 常量；内置目录资产通过清单导入数据库；持久图标使用独立资产目录并进入既有备份范围；AI 候选使用临时目录，确认后仅保留选中项。内置图标保持 SVG，生成图标明确复用 Agnes AI 的 text2image 能力，不接入 GPT Image 或新增 OpenAI 配置。
- 完成：新增 `20260801_09` 迁移，将库存字段重构为 `item_name + subcategory_id` 并移除大类位置记忆；分类和内置 SVG 由 JSON 清单幂等导入数据库；增加柜体最近小类、无图标大类、自定义大类、柜体/显示设备图标资产接口；添加页实现最近 16 项两行横向滑动、共享搜索栏、展开/收回分类面板和无跳转物品名称行；新建小类接通 Agnes AI 四候选、透明 PNG 归一化、确认持久化及临时清理。
- 验证：`uv run ruff check backend`、`uv run pytest`（58 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend build`、Alembic 全新库升级及回退均通过。Playwright 实际核验折叠与展开状态，截图为 `output/playwright/add-item-collapsed.png`、`output/playwright/add-item-expanded.png`；并发首次读取分类/图标的主键竞态已补回归测试并修复。
- 未验证：真实 Agnes AI text2image 调用需要部署环境注入现有 Agnes 凭证；目标显示设备上的透明 PNG 一位黑白可读性需实机验收。`docker build --tag fridgeboard:local .` 在解析 `docker/dockerfile:1` 时因 Docker 连接限制长时间无进展后取消，未完成镜像门禁。
- 下一步：人工评审添加物品交互；在带 Agnes 凭证的环境验证四候选质量和失败反馈，并在目标显示设备验证透明 PNG 一位黑白可读性；Docker 连接恢复后重跑镜像构建。

### 2026-08-01 — 关于与帮助及 PWA 刷新

- 状态：待评审。
- 目标：新增关于与帮助页面，展示应用名称和版本，并提供只清理应用壳缓存的刷新入口。
- 范围：`frontend/src/App.tsx`、`frontend/src/pwaCache.ts`、`frontend/src/styles.css`、前端测试及本进度记录；不清除登录 Cookie、localStorage、业务 API 数据或用户上传内容。
- 设计/需求基线：用户本次请求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md`；`docs/final-ui-designs.md` 及 `docs/ui-assets/manifest.json`。未发现该页面的冻结设计稿，沿用“我的”一级页共享页面壳和页面导航规范。
- 完成：在“我的”页接入“关于家常食橱”入口；新增关于与帮助页，显示应用名称、`package.json` 版本和刷新说明；刷新按钮更新 Service Worker、仅删除 `fridgeboard-app-*` Cache Storage 并重新加载，保留 Cookie、localStorage 和业务数据。
- 验证：`npm run --prefix frontend test -- --run`（24 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`node --check frontend/public/sw.js`、`git diff --check` 均通过；Playwright 在 320×844、390×844、430×844 核验页面布局，点击“刷新应用”后成功回到首页。截图：`output/playwright/about-help-320.png`、`output/playwright/about-help-390.png`、`output/playwright/about-help-430.png`。
- 未验证：真实 iOS/Android PWA 上 Service Worker 更新完成时序、刷新期间的网络失败反馈和视觉表现，需设备验收。
- 下一步：在真实 iPhone/Android PWA 上验证入口、版本展示、刷新后的登录保持和业务数据保持，再并入 P11 总体验收。

### 2026-08-01 — 关于页刷新文案调整

- 状态：待评审。
- 目标：去掉“遇到页面显示异常？”这一带有异常前提的提示，保持刷新入口可作为常规应用维护操作使用。
- 范围：`frontend/src/App.tsx` 关于与帮助页文案；不改变缓存清理范围、刷新行为和页面布局。
- 设计/需求基线：用户本次反馈；上一会话已确认的关于与帮助页实现和 PWA 刷新规则。
- 完成：移除“遇到页面显示异常？”标题，将说明改为中性的刷新缓存说明；未改变刷新按钮行为和缓存清理范围。
- 验证：`npm run --prefix frontend test -- --run`（24 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。

### 2026-07-31 — PWA 启动体验优化

- 状态：待评审。
- 目标：减少 iOS PWA 启动时的黑屏/白屏感知，并确认应用壳缓存是否能覆盖后续启动。
- 范围：`frontend/index.html`、`frontend/src/main.tsx`、`frontend/src/App.tsx`、`frontend/public/sw.js`；不缓存 API 和库存业务数据，不改变登录、配对或页面业务逻辑。
- 设计/需求基线：用户本次反馈；现有 PWA manifest、Service Worker、Vite 哈希资源构建方式和共享页面壳；无外部设计稿，本次仅补充启动阶段的轻量应用壳占位。
- 完成：在 HTML 根节点加入 React 挂载前的品牌启动占位；Service Worker 注册提前到入口文件；应用导航和静态资源改为缓存优先并后台更新；缓存版本升级；`/api/` 和 `/fridge` 请求继续绕过缓存。
- 验证：`npm run --prefix frontend test -- --run`（23 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`node --check frontend/public/sw.js`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 系统启动屏时长、系统回收后的冷启动时间和生产代理缓存头，需设备验收。
- 下一步：在真实 iPhone/Android PWA 上分别验证首次打开、二次冷启动、断网打开和版本更新；确认启动占位显示时间及 API 数据仍为最新。

### 2026-07-31 — 生产 gzip 压缩优化

- 状态：待评审。
- 目标：补齐 Nginx Proxy Manager 对 FridgeBoard JS、CSS、JSON 和 SVG 响应的 gzip 压缩，并保留可回滚备份。
- 范围：生产 Nginx Proxy Manager 全局自定义代理配置、线上响应头和压缩体积验证；不改 FastAPI 应用、不改容器镜像、不改缓存策略。
- 设计/需求基线：用户本次请求；现网响应头核验；`backend/fridgeboard/main.py` 的静态资源提供方式；Nginx Proxy Manager 生成配置中的 `gzip on`、`proxy_set_header Accept-Encoding ""` 与自定义 include。
- 完成：在 Nginx Proxy Manager 数据卷新增 `/data/nginx/custom/server_proxy.conf`，设置 `gzip_min_length 256`、文本资源 `gzip_types` 和 `gzip_vary on`；原配置不存在，创建了空白回滚备份 `/data/nginx/custom/server_proxy.conf.backup-20260731-035354`，调整阈值时另备份为 `/data/nginx/custom/server_proxy.conf.backup-20260731-035530-threshold`。未修改 FastAPI、容器镜像或缓存策略。
- 验证：远程 `nginx -t` 和两次 reload 成功；线上首页从 `986` 压缩至 `501` bytes，JS 从 `313822` 压缩至 `111203` bytes，CSS 从 `84117` 压缩至 `20399` bytes，均返回 `Content-Encoding: gzip` 和 `Vary: Accept-Encoding`；`/healthz` gzip/identity 均为 `15` bytes，符合 256 bytes 阈值；Nginx 运行配置已包含新增指令。
- 未验证：同一 Nginx Proxy Manager 上其他代理站点的业务回归和真实移动端缓存行为；配置为全局自定义代理 include，后续如需仅限单站点应迁移到站点级配置。

### 2026-07-31 — P5 添加食材默认小类

- 状态：待评审。
- 目标：允许用户在添加食材时不显式选择小类，并在保存时归入所选大类中名称相同的默认小类。
- 范围：`frontend/src/InventoryFlow.tsx` 的新增食材表单校验、默认小类解析和展示；不改变库存 API 的有效小类 ID 要求、内置分类结构、编辑食材或小类图库交互。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；添加食材冻结稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 与本地 `pwa-add-food` 资产；`docs/functional-design-and-feasibility.md` §17.1。
- 完成：新增流程不再要求 `subcategoryId` 非空；用户未选小类时，优先使用所选大类的同名小类，兼容旧数据时才回退该大类的首个小类。默认 ID 会在进入位置选择前写入草稿，继续满足库存 API 的有效小类 ID 约束；用户显式选择的小类保持优先。
- 验证：`npm run --prefix frontend test -- --run`（23 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 以本地前端页面核验 320×844、390×844、430×844：选择“奶品”、填写名称且不选择小类后点击“加入冰箱”，390px 在位置弹窗前后的可访问树显示“奶品 · 奶品”；三个宽度均无文本遮挡或横向溢出。截图保留在 `output/playwright/p5-default-subcategory-320.png`、`output/playwright/p5-default-subcategory-390.png`、`output/playwright/p5-default-subcategory-430.png`。
- 未验证：真实 iOS/Android PWA 的触控与系统字体放大；核验未执行最终“添加到…”操作，未写入测试食材。
- 下一步：人工确认添加食材时不进入图库也可完成位置选择并保存，确认后并入 P5 总体验收。

### 2026-07-31 — P9 食谱完成撤销后重复完成修复

- 状态：待评审。
- 目标：修复食谱完成后撤销，再次完成时 `recipe_completions.recipe_entry_id` 唯一约束触发 500 的问题。
- 范围：`RecipeService.complete` 的完成审计记录复用、旧消费明细清理及 API 回归测试；不改变库存扣减规则、完成/撤销接口路径或数据库结构。
- 设计/需求基线：用户提供的 ASGI/SQLite 错误日志；P9 现有完成与撤销语义；`RecipeCompletion` 对 `recipe_entry_id` 的唯一约束。
- 完成：再次完成时复用该食谱已有的撤销完成记录，清理旧消费明细后写入本次扣减审计，并恢复可撤销状态；未改变数据库结构和库存扣减规则。
- 验证：`uv run pytest backend/tests/test_recipe_api.py`（9 passed）、`uv run pytest`（54 passed）、`uv run ruff check backend`、`git diff --check` 均通过；测试覆盖完成→撤销→再次完成→再次撤销后的库存数量和 API 状态。
- 未验证：真实生产数据库中历史异常记录的迁移/修复需求未发现，未执行生产发布；真实设备端食谱操作仍待人工验收。
- 下一步：人工确认食谱完成、撤销和再次完成的页面反馈后并入 P9 总体验收。

### 2026-07-31 — P7.1 我的冰箱设置图标尺寸调整

- 状态：待评审。
- 目标：将“我的冰箱”列表每项最右侧的设置图标放大一倍，并隐藏按钮外框；保持设置入口的独立点击行为和 48px 触控热区不变。
- 范围：`frontend/src/styles.css` 中 P7.1 列表设置按钮与齿轮图标样式；不改变列表行点击、设置跳转、文案或数据逻辑。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§8、§11；`docs/fridge-management-requirements-and-ui.md` §4.1、§6.1；P7.1 冻结本地设计资产登记。
- 完成：`.p71-card-action` 保持列表项最右侧的可点击热区并隐藏外框；`.p71-settings-icon` 从 20px 放大至 40px；未改变列表主体点击、设置跳转和辅助标签。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 核验 390/320/430×844px，图标分别为 40×40px，按钮为 48×48px、44×44.5px、48×48px，三个视口均无横向溢出；截图记录于 `.playwright-cli/page-2026-07-30T18-22-41-303Z.png`、`.playwright-cli/page-2026-07-30T18-22-43-062Z.png`、`.playwright-cli/page-2026-07-30T18-22-44-829Z.png`。
- 未验证：真实 iOS/Android 设备上的触控反馈和系统字体放大场景，需人工评审。
- 下一步：人工确认齿轮图标在真实设备上的视觉重量后并入 P7.1 总体验收。

### 2026-07-30 — 编辑食材数量保存与重复按钮修复

- 状态：待评审。
- 目标：修复“编辑食材”页通过数量加减后保存未发起正确保存请求、数量未变化的问题，并删除与右上角“保存”重复的底部“保存修改”按钮。
- 范围：`frontend/src/InventoryFlow.tsx` 编辑食材表单的数量状态同步与保存入口；不改变库存编辑 API、其他新增食材流程或删除食材行为。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 共享页面壳与顶部操作区规范；现有 `InventoryFlow` 编辑食材实现。
- 完成：编辑页数量加减改为复用 `setQuantity`，同步可见数量与保存使用的数量状态；删除底部“保存修改”按钮，保留顶部“保存”入口及原有编辑库存 PUT 请求。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；静态确认编辑页仅保留一个“保存”按钮。
- 未验证：真实手机 PWA 上点击右上角保存的网络面板与视觉布局，需人工验收。
- 下一步：人工在编辑食材页将数量加减后点击右上角“保存”，确认 PUT 请求的 `quantity` 为新值。

### 2026-07-30 — GitHub 构建镜像本地发布脚本

- 状态：待评审。
- 目标：提供本机可执行的发布脚本，将 GitHub Container Registry 中已构建的镜像发布到 flycn 站点服务器；保留服务器 `.env`、SQLite 数据卷和现有单容器部署约束。
- 范围：`scripts/deploy-image.sh`、生产发布使用说明和本会话进度记录；不修改业务代码，不自动创建分支、提交或执行真实生产发布。
- 设计/需求基线：用户本次请求；`README.md`、`compose.yaml`、`docs/architecture/README.md`、ADR-0001/0003；镜像默认按 `ghcr.io/flywhc/fridgeboard:main` 处理，允许通过环境变量覆盖。
- 完成：脚本支持 tag/digest 镜像、SSH 主机/用户/目录覆盖、私有 GHCR 标准输入登录、临时 Compose 镜像覆盖、SQLite 在线备份、容器健康等待、镜像摘要输出和发布后 HTTPS 检查；README 已补充配置、dry-run 与失败处理说明。
- 验证：`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --help`、带 `--dry-run` 的参数检查、恶意镜像引用拒绝、`git diff --check` 均通过；未执行真实生产发布。
- 未验证：真实 GHCR 拉取、SSH 连接、生产数据库备份、容器重建、镜像摘要和 `https://fridge.flycn.fyi/healthz` 响应，需用户显式执行发布脚本后记录。

### 2026-07-31 — GHCR 镜像发布故障排查

- 状态：已处理，改回历史源码发布流程。
- 现象：本地发布脚本已在服务器创建 SQLite 备份，但 `docker compose pull` 报 `ghcr.io/flywhc/fridgeboard:main: not found`。
- 根本原因：现有 `.github/workflows/ci.yml` 只执行 `docker build --tag fridgeboard:ci .`，没有登录 GHCR 或推送镜像，因此 `ghcr.io/flywhc/fridgeboard:main` 不存在；这不是 Token 认证失败。
- 处理：确认此前成功发布使用的是 SSH 传输 Git 归档、服务器执行 `docker compose up -d --build --force-recreate`，不依赖 GHCR；发布脚本已恢复该流程，并从本地 `.deploy.env` 删除 GHCR Token。
- 预期验证：脚本 Shell 检查和发布流程 dry-run；真实生产发布需用户显式执行脚本后记录。

### 2026-07-31 — 恢复服务器源码构建发布

- 状态：待评审。
- 目标：恢复此前已验证的“SSH 传输源码、服务器本地 Docker 构建、健康检查”发布方式。
- 范围：`scripts/deploy-image.sh`、`.deploy.env`、README 和本会话进度记录；不修改 GitHub Actions，不依赖 GHCR，不上传生产 `.env`，保留 SQLite 数据卷。
- 完成：默认发布 `HEAD` 的 Git 归档到 `/opt/fridgeboard`；服务器先备份 SQLite，再执行 `docker compose up -d --build --force-recreate fridgeboard`，等待容器 healthy 并请求 HTTPS 健康检查；删除本地 GHCR Token 配置。
- 验证：`sh -n scripts/deploy-image.sh`、`scripts/deploy-image.sh --dry-run`、`scripts/deploy-image.sh --ref main --dry-run`、`git diff --check` 均通过；真实生产发布尚未执行。

### 2026-07-30 — 发布脚本改为读取本地配置

- 状态：待评审。
- 目标：让发布脚本默认读取仓库根目录的本地 `.deploy.env`，不再要求每次手动 `export`；配置文件只存在本机并由 `.gitignore` 忽略。
- 范围：发布脚本配置加载、`.deploy.env` 本地配置模板、`.gitignore` 和 README 使用说明；不修改生产服务器配置，不把任何令牌写入仓库。
- 设计/需求基线：用户本次反馈；本机 SSH 配置中的 `flycn.fyi` 主机别名、生产目录 `/opt/fridgeboard`、现有生产域名与 GHCR 仓库约定。
- 完成：新增并填充本机 `.deploy.env`；脚本默认加载该文件，命令行参数可覆盖配置；`.deploy.env` 已加入 `.gitignore` 并设置为 `600` 权限；GHCR Token 保持未填写，避免伪造或泄露凭据。
- 验证：`sh -n scripts/deploy-image.sh`、无参数 `scripts/deploy-image.sh --dry-run`、`git check-ignore -v .deploy.env`、`git diff --check` 均通过；真实发布仍未执行。
- 未验证：真实 GHCR 登录/拉取、SSH 连接、生产数据库备份、容器重建和 HTTPS 健康检查。

### 2026-07-30 — P9 空白日期添加食谱

- 状态：待评审。
- 范围：周视图空白日期入口、食谱新增 API 与服务方法、前后端回归测试；不改变已有食谱编辑、完成/撤销、导入和历史复制行为。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；最终周食谱设计稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及本地 HTML/PNG 资产；功能规则 §17.1。
- 预期验证：后端新增接口测试、前端测试、lint、build、差异检查。
- 完成：每个无安排日期显示“＋ 添加食谱”按钮，打开已有编辑表单；新建保存使用 `POST /api/owner/refrigerators/{refrigerator_id}/recipes?week_start=...`，已有条目继续使用 PUT 更新。
- 验证：`uv run pytest`（52 passed）、`uv run ruff check backend`、`uv lock --check`、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android PWA 上空白日期点击、键盘和视觉布局仍需人工验收。
- 下一步：人工确认本周/下周每个空白日期均可进入编辑并成功保存，再并入 P9 总体验收。

### 2026-07-31 — P5 食材列表搜索框焦点修正

- 状态：待评审。
- 目标：从首页冰箱或食材总数进入食材列表时，搜索框保持页面原有可见位置，但不得自动获得焦点或唤起系统键盘。
- 范围：仅手机端食材列表搜索框初始焦点；不改变列表滚动位置、搜索匹配、库存数据、返回行为和页面布局。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5、§6、§8、§11；现有首页入口与库存列表实现。
- 预期验证：前端测试、lint、build、差异检查；核验首页冰箱入口和食材总数入口的搜索框保持原位置且无焦点。
- 完成：仅移除库存列表搜索框的 `autoFocus`，撤回初始滚动、滚动容器 ref 和额外底部空间改动。
- 验证：待本次修改后重新运行前端测试、lint、build 和差异检查。
- 未验证：真实 iOS/Android PWA 的原生下拉手势、系统键盘和安全区表现；需人工设备验收。
- 下一步：人工确认冰箱首页总数入口和各分格入口打开列表时搜索框不自动唤起键盘，再并入 P5/P7 总体验收。

### 2026-07-30 — P4/P7 冰箱预览双向适配补修

- 状态：待评审。
- 目标：确保冰箱预览在任意容器宽高组合下都完整显示，不能因单独按宽度或高度计算而被左右或上下截断。
- 范围：共享首页冰箱预览的双向响应式尺寸规则及极端容器回归验证；不改变冰箱几何数据、格位映射、点击行为和视觉结构。
- 设计/需求基线：用户本次反馈；前置冰箱预览高度自适应修复；`docs/ui-design-specification.md` §5、§9、§11。
- 预期验证：前端测试、lint、build、diff 检查，以及窄高、宽矮和标准手机视口下冰箱完整落在外层容器内。
- 完成：首页预览容器启用尺寸查询；普通与宽体冰箱宽度分别取固定上限、容器宽度和高度换算宽度中的最小值，避免上下或左右截断。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；200×500、500×200、288×200 模拟容器均验证冰箱完整落在容器内。
- 未验证：真实 iOS/Android PWA 的安全区、系统字体放大和旋转行为；需人工设备验收。
- 下一步：人工评审首页及其他冰箱预览页面在真实设备上的比例，确认后并入 P4/P7 总体验收。

### 2026-07-30 — P7/P11 手机端视口滚动、缩放与系统栏修复

- 状态：待评审。
- 目标：修复正文不可滚动时顶部标题栏被根页面带动的问题，禁止双指缩放，并使手机系统顶部安全区与标题栏使用同一背景色。
- 范围：手机端共享页面壳、全局根滚动约束、PWA viewport/theme-color 元数据和对应设计规范；不改变业务交互或冰箱端显示设备页面。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5、§6.2.1；P7/P11 现有手机端壳实现。
- 预期验证：前端测试、lint、build、差异检查；浏览器核验根页面不滚动、主内容区仍可独立滚动、viewport 禁止缩放和主题色元数据正确。
- 完成：`html/body/#root` 锁定根页面滚动并统一应用壳背景为标题栏白色；共享页面壳继续由主内容区独立滚动；`viewport` 增加 `maximum-scale=1`、`user-scalable=no`、`viewport-fit=cover`；HTML 与 manifest 的 `theme-color` 统一为 `#FFFFFF`，启动背景同步为白色；设计规范补充视口、根滚动和系统安全区约束。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 390×844 核验文档/body 横向和纵向尺寸均不溢出，根滚动为 0，食谱长列表 `.p7-scroll` 可独立滚动且标题栏 `top` 保持 0；viewport 和 `theme-color` 元数据符合要求，并完成截图视觉核验。
- 未验证：真实 iOS/Android PWA 的系统栏渲染、双指手势和刘海安全区仍需真机验收。
- 下一步：人工在真实 iOS/Android PWA 上确认系统栏颜色、禁止缩放和安全区表现。

### 2026-07-30 — P4/P7 冰箱预览高度自适应补修

- 状态：待评审。
- 目标：修复冰箱预览在可用高度不足时被外层容器截断的问题，缩放比例优先由容器高度决定。
- 范围：共享冰箱预览的首页响应式尺寸规则及相关矮屏回归验证；不改变冰箱几何数据、格位映射、点击行为和视觉结构。
- 设计/需求基线：用户本次反馈；本前置会话的宽体列宽修复；`docs/ui-design-specification.md` §5、§9、§11。
- 预期验证：前端测试、lint、build、diff 检查，以及 320/390/430px 宽度配合矮屏高度时预览完整落在容器内。
- 完成：普通预览高度使用 `min(100%, 474px)`，宽体预览使用对应的 `min(100%, 335px)`，由 `aspect-ratio` 计算宽度；不再依赖 `max-height` 裁剪超出内容。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；320px 宽、200px 高模拟容器下冰箱完整落在容器内，未被截断。
- 未验证：真实 iOS/Android PWA 的安全区、系统字体放大和旋转行为；需人工设备验收。
- 下一步：人工评审首页及位置/布局预览在真实设备上的比例，确认后并入 P4/P7 总体验收。

### 2026-07-30 — P4/P7 冰箱预览小屏自适应修复

- 状态：待评审。
- 目标：修复首页冰箱预览在小屏手机上超出外部容器的问题，并检查所有复用冰箱预览的手机页面。
- 范围：共享 `OpenFridge` 组件及其响应式尺寸约束、首页/布局预览/位置选择与确认页的回归验证；不改变冰箱几何数据、格位映射、点击行为和视觉结构。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5、§9、§10；功能规则 §4、§5.1；首页冻结稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`、布局预览稿 `e5c35dea-610f-42f9-878b-1f716c2e7d4f`、位置确认稿 `0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8`。
- 预期验证：前端测试、lint、build、diff 检查，以及 320/390/430px 手机页面无横向溢出和预览图不超出容器的视觉核验。
- 完成：宽体冰箱的固定内部列宽改为可压缩轨道；首页预览改用外层 `.p7-fridge-preview` 的宽高约束，不再用视口宽度计算；布局预览和位置选择页继续复用同一套容器适配规则。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。Playwright 在首页 320/390/430px 核验冰箱均位于容器内且页面横向溢出为 0；布局“名称与布局”页在 320/390px 核验同样无溢出；窄屏宽体预览内部列轨道可压缩。
- 未验证：真实 iOS/Android PWA 的系统字体放大、安全区和旋转行为；位置确认页需在完整添加食材流程中再做人工截图复验。
- 下一步：人工评审首页和布局/位置预览在真实设备上的视觉比例，确认后并入 P4/P7 总体验收。

### 2026-07-30 — P7 首页提示图标尺寸调整

- 状态：待评审。
- 目标：缩小首页提示/警告按钮的黑色圆形视觉尺寸，使其与相邻刷新图标的视觉尺度接近，同时保留完整触控热区。
- 范围：仅调整手机端 P7 首页提示按钮样式；不改变提示文案、弹窗行为、刷新行为和其他状态徽记。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§8、§9、§11；当前冰箱首页冻结稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`。
- 完成：提示按钮保留 48×48px 可点击热区，将黑色圆形视觉尺寸调整为 24px，并将感叹号字号从 18px 调整为 14px，使其接近相邻刷新图标的视觉尺度。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend build`、`git diff --check` 通过；`npm run --prefix frontend lint` 被既有 `frontend/src/InventoryFlow.tsx:10` 未使用参数错误阻断。Playwright 已启动本地页面，但当前环境进入登录页，无法到达已登录首页完成 320/390/430px 截图核验。
- 未验证：登录态首页的三种视口视觉截图、真实 iOS/Android PWA 与系统字体放大；需人工评审时复验。
- 下一步：在可访问首页数据的登录态下确认提示圆与刷新图形的视觉比例。

### 2026-07-30 — P5/P6 添加食材流程重构

- 状态：进行中。
- 目标：将添加食材从旧的“两步页面 + 内嵌相机”改为表单、独立相机识别页、位置弹窗及添加反馈动画；位置默认改为每台冰箱最近一次成功添加的位置。
- 范围：手机端库存录入、相机/条码/AI 分流、位置记忆持久化与迁移、相关 API/测试和功能文档；不修改库存合并、手工字段优先级、已有按大类位置记忆或 Kindle 页面。
- 设计/需求基线：用户于 2026-07-30 确认的重构方案；`docs/ui-design-specification.md` §5–§11；功能规则 §6.1–§6.9；旧冻结稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 与 `0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8` 仅作组件视觉参考。
- 预期验证：前端 lint/test/build 与 320/390/430px 视觉核验；后端 Ruff/pytest/迁移检查；真实设备的后置相机、条码及 AI 识别另列为人工验收项。
- 完成：添加页移除内嵌相机和步骤号，改由右上角扫码图标进入独立相机页；本地 ZXing 仅在用户点击“自动识别”后决定条码外接框是否达到画面 50%，否则调用既有 AI。位置选择改为可关闭模态框，非默认格位点击即提交，底部按钮提交默认格位；成功后显示 550ms 添加反馈再清空表单。冰箱新增 `last_added_storage_slot_id` 迁移，创建库存更新、编辑不更新、布局删除格位清空。
- 验证：`uv run pytest`（51 passed）、`uv run ruff check backend`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实 iOS/Android PWA 上授权后置相机，因此条码外接框 50% 阈值、低光/反光包装、AI 实际延迟及 320/390/430px 截图视觉核验仍需人工完成；当前自动化环境没有真实摄像头输入。
- 下一步：在 HTTPS 的 iOS/Android PWA 使用大条码、普通包装和拒绝相机权限各完成一次流程验收，并评审位置弹窗与添加动画。

### 2026-07-30 — P5/P6 添加食材流程审查修复

- 状态：进行中。
- 目标：修复代码审查发现的相机不支持崩溃、条码跨会话/过期误用、添加成功后冲突残留，以及冰箱端恢复库存改写添加默认位置的问题。
- 范围：仅 P5/P6 的前端瞬态状态、相机本地识别时序、库存服务调用语义和回归测试；不改变已确认的识别阈值、弹窗交互或数据库结构。
- 设计/需求基线：2026-07-30 代码审查结论；`docs/functional-design-and-feasibility.md` §6.1–§6.9。
- 预期验证：覆盖设备恢复不更新全局默认位置的后端测试，以及前后端完整门禁；相机真实输入仍留真机验收。
- 完成：相机入口在调用媒体 API 前检测能力并回退手工录入；每次识别会话重置条码去重和检测时间，自动分流仅接受 750ms 内的当前画面条码；草稿重置清理冲突和条码瞬态状态；设备恢复调用不再更新全局默认位置。
- 验证：`uv run pytest`（51 passed）、`uv run ruff check backend`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实 iOS/Android 的相机缺失/拒绝权限、条码扫描实时性和视觉流程仍待真机验收。

### 2026-07-30 — P5/P6 添加食材二次审查修复

- 状态：进行中。
- 目标：修复相机权限失败滞留识别页和位置弹窗连续点击重复提交，并补上默认位置不受设备恢复影响的回归测试。
- 范围：仅相机失败状态、位置保存互斥和库存恢复测试；不改变识别分流、位置默认或视觉布局。
- 设计/需求基线：2026-07-30 二次代码审查结论；`docs/functional-design-and-feasibility.md` §6.1–§6.9。
- 预期验证：后端默认位置恢复回归测试及完整前后端门禁。

### 2026-07-30 — P5 位置弹窗自适应与反馈规范

- 状态：进行中。
- 目标：使添加食材的位置选择弹窗始终落在可视高度内，统一位置名称为用户可读文案，并将流程错误改为共享通知弹窗。
- 范围：位置选择弹窗尺寸与文本、库存位置格式化、共享 UI 规范与通知反馈；不修改库存保存、默认位置或识别逻辑。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §5–§11 和新增 §8.1/§8.2。
- 预期验证：前端测试、lint、构建和 320/390/430px 视口核验，尤其检查低高度不溢出。

### 2026-07-30 — P5 位置弹窗高度与操作文案微调

- 状态：待评审。
- 目标：将位置弹窗扩大到至少占可视高度 80%，删除重复的位置提示行，并将位置名称并入主操作按钮。
- 范围：仅位置弹窗尺寸、位置文案和按钮文案；不改变分区选择、即时保存、默认位置或动画行为。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §8.1、§9、§11。
- 预期验证：前端测试、lint、构建、差异检查及 320/390/430px 视口核验。
- 完成：位置弹窗最小高度设为可视高度 80%（同时受安全区和最大高度约束）；移除独立位置提示行，主按钮改为“添加到 冷藏室 · 第 1 格”形式。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend build`、`git diff --check` 通过；真实设备与低高度视口仍待人工复核。

### 2026-07-30 — P5 位置弹窗选中态统一

- 状态：待评审。
- 目标：让“选择存放位置”默认选中格位复用“布局方案”页面的流光选择框，不再使用斜线阴影。
- 范围：仅位置弹窗预览的选中态样式与动效；不改变默认位置、点击提交和冰箱布局数据。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §8、§10；现有布局方案流光选中态。
- 完成：选中格位渲染复用布局方案页面的 `.zone-light-trace` 流光边框，并通过内框变体收进格位内容区，保留原有格位边框；位置弹窗不再使用斜线背景或额外实线描边，保留 reduced-motion 下的静态边框降级。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：真实手机浏览器的动画帧率和低性能设备表现；需人工设备验收。

### 2026-07-30 — P5 位置点击流光过渡

- 状态：待评审。
- 目标：点击非默认冰箱格位后，先显示目标格位的流光选中态并停留 0.3 秒，再播放现有“已加入冰箱”动画。
- 范围：位置弹窗点击分区的前端状态时序；默认位置主按钮、库存保存接口和 550ms 成功反馈不变。
- 设计基线：用户本次反馈；位置弹窗复用“布局方案”流光选中框的规则。
- 完成：点击格位立即更新流光选中框，300ms 后再提交库存并开始现有成功动画；过渡期间关闭、主按钮和重复点击均被禁用。
- 验证：待运行前端 lint、测试、构建和差异检查。
- 未验证：真实手机设备上流光移动与 300ms 停留的视觉节奏。

### 2026-07-30 — P7 首页食材图标均匀分布

- 状态：待评审。
- 目标：调整首页各冰箱分格内食材图标的定位，使少量食材在分格内部均匀展开，避免贴边，并在数量增加时使用轻微交错重叠。
- 范围：仅修改手机端 P7 首页食材图标的展示位置及其可测试定位逻辑；保持图标、数量角标、风险状态、分格点击和库存数据不变。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§8、§9、§11；`docs/functional-design-and-feasibility.md` §5.1–§5.3；首页冻结稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 UI 资产。
- 完成：新增可测试的食材图标定位函数；1 件居中，2 件放在水平 1/3 与 2/3，3 件放在 1/4、1/2、3/4，3 件及以上交错上下偏移 6px；保持图标、角标、风险状态和分格点击行为不变。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在 320×844、390×844、430×844px 核验首页，`bodyWidth` 分别等于视口宽度，未见横向溢出；390px 截图：`output/playwright/p7-food-spacing-390.png`。
- 未验证：当前本地数据仅有 1 件食材，3 件交错重叠效果由单元测试核验，仍需人工用多件真实库存确认视觉密度。
- 下一步：人工评审 1/2/3 件食材在不同分格尺寸下的留白和交错节奏，确认后并入 P7 总体验收。

### 2026-07-30 — 最新版本生产发布

- 状态：已发布，待真实设备验收。
- 目标：将 GitHub Actions 已成功构建的 `main` 提交 `fa4c004` 发布到 `/opt/fridgeboard`，完成生产数据库备份、容器重建、迁移和 HTTPS 健康检查。
- 范围：仅同步目标提交的已跟踪源码归档；保留生产 `.env`、SQLite 数据卷和服务器侧备份/缓存文件；不创建分支、提交或自动回滚。
- 设计/需求基线：GitHub Actions run `30517669918`（`fa4c004e533fd7f4131b2d84ae8616aedae20188`，成功）；生产部署约定见 `README.md`、`docs/architecture/README.md` 与 ADR-0001/0003。
- 发布：发布前通过容器内 SQLite `.backup` 创建 `/opt/fridgeboard/fridgeboard.db.backup-20260730-060958`（344064 bytes，权限 `600`）；同步提交归档并重建 `fridgeboard-app`，生产镜像摘要为 `sha256:cea830b0f893595fc111dcf3f09a04ba7d6e74457a88957c29c857aa1755a07f`。
- 验证：容器状态 `healthy`；容器内 `alembic current` 为 `20260724_07 (head)`；启动日志显示应用正常启动且 `/healthz` 返回 200；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；生产首页返回 HTTP 200、包含“家常食橱”并加载 `index-DZnHk45R.js` 与 `index-DMOqNCm_.css`，两个静态资源均返回 HTTP 200。
- 未验证：真实 iPhone Safari/PWA、Android Chrome 安装弹窗、生产缓存更新、相机和配对流程仍待人工验收。
- 下一步：在真实 iOS/Android 设备完成生产 PWA 安装、缓存更新、相机与配对回归后评审 P11。

### 2026-07-30 — 最新版本生产发布尝试（GHCR 权限阻塞）

- 状态：进行中。
- 目标：将 GitHub Actions 已成功构建的 `main` 最新镜像发布到 `/opt/fridgeboard`，完成生产数据库备份、容器重建、迁移和 HTTPS 健康检查。
- 范围：仅执行现有发布脚本；不修改业务代码、不创建分支/提交、不回滚现网容器。
- 设计/需求基线：用户本次请求；`README.md`、`scripts/deploy-image.sh`、`docs/architecture/README.md` 与 ADR-0001/0003；发布镜像默认指向 `ghcr.io/flywhc/fridgeboard:main`。
- 结果：已成功连接到 `root@flycn.fyi:/opt/fridgeboard`，并创建数据库备份 `/data/fridgeboard.db.backup-20260730-190504`；随后在拉取 `ghcr.io/flywhc/fridgeboard:main` 时收到 `denied`，发布中止，容器未完成重建。
- 验证：本机发布脚本已执行到远端备份与镜像拉取步骤；匿名 `docker manifest inspect ghcr.io/flywhc/fridgeboard:main` 也返回 `denied`，失败点明确为 GHCR 拉取权限不足或镜像不可见。
- 未验证：容器重建、`healthy` 状态、`/healthz`、首页静态资源与真实设备验收均未完成。
- 下一步：确认 GHCR 仓库可见性或镜像引用是否变更后重新执行发布脚本；如果该镜像应为公开可拉，则需要排查 GHCR 仓库策略或 tag/digest 是否已迁移。

### 2026-07-30 — P7 首页“n件食材”图标优化

- 状态：待评审。
- 目标：将首页顶部“n件食材”前的方块文本图标替换为更符合食材语义的 SVG 图标。
- 范围：仅调整 `frontend/src/App.tsx` 首页库存入口的图标标记及必要样式；保持数量文案、可访问名称、点击跳转和其他首页图标不变。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§8、§11；现有 P7 首页共享样式。
- 完成：将 `▨` 替换为 20×20px 线性苹果 SVG（含叶片）；数量文案、可访问名称、点击跳转和其他首页图标保持不变。
- 验证：`npm run --prefix frontend test`（18 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在 320/390/430×844px 检查 `documentWidth/bodyWidth` 分别等于视口宽度，SVG 计算尺寸均为 20×20px；390px 截图：`.playwright-cli/page-2026-07-30T04-55-07-651Z.png`。
- 未验证：真实 iOS/Android PWA 的系统字体放大、触控反馈和不同字体渲染下的人工作品级视觉评审。
- 下一步：人工确认苹果图标与首页黑白线性图标体系的视觉匹配后并入 P7 总体验收。

### 2026-07-30 — P7 首页主柜分格线重叠修复

- 状态：待评审。
- 目标：修复首页冰箱布局主柜中分格线与粗区域边界叠加产生的半截粗线。
- 范围：仅调整 `OpenFridge` 主柜格位按钮的分隔线绘制；保持布局几何、门体冷藏/冷冻分隔线、食材图标和点击行为不变。
- 设计/需求基线：用户本次首页截图反馈；`docs/ui-design-specification.md` §4、§8；现有 P7 首页冰箱预览实现。
- 完成：横向中层格位按钮改为绘制右侧分隔线并取消底边，避免与中层容器 3px 粗底边重叠；纵向格位、门体分隔线和点击热区保持不变。
- 验证：`npm run --prefix frontend test -- --run`（18 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在 320/390/430px 验证页面无横向溢出，横向格位按钮 `border-bottom` 均为 `0`；已查看 `output/playwright/p7-main-divider-fixed-clean.png`，主柜粗线连续且无半截叠线。
- 未验证：真实 iOS/Android PWA 与其他布局模板的人工作品级视觉评审。
- 下一步：人工确认主柜中层分格线视觉重量后并入 P7 总体验收。

### 2026-07-30 — 最新版本生产发布

- 状态：已发布，待真实设备验收。
- 目标：将 GitHub Actions 已成功构建的 `main` 最新提交 `1cf2ec3` 发布到 `/opt/fridgeboard`，完成生产数据库备份、容器重建、迁移和 HTTPS 健康检查。
- 范围：仅同步目标提交的已跟踪源码归档；保留生产 `.env`、SQLite 数据卷和服务器侧备份/缓存文件；不创建分支、提交或自动回滚。
- 基线：GitHub Actions run `30509264288`（`1cf2ec351a495beffc46a4be1c11fc750aca7802`，成功）；生产部署约定见 `README.md`、`docs/architecture/README.md` 与 ADR-0001/0003。
- 发布：发布前通过容器内 SQLite `.backup` 创建 `/opt/fridgeboard/fridgeboard.db.backup-20260730-114616`（344064 bytes，权限 `600`）；同步提交归档并重建 `fridgeboard-app`，最终镜像摘要为 `sha256:e8d8e3d496821f540c138ede42cc44d1e7c91e041902a68461518e82bfb6c3c8`。
- 验证：容器状态 `healthy`；容器内 `alembic current` 为 `20260724_07 (head)`；启动日志显示应用正常启动且 `/healthz` 返回 200；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；生产首页返回 HTTP 200、包含“家常食橱”并加载 `index-Br1JJc3p.js` 与 `index-DdQmAAid.css`。
- 未验证：真实 iPhone Safari/PWA、Android Chrome 安装弹窗、生产缓存更新、相机和配对流程仍待人工验收。
- 下一步：在真实 iOS/Android 设备完成生产 PWA 安装、缓存更新、相机与配对回归后评审 P11。

### 2026-07-30 — 全局输入框焦点样式收敛

- 状态：待评审。
- 目标：将所有输入框获得焦点时的蓝色浏览器选择框统一移除，不再只针对食材列表搜索框处理。
- 范围：前端全局表单控件焦点样式；保留页面已有的业务选中态和可访问的非输入控件焦点样式，不改变输入、搜索和保存行为。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` 的共享控件与页面壳规则。
- 完成：在全局控件规则中统一为 `input:focus`、`select:focus`、`textarea:focus` 移除 `outline` 和 `box-shadow`；保留按钮及页面业务选中态的焦点/选中样式。
- 验证：`npm run --prefix frontend test`（17 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在添加食材页聚焦文本、数字和日期输入框，均确认计算样式为 `outline: none`、`box-shadow: none`。
- 未验证：真实 iOS/Android PWA 对日期控件原生弹出层和系统键盘的绘制；需在真实设备上复验。
- 下一步：人工评审全局输入框焦点视觉效果，确认后并入 P5/P7 总体验收。

### 2026-07-30 — P7/P7.1 手机页面顶部标题栏统一

- 状态：待评审。
- 目标：将用户提出的手机版通用顶部标题栏规范整理进项目文档，并审查所有手机页面，统一固定顶部栏、分割线、背景层级、可滚动内容区和二级页返回行为。
- 范围：手机 PWA 的共享 `AppHeader`/`PageHeader`、页面壳与相关页面入口；不修改冰箱端 Kindle 页面壳、业务 API、数据模型或底部导航语义。
- 设计/需求基线：用户本次规范；`docs/ui-design-specification.md` §5、§6、§10；`docs/functional-design-and-feasibility.md` §17.1；对应本地最终 UI 资产以各页面已登记草稿为视觉参考。
- 完成：新增共享 `PageShell`，统一手机页为固定顶部栏、独立滚动内容区和可选固定底部区；`AppHeader`/`PageHeader` 统一使用白色应用壳背景和分割线；安装、配对、扫码、首页、我的、冰箱管理、布局、库存、食谱和设置页面完成迁移。二级页面保留共享返回按钮，一级页面按语义保留可选左右操作。
- 文档：`docs/ui-design-specification.md` §5、§6.2.1 补充顶部标题栏、背景、分割线、固定和滚动约束。
- 验证：`npm run --prefix frontend test`（17 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在 320×844、390×844、430×844px 检查：首页标题栏 65px、底部导航 72px 且固定，正文区 `overflow-y: auto`；库存二级页标题几何中心与视口中心分别误差 0px，左右槽位 48px，页面宽度无溢出。已查看 430px 库存页截图：`.playwright-cli/page-2026-07-29T18-36-53-854Z.png`。
- 未验证：真实 iOS/Android PWA 的安全区、系统字体放大、触控反馈和横向旋转行为；冰箱端 Kindle 页面未纳入本次手机壳改造。
- 下一步：人工评审 320/390/430px 标题栏视觉层级，并在真实手机上复验安全区和系统字体放大后合并 P7/P7.1 总体验收。

### 2026-07-30 — P7 食材列表标题与搜索控件细节修复

- 状态：待评审。
- 目标：将分格标题从内部 ID 改为用户可读的“冷藏室-1”格式；搜索框使用匹配尺寸的内联 SVG 放大镜；去除输入框获得焦点时的蓝色浏览器外框。
- 范围：仅修改手机端食材列表标题、搜索图标和焦点样式，不改变库存过滤、编辑、保存和新增流程。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§6、§7、§8、§9；库存列表沿用 P5 二级页共享壳。
- 完成：分格标题从内部 key（如 `refrigerator-1`）改为“冷藏室-1”格式；搜索放大镜改为内联 SVG，尺寸固定为 20×20px，与搜索框保持匹配；输入框及搜索容器在获得焦点时取消蓝色 outline 和阴影，同时保留原有边框。
- 验证：`npm run --prefix frontend test`（17 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在 320×844、390×844、430×844px 核验：标题显示为“冷藏室-1”，SVG 为 20×20px，焦点状态无可见 outline/box-shadow，页面无横向溢出；截图：`output/playwright/p7-inventory-controls-320.png`、`output/playwright/p7-inventory-controls-390.png`、`output/playwright/p7-inventory-controls-430.png`。
- 未验证：真实 iOS/Android PWA 的系统字体放大、触控和不同浏览器原生焦点绘制；需在真实设备上复验。
- 下一步：人工评审列表标题和搜索控件的视觉密度，确认后并入 P7 总体验收。

### 2026-07-30 — P7 首页共享样式回归修复

- 状态：待评审。
- 现象：库存列表功能变更后，首页顶部标题栏按钮和底部导航回退为全局按钮的黑底白字样式，尺寸、颜色和布局均偏离 P7 共享设计。
- 根因：新增库存入口样式时误替换了 `styles.css` 中整段 P7 页面共享样式，导致 `.p7-shell`、`.p7-icon-button`、`.p7-nav` 等规则不再生效。
- 目标与范围：恢复原 P7 首页共享样式，仅保留库存入口的新增规则；不改变库存列表、搜索、分格过滤和编辑流程。
- 设计/需求基线：`docs/ui-design-specification.md` §5–§10；最终首页稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`；既有 P7 共享组件和样式。
- 完成：从 `HEAD` 恢复 P7 页面壳、顶部按钮、状态条、冰箱预览、主操作按钮和底部导航的共享样式，仅保留 `.p7-inventory-summary` 新增规则；未修改库存列表入口和过滤逻辑。
- 验证：`npm run --prefix frontend test`（16 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在 320×844、390×844、430×844px 核验首页；顶部按钮计算尺寸为 48×48px、底部导航 `display: grid` 且高 72px、按钮高 55px，文字颜色恢复为 `#111111`，三种视口 body 宽度均等于视口宽度。截图：`output/playwright/p7-home-fixed-320.png`、`output/playwright/p7-home-fixed-390.png`、`output/playwright/p7-home-fixed-430.png`。
- 未验证：真实 iOS/Android PWA 中系统字体放大和真机触控；需在真实设备上复验顶部入口、底部导航和库存列表跳转。
- 下一步：人工评审首页视觉恢复结果，并与库存列表功能一起并入 P7 总体验收。

### 2026-07-30 — P7 首页与分格食材列表

- 状态：待评审。
- 目标：点击首页顶部“n件食材”进入当前冰箱全部食材列表；点击冰箱分格进入仅限该格的食材列表；两个列表均支持包含关键字即匹配的搜索，点击条目进入既有“编辑食材”页面。
- 范围：手机端 P7 首页入口、库存列表与 P5 编辑/新增流程；复用既有库存 API、图标库、共享顶部栏和编辑表单，不改变库存数据模型或保存规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4–§11；功能规则 §3.5、§5.4–§5.5；最终稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`、`7224e71b-8055-40ec-a9a9-db68b6744764` 及对应本地 PNG/HTML。
- 完成：顶部“n件食材”改为可访问按钮，进入当前冰箱全部食材列表；冰箱每个分格进入同一列表组件并按 `storage_slot_id` 限定范围。列表展示小类图标、名称、数量、品牌/规格/备注和保质期/风险状态；搜索覆盖名称、小类、大类、描述和保质期字段，采用包含匹配；点击条目进入既有“编辑食材”页，保存/删除后返回原列表；列表底部保留“添加食材”入口，新增页不再显示旧的“此格库存”。
- 验证：`npm run --prefix frontend test`（16 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 实际本地数据验证全部列表、关键词无结果/命中、分格 `door-1` 限定、条目进入编辑和新增页移除“此格库存”；在 320×844、390×844、430×844px 截图核验列表，三种视口 `documentWidth/bodyWidth` 均等于视口宽度。截图：`output/playwright/p7-inventory-all-390.png`、`output/playwright/p7-inventory-list-320.png`、`output/playwright/p7-inventory-list-390.png`、`output/playwright/p7-inventory-list-430.png`。
- 未验证：真实 iOS/Android PWA 的系统字体放大、触控和多条长文本数据下的人工可读性；需在真实设备和包含多批次、已过期/临期、长品牌备注的冰箱中复验。
- 下一步：人工评审列表信息密度、分格标题文案和真实设备触控；确认后并入 P7/P5 总体验收。

### 2026-07-29 — P7 首页冰箱门分格线修复

- 状态：待评审。
- 目标：修复首页冰箱门 4 个分格只显示 3 条分格线的问题；最底部分隔线需与冰箱边框同样加粗，并与最大冷藏室的分隔线对齐，门内其余分格平均分配剩余高度。
- 范围：仅调整首页冰箱预览的门区域结构与样式；保持布局数据、库存位置映射、点击区域和冰箱端视图不变。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`、首页最终设计资产与 P7 冰箱预览实现。
- 完成：新增门格比例计算，4 格门的第 3 格底边与最大冷藏区边界对齐，其余两条门内线均分边界以上高度；该关键线使用与冰箱边框一致的 3px 粗线；修正门外层旧 Grid 规则导致门格只占上半段的问题，使门格面板撑满门框；保留库存格点击、布局数据和宽屏模板行为。
- 验证：`npm run --prefix frontend test -- --run`（13 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在首页当前 4 格冰箱门下验证 320×844、390×844、430×844px 均无横向溢出；390px 下粗线与主柜最大冷藏区边界均为 `y=386.6875`，320px 和 430px 下同样对齐；截图为 `output/playwright/p7-door-grid-320.png`、`output/playwright/p7-door-grid-390.png`、`output/playwright/p7-door-grid-430.png`。
- 未验证：真实手机触控渲染与其他模板（对开门、法式门）的人工作品级视觉评审；对开门无堆叠冷藏边界时由自动化测试确认保持均分。
- 下一步：人工确认 4 格门的粗分割线视觉重量及不同模板下的门格比例。

### 2026-07-29 — P7 布局方案冰箱门选中态修复

- 状态：待评审。
- 目标：修复布局方案中选择冰箱门时流光选择框变成竖长条的问题，使选中态覆盖冰箱门与对应大冷藏区的同一高度范围。
- 范围：仅调整布局方案 `OpenFridge` 的门区域选中态结构与样式；不改变首页门格线、布局数据或库存位置映射。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`、P4 冰箱布局预览最终设计稿 `e5c35dea-610f-42f9-878b-1f716c2e7d4f` 及本地 UI 资产。
- 完成：修正门框及门区域的网格尺寸约束，门区域不再因 `height: 100%` 的未定尺寸撑大父级；流光框现在覆盖完整门区域，不再退化为竖长条。
- 验证：`npm run --prefix frontend test -- --run`（13 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在布局方案选择冰箱门后检查 320×844、390×844、430×844px：门区域与流光框均为完整矩形、无横向溢出；390px 门框 `70×255px`、流光框 `68×253px`，320px 和 430px 同样保持完整宽高。截图为 `output/playwright/p4-door-active-320.png`、`output/playwright/p4-door-active-390.png`、`output/playwright/p4-door-active-430.png`。
- 未验证：真实手机触控渲染及人工对照最终设计稿的动效节奏。
- 下一步：人工确认布局方案中门区域流光框的视觉范围和动效节奏。

### 2026-07-29 — P7 布局方案冰箱门选中区域收窄

- 状态：待评审。
- 目标：将布局方案选择冰箱门时的流光框限制在与最大冷藏室相对的门格区域，底边与门内粗分割线一致，不覆盖整扇门。
- 范围：仅调整 `OpenFridge` 门区域选中态的高度计算；保持首页门格线、门框尺寸、分格数据和点击行为不变。
- 设计/需求基线：用户本次反馈；P4 冰箱布局预览最终设计稿 `e5c35dea-610f-42f9-878b-1f716c2e7d4f` 及现有门格边界规则。
- 完成：复用最大冷藏区边界计算门选中区域高度；流光框只覆盖对应门格区域，底边与门内 3px 粗分割线对齐，不再覆盖整扇门；无对应堆叠边界的对开门仍保持整门选中。
- 验证：`npm run --prefix frontend test -- --run`（14 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 在布局方案选择冰箱门后验证 390×844px：流光框高度 `116.046875px`，门内粗分割线底边 `199.046875px`，流光框底边仅因 2px 外扩为 `201.046875px`；下方门格未被选中。此前 320/430px 门选中态也无横向溢出。截图为 `output/playwright/p4-door-active-area-390.png`。
- 未验证：真实手机触控渲染及人工对照最终设计稿的动效节奏。
- 下一步：人工确认流光框仅覆盖对应门格区域的视觉范围。

### 2026-07-29 — P7 首页冰箱门流光内侧边界修复

- 状态：待评审。
- 目标：将冰箱门对应区域的流光框完全限制在门格框内，避免底边向外越过粗分割线。
- 范围：仅调整门专用流光框的内嵌边界和高度计算；不改变门格比例、粗分割线或其他区域流光效果。
- 设计/需求基线：用户本次反馈；现有 P7/P4 门格边界规则。
- 完成：取消门专用流光框的 `-2px/+4px` 外扩补偿，流光框改为从门格区域内侧起始并按对应高度结束。
- 验证：`npm run --prefix frontend test -- --run`（14 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。390px 下流光框与门格区域同为 `x=273`、`width=64px`，流光框底边与粗分割线底边均为 `y=199.046875`，无横向溢出；截图为 `output/playwright/p4-door-active-area-390-inside.png`。
- 未验证：真实手机触控渲染及人工对照最终设计稿的动效节奏。
- 下一步：人工确认流光框内侧描边的视觉重量。

### 2026-07-30 — P7 冰箱门冷藏/冷冻区域修复

- 状态：待评审。
- 目标：修复冰箱门配置 4 格但首页只显示 3 格、第四格食材落入冷冻门区域的问题；门格必须全部位于最大冷藏室对应的门区域，冷冻室对应门区域不可配置、不可放食材，并以斜线表示。
- 范围：调整前端冰箱门区域几何、门格渲染、选中态和冷冻门禁用视觉；保持后端布局数据、库存位置 ID 和非门区域行为不变。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §8；P4 冰箱布局预览最终设计稿 `e5c35dea-610f-42f9-878b-1f716c2e7d4f`；现有最大冷藏室边界规则。
- 完成：门区域改为复用最大冷藏室的完整 `y/height` 几何；配置的全部门格均在对应冷藏门区域内均分，冷冻门区域单独显示斜线且没有门格/食材；布局方案的流光选中框只覆盖冷藏门区域，首页第四格食材不再进入冷冻门区域。
- 验证：`npm run --prefix frontend test -- --run`（17 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 首页在 320×844、390×844、430×844px 验证门冷藏区均包含 4 个 `open-fridge-slot`，冷冻门区域为斜线背景，且无横向溢出；390px 截图为 `output/playwright/p7-door-regions-home-390-clean.png`。
- 未验证：真实手机触控渲染及真实多模板数据（上置冷冻、下置冷冻、法式/对开门）的人工作品级视觉评审；最大冷藏区域选择逻辑已由单元测试覆盖。
- 下一步：人工在不同冰箱模板和第四格真实食材数据下确认门格位置与禁用斜线视觉。

### 2026-07-30 — P7 冰箱门冷藏/冷冻分隔线回归修复

- 状态：待评审。
- 目标：恢复冰箱门可放食材的冷藏区域与斜线冷冻区域之间的 3px 粗分隔线，并将“门体区域语义”写入功能基线，避免后续拆层渲染再次遗漏结构线。
- 范围：更新 `docs/functional-design-and-feasibility.md` 的门架结构规则；补充前端门区域分隔线样式和回归验证；不改变门格数量、食材归位或冷冻门禁用规则。
- 设计/需求基线：用户本次反馈；首页拟物冰箱结构规则；`docs/ui-design-specification.md` §4、§8；P7 冰箱门冷藏/冷冻区域修复会话。
- 完成：新增门温区边界计算和独立 3px 横向分隔线；分隔线位于冷藏/冷冻交界处，冷藏格、冷冻斜线和门框结构均保持不变；同步将门体冷藏/冷冻对应关系、不可放食材和必须保留分隔线写入 `docs/functional-design-and-feasibility.md` §4.2。
- 验证：`npm run --prefix frontend test -- --run`（18 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 首页在 320×844、390×844、430×844px 验证 4 个门格、3px 分隔线、斜线冷冻区域和无横向溢出；390px 分隔线为整门宽 `99.32px × 3px`，截图为 `output/playwright/p7-door-divider-390.png`。
- 未验证：真实手机触控渲染及其他模板的人工作品级视觉评审。
- 下一步：人工确认不同模板下门温区边界线与主柜边界的视觉一致性。


### 2026-07-29 — P7 首页提示收纳

- 状态：待评审；本会话领取“首页不显示冰箱端今天尚未同步提示，改为刷新左侧叹号并点击弹窗查看；同类首页提示统一处理”。
- 目标：移除首页正文流中的同步/设备健康提示，使警告仅以刷新按钮左侧的可访问状态入口呈现，点击后在不影响首页布局的模态框中查看完整内容。
- 范围：仅手机端当前冰箱首页 `FridgeHome` 的提示呈现与样式；不修改提醒生成、同步状态、刷新请求、设备健康开关或冰箱端显示设备页面。
- 设计/需求基线：`docs/ui-design-specification.md` §4、§6、§7、§8、§9、§11；`docs/functional-design-and-feasibility.md` §5.1、§11.3；最终稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`，本地资产 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`；用户本次交互要求。
- 完成：首页所有经 `message` 进入的提示（包括“冰箱端今天尚未同步”）不再插入正文流；存在提示时，刷新按钮左侧显示 48×48px 感叹号入口。点击后以带关闭按钮和“知道了”操作的模态框展示完整文案，关闭不改变提示状态。移除了提示出现时缩小冰箱预览和抬高主操作区的旧样式。
- 验证：`npm run --prefix frontend test`（11 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 使用实际设备健康提示在 320×844、390×844、430×844px 验证叹号在刷新左侧、模态框内容可见且关闭后回到完整首页；截图为 `output/playwright/p7-home-notice-dialog-320.png`、`output/playwright/p7-home-notice-320.png`、`output/playwright/p7-home-notice-390.png`、`output/playwright/p7-home-notice-430.png`，均无横向溢出。
- 未验证：真实 iOS/Android PWA 的触控渲染与系统字体放大，待人工验收。
- 下一步：人工确认叹号状态图标和提示模态框的文案层级；确认后可并入 P7 总体验收。

### 2026-07-29 — P9 底部导航食谱厨师帽图标

- 状态：待评审。
- 目标：将所有使用共享底部导航的页面中的“食谱”图标统一为用户确认设计稿中的厨师帽。
- 范围：仅调整 `frontend/src/sharedUi.tsx` 的共享 `P7Navigation` 图标 SVG；不修改完成按钮、其他导航图标、食谱数据或交互。
- 设计/需求基线：用户指定的 Superdesign 草稿 `f8a85f85-4147-49f1-9cd1-6bad47e9707c`；`docs/ui-design-specification.md` 的共享底部导航规则；P9 功能规则 §9。
- 完成：共享 `NavigationIcon` 的 `recipes` 分支已从刀叉替换为厨师帽 SVG，并将图形整体下移 3px，避免帽顶描边贴近视口边缘；所有首页、食谱、冰箱和“我的”页面均复用同一底部导航组件，因此同步生效；完成按钮和其他导航图标未改动。
- 验证：`npm run --prefix frontend test`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：本地 Vite 服务访问 `/api/refrigerator-templates`、`/api/icon-library`、`/api/owner/refrigerators` 均返回 502，无法进入带底部导航的登录视图；320×844、390×844、430×844px 的浏览器视觉核验需在后端可连接时补做。
- 下一步：在已登录且可连接 API 的环境下检查三种手机宽度中的厨师帽显示和点击导航。

### 2026-07-29 — P1 合规问题闭环修复

- 状态：待评审。
- 目标：修复代码审查发现的软删除资源授权、食谱周边界和跨接口周锚点不一致问题，并以“修复—独立审查—再修复”闭环消除新增合规风险。
- 范围：`backend/fridgeboard/device_routes.py`、`inventory_routes.py`、`recipe_routes.py`、`owner_routes.py`、对应后端测试，以及 `frontend/src/RecipeWorkspace.tsx` 和本地日历测试；不修改数据库模型、部署配置或无关功能。
- 设计/需求基线：`AGENTS.md` 的访问控制、测试和编码标准；P9 每周食谱的本地日历周语义；删除恢复期“活跃 API 不可访问”的功能规则；拆分前 API 状态码契约。
- 完成：软删除冰箱现被设置、库存、布局、食谱和条码 API 拒绝；保留读接口 404 与既有写接口 400 的差异化状态码。食谱前端改用本地日历周一，历史和复制请求将同一周锚点传给后端；后端据此完成复制范围校验。新增软删除全路径、状态码、周锚点与周一凌晨回归测试。
- 验证：`uv run ruff check backend`、`uv run pytest`（51 passed）、`uv lock --check`、`npm run --prefix frontend test`（11 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；两轮子代理独立审查最终未发现 P1/P2 问题。
- 未验证：真实生产部署及手机/Kindle 真机链路未在本次 API 合规修复中重复验收，沿用 P8/P11 待验收项。
- 下一步：人工评审本次授权、状态码和本地日历语义变更；确认后可将 P1 设为“完成”。

### 2026-07-29 — P1 后端入口合规修复

- 状态：待评审。
- 目标：完成后端入口的模块职责拆分，使 `backend/fridgeboard/main.py` 低于项目规定的 900 行强制阈值，并保持现有 API、认证依赖和业务行为不变。
- 范围：迁移库存、设备/配对、设置与设备管理路由；通过显式路由上下文传入会话工厂、事务和认证依赖；不修改数据库模型、部署配置或业务规则。
- 设计/需求基线：`AGENTS.md` 的文件/函数长度、复用和公共接口 docstring 约束；`recipe_routes.py` 已采用的显式上下文模式；现有 API 测试和 P1 进度记录。
- 预期验证：`uv run ruff check backend`、`uv run pytest`、`uv lock --check`、前端 lint/build/test、`git diff --check`，并复核入口及新路由模块行数。
- 完成：`main.py` 已从 1595 行拆至 459 行；库存/布局、所有者资料/识别、设备/配对/提醒分别迁移至 `inventory_routes.py`、`owner_routes.py`、`device_routes.py`，共用响应映射和 Cookie 工具集中于 `http_support.py`；通过显式上下文注入数据库会话、事务、认证、时间和 URL 依赖。
- 验证：`uv run ruff check backend`、`uv run pytest`（46 passed）、`uv lock --check`、`npm run --prefix frontend test`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；入口及新增路由模块均低于 900 行，最大模块 `device_routes.py` 为 522 行。
- 未验证：真实生产部署、Kindle 和手机真机链路未在本次结构性拆分中重复验收，沿用既有 P8/P11 待验收项。
- 下一步：人工评审路由模块边界和拆分后的 API 注册顺序；确认后将 P1 状态更新为“完成”。

### 2026-07-29 — P1 模块职责拆分

- 状态：进行中。
- 目标：解决代码审查发现的超长源文件问题，使前端页面入口和后端应用入口符合 900 行强制拆分约束；合并拆分范围内重复的类型、请求和渲染逻辑。
- 范围：重组 `frontend/src/App.tsx` 与 `backend/fridgeboard/main.py` 的职责边界，保持 API、页面行为和数据模型不变；不修改部署配置或业务规则。
- 设计/需求基线：`AGENTS.md` 的文件/函数长度和复用规则；既有 P7、P9 最终设计与功能规则。
- 预期验证：后端 Ruff、pytest、锁文件检查；前端 test、lint、build；`git diff --check`，并复核拆分后入口文件均低于 900 行。
- 本轮完成：新增 `frontend/src/sharedUi.tsx`，集中承载共享顶部栏、流程页标题栏、配对结果/安装引导、底部导航、食谱图标和分类图标；`BootstrapPairing.tsx`、`InventoryFlow.tsx`、`RecipeWorkspace.tsx` 不再反向依赖 `App.tsx`。入口 `App.tsx` 当前 788 行。
- 本轮验证：`npm run --prefix frontend test`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；`rg` 未发现前端工作区对 `./App` 的导入。P1 仍保持“进行中”，后端入口拆分和全量验收尚未完成。

### 2026-07-29 — P1 编码标准补强

- 状态：待评审；本会话完成项目级编码标准和 `AGENTS.md` 执行要求。
- 目标：用现有 Ruff、ESLint 和 TypeScript 检查作为可执行底线，并补充简单明确的文件、函数、注释和 Python docstring 约束。
- 范围：仅更新 `AGENTS.md` 与本进度记录；不修改应用代码、依赖、lint 配置或运行配置。
- 设计/需求基线：用户本次提出的“根据最佳实现制定编码标准，并在 `AGENTS.md` 中强制遵循；规则不宜复杂”。
- 完成：新增后端/前端 lint 约束、Python 公共接口 Google 风格 docstring 与类型标注要求；规定源文件 600/900 行预警与拆分阈值、函数 60/80 行预警与拆分阈值；明确注释只解释原因/约束/副作用，并列出按变更风险执行的测试门禁。
- 验证：检查 `AGENTS.md` 和本记录的 Markdown 结构与工作区差异；未运行应用 lint/test，因为本会话未修改应用代码。
- 未验证：新标准尚未通过后续代码变更全面执行，需在下一次实现任务中按最低质量门禁验证。
- 下一步：人工评审阈值和 docstring 范围；确认后将 P1 状态恢复为“完成”。

### 2026-07-29 — P7 首页食材图标格内排布

- 状态：待评审；已按“同格 20 个及以上图标均不出格”的补充要求完成扩展。
- 目标：保留冰箱隔层/抽屉分隔线的结构语义，让同格包括 20 个及以上的全部食材图标、数量和风险角标均完全位于所属存放格内；图标较多时上下交错、紧凑叠放。
- 范围：调整手机端 P7 首页拟物冰箱预览的同格图标渲染上限及位置计算；不改动冰箱布局、库存数据、分格点击行为或冰箱端页面。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §8–§11；最终首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`，本地资产 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 预期验证：前端 lint、生产构建、差异检查；以 320×844、390×844、430×844px 检查满格图标、数量和风险角标均不越界，分隔线和分格点击保持可用。
- 完成：移除同格前四项的渲染截断。每个图标按所属格的实际可用宽高计算两列横向位置和纵向相对位置；无论图标数多少，都上下重叠在格内。食材图标为 18px，数量、临期和过期角标均收进 22×18px 图标占位内；格线和分格按钮保持不变。
- 验证：`npm run --prefix frontend test`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 通过。Playwright 在 320×844、390×844、430×844px 向实际存放格注入 20 个图标后逐一测量，三个视口的越界数均为 `0`；390px 视觉截图确认图标在格内上下叠放。
- 未验证：真实手机上 20 个不同图标的辨识度和点击体验仍需人工确认；图标数量极大时会因重叠而降低单项辨识度，但不会被裁剪或越出格子。
- 下一步：以同一格含 20 个不同小类的真实手机数据人工确认叠放密度。

### 2026-07-29 — P7 首页分格库存编辑

- 状态：待评审。
- 目标：让手机端首页冰箱图的每个实际存放格可点击，并从该格进入对应库存的查看、编辑和新增流程。
- 范围：P7 首页冰箱预览、P5 已有库存入口与相关可访问性/响应式样式；复用既有库存读写 API 和编辑表单，不改变数据模型、库存规则或冰箱端操作。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4–§11；功能规则 §1、§3.3、§5 的“物理位置映射”和大点击区域原则；最终首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`，本地资产 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 预期验证：前端测试、lint、生产构建、差异检查；在 320×844、390×844、430×844px 验证各格可聚焦/点击，空格可新增、有库存格可打开既有编辑，且无横向溢出。
- 完成：首页冰箱图按实际存放格渲染独立按钮，按钮的可访问名称明确包含区域和格位；点击后复用现有 P5 库存流程，仅显示该格已有库存，食材条目仍可进入原有编辑页。由该格进入新增时，位置默认选中为该格；顶部“添加食材”入口保持原有全冰箱录入行为。
- 验证：`npm run --prefix frontend test`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。Playwright 在 390×844px 点击“编辑冷藏室 refrigerator-1 的库存”后进入添加食材流程；320×844 与 430×844px 首页辅助功能树均枚举全部格子按钮，截图为 `output/playwright/p7-slot-home-320.png`、`output/playwright/p7-slot-inventory-390.png`、`output/playwright/p7-slot-home-430.png`；无横向溢出。
- 未验证：当前本地演示冰箱为空，未能在浏览器中点击一条真实库存记录验证“此格库存 → 编辑食材”链路；该链路复用原有库存条目和编辑表单，需以真实库存数据做一次人工触控复验。
- 下一步：人工在含至少一条库存的冰箱中点击对应格子，确认“此格库存”筛选、编辑和保存后首页图标/数量刷新。

### 2026-07-29 — P1 后端食谱路由拆分

- 状态：进行中。
- 目标：将 `main.py` 中所有者食谱与动态补货路由迁移到独立 `recipe_routes.py`，保持接口行为和依赖注入语义不变。
- 范围：仅处理 `/api/owner/refrigerators/{refrigerator_id}/recipes` 及其子路由和 `/restock` 路由；通过显式 `RecipeRouteContext` 传入数据库会话工厂、所有者认证依赖和食谱服务工厂，不让路由模块依赖 `main.py`。
- 设计/需求基线：现有 `backend/fridgeboard/api_models.py`、`RecipeService`、`AGENTS.md` 的模块边界与公共函数 docstring 约束；不改变 API schema、状态码、异常语义或业务规则。
- 预期验证：`uv run ruff check backend`、`uv run pytest backend/tests/test_recipe_api.py`，并复核目标路由只注册一次且 `main.py` 不反向提供路由实现。

### 2026-07-29 — P1 后端库存路由拆分

- 状态：进行中。
- 目标：将 `main.py` 中所有者库存、分类、默认位置及库存批次 CRUD 路由迁移到独立 `inventory_routes.py`，并合并所有者端与设备端共用的库存响应和有效期计算逻辑。
- 范围：`inventory_categories`、`create_custom_category`、`inventory_default_location`、`inventory_list`、`create_inventory_batch`、`update_inventory_batch`、`delete_inventory_batch`，以及同一库存响应链路的设备端库存读取/调整/恢复；通过显式 `InventoryRouteContext` 注入会话、事务、所有者/设备认证依赖和库存服务工厂，不改变 API 行为。
- 设计/需求基线：现有 `recipe_routes.py` 的显式路由上下文模式、`backend/fridgeboard/api_models.py`、`InventoryService` 和 `AGENTS.md` 的模块边界与公共函数 docstring 约束。
- 预期验证：`uv run ruff check backend`、`uv run pytest backend/tests/test_inventory_api.py`，并检查库存路由只注册一次、`main.py` 不反向提供库存路由实现。

### 2026-07-29 — P9 每周食谱周范围、周一编辑与历史映射修复

- 状态：待评审；本会话完成“导入只作用于当前选择周、修复周一行编辑无响应、修复食谱历史首行数据映射”三项问题。
- 目标：确保本周/下周互不覆盖；周一至周日均可进入编辑；历史周日期与对应菜单内容保持同一周。
- 范围：每周食谱前端周选择、导入与编辑交互，以及历史摘要/详情的数据映射；复用既有 API、共享页面壳和最终设计稿，不改变完成扣库存规则。
- 设计/需求基线：`docs/ui-design-specification.md`、功能规则 §9、最终稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`，本地资产 `docs/ui-assets/png/pwa-weekly-recipes.png`、`docs/ui-assets/html/pwa-weekly-recipes.html`；用户本次反馈。
- 完成：历史接口新增可选 `week_start` 当前周锚点，前端历史请求显式传入本地当前周；导入页进入时锁定当前选中周并展示“本周/下周”目标，提交只使用该目标；已完成食谱行恢复键盘/点击反馈，明确提示先撤销再编辑；新增两周导入隔离和历史锚点回归用例。
- 验证：`uv run ruff check backend`、`uv run pytest`（46 passed）、`npm run --prefix frontend test`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844 核验每周食谱页无横向溢出，截图为 `output/playwright/p9-week-fix-320.png`、`output/playwright/p9-week-fix-390.png`、`output/playwright/p9-week-fix-430.png`。
- 未验证：真实手机 PWA 中已完成周一行的撤销—编辑触控链路，以及生产环境跨时区日期边界；需人工验收。
- 下一步：人工确认真实数据下本周/下周导入互不影响、历史 7 月 20 日摘要与详情一致，并并入 P9 总体验收。

### 2026-07-29 — 最新版本生产发布

- 状态：已发布，待真实设备验收；本会话完成最新 `main` 提交 `eb9eb458` 的生产发布与启动验证。
- 目标：将 GitHub Actions 已成功构建的最新版发布到 `/opt/fridgeboard`，完成数据库备份、容器启动、迁移和生产健康检查。
- 范围：仅同步当前源码并重建生产容器；保留生产 `.env` 与 SQLite 数据，不创建分支、提交或自动回滚。
- 基线：GitHub Actions run `30386865077`（`eb9eb458`，成功）；生产部署约定见 `README.md`、`docs/architecture/README.md` 与 ADR-0003。
- 预期验证：生产数据库一致性备份、容器 `healthy`、容器内 Alembic 版本、`https://fridge.flycn.fyi/healthz` 和首页响应；若启动失败，记录根因及恢复结果。
- 发布：源码已同步至 `/opt/fridgeboard`；发布前创建数据库一致性备份 `fridgeboard.db.backup-20260729-022237`（344064 bytes，权限 `600`）；首次重建因 `requirements.lock` 缺少已在 `pyproject.toml` 声明的 `qrcode` 依赖而启动失败，已刷新锁定清单并重新构建。
- 验证：`uv lock --check`、`uv run --locked ruff check backend`、`uv run --locked pytest`（44 passed）通过；服务器镜像构建成功，容器状态 `healthy`，容器内 `alembic current` 为 `20260724_07 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`，生产首页返回 HTTP 200 且包含“家常食橱”。最终镜像摘要为 `sha256:5e238ec84504e231a96e54c5d845e55368f4e9c0038cd369d571b0f1792ab2d4`。
- 未验证：真实手机 PWA、Android/iOS 安装与相机扫码、Kindle 长期运行仍需人工验收；GitHub Actions workflow 本身未因本次依赖清单修正重新运行，后续应提交/推送 `requirements.lock` 修正后再由 CI 复核。

### 2026-07-30 — 最新版本生产发布

- 状态：已发布，待真实设备验收；本会话完成最新 `main` 提交 `c3f7ddb` 的生产发布与启动验证。
- 目标：将 GitHub Actions 已成功构建的最新版发布到 `/opt/fridgeboard`，完成数据库备份、容器重建、迁移和 HTTPS 健康检查。
- 范围：仅同步当前源码并重建生产容器；保留生产 `.env` 与 SQLite 数据，不创建分支、提交或自动回滚。
- 基线：GitHub Actions run 对应本次已完成构建的 `main` 最新提交 `c3f7ddb895ac695a43ef2b66553e2a4d62c87fb2`；生产部署约定见 `README.md`、`docs/architecture/README.md` 与 ADR-0003。
- 预期验证：生产数据库一致性备份、容器 `healthy`、容器内 Alembic 版本、`https://fridge.flycn.fyi/healthz` 和首页响应；若启动失败，记录根因及恢复结果。
- 发布：发布前通过容器内数据卷路径创建 SQLite 一致性备份 `fridgeboard.db.backup-20260730-191441`（344064 bytes，权限 `600`）；同步当前工作区到 `/opt/fridgeboard`，重建 `fridgeboard-app`，并完成容器替换。
- 验证：`docker compose up -d --build --force-recreate` 成功；容器状态 `healthy`；容器内 `alembic current` 为 `20260730_08 (head)`；容器内 `GET /healthz` 返回 200；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；首页返回 HTTP 200 且包含“家常食橱”。最终镜像摘要为 `sha256:2d18a39e55bf7db8e811c7899d775a1d044d274df01b6750aad51b94652c403d`。
- 未验证：真实手机 PWA、Android/iOS 安装与相机扫码、Kindle 长期运行仍需人工验收；本次仅验证了 HTTP 与容器健康，不替代真实设备回归。

### 2026-07-29 — P11 Android Chrome 安装引导兜底

- 状态：待评审；本会话完成“Android Chrome 打开页面后未显示 PWA 安装提醒”的修复。
- 目标：Android Chrome 未派发 `beforeinstallprompt` 时，仍向未安装用户展示可执行的浏览器菜单安装步骤；事件派发后继续提供一键安装。
- 范围：仅修改 `PwaInstallPrompt` 的 Android 展示逻辑、相关前端测试与 P11 验证记录；不修改 manifest、Service Worker、登录、配对或业务 API。
- 设计/需求基线：`docs/ui-design-specification.md` §4–§11；功能规则 `docs/functional-design-and-feasibility.md` §10.2；Android 安装引导冻结稿 `0a461204-851c-4b9c-aeed-da6e2cdded37`，本地资产 `docs/ui-assets/png/pwa-android-install.png`、`docs/ui-assets/html/pwa-android-install.html`。
- 预期验证：前端单元测试、lint、生产构建、`git diff --check`；以 Playwright 在 320/390/430px 核验 Android 引导、可用安装按钮与关闭/不再提醒状态。
- 完成：`PwaInstallPrompt` 在 Android 尚未收到 `beforeinstallprompt` 时展示“浏览器菜单 → 安装应用 → 完成安装”三步引导；收到事件后切换为“安装应用”按钮并保留浏览器原生安装流程。iOS Safari 继续显示现有“共享/分享 → 添加到主屏幕”引导。
- 验证：`npm run --prefix frontend test`（8 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844 下验证 Android 引导完整可见、无横向溢出，浏览器控制台无 error。
- 未验证：真实 Android Chrome 中的系统菜单命名、触控、字体放大，以及 `beforeinstallprompt` 到达后系统原生安装弹窗；需以生产部署后的真机完成安装、重新打开与 PWA 内扫码验证。
- 下一步：部署后用 Android Chrome 依次验证引导兜底、菜单安装和一键安装事件两条路径，并并入 P11 真机验收。

### 2026-07-29 — P9 食谱图标与完成态

- 状态：进行中；本会话领取“统一完成图标、完成态深灰反白，以及所有食材和缺少食材显示图标”。
- 目标：完成操作不再使用首个食材图标；未完成使用统一刀叉图标，完成后为深灰底白线，再次点击恢复未完成；普通和缺少食材均展示严格同名图标。
- 范围：手机端 P9 食谱行显示和完成/撤销反馈；不改变完成/撤销 API、库存扣减、底部导航或历史菜单流程。
- 设计/需求基线：确认稿 `9d2b8f6e-0a78-4946-a683-2d3f9cc6d8db`，其完成态源自 `8a4c6b28-1a38-4b01-a1b0-9f04b877c995`；用户已确认实施。
- 预期验证：前端单元测试覆盖严格同名食材图标查找；运行 lint、build 与 320/390/430px 视觉核验。
- 完成：移除“首个食材即完成按钮图标”的逻辑，所有食谱行改用统一刀叉完成图标；已完成行的图标为 `#777777` 深灰底和白色线条，再次点击仍走既有撤销 API 并恢复白底黑线。普通食材与“缺少：”食材均按严格同名查找图标，在名称和数量前显示 16px 图标；找不到图标时保留文字，避免伪造食材语义。底部导航未修改。
- 验证：更新前端单元测试为严格同名食材图标查找；`npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 与 `git diff --check` 通过。
- 未验证：尚未在带真实食谱与图标库数据的 320/390/430px 浏览器视口完成视觉截图；真实 iOS/Android PWA 的图标清晰度、触控和系统字体放大待人工验收。
- 下一步：使用含普通与缺少食材的真实数据核验图标换行、完成态切换和底部导航不变后，并入 P9 总体验收。

### 2026-07-29 — P11 PWA 竖屏锁定

- 状态：待评审；本会话完成“增加 PWA 竖屏方向配置，并调用 Screen Orientation API 尝试锁定竖屏”。
- 目标：在支持的平台上锁定 FridgeBoard 为竖屏，同时对不支持运行时锁定的浏览器安全降级，不影响页面启动。
- 范围：PWA manifest 的方向配置、前端启动时的 `screen.orientation.lock('portrait')` 调用及必要测试；不改变页面布局、业务 API 或设备端页面。
- 设计/需求基线：项目 PWA 安装约定、用户本次明确提出的竖屏锁定要求。
- 预期验证：前端测试、lint、生产构建与 `git diff --check`；确认不支持 Orientation API 时不会抛出未处理异常。
- 完成：`manifest.webmanifest` 增加 `orientation: portrait`；应用入口在支持 `Screen Orientation API` 时调用 `screen.orientation.lock('portrait')`，并捕获浏览器不支持或权限策略拒绝产生的 Promise 异常。
- 验证：`npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 全部通过。
- 未验证：真实 iOS Safari/Android Chrome 的系统级方向锁定行为，需在真实设备或已安装 PWA 中人工确认；部分浏览器仅允许全屏/独立窗口调用运行时锁定。
- 下一步：在真实 iPhone/Android PWA 中确认横屏旋转后的系统行为，并并入 P11 总体验收。

### 2026-07-29 — P7 安装提示不再提醒

- 状态：待评审；本会话完成首页 PWA 安装提示的免打扰设置。
- 目标：在模态底部增加“不再提醒”复选框，用户勾选并关闭后，后续页面加载不再显示该提示；未勾选关闭仍保留下次提示能力。
- 范围：仅修改 `frontend/src/App.tsx` 安装提示状态与本地持久化、对应样式和验证记录；Android 与 iOS 共用免打扰规则，不改变原生安装事件和业务流程。
- 设计/需求基线：`docs/ui-design-specification.md` §4–§10；现有 iOS 安装引导草稿 `f616c336-1e64-4721-800d-6fc75c4cb776`；本次用户明确提出的复选框和持久化行为。
- 预期验证：`npm run --prefix frontend test`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`，并用 Playwright 验证勾选关闭后刷新不再显示、未勾选关闭后刷新仍显示，以及 320/390/430px 无溢出。
- 完成：模态底部增加 48px 热区的“不再提醒”复选框；仅勾选后点击 X 才写入 `localStorage`，未勾选关闭不写入；iOS 与 Android `beforeinstallprompt` 入口共用该标记。
- 验证：`npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 全部通过；Playwright 已验证未勾选关闭后刷新仍显示，勾选关闭后刷新不再显示。
- 未验证：真实 iOS Safari/Android Chrome 的系统安装菜单、系统字体放大和真机触控渲染，待 P11 人工验收。
- 下一步：人工在真实 iPhone Safari 与 Android Chrome 首页确认复选框触控、关闭和实际安装流程，再并入 P11 总体验收。

### 2026-07-29 — P9 食谱历史日期显示

- 状态：进行中；本会话领取“将菜单历史改为食谱历史，按周编号和两行食谱摘要展示，并在点击菜单外自动关闭菜单”。
- 目标：食谱历史列表第一行显示该周周一日期，第二行显示至多两行的周几与菜名摘要、超出截断；修复菜单仅能再次点击按钮关闭的问题。
- 范围：P9 菜单交互、历史摘要 API 与食谱历史列表；不改动底部导航及食谱完成/撤销图标、食谱复制或库存扣减规则。
- 设计/需求基线：确认稿 `69bb715e-3414-4157-918c-31af81bc0216`；`docs/ui-design-specification.md` §4–§10；用户已确认直接实施。
- 预期验证：补充历史摘要接口用例，并运行后端/前端静态检查和构建；以 320/390/430px 检查菜单外关闭、两行截断和无横向溢出。

### 2026-07-28 — P7 首页安装提示模态修复

- 状态：待评审；本会话完成首页手机浏览器安装提示的交互修复。
- 目标：安装提示显示为不占用首页文档流的居中模态，提供右上角关闭入口；iOS 提示文案改为产品确认的完整说明。
- 范围：仅修改 `frontend/src/App.tsx` 安装提示组件、对应样式与前端测试；不改变 PWA 安装事件、首页业务数据、登录和配对逻辑。
- 设计/需求基线：`docs/ui-design-specification.md` §4–§10；iOS 安装引导草稿 `f616c336-1e64-4721-800d-6fc75c4cb776`；本次用户明确要求的居中模态、右上角 X 和 iOS 文案。
- 完成：安装提示使用固定遮罩和居中 `dialog`，不再占据首页文档流；右上角 X 关闭后提示移除；iOS 文案改为“这是一个网页应用，为了安装它，请先在Safari中点击菜单“共享”或“分享”按钮，再选择“添加到主屏幕”。”；Android `beforeinstallprompt` 入口保留为“安装应用”操作。
- 验证：`npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 全部通过；Playwright 使用 iPhone 15 模拟环境在 320/390/430px 核验模态、关闭后首页顶部无占位和无横向溢出，390px 截图为 `output/playwright/p7-install-modal-390.png`，另生成 320/430px 截图。
- 未验证：真实 iOS Safari/Android Chrome 的系统安装菜单、系统字体放大和真机触控渲染，待 P11 人工验收。
- 下一步：人工在真实 iPhone Safari 与 Android Chrome 首页确认模态显示、关闭和实际安装流程，再并入 P11 总体验收。

### 2026-07-28 — P9 菜单历史与覆盖复制

- 状态：待评审；本会话完成“调整食谱页顶部菜单，并提供最近 8 周菜单历史及覆盖复制”。
- 目标：将补货入口移至左侧，右侧菜单以带图标的“导入食谱 / 菜单历史”下拉项承载扩展操作；用户可查看不含本周与下周的最近 8 周菜单，并将任一历史周完整覆盖复制到本周或下周。
- 范围：食谱 API 的历史摘要、历史周读取与覆盖复制，及手机端对应菜单、历史列表、详情和复制确认；明确不修改底部导航图标、食谱行完成/撤销图标、库存扣减或原有导入/补货行为。
- 设计/需求基线：`docs/ui-design-specification.md` §4–§10、`docs/functional-design-and-feasibility.md` §9；既有食谱最终稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`、本地资产 `docs/ui-assets/png/pwa-weekly-recipes.png` 与 `docs/ui-assets/html/pwa-weekly-recipes.html`；用户明确无需新增设计稿，直接实施。
- 预期验证：先补充后端自动化用例覆盖历史周范围、读取与覆盖复制；再运行 `uv run ruff check backend`、`uv run pytest backend/tests/test_recipe_api.py`、`npm run --prefix frontend test`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`，并在 320×844、390×844、430×844px 核验菜单、历史流程和无横向溢出。
- 完成：补货购物车移至顶部左侧；右侧新增三横线菜单，菜单的“导入食谱”和“菜单历史”均使用 24px 线框图标。菜单历史固定显示上周至八周前的八行，未安排周会明确显示；进入任一周可查看七日菜单，并以两个独立操作覆盖复制到本周或下周。复制只带入星期、菜名和食材需求，不带入完成状态或历史库存扣减；目标周原有菜单记录会被完整替换。底部导航图标及每周食谱完成/撤销图标均未改动。
- 验证：先新增历史范围与覆盖复制的失败用例，接口实现后 `uv run pytest backend/tests/test_recipe_api.py`（4 passed）通过；最终 `uv run ruff check backend`、`uv run pytest`（44 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend test`（5 passed）和 `git diff --check` 全部通过。Playwright 在 390×844px 验证图标菜单、两项菜单内容和历史 8 周列表，在 320×844、430×844px 检查历史详情与覆盖操作区无横向溢出；截图为 `output/playwright/p9-menu-390.png`、`output/playwright/p9-history-390.png`、`output/playwright/p9-history-detail-320.png` 与 `output/playwright/p9-history-detail-430.png`。
- 未验证：真实 iOS/Android PWA 的触控、系统字体放大，以及用户实际历史菜单覆盖到含已完成菜目标周后的业务确认；现有实现会保留此前已发生的库存扣减，仅覆盖菜单记录。
- 下一步：人工在真实手机上依次验证菜单展开、历史周选择、复制到本周/下周及覆盖后的补货清单刷新，再并入 P9 总体验收。

### 2026-07-28 — P9 补货清单标题与复制反馈

- 状态：待评审；本会话领取“将动态补货清单改名为补货清单，并将复制改为图标按钮，成功后提示已复制到剪切板”。
- 目标：缩短补货清单页面标题；将右上角文字操作改为可访问的图标按钮；复制成功后显示明确的应用内状态通知。
- 范围：仅修改手机端补货清单页面标题、复制按钮表现和复制成功反馈；不改变补货数据、文本格式、食谱编辑、库存扣减或导航行为。
- 设计/需求基线：`docs/ui-design-specification.md` §5–§9；`docs/functional-design-and-feasibility.md` §9.3；最终稿 `903728d2-d6b9-4918-82b5-9d3ab6b3aafb`，本地资产 `docs/ui-assets/png/pwa-restock-list.png`、`docs/ui-assets/html/pwa-restock-list.html`。
- 预期验证：`npm run --prefix frontend test`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`；在 320×844、390×844、430×844px 检查标题居中、图标热区、复制反馈和无横向溢出。
- 完成：页面标题改为“补货清单”；复制入口改为双页图标按钮并保留“复制补货清单”无障碍名称；复制成功后显示 `role="status"` 通知“已复制到剪切板”，复制失败显示可重试提示。
- 验证：`npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 点击复制按钮后确认通知出现，按钮在 320/390/430px 均为 48×48px，标题位于三列导航栏中心，页面无横向溢出；截图见 `output/playwright/p9-restock-copy-390x844.png`、`output/playwright/p9-restock-copy-320x844.png`、`output/playwright/p9-restock-copy-430x844.png`。
- 未验证：真实 iOS/Android PWA 的系统剪切板权限提示、系统字体放大和真机触控渲染，待人工验收。

### 2026-07-28 — P9 补货清单复制反馈修复

- 状态：待评审；本会话领取“空补货清单点击复制时不报错，复制反馈改为 10 秒自动消失的通知”。
- 目标：空清单不调用剪切板 API；非空复制成功或失败时显示短暂通知，避免错误信息长期占据内容区。
- 范围：仅修改手机端补货清单复制行为与反馈呈现；不改变补货数据、文本格式、食谱编辑、库存扣减或导航行为。
- 完成：空文本直接返回，不调用剪切板 API；剪切板不存在或写入失败时才提示“复制失败，请重试”；成功/失败提示使用固定通知样式，10 秒后自动清除，并在组件卸载时清理定时器。
- 验证：`npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在空补货清单点击复制后确认无通知，页面无横向溢出；代码路径包含 10 秒定时清除与卸载清理。
- 未验证：当前本地浏览器样本缺少可用的非空补货数据，未完成真实非空清单的剪切板权限失败分支人工点击；真实 iOS/Android PWA 剪切板权限提示与系统字体放大仍待验收。

### 2026-07-28 — P7 首页冰箱预览图放大

- 状态：待评审；本会话领取“首页的冰箱预览图要大一些，现在周边留白太多”。
- 目标：在不改变首页信息层级、库存图标表达和底部导航的前提下，放大手机端当前冰箱首页的拟物冰箱预览，减少周边留白。
- 范围：仅调整 `FridgeHome` 使用的首页预览尺寸与必要的响应式约束；不改变共享布局组件、交互、数据或冰箱端显示设备页面。
- 设计/需求基线：`docs/ui-design-specification.md` §5、§6、§9、§11；`docs/functional-design-and-feasibility.md` §9.3、§17.1；最终稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`，本地资产 `docs/ui-assets/png/pwa-home.png`、`docs/ui-assets/html/pwa-home.html`。
- 预期验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`；在 320×844、390×844、430×844px 检查预览无横向溢出、底部操作和导航不被遮挡，并对照本地冻结稿完成视觉核验。
- 完成：首页预览按视口放大至 320px 为 264×349px、390px 为 334×442px、430px 为 358×474px；同步异常提示存在时收窄预览并增加底部操作区预留，避免固定导航遮挡。
- 验证：`npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查预览真实点击区域、页面宽度与主操作/导航边界，均无横向溢出或遮挡；截图见 `output/playwright/p7-home-320x844.png`、`output/playwright/p7-home-390x844.png`、`output/playwright/p7-home-430x844.png`。
- 未验证：真实 iOS/Android PWA 的系统字体放大和触控设备渲染，待人工验收。

### 2026-07-28 — P9 食谱行编辑与完成图标交互调整

- 状态：进行中；本会话领取“去掉编辑按钮，点击食谱行编辑；以首个食材图标完成并改用撤销图标”的调整。
- 目标：未完成食谱点击整行进入编辑；完成按钮展示该行第一个食材的图标，点击后以短暂飞出动画反馈并切换为撤销图标；已完成食谱的撤销入口使用图标而非文字。
- 范围：仅手机端 P9 每周食谱行的交互、图标与动画；不改变编辑表单、完成/撤销 API、严格匹配扣减、动态缺货或已完成食谱禁止编辑规则。
- 设计/需求基线：`docs/ui-design-specification.md` §4–§10；`docs/functional-design-and-feasibility.md` §9.1、§9.4；每周食谱稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 与单日编辑稿 `bbeda1ae-e99c-40d6-87b3-90cdedd7adfa`，本地资产 `docs/ui-assets/png/pwa-weekly-recipes.png`、`docs/ui-assets/html/pwa-weekly-recipes.html`、`docs/ui-assets/png/pwa-recipe-edit.png`、`docs/ui-assets/html/pwa-recipe-edit.html`。
- 预期验证：前端交互测试覆盖行编辑、完成与撤销；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`；在 320×844、390×844、430×844px 检查热区、动画和无横向溢出。
- 完成：移除未完成食谱行的文字“编辑”按钮，点击行内容或使用 Enter/Space 进入编辑；完成入口改为 48×48px 无边框、无背景的首个食材图标，完成请求与 420ms 飞出反馈同步后切换为撤销箭头；已完成行不能编辑，撤销入口同样为无边框图标。首个食材在图标库无严格同名匹配时显示中性圆点，不伪造错误图标。
- 验证：先新增首食材图标选择的失败用例（2 项失败），实现后 `npm run --prefix frontend test`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。Playwright 使用临时本地数据完成“点击行编辑 → 返回 → 点击完成 → 显示撤销图标”路径；在 320×844、390×844、430×844px 核验图标热区为 48×48px、无横向溢出（320px：`scrollWidth=clientWidth=305px`），截图见 `output/playwright/p9-recipe-actions-390x844.png`、`output/playwright/p9-recipe-completed-320x844.png`、`output/playwright/p9-recipe-completed-390x844.png` 与 `output/playwright/p9-recipe-completed-430x844.png`。
- 未验证：真实 iOS/Android PWA 的触控动画帧率、系统“减少动态效果”偏好与图标 SVG 的实际硬件渲染，待人工手机验收。

### 2026-07-28 — P9 库存新增后食谱缺料刷新

- 状态：待评审；本会话领取“添加库存后同步刷新食谱缺料”。
- 目标：在食谱页显示缺少食材时，从首页添加足量库存并返回食谱页，缺料状态应基于最新库存立即重新计算。
- 范围：手机端 P7/P9 页面间的库存写入成功通知和食谱数据重新加载；不改变后端严格匹配、缺料预留或完成扣库存规则。
- 设计/需求基线：`docs/ui-design-specification.md` §8–§10；`docs/functional-design-and-feasibility.md` §9.3；P9 现有动态缺货实现。
- 完成：库存新增、编辑或删除成功后递增食谱刷新版本；食谱页监听版本并重新读取食谱与补货接口；所有 API 请求使用 `cache: no-store`，避免复用旧 GET 响应。
- 验证：`npm run --prefix frontend test`（3 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv run pytest backend/tests/test_recipe_api.py`（3 passed）、`uv run ruff check backend`、`git diff --check` 通过。
- 未验证：真实手机 PWA 中“已有缺料 → 首页添加足量辣椒 → 返回食谱页”的人工触控流程，待人工验收。

### 2026-07-28 — P8 Kindle `/fridge` 恢复首次配对二维码页

- 状态：进行中；本会话领取“删除诊断页面，恢复二维码页面”。
- 目标：将 `/fridge` 从临时能力诊断页恢复为 DP75SDI 可加载、可扫码、可轮询绑定结果的首次配对二维码页，且不依赖 React、模块脚本、Promise、Fetch 或 ES2015 语法。
- 范围：删除 `frontend/public/fridge-diagnostics.html`；新增独立 ES5 二维码页；恢复后端与 Vite 开发服务器的 `/fridge` 静态页面映射；提供同域二维码图像接口；补充后端接口测试和实机验收记录。
- 设计/需求基线：`docs/ui-design-specification.md` §10.1 的 DP75SDI 兼容性基线；首次开机稿 `74a1eaf3-b877-4a4f-baf9-c9960febfbd7`；已配置配对稿 `8b177d38-c76d-47d6-b015-cb04fe1ee984`。
- 完成：已删除临时诊断页；`/fridge` 后端路由和 Vite 开发服务器重写均恢复到独立 `fridge-qr.html`；二维码页仅使用 ES5、XHR、基础 DOM 和旧 CSS；后端新增同域 PNG 二维码接口，页面创建会话、显示二维码并轮询手机绑定结果，失败时保留可读错误提示。
- 验证：`uv run pytest`（43 passed）、`uv run ruff check backend`、`npm run --prefix frontend test`（3 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；二维码接口回归测试确认返回 `image/png` 且禁止缓存；构建产物包含二维码页，未包含模块脚本或诊断页面；本机直接请求构建产物 `/fridge` 返回 200、标题为“家常食橱”且不含模块脚本。
- 实机验收：DP75SDI 已确认二维码可显示，且最终改为 `width: 100%` 页面壳、ES5 中以
  `clientWidth/clientHeight` 计算二维码尺寸后，页面成功按实际可视区域适配；不再采用其他
  Kindle 示例的固定像素宽度。该经验已写入 UI 规范 §10.1 和功能设计 §12.4，后续 Kindle
  页面必须复用。

### 2026-07-28 — P8 Kindle `/fridge` 竖屏二维码显示修复

- 状态：进行中；收到 DP75SDI 竖屏页面尺寸异常且二维码图片不可见的反馈。
- 目标：将首次配对页明确收窄为竖屏布局，并把二维码响应从 SVG 图片改为老浏览器更稳妥的 PNG 图片；继续保持 ES5、XHR 和静态首屏。
- 范围：仅调整 `fridge-qr.html` 的页面尺寸与二维码展示，以及后端二维码图像格式和对应测试；不改变首次配对会话、手机领取或绑定轮询逻辑。
- 预期验证：后端二维码接口返回 `image/png`；前端构建与测试通过；本机 `/fridge` 继续返回静态页面；DP75SDI 实机可见二维码。
- 根因证据：F5 使用的 `5173` 已返回新版竖屏 `fridge-qr.html`，但局域网代理命中了另一个旧的 `8000` 后端进程，二维码接口返回 HTTP 404；已清理旧开发进程并确认 `5173` 代理后的接口返回 PNG（328×328，HTTP 200）。同时为 `/fridge` 增加 `Cache-Control: no-store`，避免 Kindle 持续使用旧页面缓存。
- 追加修复：参考 KindleCalendar `docs/index.html` 的完整 viewport 声明和 `body` 直接居中方式，移除页面百分比宽度，改为 246px 固定竖屏内容卡；`/fridge` 继续保留禁缓存响应。
- 追加修复：参考 Kindle Noodle 的实机适配方式，将 `html/body/.page` 固定为 DP75SDI 的 758px CSS 竖屏画布并占满高度，隐藏横向溢出；二维码展示区放大为 430px 外框、410px 图片，避免在固定画布上缩小成小卡片。
- 追加修复：将二维码页外框改为满 758px 宽、由 `-webkit-box/-webkit-flex` 填满剩余高度的全屏内容区，移除内缩边框；参照 DP75SDI 约 758×899 的浏览器视口，移除 `html` 固定宽度并将二维码展示区放大为 600px 外框、580px 图片，服务端 PNG 同步提高原始像素尺寸。
- 追加策略：实查 KindleCalendar 与 Kindle Noodle 的主 HTML 均未按 User-Agent 输出不同页面；按用户要求，下一步先将二维码页外层替换成 Kindle Noodle 同构的 `body → #page-wrapper → .page → .content → .card` 旧 WebKit 全屏壳，再在该壳内保留二维码业务内容。
- 完成：已替换为同构全屏壳；以 758×899 视口进行本机视觉核验，内容卡占满画布，仅留 8px 外边距。二维码尺寸调整为 540px 外框、520px 图片，确保状态和有效期提示同屏可见。
- 后续改造：实机照片显示固定 758px 外壳仍未填满实际可视宽度；将在已验证的 Kindle Noodle 外壳基础上删除全部固定宽度，改为旧 WebKit 可解析的 100% 外壳与百分比二维码，避免依赖 DP75SDI 机型编号对应的具体分辨率。
- 完成：页面加载时以 ES5 的 `clientWidth/clientHeight` 计算二维码正方形尺寸（宽度上限为实际视口 82%，高度预留状态文案），并写入内联尺寸；服务端二维码 PNG 已提高至 820px 级别，避免大屏放大失真。758×899 视口截图确认二维码、标题、引导和状态文本均无横向空白或固定宽度缩小问题。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、配对相关后端测试 11 项和 `git diff --check` 通过。
- 当前未验证：DP75SDI 实机的最终竖屏显示；直接打开 `/fridge` 验收，无需输入查询参数。

### 2026-07-28 — P8 Kindle `/fridge` 兼容性诊断页

- 状态：进行中；实机能力基线已确认，Kindle 全页面 ES5 改造待领取。
- 目标：临时以不会依赖 React、ES Module 或现代浏览器 API 的页面替换 `/fridge`，让 DP75SDI Kindle Paperwhite 的实验性浏览器直接报告本工程所需能力和 API 连通性，且不因任一检测失败白屏。
- 范围：新增独立的 ES5 诊断静态页和精确的 `/fridge` 服务端路由；检测 JavaScript、Promise、Fetch、XMLHttpRequest、Cookie/存储、Canvas、二维码库依赖、模块脚本和 `/api/devices/current`；不改变配对、库存、设备授权或 PWA 路由。
- 设计/需求基线：临时诊断页面以可读性和故障可见性优先；DP75SDI 是 Kindle Paperwhite 实验性浏览器目标设备，已确认不应按 Fire/Silk 的现代浏览器能力假设实现。
- 完成：此前曾新增临时独立诊断页，仅使用内联 ES5、HTML 和基础 CSS；页面检测 JSON、Promise、Fetch、XHR、ES Module、URL、Canvas、SVG、存储、Cookie 和 ES2015 语法，并通过带 10 秒超时的 XHR 显示 `/api/devices/current` 的实际 HTTP 响应。该诊断页现已按后续会话要求删除并由二维码页替代。
- 验证：`uv run ruff check backend` 通过；`uv run pytest`（42 passed）通过；`npm run test`（3 passed）、`npm run lint`、`npm run build`、`git diff --check` 通过。使用构建产物启动本地服务，在 540×720px 视口确认诊断页静态说明、逐项能力结果、完整报告文本框均可读；DP75SDI 实机成功加载 `http://192.168.5.117:5173/fridge`，XHR 实际收到 `/api/devices/current` HTTP 401。
- 完整实机矩阵：基础 DOM/JSON、Canvas、SVG、localStorage、Cookie 与 XHR 可用；Promise、fetch、ES Module、URL/URLSearchParams、箭头函数与 const/let 不可用。诊断页已修正为以 XHR 是否存在判断能力，并在失败时显示“未检测到”而非错误地显示“可用”。
- 未验证：按该基线改造后的首次开机二维码、首页、分区详情、补货清单和已配置配对页尚未在实机验收。
- 下一步：将全部 Kindle 页面从 React/Vite 运行时迁移至独立 ES5 + XHR 页面壳；每个页面完成后在 DP75SDI 上完成加载、主操作和 3:4 截图验收。
- 追加排查：用户实际访问 `http://192.168.5.117:5173/fridge` 的 Vite 开发服务器；其 SPA fallback 未经过后端 `/fridge` 路由，仍返回 React 模块入口。需在 Vite 开发服务器中加入同等的静态诊断页重写后重新验证。
- 补充完成：`frontend/vite.config.ts` 曾新增开发服务器中间件，将精确的 `/fridge`（含查询参数）重写为临时诊断页；该重写现已改为 `fridge-qr.html`，不再返回 React 模块入口。
- 实机证据：DP75SDI Kindle Paperwhite 的实验性浏览器成功加载诊断页；User-Agent 为 AppleWebKit `534.26+`。基础 DOM/JSON、Canvas、SVG、存储、Cookie 与 XHR 可用，`/api/devices/current` 返回 HTTP 401；Promise、fetch、ES Module、URL/URLSearchParams、箭头函数与 const/let 均不支持。已将其写入功能设计 §12.4 与 UI 规范 §10.1，后续所有 Kindle 页面必须按 ES5 + XHR 独立实现并实机验收。

### 2026-07-27 — P8 Kindle `/fridge` 首次配对白页修复

- 状态：待评审。
- 目标：修复 Kindle 打开 `/fridge` 首页显示空白的问题；未绑定设备应显示首次绑定二维码，已绑定设备继续显示冰箱首页。
- 范围：冰箱端 `/fridge` 启动门、首次配对二维码加载/错误兜底及必要的兼容性处理；不改变配对会话、设备凭证和手机端领取规则。
- 设计基线：`docs/ui-design-specification.md` §5、§9–§11；功能规则 §5、§10、§13.1；首次开机稿 `74a1eaf3-b877-4a4f-baf9-c9960febfbd7`，本地资产 `docs/ui-assets/png/eink-unconfigured.png` / `docs/ui-assets/html/eink-unconfigured.html`；已配置配对稿 `8b177d38-c76d-47d6-b015-cb04fe1ee984`，本地资产 `docs/ui-assets/png/eink-pairing-qr.png` / `docs/ui-assets/html/eink-pairing-qr.html`。
- 完成：启动门先单独读取 `/api/devices/current`；401 明确进入首次配对二维码，已绑定后才加载布局、库存和图标库；非鉴权错误显示“暂时无法读取冰箱状态”和“重试”，避免加载异常白屏或误显示配对页；请求错误保留 HTTP 状态供启动门判断。
- 验证：`uv run pytest backend/tests/test_pairing_api.py`（7 passed）、`npm test`（3 passed）、`npm run lint`、`npm run build`、`git diff --check` 通过；本地 `/fridge` 在 540×720px 视口显示“家常食橱”、可读二维码和“用手机相机扫码，安装应用”，二维码 `img` 已生成。
- 未验证：真实 Kindle Silk 浏览器兼容性、实际设备 Cookie 保持和墨水屏硬件灰阶效果；需在目标 Kindle 上打开 `/fridge` 完成人工扫码验收。
- 下一步：人工在 Kindle 上清除站点数据后访问 `/fridge`，确认二维码可见且手机可扫码；已绑定设备再确认首页库存与同步状态不受影响。

### 2026-07-27 — P6 添加食材相机提示强化

- 状态：待评审。
- 目标：强化未开启相机时的引导提示，明确点击行为并提升其在取景框中的视觉权重。
- 范围：仅修改添加食材页取景框内提示文案、居中布局和字号/对比度；不改变相机按需开启、条码识别和表单流程。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §2/§17.1、添加食材最终稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`，本地资产 `docs/ui-assets/png/pwa-add-food.png` 与 `docs/ui-assets/html/pwa-add-food.html`。
- 完成：提示文案改为“点击识别物品和条码”，通过取景框 `place-items`/`align-content` 居中；字号提升至 18px、加粗并使用主文字色；同步更新取景框无障碍名称。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 390×844px 核验取景框比例为 `1.777778`，提示与取景框中心误差为 0px，截图已保存为 `output/playwright/p6-add-food-prompt-390.png`。
- 未验证：真实 iOS/Android 系统字体放大与相机权限弹窗。
- 下一步：人工在手机 PWA 中确认提示字号、触控和权限交互后，可并入 P6 总体验收。

### 2026-07-27 — P7 登录后默认冰箱选择

- 状态：待评审。
- 目标：登录后优先打开上一次使用且仍可访问的冰箱；不存在该记录时，自动打开冰箱列表中的第一台冰箱。
- 范围：仅调整所有者手机端的启动冰箱选择与其导航可用性；不改变冰箱排序、切换页、食谱业务或后端接口。
- 设计/需求基线：`docs/ui-design-specification.md` 的手机端一级页导航规则、P7 当前冰箱首页与 P9 每周食谱页既有实现。
- 完成：启动时统一选择“仍可访问的上次冰箱，否则列表第一台”；当旧本地记录不再属于当前列表时清除该记录。成功选择后仍复用既有工作区加载流程，因此首页与食谱页取得当前冰箱上下文并不再被禁用。
- 验证：`npm run --prefix frontend test`（3 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机 PWA 的生产登录态与本地存储恢复流程；本次未改动页面结构或样式，未新增视觉规范—设计稿冲突。
- 下一步：在至少两台冰箱的真实登录态下分别验证有效历史记录、无记录和已删除记录三种启动场景后并入 P7 总体验收。

### 2026-07-27 — P11 PWA 安装能力生产发布

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main`（提交 `5f086bb`）发布到生产服务器，完成容器启动、数据库迁移和 HTTPS 健康检查。
- 范围：同步当前已提交源码，发布前创建 SQLite 一致性备份，重建并重启单个 `fridgeboard-app` 容器；不修改生产密钥、不执行危险回滚。
- 设计/需求基线：P11 PWA 安装能力会话；`docs/ui-design-specification.md` §4–§10；安装引导草稿 `f616c336-1e64-4721-800d-6fc75c4cb776`、`0a461204-851c-4b9c-aeed-da6e2cdded37`；生产部署约定见 `README.md`、ADR-0001。
- 发布：本地提交 `5f086bb` 的 Git 已跟踪源码同步至 `/opt/fridgeboard`；发布前创建远端源码/配置备份 `/opt/fridgeboard-backups/deploy-20260727-031655`，SQLite 一致性备份 `fridgeboard.db.backup-20260727-031655`；重建并强制重启 `fridgeboard-app` 容器。
- 验证：本地 `uv run ruff check backend`、`uv run pytest`（41 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；服务器容器 `healthy`；容器内 `alembic current` 为 `20260724_07 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`；生产 `manifest.webmanifest` 与 `sw.js` 均返回 HTTP 200；启动日志无迁移或应用错误。
- 未验证：真实 iPhone Safari/主屏幕 PWA、真实 Android Chrome 安装弹窗、生产缓存更新、相机和配对流程仍待人工验收。
- 下一步：发布后在 iPhone Safari 和 Android Chrome 分别完成安装、重新打开、相机和配对流程验收；必要时清理旧 Service Worker 缓存。

### 2026-07-27 — P6 添加食材相机按需开启

- 状态：待评审。
- 目标：将添加食材页的相机取景框调整为 16:9，并把相机从自动打开改为用户点击后开启。
- 范围：仅手机端 P6 添加食材页相机预览、按需启动/停止相机和条码识别入口；不改变识别接口、表单字段、保存流程或权限失败后的手工录入能力。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §2/§17.1、添加食材最终稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`，本地资产 `docs/ui-assets/png/pwa-add-food.png` 与 `docs/ui-assets/html/pwa-add-food.html`。
- 完成：取景框使用 `aspect-ratio: 16 / 9`；进入添加食材页不再自动申请相机权限，点击或键盘 Enter/Space 后才启动相机；权限失败会恢复提示态并保留手工录入。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 下测得取景框比例均为 `1.777778` 且无横向溢出；验证相机调用次数为点击前 0、点击后 1；已保存 `output/playwright/p6-add-food-camera-390.png`。
- 未验证：真实 iOS/Android 相机权限弹窗、真实摄像头预览和系统字体放大。
- 下一步：人工在手机 PWA 中确认取景框裁切、权限授予/拒绝后的重试与条码识别体验后，可并入 P6 总体验收。

### 2026-07-27 — P9 食谱底部导航刀叉图标

- 状态：待评审。
- 目标：将底部工具栏“食谱”的图标改为更明确的刀叉图标。
- 范围：仅修改手机端共享底部导航的食谱 SVG 图标；不改变导航路由、文案、选中态、热区和其他入口。
- 设计基线：`docs/ui-design-specification.md` §8、§9、§10，功能规则 §17.1，现有 P9 食谱页与底部导航实现。
- 完成：将 `NavigationIcon(name="recipes")` 替换为 24×24 网格的内联刀叉 SVG；保留 `currentColor`、2px 描边、选中态和原有导航行为。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查 SVG 尺寸均为 24×24，页面无横向溢出；已完成 390×844 视觉截图 `output/playwright/p9-nav-knife-fork-390.png`。
- 未验证：真实手机 PWA 触控、系统字体放大和生产登录态。
- 下一步：人工确认真机底部导航图标后，可并入 P9 总体验收。

### 2026-07-27 — P7/P9 顶部页面标题纠正

- 状态：待评审。
- 现象：此前调整只修改了内容区标题，顶部共享栏仍硬编码显示“家常食橱”，不符合首页和食谱页的页面标题要求。
- 根本原因：`AppHeader` 中间节点固定渲染品牌字标，没有接收页面标题；首页和食谱页又各自保留了一行内容区标题。
- 目标：让首页顶部栏中间显示当前冰箱名称，让食谱页顶部栏中间显示“每周食谱”，同时删除两页内容区重复标题；保留首页状态行刷新、食谱页加号和购物车入口。
- 设计基线：`docs/ui-design-specification.md` §3、§6、§10，冻结草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` / `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及对应本地首页/食谱资产。
- 完成：首页 `AppHeader` 中间显示动态当前冰箱名称并删除内容区标题；食谱页 `AppHeader` 中间显示“每周食谱”，左侧加号进入粘贴导入，右侧购物车进入补货清单，并删除内容区重复标题。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查首页顶部标题为“家里冰箱”、食谱页顶部标题为“每周食谱”、两页内容区无重复标题，入口和刷新热区保持可用，页面无横向溢出；截图已保存为 `output/playwright/p7-title-fix-390.png`、`output/playwright/p9-title-fix-390.png`。
- 未验证：真实手机 PWA 触控、系统字体放大和生产登录态。
- 下一步：人工确认真机顶部栏标题后，可并入 P7/P9 总体验收。

### 2026-07-27 — P9 每周食谱页标题与入口布局

- 状态：待评审。
- 目标：将食谱页标题统一为“每周食谱”，去掉“下周食谱”动态标题文案；将“粘贴导入”收敛为左上角加号按钮，并将右上角补货清单入口改为购物车图标。
- 范围：仅手机端 P9 食谱首页顶部标题与两个入口的视觉/文案；不改变本周/下周切换、导入流程、补货清单跳转、食谱编辑和完成扣减逻辑。
- 设计基线：`docs/ui-design-specification.md` §3–§10、功能规则 §17.1、冻结草稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`，本地 `docs/ui-assets/png/pwa-weekly-recipes.png` / `docs/ui-assets/html/pwa-weekly-recipes.html`。
- 完成：页面标题固定为“每周食谱”，移除动态“下周食谱”标题；“粘贴导入”改为内容区左上角 48×48px 加号按钮；顶部右侧补货清单入口改为购物车 SVG 图标，保留原有跳转和 aria-label。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查标题为“每周食谱”、页面不含“下周食谱”、加号按钮左边距 16px 且尺寸 48px、购物车 SVG 存在，页面无横向溢出；390×844 截图已保存为 `output/playwright/p9-recipes-390.png` 并完成视觉检查。
- 未验证：真实手机 PWA 触控、系统字体放大和生产登录态。
- 下一步：人工确认真机食谱页顶部入口后，可并入 P9 总体验收。

### 2026-07-27 — P7 首页标题与刷新按钮布局

- 状态：待评审。
- 目标：将当前冰箱名称作为首页唯一业务标题，移除重复的第二行冰箱名称，并把刷新按钮放到“n件食材”所在状态行右侧，使首页更紧凑。
- 范围：仅手机端当前冰箱首页标题/状态行布局；不改变冰箱切换、刷新库存、风险状态或底部导航行为。
- 设计基线：`docs/ui-design-specification.md` §3–§10、功能规则 §17.1、冻结草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b`，本地 `docs/ui-assets/png/pwa-home.png` / `docs/ui-assets/html/pwa-home.html`。
- 完成：保留首页标题行的动态冰箱名称，移除标题行内刷新按钮；刷新按钮移动到“n件食材”状态行末端并保留 48×48px 热区，刷新回调、风险角标和底部导航行为不变。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查标题文本为当前冰箱名称、刷新按钮位于状态行（同起始 y=128px）、热区高度 48px，页面 `scrollWidth` 分别等于 320、390、430；390×844 截图已保存为 `output/playwright/p7-home-390.png` 并完成视觉检查。
- 未验证：真实手机 PWA 触控、系统字体放大和生产登录态。
- 下一步：人工确认真机首页标题与状态行间距后，可并入 P7 总体验收。

### 2026-07-26 — P7 首页底部导航 SVG 图标修复

- 状态：待评审。
- 目标：修复 iPhone 与 Chrome 底部导航图标渲染不一致，以及“食谱”图标被系统彩色字形渲染的问题。
- 范围：仅手机端 P7 底部导航的图标实现与样式；不改变导航路由、文字、热区或业务逻辑。
- 设计基线：`docs/ui-design-specification.md` §8、§9，功能规则 §17.1，最终首页草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png` / `docs/ui-assets/html/pwa-home.html`。
- 完成：移除 `⌂ / ♨ / ▯ / ◯` Unicode 导航符号，新增四个继承 `currentColor` 的内联 SVG 图标；不改变导航路由、文字、热区或业务逻辑。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查到 4 个 24×24 SVG，页面无横向溢出，首页选中态为 `#111111`、其余导航为 `#777777`。
- 未验证：真实 iPhone Safari/PWA 触控与系统字体放大；当前浏览器唯一控制台错误为开发服务器缺少 `favicon.ico` 的 404，与本次图标改动无关。
- 下一步：人工在 iPhone Safari 与主屏幕 PWA 中确认底部导航视觉与触控后，可并入 P7 总体验收。

### 2026-07-27 — 应用 favicon 与水墨屏图标

- 状态：待评审。
- 目标：为“家常食橱”补充适合浏览器标签页和水墨屏显示的黑白灰 favicon，消除默认 `favicon.ico` 404。
- 范围：应用静态入口与 favicon 矢量资产；不修改页面业务、导航或现有食材图标库。
- 设计基线：`docs/ui-design-specification.md` §3–§4 的品牌命名与黑白灰视觉令牌；现有冰箱外形作为识别来源；目标视口为 favicon 常用 16px/32px。
- 完成：新增 `frontend/public/favicon.svg`（浏览器标签页）和 `frontend/public/favicon-mask.svg`（Safari 单色 mask），采用开门冰箱与三层食橱隔板的高对比几何图形；`frontend/index.html` 显式注册两种图标入口。
- 验证：`npm run --prefix frontend build` 通过；`git diff --check` 通过；构建产物包含 `frontend/dist/favicon.svg`，入口引用 `/favicon.svg` 与 `/favicon-mask.svg`；图标 SVG 未使用渐变、滤镜或彩色值。
- 未验证：真实 iOS Safari 固定标签页、Android PWA 安装器和硬件水墨屏的实际灰阶抖动效果，需在目标设备上人工确认。
- 下一步：人工在 16px/32px 浏览器标签页和目标水墨屏设备确认识别度后，可将该横向基础项并入 P1/P7 发布验收。

### 2026-07-26 — P7 首页刷新图标视觉修复

- 状态：待评审。
- 目标：使首页刷新按钮箭头最终逆时针偏转 23 度并与圆圈端点重合，同时确保图标底部不被裁切。
- 范围：仅手机端当前冰箱首页标题行刷新 SVG 与其尺寸/留白；不修改刷新业务逻辑、接口或页面布局。
- 设计基线：`docs/ui-design-specification.md` §4、§6、§8，功能规则 §3.1，最终草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png` / `docs/ui-assets/html/pwa-home.html`。
- 完成：刷新 SVG 的箭头路径增加绕端点的 `rotate(-23 20 11)`，视口扩展为 `-2 -2 28 28` 并允许安全溢出显示；不改变刷新按钮业务逻辑。
- 修正：在逆时针 45°基础上顺时针回转 22°，最终逆时针旋转 23°，并继续绕圆弧端点 `(20, 11)` 锚定。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在首页 320×844、390×844、430×844px 截图确认箭头方向、端点对齐、底部完整显示和页面无横向溢出。
- 未验证：真实手机触控、系统字体放大和生产登录态。
- 下一步：人工确认首页刷新图标后，可并入 P7 总体验收。

### 2026-07-25 — P4/P7.1 外形锁定说明间距修复

- 状态：待评审。
- 目标：修复“名称与布局”页中“已有冰箱不能更换外形”说明与第二行外形预览重叠的问题。
- 范围：仅模板网格下方说明文字的布局间距；不改变模板锁定、名称、布局或分格功能。
- 设计基线：`docs/ui-design-specification.md` §4、§7、§9，以及已确认的新建冰箱第 1 步布局。
- 完成：为已有冰箱页面的模板锁定说明覆写通用 `quiet-note` 的负上边距，改为位于模板网格下方的 12px 正常间距；不影响新建冰箱流程中的说明样式。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在三门冰箱的 320×844px“名称与布局”页截图核验，说明文字与第二行模板预览没有重叠。
- 未验证：真实手机 PWA 触控。
- 下一步：可随 P4/P7.1 的其他待评审 UI 项一并人工验收。

### 2026-07-25 — 布局方案区域流光线选中反馈

- 状态：进行中。
- 目标：在“布局方案”选择冷冻室、冷藏室等区域时，用沿区域边界循环的流光线动画替代粗黑实线标识；不改变区域选择、分格编辑和实时预览逻辑。
- 范围：手机端共用 `OpenFridge` 预览组件及其选中态 CSS；包含创建冰箱第 2 步与已有冰箱布局编辑；不修改后端 API、布局数据或区域点击语义。
- 设计基线：`docs/ui-design-specification.md` §4–§11、功能规则 §4.1–§4.3、冻结草稿 `145b32f6-007a-4698-9ea7-3963dfc04a38` 版本 4，以及本地 `docs/ui-assets/png/pwa-layout-editor.png` / `html/pwa-layout-editor.html`。用户明确要求以流光线动画替换黑线选中反馈。
- 预期验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`；在 320×844、390×844、430×844px 检查区域切换、动画降级和页面无溢出。
- 完成：根据流光边框实现范式，移除会产生“蚂蚁线”效果的 SVG 虚线方案；`OpenFridge` 的三个可选区域类型改为连续同宽的黑白灰圆锥渐变环，渐变以约 4 秒一圈的速度沿区域边界平滑循环。编辑预览允许该环覆盖原有外轮廓，移除旧的粗黑 `outline`、灰色内框和选中底色；保留原有区域点击/分格逻辑。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在布局编辑页完成“冷冻室 → 冷藏室”切换，390×844 截图确认选中区域为连续冰蓝—白色边框，且原黑色外轮廓已被覆盖；320×844 与 430×844 检查 `scrollWidth === viewport width`，无横向溢出。
- 未验证：真实手机触控、长时间运行下的动效节奏和系统级 reduced-motion 设置仍待人工验收；Playwright 控制台仍有既有 `favicon.ico` 404，不影响本次页面逻辑。
- 下一步：人工确认方框流光的速度、亮度和静态降级后，再并入 P4/P7.1 评审。

### 2026-07-25 — P4/P7.1 配置流程统一

- 状态：待评审。
- 目标：使已有冰箱与新建冰箱使用同一套名称、布局与分格配置页面；以新建冰箱两步流程作为唯一视觉与交互基线。
- 范围：手机端已有冰箱的“名称与布局”和“布局方案”前端组件与页面状态；不改变后端布局 API、已有冰箱外形模板不可切换的业务规则或库存自动归位规则。
- 设计基线：用户确认的新建冰箱配置流程、`docs/ui-design-specification.md` §5–§11、功能规则 §4.1–§4.3，以及布局编辑草稿 `145b32f6-007a-4698-9ea7-3963dfc04a38`。
- 完成：已有冰箱“名称与布局”改为新建流程的第 1 步，复用名称输入、开门冰箱预览、布局说明、外形模板网格和“使用这个布局”主操作；外形模板按既有业务规则锁定，并明确提示不可切换。已有冰箱的分格编辑改为新建流程的第 2 步“布局方案”；两条流程共用 `LayoutPlanEditor`，统一 `2 / 2`、分区标签、分格图示、温度选项和实时预览。保存后仍沿用已有布局的自动归位提示与 API。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。Playwright 从已有冰箱的设置进入“名称与布局 → 布局方案”，辅助功能树显示锁定的外形模板和一致的第 2 步分格控件；选择“4层”后预览更新为“冷冻室，4 格”。在 320×844、390×844、430×844px 截图核验，标题、模板网格、分格选项和底部操作均未溢出。
- 未验证：真实手机 PWA 触控、非空分格缩减后的自动归位提示与生产登录态。
- 下一步：人工核对已有冰箱外形模板锁定提示与新建流程的一致性后，可并入 P4/P7.1 评审。

### 2026-07-25 — P4 创建流程布局方案合并

- 状态：待评审。
- 目标：将“预览这台冰箱”并入“布局方案”，使第二步直接编辑并创建冰箱。
- 范围：仅手机端新建冰箱的第二步状态、页面文案与布局；不修改模板数据、布局 API 或已有冰箱的布局编辑流程。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §4.1–§4.2、布局预览草稿 `e5c35dea-610f-42f9-878b-1f716c2e7d4f`，以及经确认更新的布局方案草稿 `145b32f6-007a-4698-9ea7-3963dfc04a38`（版本 4，390×844px）。
- 完成：移除创建流程的独立 `preview` 状态；“使用这个布局”后直接进入“布局方案”。第二步右侧显示 `2 / 2`，保留实时冰箱预览、分区选择与分格编辑；底部由“保存后回到预览”改为辅助说明和唯一主操作“创建冰箱”。已有冰箱的“编辑布局”流程未改动。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。Playwright 从“新建冰箱”进入第二步，辅助功能树只包含“布局方案”、`2 / 2`、可编辑分区/分格和“创建冰箱”；点击“4层”后预览同步显示“冷冻室，4 格”。在 320×844、390×844、430×844px 截图核验，标题中心误差为 0px、页面宽度等于视口宽度且底部操作完整可见。
- 未验证：真实手机 PWA 触控与生产登录态。
- 下一步：人工确认创建流程后可与 P4 的其他待评审项一并评审。

### 2026-07-25 — P7 新建冰箱流程跳转修复

- 状态：待评审。
- 目标：修复从“我的冰箱”点击“新建冰箱”后，创建页短暂出现便自动跳转回当前冰箱首页的问题。
- 范围：仅手机端 P7 的上次冰箱自动恢复条件；不修改创建 API、布局数据或页面视觉。
- 设计基线：`docs/functional-design-and-feasibility.md` 的创建冰箱流程与最终草稿 `7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d` 的本地创建页资产。
- 排查：`frontend/src/App.tsx` 的自动恢复副作用仅判断 `layout` 为空；用户进入创建流程时同样会暂时清空 `layout`，从而加载 `fb-last-refrigerator-id` 对应的冰箱并覆盖创建状态。
- 完成：自动恢复副作用增加 `creating` 与 `setupStep` 守卫；仅在用户未进入创建流程、且没有已加载布局时恢复 `fb-last-refrigerator-id`。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。Playwright 本地点击“＋ 新建冰箱”后，在 2 秒后再次读取页面，仍显示“名称与布局”、名称输入框、模板选择与“使用这个布局”操作，未跳回首页；继续点击“使用这个布局”并等待 2 秒，仍显示“预览这台冰箱”、`2 / 2` 和“创建冰箱”操作，未跳回首页。
- 未验证：真实手机 PWA 的触控路径与生产登录态。
- 下一步：人工在手机端复验一次“冰箱 → 新建冰箱”路径后，可随 P7 一并评审。

### 2026-07-25 — 设置页排版回归修正

- 状态：待评审。
- 目标：修正首页品牌字标与“冰箱设置”标题的视觉失衡，统一设置页“名称与布局”“可访问的设备”等同层信息的字号，并移除重复分隔线。
- 范围：手机端共享顶部栏与 P7.1 冰箱设置页面的前端样式；不修改业务流程、接口或数据结构。
- 设计基线：用户对当前实测页面的反馈优先于上一轮排版方案；`docs/ui-design-specification.md` 的品牌/二级页标题语义作为需收敛的约束。
- 完成：将品牌栏字标调整为 18px，并减少字距以保持居中可读；“冰箱设置”导航标题同步为 18px。“名称与布局”“可访问的设备”“临期规则”均统一为 18px，说明文字保持 12px。移除“名称与布局”的上边线和设置页各分组的重复上边线，仅保留行内容后的必要分隔。
- 验证：Playwright 在 390×844px 实测品牌栏、导航标题、行标题和分组标题均为 18px；“名称与布局”及“可访问的设备”的上边线均为 0px，无横向溢出。`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：320px 与 430px 的设置页截图、真实设备系统字体放大仍纳入 P7 总体验收。
- 下一步：人工确认首页和设置页的统一视觉层级；若通过，继续完成各业务页长文案回归。

### 2026-07-25 — 全页面排版与标题栏统一

- 状态：待评审。
- 目标：审查所有手机端与冰箱端页面的字体、标题栏和正文层级，并将同语义元素收敛到统一令牌与共享选择器。
- 范围：前端排版样式、标题栏和表单/列表/辅助文本；不改变业务流程、接口或数据结构。
- 设计基线：`docs/ui-design-specification.md` §4.2、§6，`docs/functional-design-and-feasibility.md` 的终端规则，以及 `docs/final-ui-designs.md` 登记的本地冻结 PNG/HTML 资产。
- 完成：在 `styles.css` 新增统一字体令牌：手机品牌字标 13px、导航标题 18px、页面标题 28px、分组标题 18px、正文/控件 16px、操作文字 14px、辅助文字 12px；冰箱端标题 34px、正文/标签 18px、辅助信息 16px。各 P3–P9/P7.1 页面继续使用现有页面壳，只通过语义选择器收敛同类文本，未改变流程或 API。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。Playwright 在 320×844、390×844、430×844px 核验手机端“冰箱设置”，顶部导航标题为 18px、分组标题为 18px、正文为 16px，无横向溢出；390px 标题几何中心误差为 0px。以冻结草稿 `1bfa869c-6942-4c89-b275-83e9a02c04e1` 的本地冰箱管理资产作为手机端基线；540×720px 核验冰箱端首次开机页面，对照冻结草稿 `74a1eaf3-b877-4a4f-baf9-c9960febfbd7`，主标题为 34px、正文为 18px，无横向溢出。
- 未验证：带真实长文案、系统字体放大和所有数据状态的逐页人工实机回归仍留待 P7/P8 总体验收；Playwright 唯一控制台错误为开发服务器缺少 `favicon.ico` 的 404，与本次样式改动无关。
- 下一步：人工抽查库存录入、食谱、提醒和冰箱端分区详情后，合入 P7/P8 评审。

### 2026-07-25 — P7 手机端选择记忆

- 状态：待评审。
- 目标：手机端下次打开时自动恢复上一次选择的冰箱；食谱恢复上一次选择的本周/下周视图。
- 范围：仅前端 `localStorage` 偏好持久化和启动恢复；不修改后端 API、食谱数据或共享页面布局。
- 设计基线：`docs/ui-design-specification.md`、现有 P7 首页/冰箱列表和 P9 本周/下周食谱实现。
- 完成：新增 `fb-last-refrigerator-id` 浏览器偏好；打开/创建冰箱后保存 ID，登录后若 ID 仍有效则自动加载首页，已删除或失效时清理并回退列表。食谱的本周/下周选择按冰箱 ID 保存，切换冰箱互不串用。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：真实手机 PWA 刷新/重启和生产登录态；当前仓库没有现成前端端到端测试命令，需人工验证选择冰箱 → 刷新首页、切换本周/下周 → 重新打开食谱，以及删除已记忆冰箱后的回退。
- 下一步：人工验收上述持久化路径后，可并入 P7/P9 评审。

### 2026-07-25 — P4/P7.1 冰箱布局与编辑入口统一

- 状态：待评审。
- 目标：使首页冰箱外观与原“设置这台冰箱”页面完全一致；将冰箱设置中的重复“编辑名称”“编辑布局”收敛为该页面，并将其标题改为“名称与布局”。
- 范围：手机端首页、冰箱设置及名称/布局编辑流程的前端路由和共享渲染；不修改后端布局、重命名或库存归位 API。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §4.3–§4.4、布局预览草稿 `e5c35dea-610f-42f9-878b-1f716c2e7d4f`、布局编辑草稿 `145b32f6-007a-4698-9ea7-3963dfc04a38`，以及 P7.1 冻结本地资产 `docs/ui-assets/proposals/fridge-management-enhancement.{png,html}`。
- 完成：首页不再单独绘制 `.p7-fridge`；改由共享 `OpenFridge` 依据持久化布局绘制，并以 `renderSlot` 注入库存图标。原“设置这台冰箱”标题改为“名称与布局”。冰箱设置移除重复的“编辑名称”“编辑布局”操作，改为唯一的“名称与布局”入口；名称编辑、当前布局预览和布局编辑由该页串联，布局编辑返回该页。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 以本地“家里冰箱”验证首页 → 冰箱设置 → 名称与布局 → 编辑布局 → 返回，辅助功能树仅保留一个“名称与布局”入口；在 320×844、390×844、430×844 截图核验首页及名称与布局，冰箱外观、标题、输入框、编辑布局和底部保存操作均未溢出。浏览器唯一控制台错误是开发服务器缺少 `favicon.ico` 的 404，与本次改动无关。
- 未验证：真实手机 PWA 触控、非空库存图标在真实数据下的密度，以及生产登录态。
- 下一步：人工核对首页与名称与布局的冰箱外观一致性后，可并入 P4/P7/P7.1 评审。

### 2026-07-25 — P7 首页操作收敛

- 状态：待评审。
- 目标：移除首页重复的冰箱设置入口，将刷新操作上移至标题行，并删除与当前冰箱标题重复的切换成功提示。
- 范围：仅手机端当前冰箱首页的操作映射、图标与成功提示；不改变设置、刷新或切换冰箱的业务逻辑与 API。
- 设计基线：`docs/ui-design-specification.md` §6.1、§8、§9，功能规则 `docs/functional-design-and-feasibility.md` §3.1，以及最终草稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 的本地资产。
- 完成：首页仅保留左上角菜单进入冰箱设置；标题行右侧改为刷新库存，移除状态行重复刷新；刷新图标改为 24px、2.5px 描边的循环箭头；切换冰箱成功后清空提示，不再显示“正在查看「冰箱名」。”。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 打开“家里冰箱”后，辅助功能树只包含一个“管理冰箱”按钮和一个标题行“刷新库存”按钮，点击刷新正常完成。已在 320×844、390×844、430×844 截图核验，标题、刷新图标、状态行和底部导航均未溢出；浏览器唯一控制台错误为开发服务器缺少 `favicon.ico`（404），与本次修改无关。
- 未验证：真实手机 PWA 触控与生产登录态。
- 下一步：人工验收首页操作层级与刷新图标后，可并入 P7 后续评审。

### 2026-07-24 — P7 手机端导航信息架构重构

- 状态：待评审。
- 目标：按已确认的手机端线框流程，将首页、食谱、冰箱、我的固定为四个一级页；将我的冰箱、冰箱设置、添加食材、创建冰箱及食谱操作页明确为二级/流程页。
- 范围：仅前端手机端导航状态机、底部主导航映射、一级/二级页面返回关系和登录后的初始落点；不改变后端 API、业务数据规则或冰箱端路由。
- 设计基线：Superdesign 修正版草稿 `fa048f53-59ac-401a-a416-485beddb2616`、`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` §17.1。
- 完成：新增“我的”一级页；“首页 / 食谱 / 冰箱 / 我的”统一使用四栏底部导航；“我的冰箱”改为无返回按钮的冰箱一级页；底部“冰箱”不再误入设置；冰箱设置、通知与权限、临期规则、食材录入、食谱导入/编辑/补货继续使用二级或流程页返回关系；冰箱设置从列表进入时返回列表，从首页进入时返回首页。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；静态核对 `p7View` 状态转移和页面壳，未触达后端 API 或冰箱端路由。
- 未验证：真实手机 PWA 的触控路径、生产登录态和 320/390/430px 截图回归，待人工验收。

### 2026-07-24 — P7.1 设置页修正

- 状态：待评审。
- 目标：移除从未发布产品中不成立的“兼容旧设备／绑定码”入口，并将删除冰箱调整为与“新建冰箱”同宽的危险操作按钮。
- 范围：仅冰箱设置页及对应死代码清理；不改变设备撤销、删除、恢复或布局业务规则。
- 设计基线：`docs/ui-design-specification.md` 与 P7.1 本地最终设计资产。
- 完成：移除前端已无有效产品语义的绑定码状态、生成请求与设置区块；“删除冰箱”改为全宽 52px 危险操作按钮，与“我的冰箱”的“新建冰箱”保持同一宽度和边框层级。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build` 通过；Playwright 在 390×844 核验设置页不再存在绑定码入口，删除按钮全宽且顶部栏保持左返回／中标题。
- 未验证：真实手机 PWA 删除、恢复与重新配对。
- 下一步：人工对照设计稿验收后，再进行真实设备验收。

### 2026-07-24 — P7.1 设计重构

- 状态：待评审。
- 目标：以 `ui-assets/proposals/fridge-management-enhancement.{png,html}` 为基线重新实现 P7.1 管理流程；修正当前实现与设计稿的结构、按钮、危险操作与最近删除页面偏差。
- 范围：手机端“我的冰箱”、冰箱设置、编辑名称、已有布局、删除确认和最近删除；所有二级页面均使用左侧返回、居中标题和仅在必要时显示的右侧操作。
- 设计资产：`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` §4.3–4.5、`docs/final-ui-designs.md` P7.1 本地冻结资产、`docs/ui-assets/proposals/fridge-management-enhancement.{png,html}`。
- 完成：将“我的冰箱”改为带摘要、打开和设置操作的卡片列表；将最近删除改为独立二级页；将设备访问合并进冰箱设置；名称页、布局页、删除确认和最近删除均通过左侧返回回到上一级。删除页保留名称二次确认与禁用态，设置页保留兼容绑定码和设备撤销。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build` 通过；`uv run pytest backend/tests/test_refrigerator_management_api.py` 通过（3 passed）；Playwright 在 390×844 完成切换器→设置→名称→返回→删除确认的交互核验，390×844、320×844、430×844 截图均确认顶部为左返回／中标题／右侧必要操作，卡片及底部操作未溢出。
- 未验证：真实手机 PWA 上删除、恢复与重新配对；本次前端改版尚未发布。
- 下一步：人工对照设计稿验收后，由用户明确授权再提交或发布。

### 2026-07-24 — P7.1 冰箱资料、已有布局与删除：实现

- 状态：待评审。
- 改动：确认本地 HTML/PNG 为 P7.1 冻结设计基线；新增名称唯一性、冰箱重命名、布局修订号并发检查、缩减分格自动归位、软删除/恢复和全设备凭证撤销；新增单进程启动即执行、每 24 小时重试的过期软删除清理任务；新增手机端“我的冰箱”独立打开/设置入口、最近删除恢复、冰箱设置、名称编辑、布局编辑及删除确认页；新增 Alembic `20260724_07`。
- 审查修复：恢复时如原名称已被活跃冰箱占用，自动追加最小数字序号；恢复成功后立即从“最近删除”列表移除该条目；清理任务发生临时数据库异常时记录错误并在下一轮继续重试。
- 验证：`uv run pytest`（40 passed）、`uv run ruff check backend`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv lock --check` 通过；本地开发登录后按 Playwright 在 320×844、390×844、430×844 核验冰箱设置页，标题保持三列栏几何居中且操作可见。
- 未验证：真实手机 PWA 删除后重新配对及生产进程跨日触发清理仍待人工验收。
- 待决策：无。
- 下一步：完成真实手机重新配对和生产时钟下的跨日清理验收后评审 P7.1。

### 2026-07-24 — P7.1 生产发布

- 状态：已发布，待真实设备验收。
- 发布：提交 `2753c2d62dae64cb3d3e0755c2b6c48a90e64f9e` 已同步至 `/opt/fridgeboard`；发布前创建数据库备份 `fridgeboard.db.backup-20260724-031738`；重建并重启 `fridgeboard-app` 容器。
- 验证：容器状态 `Up (healthy)`；容器内 `alembic current` 返回 `20260724_07 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：真实手机 PWA 删除后重新配对、生产跨日清理实际触发和目标显示设备实机验收。

### 2026-07-24 — P7.1 设置页修正生产发布

- 状态：已发布，待真实设备验收。
- 发布：提交 `8c154636522acc8bf6bffbea62cd11f2256e9570` 已同步至 `/opt/fridgeboard`；发布前创建数据库备份 `fridgeboard.db.backup-20260724-061124`；重建并重启 `fridgeboard-app` 容器。
- 验证：容器状态 `healthy`；容器内 `alembic current` 返回 `20260724_07 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：真实手机 PWA 删除、恢复与重新配对；目标显示设备实机验收。

### 2026-07-23 — P10 提醒、同步与设备健康

- 状态：待评审
- 改动：新增迁移 `20260723_06`、按浏览器/PWA 接收者隔离的提醒设置和每日投递审计；临期提醒沿用共享 `clamp(ceil(总有效期 × 比例), 最少天数, 最多天数)` 规则，BBD 为空的库存不参与；冰箱端仅在完整读取布局和库存后上报服务端同步成功时间，手机可在每日提醒时发现当天未同步的已绑定显示设备。提醒轮询在应用壳运行而非设置页；提醒页持久化开关和时间、提供应用内提醒，并在用户主动授权后将前台提醒增强为浏览器系统通知。
- 降级边界：未完成 iPhone 主屏幕 PWA 与 Android 安装 PWA 的 Web Push 能力矩阵前，不承诺应用关闭、浏览器睡眠或设备离线时的后台投递；这些情形将在下次打开应用时显示应用内提醒。冰箱端仅在页面非睡眠且处于离线状态时每 30 分钟重试。
- 验证：`uv run pytest`（37 passed）、`uv run ruff check backend`、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 均通过；模拟时钟覆盖提醒时间门控、无 BBD、每接收者每日去重、未同步和多显示设备成功同步恢复；提醒设置对照草稿 `4a046922-ecdb-4d7b-8836-2c022283f6b5` 在 390×844、320×844、430×844 核验通过。
- 未验证：真实 iPhone/Android 安装 PWA 的权限、后台送达与拒绝路径；目标显示设备断网、恢复网络和睡眠状态下的 30 分钟重试。
- 下一步：完成上述真机矩阵后决定是否接入 Web Push；随后进行 P10 人工验收和 P10.5 方案 Spike。

### 2026-07-23 — 验证分类复核

- 状态：完成
- 结论：P3–P9 已有实现，设备显示、PWA/扫码、条码、Agnes 和食谱文本应进入 P11 的真机/真实样本验收与问题闭环，而不是倒置为 P0.5 前置依赖。扫码已有浏览器检测、ZXing 和手动输入降级；食谱扣减已有严格匹配与事务测试。
- AI 图标：已登记为 P10.5 正式功能包。其开头的短方案 Spike 决定生成格式、候选审核与资产存储；随后必须实现四候选确认、清理和墨水屏可读性，不能以当前内置图库替代后宣称已支持。
- P10 前置验证：在开始 Web Push 实现前，用真实 iPhone 主屏幕 PWA 和 Android 安装 PWA 验证权限、送达和失败边界；该验证可能决定推送方案与应用内提醒降级，因此属于实施前 Spike。
- 验证：人工核对 [开发执行计划](development-execution-plan.md) 的任务依赖图、任务输入和进度表前置关系一致。
- 未验证：目标显示设备长期运行、Agnes 真实包装集、真实手机扫码及真实食谱样本仍待 P11；AI 图标仍待 P10.5 实现与验收。
- 待决策：P10.5 Spike 选择受约束 SVG 生成或文生图后处理路线。
- 下一步：继续 P10 的推送方案验证；P10 完成后领取 P10.5；随后准备 P11 的真实设备与样本验收矩阵。

### 2026-07-18 — 设计阶段收口

- 状态：完成
- 结果：功能设计、可行性分析与最终 UI 草稿索引已确认。
- 基线：[功能设计与可行性分析](functional-design-and-feasibility.md)，尤其是 §17.1。
- 下一任务：P0 架构与 ADR。

### 2026-07-19 — P0 架构与 ADR

- 状态：完成
- 改动：确认 `fridge.flycn.fyi` 的单容器 FastAPI/PWA、SQLite WAL、flycn SSO 桥接、冰箱端/手机设备凭证、媒体留存、单调度器、备份与自动部署边界；新增架构概览和 3 份 ADR。
- 验证：通过 SSH 只读核实服务器为 2 vCPU、约 2 GiB 内存、约 16 GiB 可用磁盘；既有 Nginx Proxy Manager 与 Docker `proxy` 网络可复用。
- 未验证：目标显示设备（例如 Kindle DP75SDI）浏览器、Agnes、扫码与 Web Push 兼容性保留至对应 Spike。
- 待决策：无。
- 下一步：P1 工程骨架与质量门禁。

### 2026-07-19 — P1 工程骨架与质量门禁

- 状态：完成
- 改动：建立 FastAPI 健康检查、React/Vite PWA 应用壳、后端测试/ruff、前端 ESLint/TypeScript、Docker 单容器构建、Compose 资源限制与 GitHub Actions CI；补充环境变量示例、README 和项目级已验证命令。
- 验证：`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`docker build --tag fridgeboard:local .` 均通过；本地 arm64 镜像为约 55 MB。
- 未验证：未启动生产 Compose，因为目标服务器的外部 `proxy` 网络不在本地开发环境范围内。
- 待决策：无。
- 下一步：P2 领域模型、迁移与核心规则。

### 2026-07-19 — P1 审查问题修复

- 状态：完成
- 改动：将 PWA 回退改为仅处理非 API 的 404 中间件，避免吞掉后注册 API；新增回归测试；Docker 从 `uv.lock` 导出的含哈希依赖清单安装；CI 改为锁文件检查与 `npm ci`；忽略 TypeScript 构建元数据。
- 验证：`uv lock --check`、`uv run --locked ruff check backend`、`uv run --locked pytest`（2 passed）、`npm ci --prefix frontend`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`docker build --tag fridgeboard:local .` 均通过。
- 未验证：无。
- 待决策：无。
- 下一步：P2 领域模型、迁移与核心规则。

### 2026-07-19 — P2 领域模型、迁移与核心规则

- 状态：完成
- 改动：新增 SQLAlchemy/Alembic 初始迁移，覆盖冰箱、布局分区/位置、两级分类、库存批次、BBD 规则、设备凭证、食谱、完成扣减审计和大类位置记忆；领域服务实现严格小类匹配、最早 BBD 优先扣减及一次性可逆撤销。
- 验证：`uv run ruff check backend`、`uv run pytest`（13 passed）均通过；在临时 SQLite 库执行 `FRIDGEBOARD_DATABASE_URL=sqlite:///… uv run alembic upgrade head` 后，`alembic current` 返回 `20260719_01 (head)`。
- 未验证：未接入 HTTP API 或页面；这是 P3–P5 的授权范围。
- 待决策：无。
- 下一步：P3 无账号配对与设备授权（必须交付可手工完成的配对和设备移除页面）。

### 2026-07-19 — P2 审查问题修复

- 状态：完成
- 改动：生产镜像在启动 Uvicorn 前运行 Alembic 前向迁移，并打包迁移配置和可写 SQLite 默认路径；仓储层校验库存分类/位置的同冰箱归属，以小类 ID 执行扣减，并将领域扣减写回数据库。
- 验证：`uv run ruff check backend`、`uv run pytest`（15 passed）、`uv lock --check` 均通过；临时 SQLite 的 Alembic 升级和 `alembic check` 通过；实际启动本地容器后确认 `/healthz` 返回 `{"status":"ok"}`，迁移版本为 `20260719_01 (head)`。
- 未验证：P3–P5 尚未实现，尚无真实的库存创建 HTTP 路径调用同冰箱归属校验。
- 待决策：无。
- 下一步：P3 无账号配对与设备授权。

### 2026-07-19 — P3 无账号配对与设备授权

- 状态：完成
- 改动：实现短效单次冰箱端兼容绑定码、冰箱端手机配对会话、HttpOnly 独立设备凭证、撤销与重新扫码；新增 PWA 的登录、冰箱端绑定和设备管理页。flycn 新增固定回跳地址、60 秒单次授权码和服务端兑换接口，不影响既有门户登录与发布流程。
- 验证：`uv run ruff check backend`、`uv run pytest`（17 passed）、前端 lint/build 通过；flycn `ruff check .`、`compileall`、全量测试（26 passed）通过；生产环境完成冰箱端绑定、配对会话创建、PWA standalone 消费、当前冰箱读取、兼容绑定码/配对令牌单次使用和非 PWA 拒绝验证。
- 未验证：目标显示设备（例如 Kindle DP75SDI）实机浏览器兼容性、二维码扫描能力和 Web Push，保留至 P8/P11 的实机 Spike；当前冰箱端显示设备展示页仍属于后续视图工作。
- 待决策：无。
- 下一步：进入 P4；冰箱端显示设备展示和低频同步在 P8 实现。

### 2026-07-20 — P3 首次二维码绑定改造

- 状态：待评审
- 改动：按已确认 UI 设计将首次绑定改为冰箱端显示设备展示二维码；手机在 PWA 中完成 flycn 登录后创建或选择冰箱并领取，冰箱端使用独立短效轮询令牌取得自身凭证。新增受信任 OpenWrt 局域网免登录模式。
- 验证：首次二维码领取、重复领取拒绝、冰箱端绑定后创建手机二维码，以及 OpenWrt 免登录领取的自动化测试通过。
- 未验证：设计稿视觉核验、生产迁移与发布、目标显示设备实机浏览器和 PWA 内置扫码兼容性。
- 待决策：无。
- 下一步：完成视觉核验和端到端发布验证后再标记 P3 完成。

### 2026-07-21 — P3 UI 规范核验

- 状态：完成
- 改动：按 [UI 设计规范](ui-design-specification.md) 为 P3 手机流程页和冰箱端二维码页收敛共享设计令牌、三列顶部栏、顶部安全区与响应式页面壳；修正安装页品牌居中、首次连接页顶部布局、设备管理页导航栏和冰箱端配对页的负边距布局。PWA 相机扫码入口保留在首次连接和冰箱列表中。首次开机二维码会话有效期为 10 分钟；首次请求、轮询或会话过期失败时，冰箱端自动申请新的二维码，无需手动刷新页面。
- 验证：对照最终草稿 `f616c336-1e64-4721-800d-6fc75c4cb776`、`0a461204-851c-4b9c-aeed-da6e2cdded37`、`e6f22671-6891-4b4f-8d3d-26d7cfcc9d67`、`1bfa869c-6942-4c89-b275-83e9a02c04e1`、`74a1eaf3-b877-4a4f-baf9-c9960febfbd7`、`8b177d38-c76d-47d6-b015-cb04fe1ee984`；本地核验 320/390/430px 手机视口及 540×720px 冰箱端视口，390px 品牌字标中心误差为 0.01px。
- 已确认差异：安装设计稿包含关闭图标，但产品已明确要求该安装向导没有“上一页”，因此实现保留无关闭入口。设备管理草稿中的底部导航属于 P7，远程让冰箱端显示手机配对二维码属于 P8 的展示/同步能力；当前不伪造不可用入口。
- 未验证：iOS/Android 实机相机权限与扫码；生产环境视觉核验；这些属于后续实机和发布验收，不阻塞 P3 本地验收完成。
- 下一步：进入 P4 评审；显示设备完整视图与低频同步进入 P8。

### 2026-07-23 — P3 验收完成

- 状态：完成
- 验证：用户确认 P3 配对流程已验证完成；首次开机二维码、PWA 扫码领取、局域网免登录、设备访问撤销与重新配对，以及二维码失效后的自动续期均已覆盖。
- 未验证：生产发布与目标显示设备长期运行属于 P11/P8 的后续验收。
- 下一步：进入 P4/P5 评审。

### 2026-07-19 — P4 冰箱模板、布局配置与位置选择

- 状态：待评审
- 改动：新增七种冰箱模板和受限分格规则；所有者可在手机端创建冰箱、预览、编辑分格并保存。纵向区域限定 1–6 层，单行区域限定 1/2/3 格；三门中层可切换冷藏/冷冻。新增所有者布局读写与设备布局读取 API，位置选择器和后续墨水屏可使用同一持久化结构。
- 验证：`uv run ruff check backend`、`uv run pytest`（19 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实手机 PWA 手动点击两个模板和所有分格选项；当前页面以开发登录完成本地手验，生产环境须经 flycn SSO。
- 待决策：无。
- 下一步：P5 库存、分类与图标库；可复用 `/api/devices/current/layout` 作为必填位置选择器数据源。

### 2026-07-21–23 — P5 库存、分类与图标库

- 状态：待评审
- 改动：实现手工库存添加、位置与数量确认、库存编辑/删除、按大类位置记忆、两级分类与自定义小类；补齐饮品、调味、其他三类，使添加页可覆盖设计稿的 10 个大类。将设计稿引用的 Lucide 食材图标以内置 SVG 路径提供，不依赖 Iconify CDN；新增库存生产日期字段及 Alembic 迁移 `20260722_04`。修复编辑分类返回路径、删除失败误报和生产日期在编辑时丢失的问题。
- 验证：`uv run ruff check backend`、`uv run pytest backend/tests/test_inventory_api.py`（2 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；临时 SQLite 已升级至 `20260722_04`。在 390×844、320×844、430×844 视口完成“选择大类/小类 → 选择位置和数量 → 确认加入 → 编辑”页面核验。
- 未验证：AI 生成图标仍未接入；功能设计要求先完成图标生成 spike，当前自定义小类可使用内置图库，不伪造 AI 结果。生产环境数据库迁移与正式发布尚未执行。
- 待决策：无。
- 下一步：人工评审 P5 页面与库存闭环；通过后进入 P6 相机、条码与 AI 增量识别。

### 2026-07-23 — P7 审查问题修复

- 状态：待评审
- 改动：设备列表 API 根据当前浏览器/PWA 的 HttpOnly 设备凭证明确返回 `is_current`，前端不再通过未排序列表的首项推断“本机”，因此不会误隐藏其他设备的移除入口或允许误移除本机；首页分区将实际格数传入渲染样式；提醒与临期规则拆为两个独立二级页面，对应最终草稿 `4a046922-ecdb-4d7b-8836-2c022283f6b5` 和 `c24f9644-0bd1-493a-979e-2d0218e3a6cc`。显示设备健康提醒仍归 P10，页面明确显示为暂不可用。
- 验证：`uv run ruff check backend`、`uv run pytest backend/tests/test_pairing_api.py backend/tests/test_inventory_api.py`（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 与 `git diff --check` 通过；使用本地页面在 320×844、390×844、430×844 视口核验首页、提醒与临期规则页，布局无溢出，两个设置页独立可达。
- 未验证：真实手机 PWA 的通知权限、显示设备同步与健康提醒均不属于 P7；生产环境发布尚未执行。
- 待决策：无。
- 下一步：完成两台手机设备列表、不同分格首页及两个设置页的人工验收后评审 P7。

### 2026-07-23 — P6 相机、条码与 AI 增量识别

- 状态：待评审
- 改动：实现 P6 相机取景流程与条码识别入口；接入 Agnes OpenAI 兼容聊天接口，使用 `agnes-2.0-flash` 对图片进行增量识别；增加严格 JSON 解析、Markdown 代码围栏清理、字段与置信度归一化，并通过部署环境注入识别 URL、模型和 API token。
- 验证：Agnes `/v1/models` 返回目标模型；有效 PNG 通过项目识别适配器并成功解析为空字段结果；前端生产构建成功；提交 `6cd6045` 已创建；服务器镜像构建、容器重启、容器内 `/healthz` 和生产域名 `https://fridge.flycn.fyi/healthz` 均通过；生产 `.env` 权限为 `600`，旧配置已备份。
- 未验证：真实相机权限、真实条码识别、实机拍摄质量与人工确认流程；GitHub HTTPS 推送因本机缺少 `flywhc` 凭据未完成。
- 待决策：需人工验收真实手机相机/条码流程后，再将 P6 标记为完成。
- 下一步：完成真实设备验收；随后进入 P8 冰箱端显示设备视图与低频同步。

### 2026-07-23 — P8 冰箱端显示设备视图与低频同步

- 状态：待评审
- 改动：实现已配对冰箱端的竖屏拟物首页、分区详情与两行数量操作；食品图标不提供单点操作，分区作为唯一点击热区。补齐已配置冰箱配对二维码、首次开机路由、手动刷新、当天首次同步、页面唤醒补同步、离线标记和 30 分钟重试；新增设备端库存快照、数量调整与撤销恢复接口。
- 依据：最终草稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2`、`11377443-ce1a-49d7-8c87-9860db491c17`、`8b177d38-c76d-47d6-b015-cb04fe1ee984`、`74a1eaf3-b877-4a4f-baf9-c9960febfbd7`。
- 验证：`uv run ruff check backend`、`uv run pytest`（32 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；本地 540×720 首次开机页完成视觉核验；补充设备端读写、全部拿走及恢复回归测试。
- 未验证：目标 Kindle 等显示设备实机浏览器兼容性、睡眠/唤醒补同步、长期运行和墨水屏残影；按 P8/P11 实机清单继续验收。
- 待决策：无。
- 下一步：人工评审 P8 页面与设备端操作；完成目标显示设备实机验收后标记 P8 完成。

### 2026-07-23 — P9 食谱、动态补货与库存扣减

- 状态：待评审
- 改动：新增 `RecipeService` 和食谱 API，支持固定七日的本周/下周读取、多行文本导入、逐日编辑、严格小类匹配、动态缺货、本周/下周补货清单、复制文本、按最早 BBD 扣减及按原批次撤销。无法精确匹配的导入食材会保留原始名称并提示缺货，用户可在单日编辑页改正后再参与扣减；新增迁移 `20260723_05` 持久化该语义。
- 依据：最终草稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`、`ef62678e-0a73-431a-93c6-794f646f5c74`、`bbeda1ae-e99c-40d6-87b3-90cdedd7adfa`、`903728d2-d6b9-4918-82b5-9d3ab6b3aafb`；冰箱端只读补货入口按开发计划由 P8 后续小交付承接，不阻塞本次手机端闭环。
- 验证：`.venv/bin/pytest`（35 passed）、`.venv/bin/ruff check backend`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；已迁移的临时 SQLite `alembic current` 为 `20260723_05 (head)`。以 Playwright 在 390×844 完成周食谱、导入和单日编辑页核验，并在 320×844、430×844 完成单日编辑响应式截图核验。
- 未验证：目标显示设备上的只读补货页与 Kindle 实机兼容性属于 P8/P11 的后续人工验收；生产数据库迁移和正式发布尚未执行。
- 待决策：无。
- 下一步：人工评审手机端食谱闭环；P8 补齐冰箱端只读补货入口并在目标设备实机验收。

<!--
新增记录模板：

### YYYY-MM-DD — P? <任务名>

- 状态：进行中 / 阻塞 / 待评审 / 完成
- 改动：
- 验证：
- 未验证：
- 待决策：
- 下一步：
-->

### 2026-07-30 — P5 添加食材数量与位置布局调整

- 状态：进行中
- 目标：将数量编辑前移到“添加食材”页，并与食材名称输入框、小类图标和向右 chevron 收敛在同一行；删除“确认位置与数量”页的数量编辑控件；该页改用首页同款拟物冰箱布局，点击具体格位确认存放位置。
- 范围：仅手机端 `InventoryFlow` 的添加/位置两步流程及其共享样式；复用现有库存保存、分类、位置数据和 `OpenFridge` 组件，不修改 API 与库存规则。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；功能设计 §3.3、§5、§10.1；最终草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`、`0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8`、首页 `23329191-d0fa-48ca-a517-fee9ff3eab9b`；本地资产 `docs/ui-assets/png/pwa-add-food.png`、`pwa-confirm-location.png`、`pwa-home.png`。
- 完成：抽出共享 `OpenFridge` 组件供首页和确认页复用；添加页将食材名称输入、`×`/数量输入、上下 chevron、小类图标和右箭头放在同一行；数量至少为 1，点击上下按钮或手动输入均更新草稿；确认页删除数量编辑器，仅保留数量摘要，点击具体冰箱格位更新位置和选中斜纹态。
- 验证：`npm run --prefix frontend test -- --run`（14 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查单行控件和无横向溢出；320px 下点击“冷藏室 refrigerator-1”后标签为“冷藏室 · refrigerator-1”，选中格数量为 1。截图：`output/playwright/p5-add-food-final-390.png`、`output/playwright/p5-add-food-quantity-one-row-320.png`、`output/playwright/p5-confirm-location-one-row-320.png`。
- 未验证：真实手机上的触控精度、相机权限和真实扫码结果仍需人工验收；后端库存接口未修改，未重复运行后端门禁。
- 状态：待评审
- 下一步：人工评审单行控件在真实手机上的可读性与 chevron 热区。

### 2026-07-30 — P5 数量输入与小类入口间距修正

- 状态：进行中
- 目标：允许数量输入框在编辑过程中暂时为空，失焦时将空值或非法值恢复为 1；隐藏浏览器原生上下按钮并将自定义 chevron 放到输入框上下方；消除小类图标与右箭头之间的视觉空白。
- 范围：仅修改 `InventoryFlow` 数量输入事件和 P5 单行控件样式，不改变保存接口、数量规则（最终数量至少为 1）和位置选择流程。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；P5 添加食材与确认位置最终设计资产。
- 完成：数量输入改为独立字符串状态，允许编辑中为空；输入变更仅接受正整数，失焦或保存前统一规范化为空值/非法值 `1`；浏览器原生 number spinner 已隐藏；自定义上下 chevron 改为数字输入框上方/下方；小类图标和右箭头保持 48px 级别相邻热区，图形通过边缘对齐相接。
- 验证：`npm run --prefix frontend test -- --run`（14 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend lint`、`git diff --check` 通过；Playwright 390px 清空数量后 Tab 失焦回填 `1`，输入 appearance 为 `textfield`；320/390/430px 无横向溢出。此前按元素盒测得的 `-10px` 不代表 SVG 墨迹间距，已在后续微调中修正。
- 未验证：真实手机系统键盘、触控和相机权限仍需人工验收；后端库存接口未修改，未重复运行后端门禁。
- 状态：待评审
- 下一步：人工确认真实手机键盘输入数字和上下 chevron 的触控体验；本次追加的数字水平居中与图标/箭头 2px 间距微调已完成。

### 2026-07-30 — P5 数字居中与小类入口间距微调

- 状态：待评审
- 目标：让数量输入框中的数字水平居中，并让小类图标与右箭头之间保留 2px 视觉留白。
- 范围：仅调整 P5 单行控件 CSS，不改变数量输入校验、按钮位置、点击热区或保存接口。
- 完成：修正数量输入选择器，数字实际水平居中；小类图标右边缘与右箭头左边缘保持 2px 视觉留白，点击热区仍独立。
- 验证：`npm run --prefix frontend test -- --run`（14 passed）、`npm run --prefix frontend build`、`npm run --prefix frontend lint`、`git diff --check` 通过；按实际 milk SVG `x=7…18` 绘制范围和 chevron 路径重新校准，390px 下数字为水平居中、可见墨迹约留 2px、横向溢出为 `0`；本次按用户要求不再追加截图验收。
- 未验证：真实手机系统键盘、触控和相机权限仍需人工验收；后端库存接口未修改，未重复运行后端门禁。
- 下一步：人工确认真实手机键盘输入数字和上下 chevron 的触控体验；本次追加控件右对齐与视觉留白微调。

### 2026-07-30 — P5 小类图标与箭头右对齐微调

- 状态：待评审
- 目标：让数量输入、小类图标和右箭头整体贴近行右侧，名称输入框充满其余空间；小类图标与右箭头的实际可见墨迹留白在原 2px 基础上增加 2px。
- 范围：仅调整 P5 单行控件的图形定位 CSS，不改变输入逻辑、点击热区、按钮位置或保存接口。
- 设计/需求基线：用户本次反馈；现有 P5 单行布局与 SVG 图标实际绘制范围。
- 完成：保留数量与入口按钮的独立热区，通过校准 SVG 内部透明边距将小类图标和 chevron 的可见图形整体右移；名称输入继续 flex 填充剩余空间；箭头可见右边缘与行右侧对齐，图标与箭头的可见留白由约 2px 增加至约 4px。
- 验证：本次按用户要求不追加浏览器验证；调整范围仅为 CSS 图形定位，未改变输入逻辑、按钮热区或保存接口。
- 未验证：真实手机键盘、触控和视觉效果仍需人工验收。

### 2026-07-30 — P5 数量控件与小类图标间距微调

- 状态：待评审
- 目标：保留用户已确认合适的小类图标和右箭头位置，收紧“X”、数字输入框及上下 chevron 与小类图标之间过大的空白。
- 范围：仅调整 P5 单行控件中数量区与小类图标之间的布局间距，不改变数量输入逻辑、图标/箭头位置、点击热区或保存接口。
- 设计/需求基线：用户本次反馈；现有 P5 单行控件 CSS 与用户手动校准后的小类图标、右箭头位置。
- 完成：将小类图标按钮热区从 40px 收紧为 32px，并同步修正图标内部位移以保持用户已确认的小类图标可见位置；数量区与小类图标的空白随之减少 8px，名称输入继续填充释放出的空间。
- 验证：按用户要求不追加浏览器验证；调整范围仅为 P5 单行控件 CSS，未改变数量输入逻辑、右箭头位置、点击热区或保存接口。
- 未验证：真实手机键盘、触控和视觉效果仍需人工验收。

### 2026-07-26 — P5 添加食材入口交互调整

- 状态：待评审
- 目标：简化“添加食材”页的扫码后录入路径，并让食材图标与箭头共同作为“选择小类”入口；移除无实际价值的条码手输框、小类重复行和选择小类页右上角关闭按钮。
- 范围：仅手机端库存录入与小类图库页面的前端交互、文案和布局；扫码识别后自动填充名称等已有字段的逻辑保持不变，不修改 API、数据结构和保存规则。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §10.1/§10.2、最终草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 与 `284a5039-9042-484e-b683-b8504875a7e4`，本地资产 `docs/ui-assets/png/pwa-add-food.png` / `html/pwa-add-food.html`、`docs/ui-assets/png/pwa-subcategory-library.png` / `html/pwa-subcategory-library.html`。
- 验证：`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 390×844 完成添加页与图库页流程，图标和 `>` 均可进入“选择小类”，图库页仅保留左上角返回；320×844、390×844、430×844 截图核验名称行布局与页面无横向溢出；源码确认已移除条码手输/查询入口。
- lint：`npm run --prefix frontend lint` 仍命中既有 `frontend/src/App.tsx:621` 的 `registerBarcode` 在声明前调用 `lookupBarcode` 规则错误；该错误在本次会话修改前的 `HEAD` 中已存在，本次未扩大范围修复。
- 未验证：真实手机相机权限、真实扫码结果与生产登录态。
- 追加目标：压缩名称行图标与箭头的视觉间距，使用 SVG chevron 图标替代字符，并使下划线仅覆盖文本输入区域。
- 完成：名称行容器取消整行下划线，输入框单独绘制下划线；图标按钮和 SVG chevron 间距收紧；保留 48px 级别交互热区约束范围内的紧凑布局。
- 验证：`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 核验下划线长度、图标间距和无横向溢出；相机权限失败提示为本地浏览器既有环境限制。
- 下一步：人工评审添加食材名称行视觉细节；另行清理既有 lint 基线问题。

### 2026-07-26 — P6 添加食材识别入口调整

- 状态：待评审
- 目标：保持“添加食材”取景框内容纯净，将“自动识别条码”和“识别物品”两个操作入口放置在取景框下方；不再使用“识别包装”文案。
- 范围：仅手机端添加食材页面的相机取景区及识别入口布局与文案；条码自动扫描、AI 截图识别和识别结果填充逻辑保持不变，不修改 API、数据结构和保存规则。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §6.1–§6.4、最终草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 及本地资产 `docs/ui-assets/png/pwa-add-food.png` / `docs/ui-assets/html/pwa-add-food.html`；用户明确要求覆盖旧取景框叠加交互。
- 完成：取景框移除“条码会自动识别”文字和框内识别按钮；新增框下并列按钮“自动识别条码”“识别物品”；保留进入页面后的自动条码检测和原有 AI 识别逻辑；错误提示同步移除“识别包装”文案。
- 验证：`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查取景框文本为空、按钮文案和位置正确、无实际横向溢出；320px、390px、430px 截图已保存至 `output/playwright/`。
- lint：`npm run --prefix frontend lint` 仍命中修改前已存在的 `frontend/src/App.tsx:621` `registerBarcode` 在声明前调用 `lookupBarcode` 规则错误，本次未扩大范围修复。
- 未验证：真实手机相机权限、真实条码结果、真实物品拍摄和生产登录态。
- 下一步：人工评审取景框与识别按钮的视觉层级，并纳入 P6 真机验收。

### 2026-07-26 — P6 条码识别可靠性修复

- 状态：待评审
- 目标：将“自动识别条码”恢复为取景框下的提示语，并修复相机流与条码扫描器启动时序，确保识别结果能反馈到录入页。
- 范围：仅手机端添加食材页面的条码扫描启动逻辑、提示文案和按钮布局；条码关联 API、AI 识别和库存保存规则不变。
- 根因：原生 `BarcodeDetector` 分支在检测异常时静默失败且不会进入 ZXing 回退；扫描器还可能在 `getUserMedia` 视频流挂载前启动。
- 完成：改为相机流就绪后使用 `BrowserMultiFormatReader.decodeFromStream` 持续扫描；识别结果继续调用条码关联 API；“自动识别条码”恢复为提示语，框下仅保留“识别物品”按钮。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check`、`uv run pytest backend/tests/test_recognition_api.py`（4 passed）；Playwright 确认取景框无文本、提示语和唯一按钮正确，浏览器权限受限时页面仍显示手工录入表单。
- 未验证：真实手机相机权限、真实条码样本、真实生产登录态；Playwright 无真实摄像头输入，无法模拟最终扫码成功回调。
- 下一步：在 HTTPS 生产地址或手机 PWA 中允许相机权限，使用真实 EAN/UPC/二维码包装完成 P6 真机验收。

### 2026-07-25 — P4 模板外形预览居中修复

- 状态：待评审
- 目标：修正“名称与布局”页面选择外形时，`template-preview` 内 `open-fridge` 预览图偏右并在右侧被截断的问题。
- 范围：仅模板选择预览容器的前端布局样式；不修改模板数据、布局 geometry、业务流程或 API。
- 设计基线：`docs/ui-design-specification.md` 的手机端流式布局与 `docs/final-ui-designs.md` 已登记的布局编辑场景；用户明确指定 `.template-preview` 与 `.open-fridge` 为问题元素。
- 完成：为 `.template-preview` 增加 `display: block`，使其宽高和位置成为绝对定位缩略图的稳定参照；未改动 `open-fridge` 的缩放和模板布局数据。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 逐一检查 7 个模板，`open-fridge` 与 `template-preview` 的中心误差均为 0px，左右溢出量对称；390×844 截图保存于 `output/playwright/template-preview-390.png`。
- 复查：用户反馈视觉问题仍存在。根因是 `.open-fridge` 的 `width: min(100%, …)` 在 56px 的 `.template-preview` 中解析为 56px，但内部网格仍使用固定的 222–278px 列宽；变换后可见图形因此向右溢出并被裁切。仅令容器块级化不能修复该宽度压缩。
- 未验证：真实手机系统字体放大与触控设备渲染。
- 修复：在 `.template-preview` 上下文覆盖 `open-fridge` 的可见网格宽度：普通/三门/中间功能区为 222px，对开门为 278px，法式多门为 268px，迷你为 180px；保留已有的按模板缩放规则。
- 验证：第二次 Playwright 核验在 320×844、390×844、430×844px 下，7 个预览的中心误差均为 0px，且均无左右裁切；390×844 修复后截图为 `output/playwright/template-preview-390-fixed.png`。`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 下一步：人工在手机端确认“名称与布局 → 选择外形”各模板缩略图后，可并入 P4 评审。

### 2026-07-26 — P6 条码识别可靠性修复生产发布

- 状态：已发布，待真实设备验收。
- 发布：本地提交 `78029e3` 的源码已同步至 `/opt/fridgeboard`；发布前创建数据库一致性备份 `fridgeboard.db.backup-20260725-195512`；重建并强制重启 `fridgeboard-app` 容器。

### 2026-07-26 — P6 iOS PWA 相机按需启用修复

- 状态：待评审
- 目标：保留打开“添加食材”即启动相机并自动识别条码的设计，同时排查 iOS PWA 重复请求相机权限和系统“正在录像”提示的问题。
- 范围：仅手机端添加食材页面的相机流生命周期与 iOS PWA 权限兼容性排查；条码识别、AI 截图识别、库存保存和 API 不变。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §6.1–§6.4、最终草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 及本地资产 `docs/ui-assets/png/pwa-add-food.png` / `html/pwa-add-food.html`。
- 验证：已恢复进入添加页自动调用相机、自动启动条码识别和离开页面释放媒体轨道；待重新运行前端检查。
- 未验证：真实 iOS PWA 权限持久化及系统状态栏文案，需真机验收；实时相机存在时系统录像提示无法由网页隐藏。
- 下一步：在 iOS PWA 中确认权限是否在系统设置中显示为允许；若权限已允许仍每次重问，需要按 iOS PWA/WebKit 行为处理，不能通过关闭相机来规避而破坏自动扫码设计。
- 验证：本地 `uv run pytest`（40 passed）、`npm run --prefix frontend build`、`git diff --check` 通过；服务器容器状态 `healthy`；容器内 `alembic current` 为 `20260724_07 (head)`；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：真实手机相机权限、真实条码结果、真实物品拍摄和生产登录态；仍需按 P6 清单完成真机验收。
- 下一步：在 HTTPS 生产地址或手机 PWA 中允许相机权限，使用真实 EAN/UPC/二维码包装完成条码与物品识别验收。

### 2026-07-26 — P7 PWA 登录态与默认冰箱恢复修复

- 状态：待评审。
- 目标：PWA 再次打开时，已登录用户直接进入首页，并恢复上次打开的冰箱。
- 范围：所有者 SSO 会话 Cookie 的生命周期、启动时已有冰箱恢复链路及回归测试；不改变登录身份、冰箱选择或后端业务权限规则。
- 设计基线：现有 P7 首页与“手机端选择记忆”实现，`frontend/src/App.tsx` 的 `fb-last-refrigerator-id` 恢复逻辑，以及 `backend/fridgeboard/main.py` 的 SSO 回调会话签发。
- 完成：SSO 回调签发的 `fb_owner_session` 增加 30 天 `max_age`；前端已有的 `fb-last-refrigerator-id` 有效性校验与首页加载逻辑保持不变。
- 验证：`uv run pytest`（41 passed）、`uv run ruff check backend`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；新增 SSO 回调回归测试确认 `Max-Age=2592000`。
- 未验证：真实生产 PWA 关闭后重新打开、生产 SSO Cookie 策略与真实上次冰箱选择场景，待人工验收。
- 下一步：在生产 PWA 中登录并创建/打开冰箱，完全关闭后重新打开，确认直接进入上次冰箱首页。

### 2026-07-26 — P6 添加食材条码状态位置修复

- 状态：待评审
- 目标：避免“正在识别条码……”状态在相机取景框上方出现/消失时推动页面跳动；若需要显示识别状态，将其放在“自动识别条码”提示下方。
- 范围：仅手机端添加食材页识别状态的渲染位置与稳定占位；不修改相机、条码识别、AI 识别和保存逻辑。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §6.1–§6.4、最终草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`，本地资产 `docs/ui-assets/png/pwa-add-food.png` / `docs/ui-assets/html/pwa-add-food.html`；用户明确要求状态不再位于取景框上方。
- 完成：移除取景框上方的状态渲染；将状态放在“自动识别条码”下方，并为 320px 窄屏预留两行状态高度，状态出现/消失不推动取景框或识别按钮。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 检查取景框顶部位置保持不变、状态位于条码提示下方且页面无横向溢出。
- 未验证：真实手机相机权限、真实条码样本和生产登录态。
- 下一步：人工评审“添加食材”页状态区域留白和窄屏两行提示的视觉节奏，再纳入 P6 真机验收。

### 2026-07-26 — P6 添加食材条码状态单行收敛

- 状态：待评审
- 目标：添加食材页摄像头下方只保留一行 `.p6-barcode-hint` 状态文本；有状态或警告时替换该行“自动识别条码”文案，不再显示第二条状态或额外大块占位。
- 范围：仅手机端添加食材页条码提示文本的渲染与样式；不修改相机、条码识别、AI 识别和保存逻辑。
- 设计基线：`docs/ui-design-specification.md` §5–§11、功能规则 §6.1–§6.4、最终草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`，本地资产 `docs/ui-assets/png/pwa-add-food.png` / `docs/ui-assets/html/pwa-add-food.html`；用户明确要求仅保留一行状态文本。
- 完成：`.p6-barcode-hint` 直接显示 `notice || “自动识别条码”`；移除 `.p6-barcode-status` 和窄屏额外高度规则，状态/警告始终只替换这一行文本。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 320×844、390×844、430×844px 均确认只有一个 `.p6-barcode-hint`、无 `.p6-barcode-status`、状态文本位于摄像头下方且无横向溢出。
- 未验证：真实手机相机权限、真实条码样本和生产登录态。
- 下一步：人工确认单行状态文本的视觉呈现，再纳入 P6 真机验收。

### 2026-07-27 — P11 PWA 安装能力补齐

- 状态：进行中
- 目标：补齐首页可安装 PWA 所需的应用清单、图标、Service Worker 和平台安装入口，解决 iPhone/Android 无安装能力或无安装提示的问题。
- 范围：仅前端 PWA 元数据、静态图标、应用壳缓存、安装事件和首页安装提示；不缓存 `/api/` 动态库存数据，不修改登录、配对和业务 API。
- 设计基线：`docs/ui-design-specification.md` §4–§10；安装引导最终草稿 `f616c336-1e64-4721-800d-6fc75c4cb776`（iOS）和 `0a461204-851c-4b9c-aeed-da6e2cdded37`（Android）；现有 `frontend/public/favicon.svg` 和 `favicon-mask.svg`。
- 完成：新增 `manifest.webmanifest`、192/512px Android PNG、180px iOS 主屏图标和 `sw.js`；`index.html` 增加 manifest、iOS standalone 元数据和图标引用；应用启动时注册 Service Worker；首页在 Android 支持 `beforeinstallprompt` 原生安装按钮，在 iPhone 显示 Safari 添加到主屏幕指引。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；构建产物包含 manifest、Service Worker、favicon、180/192/512px 图标；manifest JSON 校验通过。
- 未验证：真实 iPhone Safari/主屏幕 PWA、真实 Android Chrome 安装弹窗、生产环境发布后的 HTTPS/缓存更新行为。
- 下一步：发布到生产后，在 iPhone Safari 和 Android Chrome 分别完成添加到主屏幕/安装应用、重新打开、相机和配对流程验收；必要时清理旧 Service Worker 缓存。

### 2026-07-30 — P7.1 我的冰箱行点击与设置图标

- 状态：待评审
- 目标：移除每行独立的“打开冰箱”按钮，改为点击该行除设置按钮外的任意位置进入对应冰箱首页；将设置按钮的 emoji 字符替换为 SVG 图标。
- 范围：仅手机端“我的冰箱”切换列表的行点击区域、设置按钮事件隔离与图标；不改变冰箱选择、设置页路由、创建和删除流程。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§7、§8、§10、§11；功能规则 §17.1；“我的冰箱切换”冻结稿 `6e7893ee-74d5-4aa4-9db4-45be02e7f9b5` 与本地 `docs/ui-assets/png/pwa-fridge-switcher.png` / `docs/ui-assets/html/pwa-fridge-switcher.html`。
- 预期验证：前端测试、lint、构建、差异检查，以及 320/390/430px 视口下切换行点击、设置按钮不冒泡和 SVG 图标尺寸核验。
- 完成：移除行内“打开冰箱”按钮；冰箱卡片主体支持点击及键盘 Enter/Space 打开对应首页；设置按钮阻止事件冒泡并改用 20×20 线性 SVG 图标；创建、删除和设置页路由保持不变。
- 验证：`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；CSS 保留 320px 窄屏的单设置列布局，SVG 计算尺寸固定为 20×20px。
- 未验证：真实登录态下 320/390/430px 截图、真实 iOS/Android PWA 触控反馈和系统字体放大；需人工设备验收。
- 下一步：在登录态打开“我的冰箱”，确认卡片文字、冰箱图形、空白区域均可进入首页，点击设置图标只进入设置页。
# 2026-07-31 — P5 添加食材大类横向选择与图标调整

- 状态：待评审
- 目标：将添加食材页的大类更新为用户确认的肉类、水产、肠丸、熟肉、蔬菜、水果、主食、葱姜、干货、酱料、奶品、甜点、蛋类、烘焙、饮料、坚果和其他等分类，并支持横向滑动选择。
- 范围：内置大类种子、分类图标资产、添加食材页大类选择交互与样式；保留现有小类图库和库存数据结构，重复的“蔬菜/水果”按唯一分类处理。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§7–§11；功能规则 §6.1；添加食材冻结稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 及本地 `docs/ui-assets/png/pwa-add-food.png` / `docs/ui-assets/html/pwa-add-food.html`。
- 完成：内置大类按用户顺序提供 20 个唯一分类；添加食材页恢复为两行图标、按列横向滚动，保留“其他”分类；显式清除旧五列网格，避免与自动列轨道叠加后挤压图标；移除自定义指针拖拽、手写吸附、点击抑制及额外 range 滑块，改用单层浏览器原生横向滚动与 CSS 列吸附；“主食”使用面包图标，“酱料”使用倾斜瓶子滴水图标。
- 验证：`uv run pytest`（53 passed）、`uv run ruff check backend`、`uv lock --check`、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 在 390×844 对分类区域发送原生横向滚轮事件后，窗口实际移动到后续分类。
- 未验证：真实手机横向滑动手势、320/430px 真机安全区和登录态设备验收仍待人工完成。
- 下一步：在 320/390/430px 真实手机或 PWA 中确认两行分类按列横向滑动，核验“主食”和“酱料”图标视觉符合预期。

# 2026-07-31 — P5 分类专用图标

- 状态：待评审。
- 目标：消除鸡肉、牛肉、猪肉、羊肉、肠丸与熟肉等分类的重复图标，并为葱姜、干货、主食、甜点、坚果和烘焙提供符合品类语义的专用图形。
- 范围：内置 SVG 图标库与对应分类种子键；不改变分类层级、库存数据模型或录入交互。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §4、§7–§11；功能规则 §8.1；添加食材冻结稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 及本地 `docs/ui-assets/png/pwa-add-food.png` / `docs/ui-assets/html/pwa-add-food.html`。
- 完成：新增鸡、牛、猪、羊、肠丸、熟肉、葱姜、干货、包子、甜点、坚果与面包共 12 个单色 SVG 图标；对应大类及通用小类均改用专用图标键。图标种子按需初始化时会更新已有数据库，不需要迁移或重置库存。
- 验证：`uv run ruff check backend`、`uv run pytest`（53 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend build`、`git diff --check` 均通过；API 回归测试逐一验证上述图标键可列出并返回有效 SVG。
- 未验证：真实手机与墨水屏设备上的 24/32/48px 观感及一位黑白实机可读性，需人工确认。
- 下一步：在添加食材页和冰箱端以最小图标尺寸检查鸡、牛、猪、羊、肠丸、熟肉、葱姜、干货、主食、甜点、坚果、烘焙的辨识度，再并入 P5 总体验收。

# 2026-07-31 — P5 分类图标语义重绘

- 状态：待评审。
- 目标：将鸡肉、猪肉、羊肉、肠丸、主食、葱姜、干货、酱料和甜点图标重绘为用户指定的具体对象。
- 范围：仅调整对应内置 SVG 路径；不改变图标键、分类数据、录入流程或库存展示逻辑。
- 设计/需求基线：用户本次反馈；功能规则 §8.1 的单色、24/32/48px 与墨水屏可读性要求。
- 完成：鸡肉重绘为小鸡，猪肉为猪头，羊肉为山羊，肠丸为两节香肠，主食保留包子，葱姜改为大葱，干货改为蘑菇，酱料改为倾倒酒瓶与水滴，甜点改为三根蜡烛的生日蛋糕。
- 验证：`uv run ruff check backend`、`uv run pytest`（53 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机与墨水屏在 24/32/48px 下的视觉辨识度，需人工确认。
- 下一步：在添加食材页和冰箱端检查上述九个图标的小尺寸观感，再并入 P5 总体验收。

# 2026-07-31 — P5 采用方案 A 图标库

- 状态：待评审。
- 目标：采用用户确认的方案 A，将分类图标替换为 Tabler 与 Health Icons 的现成黑白 SVG。
- 范围：鸡肉、猪肉、羊肉、肠丸、主食、葱姜、干货、酱料、甜点及相关图标库路径；不改变图标键和分类数据。
- 设计/需求基线：用户确认的方案 A；Iconify 上 Tabler（MIT）与 Health Icons（MIT）图标资源；功能规则 §8.1 的 24/32/48px 与墨水屏可读性要求。
- 完成：鸡肉、猪肉采用 Health Icons 动物轮廓；肠丸、熟肉、坚果、烘焙、甜点采用 Tabler；酱料采用 Tabler 瓶子并保留倾倒角度与水滴；主食包子、葱姜大葱继续沿用现有专用路径。Health Icons 没有山羊条目，羊肉保留同风格黑白山羊轮廓。
- 验证：`uv run ruff check backend`、`uv run pytest`（53 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机与墨水屏在 24/32/48px 下的视觉辨识度，需人工确认。
- 下一步：在添加食材页和冰箱端检查方案 A 图标的小尺寸观感，再并入 P5 总体验收。

# 2026-07-31 — P5 分类图标对象细化

- 状态：待评审。
- 目标：将猪肉、牛肉、羊肉改为动物头部，主食改为一碗米饭，干货改用更清楚的蘑菇，坚果改为橡果。
- 范围：对应内置 SVG 图标路径；不改变图标键、分类数据和库存逻辑。
- 设计/需求基线：用户本次反馈；方案 A 的 Tabler / Health Icons SVG 资源；功能规则 §8.1 的单色与小尺寸可读性要求。
- 完成：鸡肉改为黑白 baby-chick 轮廓，猪肉改为 Streamline `pork-meat` 线稿，牛肉继续使用现有 bull-head 语义线稿；主食改为米饭碗，干货改为 Tabler 蘑菇，坚果改为 Tabler 橡果。
- 验证：`uv run ruff check backend`、`uv run pytest`（54 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机与墨水屏在 24/32/48px 下的视觉辨识度，需人工确认。
- 下一步：在添加食材页和冰箱端检查六个图标的小尺寸观感，再并入 P5 总体验收。

# 2026-07-31 — P5 分类图标对象细化补修

- 状态：待评审。
- 目标：补齐猪鼻双黑点、bull-head、Griddy sheep 和米饭碗的实际 SVG 替换。
- 范围：对应内置 SVG 路径及图标 API 回归断言；不改变图标键、分类数据和库存逻辑。
- 设计/需求基线：用户本次反馈；方案 A 图标库与功能规则 §8.1 的单色、小尺寸可读性要求。
- 完成：猪肉鼻圈内增加左右两个实心黑点；牛肉替换为 Griddy Icons `cow`（bull-head 语义）；羊肉替换为 Griddy Icons `sheep`；主食实际使用的 `steamed-bun` 键改为米饭碗路径。
- 验证：`uv run ruff check backend`、`uv run pytest`（54 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；测试额外断言猪鼻双点、牛头、羊 sheep 与米饭碗 SVG 路径存在。
- 未验证：真实手机与墨水屏在 24/32/48px 下的视觉辨识度，需人工确认。
- 下一步：在添加食材页和冰箱端检查四个图标的小尺寸观感，再并入 P5 总体验收。

# 2026-07-31 — P5 鸡肉 baby-chick 图标替换

- 状态：待评审。
- 目标：将鸡肉图标替换为 Fluent Emoji High Contrast 的 `baby-chick`。
- 范围：仅替换 `chicken` 图标 SVG 路径；不改变图标键、分类数据和库存逻辑。
- 设计/需求基线：用户本次反馈；Fluent Emoji High Contrast 图标资源；功能规则 §8.1 的小尺寸可读性要求。
- 完成：`chicken` 图标键改用 Fluent Emoji High Contrast `baby-chick` 的黑色高对比 SVG，并按 32px 原始视口缩放至图库统一的 24px 视口。
- 验证：`uv run ruff check backend`、`uv run pytest`（54 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：真实手机与墨水屏在 24/32/48px 下的视觉辨识度，需人工确认。
- 下一步：在添加食材页和冰箱端检查 baby-chick 的小尺寸观感，再并入 P5 总体验收。

# 2026-07-31 — P5 主食 rice-outline 与猪头眼睛补修

- 状态：待评审。
- 目标：将主食改为 Lsicon `rice-outline`，并在猪鼻上方补充左右两颗眼睛。
- 范围：`steamed-bun` 与 `pork` 图标 SVG 路径；不改变图标键、分类数据和库存逻辑。
- 设计/需求基线：用户本次反馈；Lsicon 图标资源；功能规则 §8.1 的单色与小尺寸可读性要求。
- 完成：`steamed-bun` 图标键改用 Lsicon `rice-outline` 并按 16px 原始视口放大至统一 24px；猪头在鼻圈上方左右各增加一颗实心眼睛，鼻圈内保留左右两个实心鼻孔。
- 验证：`uv run ruff check backend`、`uv run pytest`（54 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；测试额外断言米饭路径、猪头双眼和双鼻孔 SVG 路径存在。
- 未验证：真实手机与墨水屏在 24/32/48px 下的视觉辨识度，需人工确认。
- 下一步：在添加食材页和冰箱端检查 rice-outline 与猪头的小尺寸观感，再并入 P5 总体验收。

# 2026-07-31 — P5/P9 分类图标与食谱完成图标补修

- 状态：待评审。
- 目标：将猪眼睛放到猪鼻圈与头顶之间靠下位置，恢复米饭图标的独立黑点，并把每周食谱完成图标替换为 Phosphor `cooking-pot`，去除按钮外框并放大图标。
- 范围：内置 SVG 图标路径、`RecipeCompletionIcon` JSX 与对应 P9 样式；不改变完成/撤销行为。
- 设计/需求基线：用户本次反馈；Phosphor 图标资源；`docs/ui-design-specification.md` §4、§8–§11。
- 完成：猪眼睛放大并放置在猪鼻圈上方靠下 1/3 位置；Lsicon `rice-outline` 的米粒改为 5 个独立实心圆点；P9 `RecipeCompletionIcon` 改用 Phosphor `cooking-pot`，移除完成按钮外框和背景块，图标放大至 30px。
- 验证：`uv run ruff check backend`、`uv run pytest`（54 passed）、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；新增 SVG 回归断言覆盖猪眼睛尺寸、米粒独立圆点和路径。
- 未验证：真实手机与墨水屏在 24/32/48px 下的猪眼睛、米粒和 cooking-pot 视觉辨识度，需人工确认。
- 下一步：在“添加食材”和“每周食谱”页面进行真实设备视觉验收，再并入 P5/P9 总体验收。

# 2026-07-31 — P5 猪头眼睛与其他图标补修

- 状态：待评审。
- 目标：增大猪头眼睛并上移，与猪鼻保持明显间距；将“其他”图标替换为 Element Plus `bowl`。
- 范围：内置 `pork` 与 `other` SVG 路径及图标 API 回归断言；不改变分类键、数据结构和库存逻辑。
- 设计/需求基线：用户本次反馈；Element Plus `bowl` 图标资源；功能规则 §8.1 的单色与小尺寸可读性要求。
- 完成：猪眼睛调整为 `r=1.2`、`cy=10.8`，与鼻圈保持明显垂直间距；“其他”改用 Element Plus `bowl` 并缩放至统一 24px 视口。
- 验证：`uv run ruff check backend`、`uv run pytest`（54 passed）、`npm run --prefix frontend test -- --run`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；新增 SVG 回归断言覆盖猪眼睛尺寸/位置和 bowl 路径。
- 未验证：真实手机与墨水屏在 24/32/48px 下的猪眼睛和 bowl 视觉辨识度，需人工确认。
- 下一步：在“添加食材”和冰箱端进行真实设备视觉验收，再并入 P5 总体验收。

# 2026-07-31 — P5 猪眼睛尺寸微调

- 状态：待评审。
- 目标：将猪头左右眼睛半径从 1.2 微调为 1.1。
- 范围：`pork` SVG 路径及图标 API 回归断言；不改变位置和其他分类图标。
- 完成：左右眼睛保持 `cy=10.8` 的上移位置，半径统一改为 `r=1.1`。
- 验证：`uv run pytest backend/tests/test_inventory_api.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 通过。
- 未验证：真实手机与墨水屏上的最终视觉大小，需人工确认。

# 2026-07-31 — P5 猪鼻圈线宽微调

- 状态：待评审。
- 目标：略微减细猪头鼻圈描边，保持眼睛、鼻孔及整体位置不变。
- 范围：`pork` SVG 路径及图标 API 回归断言。
- 完成：猪鼻圈 `stroke-width` 从 1.6 调整为 1.3，猪头外轮廓保持原线宽。
- 验证：`uv run pytest backend/tests/test_inventory_api.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 通过。
- 未验证：真实手机与墨水屏上的最终线宽观感，需人工确认。

# 2026-07-31 — P9 食谱完成图标状态补修

- 状态：待评审。
- 目标：每周食谱未完成时使用 Hugeicons `pot-01`，点击完成后继续使用当前 Phosphor `cooking-pot`。
- 范围：`RecipeCompletionIcon` JSX 与 P9 图标状态样式；不改变完成/撤销 API 行为。
- 设计/需求基线：用户本次反馈；Iconify Hugeicons `pot-01` 与 Phosphor `cooking-pot` 资源；功能规则 §9。
- 完成：未完成态使用 Hugeicons `pot-01` 线性锅图标，完成态保留 Phosphor `cooking-pot` 实心图标，并按状态切换 SVG 填充/描边。
- 验证：`npm run --prefix frontend test -- --run`（23 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：真实手机与墨水屏上的两种完成状态图标尺寸和对比度，需人工确认。

# 2026-07-31 — P5 猪头轮廓线宽统一

- 状态：待评审。
- 目标：将猪头外轮廓与猪鼻圈描边统一为 `1.1`。
- 范围：`pork` SVG 路径及图标 API 回归断言；不改变眼睛、鼻孔和位置。
- 完成：猪头外轮廓与猪鼻圈的 `stroke-width` 均统一为 `1.1`。
- 验证：`uv run pytest backend/tests/test_inventory_api.py`（7 passed）、`uv run ruff check backend`、`git diff --check` 通过。
- 未验证：真实手机与墨水屏上的最终线宽观感，需人工确认。

### 2026-07-31 — P5 同小类不同品名库存分列

- 状态：待评审。
- 目标：同属一个小类的不同食材品名（例如巴沙鱼与鲈鱼）在食材列表中必须保留为独立记录；冰箱首页预览继续按小类合并图标。
- 范围：库存新增时的服务端批次合并条件及 API 回归测试；不改变首页预览的按小类图标汇总、库存编辑、食谱扣减或分类结构。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md` §7–§11；功能规则 §5.3–§5.5、§17.1；当前冰箱首页冻结稿 `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及本地 `docs/ui-assets/png/pwa-home.png` / `docs/ui-assets/html/pwa-home.html`。
- 预期验证：新增 API 回归用例、后端 Ruff/pytest、前端测试/lint/build 与差异检查。
- 完成：库存合并查询加入已规范化的食材品名条件；相同小类、位置、保质期和描述的巴沙鱼与鲈鱼会保存为两条批次，列表显示为两行；再次添加巴沙鱼仍合并回巴沙鱼批次。首页冰箱预览原有按小类汇总图标逻辑未改动，因此两个鱼类仍可共用一个图标及数量。
- 验证：`uv run pytest`（54 passed）、`uv run ruff check backend`、`uv lock --check`、`npm run --prefix frontend test`（21 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 均通过。
- 未验证：真实 iOS/Android PWA 中连续添加巴沙鱼、鲈鱼及同名巴沙鱼后的列表与首页预览视觉表现，需人工验收。
- 下一步：在手机端依次添加巴沙鱼、鲈鱼和同名巴沙鱼，确认食材列表显示“巴沙鱼 ×2”和“鲈鱼 ×1”两行，首页同一分格仍显示一个鱼类图标和总数 3。

### 2026-08-01 — 通用物品分类重构审查问题修复

- 状态：待评审。
- 目标：修复代码审查发现的迁移降级关系损坏、Agnes 本地配置未接线、AI 图标文件与数据库事务不一致、重复生成和柜体永久删除后文件残留问题。
- 范围：`20260801_09` 数据库迁移、Agnes provider 配置入口、图标候选确认/取消/过期清理、永久删除清理、添加物品页生成状态及相关自动化测试；不更换现有 Agnes key，不改变食谱功能。
- 设计/需求基线：2026-08-01 用户确认“Agnes 所有模型共用同一个 key”；本次代码审查结论；通用物品分类功能规则 §2.1。
- 预期验证：先补含库存的迁移往返、本地环境配置、目录首次初始化、事务回滚文件一致性、永久删除文件清理和前端重复提交用例；随后运行后端 Ruff/pytest/锁文件检查、前端 test/lint/build、迁移往返及差异检查。
- 完成：迁移新增旧分类父子映射表，含库存升级再降级可恢复旧 `category_id` 与小类父级；Agnes 识别和图像 provider 均通过应用配置读取器取得同一个 `FRIDGEBOARD_AGNES_API_TOKEN`，Compose 仅补充图像 URL/模型名透传；内置图标在首次直接创建小类前初始化；图标确认、取消、过期及柜体永久删除的文件清理改为数据库提交后执行，回滚时删除未提交持久文件并保留候选；前端生成期间禁用按钮，重新生成、返回、关闭或切换图库时取消旧候选。
- 验证：`uv run ruff check backend` 通过；`uv run pytest`（63 passed）通过，其中新增含库存迁移往返、共享 Agnes key、首次目录初始化、确认回滚和永久删除文件清理用例；`uv lock --check` 通过；`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未使用生产 Agnes key 发起真实 text2image 请求；Docker 镜像构建仍受当前 Docker Hub 连接限制。
- 下一步：使用部署环境现有 Agnes key 手工生成一次图标，并在待评审环境验证重复点击、返回取消和确认后的文件生命周期。

### 2026-08-01 — P5 导航大类调整为六类

- 状态：待评审。
- 目标：将导航大类调整为“肉蛋水产、水果蔬菜、熟肉主食、粮油酱料、酒水饮料、点心奶品”，保留现有小类、图标和库存数据。
- 范围：版本化分类目录、数据库迁移、内置目录同步、接口测试和功能规则文档；不改变物品只保存小类的规则及食谱功能。
- 设计/需求基线：用户 2026-08-01 最新分类名称清单。
- 预期验证：六类目录与接口响应、旧数据库迁移后的名称和过期大类清理；运行后端 Ruff/pytest、锁文件检查和差异检查。
- 完成：分类目录改为六类；“蛋类”保留在“肉蛋水产”，“奶品/牛奶”迁移到“点心奶品”；新增 `20260801_10` 迁移更新已有数据库并删除空的“个护美妆”“家庭清洁”内置导航组；接口测试和迁移测试同步更新。
- 验证：JSON 格式检查通过；`uv run ruff check backend`、`uv run pytest`（63 passed）、`uv lock --check`、`git diff --check` 均通过。
- 未验证：真实生产数据库升级后的人工界面检查；未执行 Docker 构建。
- 下一步：待评审环境执行迁移后确认选择器显示六类名称。

### 2026-08-01 — P5 选择物品展开框尺寸与滚动边界调整

- 状态：待评审。
- 目标：让“选择物品”展开框与搜索区域同宽、从原 2×8 图标区顶部开始，并在受限屏幕高度内让左右分栏独立纵向滚动。
- 范围：添加物品页选择器容器尺寸、边框圆角、视口高度限制及左右栏滚动样式；不改变分类数据、搜索与选择行为。
- 设计/需求基线：用户 2026-08-01 最新界面反馈；`docs/ui-design-specification.md` 的手机端内容区和滚动边界规则。
- 预期验证：前端 test/lint/build、手机视口 Playwright 展开截图及宽度/顶部/滚动尺寸检查、`git diff --check`。
- 完成：展开框水平边界改为与“选择物品”搜索行一致，使用同语义边框和圆角，不再延伸到整屏；顶部下移到收起状态 2×8 图标区的起点；高度按 `100dvh` 限制，左右分栏设置独立 `overflow-y: auto`、最小高度边界和滚动链隔离。
- 验证：`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 390×667 视口测得搜索行与弹层均为 `left=38/right=352/width=314`，弹层顶部 `172px` 对齐原图标区；在 390×568 短屏测得弹层 `top=172/bottom=510/height=338`，左栏 `scrollHeight=720 > clientHeight=336`、右栏 `scrollHeight=470 > clientHeight=321`，两栏均为独立 `overflow-y:auto`。
- 未验证：真实 iOS Safari 的橡皮筋滚动手感和安全区底部观感，需设备验收。
- 下一步：在真实手机上展开选择器并分别拖动左右栏，确认滚动不会带动背后的添加物品页面。

### 2026-08-01 — P5 选择物品改为全宽底部抽屉

- 状态：待评审。
- 目标：撤销同宽小弹框方案，将展开选择器改为覆盖原选择区域、延伸至屏幕底边的全宽抽屉，并把标题、搜索和关闭操作移入抽屉顶部。
- 范围：添加物品页展开选择器的定位、内部标题栏、底部贴边和分栏滚动；不改变收起状态的 2×8 布局、分类数据与选择行为。
- 设计/需求基线：用户 2026-08-01 最新界面反馈；手机端页面壳宽度与视口滚动规则。
- 预期验证：前端 test/lint/build；Playwright 检查抽屉顶部覆盖原选择区域、左右宽度等于应用屏幕、底部与视口零间隙、无阴影且底部无圆角；`git diff --check`。
- 完成：展开选择器恢复为应用屏幕全宽的固定底部抽屉；抽屉顶部从原“选择物品”区域起始位置覆盖页面，并在内部提供“选择物品”标题、共享搜索框和关闭按钮；底部固定贴合视口，取消底部边框、圆角和阴影；分类导航与小类区域继续受剩余屏幕高度限制并独立纵向滚动。
- 验证：`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Playwright 在 390×667 视口测得原选择区域与抽屉顶部均为 `105px`，抽屉 `left=0/right=390/width=390/bottom=667`、底部间隙 `0px`，`box-shadow:none`、底部左右圆角均为 `0px`；左右栏高度均为 `495px` 且 `overflow-y:auto`，关闭按钮可收回抽屉。
- 未验证：真实 iOS Safari 的动态地址栏、安全区和橡皮筋滚动观感，需设备验收。
- 下一步：在真实手机上展开选择器，确认抽屉始终覆盖原搜索区并贴住可见视口底边，再分别滚动左右分栏。

### 2026-08-01 — P5 分类图标重复修复

- 状态：待评审。
- 目标：修复冰箱默认 2×8 最近小类中成对重复图标，以及展开选择器中同名小类重复展示的问题。
- 范围：默认小类目录顺序、分类展示去重逻辑及相关回归测试；不改变库存保存的小类 ID、食谱匹配和用户自定义分类创建行为。
- 设计/需求基线：用户 2026-08-01 反馈“最近添加列表第一行和第二行图标重复、抽屉分类出现两个猪肉”。
- 预期验证：目录唯一图标检查、前端 test/lint/build、后端 Ruff/相关测试及 `git diff --check`。
- 完成：默认冰箱目录调整为 16 个图标键唯一的小类；最近小类接口按图标键去重，前端折叠列表再次按图标键去重；展开抽屉按小类名称去重，避免同名记录重复显示。
- 验证：`uv run ruff check backend`、`uv run pytest`（63 passed）、`uv lock --check`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；分类接口回归断言默认 16 项的图标键全部唯一。
- 未验证：真实已有数据库中历史重复自定义分类的业务取舍；当前界面会按名称隐藏重复项，但不会删除用户数据。
- 下一步：人工确认默认 16 个小类顺序；如需合并已有重复自定义分类，再单独制定数据清理规则。

### 2026-08-02 — P5 鸡肉图标改为 rooster 线稿

- 状态：待评审。
- 目标：将鸡肉图标替换为 Fluent Emoji High Contrast 的 `rooster` 语义，并转换为与牛肉、羊肉一致的仅描边、不填充黑色风格。
- 范围：仅调整 `chicken` 内置 SVG 资产及必要的图标 API 回归断言；不改变图标键、分类数据、库存逻辑和展示流程。
- 设计/需求基线：用户 2026-08-02 反馈；`docs/ui-design-specification.md` §8 的统一 24/32 网格与 2–3px 描边要求；现有牛肉、羊肉 SVG 线宽。
- 预期验证：后端图标 API 相关测试、前端 lint/test/build、`git diff --check`。
- 完成：将 `chicken.svg` 替换为 Fluent Emoji High Contrast `rooster` 路径，统一使用 `fill="none"`、`stroke="currentColor"` 和 `stroke-width="1.55"`，保留 24×24 视口与鸡肉图标键不变；新增 API 断言防止实心填充回归。
- 验证：`uv run pytest backend/tests/test_inventory_api.py`（7 passed）、`uv run ruff check backend`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；SVG XML 结构核验通过。
- 未验证：真实手机和冰箱端设备上的小尺寸视觉观感，需待评审环境人工确认。
- 下一步：在添加物品页和冰箱端确认 rooster 线稿与牛肉、羊肉的视觉粗细及辨识度。

### 2026-08-02 — P5 鸡肉线稿双线修正

- 状态：待评审。
- 目标：修正上一版直接对 Fluent Emoji 复合填充路径描边导致的双线问题，保留单层外轮廓并将鸡翅膀等实心区域改为空心线稿。
- 范围：仅调整 `chicken` 内置 SVG 资产与对应回归断言；不改变图标键、分类数据、库存逻辑和展示流程。
- 设计/需求基线：用户 2026-08-02 反馈；现有鸡肉、牛肉、羊肉图标的统一单色线稿风格。
- 预期验证：后端图标 API 相关测试、前端 lint/test/build、`git diff --check`，并核验 SVG 不再直接描边原始复合填充路径。
- 完成：移除上一版对 Fluent Emoji 复合填充路径的整体描边，改为手工拆分的单层鸡身外轮廓、空心翅膀、鸡冠、尾羽和腿线稿；线宽统一为 `1.5`，不再使用原始 `scale(.75)` 复合路径。
- 验证：`uv run pytest backend/tests/test_inventory_api.py`（7 passed）、`uv run ruff check backend`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；SVG XML 结构核验通过。
- 未验证：真实手机和冰箱端设备上的最终小尺寸视觉观感，需待评审环境人工确认。
- 下一步：在添加物品页和冰箱端确认空心翅膀的辨识度及线稿与相邻图标的协调性。

### 2026-08-02 — P5 rooster 原图几何回退修正

- 状态：待评审。
- 目标：撤销上一版自定义重画，严格保留 Fluent Emoji High Contrast `rooster` 原始轮廓，仅将原图中的实心填充区域改为空心边界。
- 范围：仅调整 `chicken` 内置 SVG 资产与对应回归断言；不改变图标键、分类数据、库存逻辑和展示流程。
- 设计/需求基线：用户 2026-08-02 最新反馈；Iconify `fluent-emoji-high-contrast:rooster` 原始 SVG 路径。
- 预期验证：原始路径保真核验、后端图标 API 相关测试、前端 lint/test/build、`git diff --check`。
- 完成：撤销自定义重画；恢复 Fluent Emoji High Contrast `rooster` 原始两条路径和 `scale(.75)` 几何，仅使用 SVG 形态学轮廓滤镜把原始填充区域转换为空心边界，并单独保留中间翅膀的原始轮廓。
- 验证：`uv run pytest backend/tests/test_inventory_api.py`（7 passed）、`uv run ruff check backend`、`npm run --prefix frontend test -- --run`（22 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；XML 结构和两条原始路径保真核验通过。
- 未验证：真实手机和冰箱端设备对 SVG 形态学滤镜的兼容性及最终小尺寸视觉观感，需待评审环境人工确认。
- 下一步：在目标设备确认滤镜渲染；如目标旧浏览器不支持滤镜，再基于原始路径做静态轮廓展开。
# 进行中

### 2026-08-14 — 发布当前 main 到生产服务器（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：将当前 `main` 的 `HEAD` `c64b0b4` 发布到生产服务器，执行数据库备份、容器重建、迁移和健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、生产 SQLite 备份、容器健康检查和 HTTPS `/healthz`；不手工修改 release 号，不覆盖生产密钥和数据库。
- 设计/需求基线：本次用户发布请求；项目发布规则；生产固定 SSH 地址 `107.174.152.245`；生产路径 `/opt/fridgeboard`；`scripts/deploy-image.sh`。
- 预期验证：后端 Ruff/测试、锁文件检查、前端 lint/test/build、脚本语法检查、`git diff --check`、发布脚本容器健康检查和 HTTPS `/healthz`。
- 完成：发布 `c64b0b4`，脚本自动生成 release `260814004109`；服务器创建数据库备份 `/data/fridgeboard.db.backup-20260813-164118`，完成 Docker 镜像构建、容器重建和启动。
- 验证：`uv run ruff check backend`、`uv run pytest`（149 passed，56 条既有依赖/异步线程警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（171 passed）、`npm run --prefix frontend build`、`sh -n scripts/deploy-image.sh`、`git diff --check` 和发布脚本 dry-run 均通过；生产容器状态为 `healthy`，`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未进行真实手机、冰箱或 Kindle 设备人工验收；未对生产业务接口执行真实用户流程回归。
- 下一步：在目标设备和生产数据上验证本次冰箱缓存/分类迁移、识别流程及既有 PWA/Kindle 关键路径；如需回滚，优先使用本次数据库备份和上一版镜像。

### 2026-08-08 — 发布包含 Kindle 修复的最新版到生产服务器（本次会话）

- 状态：完成。
- 目标：将当前工作区已确认的 Kindle 首页布局、动态标题和操作热区修复纳入版本并发布到生产服务器。
- 范围：`backend/tests/test_health.py`、`frontend/public/kindle.js`、`frontend/public/kindle.css` 及本次进度记录；执行 `scripts/deploy-image.sh` 的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不手工修改 release 号。
- 设计/需求基线：本会话用户确认“先把未提交修改纳入版本后再发布”；项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`scripts/deploy-image.sh`。
- 预期验证：后端 Ruff/测试、前端 lint/test/build、锁文件检查、`git diff --check`、发布脚本容器健康检查和 HTTPS `/healthz`。
- 完成：创建发布提交 `b205e98`（`修复 Kindle 页面布局与操作热区`），生成 release `260808194935`；生产容器完成 Docker 重建并健康启动；远端数据库备份为 `/data/fridgeboard.db.backup-20260808-114943`。
- 验证：发布前 `uv run ruff check backend`、`uv run pytest`（105 passed）、`uv lock --check`、前端 lint、前端测试（112 passed）、前端生产构建、Kindle 脚本语法检查和 `git diff --check` 均通过；发布脚本容器健康检查通过；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未进行真实 Kindle/DP75SDI、手机或冰箱设备人工验收；本次发布流程未自动执行视觉验收。
- 下一步：按既有待评审事项在目标设备进行人工验收；如发现问题，优先使用本次数据库备份和上一版镜像回滚方案。

### 2026-08-08 — 发布最新版到生产服务器（本次会话）

- 状态：完成。
- 目标：将当前 `main` 分支 `HEAD`（`25cf148`）发布到生产服务器，自动生成 release 号，备份生产 SQLite，重建单容器并完成容器与 HTTPS 健康检查。
- 范围：`scripts/deploy-image.sh` 定义的源码归档、远端 Docker 构建/重建、数据库备份和健康检查；不修改业务代码、生产配置或手工 release 号。
- 设计/需求基线：项目发布规则；生产固定 SSH 地址 `107.174.152.245`；`scripts/deploy-image.sh`。
- 预期验证：发布脚本成功、远端容器变为 `healthy`、HTTPS `/healthz` 返回成功；记录 release、镜像摘要和未验证项。
- 完成：发布当前 `main` 的 `HEAD`（`25cf148`），生成 release `260808184025`；生产容器完成 Docker 重建并健康启动；远端数据库备份为 `/data/fridgeboard.db.backup-20260808-104034`。
- 验证：发布前 `uv run ruff check backend`、`uv run pytest`（105 passed）、`uv lock --check`、前端 lint、前端测试（112 passed）、前端生产构建和 `git diff --check` 均通过；发布脚本容器健康检查通过；`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。
- 未验证：未进行真实手机、冰箱或 Kindle 设备人工验收；本次发布流程未自动执行视觉验收。
- 下一步：按既有待评审事项在目标设备进行人工验收；如发现问题，优先使用已生成的数据库备份和上一版镜像回滚方案。

### 2026-08-05 — P11 Android 安装提示统一与事件时序修复（本次会话）

- 状态：待评审。
- 目标：统一 Android PWA 安装提示对话框；使用 Android Chrome 实际菜单文案“安装并创建快捷方式”和监视器左上角下箭头图标；浏览器未提供原生安装事件时隐藏“安装应用”按钮，并避免首次登录因错过安装事件而错误落入降级状态。
- 范围：前端安装事件监听生命周期、Android 安装提示组件与图标/文案、相关前端测试及 P11 验证记录；不修改 manifest、Service Worker、登录、配对和业务 API。
- 设计/需求基线：`docs/ui-design-specification.md` §4–§11；功能规则 §10.2；Android 安装引导最终稿 `0a461204-851c-4b9c-aeed-da6e2cdded37` 及本地资产；用户本次确认的 Android Chrome 菜单文案、图标和统一对话框要求。
- 预期验证：前端单元测试、lint、生产构建、`git diff --check`；核验原生安装事件可用/不可用两种状态、Android 安装步骤、按钮隐藏逻辑，以及 320/390/430px 下无溢出。
- 完成：安装事件监听移至 `App` 根组件，从应用启动阶段捕获 `beforeinstallprompt` 和 `appinstalled`，避免登录完成后才挂载提示组件而错过事件；Android 原生安装可用与不可用两种状态统一使用“安装家常食橱”对话框，仅在事件可用时显示“安装应用”按钮；手动安装步骤更新为“安装并创建快捷方式”，并加入左上角下箭头的监视器线稿图标；配对引导页同步更新真实浏览器菜单文案。
- 验证：`npm run --prefix frontend test -- --run`（54 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：真实 Android Chrome 菜单中的图标和系统文案、原生安装弹窗、首次登录真实时序，以及 320/390/430px 真机渲染；项目约定不自动触发 Playwright 视觉核验，需在目标设备或评审环境人工确认。
- 下一步：在 Android Chrome 首次打开并登录，分别确认原生按钮可用和不可用两条路径；点击“安装并创建快捷方式”完成安装后，从主屏幕打开 PWA 并验证原有扫码配对流程。

### 2026-08-05 — 后端错误异常日志补全（本次会话）

- 状态：完成。
- 目标：确保后端错误响应和未处理异常均输出带时间戳的日志，便于单容器标准输出采集和故障排查。
- 范围：FastAPI 全局异常处理、请求校验错误、未处理异常、日志格式配置及回归测试；不记录请求体、Cookie、Token 等敏感信息，不改变 API 错误响应语义。
- 设计/需求基线：用户本次明确要求；单容器标准输出日志约定；现有 FastAPI/Uvicorn 入口和异常映射。
- 完成：新增带时区时间戳的标准输出日志配置；FastAPI 全局记录 HTTP 错误、请求参数校验错误和未处理异常；启动初始化与 Alembic 迁移失败也记录异常堆栈；日志不读取请求体、Cookie 或 Authorization；新增 404 和 500 日志回归测试。
- 验证：`uv run ruff check backend`、`uv run pytest`（80 passed）、`uv lock --check`、`git diff --check` 均通过；回归日志包含 `YYYY-MM-DDTHH:MM:SS+ZZZZ` 时间戳、请求方法和路径，500 响应不暴露内部错误详情。
- 未验证：生产容器实际日志采集器对格式的展示，需部署环境验收。

### 2026-08-02 — P5 新增日化清洁大类并调整清洁用品归属（本次会话）

- 状态：待评审。
- 目标：在“添加物品”分类选择器中新增“日化清洁”大类，并将“洗剂、洗浴、纸品、扫拖、洗碗、洗衣、洁牙”移动到该大类。
- 范围：内置分类目录、分类接口回归断言、受影响的功能说明与本进度记录；保留小类 ID、名称、图标和库存持久化语义，不改前端分类选择器交互。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` 的数据驱动两级分类约定。
- 预期验证：目录 JSON 解析、分类接口测试、`uv run ruff check backend`、`uv run pytest`、前端 lint/build 和 `git diff --check`。
- 完成：新增“日化清洁”导航大类；将七个指定小类改挂到该大类；保留原小类 ID、名称、图标及库存关联；补充旧“家庭清洁”空大类的同步清理。
- 验证：分类专项测试 18 passed；`uv run ruff check backend`、`uv run pytest -q`（68 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、JSON 解析和 `git diff --check` 均通过。
- 未验证：真实浏览器中的人工视觉确认，按项目约定不自动触发 Playwright 视觉核验。
- 下一步：人工在添加物品页展开分类选择器，确认“日化清洁”及七个小类的显示、顺序和旧“家庭清洁”不再出现。
### 2026-08-05 — P7 每周食谱缺少食材行内标识（本次会话）

- 状态：待评审。
- 目标：调整每周食谱食材列表的缺货展示，移除食谱列表中的“缺少：”汇总行；缺少的食材改为警告色，并在原数量后追加 `-缺少数量`，库存充足的食材保持原显示。
- 范围：前端 `RecipeWorkspace` 食材行渲染、对应样式和回归测试；不改变库存匹配、缺货计算、补货清单或完成食谱扣减逻辑。
- 设计/需求基线：用户本次明确要求；`docs/ui-design-specification.md` §4.1、§9；功能设计 §9.2–§9.3；每周食谱最终稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及本地 `docs/ui-assets/png/pwa-weekly-recipes.png`、`docs/ui-assets/html/pwa-weekly-recipes.html`。
- 完成：`RecipeIngredientList` 接收每道菜的 `missing` 数据，按食材名称将缺少数量合并到原食材项；缺货项增加 `is-missing` 警告色并追加 `-缺少数量`；移除每周食谱列表中的“缺少：”汇总行；补充缺货、充足和缺少数量为 0 的前端回归测试。
- 验证：`npm run --prefix frontend test -- --run`（4 个测试文件、59 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；已对照本地每周食谱设计稿 PNG（390×844）检查页面基线。
- 未验证：未执行 Playwright/真实手机视觉核验；未验证 320px、430px 视口和系统字体放大下的人工表现，按项目约定不自动触发该类核验。
- 下一步：评审环境刷新每周食谱页面，确认“鸡蛋×4-2”红色显示、充足食材保持原状且不再出现“缺少：”行。

### 2026-08-08 — Kindle 中优先级页面问题修复（本次会话）

- 状态：待评审。
- 目标：修复 Kindle 分区详情刷新误回首页、已配置设备运行中撤销后的错误状态、分区详情缺少缩略图/食品图标与风险标识；首页取消按小类分组和固定截取，改为与手机端一致的确定性蓝噪声图标分布。
- 范围：`frontend/public/kindle.html`、`frontend/public/kindle-layout.js`、`frontend/public/kindle.js`、`frontend/public/kindle.css`、Kindle 静态契约和布局回归测试、本进度记录；不处理补货清单、同步离线状态等高优先级问题，不改变绑定和库存 API 语义。
- 设计/需求基线：`docs/kindle-capability-spike.md`、`docs/ui-design-specification.md` §10.1、`docs/functional-design-and-feasibility.md` §5.1–§5.6；冰箱首页草稿 `620a23a7-f6f1-446f-b877-f05317a2c0a2`、分区详情草稿 `11377443-ce1a-49d7-8c87-9860db491c17`；手机端 `frontend/src/fridgeFoodLayout.ts` 蓝噪声实现。
- 预期验证：`node --check frontend/public/kindle.js`、前端 lint/test/build、后端 Kindle 静态契约测试、相关后端 API 测试、`git diff --check`；真实 DP75SDI 视觉验收单独记录。
- 完成：Kindle 首页移除小类分组和固定前 5 项截取，按库存批次使用 ES5 版 Halton 低差异采样、距离评分和轻量排斥算法定位图标；移除首页面向用户的区域名称；分区详情增加选中位置缩略图、食品图标和临期/过期标识；库存调整和撤销接口在运行中返回 401/403 时进入设备访问已移除页；保留分区刷新在当前详情页。
- 验证：`node --check frontend/public/kindle.js`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run pytest`（103 passed）、`git diff --check` 均通过；新增 Kindle 静态契约断言覆盖蓝噪声入口、无分组截取、详情缩略图和撤销状态处理。
- 未验证：未在真实 DP75SDI 上确认多批次蓝噪声位置、图标碰撞边界、详情缩略图比例、详情页分页/长文本和 3:4 截图；现代浏览器构建不能替代 Kindle 实机验收。
- 下一步：在 DP75SDI 上验证首页多批次分布、不同格位尺寸、详情页图标/风险标记、数量操作和撤销后的撤销状态；通过后将本条标记为完成。
- 本次会话：根据代码审查结果，补充详情缩略图真实布局几何、Kindle 与手机端一致的 ES5 哈希实现，以及对应的可执行回归测试；不改变库存、绑定和同步接口语义。
- 本次预期验证：先运行新增失败用例，再执行 Kindle 脚本语法检查、前端测试/lint/build、Kindle 静态契约测试、后端测试和 `git diff --check`；DP75SDI 实机视觉验收仍单独记录。
- 本次完成：新增独立 ES5 `kindle-layout.js`，使用兼容旧 WebKit 的 `imul` 等价实现保持手机端哈希 seed 一致；首页继续通过该脚本计算蓝噪声位置；详情缩略图按主柜、左右门板和服务端格位几何渲染，覆盖普通、对开门和法式多门模板；新增 Node 可执行回归测试验证哈希、位置边界和法式多门左右分割。
- 本次验证：`node --check frontend/public/kindle-layout.js`、`node --check frontend/public/kindle.js`、Kindle 静态/布局回归测试（9 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（106 passed）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（104 passed）、`git diff --check` 均通过。
- 本次未验证：尚未在真实 DP75SDI 上确认不同模板缩略图比例、蓝噪声碰撞边界和 3:4 截图；实机验证通过后再将本条标记为完成。
### 2026-08-11 — 安卓刷新后首页底部导航栏移出视口（本次会话）

- 状态：待评审。
- 目标：修复安卓 PWA 点击“刷新应用”回到手机首页后，底部四项导航栏跑出屏幕、需切换其他页面才恢复的问题。
- 范围：手机端应用刷新/首页导航状态、共享页面壳与相关前端回归测试；不改变四项导航的业务路由和视觉规范。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；现有 `PageShell`、底部导航和应用刷新流程。
- 预期验证：补充可复现回归断言，运行前端 lint、测试、生产构建和 `git diff --check`；真实安卓设备刷新路径作为设备验收项记录。
- 会话记录：已登记任务；确认“刷新应用”整页重载会让安卓浏览器恢复刷新前的根页面/应用壳滚动位置，导致首页虽已回到 `home` 路由但底部导航位于视口外；已在刷新前设置手动滚动恢复并清零根页面、`body` 和 `.mobile-page-body` 的滚动位置，补充回归断言。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts -t 'PWA 刷新滚动位置'`（1 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 通过；全量前端测试为 146 passed、1 failed，失败为既有依赖系统日期的“还有 N 天”断言，与本次改动无关。
- 未验证：尚未在真实安卓 PWA 上点击“刷新应用”确认不同浏览器版本的滚动恢复行为；未修改该既有日期测试。
- 下一步：在安卓真机从“关于与帮助”点击“刷新应用”，确认回到首页后底部四项导航立即位于视口底部；通过后将本条标记为完成。
# 2026-08-13 — 修复照片识别截断、前端静默失败与冰箱数量 500（本次会话）

- 状态：进行中。
- 目标：定位并修复照片识别返回空列表后静默回到“识别物品”页的问题，同时修复 `/api/refrigerators` 在小数库存数量下返回 500 的问题。
- 范围：Agnes 图片识别输出预算与 SSE 结束原因/截断诊断、识别页失败状态保留与重试入口、冰箱列表库存数量响应类型及相关回归测试；不修改识别图片留存策略、库存业务数量和 Agnes 凭证。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §6；P6 识别结果设计稿 `36284a96-d2ad-4fce-96b8-c59af859dc8d`、添加物品设计稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` 及本地 PNG/HTML；线上 `2026-08-13 06:44 UTC` 识别日志。
- 预期验证：覆盖 Agnes `finish_reason=length`/截断响应、请求输出上限、识别失败文案保留和小数库存列表响应；运行 `uv run ruff check backend`、`uv run pytest`、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认线上照片请求收到 HTTP 200，但模型内容在订单 JSON 中途结束，`response_bytes=283`、`finish_reason=None`，服务端解析失败并发出 503；前端捕获后重新打开相机，相机初始化成功又清空错误提示。另确认 `/api/refrigerators` 将 `Decimal('328.50')` 传给整数响应字段，触发 Pydantic 500。下一步先补齐可观测的截断判定和更充足的输出预算，再保持识别失败在当前页可见并修正数量契约。
- 完成：识别默认 `max_tokens` 由 2048 提高到 8192，保留部署配置的 256–8192 边界；对 Agnes `finish_reason=length` 明确记录“输出上限截断”并返回可重试错误；SSE 未正常结束时不伪装为成功结果。识别页用独立错误状态保留 503/解析错误文案，相机重新初始化不会清除错误，并提供“重新打开相机”操作；冰箱摘要库存数量改为 JSON number，支持 Decimal 小数汇总，不再触发 `/api/refrigerators` 响应校验 500。新增截断日志、请求预算和小数库存 API 回归测试。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（147 passed，45 条既有警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（170 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未用真实订单/物品照片确认 8192 输出预算下的识别准确率和移动端失败重试提示；`/api/refrigerators` 尚未在生产数据上做人工接口复测。
- 下一步：用同一张照片在生产复测成功列表与失败重试提示，并确认 `/api/refrigerators` 返回小数库存摘要。

### 2026-08-13 — 收敛订单识别 JSON 与发布环境变量同步（本次会话）

- 状态：待评审。
- 目标：降低购物清单识别的结构化输出体积，明确 `max_tokens` 对 Agnes 推理/输出的边界，并修正 `.env.prod` 不会自动进入生产发布流程的问题。
- 范围：P6 订单识别提示词与响应字段、识别请求输出预算、`.env`/`.env.example`/`.env.prod`/Compose/发布文档；不修改 Agnes 凭证、不上传本机开发 `.env`、不覆盖生产数据库。
- 设计/需求基线：用户本次反馈；P6 订单识别与批量添加规则；当前线上截断日志；`README.md` 与 `scripts/deploy-image.sh` 的发布约定。
- 预期验证：覆盖紧凑订单 JSON 请求契约、环境变量默认值和旧订单字段兼容；运行后端/前端质量门禁、`sh -n scripts/deploy-image.sh`、`git diff --check`。
- 会话记录：已确认十几条订单项的业务字段本身不应需要数千 token，但当前提示词要求品牌、规格、实付、分类 ID/名称/置信度，且模型可能将推理内容计入 `max_tokens`；线上 `finish_reason=None` 还说明网关结束原因不可靠。确认发布脚本只读取本机 `.deploy.env`，服务器 Compose 使用 `/opt/fridgeboard/.env`，不会读取或覆盖本机 `.env.prod`。下一步收敛订单输出字段并同步非敏感环境默认值。
- 完成：订单提示词收敛为 `item_name`、`specification`、`quantity`、`paid_price`、可选 `subcategory_id` 五个字段，禁止品牌、分类名称、置信度和解释性文本；后端继续兼容旧字段并从候选 ID 补分类名称。`.env`、`.env.example` 和 `.env.prod` 的模型、8192 输出上限、图像模型和日志配置已同步；`.env.prod` 的 token 保持部署密钥，不写入代码仓库。README 已明确发布脚本只读取 `.deploy.env`，生产 Compose 使用服务器 `/opt/fridgeboard/.env`，不会自动读取本机 `.env.prod`。
- 验证：订单请求契约测试补充字段白名单断言；本次随后运行的后端/前端质量门禁、`sh -n scripts/deploy-image.sh` 和 `git diff --check` 通过。
- 未验证：未用真实购物清单重新测量 Agnes 隐式推理 token 消耗；未在生产用真实订单截图复核识别准确率。
- 下一步：用真实订单截图检查 `finish_reason`、响应长度和识别出的商品条数。
- 会话追加：用户进一步要求限制或关闭 Agnes 思考，以避免思考预算挤占结构化 JSON 输出。已查阅 Agnes 官方概览与模型目录：确认 `agnes-2.5-flash` 支持 thinking mode，但未公开确认 `enable_thinking`、`thinking_budget` 或 `reasoning_effort` 的模型级请求契约；先用生产凭证执行最小文本请求验证参数行为，再决定是否接入可配置开关，不直接依赖未经验证的字段。
- 会话追加：使用生产 Agnes 凭证做最小文本对照：基线 `completion_tokens=43`（`reasoning_tokens=31`、`text_tokens=12`）；`enable_thinking=false`、`thinking_budget` 和 `thinking.type=disabled` 均未生效；顶层 `reasoning_effort=none` 返回无 `reasoning_content` 的纯 JSON，`completion_tokens=6`。因此本次采用已实测有效的 `reasoning_effort`，默认值为 `none`，并保留环境变量覆盖能力。
- 完成：识别、二维码解析和自动分类请求统一增加 `reasoning_effort`，默认从环境变量读取 `none`，避免 Agnes 思考 token 挤占结构化输出预算；允许配置为 `minimal`、`low`、`medium` 或 `high`。已同步 `.env`、`.env.example`、`.env.prod` 和 Compose 默认值。
- 验证：真实 Agnes 最小请求确认 `reasoning_effort=none` 不返回 `reasoning_content`；`uv run ruff check backend`、`uv run pytest`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`、`uv lock --check` 和 `git diff --check` 通过。
- 未验证：尚未用真实订单截图确认多商品图片识别准确率，也未验证真实请求的 `reasoning_content` 是否消失。
- 下一步：用真实订单截图核对日志中的 `finish_reason`、响应长度和识别商品数量。
- 发布记录：已发布 release `260813153323`；服务器 `/opt/fridgeboard/.env` 已备份为 `.env.backup-20260813073316`，并更新 `FRIDGEBOARD_AGNES_MAX_TOKENS=8192`、`FRIDGEBOARD_AGNES_REASONING_EFFORT=none`。镜像构建、容器健康检查和 `https://fridge.flycn.fyi/healthz`（`{"status":"ok"}`）均通过；容器内实际生效模型为 `agnes-2.5-flash`，状态为 healthy。发布数据库备份为 `/data/fridgeboard.db.backup-20260813-073332`。

### 2026-08-14 — 物品列表显示冰箱分隔位置（本次会话）

- 状态：已发布，待真实设备验收。
- 目标：在全部物品、跨冰箱搜索结果和首页点击分格打开的物品列表中，将每项物品右上方的冰箱名称扩展为“冰箱名·分隔名称”，并保证该行单行显示。
- 范围：库存响应的分隔展示名称、前端共享 `InventoryList` 展示与宽度样式、相关前后端回归测试；不改变库存位置 ID、位置选择、排序、搜索和数量保存语义。
- 设计/需求基线：用户本次明确需求；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §5.1–§5.6、§6.5；当前物品列表共享组件和已登记的手机首页/物品流程设计资产。
- 预期验证：补充库存响应和共享列表展示回归；运行 `uv run ruff check backend`、相关后端测试、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认三个入口均复用 `frontend/src/inventoryList.tsx`，当前只显示 `refrigerator.name`；库存 API 已有 `storage_slot_id`，但列表无法跨冰箱直接取得分隔名。采用库存响应增加 `storage_slot_name` 的统一契约，使用布局中的区域名称、格位序号或自定义名称生成展示文案，并将列表右上控件从 106px 适当加宽以保持单行。
- 完成：库存响应新增 `storage_slot_name`，按分隔自定义名或区域名加格位序号生成；三个物品列表入口统一显示“冰箱名·分隔名称”；列表右上位置控件宽度由 106px 调整为 160px（窄屏 144px），文本保持单行省略。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（149 passed，52 条既有依赖弃用警告）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（171 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；后端库存专项测试 12 passed。
- 会话追加：用户反馈页面没有任何变化。已确认本地 Vite/后端服务正在运行且新构建包含 `storage_slot_name`，但工作区和跨冰箱搜索均优先复用 24 小时旧缓存，旧缓存没有该字段，前端可选字段因此不渲染。下一步为旧缓存增加基于布局的前端展示兜底，并让搜索页同步读取布局补齐位置名称。
- 会话追加：进一步确认“刷新应用”只删除 Service Worker 应用壳 `Cache Storage`，未调用 `clearPageCaches()` 清理 `fb-page-cache:v1:*` 页面缓存；已将该清理补入刷新流程，并补充刷新缓存回归测试。
- 完成：列表渲染对旧缓存增加布局位置兜底；跨冰箱搜索读取各冰箱布局补齐位置；“刷新应用”现在同时清理 Service Worker 应用壳缓存和页面 `localStorage` 缓存，不删除登录状态或远端数据。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（176 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 发布记录：提交 `459f2f1` 已发布，自动生成 release `260814183521`；生产数据库备份为 `/data/fridgeboard.db.backup-20260814-103529`，容器状态为 `healthy`，HTTPS `/healthz` 返回 `{"status":"ok"}`。
- 未验证：尚未在真实手机上确认刷新按钮点击后的完整重载、长名称截断效果和三个列表入口的人工视觉表现。
- 下一步：在真实手机上点击“刷新应用”，确认页面缓存被清理并检查全部物品、跨冰箱搜索和首页格位列表的位置文案；通过后将本条标记为完成。

### 2026-08-16 — 纠正首次安装未登录启动页判断（本次会话）

- 状态：待评审。
- 目标：修复全新安装 App/PWA、没有扫码和任何会话时，因 `/api/refrigerators` 返回空列表而错误进入“我的冰箱”页，确保默认显示“登录或注册”。
- 范围：认证状态查询 API、前端启动状态判断、首次安装回归测试及相关文档；撤销上一会话错误地针对 `daily_access` 列表添加登录入口的实现，不改变设备配对和所有者权限。
- 设计/需求基线：用户本次纠正；`docs/ui-design-specification.md` §5–§7；`docs/pairing-and-onboarding-redesign.md` §5.1；首次使用本地设计板 `docs/ui-assets/proposals/pairing-onboarding-redesign.html`/`.png`。
- 预期验证：覆盖未登录空列表、已登录空列表和已登录有冰箱三种启动状态；运行后端认证/API 测试、前端测试、lint、生产构建和 `git diff --check`。
- 完成：新增 `/api/auth/status`，只返回当前请求是否有所有者会话；前端启动先读取该状态，未登录时直接显示已有的“开始使用家常食橱”页面和“登录或注册”，已登录空账号继续显示“我的冰箱”并可新建；撤销上一会话错误地针对 `daily_access` 列表添加登录入口的实现。
- 验证：匿名、开发所有者和 Bearer 会话认证状态回归通过；`uv run ruff check backend`、`uv run pytest -q`（158 passed）、`uv lock --check`、`npm run --prefix frontend test -- --run`（193 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npx cap sync android`、`npx cap sync ios` 和 `git diff --check` 均通过；已用 `curl` 确认当前生产匿名 `/api/refrigerators` 返回 `200 []`，这正是本修复覆盖的现状。
- 未验证：新后端和前端尚未发布到生产；未在真实 Android/iOS App 或生产 PWA 完成首次安装、点击登录、SSO 回跳和登录后冰箱恢复验收。
- 下一步：按项目发布流程发布后，清除 App/PWA 数据重新打开，确认默认页显示“登录或注册”；再验证已登录空账号可以新建冰箱，已登录已有账号可以恢复冰箱列表。

### 2026-08-16 — 修复认证状态接口不可用时误进冰箱列表（本次会话）

- 状态：进行中。
- 目标：修复当前生产 `/api/auth/status` 尚未部署或返回错误时，App 将该错误误判为已登录并显示“我的冰箱”的问题。
- 范围：App 启动认证失败分流、首次首页回归测试和进度记录；不改变首次首页设计、扫码流程或已登录冰箱列表功能。
- 设计/需求基线：用户本次反馈；冻结设计板第 1 页“未登录/无冰箱首页”；`docs/pairing-and-onboarding-redesign.md` §5.1；当前生产匿名 `/api/auth/status` 返回 404 的实测结果。
- 预期验证：认证状态接口返回 404/网络错误时显示“登录或注册”，认证状态为 true 时保留“我的冰箱”；运行前端测试、lint、build 和 `git diff --check`。
- 完成：认证状态接口请求失败时前端闭合到 `signed-out`，不再执行原先将非 401 错误标记为 `signed-in` 的分支；新 bundle 已包含该行为并同步到 Android/iOS Capacitor 资源。
- 验证：`npm run --prefix frontend test -- --run`（193 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npx cap sync android`、`npx cap sync ios` 和 `git diff --check` 均通过；线上首页仍引用旧 bundle `index-CTkyFmJK.js`，线上 `/api/auth/status` 返回 404，已确认当前生产未包含修复。
- 未验证：未执行生产发布；未在重新安装最新 App 或刷新生产 PWA 后完成首次启动、登录回跳和账号冰箱恢复的真机验收。
- 下一步：发布最新前端 bundle/后端认证状态接口后重新安装或清除 PWA 缓存，确认首次页显示设计稿第 1 页的“登录或注册”。

### 2026-08-24 — 修正选择分类抽屉搜索与小类图标布局（本次会话）

- 状态：待评审。
- 目标：修复“选择分类”抽屉中“搜索全部小类”搜索图标与输入框换行，以及小类图标外层 `span` 产生按钮背景和留白的问题。
- 范围：分类抽屉组件与对应手机端样式；保持抽屉按钮尺寸、文字布局、分类筛选和选择行为不变。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §7–§8；`docs/functional-design-and-feasibility.md` §2.1、§5.6；已登记小类图库本地设计资产 `docs/ui-assets/html/pwa-subcategory-library.html` 与 `docs/ui-assets/png/pwa-subcategory-library.png`。
- 预期验证：前端 lint、前端测试、前端生产构建和 `git diff --check`；重点确认搜索输入为单行、放大镜与输入文字同一行，图标外层无按钮样式且图标尺寸增大。
- 完成：分类抽屉搜索区域固定为不换行的横向布局，放大镜与单行文本输入保持同一行；删除小类图标多余包装 `span`，图标直接使用原图标区域的 `56×56px` 尺寸，保留按钮和文字布局。
- 验证：`npm run --prefix frontend test -- --run`（27 个文件、247 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；未修改分类筛选、选择提交和关闭行为。
- 未验证：尚未在真实 Safari/iOS WebView 或不同主题设备上进行视觉和触摸验收；未提交或发布。
- 下一步：在评审设备打开“选择分类”抽屉，确认 320/390/430px 宽度下搜索框单行显示及图标占满预留区域。
- 会话追加：按用户复测要求保留分类抽屉图标区域 `56×56px` 不变，并增加四周各 `2px` 内边距，图标内容区域变为 `52×52px`，不改变按钮和文字布局。
- 会话追加：按用户进一步反馈，将选择分类抽屉小类图标的四周内边距调整为 `8px`，图标内容区域变为 `40×40px`，按钮和文字布局保持不变。
- 验证追加：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（27 个文件、250 passed）和 `git diff --check` 均通过。
- 会话追加：用户要求库存多选图标与“编辑物品”页图标容器复用同一圆形样式，并放大内部图标；本轮将两处统一为 `48×48px` 圆形容器、`44×44px` 内部图标并裁切超出圆形的四角。
- 完成追加：新增共享 `.p5-icon-circle` 并应用到库存多选按钮和“编辑物品”图标容器；移除编辑页重复圆形样式，容器统一裁切图标四角。
- 验证追加：`npm run --prefix frontend test -- --run`（27 个文件、248 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 会话追加：用户反馈水墨主题放大后的图标视觉不佳；保留 `.p5-icon-circle` 共享容器，仅将内部 `44×44px` 放大规则限定到拟物主题，默认水墨/卡通主题恢复 `28×28px`。
- 验证追加：`npm run --prefix frontend test -- --run`（27 个文件、250 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。

### 2026-08-16 — 修正首次未登录首页视觉实现（本次会话）

- 状态：待评审。
- 目标：将首次安装、未登录且未执行任何操作时的首页恢复为最终设计中的统一视觉，消除配对占位图和两个入口按钮的尺寸、位置、样式不一致。
- 范围：`EmptyOwnerHome` 的首页插图与入口按钮标记、首次首页专用布局和按钮样式；不改变登录、扫码、认证判断及配对结果流程。
- 设计/需求基线：用户本次反馈；`docs/ui-design-specification.md`；`docs/pairing-and-onboarding-redesign.md` §5.1；`docs/ui-assets/proposals/pairing-onboarding-redesign.html` 与对应 PNG。
- 预期验证：补充首次首页结构回归断言，运行前端测试、lint、生产构建和 `git diff --check`；检查首次首页在手机宽度下的布局不会回退到全局按钮样式。
- 完成：首次首页改用设计稿中的 `app-mark`，移除容易误解的“冰箱＋圆形连接符”占位图；新增首页专用居中布局和统一入口按钮样式，扫描按钮为主操作，登录按钮为次操作；配对成功页和失败页继续使用原有连接图。
- 验证：`npm run --prefix frontend test -- --run src/App.test.ts -t '首次未登录首页'`（1 passed）、`npm run --prefix frontend test -- --run`（194 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；Playwright 在 390×844 手机视口并 mock 未登录认证状态后截图确认首页视觉与设计稿一致。
- 未验证：尚未发布到生产；真实 Android/iOS App 和生产 PWA 仍需在发布后清除旧资源，确认新首页实际加载。
- 下一步：发布包含认证状态接口和本次首页视觉修复的版本后，在真实设备完成首次安装首页验收。

### 2026-08-19 — 数量清零后保留物品日期信息（本次会话）

- 状态：待评审。
- 目标：物品列表将数量减至 0 后保留生产日期、BBD/保质期及相关日期信息；恢复数量时不自动重置或重新填写这些信息，避免误触清零后无法恢复原状。
- 范围：库存批次数量更新服务、物品列表保存调用链、相关前后端回归测试和功能规则文档；不改变 0 数量软删除展示、统计和提醒排除规则。
- 设计/需求基线：用户本次明确需求；`docs/functional-design-and-feasibility.md` §3.5；现有 `InventoryList` 数量保存及 `InventoryService.update_batch` 实现。
- 会话记录：已定位数量更新服务在任意数量变化时重置生产日期，并在未提交 BBD 时清空旧 BBD；列表虽回传旧日期，仍会被该服务端规则覆盖。修复为数量变化沿用批次已有生产日期、BBD 和有效期，零数量响应保留日期数据但继续返回空日期风险；列表旧缓存缺少日期时提交空值，由后端从批次恢复，避免自动填入当天。
- 完成：更新库存批次数量语义和零数量响应；物品列表零数量行继续隐藏日期展示；新增数量变为 0、0 恢复为 1、食谱/冰箱端清零保留日期及零数量行隐藏日期的回归断言；同步功能规则文档。
- 验证：`uv run ruff check backend` 通过；`uv run pytest` 通过（161 passed，54 条既有警告）；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run` 通过（26 files、225 tests）；`npm run --prefix frontend build` 和 `git diff --check` 通过。并行执行时插画测试曾出现 1 次既有断言瞬态失败，单独重跑及串行全量测试均通过。
- 未验证：尚未在真实手机/PWA 或冰箱显示设备上手工验证清零、恢复和旧缓存升级路径；未执行发布。
- 下一步：用户评审后按发布流程部署，并在真实设备完成数量清零/恢复验收。

### 2026-08-19 — 食谱库存匹配改为分类精确、名称包含（本次会话）

- 状态：待评审。
- 目标：将每周食谱和购物清单的库存判断从食材名称完全相等改为“分类 ID 精确相等且库存物品名称包含食材名称”，例如食材“水饺”可匹配同为“主食”分类的“猪肉水饺”。
- 范围：后端食谱缺货预留、完成食谱扣减及对应领域匹配规则和回归测试；不改变食谱保存名称、分类自动匹配、分类不一致时的隔离和撤销审计语义。
- 设计/需求基线：用户本次明确需求；`backend/fridgeboard/recipe_service.py`；`backend/fridgeboard/domain/inventory.py`；现有 P9 食谱接口与库存规则测试。
- 预期验证：补充同分类名称包含、分类不一致、多个匹配库存批次的缺货/扣减/撤销测试；运行 `uv run ruff check backend`、相关及全量 `uv run pytest`、`git diff --check`。
- 会话记录：已确认缺货计算和完成扣减目前都按名称完全相等，食材与库存均保存 `subcategory_id`；拟统一采用分类 ID 精确比较与库存名包含食材名的单向规则，避免购物清单和实际扣库存不一致。
- 完成：领域匹配规则新增食材分类约束；缺货预留、完成扣减和完成后缺货审计统一使用“分类 ID 精确相等 + 库存名称包含食材名称”；新增“水饺/猪肉水饺/主食”接口和领域回归，覆盖跨分类隔离、库存不足、完成和撤销；同步 API 文档字符串、前端导入/编辑提示及功能规则。
- 验证：`uv run ruff check backend`、`uv run pytest -q`（163 passed，52 条既有警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（225 passed）、`npm run --prefix frontend build` 和 `git diff --check` 均通过；未执行发布或提交。
- 未验证：尚未在生产数据和真实设备上人工确认复合名称库存的购物清单展示；发布验收需覆盖已有旧食谱缺少分类的历史数据。
- 下一步：评审通过后按发布流程部署，并在生产冰箱上验证同分类复合名称、异分类同名库存和完成/撤销库存数量。

### 2026-08-24 — 统一手机端顶部标题栏样式（本次会话）

- 状态：待评审。
- 目标：统一首页、“我的冰箱”、“每周食谱”等手机页面顶部标题栏的公共结构与标题文字样式，修复拟物主题下同语义标题出现不同视觉表现的问题，并把该约束写入 UI 规范，阻止后续页面级覆盖。
- 范围：`frontend/src/sharedUi.tsx`、`frontend/src/styles.css`、共享标题栏回归测试和 `docs/ui-design-specification.md`；不改变页面标题文案、返回/切换/刷新操作和业务路由。
- 设计/需求基线：用户本次明确反馈；`docs/ui-design-specification.md` §6.1–§6.2.1、§10；`docs/functional-design-and-feasibility.md` §17.1；本地最终设计资产 `pwa-home`、`pwa-weekly-recipes`、`pwa-fridge-switcher`、`pwa-fridge-management`。
- 预期验证：共享标题组件与样式契约测试、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check`。
- 会话记录：已确认 `AppHeader/HeaderTitle` 与 `PageHeader` 使用共享 JSX，但拟物主题样式在 `styles.css` 中多次重复定义，后续规则对标题元素和首页标题触发器分别覆盖，造成视觉不一致；将收敛为共享标题元素选择器和主题令牌，并增加禁止页面单独覆盖的规范条款。
- 完成：`AppHeader` 与 `PageHeader` 的标题节点统一使用 `shared-header-title-text`；拟物主题末端公共规则统一字号 `21px`、字重 `700`、行高 `1`、字距、颜色和浮雕滤镜，避免历史重复规则造成首页与二级页分叉；`HeaderTitle` 保持由外层共享标题栏承载样式，避免嵌套滤镜重复；UI 规范版本升至 1.3，并明确禁止页面级覆盖共享标题文字基线，新增例外必须先更新规范和共享测试。
- 验证：共享标题回归测试通过；`npm run --prefix frontend test -- --run`（27 个文件、252 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：尚未在真实 Safari/iOS WebView、Android WebView 及 320/390/430px 设备上进行像素级视觉验收；未执行发布。
- 下一步：在拟物主题评审首页、“我的冰箱”、“每周食谱”和冰箱管理页面，确认标题文字的字号、字重、浮雕层次完全一致后按发布流程处理。

- 会话追加：复核发现首页可点击冰箱标题的 `AppHeader` 外层与 `HeaderTitle` 内层重复应用拟物滤镜，而“每周食谱”纯文字标题只有外层滤镜，造成首页标题看起来更深；本轮将保留外层共享标题滤镜，明确禁用内层重复滤镜，并补充回归断言。
- 验证追加：共享标题回归测试、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；首页与食谱标题现在均复用相同的外层标题节点与标题内容层级，保持首页原有的双层拟物视觉基线。
- 会话追加：用户复测确认页面仍有明暗差异；进一步定位到后续 `.header-title-trigger > span` 规则重新覆盖了去重声明，首页实际仍为双层滤镜、食谱页为单层滤镜。本轮改为把首页双层视觉基线抽到共享标题内容层，所有 `AppHeader`/`PageHeader` 标题统一经过相同层级。
- 验证追加：前端全量测试（27 个文件、252 passed）、定向共享标题测试、lint、生产构建和 `git diff --check` 均通过。

### 2026-08-24 — 优化拟物主题 Web/PWA 图片加载（本次会话）

- 状态：待评审。
- 目标：降低拟物主题和 Web/PWA 首屏启动画面的网络传输体积，图片统一转换为 WebP `q90`，并将 HTML 启动画面从 `1024x1024` 启动图拆分为独立的小尺寸资源。
- 范围：`frontend/public/assets/theme` 拟物主题图片、Web/PWA 启动画面资源、`frontend/index.html`、相关前端资源契约测试和本进度记录；不修改导航隐藏图片加载策略、Service Worker、SVG 滤镜、按钮结构或移动端原生启动资源。
- 设计/需求基线：用户本次明确要求；前序只读性能分析中的生产构建请求与图片体积数据；现有 HTML 首帧启动壳和拟物主题资源引用。
- 预期验证：WebP 文件存在且为有效图片，代码不再引用本次替换的 PNG 运行时资源；前端测试、lint、生产构建和 `git diff --check` 通过，并核对构建产物中的资源引用和体积。
- 会话记录：已确认首屏启动图约 `544 KB`、拟物底部导航三图约 `490 KB`，当前主题图片使用 PNG；本轮按用户指定质量 `q90` 生成 WebP，新增独立小尺寸启动图供 HTML 首帧使用，保留 iOS `apple-touch-startup-image` 的既有大图契约。
- 完成：将 8 张拟物主题 PNG 替换为同尺寸 WebP `q90`，更新 CSS、导航组件和资源契约测试；新增 `frontend/public/app-boot.webp`（`256x256`）供 HTML 首帧使用，`splash-1024.png` 仅保留给 iOS 启动画面。
- 验证：前端全量测试（27 个文件、256 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；构建产物主题资源仅包含 WebP，主题资源总量约 `4.05 MiB → 0.18 MiB`，HTML 首帧启动图约 `544 KB → 1.28 KiB`。
- 未验证：尚未在真实 Safari PWA、Android/iOS WebView 和真机上确认 WebP 解码兼容性、拟物资源视觉无损及首次安装启动画面时序；未执行发布。
- 下一步：在真实 PWA/移动设备清理旧缓存后复核拟物导航、按钮材质和首帧启动图，确认后按发布流程处理。
