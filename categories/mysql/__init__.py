"""MySQL 8 分类 - 关系型数据库底层结构

已实现:
- B+Tree Index    聚簇索引/二级索引的页结构, 分裂/合并/范围扫描

计划中:
- Buffer Pool     基于 LRU 的内存页缓存
- Redo Log        WAL 预写日志
- Undo Log + MVCC 多版本并发控制
- Binlog          归档日志

新加类型的方法:
    1. 在 structures/ 中实现数据结构
    2. 在 api/ 中写 FastAPI router, 暴露 CRUD
    3. 在 pages/ 中写前端
    4. 在本文件注册一个新 TypeInfo, status='active', page_path/api_prefix 都填好
"""
from fastapi import APIRouter
from categories.registry import CategoryInfo, TypeInfo, register_category, register_type

# ---- 1. 合并所有 API 子路由 ----
from .api.bptree_api import router as bptree_router

router = APIRouter()
router.include_router(bptree_router)

# ---- 2. 注册分类元信息 ----
_mysql = CategoryInfo(
    name="mysql",
    display_name="MySQL 8",
    description="关系型数据库 - InnoDB 存储引擎的索引/日志/缓存底层结构",
    icon="M",
    color="#00758f",
    version="8.x",
    order=20,
    router=router,
)
register_category(_mysql)

# ---- 3. 注册数据类型 ----
register_type("mysql", TypeInfo(
    name="B+Tree Index",
    description="InnoDB 聚簇索引: 页分裂/页合并/范围扫描, 叶子双向链表",
    encodings=["B+Tree", "Page Split", "Page Merge"],
    page_path="/categories/mysql/pages/bptree.html",
    api_prefix="/api/mysql/bptree",
    icon="B+",
    color="#00758f",
    status="active",
))

register_type("mysql", TypeInfo(
    name="Buffer Pool",
    description="基于 LRU 的内存页缓存, 预读机制",
    encodings=["LRU", "Change Buffer"],
    icon="💧",
    color="#0ea5e9",
    status="planned",
))
register_type("mysql", TypeInfo(
    name="Redo Log",
    description="WAL 预写日志, 物理日志, 循环写",
    encodings=["WAL", "LSN"],
    icon="📜",
    color="#dc2626",
    status="planned",
))
register_type("mysql", TypeInfo(
    name="Undo Log + MVCC",
    description="多版本并发控制, 回滚段, 读视图",
    encodings=["MVCC", "ReadView"],
    icon="⏪",
    color="#7c3aed",
    status="planned",
))
register_type("mysql", TypeInfo(
    name="Binlog",
    description="归档日志, 主从复制, ROW/STATEMENT/MIXED 格式",
    encodings=["ROW", "STATEMENT", "MIXED"],
    icon="📋",
    color="#059669",
    status="planned",
))
