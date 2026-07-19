"""FridgeBoard 的纯领域规则。

本包不执行数据库或 HTTP I/O；持久化映射位于 ``fridgeboard.persistence``，
后续 API 任务只应通过服务层调用这些规则。
"""
