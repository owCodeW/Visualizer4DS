"""Elasticsearch 分类 - 预留拓展点 (规划中)

计划实现的数据结构:
- Inverted Index        (倒排索引)
- FST                   (Finite State Transducer - 词典压缩)
- SkipList              (Lucene DocID 合并)
- BKD Tree              (多维点查询)
- Doc Values            (列式存储, 用于聚合/排序)
- Segment + Translog
- Frozen Tier / Index Sorting

启用方法: 同 categories/mysql/__init__.py
"""
from categories.registry import CategoryInfo, TypeInfo, register_category, register_type

_es = CategoryInfo(
    name="elasticsearch",
    display_name="Elasticsearch",
    description="分布式搜索 - 倒排索引, FST, BKD Tree 与段合并",
    icon="E",
    color="#10b981",
    version="8.x",
    order=30,
    router=None,
)
register_category(_es)

register_type("elasticsearch", TypeInfo(
    name="Inverted Index",
    description="倒排索引: term -> posting list 的映射",
    encodings=["Posting List", "SkipList"],
    icon="🔍",
    color="#10b981",
    status="planned",
))
register_type("elasticsearch", TypeInfo(
    name="FST",
    description="Finite State Transducer - 词典前缀压缩",
    encodings=["FST"],
    icon="🌳",
    color="#06b6d4",
    status="planned",
))
register_type("elasticsearch", TypeInfo(
    name="BKD Tree",
    description="多维点查询, 用于范围/地理位置",
    encodings=["BKD Tree"],
    icon="📐",
    color="#8b5cf6",
    status="planned",
))
register_type("elasticsearch", TypeInfo(
    name="Doc Values",
    description="列式存储, 加速聚合与排序",
    encodings=["Columnar"],
    icon="📊",
    color="#f59e0b",
    status="planned",
))
register_type("elasticsearch", TypeInfo(
    name="Segment + Translog",
    description="不可变段, translog 防丢, 后台 merge",
    encodings=["Immutable", "Translog"],
    icon="📦",
    color="#ef4444",
    status="planned",
))
