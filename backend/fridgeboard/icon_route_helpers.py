"""图标 HTTP 路由共享的请求体读取 helper。"""

from __future__ import annotations

from fastapi import Request

from fridgeboard.icon_service import MAX_ICON_BYTES


async def read_icon_upload(request: Request) -> bytes:
    """以分块方式读取图片请求，并在内存缓冲达到 10MB 时立即拒绝。"""
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > MAX_ICON_BYTES:
                raise ValueError("图标文件过大")
        except ValueError as exc:
            if str(exc) == "图标文件过大":
                raise
            raise ValueError("图标长度无效") from exc
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_ICON_BYTES:
            raise ValueError("图标文件过大")
        chunks.append(chunk)
    return b"".join(chunks)
