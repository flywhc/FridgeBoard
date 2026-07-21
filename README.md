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

后端依赖由 `uv.lock` 锁定。更新 Python 依赖后，使用 `uv export --locked --no-dev --no-emit-project --format requirements-txt --output-file requirements.lock` 刷新容器安装清单；CI 会检查锁文件有效性。

P3 生产环境还需配置 `FRIDGEBOARD_PUBLIC_BASE_URL`、`FRIDGEBOARD_FLYCN_AUTHORIZE_URL`、
`FRIDGEBOARD_FLYCN_EXCHANGE_URL` 与 `FRIDGEBOARD_FLYCN_CLIENT_SECRET`。其中共享密钥必须与
flycn 的 `FRIDGEBOARD_CLIENT_SECRET` 相同；本地手工演示可临时设置
`FRIDGEBOARD_DEVELOPMENT_OWNER_USER_ID`，生产环境不得设置该变量。

若部署在受信任的 OpenWrt 私有局域网，设置 `FRIDGEBOARD_LOCAL_OWNER_USER_ID` 后，手机无需
flycn 登录即可创建冰箱、领取冰箱端首次开机二维码并管理设备。该模式把局域网访问视为
所有者权限，不能暴露到公网，也不要与 flycn SSO 配置同时使用。
