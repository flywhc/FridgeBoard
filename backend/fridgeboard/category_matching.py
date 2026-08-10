"""物品名称到现有小类的确定性匹配。

本模块只做无副作用的名称标准化和保守匹配，不访问数据库，也不调用大模型。
调用方应在匹配前提供当前冰箱可用的小类和数据驱动的别名；不确定的结果返回
``None``，交由用户或异步大模型流程确认。
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

_PUNCTUATION = re.compile(r"[\u3000\s\-_/|,，。·•:：;；]+")


@dataclass(frozen=True)
class MatchResult:
    """一个确定性分类匹配结果。"""

    subcategory_id: str
    subcategory_name: str
    source: str
    confidence: float


def normalize_item_name(value: str) -> str:
    """标准化物品名称，保留语义词语和规格信息。

    Args:
        value: 用户或识别服务返回的物品名称。

    Returns:
        归一化后的名称；空白和常见分隔符被合并为空格。
    """
    normalized = unicodedata.normalize("NFKC", value).strip().lower()
    return _PUNCTUATION.sub(" ", normalized).strip()


def _candidate_aliases(candidate: dict[str, Any]) -> list[str]:
    """读取候选分类的别名，并确保别名本身经过同样的标准化。"""
    aliases = candidate.get("aliases", [])
    if not isinstance(aliases, list):
        aliases = []
    values = [str(candidate.get("name", "")), *(str(item) for item in aliases)]
    return [item for item in (normalize_item_name(value) for value in values) if item]


def _suffix_match(name: str, alias: str) -> bool:
    """只允许完整名称或结尾别名命中，避免“牛奶巧克力”误命中牛奶。"""
    return name == alias or name.endswith(f" {alias}") or name.endswith(alias)


def match_item_name(
    item_name: str, candidates: list[dict[str, Any]]
) -> MatchResult | None:
    """在现有候选小类中执行保守的精确、别名和相似度匹配。

    Args:
        item_name: 待匹配的物品名称。
        candidates: 每项至少包含 ``id``、``name``，可选 ``aliases`` 列表。

    Returns:
        唯一且达到置信度门槛的分类，否则返回 ``None``。
    """
    normalized_name = normalize_item_name(item_name)
    if not normalized_name:
        return None

    exact: list[tuple[dict[str, Any], str]] = []
    for candidate in candidates:
        aliases = _candidate_aliases(candidate)
        if normalized_name in aliases:
            exact.append((candidate, "exact"))
    if len(exact) == 1:
        candidate, _ = exact[0]
        return MatchResult(str(candidate["id"]), str(candidate["name"]), "builtin", 0.99)
    if len(exact) > 1:
        return None

    scored: list[tuple[float, dict[str, Any]]] = []
    for candidate in candidates:
        aliases = _candidate_aliases(candidate)
        suffix_scores = [
            0.94 if _suffix_match(normalized_name, alias) and len(alias) >= 2 else 0
            for alias in aliases
        ]
        similarity_scores = [
            SequenceMatcher(None, normalized_name, alias).ratio()
            for alias in aliases
            if len(alias) >= 3 and len(normalized_name) >= 3
        ]
        score = max([*suffix_scores, *similarity_scores], default=0.0)
        scored.append((score, candidate))

    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored or scored[0][0] < 0.92:
        return None
    if len(scored) > 1 and scored[0][0] - scored[1][0] < 0.12:
        return None
    candidate = scored[0][1]
    return MatchResult(
        str(candidate["id"]), str(candidate["name"]), "builtin", round(scored[0][0], 2)
    )
