"""后端日志格式和全局错误日志辅助工具。

本模块配置标准输出和可选的有上限文件日志。生产文件日志写入数据卷并保留最近
七个归档文件，单个文件达到 10 MiB 时也会轮换；异常上下文由调用方负责脱敏，不应写入请求体、Cookie 或
Authorization 等敏感数据。
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import UTC, datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

LOG_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"
DEFAULT_LOG_MAX_BYTES = 10 * 1024 * 1024
DEFAULT_LOG_BACKUP_COUNT = 7


class _BoundedTimedRotatingFileHandler(TimedRotatingFileHandler):
    """Rotate a log at midnight or before it exceeds the configured size."""

    def __init__(self, *args: object, max_bytes: int, **kwargs: object) -> None:
        self.max_bytes = max_bytes
        super().__init__(*args, **kwargs)

    def shouldRollover(self, record: logging.LogRecord) -> int:
        """Return whether the current file reached its size or time boundary."""
        if self.stream is None:
            self.stream = self._open()
        if self.max_bytes > 0:
            self.stream.seek(0, 2)
            current_size = self.stream.tell()
            record_size = len(
                f"{self.format(record)}{self.terminator}".encode(self.encoding or "utf-8")
            )
            if current_size and current_size + record_size > self.max_bytes:
                return 1
        return super().shouldRollover(record)

    def doRollover(self) -> None:
        """Rotate the active file without overwriting same-day size archives."""
        if int(time.time()) >= self.rolloverAt:
            super().doRollover()
            return

        if self.stream:
            self.stream.close()
            self.stream = None
        source = Path(self.baseFilename)
        if source.exists():
            timestamp = datetime.now(UTC).strftime("%Y-%m-%d_%H-%M-%S")
            destination = source.with_name(f"{source.name}.{timestamp}")
            suffix = 1
            while destination.exists():
                destination = source.with_name(f"{source.name}.{timestamp}.{suffix}")
                suffix += 1
            source.replace(destination)

        self.stream = self._open()
        self.rolloverAt = self.computeRollover(int(time.time()))
        for path in self.getFilesToDelete():
            path.unlink(missing_ok=True)

    def getFilesToDelete(self) -> list[str]:
        """Return the oldest time and size archives beyond the retention limit."""
        if self.backupCount <= 0:
            return []
        base_path = Path(self.baseFilename)
        candidates = sorted(
            (
                path
                for path in base_path.parent.glob(f"{base_path.name}.*")
                if path.is_file()
            ),
            key=lambda path: path.stat().st_mtime,
        )
        return [str(path) for path in candidates[:-self.backupCount]]


def configure_logging() -> None:
    """配置后端日志级别和带时区时间戳的标准输出格式。

    该函数可重复调用，适用于应用工厂在测试和生产入口中多次创建应用的场景。
    已存在的根日志处理器会复用并更新格式，确保应用日志始终包含时间戳。
    生产环境通过 ``FRIDGEBOARD_LOG_FILE`` 启用持久文件日志，日志按 UTC 日期或
    10 MiB 大小轮换，并自动删除最近七个归档文件之外的日志。
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)
    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
    for handler in root_logger.handlers:
        handler.setFormatter(formatter)

    configured_log_file = os.environ.get("FRIDGEBOARD_LOG_FILE")
    if not configured_log_file:
        return
    log_path = Path(configured_log_file)
    existing_file_handlers = [
        handler
        for handler in root_logger.handlers
        if getattr(handler, "_fridgeboard_file_handler", False)
    ]
    matching_handler = next(
        (
            handler
            for handler in existing_file_handlers
            if Path(getattr(handler, "baseFilename", "")) == log_path
        ),
        None,
    )
    for handler in existing_file_handlers:
        if handler is matching_handler:
            continue
        root_logger.removeHandler(handler)
        handler.close()
    if matching_handler is not None:
        matching_handler.setFormatter(formatter)
        return

    log_path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(log_path.parent, 0o750)
    file_handler = _BoundedTimedRotatingFileHandler(
        log_path,
        when="midnight",
        interval=1,
        backupCount=DEFAULT_LOG_BACKUP_COUNT,
        encoding="utf-8",
        utc=True,
        max_bytes=int(os.environ.get("FRIDGEBOARD_LOG_MAX_BYTES", DEFAULT_LOG_MAX_BYTES)),
    )
    file_handler._fridgeboard_file_handler = True  # type: ignore[attr-defined]
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    os.chmod(log_path, 0o640)
