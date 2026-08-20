"""P13.3 Capacitor App 会话、PKCE 和撤销接口测试。"""

import asyncio
import base64
import hashlib
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

import fridgeboard.main as main_module
import httpx
import pytest
from fastapi.testclient import TestClient
from fridgeboard.main import create_app, normalize_flycn_authorize_url
from fridgeboard.persistence.database import (
    create_database_engine,
    create_database_schema,
    create_session_factory,
    transaction,
)


def _challenge(verifier: str) -> str:
    """为测试生成 RFC 7636 S256 challenge。"""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _app(tmp_path: Path) -> tuple[TestClient, TestClient]:
    """创建带开发所有者的 SSO 应用和不带隐式所有者的 Bearer 客户端。"""
    database_url = f"sqlite:///{tmp_path / 'mobile-auth.db'}"
    create_database_schema(database_url)
    application = create_app(
        database_url=database_url,
        development_owner_user_id="owner-1",
        public_base_url="https://fridge.example",
        flycn_authorize_url="https://flycn.example/authorize",
        flycn_exchange_url="http://flycn-internal/exchange",
        flycn_client_secret="secret",
    )
    return TestClient(application), TestClient(
        create_app(
            database_url=database_url,
            public_base_url="https://fridge.example",
        )
    )


def test_mobile_sso_uses_flycn_public_canonical_host(tmp_path: Path) -> None:
    """移动 SSO 不应把调用者送到 flycn 的其他公开门户 host。"""
    assert normalize_flycn_authorize_url(
        "https://app.flycn.fyi/integrations/fridgeboard/authorize"
    ) == "https://flycn.fyi/integrations/fridgeboard/authorize"
    assert normalize_flycn_authorize_url(
        "https://www.flycn.fyi/integrations/fridgeboard/authorize"
    ) == "https://flycn.fyi/integrations/fridgeboard/authorize"
    assert normalize_flycn_authorize_url("https://flycn.example/authorize") == (
        "https://flycn.example/authorize"
    )
    database_url = f"sqlite:///{tmp_path / 'canonical-host.db'}"
    create_database_schema(database_url)
    client = TestClient(
        create_app(
            database_url=database_url,
            public_base_url="https://fridge.example",
            flycn_authorize_url="https://app.flycn.fyi/integrations/fridgeboard/authorize",
        )
    )
    response = client.get(
        "/api/auth/login",
        params={"return_to": "/"},
        follow_redirects=False,
    )
    assert urlsplit(response.headers["location"]).netloc == "flycn.fyi"


def test_mobile_sso_exchange_and_bearer_owner_access(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """移动端 SSO 回跳只携带一次性 code，交换后 Bearer 可访问 Owner API。"""
    real_client = main_module.httpx.AsyncClient

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"user_id": "flycn-owner"}, request=request)

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(main_module.httpx, "AsyncClient", client_factory)
    browser, bearer_client = _app(tmp_path)
    verifier = "v" * 64
    login = browser.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "https://fridge.example/mobile/auth/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge(verifier),
        },
        follow_redirects=False,
    )
    assert login.status_code == 307
    authorize_query = dict(parse_qsl(urlsplit(login.headers["location"]).query))
    assert "prompt" not in authorize_query
    sso_state = browser.cookies.get("fb_sso_state")
    callback = browser.get(
        "/api/auth/callback",
        params={"code": "one-time", "state": sso_state},
        follow_redirects=False,
    )
    assert callback.status_code == 303
    callback_location = callback.headers["location"]
    assert callback_location.startswith("https://fridge.example/mobile/auth/callback?")
    assert "access_token" not in callback_location
    query = dict(parse_qsl(urlsplit(callback_location).query))
    exchanged = browser.post(
        "/api/auth/mobile/exchange",
        json={
            "code": query["code"],
            "code_verifier": verifier,
            "redirect_uri": "https://fridge.example/mobile/auth/callback",
        },
    )
    assert exchanged.status_code == 200
    tokens = exchanged.json()
    assert tokens["token_type"] == "Bearer"
    assert tokens["expires_in"] == 900
    assert bearer_client.post(
        "/api/owner/refrigerators",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"name": "App 冰箱", "template_key": "mini"},
    ).status_code == 201
    assert bearer_client.get(
        "/api/refrigerators",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    ).status_code == 200
    assert browser.post(
        "/api/auth/mobile/exchange",
        json={
            "code": query["code"],
            "code_verifier": verifier,
            "redirect_uri": "https://fridge.example/mobile/auth/callback",
        },
    ).status_code == 400


def test_mobile_sso_used_code_returns_friendly_browser_page(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SSO 一次性码被重复回调时，浏览器应看到可操作的 HTML 页面。"""
    real_client = main_module.httpx.AsyncClient

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            headers={"content-type": "application/json"},
            json={"detail": "授权码无效、过期或已使用"},
            request=request,
        )

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(main_module.httpx, "AsyncClient", client_factory)
    browser, _ = _app(tmp_path)
    browser.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "fridgeboard://mobile/auth/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge("v" * 64),
        },
        follow_redirects=False,
    )
    state = browser.cookies.get("fb_sso_state")
    callback = browser.get(
        "/api/auth/callback",
        params={"code": "used-code", "state": state},
        follow_redirects=False,
    )

    assert callback.status_code == 401
    assert callback.headers["content-type"].startswith("text/html")
    assert "登录未完成" in callback.text
    assert "授权码无效、过期或已使用" not in callback.text
    assert 'href="/"' in callback.text


def test_auth_status_distinguishes_anonymous_empty_list_from_owner_session(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """认证状态接口不得把未登录的空冰箱列表当成已登录。"""
    monkeypatch.setenv("FRIDGEBOARD_LOCAL_OWNER_USER_ID", "")
    browser, anonymous = _app(tmp_path)

    assert anonymous.get("/api/auth/status").json() == {"authenticated": False}
    assert browser.post("/api/auth/development-login").status_code == 200
    assert browser.get("/api/auth/status").json() == {"authenticated": True}


def test_mobile_code_is_bound_to_pkce_and_single_use(tmp_path: Path) -> None:
    """PKCE 错误或重复消费不得创建 App 会话。"""
    client, _ = _app(tmp_path)
    response = client.post(
        "/api/auth/mobile/exchange",
        json={
            "code": "not-a-real-code-which-is-long-enough",
            "code_verifier": "v" * 64,
            "redirect_uri": "https://fridge.example/mobile/auth/callback",
        },
    )
    assert response.status_code == 400


def test_mobile_login_rejects_untrusted_redirect_and_state_mismatch(tmp_path: Path) -> None:
    """移动登录只允许固定回调地址，SSO state 不匹配时不能兑换。"""
    client, _ = _app(tmp_path)
    invalid_redirect = client.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "https://attacker.example/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge("v" * 64),
        },
    )
    assert invalid_redirect.status_code == 400
    login = client.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "https://fridge.example/mobile/auth/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge("v" * 64),
        },
        follow_redirects=False,
    )
    assert login.status_code == 307
    mismatch = client.get(
        "/api/auth/callback",
        params={"code": "one-time", "state": "wrong-state-1234567890"},
        follow_redirects=False,
    )
    assert mismatch.status_code == 400


def test_mobile_login_accepts_only_the_app_callback_scheme(tmp_path: Path) -> None:
    """移动端登录允许固定 App scheme，避免 HTTPS 回调触发系统应用选择器。"""
    client, _ = _app(tmp_path)
    login = client.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "fridgeboard://mobile/auth/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge("v" * 64),
        },
        follow_redirects=False,
    )
    assert login.status_code == 307
    rejected = client.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "otherapp://mobile/auth/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge("v" * 64),
        },
    )
    assert rejected.status_code == 400


def test_mobile_login_can_request_explicit_reauthentication(tmp_path: Path) -> None:
    """移动端只有主动切换账号时才向 flycn 请求重新认证。"""
    client, _ = _app(tmp_path)
    login = client.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "fridgeboard://mobile/auth/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge("v" * 64),
            "prompt": "login",
        },
        follow_redirects=False,
    )
    assert login.status_code == 307
    authorize_query = dict(parse_qsl(urlsplit(login.headers["location"]).query))
    assert authorize_query["prompt"] == "login"

    rejected = client.get(
        "/api/auth/login",
        params={
            "client": "mobile",
            "redirect_uri": "fridgeboard://mobile/auth/callback",
            "state": "app-state-1234567890",
            "code_challenge": _challenge("v" * 64),
            "prompt": "account-picker",
        },
    )
    assert rejected.status_code == 400


def test_mobile_refresh_rotates_and_logout_revokes(tmp_path: Path) -> None:
    """长期刷新令牌可重复恢复访问令牌，退出后访问令牌返回 401。"""
    client, bearer_client = _app(tmp_path)
    database_url = f"sqlite:///{tmp_path / 'mobile-auth.db'}"
    verifier = "r" * 64

    async def issue_code() -> str:
        engine = create_database_engine(database_url)
        try:
            async with transaction(create_session_factory(engine)) as session:
                from fridgeboard.auth import AccessService

                return await AccessService(session).create_mobile_authorization_code(
                    "owner-1",
                    "https://fridge.example/mobile/auth/callback",
                    _challenge(verifier),
                )
        finally:
            await engine.dispose()

    code = asyncio.run(issue_code())
    exchanged = client.post(
        "/api/auth/mobile/exchange",
        json={
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": "https://fridge.example/mobile/auth/callback",
        },
    )
    assert exchanged.status_code == 200
    first_tokens = exchanged.json()
    refreshed = client.post(
        "/api/auth/mobile/refresh",
        json={"refresh_token": first_tokens["refresh_token"]},
    )
    assert refreshed.status_code == 200
    second_tokens = refreshed.json()
    assert second_tokens["refresh_token"] == first_tokens["refresh_token"]
    assert second_tokens["access_token"] != first_tokens["access_token"]
    assert client.post(
        "/api/auth/mobile/refresh",
        json={"refresh_token": first_tokens["refresh_token"]},
    ).status_code == 200
    assert bearer_client.get(
        "/api/owner/refrigerators",
        headers={"Authorization": f"Bearer {first_tokens['access_token']}"},
    ).status_code == 401
    assert bearer_client.post(
        "/api/auth/mobile/logout",
        headers={"Authorization": f"Bearer {second_tokens['access_token']}"},
    ).status_code == 204
    assert bearer_client.get(
        "/api/owner/refrigerators",
        headers={"Authorization": f"Bearer {second_tokens['access_token']}"},
    ).status_code == 401


def test_mobile_pairing_returns_device_bearer_without_cookie_dependency(tmp_path: Path) -> None:
    """原生 App 消费配对码时获得设备 Bearer，不依赖跨源 Cookie。"""
    owner, mobile = _app(tmp_path)
    owner.post("/api/auth/development-login")
    passcode = owner.post(
        "/api/owner/kindle-passcodes",
        json={"new_refrigerator_name": "App 配对冰箱", "new_template_key": "mini"},
    ).json()["passcode"]
    database_url = f"sqlite:///{tmp_path / 'mobile-auth.db'}"
    kindle = TestClient(
        create_app(database_url=database_url, public_base_url="https://fridge.example")
    )
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    pairing_token = kindle.post("/api/kindle/pairing-sessions").json()["pairing_token"]

    response = mobile.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True, "client": "mobile"},
    )
    assert response.status_code == 201
    device_token = response.json().pop("device_token")
    assert mobile.get(
        "/api/devices/current", headers={"Authorization": f"Bearer {device_token}"}
    ).status_code == 200
