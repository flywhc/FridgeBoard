"""读取公开 Android Release 元数据并隔离 GitHub API 访问。"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from time import monotonic
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GITHUB_ANDROID_RELEASES_URL = (
    "https://api.github.com/repos/flywhc/FridgeBoard/releases/latest"
)
ANDROID_RELEASE_CACHE_TTL_SECONDS = 5 * 60
_SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
_RELEASE_NAME_PATTERN = re.compile(r"\brelease ([0-9]{12})\b")
_RELEASE_ASSET_PATTERN = re.compile(
    r"^FridgeBoard-(?P<version>.+)-android-(?P<build_number>[1-9][0-9]*)\.apk$"
)


class AndroidUpdateServiceError(Exception):
    """表示 GitHub 更新元数据暂时不可用或不符合契约。"""

    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


class AndroidUpdateService:
    """缓存并校验公开 GitHub Android Release 元数据。"""

    def __init__(
        self,
        client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._client_factory = client_factory
        self._clock = clock
        self._cached_release: dict[str, Any] | None = None
        self._cache_expires_at = 0.0

    async def latest_release(self) -> dict[str, Any]:
        """返回最新可安装的公开 Android Release 元数据。

        Returns:
            可直接提供给 Android 客户端的、已校验的 Release 元数据。

        Raises:
            AndroidUpdateServiceError: 上游不可达、返回错误或响应格式无效。
        """
        if self._cached_release is not None and self._clock() < self._cache_expires_at:
            return self._cached_release.copy()

        try:
            timeout = httpx.Timeout(connect=5, read=10, write=5, pool=5)
            async with self._client_factory(timeout=timeout) as client:
                response = await client.get(
                    GITHUB_ANDROID_RELEASES_URL,
                    headers={
                        "Accept": "application/vnd.github+json",
                        "User-Agent": "FridgeBoard-Android-Update-Proxy",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
        except httpx.HTTPError as error:
            logger.exception(
                "android_update_upstream_transport_error method=GET url=%s exception=%s",
                GITHUB_ANDROID_RELEASES_URL,
                type(error).__name__,
            )
            raise AndroidUpdateServiceError("GitHub 更新服务暂时不可用，请稍后重试。") from error

        response_summary = _response_summary(response)
        if not response.is_success:
            logger.error(
                "android_update_upstream_http_error method=GET url=%s status=%s %s",
                GITHUB_ANDROID_RELEASES_URL,
                response.status_code,
                response_summary,
            )
            status_code = 429 if response.status_code in {403, 429} else 503
            raise AndroidUpdateServiceError(
                "您的网络地址受到 GitHub 下载站点限制，请尝试更换网络或稍后再试。", status_code
            )

        try:
            payload = response.json()
            release = _parse_github_release(payload)
        except (ValueError, TypeError, KeyError) as error:
            logger.exception(
                "android_update_upstream_contract_error method=GET url=%s %s "
                "parse_stage=release_metadata",
                GITHUB_ANDROID_RELEASES_URL,
                response_summary,
            )
            raise AndroidUpdateServiceError("最新版信息暂时不可用，请稍后重试。") from error

        self._cached_release = release
        self._cache_expires_at = self._clock() + ANDROID_RELEASE_CACHE_TTL_SECONDS
        return release.copy()


def _parse_github_release(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("GitHub Release 响应不是对象")
    tag_name = payload.get("tag_name")
    assets = payload.get("assets")
    if not isinstance(tag_name, str) or not isinstance(assets, list):
        raise ValueError("GitHub Release 缺少 tag_name 或 assets")
    tag_match = re.fullmatch(r"v(.+)", tag_name)
    version = tag_match.group(1) if tag_match else None
    if version is None or not _SEMVER_PATTERN.fullmatch(version):
        raise ValueError("GitHub Release 版本号无效")

    expected_path = f"/flywhc/FridgeBoard/releases/download/{tag_name}/"
    asset: dict[str, Any] | None = None
    build_number: str | None = None
    for candidate in assets:
        if not isinstance(candidate, dict):
            continue
        name = candidate.get("name")
        match = _RELEASE_ASSET_PATTERN.fullmatch(name) if isinstance(name, str) else None
        if match is None or match.group("version") != version:
            continue
        if not _is_valid_asset(candidate, expected_path, name):
            continue
        asset = candidate
        build_number = match.group("build_number")
        break
    if asset is None or build_number is None:
        raise ValueError("GitHub Release 缺少可安装的 APK")

    digest = asset["digest"]
    download_url = asset["browser_download_url"]
    release_name = payload.get("name")
    release_match = (
        _RELEASE_NAME_PATTERN.search(release_name) if isinstance(release_name, str) else None
    )
    return {
        "app_slug": "fridgeboard",
        "platform": "android",
        "variant": "universal",
        "version": version,
        "release": release_match.group(1) if release_match else "",
        "build_number": build_number,
        "artifact_filename": asset["name"],
        "file_size": asset["size"],
        "sha256": digest[len("sha256:") :],
        "release_notes": payload.get("body") if isinstance(payload.get("body"), str) else "",
        "download_url": download_url,
        "expires_at": None,
    }


def _is_valid_asset(candidate: dict[str, Any], expected_path: str, name: str) -> bool:
    size = candidate.get("size")
    digest = candidate.get("digest")
    url = candidate.get("browser_download_url")
    if not isinstance(size, int) or size <= 0:
        return False
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest, re.I):
        return False
    if not isinstance(url, str):
        return False
    try:
        parsed = httpx.URL(url)
    except Exception:
        return False
    return (
        parsed.scheme == "https"
        and parsed.host == "github.com"
        and parsed.path == f"{expected_path}{name}"
    )


def _response_summary(response: httpx.Response) -> str:
    """Return bounded non-sensitive response details for upstream diagnostics."""
    content_type = response.headers.get("content-type", "-")
    body = response.text[:512].replace("\n", " ")
    return f"content_type={content_type!r} content_length={len(response.content)} body={body!r}"
