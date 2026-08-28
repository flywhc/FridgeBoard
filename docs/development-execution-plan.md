# FridgeBoard 开发计划与维护规则

状态：首版开发完成；当前进入维护和增量需求模式
更新时间：2026-08-29
历史执行计划：[archive/development-execution-plan-history.md](archive/development-execution-plan-history.md)

本文档不再按 P0-P13 记录已经完成的实施过程。任务包历史和逐会话证据已归档；日常开发只需要遵守以下流程。

## 1. 当前状态

| 范围 | 状态 | 现行入口 |
| --- | --- | --- |
| 核心产品：冰箱、库存、分类、食谱、补货、提醒 | 已完成并验证 | `PR-001` 至 `PR-062` |
| 配对、权限、冰箱端同步和设备兼容 | 已完成并验证 | `RG-003`、`RG-012` |
| 三主题、图标来源和自定义小类 | 已完成并验证 | `RG-006`、`RG-007`、`RG-013` |
| PWA、Capacitor、Android/iOS 构建与发布 | 已完成并验证 | `RG-001`、`RG-013`、`RG-015` |
| 架构、安全、日志、备份和单实例边界 | 已完成并验证 | `architecture/`、`RG-014` |
| 新增需求 | 待领取 | 先登记 `PR-*` 和 `RG-*` |

## 2. 新需求实施流程

### 2.1 领取前

1. 阅读 [文档入口](README.md)、相关 `PR-*`、`RG-*`、UI 资产和 ADR。
2. 判断是新需求、行为变更、缺陷修复还是纯文档/样式调整；不要把微小视觉修复升级为新的产品包。
3. 在 `progress-tracker.md` 新增进行中记录，写明目标、范围、需求基线、预期验证和未修改的边界。

### 2.2 实施中

- 新功能或行为变更先补能失败的自动化用例；复杂问题使用系统化排查。
- UI 修改必须先读 `ui-design-specification.md`，再读对应功能规则、`final-ui-designs.md` 和本地 PNG/HTML。
- 数据、认证、日志、调度、外部服务或部署变更必须同步检查 ADR 和安全/运维规则。
- 保留无关工作区改动，不在任务中顺手重写应用架构或历史文档。

### 2.3 完成时

1. 更新 `product-requirements.md`、`requirements-traceability.md` 和受影响的详细文档。
2. 运行与风险匹配的自动化门禁；发布或外部设备任务补充人工证据。
3. 将 `progress-tracker.md` 标为完成、待评审或阻塞，并写验证命令、未验证项和下一步。
4. 需要长期保留的架构决策写 ADR；会话过程不要继续堆进主文档。

## 3. 任务记录模板

```text
任务：<简短名称>
需求：PR-xxx
回归：RG-xxx
状态：进行中 / 待评审 / 完成 / 阻塞
目标：<可观察结果>
范围：<文件、模块和不改变的边界>
验证：<命令或人工步骤及结果>
未验证：<原因；没有则写“无”>
下一步：<后续动作；没有则写“无”>
```

## 4. 质量门禁

后端：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`。

前端：`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`、`npm run --prefix frontend build`。

发布：`docker build --tag fridgeboard:local .`、发布脚本语法检查、dry-run、数据库备份、健康检查、产物元数据和敏感文件扫描。完整命令与回归场景见 [需求追踪与回归矩阵](requirements-traceability.md)。

## 5. 计划边界

- 需求完成后的日常工作是回归、缺陷修复、依赖/安全更新和用户明确提出的新需求，不重新打开已完成的 P 包。
- 只有出现架构边界变化、数据模型变化、公开接口变化或新的持续运维责任时，才新增 ADR 或专项设计文档。
- 旧 P0-P13 计划只用于追溯原始实施顺序，不用于判断新任务是否可以开始；新任务以 `PR-*`、`RG-*` 和当前代码为准。
