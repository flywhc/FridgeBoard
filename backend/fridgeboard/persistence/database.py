"""数据库引擎与事务会话工厂。

生产环境使用 SQLite 文件和 WAL；创建引擎本身不执行迁移，部署流程必须先运行
Alembic。会话调用方需要使用 ``session.begin()`` 包裹跨表写操作。
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def create_database_engine(database_url: str) -> Engine:
    """创建适合单进程 SQLite 部署的 SQLAlchemy 引擎。

    Args:
        database_url: SQLAlchemy 数据库 URL；生产环境应指向持久卷中的 SQLite 文件。

    Returns:
        已启用 SQLite 外键与 WAL 的数据库引擎。
    """
    engine = create_engine(database_url)
    if database_url.startswith("sqlite"):
        event.listen(engine, "connect", _configure_sqlite_connection)
    return engine


def _configure_sqlite_connection(dbapi_connection: object, _connection_record: object) -> None:
    """为每个 SQLite 连接启用外键约束与 WAL 日志模式。"""
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """返回不自动提交的会话工厂，防止服务层意外拆分业务事务。"""
    return sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def transaction(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    """在一个提交或回滚边界内提供数据库会话。

    Args:
        session_factory: 由 ``create_session_factory`` 创建的工厂。

    Yields:
        可执行跨表读取和写入的会话；异常时自动回滚。
    """
    with session_factory() as session, session.begin():
        yield session
