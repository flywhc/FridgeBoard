"""Alembic 迁移运行环境。

迁移 URL 默认只服务本地开发；部署必须通过 ``FRIDGEBOARD_DATABASE_URL`` 传入
持久化 SQLite URL。该模块不创建应用会话，也不自动运行迁移。
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from fridgeboard.persistence.models import Base
from sqlalchemy import engine_from_config, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option(
    "sqlalchemy.url",
    os.environ.get("FRIDGEBOARD_DATABASE_URL", config.get_main_option("sqlalchemy.url")),
)
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


def run_migrations_online() -> None:
    """连接目标数据库并在一个 Alembic 事务中升级。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
