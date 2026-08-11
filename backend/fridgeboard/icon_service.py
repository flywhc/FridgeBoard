"""数据化图标资产、Agnes AI 候选和确认持久化服务。"""

from __future__ import annotations

import base64
import logging
import os
import shutil
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import anyio
import httpx
from PIL import Image
from sqlalchemy import event, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.item_catalog import builtin_icon_path
from fridgeboard.persistence.models import (
    FoodCategory,
    IconAsset,
    IconGenerationCandidate,
    IconGenerationSession,
)

IconGenerationProvider = Callable[[str, int], Awaitable[list[bytes]]]
EnvironmentReader = Callable[[str, str | None], str | None]
logger = logging.getLogger(__name__)


def _environment_value(name: str, default: str | None = None) -> str | None:
    """读取一个进程环境变量，供默认 Agnes 配置入口使用。"""
    return os.environ.get(name, default)


def agnes_icon_provider_from_environment(
    env_value: EnvironmentReader = _environment_value,
) -> IconGenerationProvider | None:
    """按现有 Agnes 凭证构造 text2image 图标生成适配器。

    Returns:
        可生成指定数量 PNG 的适配器；未配置 Agnes token 时返回 ``None``。
    """
    token = env_value("FRIDGEBOARD_AGNES_API_TOKEN", None)
    if not token:
        return None
    endpoint = env_value(
        "FRIDGEBOARD_AGNES_IMAGE_URL",
        "https://apihub.agnes-ai.com/v1/images/generations",
    )
    model = env_value("FRIDGEBOARD_AGNES_IMAGE_MODEL", "agnes-image-2.1-flash")
    if endpoint is None or model is None:
        return None

    async def provider(name: str, count: int) -> list[bytes]:
        """异步调用 Agnes text2image，并返回经透明背景归一化的 PNG。"""
        prompt = (
            f"为“{name}”绘制一个极简黑色单线图标。主体居中、轮廓清晰、无文字、无阴影、"
            "无边框、纯白背景，适合 64 像素库存分类按钮。"
        )
        results: list[bytes] = []
        timeout = httpx.Timeout(connect=10, read=120, write=30, pool=10)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for _ in range(count):
                response: httpx.Response | None = None
                payload = {
                    "model": model,
                    "prompt": prompt,
                    "size": "1K",
                    "ratio": "1:1",
                    "return_base64": True,
                }
                try:
                    response = await client.post(
                        endpoint,
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    response.raise_for_status()
                    response_payload = response.json()
                    encoded = response_payload["data"][0]["b64_json"]
                    results.append(_transparent_png(base64.b64decode(encoded)))
                except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
                    logger.exception(
                        "Agnes 图标生成失败 endpoint=%s status=%s response_bytes=%s",
                        endpoint.split("?", 1)[0],
                        response.status_code if response is not None else None,
                        len(response.content) if response is not None else 0,
                    )
                    raise RuntimeError("Agnes 图标生成暂时不可用，请稍后重试") from exc
        return results

    return provider


def _remove_path(path: Path) -> None:
    """删除一个文件或目录；目标已经不存在时保持幂等。"""
    try:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)
    except OSError:
        logger.exception("图标资产清理失败，后续清理任务可再次处理：%s", path)


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
        image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    except (OSError, ValueError) as exc:
        raise RuntimeError("Agnes 返回的图标不是有效图片") from exc
    pixels = []
    for red, green, blue, alpha in image.get_flattened_data():
        whiteness = min(red, green, blue)
        normalized_alpha = min(alpha, max(0, 255 - whiteness) * 3)
        pixels.append((red, green, blue, normalized_alpha))
    image.putdata(pixels)
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


class IconService:
    """管理当前冰箱可见图标、临时候选和确认后的持久资产。"""

    def __init__(
        self,
        session: AsyncSession,
        persistent_dir: Path,
        temporary_dir: Path,
        provider: IconGenerationProvider | None,
    ) -> None:
        """绑定事务会话、资产目录与可选 Agnes 生成适配器。"""
        self._session = session
        self._persistent_dir = persistent_dir
        self._temporary_dir = temporary_dir
        self._provider = provider

    async def assets(self, refrigerator_id: str) -> list[IconAsset]:
        """返回内置资产和当前柜体已经确认的自定义图标。"""
        return list(
            await self._session.scalars(
                select(IconAsset)
                .where(
                    or_(
                        IconAsset.refrigerator_id.is_(None),
                        IconAsset.refrigerator_id == refrigerator_id,
                    )
                )
                .order_by(IconAsset.created_at, IconAsset.key)
            )
        )

    async def asset_path(self, refrigerator_id: str, icon_key: str) -> tuple[Path, str]:
        """解析当前柜体可访问图标的安全文件路径和媒体类型。"""
        asset = await self._session.get(IconAsset, icon_key)
        if asset is None or asset.refrigerator_id not in {None, refrigerator_id}:
            raise ValueError("图标不存在")
        path = (
            builtin_icon_path(asset.storage_path)
            if asset.source == "builtin"
            else self._safe_path(self._persistent_dir, asset.storage_path)
        )
        if not path.is_file():
            raise ValueError("图标文件不存在")
        return path, asset.media_type

    async def generate(self, refrigerator_id: str, name: str) -> IconGenerationSession:
        """异步调用 Agnes 生成四个临时 PNG 候选并记录清理期限。"""
        normalized = name.strip()
        if not normalized:
            raise ValueError("小类名称不能为空")
        if self._provider is None:
            raise RuntimeError("Agnes 图标生成服务尚未配置")
        images = await self._provider(normalized, 4)
        if len(images) != 4:
            raise RuntimeError("Agnes 图标生成结果数量无效")
        generation = IconGenerationSession(
            refrigerator_id=refrigerator_id,
            subcategory_name=normalized,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=30),
        )
        self._session.add(generation)
        await self._session.flush()
        directory = self._temporary_dir / generation.id
        await anyio.Path(directory).mkdir(parents=True, exist_ok=False)
        try:
            for index, image_bytes in enumerate(images):
                normalized_png = _transparent_png(image_bytes)
                filename = f"{uuid4().hex}.png"
                await anyio.Path(directory / filename).write_bytes(normalized_png)
                self._session.add(
                    IconGenerationCandidate(
                        session_id=generation.id,
                        storage_path=f"{generation.id}/{filename}",
                        display_order=index,
                    )
                )
            await self._session.flush()
        except Exception:
            shutil.rmtree(directory, ignore_errors=True)
            raise
        return generation

    async def candidates(self, generation_id: str) -> list[IconGenerationCandidate]:
        """返回生成会话中按顺序排列的四个候选。"""
        return list(
            await self._session.scalars(
                select(IconGenerationCandidate)
                .where(IconGenerationCandidate.session_id == generation_id)
                .order_by(IconGenerationCandidate.display_order)
            )
        )

    async def candidate_path(
        self, refrigerator_id: str, generation_id: str, candidate_id: str
    ) -> Path:
        """解析一个仍有效且属于当前柜体的临时候选路径。"""
        generation = await self._require_generation(refrigerator_id, generation_id)
        candidate = await self._session.get(IconGenerationCandidate, candidate_id)
        if candidate is None or candidate.session_id != generation.id:
            raise ValueError("图标候选不存在")
        path = self._safe_path(self._temporary_dir, candidate.storage_path)
        if not path.is_file():
            raise ValueError("图标候选文件不存在")
        return path

    async def confirm(
        self,
        refrigerator_id: str,
        generation_id: str,
        candidate_id: str,
        parent_id: str,
        name: str,
    ) -> FoodCategory:
        """持久化选中 PNG、创建小类，并删除整组临时候选。"""
        generation = await self._require_generation(refrigerator_id, generation_id)
        normalized_name = name.strip()
        if normalized_name != generation.subcategory_name:
            raise ValueError("小类名称已变化，请重新生成图标")
        candidate = await self._session.get(IconGenerationCandidate, candidate_id)
        if candidate is None or candidate.session_id != generation.id:
            raise ValueError("图标候选不存在")
        source_path = self._safe_path(self._temporary_dir, candidate.storage_path)
        if not source_path.is_file():
            raise ValueError("图标候选文件不存在")
        icon_key = f"custom-{uuid4().hex}"
        filename = f"{icon_key}.png"
        self._persistent_dir.mkdir(parents=True, exist_ok=True)
        target_path = self._persistent_dir / filename
        shutil.copyfile(source_path, target_path)
        schedule_removal_after_rollback(self._session, target_path)
        asset = IconAsset(
            key=icon_key,
            refrigerator_id=refrigerator_id,
            label=normalized_name,
            media_type="image/png",
            storage_path=filename,
            source="agnes",
        )
        self._session.add(asset)
        from fridgeboard.inventory_service import InventoryService

        try:
            category = await InventoryService(self._session).create_custom_subcategory(
                refrigerator_id, parent_id, normalized_name, icon_key
            )
            await self._delete_generation(generation)
            return category
        except Exception:
            target_path.unlink(missing_ok=True)
            raise

    async def cancel(self, refrigerator_id: str, generation_id: str) -> None:
        """取消一组候选并立即删除全部临时文件。"""
        await self._delete_generation(
            await self._require_generation(refrigerator_id, generation_id)
        )

    async def cleanup_expired(self, now: datetime) -> None:
        """删除所有已过期会话及对应临时文件。"""
        generations = await self._session.scalars(
            select(IconGenerationSession).where(IconGenerationSession.expires_at <= now)
        )
        for generation in generations:
            await self._delete_generation(generation)

    async def _require_generation(
        self, refrigerator_id: str, generation_id: str
    ) -> IconGenerationSession:
        """返回当前柜体未过期的生成会话。"""
        generation = await self._session.get(IconGenerationSession, generation_id)
        now = datetime.now(UTC).replace(tzinfo=None)
        if (
            generation is None
            or generation.refrigerator_id != refrigerator_id
            or generation.expires_at <= now
        ):
            raise ValueError("图标生成会话不存在或已过期")
        return generation

    async def _delete_generation(self, generation: IconGenerationSession) -> None:
        """删除会话行、候选行以及对应临时目录。"""
        for candidate in await self.candidates(generation.id):
            await self._session.delete(candidate)
        await self._session.delete(generation)
        schedule_removal_after_commit(
            self._session, scoped_asset_path(self._temporary_dir, generation.id)
        )

    @staticmethod
    def _safe_path(root: Path, relative_path: str) -> Path:
        """解析资产相对路径并拒绝逃逸出配置目录。"""
        return scoped_asset_path(root, relative_path)
