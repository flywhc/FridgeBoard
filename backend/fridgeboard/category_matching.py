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


def match_exact_category_name(
    item_name: str, candidates: list[dict[str, Any]]
) -> MatchResult | None:
    """按小类名称精确匹配，不使用别名或相似度兜底。

    Args:
        item_name: 待匹配的物品或食材名称。
        candidates: 每项至少包含 ``id``、``name`` 的小类候选。

    Returns:
        唯一精确匹配的小类；没有匹配或候选名称重复时返回 ``None``。
    """
    normalized_name = normalize_item_name(item_name)
    matches = [
        candidate
        for candidate in candidates
        if normalize_item_name(str(candidate.get("name", ""))) == normalized_name
    ]
    if len(matches) != 1:
        return None
    candidate = matches[0]
    return MatchResult(str(candidate["id"]), str(candidate["name"]), "builtin", 0.99)


def match_confirmed_item_name(
    item_name: str, candidates: list[dict[str, Any]], *, allow_suffix: bool = True
) -> MatchResult | None:
    """匹配用户确认过的名称映射，优先精确命中并安全支持复合名称后缀。

    ``candidates`` 的每项应包含 ``item_name``、``id`` 和 ``name``。复合名称只允许
    以用户确认名称结尾，例如“猪肉水饺”可以命中“水饺”，但不会因为前缀“猪肉”
    命中；多个同长度候选指向不同分类时返回 ``None``，交给更保守的后续规则。

    Args:
        item_name: 待匹配的物品或食材名称。
        candidates: 用户确认过的名称映射候选。
        allow_suffix: 是否允许完整名称的后缀匹配。

    Returns:
        唯一确定的用户分类映射；否则返回 ``None``。
    """
    normalized_name = normalize_item_name(item_name)
    if not normalized_name:
        return None
    exact = [
        candidate
        for candidate in candidates
        if normalize_item_name(str(candidate.get("item_name", ""))) == normalized_name
    ]
    if len(exact) == 1:
        candidate = exact[0]
        return MatchResult(str(candidate["id"]), str(candidate["name"]), "cache", 1.0)
    if len(exact) > 1:
        return None
    if not allow_suffix:
        return None

    suffix_candidates = [
        candidate
        for candidate in candidates
        if len(normalize_item_name(str(candidate.get("item_name", "")))) >= 2
        and _suffix_match(
            normalized_name, normalize_item_name(str(candidate.get("item_name", "")))
        )
    ]
    if not suffix_candidates:
        return None
    longest_length = max(
        len(normalize_item_name(str(candidate["item_name"])))
        for candidate in suffix_candidates
    )
    longest = [
        candidate
        for candidate in suffix_candidates
        if len(normalize_item_name(str(candidate["item_name"]))) == longest_length
    ]
    category_ids = {str(candidate["id"]) for candidate in longest}
    if len(category_ids) != 1:
        return None
    candidate = longest[0]
    return MatchResult(
        str(candidate["id"]), str(candidate["name"]), "cache", 0.96
    )


def match_item_name(
    item_name: str, candidates: list[dict[str, Any]], *, allow_uncertain: bool = False
) -> MatchResult | None:
    """在现有候选小类中执行保守的精确、别名和相似度匹配。

    Args:
        item_name: 待匹配的物品名称。
        candidates: 每项至少包含 ``id``、``name``，可选 ``aliases`` 列表。
        allow_uncertain: 为订单识别兜底时允许返回最高分候选，即使没有达到保守门槛。

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
    if len(exact) > 1 and not allow_uncertain:
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
    if not scored or (scored[0][0] < 0.92 and not allow_uncertain):
        return None
    if len(scored) > 1 and scored[0][0] - scored[1][0] < 0.12 and not allow_uncertain:
        return None
    candidate = scored[0][1]
    return MatchResult(
        str(candidate["id"]), str(candidate["name"]), "builtin", round(scored[0][0], 2)
    )
