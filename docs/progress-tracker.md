# FridgeBoard 开发进度看板

更新时间：2026-07-30
规则：每次会话只更新自己领取的任务；状态变化必须附带会话记录与验证证据。

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
| P2 | 领域模型、迁移与核心规则 | 完成 | P1 | 2026-07-19 P2 领域会话 | Alembic `20260719_01`、15 项测试 |
| P3 | 无账号配对与设备授权 | 完成 | P1、P2 | 2026-07-23 P3 验收 | 首次冰箱端二维码、PWA 登录/本地领取、设备撤销/重配对、自动续期与 UI 验证；P11 补真实手机扫码验收 |
| P4 | 冰箱模板、布局配置与位置选择 | 待评审 | P2、P3 | 2026-07-25 布局区域流光线会话 | 已有冰箱的名称、布局和分格编辑现复用新建冰箱两步配置流程；布局预览选中区域已替换为流光线动画，待人工评审动效节奏。 |
| P5 | 库存、分类与图标库 | 待评审 | P2、P4 | 2026-07-30 全局输入框焦点样式收敛会话 | 录入、图库、位置确认、编辑和库存列表页均接入共享 `PageShell`；所有输入框聚焦时统一移除蓝色 outline 和阴影。 |
| P6 | 相机、条码与 AI 增量识别 | 待评审 | P1、P3、P5 | 2026-07-30 手机页面顶部标题栏统一会话 | 添加食材和扫码页面接入固定共享顶部栏与独立滚动内容区；既有识别提示和交互逻辑不变。 |
| P7 | 手机端日常首页与冰箱管理 | 待评审 | P3、P4、P5 | 2026-07-30 首页“n件食材”图标优化会话 | 首页顶部库存入口已将方块文本图标替换为食物 SVG；前端测试、lint、构建、差异检查和 320/390/430px 布局核验通过，待人工评审。 |
| P7.1 | 冰箱资料、已有布局与删除 | 待评审 | P4、P7、P10 | 2026-07-30 手机页面顶部标题栏统一会话 | 冰箱管理、最近删除、删除确认、名称与布局和布局编辑页复用 `PageShell`；二级页左上角均为返回按钮。 |
| P8 | 冰箱端显示设备视图与低频同步 | 进行中 | P3、P4、P5 | 2026-07-28 Kindle `/fridge` 二维码页恢复会话 | DP75SDI 已实机验收首次二维码页；后续所有 Kindle 页面须采用 ES5/XHR 和基于实际视口的自适应尺寸。 |
| P9 | 食谱、动态补货与库存扣减 | 待评审 | P2、P5 | 2026-07-30 手机页面顶部标题栏统一会话 | 食谱导入、补货、历史、历史详情和编辑页接入共享 `PageShell`；周视图保留既有共享顶部栏和底部导航，业务行为不变。 |
| P10 | 提醒、同步与设备健康 | 待评审 | P7、P8、P9 | 2026-07-23 P10 实现会话 | 提醒设置与每日去重审计、服务端显示设备成功同步时间、应用内提醒与前台系统通知增强、30 分钟可见态重试；37 项后端测试、lint/build、390/320/430px 核验通过；真实 iOS/Android Web Push 与目标设备断网恢复仍待验收 |
| P10.5 | AI 小类图标生成与审核 | 未开始 | P5、P10 | 待领取 | 先完成生成格式、审核、存储与墨水屏可读性的短方案 Spike，再实现四候选确认与资产清理 |
| P11 | 端到端验收与发布准备 | 待评审 | P3、P6、P8、P9、P10、P10.5 | 2026-07-30 最新版本生产发布 | Android Chrome 未派发 `beforeinstallprompt` 时仍展示浏览器菜单安装步骤；最新版已发布，真实 Android Chrome/iOS 设备验收仍待完成 |

## 会话记录

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
