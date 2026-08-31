"""数据库初始化与迁移共用的 SQLite 约束触发器。"""

_INSERT_TRIGGER = "ck_food_categories_custom_subcategory_icon_insert"
_UPDATE_TRIGGER = "ck_food_categories_custom_subcategory_icon_update"
_TRIGGER_CONDITION = (
    "NEW.is_custom = 1 AND NEW.parent_id IS NOT NULL "
    "AND NULLIF(TRIM(NEW.icon_key), '') IS NULL"
)


def custom_subcategory_icon_guard_ddl() -> tuple[str, str]:
    """返回阻止自定义小类保存空逻辑图标的 SQLite DDL。"""
    return (
        f"CREATE TRIGGER IF NOT EXISTS {_INSERT_TRIGGER} "
        "BEFORE INSERT ON food_categories FOR EACH ROW "
        f"WHEN {_TRIGGER_CONDITION} BEGIN "
        "SELECT RAISE(ABORT, 'custom subcategory requires icon_key'); END",
        f"CREATE TRIGGER IF NOT EXISTS {_UPDATE_TRIGGER} "
        "BEFORE UPDATE OF is_custom, parent_id, icon_key ON food_categories "
        "FOR EACH ROW "
        f"WHEN {_TRIGGER_CONDITION} BEGIN "
        "SELECT RAISE(ABORT, 'custom subcategory requires icon_key'); END",
    )


def drop_custom_subcategory_icon_guard_ddl() -> tuple[str, str]:
    """返回移除自定义小类空逻辑图标保护的 SQLite DDL。"""
    return (
        f"DROP TRIGGER IF EXISTS {_UPDATE_TRIGGER}",
        f"DROP TRIGGER IF EXISTS {_INSERT_TRIGGER}",
    )
