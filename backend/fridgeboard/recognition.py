"""P6 图片识别的临时媒体边界与 Agnes 适配契约。

本模块仅在一次请求内把相机截图交给外部识别服务；图片会在调用结束（包括失败）时
删除，不进入数据库、日志或备份。Agnes 的部署地址和密钥由环境变量注入。
"""

from __future__ import annotations

import base64
import json
import os
import re
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

RecognitionResult = dict[str, Any]
RecognitionProvider = Callable[[Path, str], RecognitionResult]


def recognize_image(
    image_base64: str, content_type: str, provider: RecognitionProvider | None
) -> RecognitionResult:
    """识别一次相机图片，并保证临时媒体在返回前被删除。

    Args:
        image_base64: 不带 data URL 前缀的 base64 图片内容，最大由调用方限制。
        content_type: 浏览器采集时给出的图片 MIME 类型，仅允许 JPEG、PNG 或 WebP。
        provider: 可替换的识别实现；未配置时拒绝请求而不保存图片。

    Returns:
        识别服务返回的、已限制为本次增量字段的字典。

    Raises:
        ValueError: 图片编码或类型不合法。
        RuntimeError: 未配置或无法访问识别服务。
    """
    if provider is None:
        raise RuntimeError("Agnes 识别服务尚未配置，仍可继续手工录入或扫码")
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError("仅支持 JPEG、PNG 或 WebP 图片")
    try:
        image_bytes = base64.b64decode(image_base64, validate=True)
    except ValueError as exc:
        raise ValueError("图片编码无效") from exc
    if not image_bytes or len(image_bytes) > 5 * 1024 * 1024:
        raise ValueError("图片不能为空且不能超过 5 MB")
    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[content_type]
    with tempfile.NamedTemporaryFile(
        prefix="fb-recognition-", suffix=suffix, delete=False
    ) as output:
        output.write(image_bytes)
        image_path = Path(output.name)
    try:
        return provider(image_path, content_type)
    finally:
        image_path.unlink(missing_ok=True)


def agnes_provider_from_environment() -> RecognitionProvider | None:
    """按部署环境构造 Agnes OpenAI-compatible 多模态适配器。

    Agnes 使用 ``/v1/chat/completions`` 接收 data URL 图片。调用结果要求模型返回
    JSON；适配器会剥离常见 Markdown 代码围栏并归一化为 P6 的增量字段契约。
    """
    endpoint = os.environ.get(
        "FRIDGEBOARD_AGNES_RECOGNITION_URL",
        "https://apihub.agnes-ai.com/v1/chat/completions",
    )
    token = os.environ.get("FRIDGEBOARD_AGNES_API_TOKEN")
    if not token:
        return None
    model = os.environ.get("FRIDGEBOARD_AGNES_MODEL", "agnes-2.0-flash")

    def provider(image_path: Path, content_type: str) -> RecognitionResult:
        """向 Agnes 网关发送图片；网络和格式失败不暴露图片内容。"""
        encoded_image = base64.b64encode(image_path.read_bytes()).decode()
        image_url = f"data:{content_type};base64,{encoded_image}"
        prompt = (
            "识别这张食品包装图片，只返回 JSON 对象，不要 Markdown。只填写本次明确识别的字段；"
            "字段格式为 {字段名:{value:string,confidence:number}}，未识别字段省略。"
            "可用字段：food_name,category_name,subcategory_name,product_description,"
            "production_date,best_before,barcode,raw_date_label。日期使用 YYYY-MM-DD。"
        )
        payload = json.dumps(
            {
                "model": model,
                "temperature": 0,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_url}},
                        ],
                    }
                ],
            }
        ).encode()
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(endpoint, data=payload, headers=headers, method="POST")
        try:
            with urlopen(request, timeout=20) as response:  # noqa: S310
                response_payload = json.loads(response.read())
        except (OSError, ValueError) as exc:
            raise RuntimeError("Agnes 识别暂时不可用，请继续手工录入") from exc
        try:
            content = response_payload["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise ValueError
            fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
            result = json.loads(fenced.group(1) if fenced else content.strip())
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError("Agnes 返回格式无效") from exc
        if not isinstance(result, dict):
            raise RuntimeError("Agnes 返回格式无效")
        normalized: RecognitionResult = {}
        for key, value in result.items():
            if not isinstance(value, dict) or value.get("value") is None:
                continue
            try:
                confidence = float(value.get("confidence", 0.5))
            except (TypeError, ValueError):
                continue
            if 0 <= confidence <= 1:
                normalized[key] = {"value": str(value["value"]), "confidence": confidence}
        return normalized

    return provider
