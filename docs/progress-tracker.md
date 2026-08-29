# FridgeBoard 开发进度

更新时间：2026-08-30
状态：自定义小类跨冰箱全量识别审核问题修复待评审
历史记录：[archive/progress-tracker-history.md](archive/progress-tracker-history.md)
需求基线：[product-requirements.md](product-requirements.md)
回归矩阵：[requirements-traceability.md](requirements-traceability.md)

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
| Android APK 检查更新与覆盖安装失败排查（P13.8/RG-015） | 已完成，真机验证通过 | 本会话记录、移动端部署设计 |
| 自定义小类跨冰箱全量识别与购物清单图标（PR-075/RG-017） | 待评审 | 本会话记录、需求与回归矩阵 |
| 产品需求 `PR-001` 至 `PR-073` | 已完成并验证 | [产品需求基线](product-requirements.md) |
| 回归场景 `RG-001` 至 `RG-015` | 已完成并验证 | [回归矩阵](requirements-traceability.md) |
| 架构、部署和运维边界 | 已完成并验证 | [架构](architecture/README.md)、[移动端部署](mobile-deployment-design.md) |
| PWA 启动 splash 与 release 升级（PR-074/RG-016） | 待评审 | [PWA 缓存与发布设计](mobile-deployment-design.md)、本会话记录 |

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
