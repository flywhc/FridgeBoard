"""从已完成双渠道发布的 Ad Hoc IPA 标签读取 iOS 更新信息。"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Callable
from time import monotonic

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)
GITHUB_IOS_RELEASES_URL = "https://api.github.com/repos/flywhc/FridgeBoard/releases?per_page=100"
IOS_INSTALL_URL = "https://app.flycn.fyi/apps/fridgeboard"
_LABEL = re.compile(r"^AdHoc build=([1-9][0-9]*) release=([0-9]{12})$")
_VERSION = re.compile(r"^v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$")


class IosReleaseMetadata(BaseModel):
    """可供 iOS 展示的公开发布信息，不包含门户安装令牌。"""

    version: str
    build_number: int
    release: str
    release_notes: str
    artifact_filename: str
    file_size: int
    sha256: str
    install_url: str

    model_config = {"json_schema_extra": {"example": {
        "version": "0.2.11", "build_number": 4, "release": "261104173345",
        "release_notes": "修复更新检查。", "artifact_filename": "FridgeBoard-0.2.11-ios.ipa",
        "file_size": 10000, "sha256": "a" * 64, "install_url": IOS_INSTALL_URL,
    }}}


class IosUpdateServiceError(Exception):
    """表示公开 iOS 更新信息暂不可用。"""


class IosUpdateService:
    """短时缓存已完成门户发布的 GitHub Ad Hoc IPA 元数据。"""

    def __init__(
        self,
        client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._client_factory = client_factory
        self._clock = clock
        self._cached: IosReleaseMetadata | None = None
        self._expires = 0.0
        self._lock = asyncio.Lock()

    async def latest_release(self) -> IosReleaseMetadata | None:
        """返回最近 100 个公开 Release 中版本/构建号最高的 Ad Hoc IPA。

        未启用新发布标签或没有 Ad Hoc 包时返回 None；上游失败不冒充无更新。
        """
        async with self._lock:
            if self._clock() < self._expires:
                return self._cached.model_copy() if self._cached else None
            release = await self._fetch_release()
            self._cached = release
            self._expires = self._clock() + 300
            return release.model_copy() if release else None

    async def _fetch_release(self) -> IosReleaseMetadata | None:
        started = self._clock()
        response: httpx.Response | None = None
        stage = "request"
        try:
            async with self._client_factory(timeout=httpx.Timeout(10, connect=5)) as client:
                response = await client.get(
                    GITHUB_IOS_RELEASES_URL,
                    headers={"Accept": "application/vnd.github+json"},
                )
            response.raise_for_status()
            stage = "json"
            payload = response.json()
            stage = "metadata"
            return parse_ios_releases(payload)
        except (httpx.HTTPError, ValueError, TypeError, asyncio.CancelledError) as error:
            logger.exception(
                "ios_update_failed method=GET path=/api/mobile/ios/releases/latest "
                "operation=check_ios_update service=github endpoint=%s status=%s "
                "content_type=%s content_length=%s response_summary=%s "
                "elapsed_ms=%.0f parse_stage=%s exception=%s",
                GITHUB_IOS_RELEASES_URL,
                response.status_code if response is not None else None,
                response.headers.get("content-type") if response is not None else None,
                len(response.content) if response is not None else None,
                (
                    "array" if response.text.lstrip().startswith("[") else "non_array"
                ) if response is not None else "no_response",
                (self._clock() - started) * 1000,
                stage,
                type(error).__name__,
            )
            if isinstance(error, asyncio.CancelledError):
                raise
            raise IosUpdateServiceError("iOS 更新服务暂时不可用，请稍后重试。") from error


def parse_ios_releases(payload: object) -> IosReleaseMetadata | None:
    """只接受带 AdHoc 发布标签、有效摘要及规范 GitHub 地址的 IPA。"""
    if not isinstance(payload, list):
        raise ValueError("GitHub Release 列表格式无效")
    candidates: list[IosReleaseMetadata] = []
    for item in payload:
        if not isinstance(item, dict) or item.get("draft") or item.get("prerelease"):
            continue
        tag = item.get("tag_name")
        version_match = _VERSION.fullmatch(tag) if isinstance(tag, str) else None
        if not version_match or not isinstance(item.get("assets"), list):
            continue
        version = version_match[1]
        for asset in item["assets"]:
            candidate = _parse_asset(asset, tag, version, item.get("body"))
            if candidate:
                candidates.append(candidate)
    return max(
        candidates,
        key=lambda release: (
            tuple(int(part) for part in release.version.split(".")), release.build_number
        ),
        default=None,
    )


def _parse_asset(asset: object, tag: str, version: str, notes: object) -> IosReleaseMetadata | None:
    if not isinstance(asset, dict):
        return None
    label = asset.get("label")
    match = _LABEL.fullmatch(label) if isinstance(label, str) else None
    if not match or int(match[1]) > 2100000000:
        return None
    filename = f"FridgeBoard-{version}-ios.ipa"
    expected_url = f"https://github.com/flywhc/FridgeBoard/releases/download/{tag}/{filename}"
    digest, size = asset.get("digest"), asset.get("size")
    if (
        asset.get("name") != filename
        or asset.get("browser_download_url") != expected_url
        or not isinstance(digest, str)
        or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest, re.I)
        or type(size) is not int
        or size <= 0
    ):
        raise ValueError("Ad Hoc IPA 元数据不完整或下载地址无效")
    return IosReleaseMetadata(
        version=version,
        build_number=int(match[1]),
        release=match[2],
        release_notes=notes if isinstance(notes, str) else "",
        artifact_filename=filename,
        file_size=size,
        sha256=digest[7:],
        install_url=IOS_INSTALL_URL,
    )
