"""P3 的所有者会话、冰箱端绑定与手机配对服务。

本模块只处理认证状态与短效凭证：所有持久化写入都在调用方提供的事务中完成，且
Passcode、二维码会话和设备凭证从不以明文写入数据库。它不实现 flycn 的身份认证，
外部 SSO 仅在路由层完成授权码兑换后把可信用户 ID 交给此服务。
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.icon_service import schedule_removal_after_commit, scoped_asset_path
from fridgeboard.layout_service import LayoutService
from fridgeboard.layouts import get_template
from fridgeboard.persistence.models import (
    ConsumptionLineModel,
    DeviceCredential,
    ExpirySettings,
    FirstBootPairingSession,
    FoodCategory,
    IconAsset,
    IconGenerationCandidate,
    IconGenerationSession,
    InventoryBatchModel,
    KindlePasscode,
    MobileAuthorizationCode,
    MobileSession,
    NotificationDelivery,
    NotificationSettings,
    OwnerSession,
    PairingSession,
    RecentSubcategoryUsage,
    RecipeCompletion,
    RecipeEntry,
    RecipeIngredientModel,
    RecipePlan,
    Refrigerator,
    StorageSlot,
    StorageZone,
)


class DisplayDeviceConflictError(ValueError):
    """目标冰箱已存在活跃显示设备，而请求未明确要求换绑。"""


def _now() -> datetime:
    """返回不带时区的 UTC 时间，匹配 SQLite ``DateTime`` 的存储语义。"""
    return datetime.now(UTC).replace(tzinfo=None)


def _hash(value: str) -> str:
    """返回随机高熵机密值的 SHA-256 摘要，供数据库查找和泄漏隔离。"""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _pkce_challenge(verifier: str) -> str:
    """按 RFC 7636 S256 计算 PKCE challenge。"""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


class AccessService:
    """在一个 SQLAlchemy 会话中执行 P3 凭证生命周期操作。"""

    def __init__(self, session: AsyncSession) -> None:
        """绑定调用方管理事务边界的会话。"""
        self._session = session

    async def create_owner_session(self, owner_user_id: str) -> str:
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

    async def create_mobile_authorization_code(
        self,
        owner_user_id: str,
        redirect_uri: str,
        code_challenge: str,
        *,
        sso_code: str | None = None,
        sso_state: str | None = None,
        mobile_state: str | None = None,
    ) -> str:
        """创建五分钟有效的 App 授权码。

        Args:
            owner_user_id: 已由上游 SSO 验证的所有者 ID。
            redirect_uri: App 完成兑换后允许回跳的固定地址。
            code_challenge: RFC 7636 S256 challenge。
            sso_code: 上游 SSO 授权码，用于处理浏览器重复回调。
            sso_state: 上游 SSO 回调 state，用于校验浏览器重复回调。
            mobile_state: App 生成并等待回传的 state。
        """
        code = secrets.token_urlsafe(32)
        self._session.add(
            MobileAuthorizationCode(
                code_hash=_hash(code),
                sso_code_hash=_hash(sso_code) if sso_code else None,
                sso_state=sso_state,
                owner_user_id=owner_user_id,
                redirect_uri=redirect_uri,
                mobile_state=mobile_state,
                code_challenge=code_challenge,
                expires_at=_now() + timedelta(minutes=5),
            )
        )
        return code

    async def find_mobile_sso_replay(
        self, sso_code: str, sso_state: str
    ) -> MobileAuthorizationCode | None:
        """查找仍可恢复的重复 SSO 回调记录。

        Args:
            sso_code: flycn 返回的上游一次性授权码。
            sso_state: 当前回调携带的上游 SSO state。

        Returns:
            与上游授权码和 SSO state 同时匹配且尚未过期的记录；否则返回 ``None``。
        """
        record = await self._session.scalar(
            select(MobileAuthorizationCode).where(
                MobileAuthorizationCode.sso_code_hash == _hash(sso_code),
                MobileAuthorizationCode.sso_state == sso_state,
            )
        )
        if record is None or record.expires_at <= _now():
            return None
        return record

    async def exchange_mobile_authorization_code(
        self,
        code: str,
        code_verifier: str,
        redirect_uri: str,
        label: str = "FridgeBoard App",
    ) -> tuple[str, str] | None:
        """消费一次性 App 授权码并创建短期访问/刷新令牌。"""
        record = await self._session.scalar(
            select(MobileAuthorizationCode).where(
                MobileAuthorizationCode.code_hash == _hash(code)
            )
        )
        if (
            record is None
            or record.used_at is not None
            or record.expires_at <= _now()
            or record.redirect_uri != redirect_uri
            or record.code_challenge_method != "S256"
        ):
            return None
        try:
            valid_pkce = secrets.compare_digest(
                record.code_challenge, _pkce_challenge(code_verifier)
            )
        except (UnicodeEncodeError, ValueError):
            valid_pkce = False
        if not valid_pkce:
            return None
        record.used_at = _now()
        return await self._create_mobile_session(record.owner_user_id, label)

    async def _create_mobile_session(self, owner_user_id: str, label: str) -> tuple[str, str]:
        """创建一条只保存令牌摘要的 App 会话。"""
        access_token = secrets.token_urlsafe(32)
        refresh_token = secrets.token_urlsafe(48)
        now = _now()
        self._session.add(
            MobileSession(
                owner_user_id=owner_user_id,
                access_token_hash=_hash(access_token),
                refresh_token_hash=_hash(refresh_token),
                access_expires_at=now + timedelta(minutes=15),
                refresh_expires_at=None,
                label=label[:120],
            )
        )
        return access_token, refresh_token

    async def owner_for_mobile_access(self, token: str | None) -> str | None:
        """验证短期 App Bearer 令牌并返回所有者 ID。"""
        if not token:
            return None
        record = await self._session.scalar(
            select(MobileSession).where(MobileSession.access_token_hash == _hash(token))
        )
        if (
            record is None
            or record.revoked_at is not None
            or record.access_expires_at <= _now()
        ):
            return None
        record.last_used_at = _now()
        return record.owner_user_id

    async def rotate_mobile_refresh_token(self, refresh_token: str) -> tuple[str, str] | None:
        """用长期刷新令牌签发新的访问令牌。

        刷新令牌保持可重复使用，直到用户主动退出或服务端撤销会话。移动端网络
        中断时可能收不到刷新响应；保留同一个刷新令牌可让下一次请求恢复，而不会
        因一次丢包把用户强制退出。
        """
        record = await self._session.scalar(
            select(MobileSession).where(MobileSession.refresh_token_hash == _hash(refresh_token))
        )
        if (
            record is None
            or record.revoked_at is not None
        ):
            return None
        access_token = secrets.token_urlsafe(32)
        record.access_token_hash = _hash(access_token)
        record.access_expires_at = _now() + timedelta(minutes=15)
        record.last_used_at = _now()
        return access_token, refresh_token

    async def revoke_mobile_access(self, access_token: str | None) -> bool:
        """撤销当前 App 会话，不暴露令牌是否曾经存在。"""
        if not access_token:
            return False
        record = await self._session.scalar(
            select(MobileSession).where(MobileSession.access_token_hash == _hash(access_token))
        )
        if record is None or record.revoked_at is not None:
            return False
        record.revoked_at = _now()
        return True

    async def owner_for_session(self, token: str | None) -> str | None:
        """验证管理会话并返回所有者 ID；空、撤销或过期会话返回空。"""
        if not token:
            return None
        record = await self._session.scalar(
            select(OwnerSession).where(OwnerSession.token_hash == _hash(token))
        )
        if record is None or record.revoked_at is not None or record.expires_at <= _now():
            return None
        return record.owner_user_id

    async def create_passcode(
        self,
        owner_user_id: str,
        refrigerator_id: str | None,
        new_refrigerator_name: str | None,
        new_template_key: str | None,
        purpose: str = "bind_display_device",
    ) -> str:
        """创建五分钟有效、单次使用的六位冰箱端兼容绑定码。

        Raises:
            ValueError: 当目标冰箱不属于所有者，或未提供新冰箱名称时抛出。
        """
        if purpose not in {"bind_display_device", "replace_display_device"}:
            raise ValueError("不支持的冰箱端绑定用途")
        if refrigerator_id:
            refrigerator = await self._session.get(Refrigerator, refrigerator_id)
            if (
                refrigerator is None
                or refrigerator.owner_user_id != owner_user_id
                or refrigerator.deleted_at is not None
            ):
                raise ValueError("冰箱不存在或无权为其创建 Passcode")
            if purpose == "bind_display_device":
                await self._assert_no_active_display_device(refrigerator_id)
            elif not await self._has_active_display_device(refrigerator_id):
                raise ValueError("该冰箱没有可替换的活跃冰箱端")
        elif not new_refrigerator_name or not new_refrigerator_name.strip():
            raise ValueError("新建冰箱时必须提供名称")
        elif not new_template_key:
            raise ValueError("新建冰箱时必须选择模板")
        elif purpose == "replace_display_device":
            raise ValueError("新建冰箱只能使用普通绑定用途")
        else:
            get_template(new_template_key)
            await self.assert_refrigerator_name_available(owner_user_id, new_refrigerator_name)
        code = f"{secrets.randbelow(1_000_000):06d}"
        self._session.add(
            KindlePasscode(
                code_hash=_hash(code),
                owner_user_id=owner_user_id,
                refrigerator_id=refrigerator_id,
                new_refrigerator_name=new_refrigerator_name,
                new_template_key=new_template_key,
                purpose=purpose,
                expires_at=_now() + timedelta(minutes=5),
            )
        )
        return code

    async def consume_passcode(self, code: str, label: str) -> tuple[DeviceCredential, str]:
        """消费口令，创建或绑定冰箱，并为冰箱端显示设备签发独立凭证。

        Raises:
            ValueError: 当口令无效、过期或已被使用时抛出。
        """
        passcode = await self._session.scalar(
            select(KindlePasscode).where(KindlePasscode.code_hash == _hash(code))
        )
        if passcode is None or passcode.used_at is not None or passcode.expires_at <= _now():
            raise ValueError("Passcode 无效、已使用或已过期")
        refrigerator_id = passcode.refrigerator_id
        if refrigerator_id is None:
            refrigerator = await LayoutService(self._session).create_refrigerator(
                passcode.owner_user_id,
                (passcode.new_refrigerator_name or "未命名冰箱").strip(),
                passcode.new_template_key or "",
            )
            refrigerator_id = refrigerator.id
        else:
            refrigerator = await self._session.get(Refrigerator, refrigerator_id)
            if refrigerator is None or refrigerator.deleted_at is not None:
                raise ValueError("冰箱不存在或已删除")
            if passcode.purpose == "bind_display_device":
                await self._assert_no_active_display_device(refrigerator_id)
            elif passcode.purpose != "replace_display_device":
                raise ValueError("不支持的冰箱端绑定用途")
            elif not await self._has_active_display_device(refrigerator_id):
                raise ValueError("该冰箱没有可替换的活跃冰箱端")
        if passcode.purpose not in {"bind_display_device", "replace_display_device"}:
            raise ValueError("不支持的冰箱端绑定用途")
        token = secrets.token_urlsafe(32)
        device = DeviceCredential(
            refrigerator_id=refrigerator_id,
            device_kind="kindle",
            credential_hash=_hash(token),
            label=label,
        )
        if passcode.purpose == "replace_display_device":
            await self._revoke_active_display_devices(refrigerator_id)
        passcode.used_at = _now()
        self._session.add(device)
        await self._session.flush()
        return device, token

    async def device_for_token(
        self, token: str | None, kind: str | None = None
    ) -> DeviceCredential | None:
        """验证设备凭证并更新最后访问时间；可限制设备类型。"""
        if not token:
            return None
        device = await self._session.scalar(
            select(DeviceCredential).where(DeviceCredential.credential_hash == _hash(token))
        )
        if device is None or device.revoked_at is not None or (kind and device.device_kind != kind):
            return None
        device.last_seen_at = _now()
        return device

    async def create_pairing_session(self, kindle: DeviceCredential) -> tuple[PairingSession, str]:
        """让已绑定冰箱端显示设备创建十分钟、单次使用的手机配对会话。"""
        token = secrets.token_urlsafe(32)
        pairing = PairingSession(
            token_hash=_hash(token),
            refrigerator_id=kindle.refrigerator_id,
            kindle_device_id=kindle.id,
            purpose="grant_pwa_access",
            expires_at=_now() + timedelta(minutes=10),
        )
        self._session.add(pairing)
        await self._session.flush()
        return pairing, token

    async def create_first_boot_pairing_session(self) -> tuple[FirstBootPairingSession, str, str]:
        """创建首次页面会话，并返回仅给手机和冰箱端各自持有的短效令牌。"""
        mobile_token = secrets.token_urlsafe(32)
        kindle_token = secrets.token_urlsafe(32)
        pairing = FirstBootPairingSession(
            mobile_token_hash=_hash(mobile_token),
            kindle_token_hash=_hash(kindle_token),
            expires_at=_now() + timedelta(minutes=10),
        )
        self._session.add(pairing)
        await self._session.flush()
        return pairing, mobile_token, kindle_token

    async def claim_first_boot_pairing(
        self,
        mobile_token: str,
        owner_user_id: str,
        label: str,
        refrigerator_id: str | None = None,
        new_refrigerator_name: str | None = None,
        new_template_key: str | None = None,
        purpose: str = "bind_display_device",
    ) -> tuple[DeviceCredential, str]:
        """由已认证手机领取首次开机二维码，并只为该 PWA 签发设备凭证。

        Raises:
            ValueError: 当二维码无效、已领取、过期或冰箱不属于所有者时抛出。
        """
        pairing = await self._session.scalar(
            select(FirstBootPairingSession).where(
                FirstBootPairingSession.mobile_token_hash == _hash(mobile_token)
            )
        )
        if pairing is None or pairing.claimed_at is not None or pairing.expires_at <= _now():
            raise ValueError("首次配对二维码无效、已使用或已过期")
        if purpose not in {"bind_display_device", "replace_display_device"}:
            raise ValueError("不支持的冰箱端绑定用途")
        if refrigerator_id:
            refrigerator = await self._require_owned_refrigerator(owner_user_id, refrigerator_id)
            if purpose == "bind_display_device":
                await self._assert_no_active_display_device(refrigerator.id)
        elif new_refrigerator_name and new_refrigerator_name.strip() and new_template_key:
            if purpose == "replace_display_device":
                raise ValueError("新建冰箱只能使用普通绑定用途")
            name = await self.assert_refrigerator_name_available(
                owner_user_id, new_refrigerator_name
            )
            refrigerator = await LayoutService(self._session).create_unconfigured_refrigerator(
                owner_user_id, name, new_template_key
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
        pairing.target_refrigerator_id = refrigerator.id
        pairing.purpose = purpose
        pairing.claimed_at = _now()
        self._session.add(device)
        await self._session.flush()
        return device, token

    async def bind_first_boot_kindle(
        self, kindle_token: str, label: str
    ) -> tuple[DeviceCredential, str] | None:
        """让冰箱端显示设备在手机领取后取得设备凭证；未领取时返回空。

        Raises:
            ValueError: 当冰箱端会话已失效或已完成绑定时抛出。
        """
        pairing = await self._session.scalar(
            select(FirstBootPairingSession).where(
                FirstBootPairingSession.kindle_token_hash == _hash(kindle_token)
            )
        )
        if pairing is None or pairing.expires_at <= _now() or pairing.kindle_bound_at is not None:
            raise ValueError("首次配对会话无效、已完成或已过期")
        if pairing.claimed_at is None or pairing.refrigerator_id is None:
            return None
        if pairing.purpose == "bind_display_device":
            await self._assert_no_active_display_device(pairing.refrigerator_id)
        elif pairing.purpose != "replace_display_device":
            raise ValueError("不支持的冰箱端绑定用途")
        token = secrets.token_urlsafe(32)
        device = DeviceCredential(
            refrigerator_id=pairing.refrigerator_id,
            device_kind="kindle",
            credential_hash=_hash(token),
            label=label,
        )
        if pairing.purpose == "replace_display_device":
            await self._revoke_active_display_devices(pairing.refrigerator_id)
        pairing.kindle_bound_at = _now()
        self._session.add(device)
        await self._session.flush()
        return device, token

    async def consume_pairing(
        self, token: str, label: str, existing_device_tokens: list[str]
    ) -> tuple[DeviceCredential, str | None]:
        """消费二维码会话，为一个 PWA 实例签发新设备凭证。

        Raises:
            ValueError: 当二维码已失效或已经使用时抛出。
        """
        pairing = await self._session.scalar(
            select(PairingSession).where(PairingSession.token_hash == _hash(token))
        )
        if pairing is None or pairing.expires_at <= _now() or pairing.purpose != "grant_pwa_access":
            raise ValueError("配对二维码无效、已使用或已过期")
        existing_device = await self._existing_pwa_device(
            pairing.refrigerator_id, existing_device_tokens
        )
        if pairing.used_at is not None:
            if existing_device is not None:
                return existing_device, None
            raise ValueError("配对二维码无效、已使用或已过期")
        if existing_device is not None:
            pairing.used_at = _now()
            return existing_device, None
        token_value = secrets.token_urlsafe(32)
        device = DeviceCredential(
            refrigerator_id=pairing.refrigerator_id,
            device_kind="pwa",
            credential_hash=_hash(token_value),
            label=label,
        )
        pairing.used_at = _now()
        self._session.add(device)
        await self._session.flush()
        return device, token_value

    async def pairing_session_status(self, kindle_device_id: str) -> tuple[str, int | None]:
        """返回冰箱端最新“添加手机”二维码的页面状态和剩余秒数。"""
        pairing = await self._session.scalar(
            select(PairingSession)
            .where(PairingSession.kindle_device_id == kindle_device_id)
            .order_by(PairingSession.expires_at.desc())
        )
        if pairing is None:
            return "missing", None
        if pairing.used_at is not None:
            return "used", 0
        remaining_seconds = max(0, int((pairing.expires_at - _now()).total_seconds()))
        if remaining_seconds == 0:
            return "expired", 0
        return "pending", remaining_seconds

    async def _existing_pwa_device(
        self, refrigerator_id: str, existing_device_tokens: list[str]
    ) -> DeviceCredential | None:
        """找到当前 PWA 已持有的目标冰箱访问凭证，避免重复扫码创建副本。"""
        if not existing_device_tokens:
            return None
        token_hashes = {_hash(token) for token in existing_device_tokens}
        return await self._session.scalar(
            select(DeviceCredential).where(
                DeviceCredential.refrigerator_id == refrigerator_id,
                DeviceCredential.device_kind == "pwa",
                DeviceCredential.credential_hash.in_(token_hashes),
                DeviceCredential.revoked_at.is_(None),
            )
        )

    async def _assert_no_active_display_device(self, refrigerator_id: str) -> None:
        """拒绝把普通绑定静默升级为替换已有冰箱端。"""
        if await self._has_active_display_device(refrigerator_id):
            raise DisplayDeviceConflictError("该冰箱已有活跃冰箱端，请确认后使用换绑流程")

    async def _has_active_display_device(self, refrigerator_id: str) -> bool:
        """判断冰箱是否已有未撤销的 Kindle 凭证。"""
        active_device = await self._session.scalar(
            select(DeviceCredential.id).where(
                DeviceCredential.refrigerator_id == refrigerator_id,
                DeviceCredential.device_kind == "kindle",
                DeviceCredential.revoked_at.is_(None),
            )
        )
        return active_device is not None

    async def _revoke_active_display_devices(
        self, refrigerator_id: str, *, except_device_id: str | None = None
    ) -> None:
        """在同一事务中撤销同一冰箱的旧显示设备，供原子换绑使用。"""
        statement = select(DeviceCredential).where(
            DeviceCredential.refrigerator_id == refrigerator_id,
            DeviceCredential.device_kind == "kindle",
            DeviceCredential.revoked_at.is_(None),
        )
        if except_device_id is not None:
            statement = statement.where(DeviceCredential.id != except_device_id)
        now = _now()
        for device in await self._session.scalars(statement):
            device.revoked_at = now

    async def list_refrigerators_for_owner(self, owner_user_id: str) -> list[Refrigerator]:
        """返回所有者未软删除的冰箱。"""
        return list(
            await self._session.scalars(
                select(Refrigerator)
                .where(
                    Refrigerator.owner_user_id == owner_user_id,
                    Refrigerator.deleted_at.is_(None),
                )
                .order_by(Refrigerator.name, Refrigerator.id)
            )
        )

    async def list_refrigerators_for_access(
        self, owner_user_id: str | None, device_tokens: list[str]
    ) -> list[tuple[Refrigerator, str]]:
        """合并账号所有权与当前 PWA 实例的日常访问范围。

        Args:
            owner_user_id: 已登录账号；为空时只返回设备凭证可访问的冰箱。
            device_tokens: 当前请求携带的设备凭证，只接受其中的 PWA 凭证。

        Returns:
            按冰箱名称和稳定 ID 排序的 ``(冰箱, access_role)``，同一冰箱只保留一项；
            同时属于账号和 PWA 的冰箱以 ``owner`` 角色返回。
        """
        refrigerator_ids: set[str] = set()
        if owner_user_id is not None:
            refrigerator_ids.update(
                await self._session.scalars(
                    select(Refrigerator.id).where(
                        Refrigerator.owner_user_id == owner_user_id,
                        Refrigerator.deleted_at.is_(None),
                    )
                )
            )
        if device_tokens:
            token_hashes = {_hash(token) for token in device_tokens}
            refrigerator_ids.update(
                await self._session.scalars(
                    select(DeviceCredential.refrigerator_id)
                    .join(Refrigerator, Refrigerator.id == DeviceCredential.refrigerator_id)
                    .where(
                        DeviceCredential.credential_hash.in_(token_hashes),
                        DeviceCredential.device_kind == "pwa",
                        DeviceCredential.revoked_at.is_(None),
                        Refrigerator.deleted_at.is_(None),
                    )
                )
            )
        if not refrigerator_ids:
            return []
        refrigerators = list(
            await self._session.scalars(
                select(Refrigerator)
                .where(Refrigerator.id.in_(refrigerator_ids), Refrigerator.deleted_at.is_(None))
                .order_by(Refrigerator.name, Refrigerator.id)
            )
        )
        return [
            (
                refrigerator,
                "owner" if refrigerator.owner_user_id == owner_user_id else "daily_access",
            )
            for refrigerator in refrigerators
        ]

    async def list_deleted_refrigerators_for_owner(self, owner_user_id: str) -> list[Refrigerator]:
        """返回仍在 30 天恢复期内、按最近删除时间排序的冰箱。"""
        return list(
            await self._session.scalars(
                select(Refrigerator)
                .where(
                    Refrigerator.owner_user_id == owner_user_id,
                    Refrigerator.deleted_at.is_not(None),
                    Refrigerator.deleted_at > _now() - timedelta(days=30),
                )
                .order_by(Refrigerator.deleted_at.desc())
            )
        )

    async def rename_refrigerator(
        self, owner_user_id: str, refrigerator_id: str, name: str
    ) -> Refrigerator:
        """更名所有者的活跃冰箱，并拒绝同名的活跃条目。"""
        refrigerator = await self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        normalized = name.strip()
        if not normalized:
            raise ValueError("冰箱名称不能为空")
        duplicate = await self._session.scalar(
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

    async def assert_refrigerator_name_available(self, owner_user_id: str, name: str) -> str:
        """规范化并验证一个新冰箱名称在所有者活跃列表中唯一。"""
        normalized = name.strip()
        if not normalized:
            raise ValueError("冰箱名称不能为空")
        duplicate = await self._session.scalar(
            select(Refrigerator.id).where(
                Refrigerator.owner_user_id == owner_user_id,
                Refrigerator.deleted_at.is_(None),
                Refrigerator.name == normalized,
            )
        )
        if duplicate is not None:
            raise ValueError("已有同名冰箱，请换一个名称")
        return normalized

    async def delete_refrigerator(
        self, owner_user_id: str, refrigerator_id: str, confirmation_name: str
    ) -> None:
        """软删除冰箱并立即撤销全部设备凭证。"""
        refrigerator = await self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        if confirmation_name != refrigerator.name:
            raise ValueError("请输入当前冰箱名称以确认删除")
        refrigerator.deleted_at = _now()
        refrigerator.revision += 1
        for credential in await self._session.scalars(
            select(DeviceCredential).where(
                DeviceCredential.refrigerator_id == refrigerator_id,
                DeviceCredential.revoked_at.is_(None),
            )
        ):
            credential.revoked_at = _now()

    async def restore_refrigerator(self, owner_user_id: str, refrigerator_id: str) -> Refrigerator:
        """恢复恢复期内的冰箱；若名称冲突则自动追加最小数字序号。"""
        refrigerator = await self._session.get(Refrigerator, refrigerator_id)
        if (
            refrigerator is None
            or refrigerator.owner_user_id != owner_user_id
            or refrigerator.deleted_at is None
        ):
            raise ValueError("冰箱不存在或无权访问")
        if refrigerator.deleted_at <= _now() - timedelta(days=30):
            raise ValueError("恢复期限已过")
        refrigerator.name = await self._restored_name(
            owner_user_id, refrigerator.name, refrigerator.id
        )
        refrigerator.deleted_at = None
        refrigerator.revision += 1
        return refrigerator

    async def _restored_name(self, owner_user_id: str, name: str, refrigerator_id: str) -> str:
        """返回恢复后不与活跃冰箱冲突的名称，必要时追加数字序号。"""
        active_names = set(
            await self._session.scalars(
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

    async def purge_expired_refrigerators(
        self,
        now: datetime | None = None,
        *,
        persistent_icon_dir: Path | None = None,
        temporary_icon_dir: Path | None = None,
    ) -> int:
        """永久清理超过 30 天恢复期的冰箱及其关联数据。

        Args:
            now: 用于到期判定的本地时间；省略时使用当前 UTC 时间。
            persistent_icon_dir: 已确认自定义图标目录；传入时在提交后删除对应文件。
            temporary_icon_dir: Agnes 临时候选目录；传入时在提交后删除对应会话目录。

        Returns:
            实际永久删除的冰箱数量；重复调用不会删除未到期记录。
        """
        cutoff = (now or _now()) - timedelta(days=30)
        refrigerator_ids = list(
            await self._session.scalars(
                select(Refrigerator.id).where(
                    Refrigerator.deleted_at.is_not(None), Refrigerator.deleted_at <= cutoff
                )
            )
        )
        if not refrigerator_ids:
            return 0
        plan_ids = select(RecipePlan.id).where(RecipePlan.refrigerator_id.in_(refrigerator_ids))
        entry_ids = select(RecipeEntry.id).where(RecipeEntry.recipe_plan_id.in_(plan_ids))
        completion_ids = select(RecipeCompletion.id).where(
            RecipeCompletion.recipe_entry_id.in_(entry_ids)
        )
        zone_ids = select(StorageZone.id).where(StorageZone.refrigerator_id.in_(refrigerator_ids))
        generation_ids = select(IconGenerationSession.id).where(
            IconGenerationSession.refrigerator_id.in_(refrigerator_ids)
        )
        if persistent_icon_dir is not None:
            asset_paths = await self._session.scalars(
                select(IconAsset.storage_path).where(
                    IconAsset.refrigerator_id.in_(refrigerator_ids),
                    IconAsset.source != "builtin",
                )
            )
            for relative_path in asset_paths:
                schedule_removal_after_commit(
                    self._session, scoped_asset_path(persistent_icon_dir, relative_path)
                )
        if temporary_icon_dir is not None:
            for generation_id in await self._session.scalars(generation_ids):
                schedule_removal_after_commit(
                    self._session, scoped_asset_path(temporary_icon_dir, generation_id)
                )
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
            (IconGenerationCandidate, IconGenerationCandidate.session_id, generation_ids),
            (IconGenerationSession, IconGenerationSession.refrigerator_id, refrigerator_ids),
            (RecentSubcategoryUsage, RecentSubcategoryUsage.refrigerator_id, refrigerator_ids),
            (InventoryBatchModel, InventoryBatchModel.refrigerator_id, refrigerator_ids),
            (StorageSlot, StorageSlot.zone_id, zone_ids),
            (StorageZone, StorageZone.refrigerator_id, refrigerator_ids),
            (FoodCategory, FoodCategory.refrigerator_id, refrigerator_ids),
            (IconAsset, IconAsset.refrigerator_id, refrigerator_ids),
            (Refrigerator, Refrigerator.id, refrigerator_ids),
        ):
            await self._session.execute(delete(model).where(column.in_(ids)))
        return len(refrigerator_ids)

    async def list_devices(
        self, owner_user_id: str, refrigerator_id: str
    ) -> list[DeviceCredential]:
        """列出指定冰箱的有效与已撤销设备，拒绝跨所有者访问。"""
        await self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        return list(
            await self._session.scalars(
                select(DeviceCredential).where(DeviceCredential.refrigerator_id == refrigerator_id)
            )
        )

    async def device_ids_for_tokens(self, tokens: list[str], refrigerator_id: str) -> set[str]:
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
            await self._session.scalars(
                select(DeviceCredential.id).where(
                    DeviceCredential.refrigerator_id == refrigerator_id,
                    DeviceCredential.credential_hash.in_(token_hashes),
                    DeviceCredential.revoked_at.is_(None),
                )
            )
        )

    async def revoke_device(self, owner_user_id: str, refrigerator_id: str, device_id: str) -> None:
        """立即撤销一台设备；重复撤销保持幂等。"""
        await self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        device = await self._session.get(DeviceCredential, device_id)
        if device is None or device.refrigerator_id != refrigerator_id:
            raise ValueError("设备不存在")
        if device.revoked_at is None:
            device.revoked_at = _now()

    async def rename_device(
        self, owner_user_id: str, refrigerator_id: str, device_id: str, label: str
    ) -> DeviceCredential:
        """更新指定冰箱中一台有效设备的展示名称。

        Raises:
            ValueError: 当冰箱或设备不存在、无权访问或已撤销时抛出。
        """
        await self._require_owned_refrigerator(owner_user_id, refrigerator_id)
        device = await self._session.get(DeviceCredential, device_id)
        if (
            device is None
            or device.refrigerator_id != refrigerator_id
            or device.revoked_at is not None
        ):
            raise ValueError("设备不存在或已移除")
        device.label = label
        return device

    async def _require_owned_refrigerator(
        self, owner_user_id: str, refrigerator_id: str
    ) -> Refrigerator:
        """返回所有者的活跃冰箱，未找到时统一拒绝以免泄漏归属。"""
        refrigerator = await self._session.get(Refrigerator, refrigerator_id)
        if (
            refrigerator is None
            or refrigerator.owner_user_id != owner_user_id
            or refrigerator.deleted_at is not None
        ):
            raise ValueError("冰箱不存在或无权访问")
        return refrigerator
