"""Icon media normalization, file cleanup, and SVG security processing."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree

import anyio
from PIL import Image
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.icon_constants import (
    MAX_ICON_PIXELS,
    ONLINE_HOSTS,
    SVG_HUSH_BINARY,
    SVG_HUSH_TIMEOUT_SECONDS,
    SVG_MAX_BYTES,
    SVG_MAX_ICONIFY_BYTES,
    SVG_MAX_ICONIFY_NODES,
    SVG_MAX_NODES,
    SVG_NAMESPACE,
)

logger = logging.getLogger("fridgeboard.icon_core")

def _remove_path(path: Path) -> None:
    """删除一个文件或目录；目标已经不存在时保持幂等。"""
    try:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)
    except OSError:
        logger.exception("图标资产清理失败，后续清理任务可再次处理：%s", path)


async def _remove_tree_async(path: Path) -> None:
    """异步删除临时资产目录，避免在协程中阻塞事件循环。"""
    target = anyio.Path(path)
    if not await target.exists():
        return
    if await target.is_dir():
        async for child in target.iterdir():
            await _remove_tree_async(Path(child))
        await target.rmdir()
    else:
        await target.unlink(missing_ok=True)


def _install_file_transaction_hooks(session: AsyncSession) -> None:
    """为会话安装一次文件提交/回滚补偿钩子。"""
    if session.info.get("fridgeboard_file_hooks"):
        return

    def after_commit(committed_session: object) -> None:
        for path in committed_session.info.pop("fridgeboard_remove_after_commit", []):
            _remove_path(path)
        committed_session.info.pop("fridgeboard_remove_after_rollback", None)

    def after_rollback(rolled_back_session: object) -> None:
        for path in rolled_back_session.info.pop("fridgeboard_remove_after_rollback", []):
            _remove_path(path)
        rolled_back_session.info.pop("fridgeboard_remove_after_commit", None)

    event.listen(session.sync_session, "after_commit", after_commit)
    event.listen(session.sync_session, "after_rollback", after_rollback)
    session.info["fridgeboard_file_hooks"] = True


def schedule_removal_after_commit(session: AsyncSession, path: Path) -> None:
    """在当前数据库事务成功提交后删除文件或目录。"""
    _install_file_transaction_hooks(session)
    session.info.setdefault("fridgeboard_remove_after_commit", []).append(path)


def schedule_removal_after_rollback(session: AsyncSession, path: Path) -> None:
    """在当前数据库事务回滚后删除尚未提交的文件或目录。"""
    _install_file_transaction_hooks(session)
    session.info.setdefault("fridgeboard_remove_after_rollback", []).append(path)


def scoped_asset_path(root: Path, relative_path: str) -> Path:
    """安全解析资产相对路径，拒绝访问配置目录之外的目标。"""
    resolved_root = root.resolve()
    resolved = (root / relative_path).resolve()
    if resolved != resolved_root and resolved_root not in resolved.parents:
        raise ValueError("图标路径无效")
    return resolved


def _transparent_png(image_bytes: bytes) -> bytes:
    """把 Agnes 的纯白背景结果归一化为透明底 RGBA PNG。"""
    try:
        image = Image.open(BytesIO(image_bytes))
        if image.width * image.height > MAX_ICON_PIXELS:
            raise ValueError("图标像素数量超过 16MP 限制")
        image = image.convert("RGBA")
    except (OSError, ValueError) as exc:
        raise RuntimeError("Agnes 返回的图标不是有效图片") from exc
    pixels = []
    for red, green, blue, alpha in image.get_flattened_data():
        whiteness = min(red, green, blue)
        normalized_alpha = min(alpha, max(0, 255 - whiteness) * 3)
        pixels.append((red, green, blue, normalized_alpha))
    image.putdata(pixels)
    longest_edge = max(image.size)
    if longest_edge > 256:
        scale = 256 / longest_edge
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _raster_png(image_bytes: bytes) -> bytes:
    """解码普通用户/在线栅格图并等比限制尺寸，不改变像素语义。"""
    try:
        image = Image.open(BytesIO(image_bytes))
        if image.width * image.height > MAX_ICON_PIXELS:
            raise ValueError("图标像素数量超过 16MP 限制")
        if image.mode not in {"RGBA", "RGB"}:
            image = image.convert("RGBA")
    except (OSError, ValueError) as exc:
        raise ValueError("图片不是有效的 PNG/JPEG/WebP") from exc
    longest_edge = max(image.size)
    if longest_edge > 256:
        scale = 256 / longest_edge
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _svg_hush_binary() -> str:
    """返回 SVG 清洗器可执行文件路径，允许部署环境覆盖默认命令。"""
    return os.environ.get("FRIDGEBOARD_SVG_HUSH_BINARY", SVG_HUSH_BINARY)


def _validate_sanitized_svg(svg_bytes: bytes, expected_viewbox: str | None) -> bytes:
    """检查 svg-hush 输出的业务约束，不重复实现 SVG 安全清洗。"""
    max_bytes = SVG_MAX_BYTES if expected_viewbox is not None else SVG_MAX_ICONIFY_BYTES
    max_nodes = SVG_MAX_NODES if expected_viewbox is not None else SVG_MAX_ICONIFY_NODES
    if len(svg_bytes) > max_bytes:
        raise ValueError(f"SVG 图标清洗后仍超过 {max_bytes // 1000}KB 限制")
    try:
        root = ElementTree.fromstring(svg_bytes)
    except ElementTree.ParseError as exc:
        raise ValueError("SVG 安全清洗器返回了无效文档") from exc
    if root.tag != f"{{{SVG_NAMESPACE}}}svg":
        raise ValueError("SVG 安全清洗器返回的根元素或命名空间无效")
    if expected_viewbox is not None and root.attrib.get("viewBox") != expected_viewbox:
        raise ValueError(f"SVG 图标必须使用 {expected_viewbox} viewBox")
    if len(list(root.iter())) > max_nodes:
        raise ValueError(f"SVG 图标清洗后节点数超过 {max_nodes} 限制")
    for node in root.iter():
        for attribute, value in node.attrib.items():
            key = attribute.rsplit("}", 1)[-1].lower()
            if key in {"href", "xlink:href"} and not value.strip().startswith("#"):
                raise ValueError("SVG 图标不允许加载资源")
            _validate_svg_url_values(value)
        if node.text:
            _validate_svg_url_values(node.text)
    return svg_bytes


def _validate_svg_url_values(value: str) -> None:
    """拒绝清洗结果中的外部资源引用，仅允许 SVG 内部片段引用。"""
    for match in re.finditer(r"url\(\s*(['\"]?)(.*?)\1\s*\)", value, re.IGNORECASE):
        if not match.group(2).strip().startswith("#"):
            raise ValueError("SVG 图标不允许加载资源")


def _svg_hush_failure(stderr: bytes, returncode: int) -> ValueError:
    """将 svg-hush 的失败转换为不向客户端暴露原始文档的错误。"""
    detail = " ".join(stderr.decode("utf-8", errors="replace").split())[:240]
    logger.warning(
        "svg-hush 清洗失败 returncode=%s stderr_summary=%s",
        returncode,
        detail or "-",
    )
    normalized_detail = detail.lower()
    if "no acceptable svg elements" in normalized_detail:
        reason = "根元素缺少 SVG 命名空间，或清洗后没有可用图形元素"
    elif "parse error" in normalized_detail or "not well-formed" in normalized_detail:
        reason = "SVG XML 结构不完整或格式无效"
    else:
        reason = "可能包含脚本、外链或不支持的结构"
    return ValueError(f"SVG 安全清洗器拒绝了内容：{reason}")


def _run_svg_hush(svg_bytes: bytes, expected_viewbox: str | None) -> bytes:
    """同步调用 svg-hush，供同步兼容入口和测试使用。"""
    try:
        result = subprocess.run(
            [_svg_hush_binary(), "-"],
            input=svg_bytes,
            capture_output=True,
            check=False,
            timeout=SVG_HUSH_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("SVG 安全清洗器未安装，请联系管理员") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("SVG 安全清洗器处理超时，请稍后重试") from exc
    if result.returncode != 0:
        raise _svg_hush_failure(result.stderr, result.returncode)
    return _validate_sanitized_svg(result.stdout, expected_viewbox)


async def _run_svg_hush_async(svg_bytes: bytes, expected_viewbox: str | None) -> bytes:
    """异步调用 svg-hush，避免阻塞 FastAPI 事件循环。"""
    try:
        with anyio.fail_after(SVG_HUSH_TIMEOUT_SECONDS):
            result = await anyio.run_process(
                [_svg_hush_binary(), "-"],
                input=svg_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
    except FileNotFoundError as exc:
        raise RuntimeError("SVG 安全清洗器未安装，请联系管理员") from exc
    except TimeoutError as exc:
        raise RuntimeError("SVG 安全清洗器处理超时，请稍后重试") from exc
    if result.returncode != 0:
        raise _svg_hush_failure(result.stderr, result.returncode)
    return _validate_sanitized_svg(result.stdout, expected_viewbox)


def sanitize_svg(svg_bytes: bytes) -> bytes:
    """使用 svg-hush 清洗需要固定 64x64 视图盒的 SVG 图标。"""
    if len(svg_bytes) > SVG_MAX_BYTES:
        raise ValueError("SVG 图标超过 64KB 限制")
    return _run_svg_hush(svg_bytes, "0 0 64 64")


async def sanitize_svg_async(svg_bytes: bytes) -> bytes:
    """异步使用 svg-hush 清洗需要固定 64x64 视图盒的 SVG 图标。"""
    if len(svg_bytes) > SVG_MAX_BYTES:
        raise ValueError("SVG 图标超过 64KB 限制")
    return await _run_svg_hush_async(svg_bytes, "0 0 64 64")


def sanitize_iconify_svg(svg_bytes: bytes) -> bytes:
    """使用 svg-hush 清洗在线 SVG，同时保留其原始 viewBox。"""
    if len(svg_bytes) > SVG_MAX_ICONIFY_BYTES:
        raise ValueError("SVG 图标超过 256KB 限制")
    return _run_svg_hush(svg_bytes, None)


async def sanitize_iconify_svg_async(svg_bytes: bytes) -> bytes:
    """异步使用 svg-hush 清洗在线 SVG，同时保留其原始 viewBox。"""
    if len(svg_bytes) > SVG_MAX_ICONIFY_BYTES:
        raise ValueError("SVG 图标超过 256KB 限制")
    return await _run_svg_hush_async(svg_bytes, None)


def _validate_remote_url(url: str, provider: str) -> str:
    """校验在线资源地址，只允许指定供应商的 HTTPS 主机。"""
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ONLINE_HOSTS:
        raise ValueError("在线图标地址不受支持")
    if parsed.port not in {None, 443}:
        raise ValueError("在线图标地址端口不受支持")
    if ONLINE_HOSTS[parsed.hostname] != provider or parsed.username or parsed.password:
        raise ValueError("在线图标地址不受支持")
    return url
