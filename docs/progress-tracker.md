# FridgeBoard 开发进度

更新时间：2026-09-09
当前会话：Android 小组件食材缺货颜色修复。
状态：完成；已让小组件按单个食材区分缺货危险色与正常主文字色，并完成 bridge、原生单元测试、真机模拟器渲染测试、前端 lint/build 和差异检查；未提交、未发布。
历史记录：[archive/progress-tracker-history.md](archive/progress-tracker-history.md)
需求基线：[product-requirements.md](product-requirements.md)

### Android 小组件食材缺货颜色修复会话（2026-09-09）

- 状态：完成；实现和自动化验证已通过，未提交、未发布。
- 目标与范围：修复 Android 桌面小组件食谱行的食材颜色，使缺货食材沿用危险色、库存充足食材使用主文字色；保持菜名、完成状态、食材开关、行高和数据同步行为不变。范围包括 Web→Android 小组件数据桥接、原生快照模型与行渲染测试，不涉及发布。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md` §4.1、§8；`docs/functional-design-and-feasibility.md` §9.6；主项目 `frontend/src/sharedUi.tsx:527` 与 `frontend/src/styles.css:583` 的按食材缺货样式；当前 `RecipeWidgetRenderer`、`recipeWidgetBridge` 和 Android 小组件验收测试。
- 调研结论：当前 bridge 将食材压成一个 `ingredientsDisplay` 字符串，原生插件再将其恢复为单个食材，并按整道食谱 `missingCount` 给整段食材统一上色，因此一项缺货会使同一行所有食材变红。
- 已完成：bridge 改为传递每项食材的 `displayText` 与 `missing` 标记；原生插件保留结构化快照；小组件行渲染器逐项设置 `widget_danger` 或 `widget_ink`，缺货统计提示继续使用危险色；补充混合缺货/充足食材的设备渲染断言，并同步功能设计文档。
- 验证：前端 `src/recipeWidgetBridge.test.ts`（6 项）、`npm run lint`、`npm run build`、Android `:app:testDebugUnitTest`、`:app:assembleDebug`、`:app:connectedDebugAndroidTest`（Pixel 10 Pro API 37，9 项）和 `git diff --check` 均通过。
- 未验证：未在真实 Android 手机上安装，未提交、未发布。

### 发布流程单次构建与 Android Release 缓存失效会话（2026-09-09）

- 状态：完成；workflow、发布脚本、Android 元数据服务、测试和部署文档均已更新，尚未执行生产发布。
- 目标与范围：统一服务器与 APK 的 12 位 release；发布过程只触发一次 Android Release workflow；复用现有 Flycn 服务间密钥保护 Android Release 元数据缓存清除接口，并在发布后自动调用和校验，不新增 token。
- 调研结论：`scripts/deploy-image.sh` 默认按本地当前时间生成 release，而 `.github/workflows/android-release.yml` 的 tag push 分支按提交时间生成 release；workflow 同时支持 tag push 与手动触发，导致本次发布为统一 release 而重复构建。`AndroidUpdateService` 使用进程内 5 分钟 TTL，当前没有失效入口。
- 已完成：新增 `scripts/publish-release.sh`，统一生成 release 并显式传给服务器部署和唯一一次 `workflow_dispatch`；Android workflow 移除 `push` tag 触发；新增复用 `FRIDGEBOARD_FLYCN_CLIENT_SECRET` 保护的 `POST /api/internal/android/releases/cache/clear`，成功后清除进程内缓存并记录审计日志；发布脚本校验线上版本、release 和构建号。
- 验证：Android 元数据服务测试 5 项通过；`uv run ruff check backend`、`npm run test:smoke`（后端 6 项、前端 35 项）、`uv lock --check`、脚本 `bash -n`、发布脚本 dry-run、`git diff --check` 均通过。
- 未验证：尚未重新发布 APK；缓存接口会复用现有 `FRIDGEBOARD_FLYCN_CLIENT_SECRET`，线上调用需在已有生产密钥配置生效后验证。

### `0.2.5` 生产与 Android APK 发布会话（2026-09-09）

- 状态：完成；已提交、部署生产服务器并完成 Android Release workflow；真实 Android 设备安装仍未验收。
- 目标与范围：将当前工作区改动纳入 `0.2.5` 补丁版本，递增 Android `versionCode`，完成默认发布 smoke、提交 Git、部署生产服务器/PWA，并以同一提交推送 `v0.2.5` 触发正式签名 APK 发布。
- 设计与发布基线：当前 `main`（`0.2.4` 标签之后的工作区提交）、`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md`；服务器 release 由部署脚本自动生成，APK 版本为 `0.2.5`、预期 `versionCode=1700000023`。
- 预期验证：`npm run test:smoke`、版本/发布脚本检查、Git 提交与标签、服务器数据库备份/容器健康/公网健康检查、GitHub Actions 签名 APK、包元数据和 SHA-256 digest、同域更新元数据。
- 已完成：提交 `5d6ddc9e9ad0fe15244955ceb0a029be59379d08` 已推送 `main` 与 `v0.2.5`；服务器 release 为 `260909114802`，数据库备份为 `/data/fridgeboard.db.backup-20260909-034816`，容器 `running/healthy`、重启 `0`，镜像 ID 为 `sha256:03965d8393cbd4712c83b779fadce396d472d30cbe479448c7fea9577a3bd803`；公网 `/healthz` 返回 `{"status":"ok"}`。
- Android Release workflow run [`34308983659`](https://github.com/flywhc/FridgeBoard/actions/runs/34308983659) 成功，GitHub Release [v0.2.5](https://github.com/flywhc/FridgeBoard/releases/tag/v0.2.5) 使用服务器 release `260909114802`，APK `FridgeBoard-0.2.5-android-1700000023.apk`，大小 `7441755` 字节，SHA-256/digest 为 `d1e79aa80ee6291891601f04256bbec89522c8eb732f55df510539d198b337b9`；包名 `com.fridgeboard.app`、`versionName=0.2.5`、`versionCode=1700000023`。清理服务缓存后，同域更新接口已返回相同版本、release、构建号、文件大小和 SHA-256。
- 未验证：未在真实 Android 设备上安装本次 APK；workflow 仅有 GitHub Actions 的 Node.js 20/setup-java 弃用提示，不影响构建和 digest 门禁。

### 测试分层与发布 smoke 流程优化会话（2026-09-09）

- 状态：待评审；发布 smoke、测试精简、SSE 尾延迟修复和文档同步均已完成并通过回归，未提交、未发布。
- 目标与范围：将正式发布前的默认验证从后端/前端/Android 全量回归改为关键运行链路 smoke test；全量回归继续由 CI 和高风险变更承担；删除只锁定源码拼写、静态视觉细节或普通文案、不验证外部行为的测试。此次不改变应用功能、API、数据库和生产部署拓扑。
- 调研结论：后端全量 `uv run pytest` 实测 247 项约 72 秒，两条包含模型等待/重试的分类匹配测试各约 8.3 秒；前端全量 459 项约 6 秒。`backend/tests/test_health.py`、`frontend/src/App.test.ts` 及若干 contract 测试混入大量源码字符串、CSS 像素和中文文案断言，维护成本与回归价值不匹配。现行项目规则还要求每次正式发布重复执行全量测试、lint、构建和 Android 检查，未区分改动风险与 CI 已有覆盖。
- 已完成：新增 `npm run test:smoke`，以后正常发布默认只运行 6 条后端关键集成链路和 5 个前端关键边界文件；全量回归保留给 CI，并补上 CI 原先遗漏的前端 Vitest。删除 4 个纯源码/发布接线/普通主题文案测试文件及 Kindle 两组只锁定文案、类名、SVG 路径和 CSS 像素的静态断言，共精简后端 2 项、前端 17 项。新增测试取舍规则，禁止为普通文案、CSS 精确拼写、源码片段和私有调用顺序新增测试。分类 SSE 和通用模型 SSE 改为在异步任务完成时显式唤醒事件队列，消除 provider 完成后的 8 秒/0.8 秒尾等待；相关三项测试由原先约 19 秒降至约 3.5 秒。
- 验证：`npm run test:smoke` 通过（后端 6 项、前端 5 文件/35 项，约 4 秒）；`uv run pytest -q` 通过（245 项，约 57 秒，相比基线约 73 秒缩短 22%）；`npm run --prefix frontend test` 通过（45 文件/442 项，约 6 秒）；`uv lock --check`、`uv run ruff check backend`、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`sh -n scripts/release-smoke.sh` 和 `git diff --check` 均通过。
- 未验证：未触发 GitHub Actions，未构建 Docker/移动端产物，未执行生产发布；本次不改变这些产物及发布目标。后端全量测试仍有 78 条既有依赖弃用/aiosqlite 线程清理警告，不影响本次通过，但应在独立依赖治理任务处理。

### Android 系统小组件添加页预览演示数据会话（2026-09-09）

- 状态：待评审；已移除静态预览文案单元测试并完成回归，未提交、未发布。
- 目标与范围：修复系统“添加小组件”页面中今日食谱小组件预览仅显示空标题的问题；新增静态演示食谱列表和完成进度，让用户在未绑定冰箱、未同步真实数据时也能看到小组件视觉效果。不改变桌面运行时布局、真实快照、配置和交互逻辑。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.6；`frontend/android/app/src/main/res/xml/recipe_widget_info.xml`；现有小组件材质资源及原生验收测试。最终 UI 注册表与本地设计资产未登记独立的小组件预览稿，沿用已验收的小组件材质与布局规则。
- 调研结论：`previewLayout` 当前指向 `recipe_widget.xml`，其中列表内容区和底部进度区默认 `gone`，真实食谱仅由已绑定实例的数据同步后注入；因此系统添加页预览天然为空。
- 已完成：新增独立的 `recipe_widget_preview.xml` 静态 RemoteViews 预览布局，复用现有小组件材质、星期标签、锅形图标和进度条，展示“番茄炒蛋”“香菇鸡丁”“清蒸鲈鱼”及“本周完成 1/3”；`recipe_widget_info.xml` 的 `previewLayout` 改指向该资源。按反馈不为简单静态预览文案新增单元测试。为兼容 Launcher 预览渲染，预览列表使用固定 120dp 内容高度，不依赖 `0dp + layout_weight`。
- 验证：`xmllint --noout frontend/android/app/src/main/res/layout/recipe_widget_preview.xml frontend/android/app/src/main/res/xml/recipe_widget_info.xml`、`cd frontend/android && ./gradlew :app:testDebugUnitTest :app:assembleDebug`、`git diff --check` 通过；Debug APK 安装到 `emulator-5554` 后，在 Pixel Launcher 的“Widgets → Browse → 家常食橱”预览卡片中确认显示三条演示食谱、完成态和“本周完成 1/3”，证据截图为 `/tmp/fridgeboard-launcher-widget-preview-final.png`。
- 未验证：真实 Android 设备、其他厂商 Launcher/API 版本和正式签名 APK 尚未验证。

### Android 登录回跳失败提示清理等待状态会话（2026-09-09）

- 状态：待评审；实现和受控模拟器验证已完成，未提交、未发布。
- 目标与范围：修复浏览器登录回跳失败时同时显示“正在等待登录结果……”和“登录暂时未完成……”的问题；失败状态应解除登录处理中锁定，只保留可重试的错误提示，不改变成功回跳和重新登录流程。
- 设计与需求基线：用户本次反馈；`frontend/src/mobileAuth.ts` 的回跳进度事件；`frontend/src/App.tsx` 的 `mobileLoginPending` 状态；`docs/pairing-and-onboarding-redesign.md` 的移动端登录回跳流程；模拟器 `emulator-5554` 的当前 APK 和 Android 日志。
- 根因：回跳失败时 `mobileAuth.ts` 发送 `failed` 事件，但 `App.tsx` 只更新错误消息，没有清除 `mobileLoginPending`，所以等待提示仍被渲染。
- 已完成：失败事件处理先调用 `setMobileLoginPending(false)`，再显示“登录暂时未完成，请检查网络后重新登录。”；新增静态回归断言覆盖该状态清理顺序。
- 验证：`npm run --prefix frontend test -- --run`（全量 49 个测试文件、459 项通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；Debug APK 已重新构建并安装到 `emulator-5554`，通过受控无效深链触发失败回跳，页面只显示失败提示，不再显示“正在等待登录结果……”。
- 未验证：有效公网 SSO 成功回跳仍未验证，当前模拟器认证请求曾超时；未在真实 Android 设备、生产 APK、其他网络条件和其他 Android WebView 版本验证；未提交、未发布。

### Android 首次启动认证状态异常时显示登录/注册页会话（2026-09-09）

- 状态：待评审；实现和模拟器验证已完成，未提交、未发布。
- 目标与范围：修复 Android APK 首次启动在认证状态请求未完成/失败时误进入“我的冰箱 / 还没有冰箱”的问题；首装无缓存时显示“登录或注册”，保留已有本地工作区缓存及已确认登录后的离线兜底行为；补充前端回归测试和本记录。
- 设计与需求基线：用户本次反馈；`frontend/src/App.tsx` 的所有者认证启动状态机；`frontend/src/appApi.ts` 的 Capacitor 请求链路；`docs/pairing-and-onboarding-redesign.md` 与 `docs/ui-design-specification.md` 的首次使用入口；模拟器 `emulator-5554` 首装画面、CDP 网络事件和 Android 日志。
- 根因：Capacitor WebView 首次启动时公网 `/api/auth/status` 请求在模拟器网络条件下未及时完成；`loadOwner()` 原先对认证状态未知的异常统一设置 `ownerState='signed-in'`，首装空缓存因此进入空冰箱切换页。
- 已完成：新增 `getOwnerLoadFailureState()`；认证状态尚未确认且本地无冰箱缓存时进入未登录首页，已有缓存或认证已确认时继续保留工作区并显示重试错误；补充首装和缓存兜底测试。
- 验证：前端 `App.test.ts` 194 项、全量 49 个测试文件/458 项通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；`npm run --prefix frontend build:android` 成功，Debug APK 安装到 `emulator-5554` 后执行 `pm clear` 首次启动，CDP 读取到“开始使用家常食橱 / 扫描冰箱二维码 / 登录或注册”，截图 `/tmp/fridgeboard-first-run-fixed-final.png` 与页面一致；Android 进程日志无崩溃或 JavaScript 异常。
- 未验证：当前模拟器仍无法在 30 秒内完成公网认证请求，登录按钮点击后的完整 SSO/回跳流程未验证；未在真实 Android 设备、生产 APK、其他网络条件和其他 Android WebView 版本验证；未提交、未发布。

### 小组件标准连续列表与咖啡色滚动条会话（2026-09-09）

- 状态：待评审；实现及原生自动化验证通过，真实 Launcher 视觉待验收。
- 目标与范围：每条食谱作为一个原生 ListView item，移除页点和分页控制；右侧滚动条复用“本周完成”填充色 `widget_progress_fill`（`#B48F6D`）；保留两种尺寸的食材开关、行内食材、完成/撤销、刷新与缓存。
- 基线：用户最新确认取代此前每次手势最多一页的要求；UI 规范、功能设计 §9.6、既有 `artifacts/android-widget-screenshot-acceptance/` 材质基线；注册表无独立 Widget 设计稿。
- 已完成：一条食谱一个 ListView item；删除旧整页布局、页点控件/样式、分页算法、页码持久化与强制滚动定位。滚动条为右侧 3dp 咖啡色、内容可滚动时不淡出，锅按钮不再使用负边距。带食材行高从 64dp 收紧至 56dp，纯菜名单行沿用 40dp。完成/撤销由食谱 ID 和绘制时完成状态校验，避免旧点击在排序变化后作用于另一条食谱。
- 验证：Android 工程目录下 `./gradlew :app:testDebugUnitTest :app:assembleDebug` 通过（52 项单测）；`./gradlew :app:connectedDebugAndroidTest` 通过（Pixel 10 Pro API 37，7 项）。真实 ListView 控件使用生产 Factory/RemoteViews 数据，覆盖 180/360dp 宽、220dp 高、两种食材开关、7 条列表数据、首屏完整容纳 2/3 条、滚动到末项、固定 footer 和滚动条像素颜色。相关 XML `xmllint --noout`、脚本 `bash -n` 与 `git diff --check` 通过。
- 排障记录：首轮单测发现旧分页接线断言，已更新为 ID/状态校验；首轮仪器测试的 AppCompat Activity inflater 将 ImageButton 替换成不支持 RemoteViews 反射的 AppCompatImageButton，改用应用 Context 按系统宿主方式加载后通过。此项属于测试宿主问题，不以绕过 RemoteViews 异常作为应用实现。
- 未验证与下一步：上述是原生列表宿主测试，不等同完整 Launcher RemoteViewsService 端到端验收；真实手机、小米 Launcher、API 24/30、系统字体放大、真实网络完成/撤销尚未重测。已更新 `scripts/verify-android-widget-launcher.sh` 为连续列表验收，未运行（需已配置的 7 道验收食谱 Widget）。下一步在实际桌面核对两种尺寸、开关、滚动条和完成/撤销；未运行无关 Web/后端检查，未提交、未发布。

### 小组件食谱所属冰箱与食材显示开关会话（2026-09-08—09-09）

- 状态：待评审；实现与自动化验证已完成，未提交、未发布。
- 目标与范围：将小组件设置页标题改为“食谱所属冰箱”，在底部增加椭圆开关“列出食材”并按实例保存；开启时 4×2/2×2 均显示食材，食材紧跟食谱名称并最多换为第二行，关闭时两种尺寸均只显示食谱名称；4×2 改为单列纵向列表，保留 2×2 三行列表及完成、分页、刷新链路。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.6；既有小组件本地验收材料 `artifacts/android-widget-screenshot-acceptance/`。`docs/final-ui-designs.md` 与 `docs/ui-assets/manifest.json` 未登记独立的小组件配置页草稿。
- 已完成：配置页标题改为“食谱所属冰箱”，底部增加按小组件实例持久化的椭圆“列出食材”开关；旧配置缺少字段时默认开启以保持原有显示。开启时 4×2/2×2 均为单列、每页最多 2 条，每条食谱名称后显示最多两行食材；关闭时均为单列三行且只显示食谱名称；4×2 已移除左右双列结构。分页、完成/撤销、刷新、缓存和 RemoteViews 绑定链路均按开关同步。
- 验证：`./gradlew :app:testDebugUnitTest :app:assembleDebug` 通过；`./gradlew :app:connectedDebugAndroidTest` 通过（Pixel 10 Pro API 37，8 项）；相关资源 XML `xmllint --noout` 和 `git diff --check` 通过。
- 未验证：真实 Android 设备、第二个 Launcher、API 24/30 及其他高度档位的视觉表现；未提交、未发布。

### 小组件开关视觉、行内食材与整页翻页会话（2026-09-09）

- 状态：已被新方案替代；开关与行内食材保留，整页手势与页点需求由本日标准连续列表方案取代，未提交、未发布。
- 目标与范围：保持小组件配置页为 Android 原生 Activity/XML；将“列出食材”开关改为页面底色奶白圆钮、输入框咖啡色凹陷轨道；将食材与食谱名称合并为同一行内文本，首行放不下时最多换至第二行；将小组件上下手势改为每次最多翻越一页，保留页点精确翻页和完成/撤销操作。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md` §4.4、§7；`docs/functional-design-and-feasibility.md` §9.6；现有 `widget_input`/`widget_paper` 颜色令牌及小组件本地验收材料 `artifacts/android-widget-screenshot-acceptance/`。
- 已完成：配置页继续使用 Android 原生 `Activity`/XML；开关轨道改用输入框咖啡色 `widget_input` 并加入内凹高光/阴影，滑块改用页面奶白色 `widget_paper`；菜名与食材合并到同一 `TextView` 文本流并限制为最多两行。尝试使用 `StackView` 实现离散上下滑动后确认其原生堆叠行为会造成多个页面同时可见，已暂停该方案，避免继续扩大视觉回归。
- 验证：开关/行内食材实现阶段的 `./gradlew :app:testDebugUnitTest :app:assembleDebug`、`./gradlew :app:connectedDebugAndroidTest`、相关资源 XML `xmllint --noout` 和 `git diff --check` 均通过；StackView 方案安装到 `emulator-5554` 返回 `Success`，但已确认出现叠页回归。
- 后续结论：用户已取消手势分页，按本日“标准连续列表与咖啡色滚动条”会话完成替代实现；真实设备和其他 Launcher 的未验证项见新会话。

### 小米 Launcher 小组件尺寸兼容修复会话（2026-09-08）

- 状态：待评审；兼容元数据修复、本地模拟器添加验收和 4×2/2×2 缩放回归已完成，未提交、未发布。
- 目标与范围：保持 Android 12+ 使用 `targetCellWidth=4`、`targetCellHeight=2` 的默认 4×2，并让忽略 `targetCell*` 的设备/Launcher 通过兼容 dp 元数据仍解析为 2 行；保留横向缩放到 2×2，不改变 RemoteViews 内容、绑定和交互。
- 设计与需求基线：本次用户反馈；`docs/functional-design-and-feasibility.md` §9.6；`frontend/android/app/src/main/res/xml/recipe_widget_info.xml`；Android 官方 `AppWidgetProviderInfo` 尺寸规则与“Provide flexible widget layouts”文档。
- 已完成：`minHeight`、`minResizeHeight`、`maxResizeHeight` 由 `180dp` 调整为 `110dp`，保留 `targetCellWidth=4`、`targetCellHeight=2` 和横向缩放；同步更新 wiring 测试与 §9.6 兼容性说明。
- 验证：`./gradlew :app:testDebugUnitTest :app:assembleDebug`、`git diff --check` 通过；Debug APK 已安装到 `emulator-5554`（Pixel 10 Pro API 37，1280×2856、480dpi）。Pixel Launcher 的 Widgets 列表显示“家常食橱 / 1 widget”，预览显示 `4 × 2`；新增实例绑定“测试”冰箱后桌面显示为 4×2，临时缩放到 2×2 后显示窄版布局，再恢复为 4×2。`dumpsys appwidget` 显示两个实例，provider 兼容最小尺寸为 `110dp × 110dp` 对应值 `28161×28161`。
- 未验证：真实小米 17、其他厂商 Launcher、API 24/30 和其他高度档位；未执行提交、发布。

## 2026-09-08 — Android 小组件 4×2 / 2×2 紧凑布局

### `0.2.4` Git 提交、生产发布与 Android APK 发布会话（2026-09-08）

- 状态：完成；当前已完成的 Android 小组件布局修正及相关文档改动已纳入 `0.2.4` 补丁版本，质量门禁、Git 提交、生产服务器发布和正式签名 APK 发布均成功。
- 设计与发布基线：当前工作区改动；`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md`；服务器 release 由部署脚本自动生成，APK release 使用同一提交触发的 GitHub Actions。
- 提交与发布：应用提交 `8cdd3c7192e9e44ff224da257980dec102c68970`，合并远端发布记录后 `main` 为 `10ce9e2`；`v0.2.4` 标签已推送。生产 release 为 `260908175958`，数据库备份为 `/data/fridgeboard.db.backup-20260908-100013`，容器为 `healthy`，公网 `/healthz` 返回 `{"status":"ok"}`。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（247 passed，78 条既有警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test`（49 个文件、456 项通过）、`npm run --prefix frontend build`、Android `testDebugUnitTest`、`assembleDebug`、`connectedDebugAndroidTest`（Pixel 10 Pro API 37，7 项）、`git diff --check` 均通过。GitHub Actions run [`34213222831`](https://github.com/flywhc/FridgeBoard/actions/runs/34213222831) 成功，Release [v0.2.4](https://github.com/flywhc/FridgeBoard/releases/tag/v0.2.4) 已发布 APK `FridgeBoard-0.2.4-android-1700000022.apk`，文件大小 `7445104` 字节，SHA-256/digest 为 `e7fe471ca5d67031c46149dd1f579ec9054f5417b31c1ae4bc677036283c4bc2`；包名为 `com.fridgeboard.app`，`versionName=0.2.4`，`versionCode=1700000022`；同域更新接口返回相同版本、release、构建号、文件大小和摘要。
- 未验证：未在真实 Android 设备上安装本次 APK；未验证第二个 Launcher、API 24/30 和其他高度档位；Docker 构建日志含 Node.js engine、npm audit 和 GitHub Actions Node.js 20/setup-java 弃用提示，不影响本次发布成功。

### 4×2 垂直空间与食材第二行调整会话（2026-09-08）

- 状态：待评审；实现、自动化验证和 Pixel Launcher 截图验收已完成，尚未提交、未发布。
- 目标与范围：在上一版页点和完成图标横向留白调整的基础上，继续压缩 4×2 标题与列表、列表与“本周完成”之间的垂直空白，提高宽版列表单元高度，让每条食谱可稳定显示菜名和第二行食材；保持 2×2 的三行食谱、隐藏标题和食材摘要规则不变。
- 设计与需求基线：本次用户反馈；上一版 Pixel Launcher 验收截图及 UI 树 `artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/final-4x2.png`、`final-4x2-ui.xml`；当前 `recipe_widget_page.xml`、行布局和 `RecipeWidgetRules`。
- 预期验证：更新宽版行高与垂直间距规则，运行 Android 单元测试、连接测试、Debug APK 构建和 `git diff --check`；重新安装到 `emulator-5554`，注入包含食材摘要的确定性验收快照，截图确认 4×2 显示两行内容且上下间距收紧，并回归 2×2 三行布局。
- 已完成：宽版 `widget_row_height` 调整为 `56dp`，宽版行顶部 padding 在当前 4×2 高度档位降为 `0dp`，使四个单元填满列表可用高度；2×2 继续使用 `40dp` 行高、三行容量和隐藏食材摘要。补充宽版食材 TextView 可见性/非空渲染断言，并为验收单独使用带食材摘要的快照 fixture，不改变真实业务数据。
- 验证：`./gradlew :app:testDebugUnitTest :app:assembleDebug` 通过；`./gradlew :app:connectedDebugAndroidTest` 通过（Pixel 10 Pro API 37，7 项）；`git diff --check` 通过。Pixel Launcher 实测 4×2 bounds `[59,526][1221,1164]`，四行均显示菜名和食材摘要，列表内容区到第一行约 `4dp`、最后一行贴近 footer；2×2 bounds `[59,526][617,1164]`，仅显示冰箱名、三行食谱且食材摘要隐藏。最终截图及 UI 树：[`4x2-vertical-tight-final.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-vertical-tight-final.png)、[`4x2-vertical-tight-final-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-vertical-tight-final-ui.xml)、[`2x2-vertical-tight-final.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/2x2-vertical-tight-final.png)、[`2x2-vertical-tight-final-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/2x2-vertical-tight-final-ui.xml)。
- 未验证：真实物理设备、第二个 Launcher、API 24/30 和其他高度档位；未执行提交、发布。最终模拟器当前停留在 2×2 截图验收后的系统界面，4×2 最终画面已保存为上述 artifact。

### 页点与完成图标右侧留白再平衡会话（2026-09-08）

- 状态：待评审；尚未提交、未发布。
- 目标与范围：在上一轮页点左侧收紧的基础上恢复页点右侧留白宽度，并通过缩减页点轨道和完成图标占位把空间让给食谱文字。保持 4×2/2×2 的页数、行数、标题栏和交互行为不变。
- 设计与需求基线：本次用户反馈；已验收截图 `artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-latest.png`、`2x2-latest.png` 及对应 UI 树；当前 `recipe_widget_page*.xml` 与 `recipe_widget_row_*.xml`。
- 预期验证：重新构建并安装 Debug APK，在 Pixel Launcher 中复核 4×2 与 2×2 的页点左右留白、完成图标右侧间距和食谱文本可见宽度；同步运行 Android 单元测试、连接测试及 `git diff --check`。
- 已完成：页点轨道缩至 `12dp`，页点按钮保留 `20dp` 绘制/点击尺寸并允许溢出，使列表多获得 `8dp` 同时恢复上一版页点右侧留白；完成按钮使用 `-8dp` 右端补偿并将图标内边距改为 `start=10dp/end=2dp`，使菜名区域增宽、图标视觉位置靠右。
- 验证：模拟器 `emulator-5554`（Pixel 10 Pro API 37，1280×2856、480dpi）真实 Launcher 中，4×2 `widget_page_rows` 为 `[95,682][1149,1032]`、页点为 `[1149,682][1185,1032]`，完成按钮右端至卡片边界约 `1dp`；2×2 `widget_page_rows` 为 `[95,658][545,1056]`、页点为 `[545,658][581,1056]`，三行食谱正常显示。最终截图及 UI 树：[`rebalance-4x2.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/rebalance-4x2.png)、[`rebalance-2x2.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/rebalance-2x2.png)、[`rebalance-4x2-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/rebalance-4x2-ui.xml)、[`rebalance-2x2-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/rebalance-2x2-ui.xml)。
- 自动化验证：`./gradlew :app:testDebugUnitTest :app:assembleDebug` 通过；`./gradlew :app:connectedDebugAndroidTest` 通过（Pixel 10 Pro API 37，7 项）；`git diff --check` 通过。
- 未验证：真实物理设备、第二个 Launcher、API 24/30 和其他高度档位；未执行提交、发布。`ListView` 上下手势仍为连续滚动，精确分页由右侧页点负责。
- 最终复核：在最后一次 APK 安装后重新添加并缩放小组件，确认完成图标 `end=2dp` 内边距实际生效；最终截图及 UI 树为 [`final-4x2.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/final-4x2.png)、[`final-2x2.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/final-2x2.png)、[`final-4x2-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/final-4x2-ui.xml)、[`final-2x2-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/final-2x2-ui.xml)。

### 页点留白与 4×2 冰箱名称调整会话（2026-09-08）

- 状态：待评审；尚未提交、未发布。
- 目标与范围：继续收紧列表与右侧纵向页点之间的重复留白，使页点左右留白尽量对称；扩大 4×2 顶部冰箱名称的可用宽度，避免在仍有空间时以省略号截断。保持 2×2 隐藏状态位、紧凑食谱行、刷新按钮位置和小组件交互链路不变。
- 设计与需求基线：本次用户反馈；上一轮 Pixel Launcher UI 树 `artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-ui.xml`、`2x2-ui.xml`；当前布局 `recipe_widget.xml`、`recipe_widget_page.xml`、`recipe_widget_page_narrow.xml`。
- 预期验证：重新构建并安装 Debug APK，在已启动的 Pixel Launcher 模拟器中分别截图验收 4×2 与 2×2，确认页点两侧留白、4×2 冰箱名称完整显示及上一轮 4/3 条食谱容量；同步运行 Android 单元测试、连接测试和 `git diff --check`。
- 已完成：移除 4×2/2×2 页点容器的额外 `8dp` 右移，使列表与页点容器无重复间隔，页点图形在剩余轨道中左右对称；4×2 `widget_status` 扩至 `120dp` 并移除状态文本省略号，保留 2×2 状态位隐藏及刷新按钮右上偏移。
- 验证：模拟器 `emulator-5554`（Pixel 10 Pro API 37，1280×2856、480dpi）真实 Launcher 截图中，4×2 bounds `[59,526][1221,1164]`，`widget_status` 为完整“确定性验收冰箱”，`widget_page_rows` `[95,682][1125,1032]`、`widget_page_dots` `[1125,682][1185,1032]`，显示 4 条食谱；2×2 bounds `[59,526][617,1164]`，`widget_status` 不存在于可见树，显示 3 条食谱，`widget_page_rows` `[95,658][521,1056]`、`widget_page_dots` `[521,658][581,1056]`。截图及 UI 树：[`4x2-latest.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-latest.png)、[`2x2-latest.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/2x2-latest.png)、[`4x2-latest-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-latest-ui.xml)、[`2x2-latest-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/2x2-latest-ui.xml)。
- 自动化验证：`./gradlew :app:testDebugUnitTest :app:assembleDebug` 通过（55 项单测）；`./gradlew :app:connectedDebugAndroidTest` 通过（Pixel 10 Pro API 37，7 项）；`git diff --check` 通过。
- 未验证：真实物理设备、第二个 Launcher、API 24/30 和其他高度档位；未执行提交、发布。`ListView` 上下手势仍为连续滚动，精确分页由右侧页点负责。

### 紧凑度与控件位置调整会话（2026-09-08）

- 状态：待评审；未提交、未发布。
- 目标与范围：将刷新按钮向右上收紧，减少右侧纵向页点与内外边框的重复留白；压缩 4×2 列表上下留白以保持 4 条食谱可见；将 2×2 改为三行食谱容量并隐藏“今日食谱打卡”，仅保留使用原标题字号/字重的冰箱名称。保持绑定、分页、完成/撤销和刷新链路不变。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.6；上一轮 Pixel Launcher 截图和 UI 树证据 `artifacts/android-widget-screenshot-acceptance/`。
- 实现结果：4×2 每页最多 4 条，使用 2×2 网格与 48dp 行高；2×2 每页最多 3 条，使用单列三行；统一外层 RemoteViews，按宽度动态压缩标题栏/底栏并在 2×2 隐藏状态位，避免 Launcher resize 后保留旧外壳；菜名/食材摘要按紧凑宽度截断；刷新按钮向右上移动，页点区域改窄并向右收紧。绑定、完成/撤销、分页、离线缓存和事件驱动刷新链路保持不变。
- 已验证：模拟器 `emulator-5554`（1280×2856、480dpi、API 37）实测 4×2 bounds `[59,1198][1221,1836]`，UI 树确认“今日食谱打卡”+冰箱状态、2×2 网格 4 条；2×2 bounds `[59,1198][617,1836]`，UI 树确认完整冰箱名、隐藏 `widget_status`、三行“番茄炒蛋/香菇鸡丁/清蒸鲈鱼”。两种状态均取消 resize 选中框后保存截图：[`4x2-regression.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-regression.png)、[`2x2-check.png`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/2x2-check.png)，UI 树：[`4x2-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/4x2-ui.xml)、[`2x2-ui.xml`](../artifacts/android-widget-screenshot-acceptance/final-compact-adjustment/2x2-ui.xml)。
- 自动化验证：`./gradlew :app:testDebugUnitTest :app:assembleDebug` 通过；`./gradlew :app:connectedDebugAndroidTest` 在 Pixel 10 Pro API 37 上 7 项通过；`git diff --check` 通过。
- 未验证：真实物理设备、第二个 Launcher、API 24/30 和其他高度档位；未执行提交、发布。`ListView` 上下手势仍为连续滚动，精确分页由右侧页点负责。

## 2026-09-08 — FridgeBoard 0.2.3 补丁版本提交与生产发布

- 状态：完成；自动化质量门禁、Git 提交、生产服务器发布和 Android GitHub Release 均成功。
- 目标与范围：将当前工作区已完成但未发布的日期选择器年份直选、Android 小组件视觉/刷新修正及对应文档改动纳入 `0.2.3` 补丁版本；通过后端、前端和 Android 正式包质量门禁后提交 Git，并发布生产镜像及签名 APK。
- 设计与需求基线：当前 `main` 工作区及其既有进度记录；`README.md` 发布说明；`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`；版本文件 `frontend/package.json` 与 `frontend/package-lock.json`。
- 已完成：版本与锁文件均更新为 `0.2.3`；修正了一个因测试固定使用已成为历史周的日期导致的后端回归测试，生产逻辑未改动；本地正式签名 APK 和 CI 正式签名 APK 均通过包内版本与签名校验。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（247 passed，78 条既有警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test`（49 个文件、456 项通过）、`npm run --prefix frontend build`、移动权限检查、Android `testDebugUnitTest`、正式 APK 构建/校验和 `git diff --check` 均通过。APK 当前本地产物为 `output/mobile-release/FridgeBoard-0.2.3-android-1788797400.apk`，`versionName=0.2.3`、`versionCode=1788797400`、SHA-256 为 `3b3e36a9941aaefcfb00d001a748d8d6df78e0f4b5b4b75c03aec474aef38e8f`。
- 发布结果：本地提交为 `fa92ff819208291d99fa4b9869f7c37c397f2361`，通过 GitHub API 写入的等价远端发布提交为 `872c26f7710a879b7afbf0e315179f4458be82c0`，`v0.2.3` tag 指向该提交；发布结果文档随后以远端提交 `2e459fd026b8bf28b84597911cb9b76359ea4f25` 追加到 `main`。生产 release 为 `260908001841`，镜像 digest 为 `sha256:38e3c956db99b1803050d8c77111cbabc36857ddc561c0fb0494357e69c9a891`；容器 `running/healthy`、重启 `0`；数据库备份为 `/data/fridgeboard.db.backup-20260907-161858`，大小 `1560576` 字节、权限 `600`、属主 `appuser:appuser`，当前库与备份 `integrity_check=ok`、外键违规为 0；公网 `/healthz` 返回 `{"status":"ok"}`。
- Android 发布：GitHub Actions run [`34143677235`](https://github.com/flywhc/FridgeBoard/actions/runs/34143677235) 成功，[v0.2.3 Release](https://github.com/flywhc/FridgeBoard/releases/tag/v0.2.3) 已发布 APK `FridgeBoard-0.2.3-android-1700000021.apk`；文件大小 `7439932` 字节，SHA-256/digest 为 `3cf125d5a89015d4b236ceb51e99eb9bf43aac8330cfcab38042b18a1295bcde`，包名 `com.fridgeboard.app`、`versionName=0.2.3`、`versionCode=1700000021`；同域更新元数据返回相同版本、release `260908003122`、构建号和摘要。
- 未验证：未在真实 Android 设备上安装本次 APK 做手工验收；本地 Docker 构建因 Docker Hub 首次 `EOF`、本机无 `shared-builder` 且 legacy builder 无进展未完成，但生产服务器已成功完成 Docker 构建、重建和健康检查；GitHub Actions 有 Node.js 20/setup-java 弃用提示，不影响本次成功发布。

## 2026-09-07 — Android 小组件刷新图标统一与旧图标禁用规则

- 状态：待评审；实现、资源编译和小组件单测已通过，未提交、未发布。
- 目标与范围：将 Android 小组件右上角刷新图标替换为用户确认的前端“双向实心循环箭头”；在项目级 UI 规范中明确禁止继续使用当前版和 Git 历史版两个单向回转箭头，避免不同页面重新引入旧图标。仅修改图标资源、共享设计规则和本进度记录，不改变刷新业务逻辑或用户图片资源。
- 设计与需求基线：本次用户确认的刷新图标预览；`docs/ui-design-specification.md` §6.3、§8；`docs/functional-design-and-feasibility.md` §9.6；`frontend/src/SubcategoryIconEditor.tsx:890` 的现有双向实心刷新路径；`frontend/android/app/src/main/res/drawable/widget_refresh.xml`。
- 已完成：小组件刷新资源改为 20×20 viewBox 的双向实心循环箭头；更新 Android 视觉契约测试；在 UI 规范和小组件功能规则中冻结该路径并明确废弃两个单向旧变体。
- 验证：`xmllint --noout frontend/android/app/src/main/res/drawable/widget_refresh.xml`、`./gradlew :app:assembleDebug`、`./gradlew :app:testDebugUnitTest` 和 `git diff --check` 均通过。
- 未验证：未在真实 Android 设备或 Pixel Launcher 上安装新 APK 做视觉截图验收；未运行全量前端 lint/build；未进行正式发布或 Git 提交。
回归矩阵：[requirements-traceability.md](requirements-traceability.md)

## 2026-09-07 — Android APK 日期选择器年份直选

- 状态：待评审；实现、自动化验证和 Debug APK 构建已完成，未提交、未发布。
- 现象：Android APK 中生产日期、保质期至共用的应用内日期选择器只能通过月份前后按钮逐月切换，顶部年份文字不可点击，跨年选择不便。
- 目标与范围：点击日期选择器顶部年份后显示可滚动/可点击的年份选择网格；选择年份后返回该年份的月份日历，保留现有月份、日期、清除和今天操作，不改动日期数据格式及添加/编辑流程。
- 设计与需求基线：`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §3、§17.1；最终设计稿 `pwa-add-food`（`e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`）和 `pwa-edit-food`（`7224e71b-8055-40ec-a9a9-db68b6744764`）；本地资产 `docs/ui-assets/png/`、`docs/ui-assets/html/`；现有 `frontend/src/datePicker.tsx` 与 `frontend/src/datePickerUtils.ts`。
- 已完成：顶部月份标题改为可点击按钮；点击后显示 12 个年份按钮，左右箭头按十年范围切换；选择年份保留原月份并返回日历；生产日期和保质期至共用该能力。补充年份范围、换年及年份网格标记测试。
- 验证：`npm run --prefix frontend test -- --run src/datePicker.test.tsx`（5 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend test`（49 个文件、456 项通过）、`npm run --prefix frontend build:android`（Capacitor sync、Gradle `assembleDebug` 成功，生成 `frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk`）和 `git diff --check` 均通过。
- 未验证：未在真实 Android 设备或模拟器中手工点按年份并截图验收；未执行正式发布、数据库备份、签名 APK 构建或 Git 提交。

## 2026-09-07 — Android 小组件专用贴图外框与视觉一致性修正

- 状态：待评审；实现、自动化验证及 Pixel Launcher 定向验收已完成，未提交、未发布。
- 现象：现有 Widget 仍使用与主工程不同的刷新图标和控件表面，XML/位图混合模拟的高光与阴影出现硬边、白线外溢和不一致的立体效果；此前多次局部调整未达到用户参考图及主工程拟物主题的视觉基线。
- 目标与范围：以主项目底部导航 `bottom-left.webp`、`bottom-center.webp`、`bottom-right.webp` 为材质母版，生成圆角外完全透明、移除底部及偏右外投影但保留面内柔和倒角的 Widget 专用外框；食谱行、星期标签、进度槽和页点统一使用同源贴图语言；刷新及锅形图标复用主工程精确 SVG 几何。同步复核单页列表、每页一个页点、点按/纵向滑动翻页、明确加载态和事件驱动刷新，避免视觉修正掩盖既有行为回归。
- 设计与需求基线：本次用户确认的混合贴图方案与最初参考图；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.6、§17.1；`docs/final-ui-designs.md` 与 `docs/ui-assets/manifest.json`；主工程 `frontend/src/styles.css`、`frontend/src/sharedUi.tsx` 及导航主题原始贴图。用户临时参考图片只用于对照，不修改或提交。
- 预期验证：先补或收紧资源 Alpha、图标路径、分页/页点、RemoteViews 可见性和无变化不重绘的失败用例，再运行 Android `testDebugUnitTest`、`assembleDebug`、可用模拟器上的 `connectedDebugAndroidTest`；安装调试包后在真实 Launcher 验证加载、三页内容、点按页点、上下滑动和静置不闪烁，并保存不同页面及透明外框截图。最后运行前端 test/lint/build 与 `git diff --check`，真实设备、第二 Launcher 和未覆盖 API 等级按实际结果记录。
- 根本原因与方案：XML `shape`/`layer-list` 无法复现主工程 CSS 的柔和扩散阴影，且此前页面高度没有扣除外框上下各 `12dp` 的透明圆角区，造成整页 item 超出 `ListView` 视口，点击下一页后产生行叠压和多组页点。现在由 `bottom-left.webp`、`bottom-center.webp`、`bottom-right.webp` 的固定 SHA-256、裁切区和设计参数确定性生成五套 density 的面板、行、星期标签、进度槽及页点位图/NinePatch；外框重新做透明圆角遮罩，裁掉底部和偏右外投影。刷新及完成/未完成锅形图标直接复用主工程 SVG 路径生成 Android vector，不再使用相似图标或圆形按钮底。
- 分页与刷新结果：集合保持单一 `ListView`，每个 item 是完整一页；页面内容高度统一扣除 `24dp` 外框透明区，7 条数据、每页 3 条得到 3 页和每页一组 3 个页点。圆点点击通过 fill-in intent 精确定位页面，上下滑动使用 `ListView` 原生连续滚动；Android RemoteViews 不提供页吸附，精确离散定位由圆点承担。移除了配置完成后的 `750ms` 延时全量重绘；metadata 的周期更新为 0，后台只使用一次性 WorkManager，普通刷新在数据签名不变时只做局部状态更新，不重绑列表或通知集合。
- 数据与状态修正：无快照时显示固定高度“正在读取数据”，而不是空白列表；同一冰箱的多个实例在 Worker 成功、失败、认证失效或旧代次恢复后统一收敛到终态；损坏快照不会使 RemoteViews 服务崩溃；过期页点、行按钮和实例 intent 均在执行前复核页面、食谱和冰箱绑定。
- 自动化验证：`uv run python scripts/verify-android-widget-assets.py`、两份资源脚本 Ruff、Android `testDebugUnitTest`/`assembleDebug`、Pixel 10 Pro AVD 上 `connectedDebugAndroidTest`（5 项）、前端测试（49 个文件、454 项）、前端 lint/build 和 `git diff --check` 均通过。资源测试覆盖五套 density 的 PNG/NinePatch、圆角外 Alpha、主工程源贴图哈希和图标路径；instrumentation 覆盖真实编译资源解码、加载/空态、7 条三页及页点数量。
- Launcher 验证：向 Pixel Launcher 的 `4×3` 实例注入确定性 7 条私有测试快照后，第一页显示周一至周三，点击第二个圆点后显示周四至周六；两页第一行纵坐标仅相差 2px，没有叠压。第一页和第二页截图保存为 `artifacts/widget-final-page0.png`、`artifacts/widget-final-page1.png`。静置 0/4/8 秒的三张全屏截图 SHA-256 均为 `ea5874d219d53c6e9f2c27b9e53163a43766c9adea768cbb598419a3fe6598d4`，同期筛选日志没有 Widget、WorkManager 或 HTTP 活动，未复现周期闪烁。
- 未验证：真实物理 Android 设备、第二个 Launcher、API 24/30、不同 Launcher 高度档位，以及使用真实 owner/daily_access 凭证的在线完成/撤销、401/403 和网络超时链路；未提交、未发布。上下滑动在 `ListView` 中是连续滚动而非吸附分页，这是 RemoteViews 控件能力边界，圆点点击已作为精确页面导航。

## 2026-09-06 — 重做 Android 小组件分页与视觉验收

- 状态：待评审；未提交、未发布。
- 现象：先前两张“第一页/第二页”截图未形成肉眼可辨的页面切换证据；Pixel Launcher 的 `4×3` 实例仍只显示一行并产生 7 个页点；活动页点使用实体偏移色块模拟阴影，锅形完成/未完成图标、刷新图标和其他控件也没有严格复用主工程最终拟物主题。
- 已确认根因：当前实现直接把 Launcher 上报的 `OPTION_APPWIDGET_MIN_HEIGHT=163dp` 套入 `<220dp` 的一行规则，因此 7 条食谱被计算为 7 页；活动页点的 XML `layer-list` 不具备主工程 CSS 柔和模糊阴影的视觉能力；先前仅凭 UIAutomator 文本变化宣称截图验证，证据方法不充分。
- 目标与范围：以真实 Launcher 可用空间校准默认 `4×3` 的三行分页；页点数量严格等于页面数量且点击后显示对应切片；复用主工程最终拟物颜色、图标路径和柔和阴影视觉；确保无操作时不重绑 RemoteViews、不排队网络工作；加载前必须显示明确文案。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.6；`docs/final-ui-designs.md` 与 `docs/ui-assets/manifest.json`；`frontend/src/styles.css` 最终拟物主题令牌及实际食谱控件。
- 预期验证：先补失败规则/契约测试，再运行 Android 单元测试与构建；在 Pixel Launcher 注入确定性 7 条测试快照，分别截图并核对第一页/第二页菜名、可见页点数量和活动点；点击所有页点验证目标切片；对无操作 15 秒的 Widget 区域截图做裁剪哈希，并核对期间无新增 Worker/网络请求；保留真实设备和第二 Launcher 为未验证项。
- 最终根因：Launcher 的 `4×3` 实例实际高度约 `324.7dp`，旧代码却只采用 `OPTION_APPWIDGET_MIN_HEIGHT=163dp`，把 7 条食谱错误分成 7 页；`StackView` 控件自身会以透视堆叠同时露出多个 item，不能满足单页视觉；配置 Activity 提交期间系统把 RemoteViews 标记为 deferred，而 `forceFullUpdate` 又被进程内签名去重提前返回，导致已有缓存也永久停留在“加载中”。
- 已完成：按 Launcher 高度上下界确定 1/2/3 行容量；集合改为单一 `ListView`，每个 item 是完整页面且按内容区高度占满视口；7 条、每页 3 条固定得到 3 页和一组 3 个页点；圆点 fill-in intent 使用显式、可变 PendingIntent template，点击后 `setScrollPosition` 定位，上下平扫由集合原生处理。强制更新不再被签名去重拦截，配置完成后追加一次 750ms 的纯本地重绘跨过 Launcher deferred 窗口；该重绘不访问服务器。快照写入按 `capturedAt` 拒绝旧结果，数据未变化时不通知集合，周期更新仍为 0。
- 视觉结果：颜色取自主工程最终拟物令牌，星期标签使用浅咖啡色微凸位图；锅和刷新图标复用主工程路径语义且无圆形外框；面板、行、页点和凹陷进度轨道使用分 density 位图/九宫格柔和阴影，不再用 XML 实体偏移块模拟阴影。末页空槽隐藏，不显示空星期或锅图标。
- 验证证据：Pixel 10 Pro API 37、Pixel Launcher、`4×3` 实例通过 `scripts/verify-android-widget-launcher.sh artifacts/android-widget-launcher-final`。页面 1 为“番茄炒蛋/香菇鸡丁/清蒸鲈鱼”，点击第 2 点后页面 2 为“扬州炒饭/土豆炖牛腩/西红柿面”，上滑及单独点击第 3 点后页面 3 均仅“紫菜蛋花汤”；每页均严格 3 个页点且活动点与页面一致。15 秒静置的 4 张 Widget 裁图 SHA-256 均为 `b66ae9dd421e98a8d1a1b4621bf2a1a40b24bf7cb9cc3fc700ab7899b2acf439`，期间无新增 Widget/WorkManager 日志、WorkSpec 或诊断日志文件变化。该模拟器的 netstats 未记录应用 UID 行，故未把字节级网络统计计为通过证据。Android `testDebugUnitTest`、`assembleDebug`、`connectedDebugAndroidTest`（3 项）、前端 test（49 文件、454 项）、lint、build 和 `git diff --check` 均通过。
- 未验证：真实物理 Android 设备、第二个 Launcher、API 24/30 模拟器、不同高度档位的 Launcher 视觉、在线 owner/daily_access 完成/撤销全链路；未提交、未发布。模拟器仅安装 Debug APK 用于本次明确授权的调试。

## 2026-09-06 — 修复 Android 小组件刷新自循环

- 状态：待评审；未提交、未发布。
- 现象：无用户操作且食谱未变化时，设备上的 `RecipeWidgetAndroidWorker` 仍约每秒执行一次，小组件持续闪烁。
- 根因：`STALE_GENERATION` 结果无上限地重新排入同一刷新链；每个 Worker 结束时又无条件重绘并通知 RemoteViews 数据变化。
- 目标与范围：限制代次收敛为单次事件内的一次尝试，取消遗留刷新链，阻止无变化的 RemoteViews 重绑；不改变食谱排序、分页和用户图片资源。
- 已完成：`STALE_GENERATION` 每个事件最多触发一次恢复刷新，恢复任务再次过期时进入终态；系统初始化先取消旧刷新链并使用 `REPLACE` 重建；相同快照/状态/页码只跳过重绘或使用局部 RemoteViews 更新，数据真正变化时才通知集合刷新。
- 验证：Android `testDebugUnitTest`（31 项）、`assembleDebug`、前端 test（49 个文件、454 项）、lint、build、资源 XML 校验和 `git diff --check` 均通过；设备此前观测到的刷新循环根因为 WorkManager 一次性链自重排队，代码已覆盖该路径。
- 未验证：真实 Android 设备和第二个 Launcher；在线接口在模拟器存在 DNS/401 失败，已验证离线快照路径，未宣称在线同步通过。

## 2026-09-06 — 修复 Android 小组件空白页面、加载态与分页

- 状态：待评审；未提交、未发布。
- 现象证据：Pixel 10 Pro API 37 模拟器原有小组件只显示标题和空进度轨道；应用私有偏好中存在当前账号代次、本周快照及 7 条食谱。部署 Debug APK 后，`RemoteViewsService` 实测读取到 `snapshot=true`、`entries=7` 并生成页面 0–6，说明空白不是 API 数据为空；旧实例在 APK 更新后还出现 Launcher 未安装 `RemoteViews` 的残留状态。
- 已完成（后续方案已替代部分实现）：当时移除可见 `StackView` 并改为静态 RemoteViews，先消除了多行/多组圆点叠层；本页上方 2026-09-06 最终方案已改为“单一 `ListView` + 整页 item”，在保持单页视觉的同时恢复纵向滑动。其余高度计算、状态文案和事件驱动修复继续保留。
- 验证：Debug APK 已安装并在 Pixel 10 Pro API 37 Launcher 完成“添加→选择冰箱→桌面”流程；截图确认单一行卡片、左侧星期凸起标签、无圆圈锅图标、右侧每页一个圆点、当前圆点放大加深、`本周完成 4/7` 和凹陷进度条；UIAutomator 确认点击第 2 个圆点后 `pageIndex=1` 且显示“周六/炒麻食”；WorkManager 旧链清理后单次成功且 15 秒无新增工作；Android 单测、assemble、connected 测试及前端 454 项测试/lint/build 均通过。
- 未验证（由上方最终会话更新）：静态方案当时未保留上下平扫；现已在 Pixel Launcher 用整页 `ListView` 实机验证纵向滑动，真实 Android 设备/第二 Launcher、在线 DNS 恢复后的同步、各高度档位和锅按钮完整业务回滚仍待验收；未提交、未发布。

## 2026-09-05 — Android 小组件配置页安全区与拟物控件

- 状态：待评审；未发布、未提交；已根据后续产品反馈完成样式修正。
- 目标：修复配置页标题被钻孔屏/系统状态区遮盖的问题，将标题改为“选择显示哪个冰箱”，并把冰箱选择项、取消和完成按钮替换为应用拟物主题风格，同时保留原有单选、取消和完成逻辑。
- 范围：配置 Activity 的 WindowInsets 处理、配置布局、拟物选择项/按钮 drawable 与资源契约测试；不改变小组件绑定数据、同步逻辑、用户图片资源或桌面小组件布局。
- 设计与需求基线：`docs/ui-design-specification.md` §5–§7；`docs/functional-design-and-feasibility.md` §9.6；`docs/final-ui-designs.md`（无单独 Android 配置页草稿）；`docs/fridge-management-requirements-and-ui.md` §4.1；现有 `primary-master.webp`、`secondary-master.webp` 贴图按钮和单一冰箱图标语义。旧 `theme-system-design.html/png` 已标记废弃，不再作为控件颜色基线。
- 已完成：配置 Activity 切换为无 ActionBar 主题，使用 `WindowCompat`/`WindowInsetsCompat` 为上下系统安全区叠加页面内边距；标题改为“选择显示哪个冰箱”；配置列表按“我的冰箱”简化为单一冰箱图标和名称，移除详情、设置、拖动手柄及系统圆形单选按钮；取消/完成按钮改用现有 `primary-master.webp`/`secondary-master.webp` 九宫格贴图背景，统一为咖啡奶油色并保留原有业务逻辑；废弃旧绿色按钮视觉板并同步设计注册说明。
- 验证：Android `testDebugUnitTest`、串行 `assembleDebug`、全部资源 XML `xmllint --noout` 和 `git diff --check` 均通过；Pixel 10 Pro API 37.1 模拟器安装启动配置页成功，UI Automator 确认标题、选项、取消/完成按钮均可见，点击选项后确认 `checked=true`，截图确认标题和底部操作区未进入系统安全区且按钮贴图尺寸正常。
- 未验证：未在真实 Android 设备、不同挖孔/刘海形态及 Launcher 完整“拖放→配置→桌面保留”链路上验收；未发布或执行 Git 提交。

## 2026-09-05 — Android 小组件配置页底部按钮等宽修正

- 状态：待评审；未发布、未提交。
- 目标：让配置页“取消/完成”底部按钮与“编辑小类”页面一致，左右各占一半可用宽度并保留当前咖啡奶油色主次贴图，不使用删除危险贴图。
- 范围：Android 配置布局、按钮贴图样式契约测试和本进度记录；不改变选择项、绑定逻辑、安全区或业务文案。
- 设计与需求基线：`frontend/src/styles.css` 中 `.p5-custom-actions` 的 `repeat(2, minmax(0, 1fr))` 与 `8px` 间距；拟物主题 `primary-master.webp`/`secondary-master.webp` 按钮资源；本次用户反馈。
- 已完成：底部操作区改为 8dp 间距、两个 `0dp + layout_weight=1` 等宽按钮；取消继续使用 `secondary-master.webp`，完成继续使用 `primary-master.webp`，未接入删除危险贴图。
- 验证：Android `testDebugUnitTest`、串行 `assembleDebug`、资源 XML 校验和 `git diff --check` 均通过；Pixel 10 Pro API 37.1 模拟器 UI Automator 确认两个按钮宽度均为 556px、间距为 24px（8dp），截图确认颜色和贴图样式保持不变。
- 未验证：未在真实 Android 设备、不同屏幕密度和 Launcher 完整配置链路上验收；未发布或执行 Git 提交。

## 2026-09-05 — 排查 Android 首页持续加载

- 状态：待评审，已在 Android 模拟器验证修复，未发布。
- 目标：定位 Android 模拟器首页持续显示“正在读取首页数据…”的真实原因，并修复启动状态机或 APK 资源同步问题；未登录、已登录、缓存存在和请求失败均必须最终收敛到可操作状态。
- 范围：Capacitor Android 包内前端资源版本、`App.loadOwner` 首页启动请求与状态收敛、Android 模拟器 Logcat/网络证据、回归测试和本记录；不改变后端认证协议、用户业务数据或用户图片资源。
- 设计与需求基线：本次用户反馈；`PR-071`、`PR-078`、`RG-013`、`RG-020`；`docs/mobile-deployment-design.md` P13.3/P13.5 和现有首页缓存/认证状态机约定。
- 预期验证：先确认 APK 包内资源与当前源码一致并读取模拟器实际启动请求，再补可复现测试（如发现状态机缺口），运行前端 test/lint/build、Android 单元/构建检查和模拟器人工回归；未确认根因前不宣称修复完成。
- 根因结论：此前直接执行 Android Gradle 构建时没有先运行 Capacitor sync，APK 继续使用旧的 `android/app/src/main/assets/public`；`frontend/dist` 与包内入口资源分别为 21:45 和 14:41 构建，导致模拟器运行旧版首页启动逻辑，表现为长期停在“正在读取首页数据…”。网络正常，主机访问 `/healthz` 返回 `{"status":"ok"}`，不是服务端不可达。
- 已完成：执行 `npm run --prefix frontend build` 后运行 `npx cap sync android`，确认 `frontend/dist/index.html` 与包内入口 hash 一致；重新构建并安装 Debug APK，模拟器启动后 3 秒内显示正常冰箱布局、搜索框和底部导航，UI 树不再包含“正在读取首页数据…”。标准 `npm run --prefix frontend build:android` 已包含资源同步步骤。
- 验证：`npx cap sync android`、Android `assembleDebug`、`adb install -r` 返回 `Success`；模拟器 `emulator-5554` 的 UI Automator 启动回归通过；前端全量测试（49 个文件、454 项通过）、lint、build、移动权限检查和 `git diff --check` 均通过。
- 未验证：未在正式发布 APK、真实 Android 设备或无缓存/已登录真实账号场景下重复验收；未执行发布或 Git 提交。

## 2026-09-05 — 修复 Android 小组件添加后消失

- 状态：待评审，模拟器配置页验证通过，未发布。
- 目标：修复从 Android Launcher 添加“今日食谱打卡”小组件后配置页消失、桌面不保留小组件的问题。
- 范围：小组件配置 Activity 与布局资源、Android 回归契约测试、模拟器安装和配置页启动验证；不改变小组件数据接口、凭证存储、用户图片资源或桌面布局设计。
- 设计与需求基线：本次用户反馈；`PR-080`、`RG-022`；`docs/functional-design-and-feasibility.md` §9.6 和 `docs/mobile-deployment-design.md` P13.5/P13.7。
- 现象与根因：Logcat 记录 `RecipeWidgetConfigureActivity.onCreate(RecipeWidgetConfigureActivity.java:34)` 抛出 `ClassCastException: android.widget.LinearLayout cannot be cast to android.widget.RadioGroup`。配置页启动即崩溃，Launcher 收到未完成配置结果后移除临时小组件，因此表现为添加后消失。
- 已完成：将 `activity_recipe_widget_configure.xml` 中 `widget_fridge_choices` 容器改为 `RadioGroup`，与配置 Activity 的 `getCheckedRadioButtonId()`/动态 `RadioButton` 逻辑一致；新增布局类型和 ID 契约测试。
- 验证：Android `testDebugUnitTest`、`assembleDebug`、配置布局 `xmllint --noout` 和 `git diff --check` 均通过；重新安装 APK 后以 `appWidgetId` 启动配置 Activity，模拟器 UI Automator 确认页面显示“选择小组件冰箱”、冰箱选项和“完成”按钮，未出现新的 `ClassCastException`/`FATAL EXCEPTION`。
- 未验证：未在 Launcher 中重新完成“拖放小组件→选择冰箱→点击完成→桌面保留并渲染”的完整人工链路；未发布或执行 Git 提交。

## 2026-09-05 — 修复 Android 登录找不到系统浏览器

- 状态：待评审，自动化验证通过，尚未正式发布。
- 目标：修复 Android 模拟器点击“登录或注册”时误报“未找到可用的系统浏览器”的问题；已安装并可手动打开 Chrome 时，登录 URL 必须能够交给 Custom Tabs 或系统浏览器处理。
- 范围：Android `NativeCapabilities.openExternalUrl` 的浏览器探测/Intent 兜底、Manifest Android 11+ 包可见性声明、原生桥接契约测试和本记录；不改变 SSO URL、回调协议、PWA 登录或用户图片资源。
- 设计与需求基线：本次用户反馈；`PR-071`、`RG-013`；`docs/mobile-deployment-design.md` P13.5/P13.8 中“系统浏览器 SSO”和 Android Custom Tabs 约定。
- 预期验证：先补“ResolverActivity 不应被当成无浏览器”和浏览器查询声明回归断言，再运行前端相关测试/lint/build、Android `testDebugUnitTest`/`assembleDebug`、移动权限检查和 `git diff --check`；真实模拟器点击登录及浏览器回跳保留为人工验收项。
- 根因结论：Custom Tabs 探测失败时，旧实现通过 `resolveActivity()` 取得系统 `ResolverActivity`，随后把它误判为无浏览器并拒绝启动；Android 11+ Manifest 也没有声明 Custom Tabs/HTTPS VIEW 查询，可能使已安装的 Chrome 对应用查询不可见。
- 已完成：Manifest 增加 Custom Tabs 服务和 HTTPS `ACTION_VIEW` 的 `<queries>`；Custom Tabs 启动失败时回退到普通 HTTPS `ACTION_VIEW`；删除对 `ResolverActivity` 的错误拒绝和预先绑定解析出的包名，让 Android 自己处理默认浏览器或选择器。
- 验证：`nativeBridgeContract.test.ts`（5 项通过）、前端全量测试（49 个文件、454 项通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、Android `testDebugUnitTest`、`assembleDebug`、Manifest `xmllint` 和 `git diff --check` 均通过；Pixel 10 Pro API 37.1 模拟器上 APK 安装返回 `Success`，已确认 Chrome 包存在、HTTPS `ACTION_VIEW` 解析到 `com.android.chrome`、Custom Tabs 服务已注册。
- 未验证：未在模拟器中从 App 页面实际点击“登录或注册”并完成 SSO 回跳；未正式发布或在真实 Android 设备上验收。

## 2026-09-05 — 发布 FridgeBoard 0.2.2 到服务器与 Android APK

- 状态：完成，自动化验证通过，待真实 Android 安装更新验收。
- 目标：发布当前 `main` 的 Android“今日食谱打卡”桌面小组件及相关前端改动到生产服务器，并生成正式签名 Android APK；按项目约定将“小版本”从 `0.2.1` 升级为 `0.2.2`。
- 范围：产品版本、Android `versionCode`、生产容器/PWA、数据库备份、健康检查、同域 Android 更新元数据、GitHub Release APK 和发布文档；不提交密钥、生产数据或运行时日志。
- 设计与发布基线：功能提交 `e7a4295`，最终发布提交 `d6aecce3d24bc7559409db3aa9cdd080614d41a9`；`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md`；Android 小组件设计与功能规则记录见下方 2026-09-05 条目。
- 预期验证：版本一致性、`uv lock --check`、后端 Ruff/pytest、前端 lint/test/build、移动权限检查、Android 单元测试与正式签名 APK 校验、Docker 构建、发布脚本语法/dry-run、服务器备份/容器健康/公网健康检查、同域更新元数据、GitHub Actions APK digest 和 `git diff --check`。
- 发布参数：产品版本 `0.2.2`，Android `versionCode=1700000019`；服务器 release 由 `scripts/deploy-image.sh` 自动生成，服务器与 APK 使用同一 release。
- 发布结果：提交 `d6aecce3d24bc7559409db3aa9cdd080614d41a9` 已推送 `origin/main`，标签 `v0.2.2` 已推送；服务器 release 为 `260905144157`，镜像 digest 为 `sha256:0752886bd09db07a1b0ae63cc9c7339ac0d3232f737782e48317fa409e179229`，容器 `running/healthy`、重启 `0`，远端 Alembic 为 `20260831_33 (head)`；数据库备份为 `/data/fridgeboard.db.backup-20260905-064219`，大小 `1560576` 字节、权限 `600`、属主 `appuser:appuser`，当前库和备份 `integrity_check=ok`、外键违规为 0。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（247 passed，77 条既有警告）、`npm run --prefix frontend lint`、前端全量测试（49 个文件、454 项通过）、`npm run --prefix frontend build`、移动权限检查、Android `testDebugUnitTest`、正式签名 APK 构建/校验、脚本语法/dry-run、`docker build --tag fridgeboard:local .` 和 `git diff --check` 均通过；公网 `/healthz` 返回 `{"status":"ok"}`，同域更新接口返回版本 `0.2.2`、release `260905144157`、build `1700000019` 和 APK SHA-256。
- Android 发布：GitHub Actions run [`33950625812`](https://github.com/flywhc/FridgeBoard/actions/runs/33950625812) 成功，[v0.2.2 Release](https://github.com/flywhc/FridgeBoard/releases/tag/v0.2.2) 已发布 APK `FridgeBoard-0.2.2-android-1700000019.apk`；文件大小 `7273794` 字节，SHA-256/digest 为 `692305cb58e4aedcd99e30dc22a1ecfc045d147c76b4762b423664a04258a6ac`，独立下载校验通过，包名 `com.fridgeboard.app`、`versionName=0.2.2`、`versionCode=1700000019`。
- 未验证：未在真实 Android 设备上安装 APK，未执行桌面小组件配置/换绑、分页、刷新、打卡、断网和认证失效的人工验收；未运行 `connectedDebugAndroidTest`（当前无连接设备）。发布过程中首次自动触发的重复 Actions run `33950618746` 已取消，不影响正式 run。

## 2026-09-05 — Android“今日食谱打卡”桌面小组件

- 状态：待评审；0.2.2 实机反馈的持续同步和视觉偏差已完成代码修复及自动化验证，尚未重新发布。
- 本次回归目标：定位配置后无数据快照的真实根因并补自动化用例；按用户复核调整为左侧浅咖啡色微凸星期标签、无圆形外框的锅图标、底部仅保留“本周完成 X/Y”和浅咖啡色凹陷进度条，右侧使用纵向分页圆点并放大/加深当前页；移除可见上一页、下一页和页码文字。
- 本次范围：Widget Worker/API 响应解析和状态收敛、`StackView` 上下平扫与按页圆点、Widget 布局/drawable/颜色/尺寸、对应单元与资源契约测试、功能和验收文档；不修改用户参考图片，不安装 APK，不提交或发布。
- 本次预期验证：先补配置同步失败复现测试，再运行 Android `testDebugUnitTest`、`assembleDebug`、资源 XML 校验、前端 lint/test/build、可用设备上的 `connectedDebugAndroidTest` 和 `git diff --check`；真实 Launcher 仍保留为未验证项。
- 本次根因：`RecipeWidgetPlugin.publishWeek` 成功写入 App 后台获取的本周快照后只触发重绘，没有把配置阶段持久化的 `loading` 状态恢复为 `idle`；同时调度器吞掉入队异常，`STALE_GENERATION` 被映射成 `idle` 后又因无快照回到加载文案，形成另外两条永久同步路径。Widget metadata 还缺少标准 `android:configure` 声明。旧实现下新增桥接状态测试和视觉契约测试共确认 6 项失败，其中桥接 `loading` 状态用例单独确认失败。
- 本次已完成：快照写入后仅将绑定同一冰箱的 Widget 实例恢复为 `idle`；配置成功立即渲染已有缓存并后台刷新；账号代次过期任务自动排入当前代次刷新，入队失败显示可重试错误；补齐标准配置 Activity metadata。视觉改为浅咖啡色微凸星期标签、无圆形外框的普通锅/锅内勾完成图标、仅含完成统计和浅咖啡色凹陷进度条的底部区域，以及每页一个可点击的纵向页点窗口，当前页点放大并加深阴影；页面改用 `StackView` 支持上下平扫；移除日期/时区/时间设置广播，避免非事件驱动刷新；删除旧箭头、页码和圆形锅按钮资源。
- 本次验证：`npm run --prefix frontend test`（49 个文件、454 项通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`frontend/scripts/build-android.sh testDebugUnitTest`（30 项）、`frontend/scripts/build-android.sh assembleDebug`、`frontend/scripts/build-android.sh connectedDebugAndroidTest`（Pixel 10 Pro API 37，1 项）、全部 Android 资源 XML 的 `xmllint --noout` 和 `git diff --check` 均通过；Debug APK 已重新生成。
- 本次未验证：未在 Launcher 中完成“添加到桌面→配置冰箱→渲染本周食谱”的完整人工流程，未人工核对圆点点击、上下平扫、各高度布局、阴影、锅按钮和多实例隔离；未安装产品 APK、未提交、未发布。
- 目标：新增 Android 原生桌面小组件；每个实例绑定一台冰箱，展示本周非空食谱，支持显式分页、手动刷新以及在小组件内直接完成/撤销食谱。
- 范围：Android AppWidget Provider、配置页、响应式 RemoteViews、拟物资源、私有快照与实例配置、一次性后台同步、现有安全会话复用、Capacitor 数据桥接、自动化测试和相关文档；不新增后端接口，不修改用户提供的参考图片，不执行提交、发布或 APK 安装。
- 设计与需求基线：本次用户提供的“今日食谱打卡”参考图；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9；冻结周食谱设计 `b2e77ba8-52dd-4722-8e89-accdf9f3569f` 及本地资产。参考图确定暖白拟物面板、星期标签、锅形完成按钮和周完成进度，项目规范继续约束状态语义、对比度和触摸热区。
- 交互决策：使用 `StackView` 支持上下平扫，不自动轮播或左右滑动；按可用高度每页显示 1–3 条，右侧每页一个纵向页点可直接切换页面，当前页圆点放大并增加阴影。底部不显示翻页按钮或页码，只保留完成统计和凹陷进度条。未完成食谱按周一至周日排列，已完成食谱按周一至周日置后；空日期不占行。
- 数据与安全：小组件按实例保存冰箱绑定，使用一次性 WorkManager 调用现有 owner/daily recipes、complete、undo 和 mobile refresh 接口；owner 与 daily 凭证严格分流，普通偏好和 Intent 不保存令牌。快照按账号代次、冰箱和周次隔离并排除系统备份，失权后清除旧数据。
- 实施编排：使用多个 `gpt-5.6-luna`、`high` 子代理分别实现原生数据、原生 UI、前端桥接和纯规则测试；主代理冻结接口、独占共享入口接线、逐批审查差异并负责最终集成和验收。
- 预期验证：前端全量 test/lint/build，Android `testDebugUnitTest` 与 `assembleDebug`，条件允许时运行 `connectedDebugAndroidTest`；覆盖 API 24/30/31+、4×3/4×4/扩展高度、多实例、跨周、离线、401/403、重复打卡、失败回滚、敏感日志和备份排除，并执行 `git diff --check`。
- 已完成：新增原生 Provider、按实例配置页、`StackView` 上下平扫页面、每页一个可点击圆点、拟物资源、完成/撤销锅按钮、周完成统计和固定状态布局；新增一次性 WorkManager 串行链、owner 401 单次串行刷新、daily 精确凭证选择、完整周收敛、账号代次和私有快照仓库；抽取共享 Keystore AES-GCM 存储并完成 Capacitor 桥接和 App 数据事件接线。接收器禁止外部广播，WorkManager 使用 `APPEND_OR_REPLACE` 恢复取消/失败链；诊断日志脱敏、按日最多保留 7 份并排除备份。新增 PR-080、RG-022 和功能规则 §9.6。
- 验证：`npm run --prefix frontend test`（49 个文件、454 项通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`frontend/scripts/build-android.sh testDebugUnitTest`（25 项通过）、`frontend/scripts/build-android.sh assembleDebug` 和 `git diff --check` 通过；Debug APK 构建产物位于 `frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk`。`adb devices -l` 可执行但没有连接设备。
- 未验证：因没有连接 Android 设备，未运行 `connectedDebugAndroidTest`，也未在 API 24/30/31+、真实 Launcher、第二个 Launcher、`4×3`/`4×4`/扩展高度下人工验收配置、换绑、分页、并发打卡、断网和认证失效；未安装 APK，未执行真实设备验收。

## 2026-09-05 — Android 小组件模拟器基础验收

- 状态：待评审；已完成可重复的模拟器安装与系统注册验证，未宣称端到端小组件通过。
- 环境：ADB 设备 `emulator-5554`，Pixel 10 Pro（AVD），API 37.1；APK `frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk`，包名 `com.fridgeboard.app`，`versionName=0.2.2`，`minSdk=24`，`targetSdk=36`。
- 已验证：`adb install -r` 返回 `Success`；`dumpsys appwidget` 显示 `RecipeWidgetProvider` 已注册，`updatePeriodMillis=0`、纵向 resize、home screen 类别正确；`frontend/scripts/build-android.sh connectedDebugAndroidTest` 在该模拟器上 1 项测试通过；启动 App 后最近日志无 `RecipeWidget`、`AndroidRuntime` 或 `FATAL EXCEPTION`；Launcher 的 Widgets 页面可打开。
- 未验证：未在 Launcher 中完成“添加到桌面→配置冰箱→渲染本周食谱”的完整人工流程，未验证页点、锅按钮、刷新、打卡/撤销、断网、认证失效、各高度档位和多实例隔离；当前模拟器没有已登录账号/绑定冰箱数据，因此不能判断真实食谱内容。`adb shell cmd appwidget` 在此系统镜像返回 `No shell command implementation.`，不作为产品失败依据。
- 备注：Android Studio 当前打开的是独立的 `My Application` 示例工程，其 Gradle 源码下载 TLS 错误与 FridgeBoard CLI 构建无关；FridgeBoard APK 安装和 connected 测试均未依赖该 IDE 工程。

## 2026-09-04 — 再次发布 FridgeBoard 0.2.1 周食谱完成反馈修复

- 状态：完成，自动化验证通过，待真实 Android 安装更新验收。
- 目标：提交本次周食谱完成/取消完成反馈修复，在不改变产品版本 `0.2.1` 的前提下再次发布生产服务器与正式签名 Android APK。
- 范围：周食谱完成请求期间的图标 spinner、请求结束时机、共享完成图标、前端回归测试、生产容器/PWA、数据库备份、同域更新元数据和同版本 GitHub Release APK；不改变后端完成/撤销接口、库存扣减规则和产品版本。
- 设计与发布基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.1、§9.4；`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`；冻结周食谱设计稿及本地资产。
- 发布计划：产品版本保持 `0.2.1`，Android `versionCode=1700000018`；完成质量门禁并提交后，以同一提交和 release 标识部署服务器、手动触发同版本 Android Release workflow。
- 预期验证：`uv lock --check`、后端 Ruff/pytest、前端 lint/test/build、Android 权限检查与正式签名 APK 校验、Docker 构建、服务器备份/容器健康/公网健康检查、同域更新元数据、GitHub Actions APK digest 和 `git diff --check`。
- 发布参数：提交 `0df7c2c80e9efe8c7985491ad1bce393e136bda7`，产品版本保持 `0.2.1`，服务器与 APK 共用 release `260904104850`，Android `versionCode=1700000018`。
- 已完成：服务器发布到 `root@107.174.152.245:/opt/fridgeboard`，镜像为 `sha256:6e0520e97d0f22c1365152e25040adb31c7427bc1a04c5aa5481ef8713d35f8a`；容器 `running/healthy`、重启 `0`，远端 Alembic 为 `20260831_33 (head)`；数据库备份为 `/data/fridgeboard.db.backup-20260904-024915`，大小 `1552384` 字节、权限 `600`、属主 `appuser:appuser`；备份 `integrity_check=ok`、外键违规为 0。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（247 passed，77 条既有依赖/线程警告）、`npm run --prefix frontend lint`、前端全量测试（47 个文件、446 项通过）、`npm run --prefix frontend build`、移动权限检查、脚本语法、`docker build --tag fridgeboard:local .`、`git diff --check` 均通过；同域 `/healthz` 返回 `{"status":"ok"}`，Android 更新接口返回版本 `0.2.1`、release `260904104850`、build `1700000018`。
- Android 发布：GitHub Actions run [`33831029890`](https://github.com/flywhc/FridgeBoard/actions/runs/33831029890) 成功并完成同版本旧 asset 替换，[v0.2.1 Release](https://github.com/flywhc/FridgeBoard/releases/tag/v0.2.1) 当前仅保留 APK `FridgeBoard-0.2.1-android-1700000018.apk`；文件大小 `6805112` 字节，SHA-256/digest 为 `ec4f54387628f79b20e9a380673064c1272a06d467c0fde75e711aa4544d84ae`，独立下载和 APK 校验通过，包名 `com.fridgeboard.app`、`versionName=0.2.1`、`versionCode=1700000018`。
- 未验证：未在真实 Android 设备上人工执行飞行模式、会话故障恢复、APK 覆盖安装和应用内更新流程；Docker 构建输出仍有既有 npm engine/vulnerability 提示，未在本次发布中升级依赖。

## 2026-09-04 — 发布 FridgeBoard 0.2.1 到服务器与 Android APK

- 状态：完成，自动化验证通过，待真实 Android 安装更新验收。
- 目标：提交当前 `main` 工作区改动，升级产品补丁版本并发布生产服务器与正式签名 Android APK。
- 范围：当前工作区全部项目改动、版本号与发布说明、生产容器/PWA、数据库备份、健康检查、同域 Android 更新元数据和 GitHub Release APK；不提交密钥、生产数据或运行时日志。
- 设计与发布基线：`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md` 及本记录中各项功能的设计/需求基线。
- 发布计划：产品版本 `0.2.1`，Android `versionCode=1700000017`；先完成质量门禁并提交，再以提交引用部署服务器和触发 Android Release workflow。
- 预期验证：`uv lock --check`、后端 Ruff/pytest、前端 lint/test/build、Android 权限检查与正式签名 APK 校验、Docker 构建、服务器备份/容器健康/公网健康检查、同域更新元数据、GitHub Actions APK digest 和 `git diff --check`。
- 发布参数：提交 `d433982e8964d00332eb971ca5efe3c82f396a24`，产品版本 `0.2.1`，服务器与 APK 共用 release `260904024108`，Android `versionCode=1700000017`。
- 已完成：提交已推送 `origin/main`，tag `v0.2.1` 已推送；服务器发布到 `root@107.174.152.245:/opt/fridgeboard`，镜像为 `sha256:27a3d24ae71557d78cf8994555fbfe24768a3c592bf8395a3d906f14f8825ba2`；容器 `running/healthy`、重启 `0`，远端 Alembic 为 `20260831_33 (head)`；数据库备份为 `/data/fridgeboard.db.backup-20260903-184213`，大小 `1552384` 字节、权限 `600`、属主 `appuser:appuser`。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（247 passed）、`npm run --prefix frontend lint`、前端全量测试（47 个文件、446 项通过）、`npm run --prefix frontend build`、移动权限检查、脚本语法、`docker build --tag fridgeboard:local .`、Android 正式签名构建/元数据校验和 `git diff --check` 均通过；远端 SQLite `integrity_check=ok`、外键违规为 0，公网 `/healthz` 返回 `{"status":"ok"}`，同域更新接口返回版本 `0.2.1`、release `260904024108`、build `1700000017`。
- Android 发布：GitHub Actions run [`33792025716`](https://github.com/flywhc/FridgeBoard/actions/runs/33792025716) 成功，[v0.2.1 Release](https://github.com/flywhc/FridgeBoard/releases/tag/v0.2.1) 已发布 APK `FridgeBoard-0.2.1-android-1700000017.apk`；文件大小 `6805032` 字节，SHA-256/digest 为 `66cf1b0c710e9eda6a5d6e93043a8e23a1551d6ea7d9e40c7f887849342e3d84`，包名 `com.fridgeboard.app`、`versionName=0.2.1`、`versionCode=1700000017`。
- 未验证：未在真实 Android 设备上人工执行飞行模式、会话故障恢复、APK 覆盖安装和应用内更新流程；Docker 构建输出仍有既有 npm engine/vulnerability 提示，未在本次发布中升级依赖。

## 2026-09-04 — 数量为 0 的物品保留添加与保质时间展示

- 状态：待评审，自动化验证通过，未发布。
- 目标：物品数量减至 0 后仍显示此前的添加时间和保质时间；从 0 恢复数量不重置时间，下一次真正新增数量时才由新增业务更新为新的添加时间。
- 范围：P5 手机端物品列表日期展示、库存数量操作的日期保留回归测试、产品/功能规则和本记录；不改变首页统计、临期提醒、数量为 0 的排序和数据库字段。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md` §7、§8.4；`docs/functional-design-and-feasibility.md` §3.5、§3.6、§5.6；冻结设计稿“当前冰箱首页” `23329191-d0fa-48ca-a517-fee9ff3eab9b` 及“添加物品：识别与基础信息” `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`，本地资产以 `docs/ui-assets/manifest.json` 登记为准。
- 预期验证：先补物品列表数量为 0 的日期展示失败用例，并核对现有后端清零/恢复日期保留测试；再运行前端定向测试、lint、全量 test、build、后端库存定向测试和 `git diff --check`。
- 会话记录：现象是库存行数量归零后日期区域被前端 `!isEmpty` 条件隐藏；初步证据显示后端清零/恢复响应仍保留 `production_date` 和 `best_before`。实现将让 0 数量行继续显示已持久化日期，但保留其不参与统计、风险和首页展示的规则。
- 已完成：移除手机物品列表对 0 数量行日期元信息的隐藏；后端完整编辑和新增/合并在 0→正数时将生产日期重置为当天并保留当前 BBD；数量减至 0 仍保留日期字段，冰箱端撤销恢复继续保留原日期；补充前端日期展示、后端普通编辑和新增合并回归测试，并同步 PR-031/RG-005 规则。
- 验证：旧实现下前端 0 数量日期展示测试和后端 0→正数日期测试均失败；修复后 `uv run ruff check backend`、`uv run pytest`（247 passed，78 条既有依赖/线程警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（46 个文件、445 项通过）、`npm run --prefix frontend build`、后端库存定向测试（3 passed）和 `git diff --check` 均通过。
- 未验证：未在真实 PWA/Android WebView 中人工确认 0 数量行日期、重新添加日期重置、过期 BBD 展示和 320/390/430px 视口布局；未执行生产发布、数据库备份或 Git 提交。

## 2026-09-04 — 修复库存合并后“最近添加”排序未更新

- 状态：待评审，自动化验证通过，尚未发布。
- 目标：通过扫描或其他新增流程给已有物品合并数量后，该物品按“最近添加”排序位于最新添加项顶部；不改变生产日期、BBD、有效期和数量为 0 的恢复语义。
- 范围：库存批次新增/合并响应、库存列表排序字段、兼容旧缓存、后端和前端回归测试及本记录；不新增数据库列，不修改历史库存数据，不改变非新增编辑的业务字段。
- 设计与需求基线：本次用户反馈；`docs/product-requirements.md` PR-030/PR-031；`docs/functional-design-and-feasibility.md` §3.5、§3.6；现有 `inventory_batches.updated_at` 时间戳。
- 预期验证：先补“旧批次合并加量后排序上移且生产日期不变”的后端 API 测试和前端排序测试，再运行后端 Ruff/pytest、前端 lint/test/build 与 `git diff --check`。
- 已完成：库存响应返回 `updated_at`；新增/合并、完整编辑、数量调整和恢复在响应前 flush，确保更新时间已经持久化；物品列表“最近添加/最早添加”及其派生排序优先使用更新时间，旧缓存缺少字段时回退生产日期；生产日期、BBD 和有效期计算不被合并加量覆盖。
- 验证：先运行新增后端和前端测试确认旧实现分别因缺少更新时间字段和仍按生产日期排序而失败；修复后定向测试通过；`uv run ruff check backend`、`uv run pytest`（245 passed，77 条既有依赖/线程警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（46 个文件、445 项通过）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实 PWA/Android WebView 中人工确认扫描识别、合并同名物品、列表排序和离线缓存升级；未执行生产发布、数据库备份或 Git 提交。

## 2026-09-04 — 修复周食谱完成按钮状态切换

- 状态：待评审，未发布。
- 目标：点击每周食谱行右侧的完成/取消完成图标后，立即以动画切换图标、完成样式和列表排序，同时向后端发送对应的完成或撤销请求；不再把正常状态切换显示为“该食谱已完成”提示。
- 范围：周食谱工作区的完成状态更新、请求失败回滚、完成后补货/库存刷新、前端回归测试和需求追踪；不改变完成/撤销后端接口、库存扣减规则或已确认页面骨架。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.1、§9.4；冻结设计稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`（390×844，本地 `docs/ui-assets/png/pwa-weekly-recipes.png`、`docs/ui-assets/html/pwa-weekly-recipes.html`）；新增 `PR-079`、`RG-021`。
- 预期验证：先补前端可复现测试，再运行前端定向测试、lint、test、build、`git diff --check`；保留真实 PWA/Android WebView 点击、动画和网络失败回滚为人工验收项。
- 已完成：完成/取消完成点击后先在本地按目标状态更新食谱行并按完成分组重排，右侧图标和删除线同步切换；完成状态变化使用 420ms 状态动画；请求成功后继续刷新库存和缺货，请求失败只回滚本行并显示错误；服务端重复完成/重复撤销冲突改为重新同步，不显示“该食谱已完成”作为正常提示。新增 `updateRecipeEntryCompletion`、冲突识别和回归断言，未改变后端完成/撤销接口。
- 验证：食谱定向测试及 `App.test.ts` 共 198 项通过；前端全量测试 46 个文件、444 项通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：未在真实 PWA/Android WebView 的 390×844、320px、430px 视口人工确认完成/撤销动画、排序移动和断网回滚；未执行发布或 Git 提交。

## 2026-09-04 — 复查周食谱完成按钮重复请求导致 400

- 状态：待评审，未发布。
- 现象：本地点击完成后浏览器出现 HTTP 400，页面没有及时显示完成态，下拉刷新后服务端状态已是完成；需重点排查同一次点击或快速点击造成的重复完成请求，以及成功后的后续刷新失败是否覆盖本地状态。
- 当前证据：后端仅在食谱已经完成时返回“该食谱已完成”；前端完成按钮的防重依赖异步 React 状态 `completingEntryId`，同一事件循环内的重复点击仍可能使用旧渲染闭包发送第二个 `/complete`。
- 预期验证：补同步请求闸门测试，确认同一食谱只发送一次完成/撤销请求；运行前端定向测试、lint、test、build 和 `git diff --check`，再保留真实浏览器网络面板与下拉刷新人工复核。
- 根因结论：完成状态更新本身已改为乐观提交，但异步 React 状态不能阻止同一渲染窗口内的重复事件；第一次请求已提交后，第二个旧状态请求会收到 HTTP 400“该食谱已完成”，从而造成用户看到服务端已完成而页面反馈异常。
- 已完成：新增 `RecipeCompletionRequestGate`，在 `complete()` 发请求前同步互斥同一完成/撤销流程，晚到的重复点击不再发请求；保留状态冲突静默同步和失败回滚逻辑。
- 验证：定向测试 3 个文件、200 项通过；前端全量测试标准并行运行首次出现 1 个既有 `pwaCache.test.ts` 时序失败，单独重跑 9 项通过；使用 `--no-file-parallelism --maxWorkers=1` 全量 47 个文件、446 项通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。
- 后续实测修正：上述闸门解决了同步重复点击，但不能解释“请求 200 后页面仍旧”的现象；真实浏览器进一步确认旧的周食谱页面缓存会覆盖乐观状态，因此补充缓存同步修复，详见下一条记录。
- 未验证：未在 390×844、320px、430px 视口人工确认动画/排序、下拉刷新和断网回滚；未执行发布或 Git 提交。

## 2026-09-04 — 实测确认完成状态被旧缓存覆盖

- 状态：待评审，未发布。
- 目标：修复真实浏览器中完成/取消完成请求成功后页面仍显示旧状态的问题，并让已移动的食谱行在后端返回前持续显示图标加载动画。
- 范围：周食谱完成状态的本地状态与页面缓存同步、图标请求中状态、请求结束时机、对应回归测试和真实浏览器验证；不改变后端完成/撤销接口及库存业务规则。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9.1、§9.4；冻结设计稿 `b2e77ba8-52dd-4728-8e89-accdf9f3569f` 及本地周食谱资产。
- 现象与证据：在 `http://127.0.0.1:7001` 真实点击“完成小炒肉”后，POST `/complete` 返回 200，随后 recipes GET 也返回 `completed: true`，但 DOM 仍为 `完成小炒肉`、本地 `fb-page-cache...recipes:2026-08-31` 仍为 `completed: false`；再次点击产生 POST 400 `'该食谱已完成'`。点击“取消完成”同样出现 POST 200 后 DOM/缓存不变。
- 预期验证：补缓存同步和图标请求中状态断言；运行前端定向测试、lint、全量 test、build 和 `git diff --check`；用 Playwright 验证行移动后持续转圈、后端返回后停止、失败回滚和无正常状态提示。
- 根因结论：`complete()` 只更新 React 状态，完成后的并行 `load(true)` 会先读取旧周食谱缓存；当刷新请求提交被请求代次/页面刷新保护丢弃时，旧缓存就会把页面状态覆盖回去。此前的防重闸门仍保留，用于阻止同步双击产生重复 POST。
- 已完成：乐观切换时同步写入当前周食谱缓存，完成/取消完成的页面状态、图标、排序和缓存保持一致；请求期间在已移动的图标上叠加持续旋转的 spinner，后端响应后立即停止并恢复按钮可操作；普通失败回滚原状态和排序；不再显示“该食谱已完成”作为正常提示。
- 验证：定向测试 3 个文件、200 项通过；串行全量测试 47 个文件、446 项通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。Playwright 延迟后端 2 秒时确认食谱先移动、spinner 持续显示且按钮禁用，响应返回后 spinner 消失；模拟 500 失败时确认恢复原状态、排序和按钮可用，并显示错误；完成/取消完成各返回 POST 200，同步双击只产生 1 个 `/complete` POST，页面无旧提示。截图：`output/playwright/recipe-completion-fixed.png`。
- 未验证：未在 390×844、320px、430px 视口分别人工确认动画细节、真实断网和下拉刷新；未执行发布或 Git 提交。

## 2026-09-04 — 排查 Android 偶发重新登录并建立现场诊断闭环

- 状态：待评审，自动化验证通过，未发布。
- 目标：找出 Android 已登录用户偶发进入“登录或注册”页的可证实原因；任何自动故障路径都不得清除本地 token 或跳到登录页，必须保留缓存页面、说明原因并允许提交脱敏现场诊断，只有用户明确同意后才可清除并重新登录。
- 范围：Capacitor Owner 会话读取/刷新状态机、Android 安全存储与备份边界、未登录页认证故障提示、后端诊断接收与认证日志、自动化测试和移动部署文档；不改变 SSO 身份源、主动退出语义、PWA Cookie 会话或用户业务数据。
- 现有证据：移动 refresh token 在服务端不过期且可重复刷新；前端当前把 refresh 网络异常折叠为 `null`，随后复用原始 401 并进入未登录页；安全存储缺失/格式损坏和服务端拒绝也没有稳定原因码或可提交诊断编号；Android 当前允许备份加密 SharedPreferences，但 Keystore 密钥不会随应用备份可靠迁移。
- 设计与需求基线：本次用户反馈、`PR-078`/`RG-020`、`docs/mobile-deployment-design.md` P13.3、`docs/ui-design-specification.md` §8.2；未登录页沿用现有冻结设计，仅增加共享通知式故障说明和诊断操作，不改变页面骨架。
- 预期验证：先补可复现“access token 401 + refresh 网络失败不得转成退出”和安全存储异常/服务端拒绝/诊断提交测试，再运行后端 Ruff/pytest、前端 lint/test/build、Android 单元或构建检查、移动权限检查和 `git diff --check`；真实 Android 的断网、撤销、备份恢复与杀进程场景保留为人工验收项。
- 根因结论：已确认旧前端把 refresh 的网络异常、超时以外异常和服务端拒绝统一折叠成 `null`，随后继续处理原始 access token 401 并把 App 切到“登录或注册”；JSON 损坏会直接调用 `clearMobileSession()`；Android 自动刷新写入遇到可恢复 Keystore 错误时，原生插件还会自动执行 `resetStorage()`。这些路径都绕过了用户授权。另有风险是 Android 允许系统备份加密 SharedPreferences，但 Keystore 密钥无法随备份可靠恢复，可能形成无法解密的密文；此项是高可信机制风险，尚无本次用户设备现场证据证明它就是已发生原因。
- 已完成：refresh 断网/超时/服务不可用保留 token 并返回可恢复错误；安全存储缺失、JSON/结构损坏、原生读写失败和服务端拒绝均保留 token 与缓存页面，弹出全局原因说明。服务端区分 `mobile_session_revoked` 与 `mobile_session_not_found`，拒绝日志和客户端共用同一 `auth-*` 诊断编号；用户可提交仅含白名单元数据的错误信息。弹窗提供“提交错误信息”“稍后再试”和“重新登录”，只有最后一项及原有主动退出可清理 token。设备配对 token 的自动 401 清理也已移除。Android 安全存储已排除云备份/设备迁移，原生密钥重置改为只由用户授权入口调用。
- 验证：先确认新增前端状态机测试在旧实现下 3 项失败；修复后 `uv lock --check`、`uv run ruff check backend`、`uv run pytest`（244 passed，77 条既有依赖/线程警告）、认证专项测试（12 passed）、`npm run --prefix frontend lint`、前端全量测试（46 个文件、441 项通过）、`npm run --prefix frontend build`、移动权限检查、Android `testDebugUnitTest`/`assembleDebug`、合并 Manifest 的备份规则核对和 `git diff --check` 均通过。Debug APK 生成于 `frontend/android/app/build/outputs/apk/debug/FridgeBoard-debug.apk`。
- 未验证：未在真实 Android 上人工复现飞行模式跨越 access token 过期、Keystore 失效、系统备份恢复、服务端撤销/记录缺失、诊断提交和用户授权清理流程；未执行正式发布、数据库备份或 Git 提交。

## 2026-09-01 — 统一弹出选择框样式

- 状态：待评审，未发布。
- 目标：让“使用其他主题图标”“所属大类”和“AI 模型”弹出列表框共用同一套标题、关闭按钮、分割线和选项行结构，修复标题下方重复细线、阴影归属错误及关闭按钮布局错位。
- 范围：`OptionPickerField`/主题图标选择弹窗共享组件、弹出列表 CSS、前端回归测试和视觉截图；保留所属大类更换后的编辑保存行为，不改变其他确认类弹窗。
- 设计与需求基线：本轮用户反馈；`docs/ui-design-specification.md`；已确认的“使用其他主题图标”拟物主题弹窗视觉作为统一基线。
- 已完成：新增共享 `OptionPickerDialog`，由“所属大类”“AI 模型”和“使用其他主题图标”统一渲染标题、关闭按钮和选项列表；移除选项区顶部重复细线，拟物主题阴影仅保留在标题下方分割线，并为标题区增加底部留白避免关闭按钮与分割线重叠；选择类弹窗关闭按钮已定位到标题上方右侧，并与选项行保持一致的右侧留白。
- 验证：定向测试 3 个文件、222 个测试通过；前端全量测试 44 个文件、432 个测试通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过；真实本地 PWA 截图 `output/playwright/parent-picker-close-aligned.png`、`output/playwright/ai-model-picker-fixed.png`、`output/playwright/theme-icon-picker-fixed.png` 已检查。
- 未验证：未在真实 Android WebView 或 PWA 安装态设备上复核。

## 2026-09-01 — 修复弹出列表标题下方分割线阴影

- 状态：待评审。
- 目标：移除“使用其他主题图标”“所属大类”等弹出列表标题容器的外框阴影，仅让标题下方的分割线带阴影。
- 范围：拟物主题应用内选项弹窗 CSS、样式回归断言和视觉截图；不改变选项行、选择逻辑和保存行为。
- 已完成：标题容器改为无边框、无阴影，由底部 `::after` 分割线承载阴影；选项按钮保持 `box-shadow: none`。
- 验证：真实本地 PWA 截图 `output/playwright/subcategory-parent-picker.png`、`output/playwright/theme-icon-picker.png` 已检查；定向测试 3 个文件、227 个测试通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 通过。
- 未验证：未在真实 Android WebView 或 PWA 安装态设备上复核。

## 2026-09-01 — 发布当前 0.2.0 到服务器与 Android APK

- 状态：完成。
- 目标：将当前 `main` 工作区中已完成并待发布的后端分类/图标完整性修复、前端周食谱与触摸热区修复发布到生产服务器，并补发同版本正式签名 Android APK。
- 范围：当前工作区全部项目改动、生产容器/PWA、数据库备份、健康检查、同域 Android 更新元数据和 GitHub Release APK；产品版本保持 `0.2.0`，Android `versionCode` 从 `1700000015` 递增到 `1700000016`；不提交密钥、生产数据或运行时日志。
- 设计与发布基线：`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/releases/v0.2.0.md` 及本记录中各项功能的设计/需求基线。
- 预期验证：`uv lock --check`、后端 Ruff/pytest、前端 lint/test/build、Android 权限检查、Docker 构建、发布脚本与 workflow 校验、服务器备份/容器健康/公网健康检查、同域更新元数据、GitHub Actions APK 签名/元数据/digest 和 `git diff --check`。
- 发布参数：提交 `3ad364c0a289ef1148b0feb1fd66a0121924a4ad`，产品版本 `0.2.0`，服务器与 APK 共用 release `260901011147`，Android `versionCode=1700000016`。
- 已完成：服务器发布到 `root@107.174.152.245:/opt/fridgeboard`；数据库备份为 `/data/fridgeboard.db.backup-20260831-171202`，大小 `1523712` 字节、权限 `600`、属主 `appuser:appuser`；容器为 `running/healthy`、重启 `0`，镜像 ID 为 `sha256:3cf8d9da567800fac6f2105a983ae28990c619181bff52fd86eb331ea5f7069b`。GitHub Actions run `33418351521` 成功并更新 [v0.2.0 Release](https://github.com/flywhc/FridgeBoard/releases/tag/v0.2.0)。
- 验证：远端 Alembic 为 `20260831_33 (head)`，SQLite `integrity_check=ok`、外键违规为 0；公网 `/healthz` 返回 `{"status":"ok"}`；同域更新接口返回版本 `0.2.0`、release `260901011147`、build `1700000016`、APK 大小 `6801548` 字节和 SHA-256 `61f90c83b111f89b6a6e677059345865fcd3f0b29a43bad03c33913a228d1aa`。Release 仅保留 `FridgeBoard-0.2.0-android-1700000016.apk`，下载文件大小和 SHA-256 与接口一致；workflow 已通过正式签名、包元数据和 digest 校验；线上前端资源包含 release `260901011147`。
- 发布前验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（243 passed，76 条既有依赖/运行时警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（44 个文件、432 个测试通过）、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、`docker build --tag fridgeboard:local .`、发布脚本语法/dry-run 和 `git diff --check` 均通过。
- 未验证：未在真实 Android 设备安装本次 APK；未执行本次发布后的真实 PWA/Android WebView 人工流程验收。传输阶段的 macOS 扩展属性 tar warning 未影响发布、构建或健康检查。

## 2026-09-01 — 调整选择分类编辑角标触摸热区

- 状态：待评审，未发布。
- 目标：扩大自定义小类右上角“编辑小类”入口的可点击区域，降低移动端误触和难点击问题，同时避免遮挡小分类主图标的有效点击区域。
- 范围：`frontend/src/styles.css` 编辑角标热区与视觉角标尺寸、对应前端样式回归测试；不改变分类选择事件、编辑权限和用户图片资源。
- 设计与需求基线：本次用户反馈；`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §8、§17.1；`docs/final-ui-designs.md` 与 `docs/ui-assets/manifest.json` 中“小类图库”设计稿 `284a5039-9042-484e-b683-b8504875a7e4`（390×844）。预期热区约 `32×32px`，可见角标约 `20×20px`，并通过右上外移减少对 `56×56px` 主图标的覆盖。
- 已完成：编辑按钮热区调整为 `32×32px`，可见圆形保持约 `20×20px`，并向分类格子右上方外移以减少对主图标的覆盖；同步更新前端样式回归断言。未改变分类选择事件、编辑权限和用户图片资源。
- 验证：`npm run test -- --run src/App.test.ts` 通过（189 passed）；前端全量 `npm run test -- --run` 通过（44 个测试文件、432 个测试通过）；`npm run lint`、`npm run build` 和 `git diff --check` 通过。
- 未验证：未在真实 PWA/Android WebView 的 390×844、320px、430px 视口人工点击确认；未发布。

## 2026-09-01 — 修复分类删除草稿外键错误并统一空图标约束

- 状态：完成，未发布。
- 目标：修复存在活动图标草稿时删除自定义小类返回 500 的问题，并确保 `create_database_schema()` 初始化的新数据库也安装自定义小类空图标保护。
- 范围：分类删除服务、图标草稿清理、SQLite schema guard 复用、后端回归测试和本记录；不修改生产数据、不执行发布。
- 设计与需求基线：本次代码审查确认的两个缺陷；`food_categories` 与 `icon_drafts` 外键关系；现有 `20260831_33` 图标约束迁移；预期先补失败用例，再运行后端全量测试、Ruff、迁移检查和 `git diff --check`。
- 预期验证：活动草稿删除成功且草稿/临时变体被清理；fresh schema 直接写入无图标自定义小类被数据库拒绝；Alembic 迁移路径和现有分类、图标流程回归通过。
- 已完成：删除分类前在同一事务内显式删除关联 `IconDraft`，由数据库级联清理主题变体，并在提交后清理草稿临时目录；抽出共享 SQLite guard DDL，Alembic 与 `create_database_schema()` 共用且支持重复初始化；历史空图标修复测试改为从 `20260830_32` 旧 schema 造数，避免绕过新约束。
- 验证：活动草稿删除、Alembic guard、fresh schema guard 定向测试 3 个通过；`uv run ruff check backend`、`uv lock --check`、`git diff --check` 通过；`uv run pytest` 通过（243 passed，76 条既有依赖/运行时警告）。
- 未验证：未发布；未修改生产数据库；未运行前端检查（本次仅修改后端删除事务、数据库初始化和后端测试）。

## 2026-08-31 — 防止自定义小类无图标并保留存量修复入口

- 状态：待评审，未发布；不自动覆盖生产中两个待用户选择图标的存量记录。
- 目标：后端拒绝创建无有效 `icon_key` 的自定义小类，数据库阻止后续无图标写入，覆盖目录清理回归，并保留“生菜”“牛奶”的人工重新绑定路径。
- 范围：分类请求模型、分类服务、SQLite 迁移触发器、分类/目录回归测试和本进度记录；不改变用户图片，不凭名称猜测生产图标。
- 设计与需求基线：本次根因排查结论、`docs/functional-design-and-feasibility.md` §8、`food_categories` 现有用户级作用域约束及当前空图标编辑修复；预期先补失败用例，再运行后端定向/全量测试、Ruff、迁移检查和 `git diff --check`。
- 已完成：`CustomCategoryRequest.icon_key` 改为必填且不得为空白；路由和 `InventoryService.create_custom_subcategory()` 增加服务层防守校验；新增 `20260831_33` SQLite 插入/更新触发器，阻止后续自定义小类保存空图标，同时允许历史异常行通过编辑流程修复；需求与回归矩阵已同步。
- 验证：定向 3 个测试通过；`uv run ruff check backend` 通过；`uv run pytest` 通过（241 passed，76 条既有依赖弃用/线程警告）；迁移测试确认历史空图标行可保留读取、后续非法插入和清空更新均被拒绝；`git diff --check` 通过。
- 未验证：未发布；未修改生产数据库；未在真实 PWA/Android WebView 操作；未自动为生产“生菜”“牛奶”选择图标。

## 2026-08-31 — 排查服务器小类缺少图标的根因

- 状态：完成，待评审；未修改应用代码或生产数据。
- 目标：解释服务器上“生菜”“牛奶”小类存在但 `icon_key` 为空的形成路径，核对是否存在非原子保存、事务边界或并发覆盖，并判断近期改动是否已修复根因。
- 范围：小类创建/编辑、逻辑图标创建与绑定、数据库事务、相关迁移和提交历史；只读检查服务器日志与生产数据库，不覆盖线上数据。
- 设计与需求基线：本次用户反馈、`docs/functional-design-and-feasibility.md` §8、既有小类图标编辑流程及上一条生产只读排查记录；预期输出为带文件/行号和日志证据的现象—根因—修复状态结论，必要时再补最小复现测试或代码修复。
- 预期验证：代码路径与 Git 历史核对、服务器日志/数据库只读核对、现有分类/图标事务测试；若实施修复，再补对应失败用例和质量门禁。
- 结论：根因不是“分类名和 `icon_key` 分两次保存且缺少事务”。旧版 `ensure_builtin_catalog()` 的清理查询在 `FoodCategory.name.in_(removed_names)` 分支漏加 `FoodCategory.is_custom.is_(False)`；而目录清单把“生菜”“牛奶”列在 `removed_subcategory_names` 中。因此应用启动或创建分类时执行目录同步，会把同名用户自定义小类误判为过时内置小类，先执行 `subcategory.icon_key = None`，随后在没有库存/食谱引用时还会删除分类，并清理不再被引用的自定义图标资产。该逻辑位于事务调用链内，错误结果会作为一个完整事务提交，不是中途提交造成的半条记录。
- 服务器证据：只读查询显示当前用户 `2` 仅有“牛奶”和“生菜”两条自定义小类的 `icon_key` 为空，`PRAGMA integrity_check` 为 `ok`，不存在非空但指向缺失资产的键。备份 `/data/fridgeboard.db.backup-20260829-203459` 中两条记录仍分别绑定 `custom-a3ccd23...`、`custom-35976173...`；备份 `/data/fridgeboard.db.backup-20260830-142702` 中“牛奶”已为空，“生菜”出现旧记录为空和新记录绑定 `custom-eafc1966...`；备份 `/data/fridgeboard.db.backup-20260830-172349` 中最终两条记录均为空，三个相关自定义资产均已不存在。
- 日志证据：8 月 29 日有一次旧版直连 `POST /api/owner/refrigerators/4a98408cecd2485ea9a472f205dfcb8d/categories` 返回 201，但目标两条记录随后在草稿确认流程中曾正常绑定图标；8 月 30 日的日志显示新版本启动后仍有图标草稿确认成功，数据库备份随后出现上述清理结果。日志只记录请求路径和状态，不记录请求体，无法仅凭日志还原具体名称；但旧版清理代码、应用启动事务边界和备份时间线足以定位清空动作的业务原因。
- 修复状态：提交 `b69f69d` 已在 `item_catalog.py` 的清理条件补上 `FoodCategory.is_custom.is_(False)`，并同步修正自定义名称在最近小类筛选中的处理；该提交是在生产数据已经被旧逻辑清理后才部署，不能恢复已被清空的 `icon_key`。当前工作区另有未发布的空图标编辑修复，可让用户重新绑定图标，但直接创建接口仍应进一步收紧为后端强制要求有效 `icon_key`，并增加回归测试和数据完整性约束。
- 验证：已核对当前生产容器 `/data/logs/fridgeboard.2026-08-28.log` 至 `/data/logs/fridgeboard.log`、当前数据库及 4 份历史备份，检查 `item_catalog.py`、分类创建/编辑/图标草稿事务和 `20260830_32` 迁移，并比对提交历史；全部为只读检查。未运行全量测试，因为本次未修改应用代码。
- 未验证：日志没有请求体和数据库审计字段，无法确定当时首次触发目录同步的具体 HTTP 请求或用户操作；未执行生产数据修复。建议先在发布后备份两个小类，再由用户在编辑页重新选择图标，或另行设计带审计的修复迁移。

## 2026-08-31 — 明确小类图标引用与逻辑绑定修复

- 状态：待评审，自动化验证通过；未发布。
- 目标：排查远程服务器“生菜”自定义小类图标无法删除/修改的真实引用，接口错误必须逐项列出引用它的橱柜位置、食谱和食谱物品；同时把“小类尚未绑定逻辑图标”改为说明具体缺失关系和可执行修正方式的用户文案。
- 范围：图标/小类删除与编辑校验、引用查询及响应结构、前端错误展示、后端/前端回归测试和相关功能文档；不修改线上数据、不修改用户图片资源、不执行发布。
- 设计与需求基线：本次用户反馈、现有用户级分类与图标数据模型、`docs/ui-design-specification.md` 共享错误反馈约束及既有小类图标编辑流程；预期先以本地日志和代码确认根因，再补失败用例，运行分类/图标定向测试及对应质量门禁。
- 线上排查：只读检查生产 `fridgeboard-app` 日志和 `/data/fridgeboard.db`。用户 `2` 的“生菜”自定义小类 ID 为 `7db79c4b65a54bf8bb38280af3bad5dc`，所属大类为“水果蔬菜”，`icon_key` 为 `NULL`，不存在对应逻辑图标资产；无库存和购物清单引用，有 7 条过去周次食谱食材引用，分别为“冰箱”中 `2026-07-20 星期三《煎饺》`、`2026-08-10 星期三《三鲜馄饨》`、`2026-08-10 星期五《黑椒意面》`、`2026-08-17 星期三《肉夹馍》`、`2026-08-17 星期四《黑椒牛仔骨》`、`2026-08-17 星期五《火鸡面》`、`2026-08-24 星期五《青酱意面》`，每条食材均为“生菜”。全库另有用户 `2` 的“牛奶”小类也为 `icon_key = NULL`；未发现 `icon_key` 指向不存在资产的分类。日志中的删除请求因旧实现只返回存在性提示而无法定位；图标保存请求进入 `copy_on_write()`，因 `icon_key` 为空触发了“小类尚未绑定逻辑图标”。
- 已完成：删除校验只检查当前周及未来食谱、库存和购物清单；历史食谱不参与阻断，删除分类时会在同一事务内清空历史食材的可空小类绑定。阻断响应现在返回每个橱柜物品的冰箱、可读位置、物品名和数量，以及每个当前/未来食谱引用的冰箱、周次、星期、菜名、具体食材和数量，同时列出购物清单引用。编辑时若分类缺少逻辑图标，或逻辑图标资产已丢失，则在用户选中新主题图标后创建并绑定新的用户级逻辑图标集；编辑模式未选图标时“识别此类物品”按钮可点击，会立即提示具体原因并留在编辑页。多行错误在编辑页保持换行显示。
- 验证：先补失败用例并确认旧实现不能列出引用、空 `icon_key` 编辑会失败、历史食谱会错误阻断；分类/图标及购物引用定向测试 3 个通过；`uv run pytest` 239 passed（73 条既有依赖弃用警告）、`uv run ruff check backend`、`npm run --prefix frontend test -- --run`（44 个文件、432 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv lock --check` 和 `git diff --check` 均通过。
- 未验证：未发布或修改生产数据库；未在真实 PWA/Android WebView 中人工确认长引用清单滚动、历史食谱删除和空图标修复后的真实操作。
- 复核修正：删除范围已排除食谱历史；未选图标的编辑识别流程已改为前端即时提示；线上两个空图标小类仍保留原数据，等待用户在编辑页选择图标后修复，不做未经授权的数据覆盖。

## 2026-08-31 — 周食谱中间区域平扫切换周次

- 状态：待评审。
- 目标：在每周食谱页面的中间内容区域增加平扫切换；向右平扫等同点击“下周”，向左平扫等同点击“本周”。标题栏和底部导航不响应该手势。
- 范围：`frontend/src/RecipeWorkspace.tsx`、周次平扫映射与前端回归测试、产品需求/回归文档；不改变食谱 API、缓存和页面视觉层级。
- 设计与需求基线：`docs/ui-design-specification.md`；`docs/functional-design-and-feasibility.md` §9；`docs/final-ui-designs.md` 与 `docs/ui-assets/manifest.json` 中 `pwa-weekly-recipes` / `b2e77ba8-52dd-4722-8e89-accdf9f3569f`（390×844）；新增 `PR-077`、`RG-019`。
- 已完成：新增 `getRecipeWeekOffsetForSwipe` 明确表达右扫选下周、左扫选本周；每周食谱通过 `PageShell` body 接入既有横扫 handlers，标题栏和底部导航不挂载手势；`PullToRefresh` 合并横扫回调，保留下拉刷新。
- 验证：定向测试 190 个通过；前端全量 `npm run --prefix frontend test -- --run`（44 个测试文件、431 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过；构建产物无新增 chunk warning。
- 未验证：未在真实 PWA/Android WebView 及 390×844、320px、430px 视口执行人工平扫、纵向滚动、标题栏和底部导航触摸验收；未执行发布。

## 2026-09-01 — 调整周食谱平扫为双向切换

- 状态：待评审。
- 目标：修改 PR-077/RG-019，使周食谱中间区域向左或向右平扫都在本周和下周之间切换。
- 范围：周次平扫映射函数、食谱工作区调用和前端回归测试；不改变标题栏/底部导航边界、下拉刷新、纵向滚动、食谱 API 或缓存。
- 设计与需求基线：已确认周食谱设计稿 `b2e77ba8-52dd-4722-8e89-accdf9f3569f`（390×844）及 `docs/ui-design-specification.md`；本轮用户补充需求。
- 已完成：将周次映射改为 `toggleRecipeWeekOffset`，无论横扫方向都在本周和下周之间切换；保留中间 body 手势边界、标题栏/底部导航排除和下拉刷新合并逻辑。
- 验证：双向切换定向测试 190 个通过；前端全量 `npm run --prefix frontend test -- --run`（44 个测试文件、432 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实 PWA/Android WebView 及 390×844、320px、430px 视口执行人工平扫和纵向滚动验收；未执行发布。

## 2026-08-31 — 再次发布 FridgeBoard 0.2.0 后端与 Android APK

- 状态：完成。
- 目标：将 `main` 上次 `v0.2.0` 发布后的缓存与食谱手势改动再次部署到生产服务器，并补发同版本正式签名 Android APK。
- 范围：当前 `main`、生产容器/PWA、数据库备份、健康检查、同域 Android 更新元数据和 GitHub Release APK；产品版本保持 `0.2.0`，不提交密钥、生产数据或运行时日志。
- 设计与发布基线：提交 `839140b`、`c2d6ea4`，`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/releases/v0.2.0.md`；后端与 APK 使用同一提交、release 和版本号，Android `versionCode` 从 `1700000014` 递增。
- 预期验证：后端 Ruff/pytest、前端 lint/test/build、Android 权限检查、Docker 构建、发布脚本与 workflow、服务器备份/容器健康/公网健康检查、同域更新元数据、GitHub Actions APK 签名/元数据/digest 和 `git diff --check`。
- 发布参数：release `260831135730`，Android `versionCode=1700000015`；服务器和 APK 均使用本记录提交后的 `main`。
- 发布前验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（236 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（44 个文件、431 个测试通过）、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、`docker build --tag fridgeboard:local .`、发布脚本语法/dry-run 和 `git diff --check` 均通过。
- 已完成：提交 `51fd0af541cef023b7f237d9aabd32b4f242e7e0` 已部署到生产服务器；镜像摘要为 `sha256:b1575805360c2800f3334f3316a5d72c9b488dbf74d5fcfe02a5ce6aeead9285`，数据库备份为 `/data/fridgeboard.db.backup-20260831-135826`；GitHub Actions run `33400011355` 成功并更新 `v0.2.0` Release。
- 验证：备份 `1,519,616` 字节、权限 `600`、属主 `appuser:appuser`，容器 `running/healthy`、重启 `0`，公网 `/healthz` 返回 `{"status":"ok"}`；同域更新接口返回版本 `0.2.0`、release `260831135730`、build `1700000015` 和 APK 摘要。Release 现仅保留 `FridgeBoard-0.2.0-android-1700000015.apk`，大小 `6801448` 字节，SHA-256/digest 为 `7fe9d90662a9542bb2043cd55505657d5ad39e0651fb8ceed469d8ec39000554`；包内为 `com.fridgeboard.app`、`versionName=0.2.0`、`versionCode=1700000015`。
- 未验证：未在第二台真实 Android 设备安装本次 APK；未执行本次补发后的真实 PWA/Android WebView 人工流程验收。Actions 有既有 Node.js 20/action 弃用提示，未影响本次成功发布。

## 2026-08-31 — 发布 FridgeBoard 0.2.0 到服务器与 Android APK

- 状态：完成。
- 目标：将当前 `main` 的已完成改动发布到生产服务器，并生成正式签名 Android APK；按用户要求将产品小版本号从 `0.1.9` 升级为 `0.2.0`。
- 范围：产品版本、Android `versionCode`、服务器容器/PWA、数据库备份、健康检查、GitHub Release APK 和发布文档；不提交密钥、生产数据或运行时日志。
- 设计与发布基线：`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md`、`docs/releases/v0.1.9.md`；服务器与 APK 使用同一 Git 提交和 release 标识。
- 预期验证：`uv lock --check`、后端 Ruff/pytest、前端 lint/test/build、Android 权限检查、Docker 构建、发布脚本与 workflow 契约、服务器备份/容器健康/公网健康检查、GitHub Actions APK 签名/元数据/digest 和 `git diff --check`。
- 已完成：版本升级为 `0.2.0`，提交 `927c4bce61426f8d8b7b978a458f701b2f95130e` 已推送 `origin/main` 和 tag `v0.2.0`；服务器发布 release 为 `260831185551`，镜像摘要为 `sha256:3fe7552129c541077b884335f3480187c518d3c2c624a4b5b8f582a33f979b0a`，数据库备份为 `/data/fridgeboard.db.backup-20260831-105632`。
- 验证：服务器迁移为 `20260830_32 (head)`，备份 `1,519,616` 字节、权限 `600`、属主 `appuser:appuser`，容器 `running/healthy`、重启 `0`，公网 `/healthz` 返回 `{"status":"ok"}`；同域更新接口返回版本 `0.2.0`、release `260831185551`、build `1700000014` 和 APK 摘要。GitHub Actions run `33384834652` 成功，Release [v0.2.0](releases/v0.2.0.md) 已发布 APK `FridgeBoard-0.2.0-android-1700000014.apk`，大小 `6803113` 字节，SHA-256/digest 为 `9d303f01ec0a1268395fad841c56baac18cde3bdf8bcf209454703bb2da282a1`；包内为 `com.fridgeboard.app`、`versionName=0.2.0`、`versionCode=1700000014`。`uv lock --check`、后端 Ruff/pytest（236 passed）、前端 lint/test（424 passed）/build、移动端权限检查、Docker 构建、发布脚本语法、`git diff --check` 均通过。
- 未验证：未在第二台真实 Android 设备安装本次 APK；未执行本次发布后的真实 PWA/Android WebView 人工流程验收。Actions 有既有 Node.js 20/action 弃用提示，未影响本次成功发布。

## 2026-08-31 — 修复构建主 chunk 体积 warning

- 状态：完成，未提交或发布。
- 现象：前端生产构建生成约 508.50 kB 的主入口 chunk（历史记录约 503.7 kB），Vite 报告存在超过 500 kB 的 chunk warning。
- 目标：在不改变页面行为和用户可见功能的前提下，拆分可延迟加载的重型功能，使生产构建不再产生主 chunk 体积 warning；若仍存在合理的大型独立 chunk，应记录其边界和原因。
- 范围：前端入口依赖图、二维码扫描和其他按需功能的动态导入、构建产物及相关回归测试；不通过单纯提高 warning 阈值掩盖体积问题，不改变用户图片资源。
- 设计/需求基线：现有 `frontend/vite.config.ts`、`frontend/src/main.tsx`、`frontend/src/App.tsx`、扫码流程及项目已验证的前端 lint/test/build 命令；预期验证为相关前端测试、lint、build 和 `git diff --check`。
- 已完成：库存、搜索、移动库存和食谱页面改为 React 懒加载，首页入口不再静态携带这些页面代码；PWA QR reader 改为深路径动态导入；在 Vite 8/Rolldown 构建配置中为 ZXing 增加 300 kB 分组上限，使其大型依赖拆为多个独立异步 chunk，不提高 warning 阈值。生产构建主入口由 508.50 kB 降至 380.71 kB，最大 ZXing chunk 为 98.56 kB，未再输出 chunk warning。
- 验证：`npm run --prefix frontend test -- --run`（42 个文件、419 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实 PWA/Android WebView 中人工确认首次加载占位和扫码首次加载体验；未执行 Docker 镜像构建、正式发布或生产数据操作。

## 2026-08-31 — 页面缓存与静默后台刷新优化

- 状态：待评审；最新版实机复现的食谱首次导航整页加载提示和非首页食材图标旋转占位已按真实路径修复，前端质量门禁通过。
- 现象：已有本地缓存的页面仍会因自动请求显示顶部刷新动画；数据刷新或缓存更新后可能重置当前页面并跳回首页；启动、版本更新和首页主动刷新没有形成可控的全页面静默预取链路。
- 目标：缓存可用时直接展示且不显示自动加载动画；仅主动下拉刷新或无缓存无数据时显示动画。首页缓存缺失、版本更新及首页主动刷新后，在后台依次刷新各页数据，用户进入尚未完成的页面时提升该页优先级；任何刷新都不得改变当前页面。写操作仅按影响范围更新相关缓存，并按“删除不存在则忽略、保存覆盖服务端并发修改、保存目标不存在则提示并放弃”处理冲突。
- 范围：前端页面缓存、启动与版本检测、跨页面静默预取调度、刷新状态和页面栈稳定性、受影响写操作的缓存失效/更新，以及相应自动化测试和功能文档；不改变既有页面视觉设计和用户图片内容。
- 设计/需求基线：本次用户需求、`docs/ui-design-specification.md` 的共享页面壳与刷新状态约束、现有 `pageCache.ts`/页面栈/请求 API 约定；预期先补失败用例，再运行前端定向测试、全量测试、lint、build 和 `git diff --check`。
- 已完成：缓存存在时首页、冰箱列表和食谱/购物页直接进入 `idle`，不再按缓存年龄显示动画或自动请求；跨冰箱搜索先立即展示已有缓存，仅为缺失冰箱读取数据。新增单并发页面刷新队列，首页缓存缺失或 release 变化时依次刷新当前/其他冰箱工作区、当周食谱/购物和冰箱列表，进入等待中的页面会提升优先级并复用同一请求；完整成功后才记录 release。首页下拉只等待当前工作区并停止动画，再强制安排后台全量刷新。认证复核和数据刷新不再无条件重置到首页；仅首次无缓存启动或用户明确导航会替换页面。库存搜索修改、批量删除/移动及用户级分类/图标变更会同步或重建全部受影响缓存；删除缺失资源幂等，布局并发修改按服务端最新 revision 自动覆盖，保存目标缺失时保留页面并提示。
- 文档：新增 `PR-076`、`RG-018` 和功能设计 §2.3，明确缓存写入来源、静默刷新顺序、页面栈不变量及冲突规则。
- 审查发现：后台读取可能覆盖较新的用户写入、账号切换后旧请求可能回写已清缓存、跨冰箱搜索部分失败会隐藏已有缓存，以及批量删除无法区分缺失与无权限；修复范围因此扩展到前端刷新代次/取消、缓存 mutation version、部分成功展示和后端幂等删除权限契约。
- 审查修复完成：新增统一 `PageRefreshGuard`，后台工作区、食谱、购物、搜索和冰箱列表读取均绑定账号代次、`AbortController` 与缓存 mutation version；退出、401 和切换账号会中止受控请求、废弃旧队列及在途映射，并阻止旧响应写缓存或 release。用户保存、删除、移动、分类和列表修改会提升对应 mutation version，早于写入启动的后台读取无法覆盖新状态。跨冰箱搜索改为 `Promise.allSettled`，部分失败时保留缓存/成功结果并显示警告。批量删除 API 对真正缺失 ID 幂等，对其他账号现存批次返回 403，前端移除原先吞掉权限错误的递归重试。
- 审查修复验证：定向前端守卫/页面测试 179 个通过，定向后端库存 API 14 个通过；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（40 个文件、410 个测试通过）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（236 个测试通过，73 条既有依赖弃用警告）和 `git diff --check` 均通过。生产构建成功，仅有主 chunk 约 503.7 kB 的体积 warning。
- 审查修复未验证：尚未在真实 PWA/Android WebView 中人工制造慢请求后切换账号、保存与后台刷新交错、部分冰箱离线和跨账号删除；未执行正式发布。
- 第二轮审查：确认冰箱概览降级请求可能在数据不完整时仍记录完整 release；用户写请求尚未全部绑定账号代次；本周/下周请求可能晚到覆盖；搜索单项保存失败会隐藏已有结果且部分失败警告不会在成功后清除。按用户要求由多个 `gpt-5.6-luna` high 子代理并行修复，主代理完成后再独立审核与全量验证。
- 第二轮修复：后台完整预取对冰箱概览启用严格模式，任一布局、库存或最近删除请求失败均不记录完整 release，普通列表仍可降级展示；App 用户写入、异步导航、设置读取、绑定与轮询统一绑定账号 operation scope 和取消信号；食谱本周/下周及冰箱切换使用请求序号与目标周双重校验，旧响应不能覆盖当前周。搜索保存失败只保留行级错误或非阻塞缺失提示，完整成功会清理旧警告。
- 主代理复审：补齐搜索页数量保存的 operation scope，账号切换会取消旧保存并阻止其更新状态、缓存和父级工作区；搜索页改为用已有冰箱缓存同步初始化首帧，避免先固定渲染 `loading` 再由 effect 切换造成顶部动画闪烁。复核后台队列、release 标记、页面优先级、写入 mutation version、删除幂等和刷新导航路径后未发现新的阻塞问题。
- 最终验证：定向前端测试 4 个文件、188 个用例通过；`npm run --prefix frontend test`（42 个文件、419 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（236 个测试通过，73 条既有依赖弃用警告）、`uv lock --check` 和 `git diff --check` 均通过。生产构建仅有既有的单 chunk 超过 500 kB warning。
- 最终未验证：尚未在真实 PWA/Android WebView 中人工制造慢请求、切换账号、跨周快速切换、部分冰箱离线及保存/删除与后台刷新交错；未执行 Docker 镜像构建、正式发布或生产数据操作。
- 第三轮审查：确认食谱保存、完成、导入、复制、删除、自定义购物项和后台分类回写没有统一绑定账号 operation scope 与取消信号；食谱手动刷新会绕过同 key 后台任务，二者可用相同 mutation version 并行写缓存。关于“替换队列会令 Promise 永不结束”的表述不完全成立，旧队列仍被任务 Promise 持有且会在运行项结束后继续结算，但缺少显式取消会让 pending 的结束依赖运行项及时响应 abort。修复范围为食谱写请求守卫、手动刷新抢占提交权、队列显式取消及对应回归测试；预期重跑前端全量测试、lint、build 和 `git diff --check`。
- 第三轮修复：食谱保存、完成/撤销、导入、历史复制、删除、自定义购物项及后台分类识别回写统一创建账号 operation scope，全部网络请求复用其取消信号，并在状态、缓存、导航和后续写入前检查提交资格。手动食谱刷新先提升目标 recipe cache 的 mutation version；旧后台任务失去提交权时以 `AbortError` 结束，使全量预取不记录错误的完整 release。`PageRefreshQueue.cancel()` 会立即拒绝运行项和全部 pending Promise、清空等待项并禁止启动后续旧账号任务，认证上下文失效时在替换队列前显式调用。
- 第三轮验证：先新增失败用例并确认旧实现缺少 `cancel()`、operation scope 和手动刷新 mutation 提升；修复后定向测试 4 个文件、194 个用例通过。最终 `npm run --prefix frontend test`（42 个文件、423 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；当前生产构建已完成代码拆分，最大入口 chunk 约 381.3 kB，无 500 kB chunk warning。
- 第三轮未验证：未在真实 PWA/Android WebView 中以慢请求复现“写入中切换账号”“后台食谱刷新中下拉刷新”和“缺缓存导航时切换账号”；未执行正式发布。
- 第四轮问题记录：本地调试刷新且首页工作区缓存缺失时，`refreshState` 初始为 `loading`，但启动后的当前冰箱任务以 `visible=false` 进入静默刷新；成功和失败分支都只在 `visible=true` 时更新刷新状态，造成首页数据已显示但顶部动画永久停留。修复范围为当前工作区刷新状态结算和前端回归测试，不改变有缓存时的静默刷新规则；预期运行定向测试、前端全量测试、lint、build 和 `git diff --check`。
- 第四轮修复：`refreshWorkspace` 现在为每次调用计算 `reportRefreshState`。用户主动刷新，或当前首页缺少本地工作区缓存时，即使任务来自静默后台队列，也会负责将初始状态从 `loading` 结算为成功后的 `idle` 或失败后的 `error`；当前首页已有缓存且仅因 release 变化执行后台刷新时仍完全静默。
- 第四轮验证：先补失败用例并确认旧实现没有无缓存后台任务的状态结算分支；修复后定向测试 2 个文件、190 个用例通过。最终 `npm run --prefix frontend test`（42 个文件、424 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；最大入口 chunk 约 381.3 kB，无体积 warning。
- 第四轮未验证：未连接真实登录账号在浏览器中清除首页缓存后人工刷新；未执行正式发布。
- 第五轮问题记录：ADB 连接设备重启验证时发现后台预取仅写入当前周食谱缓存，而食谱页会持久化“本周/下周”选择；用户上次停留在下周时，重启进入食谱页仍会出现“正在加载”。同时确认首页数据刷新状态已结算，但 Capacitor 图标 Blob URL 在进程重启后需异步恢复，期间逐图旋转占位造成整屏加载动画。
- 第五轮修复：启动队列现在为每台可用冰箱依次预取本周和下周食谱。该轮尝试在 Capacitor 启动阶段从 CacheStorage 恢复首页图标，并提前执行库存、搜索、跨冰箱移动和食谱模块的动态 import；第六轮实机逐帧验证证明，首页范围遗漏了缺货食谱图标，提前执行另一份 import 也不能初始化 `React.lazy` 自身状态，因此当时关于首次导航不显示 fallback 的结论不成立。
- 第五轮验证：设备 `28ffa63d` 已完成强制停止、重启、日志和 0.6/2/7 秒截图核对；2 秒截图复现图标旋转占位，7 秒截图确认资源最终加载。先补失败用例，确认旧实现既不能同步取得持久化 Blob URL，也没有原生启动预加载；修复后定向测试 3 个文件、195 个用例通过。最终 `npm run --prefix frontend test`（42 个文件、426 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；主入口约 382.2 kB，食谱和库存独立 chunk 分别约 29.3 kB、77.2 kB。
- 第五轮未验证：当前设备未重新安装包含本轮改动的 APK，因此未能在安装新包后做最终截图回归；未执行正式发布。
- 第六轮问题记录：设备 `28ffa63d` 安装最新版后，以屏幕录像逐帧确认点击“食谱”后的前两帧显示“正在打开页面…”，随后食谱首帧中不在首页库存的“豇豆干”仍显示旋转环，下一帧才显示图标；购物页在同一个已挂载 `RecipeWorkspace` 内切换，不经过这两个首次初始化分支。根因是 `React.lazy` 即使提前执行过另一份动态 import，首次渲染仍会初始化自身 Promise 并触发 Suspense；图标启动预热又仅遍历 `homeInventory`，遗漏缺货食谱等页面使用的分类图标。
- 第六轮目标：将食谱/购物共享工作区改为主导航静态模块，完全移除该页面的 Suspense fallback；启动时从持久缓存恢复当前冰箱全部当前主题图标，使首页、食谱和购物的缓存内容首帧使用同一同步图标路径。先补回归用例，再运行前端全量测试、lint、生产构建和差异检查；不执行发布或提交。
- 第六轮修复：`RecipeWorkspace` 已改为 App 的静态一级页面，食谱和购物都不再经过 Suspense fallback。启动图片恢复改为遍历当前冰箱全部图标的当前主题资源，覆盖未在 `homeInventory` 出现的缺货食材；库存、搜索和移动页改用可预加载组件，启动等待与组件渲染复用同一状态。ADB 排查同时发现可调试安装包的 Capacitor 桥接日志会输出安全存储返回值，已将原生桥接 `loggingBehavior` 设为 `none`，避免会话凭据进入 logcat。
- 第六轮验证：先补失败用例并确认旧实现会遗漏仅用于食谱的图标，且食谱仍引用 `React.lazy`；修复后定向 4 个文件、198 个用例通过。最终 `npm run --prefix frontend test`（43 个文件、429 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。生产构建不再生成独立食谱 chunk，主入口约 414.3 kB；库存和搜索仍保持独立分块。
- 第六轮未验证：尚未把本轮修复重新安装到设备，因此实机录像只用于确认旧实现根因，不能作为修复后验收；未执行正式发布或提交。

## 2026-08-31 — 删除“杂粮”小类并部署

- 状态：完成。
- 目标：从本地测试数据库和远程生产数据库删除用户级“杂粮”小类；已有食谱、分类映射等引用统一转移到内置“主食”，避免数据丢失和外键悬挂。
- 范围：新增幂等 Alembic 数据迁移、迁移回归测试、本地数据库升级、远程备份/升级/健康检查和本进度记录；不删除仍可复用的系统 `bean` 图标，不修改用户图片资源或敏感配置。
- 设计/需求基线：现有分类目录 `removed_subcategory_names`、`builtin-category-staple` 及 PR-033 的“被引用小类不可直接删除”数据完整性约束；远程审计显示“杂粮”为用户 `2` 的自定义记录，含 13 条食谱引用和 1 条分类映射。
- 预期验证：迁移测试覆盖引用转移与重复最近记录处理；`uv lock --check`、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build、`git diff --check`；本地与远程数据库完整性、迁移版本、容器健康和公网 `/healthz`。
- 已完成：确认无需新增迁移；内置“杂粮”已由目录停用清单排除，用户自定义同名分类与 `bean` 系统图标均保留。提交 `8ffd2752b2f2daf55685499cea5edac6db4fc794` 已部署，release 为 `260831015351`；远程数据库备份为 `/data/fridgeboard.db.backup-20260830-175406`，权限 `600`、属主 `appuser:appuser`，容器镜像 ID 为 `sha256:0b29e29936bb9d30b676ad39dfe7bd959c0122240775b802a32660df15661303`。
- 验证：本地 `fridgeboard.db` 从 `20260830_31` 升级到 `20260830_32`，目录同步后“杂粮”记录数为 0、`integrity_check=ok`；`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（235 passed，73 条既有依赖弃用警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个文件、398 个测试通过）、`npm run --prefix frontend build`、`docker build --tag fridgeboard:local .` 和 `git diff --check` 均通过。远程 Alembic 为 `20260830_32`、内置“杂粮”为 0、用户自定义“杂粮”仍存在、`bean` 系统图标仍存在；容器 `running/healthy`、重启 `0`，公网 `/healthz` 返回 `{"status":"ok"}`，线上 JS 资源包含 release `260831015351` 和版本 `0.1.9`。
- 未验证：未在真实 PWA/Android WebView 中人工操作分类目录；部署传输中的 macOS 扩展属性 warning 未影响构建、启动或健康检查。

## 2026-08-31 — 同版本发布服务器与 Android APK

- 状态：完成。
- 目标：在不更新产品版本号 `0.1.9` 的前提下，将当前 `main` 发布到生产服务器，并补发正式签名 Android APK；Android `versionCode` 从 `1700000012` 递增到 `1700000013`。
- 范围：当前已验证的用户级共享分类与图标一致性修复、生产容器/PWA、数据库备份、健康检查和同版本 GitHub Release APK；不修改 `frontend/package.json` 版本号，不提交密钥、生产数据或运行时日志。
- 设计与发布基线：`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md`；服务器 release 由部署脚本自动生成，并与 APK 构建使用同一 release。
- 已完成：提交 `05d82a64ece9e5a0960cd4dd0e63dbd996496818` 已推送 `origin/main` 并部署到 `root@107.174.152.245:/opt/fridgeboard`；服务器 release 为 `260831012333`，镜像摘要为 `sha256:0e45716ecdd4fd92c8a7bb40e417379d3b93879cc931e9f24f9fbd251ee84319`，数据库备份为 `/data/fridgeboard.db.backup-20260830-172349`。GitHub Actions `33325215562` 已成功补发同标签 `v0.1.9` 的正式签名 APK。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（235 passed，73 条既有依赖弃用警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个文件、398 个测试通过）、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、`docker build --tag fridgeboard:local .`、脚本语法和 `git diff --check` 均通过；远端 Alembic 为 `20260830_32 (head)`，备份权限 `600` 且属主 `appuser:appuser`，容器 `running/healthy`、重启 `0`，公网 `/healthz` 返回 `{"status":"ok"}`，线上资源包含 release `260831012333`。APK `FridgeBoard-0.1.9-android-1700000013.apk` 大小 `6783970` 字节，包名 `com.fridgeboard.app`、`versionName=0.1.9`、`versionCode=1700000013`，SHA-256/digest 为 `f4162a5d61c61e3557d11cda3ddf66e2221372f31327320435ab46901cf919ae`；同域更新接口已返回相同版本、release、构建号和摘要。
- 未验证：未在第二台真实 Android 设备安装本次 APK；未执行本次发布后的真实 PWA/Android WebView 人工流程验收。

## 2026-08-31 — 系统图标同名拦截与自定义分类可见性修复

- 状态：待评审，自动化验证通过。
- 现象：系统图标已有“杂粮”时仍可生成同名自定义图标；用户把“杂粮”改名后再次创建“杂粮”，可能提示已创建，却在分类目录中找不到对应条目。
- 根因：目录的 `removed_subcategory_names` 原本用于停用历史系统分类，但分类查询、最近分类和目录同步没有限制 `is_custom = false`，因此同名自定义分类会被隐藏、清空图标，未被引用时还会被删除；图标草稿确认仅检查同名自定义分类，没有检查同名内置图标资产。
- 目标：停用名单只作用于系统分类；同名自定义分类始终可见且不会被目录同步删除。新建小类若名称已存在同名系统图标且用户试图保存自定义图标，应返回明确提示并要求复用系统图标；编辑已有小类不因自身当前系统图标误报。
- 范围：分类目录同步与查询、最近分类、图标草稿确认、错误提示及后端/前端回归测试；不改变用户图片内容，不执行提交或发布。
- 已完成：目录停用名单只作用于内置分类，自定义同名小类不再被查询、最近小类或目录同步隐藏和删除；分类普通创建/编辑与图标草稿确认均校验同名内置图标，名称精确命中时提示从图库复用，选择对应系统图标后分类直接绑定该图标键，不再生成同名自定义图标。前端输入同名名称时立即显示复用提示，确认时再次拦截错误选择。
- 验证：先补失败用例并确认旧实现会隐藏/删除自定义同名分类且允许保存同名自定义图标；定向用例覆盖“创建杂粮→改名杂粮饭→重新创建杂粮→两条均可搜索→再次重复才判重”、最近小类、目录同步和图标草稿复用。`uv run ruff check backend`、`uv run pytest`（235 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test`（38 个文件、398 个测试通过）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未执行正式发布或生产数据库迁移，未在真实 PWA/Android WebView 中人工操作该流程；生产环境仍未修改。

### 线上数据审计（2026-08-31）

- 已只读连接 `root@107.174.152.245` 的 `fridgeboard-app` 容器并核对 `/data/fridgeboard.db`：数据库完整性为 `ok`，Alembic 为 `20260830_32`。
- 结果：不存在 `label = '杂粮'` 的用户自定义图标；`bean` 是唯一的同名系统图标。用户“杂粮”分类当前绑定 `bean`，不是自定义图标记录。
- 结果：`custom-c88e9bf4fb2a452e8ece4b88e77d826e` 的标签为“杂粮饭”，被 1 个分类、1 条库存和 13 条食谱引用；不能按孤立脏数据删除。另有“奥尔良鸡排”“香菇”两个未被分类引用的孤立图标，与本次问题无关，未删除。
- 未执行：未删除线上任何数据；若要删除“杂粮”分类本身，需要先确认如何处理其 13 条食谱引用。

## 2026-08-30 — 生产分类与图标联动一致性修复

- 状态：待评审，自动化验证及生产备份副本迁移演练通过。
- 现象：生产端“杂粮”内置图标显示异常；“杂粮饭”自定义图标保存提示分类已存在；库存“圆白菜”列表显示为“白菜”且使用牛肉图标，编辑时分类语义又显示为“甘蓝”。
- 目标：以生产库真实记录为依据，将自定义小类和图标改为用户级共享数据；库存、食谱、购物项和识别映射统一引用同一个小类 ID，移除跨冰箱复制，修复不可见重复分类及名称/图标/所属大类错位，并避免继续生成同类脏数据。
- 范围：分类/图标数据库模型与服务、用户级分类识别、自定义分类保存校验、库存移动、食谱与购物分类关联、必要的数据迁移、后端回归测试及分类功能文档；不修改用户图片内容，不执行发布或未经验证的数据覆盖。
- 会话记录：已只读核对生产 SQLite。`圆白菜`库存外键指向自定义“白菜”，但该分类位于“肉蛋水产”大类并引用标签为“甘蓝”的复制图标；“杂粮饭”“白菜”“甘蓝”分类及同一源图标键被复制到多台冰箱；当前冰箱另有隐藏/错位的“杂粮饭”记录，因此保存命中重复校验。生产库 `integrity_check=ok`、外键违规为 0，说明问题是业务语义和资产归属不一致，不是 SQLite 物理损坏。
- 设计/需求基线：用户明确自定义小类和图标对同一用户的全部冰箱一致，不需要跨冰箱复制。库存、食谱食材和购物项继续只保存 `subcategory_id`，分类名称、所属大类和 `icon_key` 从同一用户级分类记录解析；图标标签不得替代分类 ID。预期验证为先补失败用例，再运行分类/图标/库存/食谱/购物定向测试、全量后端测试、Ruff、迁移升级与 `git diff --check`。
- 已完成：`food_categories` 与 `icon_assets` 改为 `owner_user_id` 用户作用域；分类列表、图标访问、自动识别、库存移动、食谱和购物关联直接复用同一用户级小类 ID，不再跨冰箱复制。数据库增加用户级大类/小类唯一索引和自定义分类作用域检查；图标编辑同步资产标签。`20260830_32` 迁移按用户合并历史复制分类并重写库存、食谱、购物、最近使用、名称映射和草稿关联，同时修复“杂粮”内置 `bean` 图标、“白菜/甘蓝”所属大类及“圆白菜→甘蓝”关联。新增 ADR-0005，并同步产品、功能和主题数据模型文档。
- 验证：先补跨冰箱共享 ID 用例并确认旧实现失败；最终 `uv lock --check`、`uv run ruff check backend`、`uv run pytest`（233 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个文件、396 个测试通过）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。生产 SQLite 通过在线备份下载到本机临时副本演练迁移：升级到 `20260830_32`，`integrity_check=ok`、外键违规 0、用户级重复分类 0；副本中“杂粮→bean”“杂粮饭→唯一自定义图标”“圆白菜→甘蓝→水果蔬菜”均核对通过。线上数据库未修改。
- 未验证：未执行正式发布或生产数据库迁移，未在真实 PWA/Android WebView 中人工复核三个报告场景；生产数据只有备份副本演练结果，线上仍保持 `20260830_31` 和原有分类记录。

## 2026-08-30 — 发布 FridgeBoard 0.1.9

- 状态：完成。
- 目标：将 `v0.1.8` 之后已合入 `main` 的购物车自动识别类别、历史分类回填和自定义图标持久缓存发布为 `0.1.9`，同步生产服务器并生成包含正式签名 APK 的 GitHub Release。
- 范围：版本号与发布说明、当前 `main` 提交、前后端质量门禁、迁移兼容性、生产容器发布、数据库备份/健康检查和 Android APK 构建发布；不提交密钥、生产数据或其他敏感文件。
- 设计与功能基线：`PR-075`、`RG-017`、`docs/mobile-deployment-design.md` 和 `docs/releases/v0.1.8.md`；预期使用同一 Git 提交部署服务器，并以 `v0.1.9` 触发 Android Release workflow。
- 已完成：版本升级为 `0.1.9`，提交 `900ce2afd465940f19c3e5b8506f7f9ee79550a3` 并推送 `main` 与 `v0.1.9`；生产服务器已部署 release `260830222554`。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（232 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个测试文件、396 个测试通过）、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、数据库迁移到 `20260830_31 (head)`、SQLite `integrity_check=ok`、正式签名 Android APK 构建与元数据校验均通过。服务器已创建数据库备份 `/data/fridgeboard.db.backup-20260830-142702`，容器为 `healthy`，镜像摘要为 `sha256:778bdb104d5f83cffa8aeadeeffc6f669d98308cb6520db861c0d95ede32514c`，`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。GitHub Actions run `33316956672` 成功，Release [v0.1.9](https://github.com/flywhc/FridgeBoard/releases/tag/v0.1.9) 已发布 APK `FridgeBoard-0.1.9-android-1700000012.apk`，线上文件 6,783,746 字节，SHA-256 为 `f35a6c8eff648a9456fd78135dac8ede4c6737097aa031fa15a0e9ad8210e530`，并与 GitHub digest 一致；`git diff --check` 通过且工作区干净。
- 未验证：未在第二台真实 Android 设备上安装本次 APK；GitHub Actions 已完成签名构建和发布校验，服务器/PWA 线上健康检查已完成。

## 2026-08-30 — 自定义图标持久缓存与版本失效

- 状态：待评审，自动化验证通过。
- 目标：让自定义小类图标与内置图标一样写入持久化缓存；同一服务器版本只从缓存读取，服务器版本变化时通过版本 URL 自动加载新资源。
- 范围：前端运行时图标缓存键匹配、受保护自定义图标资源缓存测试和必要的缓存清理说明；不改变图标生成、上传、访问控制和主题 fallback 逻辑。
- 设计/功能基线：`docs/theme-system-requirements-and-design.md` §4.4、§8、`docs/functional-design-and-feasibility.md` §8；预期验证为前端定向测试、全量测试、lint、build 和 `git diff --check`。
- 已完成：运行时缓存将已确认自定义图标的 Owner、daily access 和设备端资源纳入持久化 Cache Storage；PWA/浏览器端点返回 `private, max-age=31536000, immutable`；完整 `v` URL 作为缓存版本键，主资源使用内容摘要、主题变体使用服务端修订号。
- 验证：定向缓存测试 12 passed、图标 API 测试 29 passed；全量 `npm run --prefix frontend test -- --run`（38 个测试文件、396 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（232 passed）和 `git diff --check` 均通过。
- 未验证：未在真实 PWA/Android WebView 中人工断网确认跨重启缓存；未进行生产发布。

## 2026-08-30 — 回填历史食谱与购物项分类

- 状态：待评审。
- 目标：为历史 `recipe_ingredients` 与 `custom_shopping_items` 中缺失的小类 ID 执行一次幂等回填，使已确认或确定性可匹配的项目恢复分类图标；不覆盖已有分类，不擅自处理仍不确定的名称。
- 范围：新购物项自动分类、历史数据回填迁移、目标数据库回填命令和后端回归测试；不改变库存已有分类和未匹配项目的无图标语义。
- 设计基线：`docs/functional-design-and-feasibility.md` §9.1、PR-075/RG-017；预期验证为定向后端迁移/API 测试、后端 Ruff、全量 pytest、Alembic 升级、本地数据核对和 `git diff --check`。
- 已完成：未新增“白菜”“酸菜”等迁移专用别名；冰箱录入继续复用确定性匹配未命中后的 AI 候选分类，购物页自定义购物项新增和编辑也复用同一链路。`20260830_31` 迁移只针对执行迁移时的目标数据库，按该库已有分类名称、既有别名和单一库存分类证据回填，不读取本机快照；仍未确定的记录由 `python -m fridgeboard.category_backfill` 在目标环境显式执行，可先使用 `--dry-run`。
- 验证：定向购物页/API 与目标库回填测试 4 passed；全量 `uv run pytest`（232 passed）、`uv run ruff check backend`、`uv lock --check`、`FRIDGEBOARD_DATABASE_URL=sqlite:///./fridgeboard.db uv run alembic upgrade head` 和 `git diff --check` 均通过；本地回填命令 dry-run 识别 4 条未确定记录且未写库，本地 SQLite 完整性检查为 `ok`。
- 未验证：未执行生产数据库回填、生产发布或真实 PWA/Android WebView 人工验收；本机数据库仅用于开发验证，不能代表生产数据已处理。

## 2026-08-30 — 调整所属大类按钮留白

- 状态：待评审。
- 目标：增加新建/编辑小类“所属大类”选择按钮内容与外框之间的水平留白。
- 范围：小类编辑器所属大类按钮 CSS；不改变弹窗选项、保存逻辑和其他主题选择器。
- 已完成：所属大类按钮水平内边距由 `4px 0` 调整为 `4px 10px`。
- 验证：定向 `App.test.ts`、样式相关测试通过；`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 通过。
- 未验证：未进行真实 PWA/Android WebView 视觉验收。

## 2026-08-30 — 小类所属大类切换与拟物分割线修复

- 状态：待评审。
- 目标：让新建/编辑小类可以通过弹出列表更换所属大类，并在编辑保存时持久化归属；修复拟物主题选择列表标题分割线与选项分割线的阴影语义。
- 范围：小类编辑器、已有分类选择弹出框/大类选择逻辑、保存请求参数、拟物主题相关 CSS 与前端回归测试；不改变分类权限、图标候选和其他主题样式。
- 设计基线：`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` §17.1、草稿 `eabace7d-43c5-4326-901f-eaf29b04fda7` 与分类选择抽屉草稿 `284a5039-9042-484e-b683-b8504875a7e4`，本地资产 `docs/ui-assets/html/pwa-custom-icon.html`、`docs/ui-assets/png/pwa-custom-icon.png`；预期验证为定向前端测试、全量前端测试、lint、build 和 diff 检查。
- 已完成：小类编辑器复用应用内选项弹窗展示可用大类；新建/编辑草稿使用当前 `parent_id`，编辑只切换大类时也会进入保存确认；拟物主题弹窗标题分割线增加阴影，选项分割线取消阴影。
- 验证：定向 4 个测试文件、208 个测试通过；全量 `npm run --prefix frontend test -- --run`（38 个文件、395 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未按项目约定自动执行 Playwright 视觉核验；未在真实 PWA/Android WebView 或 320/390/430px 视口人工复核弹窗触摸和拟物阴影；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 发布 FridgeBoard 0.1.8

- 状态：完成。
- 目标：将当前工作区已完成的自定义小类图标与界面修复发布为 `0.1.8`，同步生产服务器并生成包含正式签名 APK 的 GitHub Release。
- 范围：版本号与发布说明、当前未提交应用改动、前后端质量门禁、生产容器发布、数据库备份/健康检查和 Android APK 构建发布；不提交密钥、生产数据或其他敏感文件。
- 设计与功能基线：现有 `PR-075`、`RG-017`、`docs/mobile-deployment-design.md` 和 `docs/releases/v0.1.7.md`；预期使用同一 Git 提交部署服务器，并以 `v0.1.8` 触发 Android Release workflow。
- 已完成：版本升级为 `0.1.8`，同步修正 Android 权限审查脚本的扫码入口路径，提交 `f4c27ce39a6142ee7b412005b0ba6c34be888386` 并推送 `main` 与 `v0.1.8`；生产服务器已部署 release `260830043410`。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（229 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个测试文件、392 个测试通过）、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、正式签名 Android APK 构建与元数据校验均通过。服务器已创建数据库备份 `/data/fridgeboard.db.backup-20260829-203459`，容器为 `healthy`，镜像摘要为 `sha256:ab349fbe187434ee6c6447a25549136aad6e5a74b62cb8302e43e6bbb83b2bc1`，`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。GitHub Actions run `33273932074` 成功，Release [v0.1.8](https://github.com/flywhc/FridgeBoard/releases/tag/v0.1.8) 已发布 APK `FridgeBoard-0.1.8-android-1700000011.apk`，线上文件 6,783,306 字节，SHA-256 为 `327f1eae9e1419cb94b57ef257aaccb83dfbc8b0e0affb09364b321c5cf350e5`，digest 校验通过；`git diff --check` 通过且工作区干净。
- 未验证：未在第二台真实 Android 设备上安装本次 APK；GitHub Actions 已完成签名构建和发布校验，服务器/PWA 线上健康检查已完成。

## 2026-08-30 — 本地小类图标浅色背景移除

- 状态：审查修复完成，待评审。
- 审查修复目标：避免无深色轮廓的白色/浅灰主体被边界连通算法删除；使编辑器缺失主题的借用顺序符合 `fallback_theme → ink → skeuomorphic → cartoon` 规则。
- 审查复现：构造白底、浅色主体、中央彩色区域图片后，当前算法把背景和浅色主体 alpha 都降为 0，仅保留彩色中心；当前编辑器在 fallback/当前主题缺失且 ink、skeuomorphic 同时存在时错误优先借用 skeuomorphic。
- 修复范围：背景连通扩张、阴影软蒙版、主题借用顺序及对应自动化测试；不改变页面结构、上传接口、图像尺寸或候选交互。
- 审查修复结果：背景识别改为两阶段蒙版，硬背景只沿相邻颜色小幅连续变化扩张，明显浅色边缘不再被吞入背景；与硬背景相邻且满足阴影色差的区域再单独生成非零软 alpha。新增无深色轮廓浅色主体测试，确认背景 alpha 为 0、浅色主体与彩色中心 alpha 均为 255；既有奶白渐变与半透明阴影测试继续通过。编辑器借用顺序修正为 `fallback_theme → ink → skeuomorphic → cartoon`，并覆盖 fallback 存在和缺失两种情况。
- 目标：新建/编辑小类的“本地”来源导入白色、奶白色或边缘明暗不均匀背景图片时，在本机生成透明 PNG，同时保留图标主体、既有透明度和半透明阴影。
- 范围：前端图片解码、背景估算、边界连通软蒙版、候选预览与本地上传文件；后端继续执行普通栅格图安全校验和尺寸归一化，不调用外部抠图服务、不引入模型或新运行时依赖。
- 设计基线：`docs/ui-design-specification.md`、`docs/functional-design-and-feasibility.md` §17.1、`docs/final-ui-designs.md` 的“自定义小类与 AI 图标确认”草稿 `eabace7d-43c5-4326-901f-eaf29b04fda7`、本地资产 `docs/ui-assets/html/pwa-custom-icon.html` 与 `docs/ui-assets/png/pwa-custom-icon.png`、`docs/custom-subcategory-multitheme-icon-design.md`。用户本次明确授权本地上传图片去背景，覆盖旧文档中“不自动抠图”的对应边界；仍禁止裁剪、补边、调色、锐化和改变主体占比。
- 交互约束：去背景结果默认应用到当前主题；同一次导入保留原图候选作为失败回退；背景置信度不足时不强制删除像素。复用现有四候选槽位，不改变页面壳、顶部栏、主题槽和底部操作区。
- 已完成：新增独立纯像素背景移除模块，以边缘浅色占比判断置信度，从四边执行 8 邻域连通扩张，按背景色差生成软 alpha 并反混合边缘颜色；分析最长边限制为 1024px，处理后再等比输出最长边 256px PNG。已有透明边界和复杂背景保持原图；成功移除背景时自动生成“去背景”和“原图”两个候选，默认应用去背景结果，四槽位继续循环覆盖。编辑器纯辅助函数和展示组件按职责拆分，主文件从 964 行降至 864 行。
- 测试覆盖：纯白背景、向中心渐深的奶白背景、深色轮廓内白色主体、半透明浅灰阴影、已有透明边界、低置信度彩色背景、PNG/原图双文件输出、候选默认选择与最终上传。
- 验证：首轮 `npm run --prefix frontend test -- --run src/iconBackgroundRemoval.test.ts` 因模块不存在按预期失败；审查修复新增的浅色无轮廓主体和 fallback 顺序用例也先分别以 alpha `0`、错误借用 skeuomorphic 按预期失败。修复后定向 2 个测试文件、9 个用例通过；最终 `npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个测试文件、392 个测试通过）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：按项目约定未自动执行 Playwright 视觉核验；尚未在真实 PWA/Android WebView 中用用户实际图片人工确认主体边缘、半透明阴影和候选切换；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 替换在线关键词刷新按钮图标

- 状态：待评审。
- 目标：将在线关键词刷新按钮的 SVG 替换为用户提供的双向刷新图标，保持按钮尺寸、旋转加载状态和交互语义不变。
- 范围：小类图标编辑器刷新按钮 SVG；不改变关键词请求、缓存、禁用和无障碍行为。
- 已完成：使用用户提供的 20×20 双向刷新实心 SVG 替换原线框图标，并将按钮 SVG 样式改为填充且保留生成中的旋转动画。
- 验证：`npm run --prefix frontend test -- --run src/SubcategoryIconEditor.mount.test.tsx src/SubcategoryIconEditor.test.ts`（2 个测试文件、34 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实浏览器/Android WebView/PWA 安装态人工视觉验收。

## 2026-08-30 — 添加物品目录标题与搜索框间距修复

- 状态：待评审。
- 目标：让添加物品页“选择物品”、目录搜索框和“展开选择物品”按钮在同一标题行垂直居中，并移除搜索框继承的无效下方留白。
- 范围：P5 添加物品目录标题及搜索框共享样式、搜索框场景间距回归测试；不改变分类数据、搜索行为和抽屉交互。
- 设计基线：`docs/ui-design-specification.md` §5–§7、`docs/functional-design-and-feasibility.md` §2.1、`docs/final-ui-designs.md` 中的“添加物品：识别与基础信息”草稿 `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668`，本地资产 `docs/ui-assets/html/pwa-add-food.html` 与 `docs/ui-assets/png/pwa-add-food.png`；预期验证为前端测试、lint、build 和 diff 检查。
- 预期回归：添加物品标题行不再被搜索框下边距撑高；分类抽屉搜索、物品列表搜索和在线图标搜索保留明确的场景间距；首页搜索保持既有布局。
- 已完成：将共享 `.p5-search` 默认外部边距归零；添加物品标题行和分类抽屉搜索显式归零，保留物品列表与在线图标搜索已有的场景间距；补充搜索框边距回归断言。
- 验证：`npm run --prefix frontend test -- --run`（36 个测试文件、382 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实浏览器/Android WebView/PWA 安装态人工视觉验收；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 移除新建/编辑小类顶部重复关闭入口

- 状态：待评审。
- 目标：新建/编辑小类页面只保留左上角返回按钮，不再在右上角重复显示 X/关闭按钮。
- 范围：小类图标编辑器页面头部、对应设计基线与前端回归测试；返回时的取消、生成清理和页面栈行为保持不变。
- 设计基线：`docs/ui-design-specification.md` §6.2.1、`docs/final-ui-designs.md` 的“自定义小类与 AI 图标确认”页面、`docs/custom-subcategory-multitheme-icon-design.md` §7；预期验证为前端测试、lint、build 和 diff 检查。
- 已完成：移除小类编辑器传给共享 `PageHeader` 的右侧关闭按钮，保留左侧返回按钮和原有取消/清理流程；同步修正挂载测试 mock 与设计文档。
- 验证：`npm run --prefix frontend test -- --run`（36 个测试文件、382 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实浏览器/Android WebView/PWA 安装态人工验收；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 新建小类在线关键词刷新与默认名称处理

- 状态：待评审。
- 目标：新建小类仍为“待命名小类”时不自动请求英文关键词；在线关键词横向列表前增加刷新按钮，生成中显示旋转状态，点击后重新按当前名称请求关键词。
- 范围：前端小类图标编辑器、在线关键词显示与请求状态、前端交互测试及相关功能/设计约束文档；不改变后端关键词接口契约。
- 设计基线：`docs/ui-design-specification.md`、`docs/final-ui-designs.md` 中的“自定义小类与 AI 图标确认”页面、`docs/custom-subcategory-multitheme-icon-design.md` §4；预期验证为前端测试、lint、build 和 diff 检查。
- 已完成：默认名称进入“在线”页不调用 `/icon-keywords`，名称改回占位文案时清空旧关键词；关键词横向列表首项增加圆形刷新 SVG，强制请求绕过页面缓存，生成期间旋转并禁用重复点击，完成后恢复静态状态；同步更新小类图标功能设计文档并补充挂载交互测试。
- 验证：`npm run --prefix frontend test -- --run`（36 个测试文件、382 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实浏览器/Android WebView/PWA 安装态人工验收；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 继续排查小类编辑页未从右侧滑入

- 状态：完成，真实浏览器逐帧验证与前端质量门禁均通过。
- 现象：从“选择分类”抽屉打开“新建小类/编辑小类”时，页面首帧已经位于左侧最终位置，没有像其他二级页面一样从右向左滑入。
- 排查范围：真实浏览器首帧 `class`、Web Animations、计算后 `transform`、页面栈状态更新时序和嵌套层 CSS；不再以源码类名或静态 HTML 断言代替真实动画验证。
- 根本原因：页面栈用固定 220ms JavaScript 定时器移除动画类；浏览器渲染受阻时，墙钟时间已经到期，但 CSS 动画时间轴实际只推进约 16ms，导致动画被截断并直接跳到左侧最终位置。
- 已完成：页面栈改为由目标栈层的 `animationend` 完成转场；2 秒定时器仅作为动画事件丢失时的故障兜底，不再参与正常动画时序。新建/编辑小类仍显式使用 `from-right`，下层“选择分类”抽屉保持静止。
- 真实界面验证：Playwright 点击“＋ 新建小类”后逐帧采样，编辑页从 `translateX(1200px)` 开始，依次过渡至 `919px`、`603px`、`17px` 和 `0px`；动画完整运行 220ms 后才移除 `page-stack-enter-from-right`。
- 自动化验证：`npm run --prefix frontend test -- --run`（36 个测试文件、380 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在 Android WebView/PWA 安装态设备上人工复核；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 深入排查抽屉到小类编辑页的复合转场

- 状态：完成，复合根因已修复并通过桌面、手机视口逐帧验证和前端质量门禁。
- 现象：编辑小类内容以半透明状态直接显示在抽屉上方，同时后方存在一层从屏幕左侧向右移动的模糊动画；期望“选择分类”抽屉完全静止，编辑小类页面从屏幕右侧外完整滑入并最终覆盖抽屉。
- 排查范围：嵌套页面栈的 push/pop 状态、每个动画类实际绑定的 DOM 层、编辑页完整不透明背景、`z-index`/层叠上下文、外层页面栈是否被误触发，以及真实浏览器逐帧像素和计算样式。
- 根本原因：小类名称输入框使用 `autoFocus`，编辑页挂载在屏幕右侧时浏览器为聚焦离屏控件自动水平滚动文档，抵消了编辑页的正向位移并把静止抽屉卷到左侧；同时通用入场关键帧把整页透明度从 0 过渡到 1，造成编辑内容与抽屉半透明混合。
- 已完成：入场栈层在 `animationend` 前保持 `inert`，小类名称输入框改为转场结束后通过 `focus({ preventScroll: true })` 聚焦；右侧入场关键帧移除透明度变化，编辑页滑入部分始终不透明。代码注释及功能、设计文档已补充禁止离屏自动聚焦和透明入场的回归约束。
- 真实界面验证：Playwright 桌面视口 30 帧采样中，编辑页 `x` 从 `1200` 连续过渡到 `0`、`opacity` 始终为 `1`、`window.scrollX` 始终为 `0`、抽屉 `x=385` 全程不变；430×730 手机视口中编辑页 `x=430 → 123 → 0`，抽屉 `x=0`、最大水平滚动 `0`、透明度始终为 `1`。返回时编辑页向右退出，抽屉坐标和 transform 全程不变。
- 自动化验证：先新增入场层 `inert`、禁止 `autoFocus`、不透明横向入场断言并确认旧实现失败；修复后 `npm run --prefix frontend test -- --run`（36 个测试文件、380 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在 Android WebView/PWA 安装态设备上人工复核；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 修复分类抽屉高度回归与小类编辑入场方向

- 状态：完成，自动化验证通过，待真实 PWA/Android WebView 动画验收。
- 目标：恢复“选择分类”抽屉既有弹出高度并确保始终贴底；修正新建/编辑小类页面从右侧向左侧进入。
- 范围：分类抽屉 CSS 与注解、需求/设计约束、页面栈小类编辑入场契约和前端回归测试；不改变分类业务逻辑。
- 回归警告：抽屉高度 `min(600px, calc(100dvh - 80px))` 和底部锚定 `bottom: 0` 是已确认产品约束，禁止改成视口比例高度或触发条相对定位。
- 已完成：恢复抽屉高度 `min(600px, calc(100dvh - 80px))` 与 `bottom: 0` 底部锚定；为需求文档、设计规范、CSS 和组件注解增加回归警告；小类编辑入口显式使用 `from-right` 正向入场，返回时保持分类抽屉下层静止。
- 设计/功能基线：`docs/ui-design-specification.md` §8.2.2、`docs/functional-design-and-feasibility.md` §2.1/§3.4/§3.7、草稿 `284a5039-9042-484e-b683-b8504875a7e4` 与 `eabace7d-43c5-4326-901f-eaf29b04fda7`；预期验证为前端测试、lint、build 和 diff 检查。
- 验证：`npm run --prefix frontend test -- --run`（36 个测试文件、379 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实 PWA/Android WebView 中人工确认动画方向和时序；未进行生产发布、数据库备份或部署。

## 2026-08-30 — 修复选择分类抽屉与小类编辑页转场

- 状态：完成，自动化验证通过，待真实 PWA/Android WebView 动画验收。
- 目标：让“选择分类”作为从底部向上进入、向下退出的抽屉；点击上层可见区域关闭抽屉；抽屉内打开“新建小类/编辑小类”时仅编辑页从右侧进入、从左侧退出，抽屉保持静止。
- 范围：分类选择器、小类编辑器、共享页面栈转场类名与前端回归测试；不改变分类数据、接口和页面视觉内容。
- 设计/功能基线：`docs/ui-design-specification.md` §5–§6、`docs/functional-design-and-feasibility.md` §17.1、草稿 `284a5039-9042-484e-b683-b8504875a7e4` 与 `eabace7d-43c5-4326-901f-eaf29b04fda7`；预期验证为前端测试、lint、build 和 diff 检查。
- 已完成：分类选择器改为半屏底部抽屉，打开向上、关闭向下；透明上层点击区域会触发关闭；分类选择支持异步结果，失败时保留错误和抽屉。小类编辑入口保留分类抽屉所在下层，编辑页从右侧进入、返回时编辑页向右退出且抽屉不执行左侧进入动画；移除旧的触发条定位状态。
- 验证：`npm run --prefix frontend test -- --run`（36 个测试文件、378 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实 Chrome/PWA 或 Android WebView 中人工确认触摸区域和动画时序；未进行生产发布、数据库备份或部署。

## 2026-08-29 — 修复 PWA meta 与页面栈焦点警告

- 状态：完成，自动化验证通过，待真实浏览器人工复核。
- 目标：补充标准 `mobile-web-app-capable` meta；修复页面栈切换时非活动层仍保留焦点导致的 `aria-hidden` 浏览器警告。
- 范围：`frontend/index.html`、共享页面栈实现及对应前端回归测试；不改变业务流程、页面视觉和 PWA 安装交互。
- 设计/功能基线：`docs/ui-design-specification.md` §5–§6、`docs/functional-design-and-feasibility.md` §17.1；预期验证为前端 lint、测试、构建和 diff 检查。
- 已完成：新增 `mobile-web-app-capable`，保留 iOS 专用 meta；页面栈非活动层仅使用 `inert`，移除与保留焦点冲突的 `aria-hidden`；更新页面栈属性回归断言。
- 验证：`npm run --prefix frontend test -- --run`（36 个测试文件、376 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未在真实 Chrome 页面执行页面切换、键盘焦点和辅助技术人工验收。

## 当前看板

| 范围 | 状态 | 维护入口 |
| --- | --- | --- |
| Android 首次启动认证状态异常与登录/注册入口（RG-023） | 待评审；前端 458 项通过，首装 APK 模拟器复现已修复 | 本会话记录、`frontend/src/App.tsx`、`frontend/src/startupRefrigerator.ts` |
| Android 小组件标准列表与咖啡色滚动条（PR-080/RG-022） | 待评审；52 项单测、7 项原生仪器测试通过，真实 Launcher 待验收 | 本会话记录、功能设计 §9.6、回归矩阵 |
| Android 系统小组件添加页预览演示数据 | 待评审；Android 单测、Debug 构建及 Pixel Launcher 预览验证通过 | 本会话记录、`recipe_widget_info.xml`、`recipe_widget_preview.xml` |
| FridgeBoard `0.2.1` 生产与 Android APK 发布 | 已完成（versionCode `1700000017`） | [发布说明](releases/v0.2.1.md)、本会话记录 |
| FridgeBoard `0.2.5` 生产与 Android APK 发布 | 已完成（versionCode `1700000023`） | [发布说明](releases/v0.2.5.md)、本会话记录 |
| FridgeBoard `0.2.0` 生产与 Android APK 发布 | 已完成（再次发布，versionCode `1700000016`） | [发布说明](releases/v0.2.0.md)、本会话记录 |
| FridgeBoard `0.1.9` 生产与 Android APK 发布 | 已完成（同版本补发，versionCode `1700000013`） | [发布说明](releases/v0.1.9.md)、本会话记录 |
| FridgeBoard `0.1.8` 生产与 Android APK 发布 | 已完成 | [发布说明](releases/v0.1.8.md)、本会话记录 |
| Android APK 检查更新与覆盖安装失败排查（P13.8/RG-015） | 已完成，真机验证通过 | 本会话记录、移动端部署设计 |
| 自定义小类跨冰箱全量识别与购物清单图标（PR-075/RG-017） | 待评审（新项自动分类、目标库历史回填已实现） | 本会话记录、需求与回归矩阵 |
| 自定义图标持久缓存与版本失效 | 待评审（自动化验证通过） | 本会话记录、主题系统设计、前端运行时缓存测试 |
| 产品需求 `PR-001` 至 `PR-073` | 已完成并验证 | [产品需求基线](product-requirements.md) |
| 回归场景 `RG-001` 至 `RG-015` | 已完成并验证 | [回归矩阵](requirements-traceability.md) |
| 架构、部署和运维边界 | 已完成并验证 | [架构](architecture/README.md)、[移动端部署](mobile-deployment-design.md) |
| PWA 启动 splash 与 release 升级（PR-074/RG-016） | 待评审 | [PWA 缓存与发布设计](mobile-deployment-design.md)、本会话记录 |

## 2026-08-30 — 修复库存列表新建小类的大类归属

- 状态：待评审。
- 现象：在库存列表批量选择物品后打开“分类”抽屉，切换到非首个大类，再点击“新建小类”并完成“创建并识别此类物品”，新小类的大类会使用首个大类。
- 根因：`InventoryList` 自己维护分类抽屉的大类状态，但创建回调只传递选中物品和完成回调，`InventoryFlow` 无法获知抽屉当前选中的大类，因而使用自身初始化的 `activeGroupId`。
- 已完成：创建回调显式传递 `activeCategoryGroupId`；`InventoryFlow` 接收该 ID 并在新建小类页面使用，同时让添加物品页显式保留当前大类；补充失败后通过的回归断言和功能约束文档。
- 验证：先运行新增回归断言确认旧实现失败；修复后 `npm run --prefix frontend test -- --run src/App.test.ts src/InventoryFlow.test.ts`（2 个文件、178 项通过）、`npm run --prefix frontend test -- --run`（38 个文件、393 项通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实 PWA/Android WebView 人工操作验收；未进行生产发布、数据库备份或部署。

## 2026-08-29 — 修复页面栈审查问题

- 状态：完成，自动化验证通过，待真实 PWA/Android WebView 验收。
- 目标：修复页面栈重构审查发现的设置加载返回目标错误、食谱同级页面栈无限增长、隐藏页面副作用未暂停和页面栈时序测试不足。
- 范围：共享页面栈生命周期、App 设置加载返回、食谱同级导航、扫码等根级全屏状态的边界说明及前端回归测试；不改变业务接口和视觉设计。
- 设计基线：上一条“重构手机端页面返回栈与转场”记录、`docs/ui-design-specification.md` §5–§6；预期验证为前端 lint、测试、构建和 diff 检查。
- 已完成：设置加载取消返回改为替换到保存的来源页；食谱本周/购物清单同级切换改为替换栈项；新增页面 active 上下文并暂停隐藏页面的网络提示、相机、计时器和图标生成副作用；普通业务扫码器改为覆盖在业务页面栈上，配对/安装引导继续作为根级终态。
- 测试覆盖：补充设置返回、食谱同级导航和页面层可访问性隔离回归断言。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（36 个测试文件、376 个测试通过）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实 PWA/Android WebView 的人工转场、系统返回键和右滑手势验收；未进行生产发布、数据库备份或部署。

## 2026-08-29 — 重构手机端页面返回栈与转场

- 状态：完成，自动化验证通过，待真实 PWA/Android WebView 验收。
- 目标：系统分析并重构手机端全部页面级导航，消除页面替换时下层未挂载导致的白屏和转场露白；统一顶部返回、原生返回和右滑返回的栈行为。
- 范围：共享页面栈与转场、`App.tsx` 外层导航、库存/食谱/配对/设备绑定等局部流程导航及对应前端回归测试；不改变业务接口、数据模型和已确认的页面视觉层级。
- 设计基线：`docs/ui-design-specification.md` §5–§6、`docs/final-ui-designs.md` 中冰箱设置/已有布局编辑资产；功能基线为“已有冰箱从设置进入布局编辑并按进入顺序返回”。
- 已完成：新增共享 `usePageStack` 和 `PageStack`，覆盖应用外层、库存、食谱、设备绑定、设置确认和新建布局流程；返回、原生返回和右滑返回统一走栈操作，页面层使用 `inert` 隔离焦点与交互；移除旧的全局返回入场标记和页面延时卸载转场。
- 验证：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（36 个测试文件、374 个测试通过）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实 PWA/Android WebView 的人工转场、系统返回键和右滑手势验收；未进行生产发布、数据库备份或部署。

## 2026-08-29 — Android APK 覆盖安装失败排查

- 状态：已完成，真机验证通过。
- 目标：调查 Android 关于页检查更新后下载 APK、系统升级安装失败的原因；不改变本次工作区已有应用代码和用户未提交改动。
- 证据：线上 `v0.1.7` APK 的包名为 `com.fridgeboard.app`、`versionCode=1700000010`，SHA-256 为 `79522018d4a92fe2b81fff314091c3b2ca5f846993bc442519b09ec18fb09dbc`，签名证书指纹为 `bcc72627...e9d0a`；连接设备当前安装包为 `versionCode=1`、带 `DEBUGGABLE` 标记，签名为 Android Debug 证书 `798501f3...16ea3`。
- 复现：`adb install -r /tmp/fridgeboard-update-investigation/remote.apk` 返回 `INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.fridgeboard.app signatures do not match previously installed version`；因此下载和 SHA-256 校验成功后，失败发生在 Android 覆盖安装的签名校验阶段。
- 结论：Debug 签名 APK 不能直接覆盖安装正式签名 APK；必须卸载 Debug 包后安装正式包，或从一开始使用同一正式 keystore 构建本地开发包。当前原生代码已声明 `REQUEST_INSTALL_PACKAGES`、使用 `FileProvider` 并返回安装失败状态，未发现下载 URL、包名或线上 APK 元数据不一致。
- 验证：已核对线上 metadata、独立下载 APK 的 SHA-256、包名/版本号/版本码/签名，并在真实 Android 设备上复现系统错误；未修改应用代码，未执行卸载或清除设备数据。
- 已完成：所有 Android 主包构建（包括 `npm run install:android` 使用的 Debug variant）强制使用线上正式签名；自动探测用户目录下受保护的 `secure/fridgeboard-keystore.properties`，显式环境变量仅用于覆盖路径；找不到配置或字段不完整时直接失败，不再回退 Debug 证书。
- 验证：未设置环境变量执行 `frontend/scripts/build-android.sh assembleDebug` 和 Android `assembleRelease`，两者产物签名均为线上正式证书；前端 36 个测试文件、375 个测试通过，Android `testDebugUnitTest` 通过，lint、build、`git diff --check` 通过；缺少签名配置时 Gradle 明确失败。
- 新发现与修复：同签名 APK 已能打开 MIUI 系统安装器并完成安装，但 `startActivityForResult` 会在安装器显示后立即回调取消，页面误报“安装已取消”；现改为非回调式启动，并在应用恢复时重新检查版本。
- 真机验证：修复版通过应用内原生桥真实下载并校验 `6778670` 字节 APK，打开 MIUI 安装确认页后完成安装；设备最终为 `versionCode=1700000010`、正式签名，未出现 `APK_INSTALL_CANCELLED`。
- 验证：`npm run install:android` 无环境变量成功构建并部署；前端契约/应用测试、lint、build，Android `testDebugUnitTest`/`assembleDebug`，以及 `git diff --check` 均通过。
- 未验证：未在第二台设备上验证；未覆盖其他厂商 ROM 的安装器行为。

## 当前发布基线

- 产品版本和发布归档以 [releases/](releases/) 及 [移动端部署设计](mobile-deployment-design.md) 为准。
- 生产部署、Android APK、数据库备份、镜像摘要和健康检查等证据不在本页重复维护。
- 当前工作区若存在未提交改动，以 `git status` 和对应会话记录为准；本页不把未发布改动描述为生产状态。

## 会话记录规则

每次领取实现或修复任务时，在本文件顶部增加一条短记录；完成后同步需求、回归和受影响详细文档。记录只回答：改了什么、验证了什么、还缺什么。超过一页的日志、重复的样式微调和已失效的下一步全部进入归档，不作为当前看板。

## 2026-08-29 — 更新本地测试数据库定义

- 状态：完成。
- 目标：将本地默认测试数据库升级到当前仓库的最新 Alembic 迁移头，验证数据库完整性和新增跨冰箱分类识别表结构。
- 范围：本地 `fridgeboard.db`、Alembic 迁移状态和本进度记录；不修改应用代码、迁移文件、生产数据库或 Git 提交。
- 预期验证：执行升级前后版本核对、`PRAGMA integrity_check`、关键表结构检查和 `git diff --check`。
- 完成：本地 `fridgeboard.db` 已从 `20260828_29` 升级到 `20260829_30 (head)`，新增 `custom_shopping_items.subcategory_id`、对应索引和 `food_categories` 外键。
- 验证：`FRIDGEBOARD_DATABASE_URL=sqlite:///./fridgeboard.db uv run alembic upgrade head`、`uv run alembic current`、SQLite `PRAGMA integrity_check`、表结构/索引/外键核对和 `git diff --check` 均通过。
- 未验证：未修改或验证生产数据库；未运行完整应用测试，本次仅更新本地数据库定义。

## 2026-08-29 — 修复审核发现的编辑批次和购物项图标问题

- 状态：待评审。
- 目标：修复编辑中的物品名称仍使用旧持久化名称识别，以及未分类自定义购物项错误继承同名库存图标的问题。
- 范围：分类识别服务、购物清单组件及对应回归测试；不改变跨冰箱扫描范围和已有分类权限。
- 已完成：编辑中的库存批次从普通扫描中排除，优先使用当前草稿名称匹配；未分类自定义购物项不再通过同名库存推断图标；新增两项边界回归测试。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（229 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（36 个测试文件、375 个测试通过）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实浏览器/移动设备人工交互验收；未进行生产发布、数据库备份或部署。

## 2026-08-29 — 自定义小类跨冰箱全量识别与购物清单图标

- 状态：待评审。
- 目标：创建或编辑自定义小类后，扫描当前用户全部活跃自有冰箱的库存、食谱和购物项；调整小类编辑按钮和状态模态框，并修复购物清单小类图标缺失。
- 范围：分类识别接口、跨冰箱数据更新、自定义购物项分类字段、迁移、前端小类编辑器/购物清单、对应测试和需求文档；不改变日常访问用户的分类管理权限。
- 设计基线：`docs/ui-design-specification.md`、`docs/final-ui-designs.md` 的小类编辑与动态购物清单资产；功能基线 `PR-075`、`RG-017`。
- 已完成：新增跨所有者自有冰箱扫描接口和事务更新；购物项小类字段、自动重分类和删除引用保护；小类编辑器三种按钮状态与结果模态框；缺货食材/购物项按小类 ID 显示图标；补齐接口、迁移和前端回归测试。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（228 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（36 个测试文件、374 个测试通过）、`npm run --prefix frontend build`、`git diff --check` 均通过。
- 未验证：未执行真实浏览器/移动设备的人工交互验收；未进行生产发布、数据库备份或部署。

## 2026-08-29 — PWA 启动 splash 与 release 升级

- 状态：待评审。
- 目标：缓存优先显示启动 splash；联网检查和 release 同步不阻塞主界面；发现新版本时在 splash 显示“正在更新...”。
- 范围：`frontend/index.html`、`frontend/src/main.tsx`、`frontend/src/pwaCache.ts`、`frontend/public/sw.js` 及对应前端测试；不改业务数据、登录状态和原生 APK 更新流程。
- 设计基线：`docs/ui-design-specification.md` §5、§6.4、§7；现有 `app-boot-ice4.png` 启动资产；功能基线 `PR-074`、`RG-016`。
- 验证：`npm run --prefix frontend test -- --run`（36 个测试文件、373 个测试通过）；`npm run --prefix frontend lint` 通过；`npm run --prefix frontend build` 通过；`git diff --check` 通过。
- 未验证：真实 PWA 安装实例的断网、慢网、旧 release 升级和浏览器 Service Worker 生命周期；需要在目标浏览器手动验收。
- 下一步：评审并在真实 PWA 安装实例执行 `RG-016` 的断网/慢网/旧 release 回归。

## 2026-08-29 — 文档体系整理

- 状态：完成。
- 目标：将需求、计划和进度从混合流水账整理为可维护的当前基线，并把后来补充的行为纳入可回归需求和场景索引。
- 改动：新增 `docs/README.md`、`docs/product-requirements.md`、`docs/requirements-traceability.md`；精简本文件和 `docs/development-execution-plan.md`；将旧进度与旧执行计划原样移至 `docs/archive/`；修正详细文档中的过时状态和未实现描述。
- 验证：已检查主文档链接、需求/回归 ID、归档文件存在性和 `git diff --check`；本次仅整理文档，未重复运行应用测试、构建或设备验收。
- 未验证：无新增应用行为；不适用的应用门禁未运行。
- 下一步：新增功能时按 [文档入口](README.md) 先登记 `PR-*` 和 `RG-*`，再开始实现。
