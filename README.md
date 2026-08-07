# FridgeBoard

家庭冰箱库存看板：手机 PWA 负责管理，冰箱端显示设备负责低频展示。Kindle 浏览器只是可选的典型设备示例。当前已完成 P3：flycn
所有者登录、冰箱端兼容绑定、短效手机配对与可撤销设备凭证。

## 本地开发

前置条件：Python 3.12+、[uv](https://docs.astral.sh/uv/)、Node.js 22+ 与 npm。

```bash
uv run uvicorn fridgeboard.main:app --app-dir backend --reload
npm ci --prefix frontend
npm run --prefix frontend dev
```

后端监听 `0.0.0.0:8000`，健康检查为 `GET /healthz`；前端开发服务器监听 `0.0.0.0:5173`。在手机或其他设备上，请使用电脑的局域网 IP 访问，例如 `http://192.168.1.20:5173`，不要把 `0.0.0.0` 当作二维码地址。

项目根目录的 `.env` 会由直接启动的 FastAPI 应用读取。在 VS Code 中按 `F5` 选择
`FridgeBoard：全栈调试` 时会自动加载 `.env`、执行数据库迁移、启动 Vite 并打开前端；
修改 `.env` 后需停止并重新按 `F5`，不能只刷新浏览器。开发环境生成的冰箱端配对链接统一指向
前端本机可用 `http://127.0.0.1:5173`，局域网设备请使用电脑的局域网 IP。二维码和 SSO 回调会根据当前浏览器访问地址自动生成。

手动启动时也可以显式加载同一份配置：

```bash
set -a; source .env; set +a
uv run uvicorn fridgeboard.main:app --app-dir backend --reload
```

## 质量检查

```bash
uv run ruff check backend
uv run pytest
npm ci --prefix frontend
npm run --prefix frontend lint
npm run --prefix frontend build
docker build --tag fridgeboard:local .
```

## 配置与部署

复制 `.env.example` 作为部署环境变量的参考，实际密钥只能由部署环境提供，不能提交到仓库。生产环境通过 `compose.yaml` 使用名为 `proxy` 的既有外部 Docker 网络，并把 SQLite 数据保存在 `fridgeboard-data` 卷；应用不直接暴露主机端口。

`Dockerfile` 构建 React/Vite 产物并由同一 FastAPI 进程提供 API 与静态资源。生产部署固定单副本、单 Uvicorn 进程，符合 SQLite WAL 的写入约束。容器启动时会先执行一次 Alembic 前向迁移；迁移失败时容器不会开始提供 HTTP 服务。

生产静态资源压缩由 Nginx Proxy Manager 在边缘处理，FridgeBoard 应用本身不重复压缩。NPM 的
`/data/nginx/custom/server_proxy.conf` 配置了 256 bytes 最小响应长度，并覆盖 JavaScript、CSS、JSON、XML
和 SVG 等文本类型；修改后必须先执行 `nginx -t` 再 reload。该文件位于 NPM 数据卷中，变更前应创建带时间戳的备份。

后端依赖由 `uv.lock` 锁定。更新 Python 依赖后，使用 `uv export --locked --no-dev --no-emit-project --format requirements-txt --output-file requirements.lock` 刷新容器安装清单；CI 会检查锁文件有效性。

P3 生产环境还需配置 `FRIDGEBOARD_PUBLIC_BASE_URL`、`FRIDGEBOARD_FLYCN_AUTHORIZE_URL`、
`FRIDGEBOARD_FLYCN_EXCHANGE_URL` 与 `FRIDGEBOARD_FLYCN_CLIENT_SECRET`。其中共享密钥必须与
flycn 的 `FRIDGEBOARD_CLIENT_SECRET` 相同；本地手工演示可临时设置
`FRIDGEBOARD_DEVELOPMENT_OWNER_USER_ID`，生产环境不得设置该变量。

若部署在受信任的 OpenWrt 私有局域网，设置 `FRIDGEBOARD_LOCAL_OWNER_USER_ID` 后，手机无需
flycn 登录即可创建冰箱、领取冰箱端首次开机二维码并管理设备。该模式把局域网访问视为
所有者权限，不能暴露到公网，也不要与 flycn SSO 配置同时使用。

### 发布最新版本

`scripts/deploy-image.sh` 默认读取仓库根目录的本地 `.deploy.env`，通过生产固定 IP
`107.174.152.245` 的 SSH 把源码归档传到服务器并在服务器上重新构建容器，不依赖 GHCR 或
Token。发布脚本会拒绝对 `flycn.fyi` 建立 SSH 连接。`.deploy.env` 已被
`.gitignore` 忽略，只存在本机。
脚本通过 SSH 在 `/opt/fridgeboard` 执行，不上传源码、不覆盖服务器 `.env`，并在重建前用
SQLite 在线备份创建 `/data/fridgeboard.db.backup-时间戳`。默认发布当前 `HEAD`，也可以
通过 `--ref` 指定提交或分支。

每次正式发布时，脚本会自动生成 `yymmddhhMMss` 格式的 release 号，注入本次发布归档的
前端构建，并在“关于与帮助”页面显示；该过程不会修改本地工作区或语义版本号。

内置物品分类和 SVG 图标位于 `backend/fridgeboard/assets/item_catalog/`，会随 Git 跟踪和
`git archive` 一起进入 Docker 构建上下文，不需要逐个手工上传。`.gitignore` 已明确放行该
目录；发布脚本在传输前会检查 `catalog.json` 声明的每个资产都存在于待发布归档中，缺失时
直接停止发布。

```bash
# 默认通过 .deploy.env 中的生产固定 IP 发布；不会连接 flycn.fyi。
scripts/deploy-image.sh
```

也可以显式指定生产固定 IP 发布：

```bash
scripts/deploy-image.sh --host 107.174.152.245
```

发布前先检查参数而不连接服务器：

```bash
scripts/deploy-image.sh --dry-run
```

也可以发布指定提交或使用其他本地配置文件：

```bash
scripts/deploy-image.sh --ref main
scripts/deploy-image.sh --config path/to/deploy.env
```
命令行选项会覆盖配置文件中的同名值。

脚本不会自动回滚已启动的容器；发布失败时保留数据库备份和容器日志，需根据日志处理后再
重新发布。生产 `.env`、`fridgeboard-data` 卷及 Docker external network `proxy` 必须已在
服务器上配置好。
