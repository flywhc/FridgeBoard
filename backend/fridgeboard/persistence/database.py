"""异步数据库引擎、会话工厂与事务边界。

应用运行时统一使用 SQLAlchemy asyncio 扩展，并通过 ``aiosqlite`` 连接 SQLite。
传入旧的 ``sqlite:///`` URL 时会自动补齐异步驱动，避免调用方把同步驱动带入协程链路。
"""

from __future__ import annotations

import asyncio
from contextlib import AbstractAsyncContextManager, AbstractContextManager

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

SessionFactory = async_sessionmaker[AsyncSession]


def async_database_url(database_url: str) -> str:
    """将 SQLite SQLAlchemy URL 转换为异步驱动 URL。

    Args:
        database_url: SQLite 或已带 ``aiosqlite`` 的 SQLAlchemy URL。

    Returns:
        使用 ``aiosqlite`` 的异步 SQLAlchemy URL。

    Raises:
        ValueError: 当数据库 URL 使用了不支持的同步驱动时抛出。
    """
    replacements = {
        "sqlite://": "sqlite+aiosqlite://",
        "sqlite+pysqlite://": "sqlite+aiosqlite://",
    }
    for source, target in replacements.items():
        if database_url.startswith(source):
            return target + database_url[len(source) :]
    if database_url.startswith("sqlite+aiosqlite://"):
        return database_url
    raise ValueError("数据库 URL 必须使用 SQLite aiosqlite 异步驱动")


def create_database_engine(database_url: str) -> AsyncEngine:
    """创建应用运行时使用的异步 SQLAlchemy 引擎。

    Args:
        database_url: 原始 SQLite URL；同步 URL 会自动转换。

    Returns:
        已配置连接预检和 SQLite 外键/WAL 的异步引擎。
    """
    normalized_url = async_database_url(database_url)
    engine = create_async_engine(normalized_url, pool_pre_ping=True)
    if normalized_url.startswith("sqlite+"):
        event.listen(engine.sync_engine, "connect", _configure_sqlite_connection)
    return engine


def _configure_sqlite_connection(dbapi_connection: object, _connection_record: object) -> None:
    """为每个 SQLite 异步连接启用外键约束与 WAL 日志模式。"""
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def create_session_factory(engine: AsyncEngine) -> SessionFactory:
    """返回不自动过期对象的异步会话工厂。"""
    return async_sessionmaker(bind=engine, expire_on_commit=False)


def database_pool_snapshot(engine: AsyncEngine) -> dict[str, int | None]:
    """返回当前数据库连接池的安全观测值。

    Args:
        engine: 应用使用的异步数据库引擎。

    Returns:
        包含连接池大小、已 checkout、已 checkin 和溢出连接数的快照；不支持某项
        观测的连接池返回 ``None``，不会影响业务请求。
    """
    pool = engine.sync_engine.pool
    snapshot: dict[str, int | None] = {}
    for name in ("size", "checkedout", "checkedin", "overflow"):
        accessor = getattr(pool, name, None)
        try:
            snapshot[name] = int(accessor()) if callable(accessor) else None
        except (TypeError, ValueError):
            snapshot[name] = None
    return snapshot


class _TransactionContext(AbstractAsyncContextManager[AsyncSession], AbstractContextManager):
    """同时支持应用异步事务和迁移期间的同步测试调用边界。

    同步入口只给仍使用同步 ``TestClient`` 的遗留测试夹具使用；它内部仍创建
    ``AsyncSession``，不提供同步 SQLAlchemy Engine 或同步数据库驱动。
    """

    def __init__(self, session_factory: SessionFactory) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._transaction = None

    async def __aenter__(self) -> AsyncSession:
        self._session = self._session_factory()
        self._transaction = self._session.begin()
        await self._transaction.__aenter__()
        return self._session

    async def __aexit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        assert self._session is not None and self._transaction is not None
        try:
            await self._transaction.__aexit__(exc_type, exc_value, traceback)
        finally:
            await self._session.close()

    def __enter__(self) -> _SyncSessionProxy:
        self._session = self._session_factory()
        self._transaction = self._session.begin()
        asyncio.run(self._transaction.__aenter__())
        return _SyncSessionProxy(self._session)

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        assert self._session is not None and self._transaction is not None
        try:
            asyncio.run(self._transaction.__aexit__(exc_type, exc_value, traceback))
        finally:
            asyncio.run(self._session.close())


class _SyncSessionProxy:
    """仅供同步测试夹具驱动 AsyncSession 的最小代理。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _run_or_return(coroutine: object) -> object:
        """在同步测试代码中执行协程，在异步 service 中原样返回协程。"""
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(coroutine)  # type: ignore[arg-type]
        return coroutine

    @property
    def info(self) -> dict[str, object]:
        """返回 AsyncSession 的事务信息字典。"""
        return self._session.info

    @property
    def sync_session(self) -> object:
        """返回底层同步事件目标，仅供 AsyncSession 事件适配使用。"""
        return self._session.sync_session

    def add(self, instance: object) -> None:
        self._session.add(instance)

    def add_all(self, instances: object) -> None:
        self._session.add_all(instances)  # type: ignore[arg-type]

    def delete(self, instance: object) -> object:
        return self._run_or_return(self._session.delete(instance))

    def get(self, model: object, identity: object) -> object:
        return self._run_or_return(self._session.get(model, identity))  # type: ignore[arg-type]

    def scalar(self, statement: object) -> object:
        return self._run_or_return(self._session.scalar(statement))  # type: ignore[arg-type]

    def scalars(self, statement: object) -> object:
        return self._run_or_return(self._session.scalars(statement))  # type: ignore[arg-type]

    def execute(self, statement: object) -> object:
        return self._run_or_return(self._session.execute(statement))  # type: ignore[arg-type]

    def flush(self) -> object:
        return self._run_or_return(self._session.flush())

    def commit(self) -> object:
        return self._run_or_return(self._session.commit())

    def rollback(self) -> object:
        """回滚同步测试边界，或在异步 service 中返回原始协程。"""
        return self._run_or_return(self._session.rollback())


def transaction(session_factory: SessionFactory) -> _TransactionContext:
    """在一个提交或回滚边界内提供异步数据库会话。

    Args:
        session_factory: 由 ``create_session_factory`` 创建的异步工厂。

    Yields:
        可执行跨表读取和写入的异步会话；异常时自动回滚。
    """
    return _TransactionContext(session_factory)


class _SessionContext(AbstractContextManager[_SyncSessionProxy]):
    """为同步测试夹具提供一个仍由 AsyncSession 驱动的会话上下文。"""

    def __init__(self, session_factory: SessionFactory) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None

    def __enter__(self) -> _SyncSessionProxy:
        self._session = self._session_factory()
        asyncio.run(self._session.__aenter__())
        return _SyncSessionProxy(self._session)

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        assert self._session is not None
        asyncio.run(self._session.__aexit__(exc_type, exc_value, traceback))


def sync_session(session_factory: SessionFactory) -> _SessionContext:
    """返回仅供同步测试代码使用的 AsyncSession 代理上下文。"""
    return _SessionContext(session_factory)


async def _create_database_schema(engine: AsyncEngine, *, dispose: bool) -> None:
    from fridgeboard.persistence.models import Base

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    if dispose:
        await engine.dispose()


def create_database_schema(database_url: str | AsyncEngine) -> None:
    """为同步测试夹具初始化数据库表，实际 DDL 仍通过 AsyncEngine 执行。"""
    is_existing_engine = isinstance(database_url, AsyncEngine)
    engine = database_url if is_existing_engine else create_database_engine(database_url)
    asyncio.run(_create_database_schema(engine, dispose=not is_existing_engine))
