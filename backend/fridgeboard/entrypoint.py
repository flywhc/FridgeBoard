"""生产容器启动入口。

本模块在唯一应用进程开始提供 HTTP 服务前执行 Alembic 前向迁移，随后以 exec 方式
启动 Uvicorn，使容器停止信号直接交给 Web 进程。它不处理回滚，且仅适用于项目约定的
单副本部署；多副本场景必须改用部署编排器中的独立迁移任务。
"""

from __future__ import annotations

import os
import subprocess


def main() -> None:
    """执行当前数据库的前向迁移并替换当前进程为 Uvicorn。

    Raises:
        subprocess.CalledProcessError: 当迁移失败时传播，阻止容器提供可能不兼容的服务。
    """
    subprocess.run(["alembic", "-c", "/app/alembic.ini", "upgrade", "head"], check=True)
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "fridgeboard.main:app",
            "--app-dir",
            "backend",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ],
    )


if __name__ == "__main__":
    main()
