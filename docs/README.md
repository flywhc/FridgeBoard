# FridgeBoard 文档入口

更新时间：2026-08-29

本文档是文档导航和维护规则，不承载产品细节。当前首版需求已经完成并验证；新增功能或行为变更时，先更新需求编号和回归场景，再进入实现。

## 先读什么

| 目的 | 文档 |
| --- | --- |
| 了解当前产品必须具备什么 | [产品需求基线](product-requirements.md) |
| 回归测试和人工验收 | [需求追踪与回归矩阵](requirements-traceability.md) |
| 了解当前状态和下一步工作 | [开发计划与维护规则](development-execution-plan.md) |
| 实现或调整界面 | [UI 设计规范](ui-design-specification.md)、[最终 UI 注册表](final-ui-designs.md) |
| 查阅完整功能规则 | [功能设计与可行性分析](functional-design-and-feasibility.md) |
| 查阅架构约束 | [架构概览](architecture/README.md)、[ADR 索引](architecture/adr/README.md) |
| 查阅移动端发布 | [移动端部署设计](mobile-deployment-design.md) |
| 查阅版本变更 | [发布记录](releases/) |

## 文档职责

- `product-requirements.md` 是当前产品行为的唯一摘要基线。它只写已确认、可观察、可验收的需求，并为每条需求分配稳定 ID。
- `requirements-traceability.md` 是需求到回归场景、自动化检查和人工验收的索引。新增行为必须在这里增加或更新场景。
- `functional-design-and-feasibility.md` 保留完整业务规则、边界和可行性说明；与摘要冲突时，先修正两者，不在代码中自行解释冲突。
- `development-execution-plan.md` 只保留当前维护流程、质量门禁和可领取工作，不记录逐会话流水账。
- `progress-tracker.md` 只保留当前状态和最近会话摘要。旧会话在 [archive/progress-tracker-history.md](archive/progress-tracker-history.md)。
- `architecture/` 保存稳定的系统边界和架构决策；已经接受的 ADR 不重复写入进度日志。
- `ui-assets/` 保存设计导出物，不作为需求正文；具体页面必须通过需求 ID 或场景 ID 引用。
- `archive/` 只保存历史过程材料。归档内容可追溯，但不作为新增实现的默认依据。

## 需求变更流程

1. 在 `product-requirements.md` 新增或修改 `PR-*` 条目，写清范围、约束和验收结果。
2. 在 `requirements-traceability.md` 增加对应 `RG-*` 回归场景，标明自动化检查和人工步骤。
3. 若涉及 UI，先更新或登记设计资产；若涉及架构、数据、认证或部署，新增或更新 ADR。
4. 开始代码修改前，在 `progress-tracker.md` 记录目标、范围、基线和预期验证。
5. 完成后只在进度文档记录摘要、验证证据和未验证项；详细过程放入归档或关联提交。

## 当前基线

- 功能包 P0-P13 及后来补充的冰箱管理、通用物品分类、三主题图标、食谱/购物、PWA 与 Capacitor 移动端能力均已完成并验证。
- 生产与移动端发布流程以 `docs/mobile-deployment-design.md` 和发布记录为准；版本号、release 号、签名和部署证据不在需求文档中重复维护。
- 维护模式下，“完成”不等于停止回归。每次代码、依赖、发布配置或外部服务变更，都必须执行受影响的 `RG-*` 场景。
