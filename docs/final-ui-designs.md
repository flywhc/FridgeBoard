# FridgeBoard 最终 UI 设计图注册表

状态：已确认、冻结  
更新日期：2026-07-20  
Superdesign 团队：`1c67a13c-ee05-44c2-be6f-de4272cfa757`

本表保存设计阶段返回的**直接预览 URL**，用于后续独立会话实现与视觉核验。相同场景如有历史或探索版本，仅使用本表版本。

## 获取规则

1. 实现前按场景打开本表的 `Preview URL`，并同时阅读 [功能设计与可行性分析](functional-design-and-feasibility.md) 的对应规则。
2. 预览链接可访问但需要结构细节时，在具备 Superdesign CLI 权限的会话中执行 `npx --yes @superdesign/cli@latest get-design --draft-id <ID> --json`；先按 Superdesign skill 检查 CLI 和登录状态。
3. 预览与 CLI 均不可用时，记录为外部设计资产访问阻塞，向用户报告 ID、URL 和错误；不得自行重画或替换界面。
4. 实现完成后，以对应 URL 截图进行视觉核验，并在任务交接中记下草稿 ID。

## 冰箱端显示设备

本端页面面向各种竖屏显示设备；Kindle 仅是一个典型兼容设备示例，不代表页面或产品名称。

| 场景 | 草稿 ID | Preview URL |
| --- | --- | --- |
| 拟物冰箱首页 | `620a23a7-f6f1-446f-b877-f05317a2c0a2` | https://p.superdesign.dev/draft/620a23a7-f6f1-446f-b877-f05317a2c0a2 |
| 分区详情与拿走操作 | `11377443-ce1a-49d7-8c87-9860db491c17` | https://p.superdesign.dev/draft/11377443-ce1a-49d7-8c87-9860db491c17 |
| 已配置冰箱的配对二维码 | `8b177d38-c76d-47d6-b015-cb04fe1ee984` | https://p.superdesign.dev/draft/8b177d38-c76d-47d6-b015-cb04fe1ee984 |
| 首次开机、未配置状态 | `74a1eaf3-b877-4a4f-baf9-c9960febfbd7` | https://p.superdesign.dev/draft/74a1eaf3-b877-4a4f-baf9-c9960febfbd7 |

## 手机端：安装、建冰箱与录入

| 场景 | 草稿 ID | Preview URL |
| --- | --- | --- |
| iOS 浏览器安装引导 | `f616c336-1e64-4721-800d-6fc75c4cb776` | https://p.superdesign.dev/draft/f616c336-1e64-4721-800d-6fc75c4cb776 |
| Android 浏览器安装引导 | `0a461204-851c-4b9c-aeed-da6e2cdded37` | https://p.superdesign.dev/draft/0a461204-851c-4b9c-aeed-da6e2cdded37 |
| PWA 自动配对成功 | `e6f22671-6891-4b4f-8d3d-26d7cfcc9d67` | https://p.superdesign.dev/draft/e6f22671-6891-4b4f-8d3d-26d7cfcc9d67 |
| 创建冰箱：名称与模板 | `7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d` | https://p.superdesign.dev/draft/7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d |
| 冰箱布局预览 | `e5c35dea-610f-42f9-878b-1f716c2e7d4f` | https://p.superdesign.dev/draft/e5c35dea-610f-42f9-878b-1f716c2e7d4f |
| 布局分格编辑 | `145b32f6-007a-4698-9ea7-3963dfc04a38` | https://p.superdesign.dev/draft/145b32f6-007a-4698-9ea7-3963dfc04a38 |
| 添加食材：识别与基础信息 | `e4a227ed-0c1c-4f72-8ed0-0af7ab18d668` | https://p.superdesign.dev/draft/e4a227ed-0c1c-4f72-8ed0-0af7ab18d668 |
| 确认位置与数量 | `0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8` | https://p.superdesign.dev/draft/0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8 |
| 小类图库 | `284a5039-9042-484e-b683-b8504875a7e4` | https://p.superdesign.dev/draft/284a5039-9042-484e-b683-b8504875a7e4 |
| 自定义小类与 AI 图标确认 | `eabace7d-43c5-4326-901f-eaf29b04fda7` | https://p.superdesign.dev/draft/eabace7d-43c5-4326-901f-eaf29b04fda7 |
| AI 识别结果与冲突确认 | `36284a96-d2ad-4fce-96b8-c59af859dc8d` | https://p.superdesign.dev/draft/36284a96-d2ad-4fce-96b8-c59af859dc8d |
| 编辑既有食材 | `7224e71b-8055-40ec-a9a9-db68b6744764` | https://p.superdesign.dev/draft/7224e71b-8055-40ec-a9a9-db68b6744764 |

## 手机端：日常使用、食谱与管理

| 场景 | 草稿 ID | Preview URL |
| --- | --- | --- |
| 当前冰箱首页 | `23329191-d0fa-48ca-a517-fee9ff3eab9b` | https://p.superdesign.dev/draft/23329191-d0fa-48ca-a517-fee9ff3eab9b |
| 本周/下周食谱 | `b2e77ba8-52dd-4722-8e89-accdf9f3569f` | https://p.superdesign.dev/draft/b2e77ba8-52dd-4722-8e89-accdf9f3569f |
| 粘贴食谱导入 | `ef62678e-0a73-431a-93c6-794f646f5c74` | https://p.superdesign.dev/draft/ef62678e-0a73-431a-93c6-794f646f5c74 |
| 单日食谱编辑 | `bbeda1ae-e99c-40d6-87b3-90cdedd7adfa` | https://p.superdesign.dev/draft/bbeda1ae-e99c-40d6-87b3-90cdedd7adfa |
| 动态补货清单 | `903728d2-d6b9-4918-82b5-9d3ab6b3aafb` | https://p.superdesign.dev/draft/903728d2-d6b9-4918-82b5-9d3ab6b3aafb |
| 冰箱管理与设备访问 | `1bfa869c-6942-4c89-b275-83e9a02c04e1` | https://p.superdesign.dev/draft/1bfa869c-6942-4c89-b275-83e9a02c04e1 |
| 我的冰箱切换 | `6e7893ee-74d5-4aa4-9db4-45be02e7f9b5` | https://p.superdesign.dev/draft/6e7893ee-74d5-4aa4-9db4-45be02e7f9b5 |
| 提醒设置 | `4a046922-ecdb-4d7b-8836-2c022283f6b5` | https://p.superdesign.dev/draft/4a046922-ecdb-4d7b-8836-2c022283f6b5 |
| 临期规则设置 | `c24f9644-0bd1-493a-979e-2d0218e3a6cc` | https://p.superdesign.dev/draft/c24f9644-0bd1-493a-979e-2d0218e3a6cc |
