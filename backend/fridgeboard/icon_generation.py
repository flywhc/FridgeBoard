"""Icon generation orchestration outside database transactions."""

from __future__ import annotations

import inspect
import logging
import time

from fridgeboard.icon_core import IconGenerationProvider, IconImageCallback

logger = logging.getLogger("fridgeboard.icon_core")

async def generate_icon_images(
    provider: IconGenerationProvider | None,
    name: str,
    count: int = 4,
    theme_key: str = "skeuomorphic",
    on_image: IconImageCallback | None = None,
) -> tuple[str, list[bytes]]:
    """在数据库事务外调用图标模型并校验候选数量。

    Args:
        provider: 异步图标生成 provider；未配置时拒绝请求。
        name: 新小类名称。
        count: 要求模型返回的候选数量，必须为正数。
        on_image: 每张图完成后的异步回调；旧 provider 不支持回调时在全部结果返回后补发。

    Returns:
        规范化后的小类名称与模型返回的图片字节列表。

    Raises:
        ValueError: 小类名称为空或候选数量配置无效。
        RuntimeError: provider 未配置或返回数量不符合约定。
    """
    normalized = name.strip()
    if not normalized:
        raise ValueError("小类名称不能为空")
    if count <= 0:
        raise ValueError("图标候选数量无效")
    if provider is None:
        raise RuntimeError("Agnes 图标生成服务尚未配置")
    started_at = time.monotonic()
    parameters = inspect.signature(provider).parameters
    supports_image_callback = len(parameters) >= 4
    if supports_image_callback:
        images = await provider(normalized, count, theme_key, on_image)
    elif len(parameters) >= 3:
        images = await provider(normalized, count, theme_key)
    else:
        images = await provider(normalized, count)
    if on_image is not None and not supports_image_callback:
        for index, image in enumerate(images):
            await on_image(index, image)
    if len(images) != count:
        logger.error(
            "图标生成结果数量无效 operation=icon_generation expected_count=%s "
            "actual_count=%s elapsed_ms=%.1f",
            count,
            len(images),
            (time.monotonic() - started_at) * 1000,
        )
        raise RuntimeError("Agnes 图标生成结果数量无效")
    logger.info(
        "图标模型阶段完成 operation=icon_generation candidate_count=%s elapsed_ms=%.1f",
        len(images),
        (time.monotonic() - started_at) * 1000,
    )
    return normalized, images
