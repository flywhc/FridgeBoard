"""测试客户端生命周期辅助工具。

测试中的数据库初始化属于 FastAPI lifespan 副作用；本模块提供一个启动并登记
``TestClient`` 的入口，由 ``conftest.py`` 在每个测试结束时统一关闭。
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

_active_clients: list[TestClient] = []


def start_test_client(application: FastAPI) -> TestClient:
    """启动应用生命周期并返回可用于测试请求的客户端。

    Args:
        application: 已完成路由装配、但尚未启动生命周期的 FastAPI 应用。

    Returns:
        已进入 lifespan 的测试客户端；测试结束时由测试夹具统一关闭。
    """
    client = TestClient(application)
    client.__enter__()
    _active_clients.append(client)
    return client


def close_active_test_clients() -> None:
    """关闭当前测试登记的客户端并释放其 lifespan 资源。"""
    while _active_clients:
        _active_clients.pop().__exit__(None, None, None)
