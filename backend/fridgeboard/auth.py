"""P3 的所有者会话、冰箱端绑定与手机配对服务。

本模块只处理认证状态与短效凭证：所有持久化写入都在调用方提供的事务中完成，且
Passcode、二维码会话和设备凭证从不以明文写入数据库。它不实现 flycn 的身份认证，
外部 SSO 仅在路由层完成授权码兑换后把可信用户 ID 交给此服务。
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from fridgeboard.layout_service import LayoutService
from fridgeboard.layouts import get_template
from fridgeboard.persistence.models import (
    CategoryLocationPreference,
    ConsumptionLineModel,
    DeviceCredential,
    ExpirySettings,
    FirstBootPairingSession,
    FoodCategory,
    InventoryBatchModel,
    KindlePasscode,
    NotificationDelivery,
    NotificationSettings,
    OwnerSession,
    PairingSession,
    RecipeCompletion,
    RecipeEntry,
    RecipeIngredientModel,
    RecipePlan,
    Refrigerator,
    StorageSlot,
    StorageZone,
)


def _now() -> datetime:
    """返回不带时区的 UTC 时间，匹配 SQLite ``DateTime`` 的存储语义。"""
    return datetime.now(UTC).replace(tzinfo=None)


def _hash(value: str) -> str:
    """返回随机高熵机密值的 SHA-256 摘要，供数据库查找和泄漏隔离。"""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AccessService:
    """在一个 SQLAlchemy 会话中执行 P3 凭证生命周期操作。"""

    def __init__(self, session: Session) -> None:
        """绑定调用方管理事务边界的会话。"""
        self._session = session

    def create_owner_session(self, owner_user_id: str) -> str:
        """为已由 SSO 认证的所有者签发 30 天的不透明会话值。"""
        token = secrets.token_urlsafe(32)
        self._session.add(
            OwnerSession(
                token_hash=_hash(token),
                owner_user_id=owner_user_id,
                expires_at=_now() + timedelta(days=30),
            )
        )
        return token

    def owner_for_session(self, token: str | None) -> str | None:
        """验证管理会话并返回所有者 ID；空、撤销或过期会话返回空。"""
        if not token:
            return None
        record = self._session.scalar(
            select(OwnerSession).where(OwnerSession.token_hash == _hash(token))
        )
        if record is None or record.revoked_at is not None or record.expires_at <= _now():
            return None
        return record.owner_user_id

    def create_passcode(
        self,
        owner_user_id: str,
        refrigerator_id: str | None,
        new_refrigerator_name: str | None,
        new_template_key: str | None,
    ) -> str:
        """创建五分钟有效、单次使用的六位冰箱端兼容绑定码。

        Raises:
            ValueError: 当目标冰箱不属于所有者，或未提供新冰箱名称时抛出。
        """
        if refrigerator_id:
            refrigerator = self._session.get(Refrigerator, refrigerator_id)
            if refrigerator is None or refrigerator.owner_user_id != owner_user_id:
                raise ValueError("冰箱不存在或无权为其创建 Passcode")
        elif not new_refrigerator_name or not new_refrigerator_name.strip():
            raise ValueError("新建冰箱时必须提供名称")
        elif not new_template_key:
            raise ValueError("新建冰箱时必须选择模板")
        else:
            get_template(new_template_key)
        code = f"{secrets.randbelow(1_000_000):06d}"
        self._session.add(
            KindlePasscode(
                code_hash=_hash(code),
                owner_user_id=owner_user_id,
                refrigerator_id=refrigerator_id,
                new_refrigerator_name=new_refrigerator_name,
                new_template_key=new_template_key,
                expires_at=_now() + timedelta(minutes=5),
            )
        )
        return code

    def consume_passcode(self, code: str, label: str) -> tuple[DeviceCredential, str]:
        """消费口令，创建或绑定冰箱，并为冰箱端显示设备签发独立凭证。

        Raises:
            ValueError: 当口令无效、过期或已被使用时抛出。
        """
        passcode = self._session.scalar(
            select(KindlePasscode).where(KindlePasscode.code_hash == _hash(code))
        )
        if passcode is None or passcode.used_at is not None or passcode.expires_at <= _now():
            raise ValueError("Passcode 无效、已使用或已过期")
        refrigerator_id = passcode.refrigerator_id
        if refrigerator_id is None:
            refrigerator = LayoutService(self._session).create_refrigerator(
                passcode.owner_user_id,
                (passcode.new_refrigerator_name or "未命名冰箱").strip(),
                passcode.new_template_key or "",
            )
            refrigerator_id = refrigerator.id
        token = secrets.token_urlsafe(32)
        device = DeviceCredential(
            refrigerator_id=refrigerator_id,
            device_kind="kindle",
            credential_hash=_hash(token),
            label=label,
        )
        passcode.used_at = _now()
        self._session.add(device)
        self._session.flush()
        return device, token

    def device_for_token(
        self, token: str | None, kind: str | None = None
    ) -> DeviceCredential | None:
        """验证设备凭证并更新最后访问时间；可限制设备类型。"""
        if not token:
            return None
        device = self._session.scalar(
            select(DeviceCredential).where(DeviceCredential.credential_hash == _hash(token))
        )
        if device is None or device.revoked_at is not None or (kind and device.device_kind != kind):
            return None
        device.last_seen_at = _now()
        return device

    def create_pairing_session(self, kindle: DeviceCredential) -> tuple[PairingSession, str]:
        """让已绑定冰箱端显示设备创建十分钟、单次使用的手机配对会话。"""
        token = secrets.token_urlsafe(32)
        pairing = PairingSession(
            token_hash=_hash(token),
            refrigerator_id=kindle.refrigerator_id,
            kindle_device_id=kindle.id,
            expires_at=_now() + timedelta(minutes=10),
        )
        self._session.add(pairing)
        self._session.flush()
        return pairing, token

    def create_first_boot_pairing_session(self) -> tuple[FirstBootPairingSession, str, str]:
        """创建首次页面会话，并返回仅给手机和冰箱端各自持有的短效令牌。"""
        mobile_token = secrets.token_urlsafe(32)
        kindle_token = secrets.token_urlsafe(32)
        pairing = FirstBootPairingSession(
            mobile_token_hash=_hash(mobile_token),
            kindle_token_hash=_hash(kindle_token),
            expires_at=_now() + timedelta(minutes=10),
        )
        self._session.add(pairing)
        self._session.flush()
        return pairing, mobile_token, kindle_token

    def claim_first_boot_pairing(
        self,
        mobile_token: str,
        owner_user_id: str,
        label: str,
        refrigerator_id: str | None = None,
        new_refrigerator_name: str | None = None,
        new_template_key: str | None = None,
    ) -> tuple[DeviceCredential, str]:
        """由已认证手机领取首次开机二维码，并只为该 PWA 签发设备凭证。

        Raises:
            ValueError: 当二维码无效、已领取、过期或冰箱不属于所有者时抛出。
        """
        pairing = self._session.scalar(
            select(FirstBootPairingSession).where(
                FirstBootPairingSession.mobile_token_hash == _hash(mobile_token)
            )
        )
        if pairing is None or pairing.claimed_at is not None or pairing.expires_at <= _now():
            raise ValueError("首次配对二维码无效、已使用或已过期")
        if refrigerator_id:
            refrigerator = self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        elif new_refrigerator_name and new_refrigerator_name.strip() and new_template_key:
            get_template(new_template_key)
            refrigerator = LayoutService(self._session).create_refrigerator(
                owner_user_id, new_refrigerator_name.strip(), new_template_key
            )
        else:
            raise ValueError("请选择已有冰箱，或填写新冰箱名称和模板")
        token = secrets.token_urlsafe(32)
        device = DeviceCredential(
            refrigerator_id=refrigerator.id,
            device_kind="pwa",
            credential_hash=_hash(token),
            label=label,
        )
        pairing.refrigerator_id = refrigerator.id
        pairing.claimed_at = _now()
        self._session.add(device)
        self._session.flush()
        return device, token

    def bind_first_boot_kindle(
        self, kindle_token: str, label: str
    ) -> tuple[DeviceCredential, str] | None:
        """让冰箱端显示设备在手机领取后取得设备凭证；未领取时返回空。

        Raises:
            ValueError: 当冰箱端会话已失效或已完成绑定时抛出。
        """
        pairing = self._session.scalar(
            select(FirstBootPairingSession).where(
                FirstBootPairingSession.kindle_token_hash == _hash(kindle_token)
            )
        )
        if pairing is None or pairing.expires_at <= _now() or pairing.kindle_bound_at is not None:
            raise ValueError("首次配对会话无效、已完成或已过期")
        if pairing.claimed_at is None or pairing.refrigerator_id is None:
            return None
        token = secrets.token_urlsafe(32)
        device = DeviceCredential(
            refrigerator_id=pairing.refrigerator_id,
            device_kind="kindle",
            credential_hash=_hash(token),
            label=label,
        )
        pairing.kindle_bound_at = _now()
        self._session.add(device)
        self._session.flush()
        return device, token

    def consume_pairing(self, token: str, label: str) -> tuple[DeviceCredential, str]:
        """消费二维码会话，为一个 PWA 实例签发新设备凭证。

        Raises:
            ValueError: 当二维码已失效或已经使用时抛出。
        """
        pairing = self._session.scalar(
            select(PairingSession).where(PairingSession.token_hash == _hash(token))
        )
        if pairing is None or pairing.used_at is not None or pairing.expires_at <= _now():
            raise ValueError("配对二维码无效、已使用或已过期")
        token_value = secrets.token_urlsafe(32)
        device = DeviceCredential(
            refrigerator_id=pairing.refrigerator_id,
            device_kind="pwa",
            credential_hash=_hash(token_value),
            label=label,
        )
        pairing.used_at = _now()
        self._session.add(device)
        self._session.flush()
        return device, token_value

    def list_refrigerators_for_owner(self, owner_user_id: str) -> list[Refrigerator]:
        """返回所有者未软删除的冰箱。"""
        return list(
            self._session.scalars(
                select(Refrigerator).where(
                    Refrigerator.owner_user_id == owner_user_id,
                    Refrigerator.deleted_at.is_(None),
                )
            )
        )

    def list_deleted_refrigerators_for_owner(self, owner_user_id: str) -> list[Refrigerator]:
        """返回仍在 30 天恢复期内、按最近删除时间排序的冰箱。"""
        return list(
            self._session.scalars(
                select(Refrigerator)
                .where(
                    Refrigerator.owner_user_id == owner_user_id,
                    Refrigerator.deleted_at.is_not(None),
                )
                .order_by(Refrigerator.deleted_at.desc())
            )
        )

    def rename_refrigerator(
        self, owner_user_id: str, refrigerator_id: str, name: str
    ) -> Refrigerator:
        """更名所有者的活跃冰箱，并拒绝同名的活跃条目。"""
        refrigerator = self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        normalized = name.strip()
        if not normalized:
            raise ValueError("冰箱名称不能为空")
        duplicate = self._session.scalar(
            select(Refrigerator.id).where(
                Refrigerator.owner_user_id == owner_user_id,
                Refrigerator.deleted_at.is_(None),
                Refrigerator.name == normalized,
                Refrigerator.id != refrigerator_id,
            )
        )
        if duplicate is not None:
            raise ValueError("已有同名冰箱，请换一个名称")
        refrigerator.name = normalized
        refrigerator.revision += 1
        return refrigerator

    def assert_refrigerator_name_available(self, owner_user_id: str, name: str) -> str:
        """规范化并验证一个新冰箱名称在所有者活跃列表中唯一。"""
        normalized = name.strip()
        if not normalized:
            raise ValueError("冰箱名称不能为空")
        duplicate = self._session.scalar(
            select(Refrigerator.id).where(
                Refrigerator.owner_user_id == owner_user_id,
                Refrigerator.deleted_at.is_(None),
                Refrigerator.name == normalized,
            )
        )
        if duplicate is not None:
            raise ValueError("已有同名冰箱，请换一个名称")
        return normalized

    def delete_refrigerator(
        self, owner_user_id: str, refrigerator_id: str, confirmation_name: str
    ) -> None:
        """软删除冰箱并立即撤销全部设备凭证。"""
        refrigerator = self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        if confirmation_name != refrigerator.name:
            raise ValueError("请输入当前冰箱名称以确认删除")
        refrigerator.deleted_at = _now()
        refrigerator.revision += 1
        for credential in self._session.scalars(
            select(DeviceCredential).where(
                DeviceCredential.refrigerator_id == refrigerator_id,
                DeviceCredential.revoked_at.is_(None),
            )
        ):
            credential.revoked_at = _now()

    def restore_refrigerator(self, owner_user_id: str, refrigerator_id: str) -> Refrigerator:
        """恢复恢复期内的冰箱；若名称冲突则自动追加最小数字序号。"""
        refrigerator = self._session.get(Refrigerator, refrigerator_id)
        if (
            refrigerator is None
            or refrigerator.owner_user_id != owner_user_id
            or refrigerator.deleted_at is None
        ):
            raise ValueError("冰箱不存在或无权访问")
        if refrigerator.deleted_at <= _now() - timedelta(days=30):
            raise ValueError("恢复期限已过")
        refrigerator.name = self._restored_name(owner_user_id, refrigerator.name, refrigerator.id)
        refrigerator.deleted_at = None
        refrigerator.revision += 1
        return refrigerator

    def _restored_name(self, owner_user_id: str, name: str, refrigerator_id: str) -> str:
        """返回恢复后不与活跃冰箱冲突的名称，必要时追加数字序号。"""
        active_names = set(
            self._session.scalars(
                select(Refrigerator.name).where(
                    Refrigerator.owner_user_id == owner_user_id,
                    Refrigerator.deleted_at.is_(None),
                    Refrigerator.id != refrigerator_id,
                )
            )
        )
        if name not in active_names:
            return name
        suffix = 2
        while f"{name} {suffix}" in active_names:
            suffix += 1
        return f"{name} {suffix}"

    def purge_expired_refrigerators(self, now: datetime | None = None) -> int:
        """永久清理超过 30 天恢复期的冰箱及其关联数据。

        Args:
            now: 用于到期判定的本地时间；省略时使用当前 UTC 时间。

        Returns:
            实际永久删除的冰箱数量；重复调用不会删除未到期记录。
        """
        cutoff = (now or _now()) - timedelta(days=30)
        refrigerator_ids = list(self._session.scalars(select(Refrigerator.id).where(
            Refrigerator.deleted_at.is_not(None), Refrigerator.deleted_at <= cutoff
        )))
        if not refrigerator_ids:
            return 0
        plan_ids = select(RecipePlan.id).where(RecipePlan.refrigerator_id.in_(refrigerator_ids))
        entry_ids = select(RecipeEntry.id).where(RecipeEntry.recipe_plan_id.in_(plan_ids))
        completion_ids = select(RecipeCompletion.id).where(
            RecipeCompletion.recipe_entry_id.in_(entry_ids)
        )
        zone_ids = select(StorageZone.id).where(StorageZone.refrigerator_id.in_(refrigerator_ids))
        for model, column, ids in (
            (ConsumptionLineModel, ConsumptionLineModel.completion_id, completion_ids),
            (RecipeCompletion, RecipeCompletion.recipe_entry_id, entry_ids),
            (RecipeIngredientModel, RecipeIngredientModel.recipe_entry_id, entry_ids),
            (RecipeEntry, RecipeEntry.recipe_plan_id, plan_ids),
            (RecipePlan, RecipePlan.refrigerator_id, refrigerator_ids),
            (NotificationDelivery, NotificationDelivery.refrigerator_id, refrigerator_ids),
            (NotificationSettings, NotificationSettings.refrigerator_id, refrigerator_ids),
            (ExpirySettings, ExpirySettings.refrigerator_id, refrigerator_ids),
            (PairingSession, PairingSession.refrigerator_id, refrigerator_ids),
            (FirstBootPairingSession, FirstBootPairingSession.refrigerator_id, refrigerator_ids),
            (KindlePasscode, KindlePasscode.refrigerator_id, refrigerator_ids),
            (DeviceCredential, DeviceCredential.refrigerator_id, refrigerator_ids),
            (
                CategoryLocationPreference,
                CategoryLocationPreference.refrigerator_id,
                refrigerator_ids,
            ),
            (InventoryBatchModel, InventoryBatchModel.refrigerator_id, refrigerator_ids),
            (StorageSlot, StorageSlot.zone_id, zone_ids),
            (StorageZone, StorageZone.refrigerator_id, refrigerator_ids),
            (FoodCategory, FoodCategory.refrigerator_id, refrigerator_ids),
            (Refrigerator, Refrigerator.id, refrigerator_ids),
        ):
            self._session.execute(delete(model).where(column.in_(ids)))
        return len(refrigerator_ids)

    def list_devices(self, owner_user_id: str, refrigerator_id: str) -> list[DeviceCredential]:
        """列出指定冰箱的有效与已撤销设备，拒绝跨所有者访问。"""
        self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        return list(
            self._session.scalars(
                select(DeviceCredential).where(DeviceCredential.refrigerator_id == refrigerator_id)
            )
        )

    def device_ids_for_tokens(self, tokens: list[str], refrigerator_id: str) -> set[str]:
        """返回当前浏览器在指定冰箱持有的有效设备凭证 ID。

        Args:
            tokens: 从 Bearer 或 HttpOnly Cookie 解析出的原始设备凭证。
            refrigerator_id: 设备必须属于的冰箱 ID。

        Returns:
            与给定凭证匹配、仍有效且属于该冰箱的设备 ID 集合。
        """
        if not tokens:
            return set()
        token_hashes = {_hash(token) for token in tokens}
        return set(
            self._session.scalars(
                select(DeviceCredential.id).where(
                    DeviceCredential.refrigerator_id == refrigerator_id,
                    DeviceCredential.credential_hash.in_(token_hashes),
                    DeviceCredential.revoked_at.is_(None),
                )
            )
        )

    def revoke_device(self, owner_user_id: str, refrigerator_id: str, device_id: str) -> None:
        """立即撤销一台设备；重复撤销保持幂等。"""
        self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        device = self._session.get(DeviceCredential, device_id)
        if device is None or device.refrigerator_id != refrigerator_id:
            raise ValueError("设备不存在")
        if device.revoked_at is None:
            device.revoked_at = _now()

    def rename_device(
        self, owner_user_id: str, refrigerator_id: str, device_id: str, label: str
    ) -> DeviceCredential:
        """更新指定冰箱中一台有效设备的展示名称。

        Raises:
            ValueError: 当冰箱或设备不存在、无权访问或已撤销时抛出。
        """
        self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        device = self._session.get(DeviceCredential, device_id)
        if (
            device is None
            or device.refrigerator_id != refrigerator_id
            or device.revoked_at is not None
        ):
            raise ValueError("设备不存在或已移除")
        device.label = label
        return device

    def _require_owned_refrigerator(self, owner_user_id: str, refrigerator_id: str) -> Refrigerator:
        """返回所有者的活跃冰箱，未找到时统一拒绝以免泄漏归属。"""
        refrigerator = self._session.get(Refrigerator, refrigerator_id)
        if (
            refrigerator is None
            or refrigerator.owner_user_id != owner_user_id
            or refrigerator.deleted_at is not None
        ):
            raise ValueError("冰箱不存在或无权访问")
        return refrigerator
