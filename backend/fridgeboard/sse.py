"""SSE 响应事件格式化工具。

本模块只负责将已经脱敏的状态、模型文本增量和结构化结果编码为浏览器可消费的
Server-Sent Events，不负责业务状态或模型请求。事件数据必须是 JSON，以便前后端
在模型输出包含换行或特殊字符时仍保持一条事件一个消息的边界。
"""

from __future__ import annotations

import json
from typing import Any


def sse_event(event: str, payload: dict[str, Any]) -> str:
    """将一个结构化事件编码为 SSE 帧。

    Args:
        event: 事件名称，例如 ``status``、``token``、``result`` 或 ``error``。
        payload: 事件 JSON 对象；不得包含密钥、Cookie、原始图片或完整用户隐私数据。

    Returns:
        以两个换行结束的 SSE 文本帧。
    """
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
