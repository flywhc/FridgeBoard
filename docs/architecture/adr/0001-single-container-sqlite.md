# ADR-0001：单容器部署与 SQLite 数据存储

状态：已接受  
日期：2026-07-19

## 决策

React/Vite PWA 与 FastAPI 在源码中分离，在生产环境构建为同一 FridgeBoard 容器；由 FastAPI 在 `fridge.flycn.fyi` 同域提供静态资源和 API。服务部署在 `/opt/fridgeboard`，通过 Nginx Proxy Manager 和 Docker external network `proxy` 提供 HTTPS。

业务数据使用独立卷中的 SQLite（WAL），运行一个 FastAPI 进程和一个容器副本。数据访问经 SQLAlchemy/Alembic，以保留未来迁移 PostgreSQL 的边界。

## 原因

首版是单服务器、单家庭低并发服务。现有服务器资源有限，额外的 PostgreSQL、Redis、前端 Nginx 和 Worker 容器增加内存、运维与备份成本，不能带来当前所需的收益。同域部署还避免 PWA、Cookie、Service Worker 和 CORS 的额外兼容风险。

## 后果

- 写操作必须短小且按事务完成；不得以多 Uvicorn worker 或多副本横向扩容。
- 每次 schema 变更必须通过迁移，且自动部署只接受前向兼容迁移。
- 若以后出现多副本、独立 Worker 或高并发写入，先迁移 PostgreSQL，再扩容运行形态。
