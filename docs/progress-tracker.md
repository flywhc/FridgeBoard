# FridgeBoard 开发进度

更新时间：2026-08-30
状态：0.1.8 小版本已发布；小类所属大类切换与拟物分割线修复待评审
历史记录：[archive/progress-tracker-history.md](archive/progress-tracker-history.md)
需求基线：[product-requirements.md](product-requirements.md)
回归矩阵：[requirements-traceability.md](requirements-traceability.md)

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
