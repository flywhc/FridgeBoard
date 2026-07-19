# FridgeBoard 开发进度看板

更新时间：2026-07-19  
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
| P3 | 无账号配对与设备授权 | 未开始 | P1、P2 | 待领取 | — |
| P4 | 冰箱模板、布局配置与位置选择 | 未开始 | P2、P3 | 待领取 | — |
| P5 | 库存、分类与图标库 | 未开始 | P2、P4 | 待领取 | — |
| P6 | 相机、条码与 AI 增量识别 | 未开始 | P1、P3、P5 | 待领取 | — |
| P7 | 手机端日常首页与冰箱管理 | 未开始 | P3、P4、P5 | 待领取 | — |
| P8 | 墨水屏端视图与低频同步 | 未开始 | P3、P4、P5 | 待领取 | — |
| P9 | 食谱、动态补货与库存扣减 | 未开始 | P2、P5 | 待领取 | — |
| P10 | 提醒、同步与设备健康 | 未开始 | P7、P8、P9 | 待领取 | — |
| P11 | Spike、端到端验收与发布准备 | 未开始 | P3、P6、P8、P9、P10 | 待领取 | — |

## 会话记录

### 2026-07-18 — 设计阶段收口

- 状态：完成
- 结果：功能设计、可行性分析与最终 UI 草稿索引已确认。
- 基线：[功能设计与可行性分析](functional-design-and-feasibility.md)，尤其是 §17.1。
- 下一任务：P0 架构与 ADR。

### 2026-07-19 — P0 架构与 ADR

- 状态：完成
- 改动：确认 `fridge.flycn.fyi` 的单容器 FastAPI/PWA、SQLite WAL、flycn SSO 桥接、Kindle/手机设备凭证、媒体留存、单调度器、备份与自动部署边界；新增架构概览和 3 份 ADR。
- 验证：通过 SSH 只读核实服务器为 2 vCPU、约 2 GiB 内存、约 16 GiB 可用磁盘；既有 Nginx Proxy Manager 与 Docker `proxy` 网络可复用。
- 未验证：Kindle DP75SDI 体验版浏览器、Agnes、扫码与 Web Push 兼容性保留至对应 Spike。
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
