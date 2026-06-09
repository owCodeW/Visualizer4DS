"""Redis 7 分类 - 包含 5 个数据类型的可视化

注册顺序: order=10 (主分类)
"""
from fastapi import APIRouter
from categories.registry import (
    CategoryInfo, TypeInfo, register_category, register_type
)

# ---- 1. 合并 5 个 API 子路由 ----
# 注意: 每个子 router 已自带 prefix="/string" 等, 父 router 不再加 prefix
from .api.string_api import router as string_router
from .api.list_api import router as list_router
from .api.hash_api import router as hash_router
from .api.set_api import router as set_router
from .api.zset_api import router as zset_router

router = APIRouter()
router.include_router(string_router)
router.include_router(list_router)
router.include_router(hash_router)
router.include_router(set_router)
router.include_router(zset_router)

# ---- 2. 注册分类元信息 ----
_redis = CategoryInfo(
    name="redis",
    display_name="Redis 7",
    description="内存型 NoSQL 数据库, 5 大数据类型的底层编码与自动切换",
    icon="R",
    color="#dc2626",
    version="7.x",
    order=10,
    router=router,
)
register_category(_redis)

# ---- 3. 注册 5 个数据类型 ----
register_type("redis", TypeInfo(
    name="String",
    description="SDS 7.0 - int/embstr/raw 编码自动切换",
    encodings=["int", "embstr", "raw"],
    page_path="/categories/redis/pages/string.html",
    api_prefix="/api/redis/string",
    icon="Aa",
    color="#8b5cf6",
))

register_type("redis", TypeInfo(
    name="List",
    description="QuickList - 双向链表 + Listpack 节点",
    encodings=["listpack", "quicklist"],
    page_path="/categories/redis/pages/list.html",
    api_prefix="/api/redis/list",
    icon="☰",
    color="#2563eb",
))

register_type("redis", TypeInfo(
    name="Hash",
    description="Listpack / HashTable 编码切换",
    encodings=["listpack", "hashtable"],
    page_path="/categories/redis/pages/hash.html",
    api_prefix="/api/redis/hash",
    icon="H",
    color="#059669",
))

register_type("redis", TypeInfo(
    name="Set",
    description="IntSet (int16/32/64) / HashTable 编码切换",
    encodings=["int16", "int32", "int64", "hashtable"],
    page_path="/categories/redis/pages/set.html",
    api_prefix="/api/redis/set",
    icon="S",
    color="#d97706",
))

register_type("redis", TypeInfo(
    name="ZSet",
    description="Listpack / SkipList + HashTable 编码切换",
    encodings=["listpack", "skiplist"],
    page_path="/categories/redis/pages/zset.html",
    api_prefix="/api/redis/zset",
    icon="Z",
    color="#dc2626",
))

# 缓存三大问题 (图文知识页, 无后端 API)
register_type("redis", TypeInfo(
    name="缓存三大问题",
    description="穿透 · 击穿 · 雪崩 成因剖析与解决方案图文详解",
    encodings=["penetration", "breakdown", "avalanche"],
    page_path="/categories/redis/pages/cache_issues.html",
    api_prefix="",
    icon="⚠",
    color="#7c3aed",
))
