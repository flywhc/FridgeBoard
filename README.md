# FridgeBoard

家庭冰箱库存看板：手机 PWA 负责管理，Kindle 浏览器负责低频展示。当前已完成 P3：flycn
所有者登录、Kindle Passcode 绑定、短效手机配对与可撤销设备凭证。

## 本地开发

前置条件：Python 3.12+、[uv](https://docs.astral.sh/uv/)、Node.js 22+ 与 npm。

```bash
uv run uvicorn fridgeboard.main:app --app-dir backend --reload
npm ci --prefix frontend
npm run --prefix frontend dev
```

后端运行于 `http://127.0.0.1:8000`，健康检查为 `GET /healthz`；前端开发服务器按终端提示的地址访问。

本地创建或升级数据库：

```bash
FRIDGEBOARD_DATABASE_URL=sqlite:///./fridgeboard.db uv run alembic upgrade head
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
