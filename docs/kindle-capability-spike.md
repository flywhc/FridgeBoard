# Kindle DP75SDI 能力 Spike

状态：已完成首轮 DP75SDI 实机诊断，并合并 2026-07-28 既有 Spike 结果；后续所有 Kindle 页面按本基线实现。

## 适用范围

本基线适用于所有冰箱端 Kindle 页面，不仅是二维码页，包括首次绑定、等待布局、冰箱首页、分区详情、补货清单、已配置设备添加手机、错误/离线/撤销状态和六位绑定码页。

这些页面必须共享同一套兼容性约束；不能因为某一页“看起来简单”就重新引入 React、ES Module、Flex/Grid、Promise、fetch 或 URL API。

## 使用方式

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
6. 外链 CSS 和内联 CSS 都可以使用，但关键视觉尺寸必须通过 DP75SDI 实机截图确认；不能仅凭现代浏览器开发者工具判断。
7. 二维码由服务端提供 PNG/SVG；不得在 Kindle 页面引入现代二维码 JavaScript 库或 BarcodeDetector。
8. 所有 XHR 必须设置超时，并处理网络错误、空响应、非 2xx 状态、过期和撤销；轮询失败必须显示重试入口，不得静默无限重试。
9. 页面所有关键状态必须有可读的加载、成功、错误、离线、过期和撤销反馈；单项功能失败不能导致白屏。
10. 每个页面完成后都要在 DP75SDI 上验证主流程和 3:4 竖屏截图；自动化测试通过不等于 Kindle 验收完成。

版本时间戳只用于本次能力 Spike 的历史诊断证据，不是生产 Kindle 页面要求；正常页面不显示时间戳，静态资源也不依赖 query 版本参数。
