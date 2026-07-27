# FridgeBoard 开发进度看板

更新时间：2026-07-27
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
| P1 | 工程骨架与质量门禁 | 完成 | P0 | 2026-07-19 P1 工程会话 | [README](../README.md)、[项目约定](../AGENTS.md)、CI 配置 |
| P2 | 领域模型、迁移与核心规则 | 完成 | P1 | 2026-07-19 P2 领域会话 | Alembic `20260719_01`、15 项测试 |
| P3 | 无账号配对与设备授权 | 完成 | P1、P2 | 2026-07-23 P3 验收 | 首次冰箱端二维码、PWA 登录/本地领取、设备撤销/重配对、自动续期与 UI 验证；P11 补真实手机扫码验收 |
| P4 | 冰箱模板、布局配置与位置选择 | 待评审 | P2、P3 | 2026-07-25 布局区域流光线会话 | 已有冰箱的名称、布局和分格编辑现复用新建冰箱两步配置流程；布局预览选中区域已替换为流光线动画，待人工评审动效节奏。 |
| P5 | 库存、分类与图标库 | 待评审 | P2、P4 | 2026-07-26 添加食材入口交互调整 | 移除条码手输入口，名称行图标与 SVG chevron 进入小类图库，删除重复小类行和图库关闭按钮；名称下划线仅覆盖输入框；build、git diff --check、Playwright 320/390/430px 通过，lint 受基线报错阻塞 |
| P6 | 相机、条码与 AI 增量识别 | 待评审 | P1、P3、P5 | 2026-07-27 添加食材相机按需开启会话 | 取景框改为 16:9；相机默认关闭，取景框内提示“识别物品和条码”，点击后才申请权限并启动预览/条码识别；lint、build、diff check 与 Playwright 320/390/430px 核验通过，待人工评审。 |
| P7 | 手机端日常首页与冰箱管理 | 待评审 | P3、P4、P5 | 2026-07-27 首页标题与刷新按钮纠正会话 | 修正共享顶部栏标题：首页中间直接显示当前冰箱名称，移除内容区重复标题；刷新按钮仍位于“n件食材”状态行；lint/build、git diff --check、Playwright 320/390/430px 核验通过，待人工手机 PWA 验收。 |
| P7.1 | 冰箱资料、已有布局与删除 | 待评审 | P4、P7、P10 | 2026-07-25 布局区域流光线会话 | 已有冰箱的名称、布局和分格编辑现复用新建冰箱两步配置流程；布局预览选中区域已同步为流光线反馈，待人工评审动效节奏。 |
| P8 | 冰箱端显示设备视图与低频同步 | 待评审 | P3、P4、P5 | 2026-07-25 全页面排版统一会话 | 冰箱端字体层级已统一为 34px 标题、18px 正文/标签、16px 辅助信息；build 和 540×720px 核验通过。 |
| P9 | 食谱、动态补货与库存扣减 | 待评审 | P2、P5 | 2026-07-27 食谱底部导航刀叉图标会话 | 将共享底部工具栏“食谱”图标替换为明确的刀叉 SVG；不改变导航行为、文字和热区；lint/build、git diff --check、Playwright 320/390/430px 核验通过，390×844 截图已保存，待人工手机 PWA 验收。 |
| P10 | 提醒、同步与设备健康 | 待评审 | P7、P8、P9 | 2026-07-23 P10 实现会话 | 提醒设置与每日去重审计、服务端显示设备成功同步时间、应用内提醒与前台系统通知增强、30 分钟可见态重试；37 项后端测试、lint/build、390/320/430px 核验通过；真实 iOS/Android Web Push 与目标设备断网恢复仍待验收 |
| P10.5 | AI 小类图标生成与审核 | 未开始 | P5、P10 | 待领取 | 先完成生成格式、审核、存储与墨水屏可读性的短方案 Spike，再实现四候选确认与资产清理 |
| P11 | 端到端验收与发布准备 | 进行中 | P3、P6、P8、P9、P10、P10.5 | 2026-07-27 PWA 安装能力会话 | 已开始补齐 manifest、图标、Service Worker 和浏览器安装入口；真实 iPhone/Android 安装验收仍待完成 |

## 会话记录

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
