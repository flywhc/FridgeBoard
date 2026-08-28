"""Authentication, device pairing, and owner access API schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from fridgeboard.api_refrigerator_models import RefrigeratorResponse


class HealthResponse(BaseModel):
    """容器存活探针返回的数据结构。"""

    status: str = Field(examples=["ok"], description="应用进程状态；健康时始终为 `ok`。")


class OwnerLoginResponse(BaseModel):
    """本地开发所有者登录的响应。"""

    owner_user_id: str = Field(examples=["42"])


class AuthenticationModeResponse(BaseModel):
    """当前部署要求 PWA 采用的所有者认证模式。"""

    mode: Literal["sso", "local"]


class AuthenticationStatusResponse(BaseModel):
    """返回当前请求的所有者会话状态和用户可见的登录名。"""

    authenticated: bool
    account: str | None = None


class MobileAuthExchangeRequest(BaseModel):
    """Capacitor App 用一次性授权码和 PKCE verifier 换取会话。"""

    code: str = Field(min_length=20, max_length=256)
    code_verifier: str = Field(min_length=43, max_length=128)
    redirect_uri: str = Field(min_length=1, max_length=512)


class MobileRefreshRequest(BaseModel):
    """Capacitor App 使用原生安全存储中的刷新令牌轮换会话。"""

    refresh_token: str = Field(min_length=20, max_length=256)


class MobileSessionResponse(BaseModel):
    """移动端短期访问令牌和仅供原生安全存储使用的刷新令牌。"""

    access_token: str
    refresh_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int = Field(examples=[900])


class PasscodeRequest(BaseModel):
    """创建冰箱端兼容绑定码的所有者请求。"""

    refrigerator_id: str | None = Field(default=None, examples=["fridge-001"])
    new_refrigerator_name: str | None = Field(default=None, examples=["家里冰箱"])
    new_template_key: str | None = Field(default=None, examples=["unconfigured"])
    purpose: Literal["bind_display_device", "replace_display_device"] = Field(
        default="bind_display_device",
        examples=["bind_display_device"],
        description="普通绑定不得替换已有冰箱端；换绑必须由所有者明确确认。",
    )


class PasscodeResponse(BaseModel):
    """只向所有者展示一次的冰箱端兼容绑定码。"""

    passcode: str = Field(examples=["042913"])
    expires_in_seconds: int = Field(examples=[300])


class KindleBindRequest(BaseModel):
    """冰箱端显示设备消费一次性兼容绑定码的请求。"""

    passcode: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$", examples=["042913"])
    label: str = Field(default="厨房冰箱端", min_length=1, max_length=120, examples=["厨房冰箱端"])


class DeviceQuantityAdjustRequest(BaseModel):
    """冰箱端对单个库存批次执行的明确数量操作。"""

    delta: int = Field(ge=-10000, le=1, examples=[-1])


class PairingCreateResponse(BaseModel):
    """冰箱端显示设备展示给手机的短效二维码载荷。"""

    pairing_token: str = Field(examples=["temporary-pairing-token"])
    pairing_url: str = Field(examples=["https://fridge.example/pair?token=temporary-pairing-token"])
    expires_in_seconds: int = Field(examples=[600])
    purpose: Literal["grant_pwa_access"] = Field(
        default="grant_pwa_access", examples=["grant_pwa_access"]
    )


class PairingConsumeRequest(BaseModel):
    """PWA 消费二维码会话的请求。"""

    pairing_token: str = Field(min_length=20, examples=["temporary-pairing-token"])
    standalone: Literal[True] = Field(
        examples=[True], description="仅 PWA standalone 上下文允许提交此值。"
    )
    label: str = Field(default="我的手机", min_length=1, max_length=120, examples=["小王的 iPhone"])
    client: Literal["pwa", "mobile"] = Field(
        default="pwa", description="移动 App 请求时返回 Bearer 设备凭证。"
    )


class FirstBootPairingCreateResponse(BaseModel):
    """未绑定冰箱端显示设备展示给手机的首次页面二维码载荷。"""

    pairing_token: str = Field(examples=["temporary-first-boot-token"])
    pairing_url: str = Field(
        examples=["https://fridge.example/pair?bootstrap=temporary-first-boot-token"]
    )
    expires_in_seconds: int = Field(examples=[600])
    purpose: Literal["bind_display_device"] = Field(
        default="bind_display_device", examples=["bind_display_device"]
    )


class FirstBootPairingClaimRequest(BaseModel):
    """PWA 领取首次开机二维码并选择目标冰箱的请求。"""

    pairing_token: str = Field(min_length=20, examples=["temporary-first-boot-token"])
    standalone: Literal[True] = Field(examples=[True])
    refrigerator_id: str | None = Field(default=None, min_length=1, examples=["fridge-001"])
    new_refrigerator_name: str | None = Field(default=None, min_length=1, max_length=120)
    new_template_key: str | None = Field(default=None, min_length=1, max_length=64)
    label: str = Field(default="我的手机", min_length=1, max_length=120)
    purpose: Literal["bind_display_device", "replace_display_device"] = Field(
        default="bind_display_device",
        examples=["replace_display_device"],
        description="替换已绑定冰箱端时必须显式传入 `replace_display_device`。",
    )
    client: Literal["pwa", "mobile"] = Field(
        default="pwa", description="移动 App 请求时返回 Bearer 设备凭证。"
    )


class FirstBootPairingStatusResponse(BaseModel):
    """冰箱端显示设备轮询首次页面绑定是否已由手机完成。"""

    state: Literal["pending", "bound"]
    refrigerator: RefrigeratorResponse | None = None


class KindlePageStateResponse(BaseModel):
    """Kindle 页面决定首次启动、已配置或撤销提示所需的最小状态。"""

    state: Literal["unconfigured", "configured", "revoked"] = Field(examples=["configured"])


class PairingSessionStatusResponse(BaseModel):
    """Kindle 当前“添加手机”二维码的消费状态。"""

    state: Literal["pending", "used", "expired", "missing"] = Field(examples=["pending"])
    expires_in_seconds: int | None = Field(default=None, examples=[584])
