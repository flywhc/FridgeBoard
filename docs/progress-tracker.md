# FridgeBoard 开发进度

更新时间：2026-08-31
状态：0.2.0 服务器与 Android APK 已发布；主 chunk 体积 warning 修复完成；页面缓存与静默后台刷新优化、用户级共享分类与图标一致性修复、小类所属大类切换、自定义图标持久缓存和购物车自动识别类别待评审
历史记录：[archive/progress-tracker-history.md](archive/progress-tracker-history.md)
需求基线：[product-requirements.md](product-requirements.md)
回归矩阵：[requirements-traceability.md](requirements-traceability.md)

## 2026-08-31 — 发布 FridgeBoard 0.2.0 到服务器与 Android APK

- 状态：完成。
- 目标：将当前 `main` 的已完成改动发布到生产服务器，并生成正式签名 Android APK；按用户要求将产品小版本号从 `0.1.9` 升级为 `0.2.0`。
- 范围：产品版本、Android `versionCode`、服务器容器/PWA、数据库备份、健康检查、GitHub Release APK 和发布文档；不提交密钥、生产数据或运行时日志。
- 设计与发布基线：`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md`、`docs/releases/v0.1.9.md`；服务器与 APK 使用同一 Git 提交和 release 标识。
- 预期验证：`uv lock --check`、后端 Ruff/pytest、前端 lint/test/build、Android 权限检查、Docker 构建、发布脚本与 workflow 契约、服务器备份/容器健康/公网健康检查、GitHub Actions APK 签名/元数据/digest 和 `git diff --check`。
- 已完成：版本升级为 `0.2.0`，提交 `927c4bce61426f8d8b7b978a458f701b2f95130e` 已推送 `origin/main` 和 tag `v0.2.0`；服务器发布 release 为 `260831185551`，镜像摘要为 `sha256:3fe7552129c541077b884335f3480187c518d3c2c624a4b5b8f582a33f979b0a`，数据库备份为 `/data/fridgeboard.db.backup-20260831-105632`。
- 验证：服务器迁移为 `20260830_32 (head)`，备份 `1,519,616` 字节、权限 `600`、属主 `appuser:appuser`，容器 `running/healthy`、重启 `0`，公网 `/healthz` 返回 `{"status":"ok"}`；同域更新接口返回版本 `0.2.0`、release `260831185551`、build `1700000014` 和 APK 摘要。GitHub Actions run `33384834652` 成功，Release [v0.2.0](releases/v0.2.0.md) 已发布 APK `FridgeBoard-0.2.0-android-1700000014.apk`，大小 `6803113` 字节，SHA-256/digest 为 `9d303f01ec0a1268395fad841c56baac18cde3bdf8bcf209454703bb2da282a1`；包内为 `com.fridgeboard.app`、`versionName=0.2.0`、`versionCode=1700000014`。`uv lock --check`、后端 Ruff/pytest（236 passed）、前端 lint/test（424 passed）/build、移动端权限检查、Docker 构建、发布脚本语法、`git diff --check` 均通过。
- 未验证：未在第二台真实 Android 设备安装本次 APK；未执行本次发布后的真实 PWA/Android WebView 人工流程验收。Actions 有既有 Node.js 20/action 弃用提示，未影响本次成功发布。

## 2026-08-31 — 修复构建主 chunk 体积 warning

- 状态：完成，未提交或发布。
- 现象：前端生产构建生成约 508.50 kB 的主入口 chunk（历史记录约 503.7 kB），Vite 报告存在超过 500 kB 的 chunk warning。
- 目标：在不改变页面行为和用户可见功能的前提下，拆分可延迟加载的重型功能，使生产构建不再产生主 chunk 体积 warning；若仍存在合理的大型独立 chunk，应记录其边界和原因。
- 范围：前端入口依赖图、二维码扫描和其他按需功能的动态导入、构建产物及相关回归测试；不通过单纯提高 warning 阈值掩盖体积问题，不改变用户图片资源。
- 设计/需求基线：现有 `frontend/vite.config.ts`、`frontend/src/main.tsx`、`frontend/src/App.tsx`、扫码流程及项目已验证的前端 lint/test/build 命令；预期验证为相关前端测试、lint、build 和 `git diff --check`。
- 已完成：库存、搜索、移动库存和食谱页面改为 React 懒加载，首页入口不再静态携带这些页面代码；PWA QR reader 改为深路径动态导入；在 Vite 8/Rolldown 构建配置中为 ZXing 增加 300 kB 分组上限，使其大型依赖拆为多个独立异步 chunk，不提高 warning 阈值。生产构建主入口由 508.50 kB 降至 380.71 kB，最大 ZXing chunk 为 98.56 kB，未再输出 chunk warning。
- 验证：`npm run --prefix frontend test -- --run`（42 个文件、419 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未在真实 PWA/Android WebView 中人工确认首次加载占位和扫码首次加载体验；未执行 Docker 镜像构建、正式发布或生产数据操作。

## 2026-08-31 — 页面缓存与静默后台刷新优化

- 状态：待评审，本地调试刷新后首页加载动画不结束的问题已修复，前端质量门禁通过。
- 现象：已有本地缓存的页面仍会因自动请求显示顶部刷新动画；数据刷新或缓存更新后可能重置当前页面并跳回首页；启动、版本更新和首页主动刷新没有形成可控的全页面静默预取链路。
- 目标：缓存可用时直接展示且不显示自动加载动画；仅主动下拉刷新或无缓存无数据时显示动画。首页缓存缺失、版本更新及首页主动刷新后，在后台依次刷新各页数据，用户进入尚未完成的页面时提升该页优先级；任何刷新都不得改变当前页面。写操作仅按影响范围更新相关缓存，并按“删除不存在则忽略、保存覆盖服务端并发修改、保存目标不存在则提示并放弃”处理冲突。
- 范围：前端页面缓存、启动与版本检测、跨页面静默预取调度、刷新状态和页面栈稳定性、受影响写操作的缓存失效/更新，以及相应自动化测试和功能文档；不改变既有页面视觉设计和用户图片内容。
- 设计/需求基线：本次用户需求、`docs/ui-design-specification.md` 的共享页面壳与刷新状态约束、现有 `pageCache.ts`/页面栈/请求 API 约定；预期先补失败用例，再运行前端定向测试、全量测试、lint、build 和 `git diff --check`。
- 已完成：缓存存在时首页、冰箱列表和食谱/购物页直接进入 `idle`，不再按缓存年龄显示动画或自动请求；跨冰箱搜索先立即展示已有缓存，仅为缺失冰箱读取数据。新增单并发页面刷新队列，首页缓存缺失或 release 变化时依次刷新当前/其他冰箱工作区、当周食谱/购物和冰箱列表，进入等待中的页面会提升优先级并复用同一请求；完整成功后才记录 release。首页下拉只等待当前工作区并停止动画，再强制安排后台全量刷新。认证复核和数据刷新不再无条件重置到首页；仅首次无缓存启动或用户明确导航会替换页面。库存搜索修改、批量删除/移动及用户级分类/图标变更会同步或重建全部受影响缓存；删除缺失资源幂等，布局并发修改按服务端最新 revision 自动覆盖，保存目标缺失时保留页面并提示。
- 文档：新增 `PR-076`、`RG-018` 和功能设计 §2.3，明确缓存写入来源、静默刷新顺序、页面栈不变量及冲突规则。
- 审查发现：后台读取可能覆盖较新的用户写入、账号切换后旧请求可能回写已清缓存、跨冰箱搜索部分失败会隐藏已有缓存，以及批量删除无法区分缺失与无权限；修复范围因此扩展到前端刷新代次/取消、缓存 mutation version、部分成功展示和后端幂等删除权限契约。
- 审查修复完成：新增统一 `PageRefreshGuard`，后台工作区、食谱、购物、搜索和冰箱列表读取均绑定账号代次、`AbortController` 与缓存 mutation version；退出、401 和切换账号会中止受控请求、废弃旧队列及在途映射，并阻止旧响应写缓存或 release。用户保存、删除、移动、分类和列表修改会提升对应 mutation version，早于写入启动的后台读取无法覆盖新状态。跨冰箱搜索改为 `Promise.allSettled`，部分失败时保留缓存/成功结果并显示警告。批量删除 API 对真正缺失 ID 幂等，对其他账号现存批次返回 403，前端移除原先吞掉权限错误的递归重试。
- 审查修复验证：定向前端守卫/页面测试 179 个通过，定向后端库存 API 14 个通过；`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（40 个文件、410 个测试通过）、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（236 个测试通过，73 条既有依赖弃用警告）和 `git diff --check` 均通过。生产构建成功，仅有主 chunk 约 503.7 kB 的体积 warning。
- 审查修复未验证：尚未在真实 PWA/Android WebView 中人工制造慢请求后切换账号、保存与后台刷新交错、部分冰箱离线和跨账号删除；未执行正式发布。
- 第二轮审查：确认冰箱概览降级请求可能在数据不完整时仍记录完整 release；用户写请求尚未全部绑定账号代次；本周/下周请求可能晚到覆盖；搜索单项保存失败会隐藏已有结果且部分失败警告不会在成功后清除。按用户要求由多个 `gpt-5.6-luna` high 子代理并行修复，主代理完成后再独立审核与全量验证。
- 第二轮修复：后台完整预取对冰箱概览启用严格模式，任一布局、库存或最近删除请求失败均不记录完整 release，普通列表仍可降级展示；App 用户写入、异步导航、设置读取、绑定与轮询统一绑定账号 operation scope 和取消信号；食谱本周/下周及冰箱切换使用请求序号与目标周双重校验，旧响应不能覆盖当前周。搜索保存失败只保留行级错误或非阻塞缺失提示，完整成功会清理旧警告。
- 主代理复审：补齐搜索页数量保存的 operation scope，账号切换会取消旧保存并阻止其更新状态、缓存和父级工作区；搜索页改为用已有冰箱缓存同步初始化首帧，避免先固定渲染 `loading` 再由 effect 切换造成顶部动画闪烁。复核后台队列、release 标记、页面优先级、写入 mutation version、删除幂等和刷新导航路径后未发现新的阻塞问题。
- 最终验证：定向前端测试 4 个文件、188 个用例通过；`npm run --prefix frontend test`（42 个文件、419 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build`、`uv run ruff check backend`、`uv run pytest`（236 个测试通过，73 条既有依赖弃用警告）、`uv lock --check` 和 `git diff --check` 均通过。生产构建仅有既有的单 chunk 超过 500 kB warning。
- 最终未验证：尚未在真实 PWA/Android WebView 中人工制造慢请求、切换账号、跨周快速切换、部分冰箱离线及保存/删除与后台刷新交错；未执行 Docker 镜像构建、正式发布或生产数据操作。
- 第三轮审查：确认食谱保存、完成、导入、复制、删除、自定义购物项和后台分类回写没有统一绑定账号 operation scope 与取消信号；食谱手动刷新会绕过同 key 后台任务，二者可用相同 mutation version 并行写缓存。关于“替换队列会令 Promise 永不结束”的表述不完全成立，旧队列仍被任务 Promise 持有且会在运行项结束后继续结算，但缺少显式取消会让 pending 的结束依赖运行项及时响应 abort。修复范围为食谱写请求守卫、手动刷新抢占提交权、队列显式取消及对应回归测试；预期重跑前端全量测试、lint、build 和 `git diff --check`。
- 第三轮修复：食谱保存、完成/撤销、导入、历史复制、删除、自定义购物项及后台分类识别回写统一创建账号 operation scope，全部网络请求复用其取消信号，并在状态、缓存、导航和后续写入前检查提交资格。手动食谱刷新先提升目标 recipe cache 的 mutation version；旧后台任务失去提交权时以 `AbortError` 结束，使全量预取不记录错误的完整 release。`PageRefreshQueue.cancel()` 会立即拒绝运行项和全部 pending Promise、清空等待项并禁止启动后续旧账号任务，认证上下文失效时在替换队列前显式调用。
- 第三轮验证：先新增失败用例并确认旧实现缺少 `cancel()`、operation scope 和手动刷新 mutation 提升；修复后定向测试 4 个文件、194 个用例通过。最终 `npm run --prefix frontend test`（42 个文件、423 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；当前生产构建已完成代码拆分，最大入口 chunk 约 381.3 kB，无 500 kB chunk warning。
- 第三轮未验证：未在真实 PWA/Android WebView 中以慢请求复现“写入中切换账号”“后台食谱刷新中下拉刷新”和“缺缓存导航时切换账号”；未执行正式发布。
- 第四轮问题记录：本地调试刷新且首页工作区缓存缺失时，`refreshState` 初始为 `loading`，但启动后的当前冰箱任务以 `visible=false` 进入静默刷新；成功和失败分支都只在 `visible=true` 时更新刷新状态，造成首页数据已显示但顶部动画永久停留。修复范围为当前工作区刷新状态结算和前端回归测试，不改变有缓存时的静默刷新规则；预期运行定向测试、前端全量测试、lint、build 和 `git diff --check`。
- 第四轮修复：`refreshWorkspace` 现在为每次调用计算 `reportRefreshState`。用户主动刷新，或当前首页缺少本地工作区缓存时，即使任务来自静默后台队列，也会负责将初始状态从 `loading` 结算为成功后的 `idle` 或失败后的 `error`；当前首页已有缓存且仅因 release 变化执行后台刷新时仍完全静默。
- 第四轮验证：先补失败用例并确认旧实现没有无缓存后台任务的状态结算分支；修复后定向测试 2 个文件、190 个用例通过。最终 `npm run --prefix frontend test`（42 个文件、424 个测试通过）、`npm run --prefix frontend lint`、`npm run --prefix frontend build` 和 `git diff --check` 均通过；最大入口 chunk 约 381.3 kB，无体积 warning。
- 第四轮未验证：未连接真实登录账号在浏览器中清除首页缓存后人工刷新；未执行正式发布。

## 2026-08-31 — 删除“杂粮”小类并部署

- 状态：完成。
- 目标：从本地测试数据库和远程生产数据库删除用户级“杂粮”小类；已有食谱、分类映射等引用统一转移到内置“主食”，避免数据丢失和外键悬挂。
- 范围：新增幂等 Alembic 数据迁移、迁移回归测试、本地数据库升级、远程备份/升级/健康检查和本进度记录；不删除仍可复用的系统 `bean` 图标，不修改用户图片资源或敏感配置。
- 设计/需求基线：现有分类目录 `removed_subcategory_names`、`builtin-category-staple` 及 PR-033 的“被引用小类不可直接删除”数据完整性约束；远程审计显示“杂粮”为用户 `2` 的自定义记录，含 13 条食谱引用和 1 条分类映射。
- 预期验证：迁移测试覆盖引用转移与重复最近记录处理；`uv lock --check`、`uv run ruff check backend`、`uv run pytest`、前端 lint/test/build、`git diff --check`；本地与远程数据库完整性、迁移版本、容器健康和公网 `/healthz`。
- 已完成：确认无需新增迁移；内置“杂粮”已由目录停用清单排除，用户自定义同名分类与 `bean` 系统图标均保留。提交 `8ffd2752b2f2daf55685499cea5edac6db4fc794` 已部署，release 为 `260831015351`；远程数据库备份为 `/data/fridgeboard.db.backup-20260830-175406`，权限 `600`、属主 `appuser:appuser`，容器镜像 ID 为 `sha256:0b29e29936bb9d30b676ad39dfe7bd959c0122240775b802a32660df15661303`。
- 验证：本地 `fridgeboard.db` 从 `20260830_31` 升级到 `20260830_32`，目录同步后“杂粮”记录数为 0、`integrity_check=ok`；`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（235 passed，73 条既有依赖弃用警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个文件、398 个测试通过）、`npm run --prefix frontend build`、`docker build --tag fridgeboard:local .` 和 `git diff --check` 均通过。远程 Alembic 为 `20260830_32`、内置“杂粮”为 0、用户自定义“杂粮”仍存在、`bean` 系统图标仍存在；容器 `running/healthy`、重启 `0`，公网 `/healthz` 返回 `{"status":"ok"}`，线上 JS 资源包含 release `260831015351` 和版本 `0.1.9`。
- 未验证：未在真实 PWA/Android WebView 中人工操作分类目录；部署传输中的 macOS 扩展属性 warning 未影响构建、启动或健康检查。

## 2026-08-31 — 同版本发布服务器与 Android APK

- 状态：完成。
- 目标：在不更新产品版本号 `0.1.9` 的前提下，将当前 `main` 发布到生产服务器，并补发正式签名 Android APK；Android `versionCode` 从 `1700000012` 递增到 `1700000013`。
- 范围：当前已验证的用户级共享分类与图标一致性修复、生产容器/PWA、数据库备份、健康检查和同版本 GitHub Release APK；不修改 `frontend/package.json` 版本号，不提交密钥、生产数据或运行时日志。
- 设计与发布基线：`scripts/deploy-image.sh`、`scripts/mobile-release.sh`、`.github/workflows/android-release.yml`、`docs/mobile-deployment-design.md`；服务器 release 由部署脚本自动生成，并与 APK 构建使用同一 release。
- 已完成：提交 `05d82a64ece9e5a0960cd4dd0e63dbd996496818` 已推送 `origin/main` 并部署到 `root@107.174.152.245:/opt/fridgeboard`；服务器 release 为 `260831012333`，镜像摘要为 `sha256:0e45716ecdd4fd92c8a7bb40e417379d3b93879cc931e9f24f9fbd251ee84319`，数据库备份为 `/data/fridgeboard.db.backup-20260830-172349`。GitHub Actions `33325215562` 已成功补发同标签 `v0.1.9` 的正式签名 APK。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（235 passed，73 条既有依赖弃用警告）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个文件、398 个测试通过）、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、`docker build --tag fridgeboard:local .`、脚本语法和 `git diff --check` 均通过；远端 Alembic 为 `20260830_32 (head)`，备份权限 `600` 且属主 `appuser:appuser`，容器 `running/healthy`、重启 `0`，公网 `/healthz` 返回 `{"status":"ok"}`，线上资源包含 release `260831012333`。APK `FridgeBoard-0.1.9-android-1700000013.apk` 大小 `6783970` 字节，包名 `com.fridgeboard.app`、`versionName=0.1.9`、`versionCode=1700000013`，SHA-256/digest 为 `f4162a5d61c61e3557d11cda3ddf66e2221372f31327320435ab46901cf919ae`；同域更新接口已返回相同版本、release、构建号和摘要。
- 未验证：未在第二台真实 Android 设备安装本次 APK；未执行本次发布后的真实 PWA/Android WebView 人工流程验收。

## 2026-08-31 — 系统图标同名拦截与自定义分类可见性修复

- 状态：待评审，自动化验证通过。
- 现象：系统图标已有“杂粮”时仍可生成同名自定义图标；用户把“杂粮”改名后再次创建“杂粮”，可能提示已创建，却在分类目录中找不到对应条目。
- 根因：目录的 `removed_subcategory_names` 原本用于停用历史系统分类，但分类查询、最近分类和目录同步没有限制 `is_custom = false`，因此同名自定义分类会被隐藏、清空图标，未被引用时还会被删除；图标草稿确认仅检查同名自定义分类，没有检查同名内置图标资产。
- 目标：停用名单只作用于系统分类；同名自定义分类始终可见且不会被目录同步删除。新建小类若名称已存在同名系统图标且用户试图保存自定义图标，应返回明确提示并要求复用系统图标；编辑已有小类不因自身当前系统图标误报。
- 范围：分类目录同步与查询、最近分类、图标草稿确认、错误提示及后端/前端回归测试；不改变用户图片内容，不执行提交或发布。
- 已完成：目录停用名单只作用于内置分类，自定义同名小类不再被查询、最近小类或目录同步隐藏和删除；分类普通创建/编辑与图标草稿确认均校验同名内置图标，名称精确命中时提示从图库复用，选择对应系统图标后分类直接绑定该图标键，不再生成同名自定义图标。前端输入同名名称时立即显示复用提示，确认时再次拦截错误选择。
- 验证：先补失败用例并确认旧实现会隐藏/删除自定义同名分类且允许保存同名自定义图标；定向用例覆盖“创建杂粮→改名杂粮饭→重新创建杂粮→两条均可搜索→再次重复才判重”、最近小类、目录同步和图标草稿复用。`uv run ruff check backend`、`uv run pytest`（235 passed）、`uv lock --check`、`npm run --prefix frontend lint`、`npm run --prefix frontend test`（38 个文件、398 个测试通过）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。
- 未验证：未执行正式发布或生产数据库迁移，未在真实 PWA/Android WebView 中人工操作该流程；生产环境仍未修改。

### 线上数据审计（2026-08-31）

- 已只读连接 `root@107.174.152.245` 的 `fridgeboard-app` 容器并核对 `/data/fridgeboard.db`：数据库完整性为 `ok`，Alembic 为 `20260830_32`。
- 结果：不存在 `label = '杂粮'` 的用户自定义图标；`bean` 是唯一的同名系统图标。用户“杂粮”分类当前绑定 `bean`，不是自定义图标记录。
- 结果：`custom-c88e9bf4fb2a452e8ece4b88e77d826e` 的标签为“杂粮饭”，被 1 个分类、1 条库存和 13 条食谱引用；不能按孤立脏数据删除。另有“奥尔良鸡排”“香菇”两个未被分类引用的孤立图标，与本次问题无关，未删除。
- 未执行：未删除线上任何数据；若要删除“杂粮”分类本身，需要先确认如何处理其 13 条食谱引用。

## 2026-08-30 — 生产分类与图标联动一致性修复

- 状态：待评审，自动化验证及生产备份副本迁移演练通过。
- 现象：生产端“杂粮”内置图标显示异常；“杂粮饭”自定义图标保存提示分类已存在；库存“圆白菜”列表显示为“白菜”且使用牛肉图标，编辑时分类语义又显示为“甘蓝”。
- 目标：以生产库真实记录为依据，将自定义小类和图标改为用户级共享数据；库存、食谱、购物项和识别映射统一引用同一个小类 ID，移除跨冰箱复制，修复不可见重复分类及名称/图标/所属大类错位，并避免继续生成同类脏数据。
- 范围：分类/图标数据库模型与服务、用户级分类识别、自定义分类保存校验、库存移动、食谱与购物分类关联、必要的数据迁移、后端回归测试及分类功能文档；不修改用户图片内容，不执行发布或未经验证的数据覆盖。
- 会话记录：已只读核对生产 SQLite。`圆白菜`库存外键指向自定义“白菜”，但该分类位于“肉蛋水产”大类并引用标签为“甘蓝”的复制图标；“杂粮饭”“白菜”“甘蓝”分类及同一源图标键被复制到多台冰箱；当前冰箱另有隐藏/错位的“杂粮饭”记录，因此保存命中重复校验。生产库 `integrity_check=ok`、外键违规为 0，说明问题是业务语义和资产归属不一致，不是 SQLite 物理损坏。
- 设计/需求基线：用户明确自定义小类和图标对同一用户的全部冰箱一致，不需要跨冰箱复制。库存、食谱食材和购物项继续只保存 `subcategory_id`，分类名称、所属大类和 `icon_key` 从同一用户级分类记录解析；图标标签不得替代分类 ID。预期验证为先补失败用例，再运行分类/图标/库存/食谱/购物定向测试、全量后端测试、Ruff、迁移升级与 `git diff --check`。
- 已完成：`food_categories` 与 `icon_assets` 改为 `owner_user_id` 用户作用域；分类列表、图标访问、自动识别、库存移动、食谱和购物关联直接复用同一用户级小类 ID，不再跨冰箱复制。数据库增加用户级大类/小类唯一索引和自定义分类作用域检查；图标编辑同步资产标签。`20260830_32` 迁移按用户合并历史复制分类并重写库存、食谱、购物、最近使用、名称映射和草稿关联，同时修复“杂粮”内置 `bean` 图标、“白菜/甘蓝”所属大类及“圆白菜→甘蓝”关联。新增 ADR-0005，并同步产品、功能和主题数据模型文档。
- 验证：先补跨冰箱共享 ID 用例并确认旧实现失败；最终 `uv lock --check`、`uv run ruff check backend`、`uv run pytest`（233 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个文件、396 个测试通过）、`npm run --prefix frontend build` 和 `git diff --check` 均通过。生产 SQLite 通过在线备份下载到本机临时副本演练迁移：升级到 `20260830_32`，`integrity_check=ok`、外键违规 0、用户级重复分类 0；副本中“杂粮→bean”“杂粮饭→唯一自定义图标”“圆白菜→甘蓝→水果蔬菜”均核对通过。线上数据库未修改。
- 未验证：未执行正式发布或生产数据库迁移，未在真实 PWA/Android WebView 中人工复核三个报告场景；生产数据只有备份副本演练结果，线上仍保持 `20260830_31` 和原有分类记录。

## 2026-08-30 — 发布 FridgeBoard 0.1.9

- 状态：完成。
- 目标：将 `v0.1.8` 之后已合入 `main` 的购物车自动识别类别、历史分类回填和自定义图标持久缓存发布为 `0.1.9`，同步生产服务器并生成包含正式签名 APK 的 GitHub Release。
- 范围：版本号与发布说明、当前 `main` 提交、前后端质量门禁、迁移兼容性、生产容器发布、数据库备份/健康检查和 Android APK 构建发布；不提交密钥、生产数据或其他敏感文件。
- 设计与功能基线：`PR-075`、`RG-017`、`docs/mobile-deployment-design.md` 和 `docs/releases/v0.1.8.md`；预期使用同一 Git 提交部署服务器，并以 `v0.1.9` 触发 Android Release workflow。
- 已完成：版本升级为 `0.1.9`，提交 `900ce2afd465940f19c3e5b8506f7f9ee79550a3` 并推送 `main` 与 `v0.1.9`；生产服务器已部署 release `260830222554`。
- 验证：`uv lock --check`、`uv run ruff check backend`、`uv run pytest`（232 passed）、`npm run --prefix frontend lint`、`npm run --prefix frontend test -- --run`（38 个测试文件、396 个测试通过）、`npm run --prefix frontend build`、`npm run --prefix frontend check:mobile-permissions`、数据库迁移到 `20260830_31 (head)`、SQLite `integrity_check=ok`、正式签名 Android APK 构建与元数据校验均通过。服务器已创建数据库备份 `/data/fridgeboard.db.backup-20260830-142702`，容器为 `healthy`，镜像摘要为 `sha256:778bdb104d5f83cffa8aeadeeffc6f669d98308cb6520db861c0d95ede32514c`，`https://fridge.flycn.fyi/healthz` 返回 `{"status":"ok"}`。GitHub Actions run `33316956672` 成功，Release [v0.1.9](https://github.com/flywhc/FridgeBoard/releases/tag/v0.1.9) 已发布 APK `FridgeBoard-0.1.9-android-1700000012.apk`，线上文件 6,783,746 字节，SHA-256 为 `f35a6c8eff648a9456fd78135dac8ede4c6737097aa031fa15a0e9ad8210e530`，并与 GitHub digest 一致；`git diff --check` 通过且工作区干净。
- 未验证：未在第二台真实 Android 设备上安装本次 APK；GitHub Actions 已完成签名构建和发布校验，服务器/PWA 线上健康检查已完成。

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
| FridgeBoard `0.2.0` 生产与 Android APK 发布 | 已完成（versionCode `1700000014`） | [发布说明](releases/v0.2.0.md)、本会话记录 |
| FridgeBoard `0.1.9` 生产与 Android APK 发布 | 已完成（同版本补发，versionCode `1700000013`） | [发布说明](releases/v0.1.9.md)、本会话记录 |
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
