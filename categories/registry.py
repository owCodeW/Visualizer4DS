"""分类注册中心

每个 category 通过 register_category() 注册自己, 然后通过 register_type() 注册其中的数据类型
main.py 通过 get_all_categories() 读取所有分类, 统一挂载到 FastAPI 上
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TypeInfo:
    """一个数据类型的元信息 (在主页卡片中展示)"""
    name: str                              # 类型名, 如 "String"
    description: str                       # 简短描述
    encodings: list[str] = field(default_factory=list)   # 编码列表, 如 ["int", "embstr", "raw"]
    page_path: str = ""                    # 前端页面路径, 如 "/categories/redis/pages/string.html"
    api_prefix: str = ""                   # API 前缀, 如 "/api/redis/string"
    icon: str = ""                         # 卡片图标字符
    color: str = "#8b5cf6"                 # 卡片主色
    status: str = "active"                 # active / planned


@dataclass
class CategoryInfo:
    """一个分类 (Redis/MySQL/...) 的元信息"""
    name: str                              # 内部 ID, 如 "redis"
    display_name: str                      # 显示名, 如 "Redis 7"
    description: str                       # 一句话描述
    icon: str = ""                         # 分类图标
    color: str = "#dc2626"                 # 分类主色
    version: str = ""                      # 版本说明
    types: list[TypeInfo] = field(default_factory=list)
    order: int = 0                         # 在首页的展示顺序, 数字小的在前
    router: Optional[object] = None        # 分类的 FastAPI router (可选, 由分类自己挂载)


# 全局注册表
_CATEGORIES: dict[str, CategoryInfo] = {}


def register_category(category: CategoryInfo) -> CategoryInfo:
    """注册一个分类. 重复注册同名会覆盖, 用于支持热重载/测试场景"""
    if category.name in _CATEGORIES:
        # 保留已注册的 types 和 router, 只更新元信息
        existing = _CATEGORIES[category.name]
        existing.display_name = category.display_name
        existing.description = category.description
        existing.icon = category.icon
        existing.color = category.color
        existing.version = category.version
        existing.order = category.order
        if category.router is not None:
            existing.router = category.router
        return existing
    _CATEGORIES[category.name] = category
    return category


def register_type(category_name: str, type_info: TypeInfo) -> None:
    """向指定分类注册一个数据类型"""
    cat = _CATEGORIES.get(category_name)
    if cat is None:
        raise ValueError(f"Category '{category_name}' not registered. Call register_category() first.")
    # 避免重复注册同名类型
    for t in cat.types:
        if t.name == type_info.name:
            return
    type_info.status = type_info.status or "active"
    cat.types.append(type_info)


def get_all_categories() -> list[CategoryInfo]:
    """获取所有已注册分类, 按 order 升序"""
    return sorted(_CATEGORIES.values(), key=lambda c: c.order)


def get_category(name: str) -> Optional[CategoryInfo]:
    return _CATEGORIES.get(name)


def get_active_categories() -> list[CategoryInfo]:
    """只获取至少有一个 active 类型 的分类"""
    return [c for c in get_all_categories() if any(t.status == "active" for t in c.types)]


def clear_registry() -> None:
    """清空注册表 (仅供测试使用)"""
    _CATEGORIES.clear()
