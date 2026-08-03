"""后端测试共享夹具。"""

from collections.abc import Iterator

import pytest
from support import close_active_test_clients


@pytest.fixture(autouse=True)
def close_test_clients() -> Iterator[None]:
    """在每个测试结束后关闭由测试辅助工具启动的客户端。"""
    yield
    close_active_test_clients()
