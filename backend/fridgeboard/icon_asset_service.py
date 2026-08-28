"""持久图标资产和草稿服务实现。"""

# ruff: noqa
from __future__ import annotations
from fridgeboard.icon_core import *  # noqa: F401,F403
from fridgeboard.icon_core import (
    _raster_png,
    _remove_tree_async,
    _safe_endpoint,
    _transparent_png,
    sanitize_svg_async,
    scoped_asset_path,
    schedule_removal_after_commit,
    schedule_removal_after_rollback,
)
from sqlalchemy import update


class IconService:
    """管理当前冰箱可见图标、临时候选和确认后的持久资产。"""

    def __init__(
        self,
        session: AsyncSession,
        persistent_dir: Path,
        temporary_dir: Path,
    ) -> None:
        """绑定短数据库事务会话和图标资产目录。"""
        self._session = session
        self._persistent_dir = persistent_dir
        self._temporary_dir = temporary_dir

    async def download_provider_item(self, provider: str, item_id: str) -> tuple[bytes, str, str]:
        """通过已验证的供应商 item ID 下载图标。"""
        return await download_provider_item(provider, item_id)

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

    async def variant_records(self, icon_key: str) -> list[IconAssetVariant]:
        """返回逻辑图标集的全部主题变体记录。"""
        return list(
            await self._session.scalars(
                select(IconAssetVariant)
                .where(IconAssetVariant.icon_key == icon_key)
                .order_by(IconAssetVariant.theme_key)
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
        if not await anyio.Path(path).is_file():
            raise ValueError("图标文件不存在")
        return path, asset.media_type

    async def asset_variant_path(
        self, refrigerator_id: str, icon_key: str, theme_key: str
    ) -> tuple[Path, str, str, bool]:
        """按主题和统一 fallback 顺序解析自定义图标变体。

        Args:
            refrigerator_id: 当前访问的冰箱 ID。
            icon_key: 逻辑图标集键。
            theme_key: 请求的主题键。

        Returns:
            资产路径、媒体类型、实际使用的主题和是否发生 fallback。

        Raises:
            ValueError: 图标不存在、主题无效或文件不存在。
        """
        valid_themes = ("ink", "skeuomorphic", "cartoon")
        if theme_key not in valid_themes:
            raise ValueError("图标主题无效")
        asset = await self._session.get(IconAsset, icon_key)
        if asset is None or asset.refrigerator_id not in {None, refrigerator_id}:
            raise ValueError("图标不存在")
        variants = {
            item.theme_key: item
            for item in await self._session.scalars(
                select(IconAssetVariant).where(IconAssetVariant.icon_key == icon_key)
            )
        }
        order = [theme_key, asset.fallback_theme, "ink", "skeuomorphic", "cartoon"]
        seen: set[str] = set()
        for candidate_theme in order:
            if candidate_theme in seen:
                continue
            seen.add(candidate_theme)
            variant = variants.get(candidate_theme)
            if variant is None:
                continue
            path = (
                builtin_icon_path(variant.storage_path)
                if variant.source == "builtin"
                else self._safe_path(self._persistent_dir, variant.storage_path)
            )
            if await anyio.Path(path).is_file():
                return path, variant.media_type, candidate_theme, candidate_theme != theme_key
        # Compatibility with a database created before the variant migration.
        path = (
            builtin_icon_path(asset.storage_path)
            if asset.source == "builtin"
            else self._safe_path(self._persistent_dir, asset.storage_path)
        )
        if await anyio.Path(path).is_file():
            return path, asset.media_type, "ink", theme_key != "ink"
        raise ValueError("图标文件不存在")

    async def add_variant(
        self,
        refrigerator_id: str,
        icon_key: str,
        theme_key: str,
        content: bytes,
        media_type: str,
        source: str = "upload",
        *,
        source_id: str | None = None,
        source_url: str | None = None,
        license_spdx: str | None = None,
        license_url: str | None = None,
        attribution: str | None = None,
    ) -> IconAssetVariant:
        """写入当前冰箱自定义图标的主题变体并替换旧文件。"""
        if theme_key not in {"ink", "skeuomorphic", "cartoon"}:
            raise ValueError("图标主题无效")
        asset = await self._session.get(IconAsset, icon_key)
        if asset is None or asset.refrigerator_id != refrigerator_id or asset.source == "builtin":
            raise ValueError("系统图标不可修改")
        if media_type == "image/svg+xml":
            content = await sanitize_svg_async(content)
        elif media_type in {"image/png", "image/jpeg", "image/webp"}:
            content = _raster_png(content)
            media_type = "image/png"
        else:
            raise ValueError("图标格式不受支持")
        directory = self._persistent_dir / icon_key
        await anyio.Path(directory).mkdir(parents=True, exist_ok=True)
        filename = f"{theme_key}-{uuid4().hex}{'.svg' if media_type == 'image/svg+xml' else '.png'}"
        target = directory / filename
        await anyio.Path(target).write_bytes(content)
        previous = await self._session.get(IconAssetVariant, (icon_key, theme_key))
        if previous is not None:
            previous_path = self._safe_path(self._persistent_dir, previous.storage_path)
            schedule_removal_after_commit(self._session, previous_path)
            previous.storage_path = f"{icon_key}/{filename}"
            previous.media_type = media_type
            previous.source = source
            previous.source_id = source_id
            previous.source_url = source_url
            previous.license_spdx = license_spdx
            previous.license_url = license_url
            previous.attribution = attribution
            previous.revision += 1
            schedule_removal_after_rollback(self._session, target)
            return previous
        variant = IconAssetVariant(
            icon_key=icon_key,
            theme_key=theme_key,
            media_type=media_type,
            storage_path=f"{icon_key}/{filename}",
            source=source,
            source_id=source_id,
            source_url=source_url,
            license_spdx=license_spdx,
            license_url=license_url,
            attribution=attribution,
        )
        self._session.add(variant)
        await self._session.flush()
        schedule_removal_after_rollback(self._session, target)
        return variant

    async def create_draft(
        self,
        refrigerator_id: str,
        parent_id: str,
        name: str,
        category_id: str | None = None,
        fallback_theme: str = "ink",
        version: int = 1,
    ) -> IconDraft:
        """创建带过期时间和并发版本的图标草稿。"""
        if fallback_theme not in {"ink", "skeuomorphic", "cartoon"}:
            raise ValueError("图标主题无效")
        normalized = name.strip()
        if not normalized:
            raise ValueError("小类名称不能为空")
        draft = IconDraft(
            refrigerator_id=refrigerator_id,
            parent_id=parent_id,
            name=normalized,
            category_id=category_id,
            fallback_theme=fallback_theme,
            base_version=version,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=30),
        )
        self._session.add(draft)
        await self._session.flush()
        return draft

    async def require_draft(self, refrigerator_id: str, draft_id: str) -> IconDraft:
        """读取当前冰箱仍有效的图标草稿。"""
        draft = await self._session.get(IconDraft, draft_id)
        if draft is None or draft.refrigerator_id != refrigerator_id:
            raise ValueError("图标草稿不存在")
        if draft.expires_at <= datetime.now(UTC).replace(tzinfo=None):
            raise ValueError("图标草稿已过期")
        return draft

    async def save_draft_variant(
        self,
        refrigerator_id: str,
        draft_id: str,
        theme_key: str,
        content: bytes,
        media_type: str,
        source: str = "upload",
        *,
        source_id: str | None = None,
        source_url: str | None = None,
        license_spdx: str | None = None,
        license_url: str | None = None,
        attribution: str | None = None,
    ) -> IconDraftVariant:
        """规范化并保存草稿主题变体，替换同主题旧候选。"""
        await self.require_draft(refrigerator_id, draft_id)
        if theme_key not in {"ink", "skeuomorphic", "cartoon"}:
            raise ValueError("图标主题无效")
        if media_type == "image/svg+xml":
            content = await sanitize_svg_async(content)
        elif media_type in {"image/png", "image/jpeg", "image/webp"}:
            content = _raster_png(content)
            media_type = "image/png"
        else:
            raise ValueError("图标格式不受支持")
        directory = self._temporary_dir / draft_id
        await anyio.Path(directory).mkdir(parents=True, exist_ok=True)
        suffix = ".svg" if media_type == "image/svg+xml" else ".png"
        relative_path = f"{draft_id}/{theme_key}-{uuid4().hex}{suffix}"
        target = self._temporary_dir / relative_path
        await anyio.Path(target).write_bytes(content)
        previous = await self._session.get(IconDraftVariant, (draft_id, theme_key))
        if previous is not None:
            schedule_removal_after_commit(
                self._session, scoped_asset_path(self._temporary_dir, previous.storage_path)
            )
            previous.storage_path = relative_path
            previous.media_type = media_type
            previous.source = source
            previous.source_id = source_id
            previous.source_url = source_url
            previous.license_spdx = license_spdx
            previous.license_url = license_url
            previous.attribution = attribution
            result = previous
        else:
            result = IconDraftVariant(
                draft_id=draft_id,
                theme_key=theme_key,
                media_type=media_type,
                storage_path=relative_path,
                source=source,
                source_id=source_id,
                source_url=source_url,
                license_spdx=license_spdx,
                license_url=license_url,
                attribution=attribution,
            )
            self._session.add(result)
        await self._session.flush()
        schedule_removal_after_rollback(self._session, target)
        return result

    async def confirm_draft(
        self,
        refrigerator_id: str,
        draft_id: str,
        parent_id: str,
        name: str,
        fallback_theme: str,
        version: int,
    ) -> FoodCategory:
        """在单一事务内确认草稿并创建或更新自定义小类。"""
        draft = await self.require_draft(refrigerator_id, draft_id)
        if draft.base_version != version:
            raise ValueError("小类已被其他请求修改，请重新打开编辑页")
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("自定义小类名称不能为空")
        parent = await self._session.get(FoodCategory, parent_id)
        if (
            parent is None
            or parent.parent_id is not None
            or parent.refrigerator_id not in {None, refrigerator_id}
        ):
            raise ValueError("物品大类不存在或不属于当前柜体")
        duplicate = await self._session.scalar(
            select(FoodCategory.id).where(
                FoodCategory.refrigerator_id == refrigerator_id,
                FoodCategory.parent_id == parent_id,
                FoodCategory.name == normalized_name,
                FoodCategory.id != (draft.category_id or ""),
            )
        )
        if duplicate:
            raise ValueError("该冰箱已存在同名自定义小类")
        if draft.category_id:
            category = await self._session.get(FoodCategory, draft.category_id)
            if (
                category is None
                or category.refrigerator_id != refrigerator_id
                or not category.is_custom
            ):
                raise ValueError("系统小类不可修改")
            if category.revision != version:
                raise ValueError("小类已被其他请求修改，请重新打开编辑页")
            icon_key = await self.copy_on_write(refrigerator_id, category.id)
        else:
            icon_key = f"custom-{uuid4().hex}"
            category = FoodCategory(
                id=uuid4().hex,
                refrigerator_id=refrigerator_id,
                parent_id=parent_id,
                name=normalized_name,
                icon_key=icon_key,
                is_custom=True,
                display_order=0,
            )
            self._session.add(category)
            await self._session.flush()
        category.parent_id = parent_id
        category.name = normalized_name
        variants = list(
            await self._session.scalars(
                select(IconDraftVariant).where(IconDraftVariant.draft_id == draft_id)
            )
        )
        if not variants:
            raise ValueError("至少需要设置一个主题图标")
        available_themes = {variant.theme_key for variant in variants}
        effective_fallback = next(
            (
                theme
                for theme in (fallback_theme, "ink", "skeuomorphic", "cartoon")
                if theme in available_themes
            ),
            variants[0].theme_key,
        )
        icon = IconAsset(
            key=icon_key,
            refrigerator_id=refrigerator_id,
            label=category.name,
            media_type="image/png",
            storage_path=f"{icon_key}/ink.png",
            source="draft",
            fallback_theme=effective_fallback,
        )
        if draft.category_id:
            icon = await self._session.get(IconAsset, icon_key)
            if icon is None:
                raise ValueError("图标逻辑集不存在")
            icon.fallback_theme = effective_fallback
        else:
            self._session.add(icon)
        for candidate in variants:
            source_path = scoped_asset_path(self._temporary_dir, candidate.storage_path)
            if not await anyio.Path(source_path).is_file():
                raise ValueError("图标草稿文件不存在")
            extension = ".svg" if candidate.media_type == "image/svg+xml" else ".png"
            filename = f"{candidate.theme_key}-{uuid4().hex}{extension}"
            target = self._persistent_dir / icon_key / filename
            await anyio.Path(target.parent).mkdir(parents=True, exist_ok=True)
            await anyio.Path(target).write_bytes(await anyio.Path(source_path).read_bytes())
            old = await self._session.get(IconAssetVariant, (icon_key, candidate.theme_key))
            if old is not None:
                old_path = scoped_asset_path(self._persistent_dir, old.storage_path)
                if old_path != target:
                    schedule_removal_after_commit(self._session, old_path)
                old.storage_path = f"{icon_key}/{filename}"
                old.media_type = candidate.media_type
                old.source = candidate.source
                old.source_id = candidate.source_id
                old.source_url = candidate.source_url
                old.license_spdx = candidate.license_spdx
                old.license_url = candidate.license_url
                old.attribution = candidate.attribution
                old.revision += 1
            else:
                self._session.add(
                    IconAssetVariant(
                        icon_key=icon_key,
                        theme_key=candidate.theme_key,
                        media_type=candidate.media_type,
                        storage_path=f"{icon_key}/{filename}",
                        source=candidate.source,
                        source_id=candidate.source_id,
                        source_url=candidate.source_url,
                        license_spdx=candidate.license_spdx,
                        license_url=candidate.license_url,
                        attribution=candidate.attribution,
                    )
                )
            schedule_removal_after_rollback(self._session, target)
        await self._delete_draft(draft)
        return category

    async def copy_on_write(self, refrigerator_id: str, category_id: str) -> str:
        """为共享图标创建私有逻辑集，避免替换影响其他小类。"""
        category = await self._session.get(FoodCategory, category_id)
        if (
            category is None
            or category.refrigerator_id != refrigerator_id
            or not category.is_custom
        ):
            raise ValueError("系统小类不可修改")
        if not category.icon_key:
            raise ValueError("小类尚未绑定逻辑图标")
        original = await self._session.get(IconAsset, category.icon_key)
        shared_count = await self._session.scalar(
            select(FoodCategory.id)
            .where(
                FoodCategory.icon_key == category.icon_key,
                FoodCategory.id != category_id,
            )
            .limit(1)
        )
        if shared_count is None and (original is None or original.source != "builtin"):
            result = await self._session.execute(
                update(FoodCategory)
                .where(FoodCategory.id == category_id, FoodCategory.revision == category.revision)
                .values(revision=FoodCategory.revision + 1)
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                raise ValueError("小类已被其他请求修改，请重新打开编辑页")
            category.revision += 1
            return category.icon_key
        private_key = f"custom-{uuid4().hex}"
        clone = IconAsset(
            key=private_key,
            refrigerator_id=refrigerator_id,
            label=original.label if original else category.name,
            media_type=original.media_type if original else "image/png",
            storage_path=f"{private_key}/ink.png",
            source="copy",
            fallback_theme=original.fallback_theme if original else "ink",
        )
        self._session.add(clone)
        await self._session.flush()
        source_variants = await self.variant_records(original.key) if original else []
        if not source_variants and original:
            source_variants = [
                IconAssetVariant(
                    icon_key=original.key,
                    theme_key="ink",
                    media_type=original.media_type,
                    storage_path=original.storage_path,
                    source=original.source,
                )
            ]
        for source_variant in source_variants:
            source_path = (
                builtin_icon_path(source_variant.storage_path)
                if source_variant.source == "builtin"
                else self._safe_path(self._persistent_dir, source_variant.storage_path)
            )
            if not await anyio.Path(source_path).is_file():
                continue
            suffix = ".svg" if source_variant.media_type == "image/svg+xml" else ".png"
            relative_path = f"{private_key}/{source_variant.theme_key}{suffix}"
            target_path = self._persistent_dir / relative_path
            await anyio.Path(target_path.parent).mkdir(parents=True, exist_ok=True)
            await anyio.Path(target_path).write_bytes(await anyio.Path(source_path).read_bytes())
            self._session.add(
                IconAssetVariant(
                    icon_key=private_key,
                    theme_key=source_variant.theme_key,
                    media_type=source_variant.media_type,
                    storage_path=relative_path,
                    source="copy",
                    source_id=source_variant.source_id,
                    source_url=source_variant.source_url,
                    license_spdx=source_variant.license_spdx,
                    license_url=source_variant.license_url,
                    attribution=source_variant.attribution,
                    revision=source_variant.revision,
                )
            )
            schedule_removal_after_rollback(self._session, target_path)
        result = await self._session.execute(
            update(FoodCategory)
            .where(FoodCategory.id == category_id, FoodCategory.revision == category.revision)
            .values(icon_key=private_key, revision=FoodCategory.revision + 1)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            raise ValueError("小类已被其他请求修改，请重新打开编辑页")
        category.icon_key = private_key
        category.revision += 1
        await self._session.flush()
        return private_key

    async def persist_generation(
        self, refrigerator_id: str, name: str, images: list[bytes]
    ) -> IconGenerationSession:
        """在短数据库事务内保存已完成模型调用的图标候选。"""
        normalized = name.strip()
        if not normalized:
            raise ValueError("小类名称不能为空")
        if len(images) != 4:
            raise RuntimeError("Agnes 图标生成结果数量无效")
        generation = IconGenerationSession(
            id=uuid4().hex,
            refrigerator_id=refrigerator_id,
            subcategory_name=normalized,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=30),
        )
        directory = self._temporary_dir / generation.id
        candidates: list[IconGenerationCandidate] = []
        try:
            await anyio.Path(directory).mkdir(parents=True, exist_ok=False)
            for index, image_bytes in enumerate(images):
                if image_bytes.lstrip().startswith(b"<svg") or b"<svg" in image_bytes[:512]:
                    normalized_content = await sanitize_svg_async(image_bytes)
                    media_type = "image/svg+xml"
                    extension = "svg"
                else:
                    normalized_content = _transparent_png(image_bytes)
                    media_type = "image/png"
                    extension = "png"
                filename = f"{uuid4().hex}.{extension}"
                await anyio.Path(directory / filename).write_bytes(normalized_content)
                candidates.append(
                    IconGenerationCandidate(
                        session_id=generation.id,
                        storage_path=f"{generation.id}/{filename}",
                        display_order=index,
                        media_type=media_type,
                    )
                )
            self._session.add(generation)
            await self._session.flush()
            self._session.add_all(candidates)
            await self._session.flush()
        except Exception:
            await _remove_tree_async(directory)
            raise
        return generation

    async def create_generation_session(
        self, refrigerator_id: str, name: str
    ) -> IconGenerationSession:
        """创建可在模型调用期间逐张填充的临时生成会话。"""
        normalized = name.strip()
        if not normalized:
            raise ValueError("小类名称不能为空")
        generation = IconGenerationSession(
            id=uuid4().hex,
            refrigerator_id=refrigerator_id,
            subcategory_name=normalized,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=30),
        )
        directory = self._temporary_dir / generation.id
        try:
            await anyio.Path(directory).mkdir(parents=True, exist_ok=False)
            self._session.add(generation)
            await self._session.flush()
            schedule_removal_after_rollback(self._session, directory)
        except Exception:
            await _remove_tree_async(directory)
            raise
        return generation

    async def persist_generation_candidate(
        self,
        refrigerator_id: str,
        generation_id: str,
        display_order: int,
        image_bytes: bytes,
    ) -> IconGenerationCandidate:
        """在短事务内保存一张已生成的临时候选图。"""
        if not 0 <= display_order < 4:
            raise ValueError("图标候选序号无效")
        generation = await self._require_generation(refrigerator_id, generation_id)
        existing = await self._session.scalar(
            select(IconGenerationCandidate).where(
                IconGenerationCandidate.session_id == generation.id,
                IconGenerationCandidate.display_order == display_order,
            )
        )
        if existing is not None:
            raise ValueError("图标候选序号重复")
        if image_bytes.lstrip().startswith(b"<svg") or b"<svg" in image_bytes[:512]:
            normalized_content = await sanitize_svg_async(image_bytes)
            media_type = "image/svg+xml"
            extension = "svg"
        else:
            normalized_content = _transparent_png(image_bytes)
            media_type = "image/png"
            extension = "png"
        filename = f"{uuid4().hex}.{extension}"
        target = self._temporary_dir / generation.id / filename
        await anyio.Path(target).write_bytes(normalized_content)
        candidate = IconGenerationCandidate(
            session_id=generation.id,
            storage_path=f"{generation.id}/{filename}",
            display_order=display_order,
            media_type=media_type,
        )
        try:
            self._session.add(candidate)
            await self._session.flush()
        except Exception:
            await _remove_tree_async(target)
            raise
        schedule_removal_after_rollback(self._session, target)
        return candidate

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
        if not await anyio.Path(path).is_file():
            raise ValueError("图标候选文件不存在")
        return path

    async def candidate_media_type(self, candidate_id: str) -> str:
        """返回候选媒体类型，供资源路由设置正确的 Content-Type。"""
        candidate = await self._session.get(IconGenerationCandidate, candidate_id)
        if candidate is None:
            raise ValueError("图标候选不存在")
        return candidate.media_type

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
        if not await anyio.Path(source_path).is_file():
            raise ValueError("图标候选文件不存在")
        icon_key = f"custom-{uuid4().hex}"
        extension = "svg" if candidate.media_type == "image/svg+xml" else "png"
        filename = f"{icon_key}.{extension}"
        await anyio.Path(self._persistent_dir).mkdir(parents=True, exist_ok=True)
        target_path = self._persistent_dir / filename
        await anyio.Path(target_path).write_bytes(await anyio.Path(source_path).read_bytes())
        schedule_removal_after_rollback(self._session, target_path)
        asset = IconAsset(
            key=icon_key,
            refrigerator_id=refrigerator_id,
            label=normalized_name,
            media_type=candidate.media_type,
            storage_path=filename,
            source="agnes",
        )
        self._session.add(asset)
        self._session.add(
            IconAssetVariant(
                icon_key=icon_key,
                theme_key="ink",
                media_type=candidate.media_type,
                storage_path=filename,
                source="agnes",
            )
        )
        from fridgeboard.inventory_service import InventoryService

        try:
            category = await InventoryService(self._session).create_custom_subcategory(
                refrigerator_id, parent_id, normalized_name, icon_key
            )
            await self._delete_generation(generation)
            return category
        except Exception:
            await anyio.Path(target_path).unlink(missing_ok=True)
            raise

    async def cancel(self, refrigerator_id: str, generation_id: str) -> None:
        """取消一组候选并立即删除全部临时文件。"""
        await self._delete_generation(
            await self._require_generation(refrigerator_id, generation_id)
        )

    async def cleanup_expired(self, now: datetime) -> None:
        """删除所有已过期会话、草稿及对应临时文件。"""
        generations = await self._session.scalars(
            select(IconGenerationSession).where(IconGenerationSession.expires_at <= now)
        )
        for generation in generations:
            await self._delete_generation(generation)
        drafts = await self._session.scalars(select(IconDraft).where(IconDraft.expires_at <= now))
        for draft in drafts:
            await self._delete_draft(draft)

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

    async def _delete_draft(self, draft: IconDraft) -> None:
        """删除草稿记录并在提交后清理草稿目录。"""
        variants = await self._session.scalars(
            select(IconDraftVariant).where(IconDraftVariant.draft_id == draft.id)
        )
        for variant in variants:
            schedule_removal_after_commit(
                self._session, scoped_asset_path(self._temporary_dir, variant.storage_path)
            )
        await self._session.delete(draft)
        schedule_removal_after_commit(
            self._session, scoped_asset_path(self._temporary_dir, draft.id)
        )

    @staticmethod
    def _safe_path(root: Path, relative_path: str) -> Path:
        """解析资产相对路径并拒绝逃逸出配置目录。"""
        return scoped_asset_path(root, relative_path)
