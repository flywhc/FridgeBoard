"""后端日志格式和全局错误日志辅助工具。

本模块只配置 Python 日志输出格式，不负责文件落盘或日志轮转；生产环境由
单容器标准输出采集日志。异常日志上下文只接收请求方法、路径和状态码，避免
把请求体、Cookie、Authorization 等敏感数据写入日志。
"""

from __future__ import annotations

import logging
import sys

LOG_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging() -> None:
    """配置后端日志级别和带时区时间戳的标准输出格式。

    该函数可重复调用，适用于应用工厂在测试和生产入口中多次创建应用的场景。
    已存在的根日志处理器会复用并更新格式，确保应用日志始终包含时间戳。
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)
    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
        return
    for handler in root_logger.handlers:
        handler.setFormatter(formatter)
