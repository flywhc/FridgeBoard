# FridgeBoard 项目约定

## 已验证命令

- 后端静态检查：`uv run ruff check backend`
- 后端测试：`uv run pytest`
- Python 锁文件检查：`uv lock --check`
- 前端静态检查：`npm run --prefix frontend lint`
- 前端生产构建：`npm run --prefix frontend build`
- 单容器镜像构建：`docker build --tag fridgeboard:local .`

## 工程边界

- 生产环境固定为单个 FastAPI/Uvicorn 进程与单个容器副本；SQLite 后续启用 WAL 后不得通过增加 worker 或副本扩展写入。
- API 与 PWA 静态产物必须同域提供；不要为首版增加跨域部署。
- 密钥仅能由部署环境注入，禁止提交 `.env`、数据库文件、令牌或生产数据。
