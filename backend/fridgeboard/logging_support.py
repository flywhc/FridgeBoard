"""后端日志格式和全局错误日志辅助工具。

本模块配置标准输出和可选的按天文件日志。生产文件日志写入数据卷并保留最近
七个归档文件；异常上下文由调用方负责脱敏，不应写入请求体、Cookie 或
Authorization 等敏感数据。
"""

from __future__ import annotations

import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

LOG_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging() -> None:
    """配置后端日志级别和带时区时间戳的标准输出格式。

    该函数可重复调用，适用于应用工厂在测试和生产入口中多次创建应用的场景。
    已存在的根日志处理器会复用并更新格式，确保应用日志始终包含时间戳。
    生产环境通过 ``FRIDGEBOARD_LOG_FILE`` 启用按天轮换的持久文件日志，当前文件
    和最近七个归档文件之外的日志会自动删除。
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
    file_handler = TimedRotatingFileHandler(
        log_path,
        when="midnight",
        interval=1,
        backupCount=7,
        encoding="utf-8",
        utc=True,
    )
    file_handler._fridgeboard_file_handler = True  # type: ignore[attr-defined]
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    os.chmod(log_path, 0o640)
