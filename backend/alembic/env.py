"""Alembic 异步迁移运行环境。

版本脚本继续使用 Alembic 提供的同步迁移 DSL，但目标连接由
``AsyncEngine`` 建立，并通过 ``run_sync`` 在 Alembic 的迁移回调中执行。应用
请求路径不复用这条同步迁移回调，也不创建同步 SQLAlchemy Engine。
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from fridgeboard.persistence.database import async_database_url
from fridgeboard.persistence.models import Base
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

raw_database_url = os.environ.get(
    "FRIDGEBOARD_DATABASE_URL", config.get_main_option("sqlalchemy.url")
)
config.set_main_option("sqlalchemy.url", async_database_url(raw_database_url))
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """生成不需要数据库连接的 SQL 迁移脚本。"""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: object) -> None:
    """在异步连接的同步适配连接上执行 Alembic 版本脚本。"""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """使用 SQLite AsyncEngine 连接目标数据库并运行迁移。"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
