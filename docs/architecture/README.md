# FridgeBoard 架构概览

状态：P0 架构基线已确认  
更新日期：2026-07-19

## 目标与范围

FridgeBoard 是部署于 `fridge.flycn.fyi` 的家庭冰箱管理服务。手机 PWA 负责录入、食谱和管理；Kindle DP75SDI 使用其体验版浏览器作为低频冰箱屏。Kindle 浏览器能力、Agnes 识别与扫码兼容性属于开发阶段 Spike，不在架构上假设现代浏览器特性可用。

首版以轻量、单服务器和单家庭低并发为约束：不使用 PostgreSQL、Redis、消息队列、对象存储或第三方监控平台。

## 运行形态

```text
手机 PWA / Kindle 浏览器
             │ HTTPS
             ▼
Nginx Proxy Manager（fridge.flycn.fyi）
             │ Docker proxy 网络
             ▼
FridgeBoard 单容器、单 FastAPI 进程
  ├─ React/Vite PWA 构建产物与 API（同域）
  ├─ SQLite 数据卷（WAL）
  ├─ 已确认的自定义图标数据卷
  ├─ 临时 AI 图片目录
  └─ 进程内单调度器
             │ 私有 Docker 网络
             ▼
app.flycn.fyi（既有用户身份源）
```

- 源码中前端与 FastAPI 服务端分离；生产环境打包为一个镜像，以保证 PWA、Cookie、Service Worker 与 API 同源。
- 容器加入既有 Docker external network `proxy`，只由 Nginx Proxy Manager 访问；不映射应用端口到公网。
- 生产环境固定一个应用进程和一个副本。SQLite WAL 支持读写并存，但同一时刻只允许一个写入者；库存扣减、撤销和配对消费必须是短事务。
- 当前服务器已核实为 2 vCPU、约 2 GiB 内存、约 16 GiB 可用磁盘；P1 需为容器设置保守的资源限制并验证镜像体积。

## 身份、设备与信任边界

```text
登录所有者 ── SSO ──► FridgeBoard 管理会话 ──► 冰箱管理 / Kindle Passcode
                                    │
Kindle ── 6 位 Passcode ───────────┤──► Kindle 专属设备凭证
                                    │
已配对手机 ◄── Kindle 单次二维码 ──┴──► 手机专属设备凭证
```

| 主体 | 凭证与权限 |
| --- | --- |
| flycn 活跃用户 | 可通过 SSO 成为冰箱所有者；创建、软删除与恢复冰箱，管理设备和布局，生成 Kindle Passcode。 |
| 已配对手机 | 无需登录；凭独立设备凭证访问该冰箱的全部日常库存、食谱和数量操作；不能管理冰箱、设备、布局或 Kindle Passcode。 |
| Kindle | 凭独立设备凭证显示和低频同步指定冰箱、调整数量、生成手机配对二维码；不能执行所有者管理操作。 |

- 每台冰箱仅有一个登录所有者；首版不支持共同管理员。
- FridgeBoard 不复制 flycn 的用户表、密码哈希、会话 Cookie 或 `SECRET_KEY`。SSO 以固定回跳地址、60 秒单次授权码和 Docker 私网兑换接口实现。
- 为降低复杂度，flycn 只在 FridgeBoard 登录时验证用户；已建立的管理会话不会因 flycn 改密码、改角色或禁用账户而立即撤销。
- Kindle Passcode 为服务端加密随机生成的 6 位数字、单次使用、5 分钟有效，并对失败尝试限流。它创建新冰箱或绑定手机选定的已有冰箱。
- Kindle 手机配对二维码为单次使用、10 分钟有效。到期或被使用后 Kindle 自动关闭二维码页面，不自动生成新的有效二维码。
- 所有设备凭证均可由所有者撤销；设备清除浏览器数据后须重新配对。

## 数据、媒体与备份

- SQLite 是唯一业务数据库，使用独立持久卷和 WAL。通过 SQLAlchemy/Alembic 保持未来迁移到 PostgreSQL 的边界，但首版不部署 PostgreSQL。
- 数据库保存冰箱、所有者 flycn 用户 ID、布局、库存批次、食谱、设备、配对会话、Push 订阅、调度执行记录和软删除状态。
- AI 拍照识别原图仅在本次任务中临时保存；识别成功、失败或超时即删除，最长保留 10 分钟，不进入备份。
- AI 生成的小类图标仅在用户确认选用后持久保存；未选用候选立即删除。确认图标进入备份范围。
- 删除冰箱时立即撤销全部设备凭证并软删除数据；30 天内仅所有者可恢复，随后由调度器永久清理。
- 服务器每天创建数据库一致性备份与持久资产快照，保留 7 天；所有者在升级前及至少每月手工下载一份到本机硬盘。临时图片不备份。

## 同步、通知与运维

- 单容器内调度器执行每日 Web Push、过期 Passcode/二维码清理、30 天软删除清理和临时图片兜底清理。每次执行写入 SQLite 幂等记录，重启后的补执行不得重复发送通知。
- Kindle 正常每日同步、手动刷新；页面运行时失败每 30 分钟重试，唤醒时补同步。服务端以最后成功同步/心跳判断设备健康。
- Web Push 使用标准 VAPID 配置；手机 PWA 的订阅和提醒时间属于该手机设备。无法订阅或推送失败时保留应用内状态，不阻塞库存功能。
- 可观测性仅包括结构化容器日志、`/healthz`、调度记录、AI/Push 失败记录与手机端 Kindle 最后同步状态；不接入第三方分析或监控。
- GitHub Actions 在主分支推送后运行测试与构建，随后部署到 `/opt/fridgeboard`。发布前创建持久数据快照，启动后通过健康检查确认；迁移必须前向兼容，不自动执行危险回滚。

## ADR 与已知风险

- [ADR 索引](adr/README.md)
- [产品与可行性基线](../functional-design-and-feasibility.md)
- 高风险 Spike：Kindle DP75SDI 长期运行与体验版浏览器、Agnes 多语言包装识别与临时 URL、iOS/Android PWA Web Push 与扫码、AI 图标一位黑白可读性、食谱解析与扣减事务。
