# Kindle DP75SDI 能力 Spike

状态：已完成首轮 DP75SDI 实机诊断，并合并 2026-07-28 既有 Spike 结果；后续所有 Kindle 页面按本基线实现。

## 适用范围

本基线适用于所有冰箱端 Kindle 页面，不仅是二维码页，包括首次绑定、等待布局、冰箱首页、分区详情、补货清单、已配置设备添加手机、错误/离线/撤销状态和六位绑定码页。

这些页面必须共享同一套兼容性约束；不能因为某一页“看起来简单”就重新引入 React、ES Module、Flex/Grid、Promise、fetch 或 URL API。

所有 Kindle 页面都必须保证外层内容区和顶部操作行左右各至少 `20px` 的实机可见留白；这是 DP75SDI 的统一验收要求，不是仅针对首页的局部样式。

顶部栏统一尺寸基线：冰箱首页已验证使用 `72px` 操作单元格和 `60px` 图标；其他页面若使用 `112px` 操作单元格，即使页面外层只有 `20px` 留白，图标居中后仍会额外向内缩进约 `26px`，表现为右上角按钮离屏幕右侧过远。因此所有 Kindle 页面必须统一使用 `72px` 左右操作单元格和 `60px` 图标；食谱页不得再使用 `42px` 顶部图标特例。

## 使用方式

生产环境的老设备兼容入口为：

```text
https://kindle.flycn.fyi/
```

该域名由 NPM 在根路径内部重写到应用的 `/fridge`，因此 Kindle 不需要手工输入路径；
原有 `/fridge` 及其子路径仍保留用于调试和兼容。

局域网实机测试不需要发布：启动本地后端和 Vite 后，在 Kindle 输入
`http://电脑局域网IP:7001/k`。`/k` 是本 Spike 的短入口，直接显示页边距对比；当前电脑的局域网地址可用 `ipconfig getifaddr en0` 或 `ifconfig` 查看。

在 Kindle 上直接打开原二维码地址：

```text
/fridge
```

当前 `/fridge` 恢复为正常二维码绑定页。需要复测诊断页时打开 `/fridge?spike=1`。诊断页只读检测浏览器能力，不请求绑定接口，不修改设备或业务数据。

## 检测项

| 类别 | 检测内容 | 判定方式 |
| --- | --- | --- |
| HTML | 标题、段落、链接、表格、`<font size>` | 页面是否完整显示，传统字号是否明显大于普通字号 |
| CSS | 外链 class、内联 style、px 字号、颜色、边框、padding、margin、inline-block | 每个样例是否出现预期外观 |
| 页边距实现 | 父元素 padding、子元素 margin、计算宽度、table 空白单元格、inline-block、HTML 不换行空格 | 诊断页“页边距实现对比”中，黑色内容是否稳定从灰色边界内缩 10px；正式页面采用实机确认的写法并内缩 20px |
| CSS 布局 | table、inline-block、float、Flex、Grid | 对比块是否按标签说明排列；不以 Flex/Grid 为必要条件 |
| CSS 条件 | `@media`、`getComputedStyle` | 页面输出检测结果，结合样例人工确认 |
| JavaScript | ES5 函数、DOM 创建/修改、事件、JSON、定时器 | 自动输出 `PASS` 或 `FAIL` |
| Web API | XMLHttpRequest、Canvas、SVG、localStorage、URL、Promise、fetch | 自动输出 `PASS` 或 `FAIL`；XHR 仅检测构造能力，不发送请求 |
| 兼容性禁区 | ES6 箭头函数、`const`/`let`、模块、Promise、fetch、URL API | 以源码约束和运行时 `typeof` 结果记录，不作为页面必要能力 |

## 记录格式

在 DP75SDI 上记录：

- 设备型号、固件/浏览器 User-Agent、视口宽高。
- 若诊断页提供版本标识，记录其内容；正常生产页面不要求显示时间戳。
- 每个视觉样例是否符合标签说明。
- 自动检测列表中 `PASS`/`FAIL`/`UNKNOWN`。
- 3:4 截图，必要时补充滚动后截图。

真实设备结果完成后，将本文件的“结果”表和功能设计 §12.4 的能力基线同步更新。

## 结果

| 日期 | 设备/视口 | 结果 | 证据 |
| --- | --- | --- | --- |
| 2026-08-08 | DP75SDI / 约 3:4 竖屏 | 已完成首轮诊断 | 用户提供实机截图；版本时间 `2026-08-08 01:42:08 CST` |

### 首轮实机结论

- 外链 CSS 生效：诊断页的外链 CSS 样例边框、背景和布局样式可见。
- 内联 CSS 生效：内联样例的边框、padding 和字号差异可见，但 px 字号增大幅度不如传统 HTML 字号稳定。
- 传统 `<font size>` 生效且最可靠：截图中传统 font 样例明显大于普通文字。这解释了绑定页多次调整 CSS `font-size` 但肉眼几乎不变，最后改用 `<font size>` 后才明显变大。
- 基础 table 和 DOM/ES5/JSON/XHR/Canvas/SVG/localStorage 可用。
- `matchMedia` 检测为 PASS，但不能据此把现代响应式布局作为必要条件，仍需使用基础 CSS 降级。
- Flex 属性声明检测为 FAIL，Grid 属性声明检测为 FAIL；不得依赖 Flex/Grid 作为 Kindle 页面关键布局。
- URL、Promise、fetch 检测为 FAIL；继续禁止在 Kindle 页面使用 URL API、Promise 和 fetch。

### 页边距 Spike 使用说明

打开 `/fridge?spike=1` 后向下滚动到“页边距实现对比”。每个灰色框代表相同的边界，黑色内容代表实际内容起点；重点记录以下方式在 DP75SDI 上是否都能看见稳定的左右内缩：

- 父元素 inline `padding-left/right`。
- 子元素 inline `margin-left/right`。
- JavaScript 计算像素宽度后设置 `margin-left`。
- table 两侧固定宽度空白单元格。
- inline-block 计算宽度后设置 `margin-left`。
- 传统 HTML 不换行空格。

本次 Spike 的目标不是直接选择现代浏览器中最“漂亮”的实现，而是确定 DP75SDI 上实际可见且不被屏幕边框覆盖的最低兼容方案。完成实机截图后，将通过结果表记录有效方式、视口、User-Agent 和截图证据。

### 既有 Spike 经验合并

2026-07-28 在 DP75SDI Kindle Paperwhite 实机验证过的结论继续有效：

- User-Agent 为 AppleWebKit `534.26+` 的实验性浏览器；不能按现代 Safari/Chrome 或 Fire/Silk 能力实现。
- 基础 DOM、JSON、Canvas、SVG、localStorage、Cookie 和 XMLHttpRequest 可用；曾实际请求 `/api/devices/current` 并收到 HTTP 401，说明 XHR 数据链路可工作，认证失败也必须显示为可读错误。
- Promise、fetch、ES Module、URL/URLSearchParams、箭头函数、`const`/`let` 不可用；不能只依赖 lint，必须保持源码级 ES5。
- 二维码使用服务端 PNG/SVG；不能依赖现代二维码 JavaScript 库或浏览器 BarcodeDetector。
- 所有 XHR 必须有超时、网络错误和非 2xx 状态显示；不得静默无限轮询或白屏。
- 首屏在 JavaScript 执行前必须已有标题、状态或错误说明；异步请求失败不能让页面只剩空挂载点。
- 旧版 Vite dev server 的 SPA fallback 可能绕过后端 Kindle 路由并返回 React 模块入口；实机 Spike 必须使用后端/构建产物的静态路由，不能把错误入口当作 Kindle 能力结果。

### 所有 Kindle 页面强制实现规则

1. 使用独立的 ES5 HTML 页面壳和 `XMLHttpRequest` 数据层；不得加载 React、Vite 模块、`type="module"` 或动态导入。
2. 页面初始 HTML 必须直接提供可读标题、当前状态或错误说明；不得把唯一内容放在异步成功回调或 React 挂载点。
3. JavaScript 仅使用 ES5 语法：禁止箭头函数、`const`/`let`、Promise、fetch、URL/URLSearchParams、模块语法和未实测的现代 API。
4. 页面骨架使用普通块级元素、table、inline-block 和传统 HTML；不要依赖 Flex/Grid。需要左右分栏时优先使用 table。
5. 关键中文字号优先使用传统 `<font size="4|5">` 或同等传统 HTML 兜底；CSS px 只作为增强，不作为可读性门槛。
6. 刷新图标沿用手机端的 SVG 兼容规则：`24×24` viewBox、`overflow: visible`、`vertical-align: middle`、圆角描边；圆弧和箭头使用两条独立 path（圆弧 `M20 11a8 8 0 1 0 2.1 5.4`、箭头 `M20 4v7h-7`），所有 Kindle 页面共用同一套垂直对齐，不得给单个刷新按钮增加页面级位移。
7. 外链 CSS 和内联 CSS 都可以使用，但关键视觉尺寸必须通过 DP75SDI 实机截图确认；不能仅凭现代浏览器开发者工具判断。
8. 二维码由服务端提供 PNG/SVG；不得在 Kindle 页面引入现代二维码 JavaScript 库或 BarcodeDetector。
9. 所有 XHR 必须设置超时，并处理网络错误、空响应、非 2xx 状态、过期和撤销；轮询失败必须显示重试入口，不得静默无限重试。
10. 页面所有关键状态必须有可读的加载、成功、错误、离线、过期和撤销反馈；单项功能失败不能导致白屏。
11. 每个页面完成后都要在 DP75SDI 上验证主流程和 3:4 竖屏截图；自动化测试通过不等于 Kindle 验收完成。

版本时间戳只用于本次能力 Spike 的历史诊断证据，不是生产 Kindle 页面要求；正常页面不显示时间戳，静态资源也不依赖 query 版本参数。
