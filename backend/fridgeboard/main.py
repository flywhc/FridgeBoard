"""FridgeBoard FastAPI 应用入口。

本模块组装 HTTP 路由及生产环境静态资源服务；不承担领域规则或数据库访问。
当 ``frontend/dist`` 存在时，应用会以同域方式提供 PWA 构建产物。
"""

from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """容器存活探针返回的数据结构。"""

    status: str = Field(
        examples=["ok"],
        description="应用进程状态；健康时始终为 `ok`。",
    )


def create_app(frontend_dist: Path | None = None) -> FastAPI:
    """创建 FridgeBoard HTTP 应用。

    API 路由总是先由 FastAPI 路由表处理。只有非 API 的 GET/HEAD 请求得到
    404 时，才回退到 PWA 入口，因此后续任务包可安全地继续注册 API 路由。

    Args:
        frontend_dist: 可选的前端构建目录。省略时使用生产镜像内的默认目录；
            目录不存在则仅提供 API，便于后端本地开发。

    Returns:
        已配置健康检查和可选 PWA 静态资源回退的 FastAPI 应用。
    """
    application = FastAPI(
        title="FridgeBoard API",
        version="0.1.0",
        description="FridgeBoard 的同域 API 与 PWA 静态资源入口。",
    )

    @application.get(
        "/healthz",
        response_model=HealthResponse,
        summary="读取应用健康状态",
        responses={
            200: {
                "description": "应用进程可接受请求。",
                "content": {"application/json": {"example": {"status": "ok"}}},
            }
        },
    )
    def healthz() -> HealthResponse:
        """返回不依赖数据库的进程存活状态。

        Returns:
            用于容器健康检查的固定健康响应。
        """
        return HealthResponse(status="ok")

    dist = frontend_dist or Path(__file__).resolve().parents[2] / "frontend" / "dist"
    assets = dist / "assets"
    if not dist.is_dir():
        return application

    if assets.is_dir():
        application.mount("/assets", StaticFiles(directory=assets), name="assets")

    @application.middleware("http")
    async def pwa_fallback(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """将未知的页面路由回退到 PWA，保留 API 的 JSON 404 语义。"""
        response = await call_next(request)
        if (
            response.status_code != 404
            or request.method not in {"GET", "HEAD"}
            or request.url.path.startswith("/api/")
        ):
            return response

        requested_file = (dist / request.url.path.lstrip("/")).resolve()
        if requested_file.is_relative_to(dist.resolve()) and requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(dist / "index.html")

    return application


app = create_app()
