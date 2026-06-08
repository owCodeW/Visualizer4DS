"""RocketMQ 分类 - 预留拓展点 (规划中)

计划实现的数据结构:
- CommitLog             (顺序写, MappedFile 内存映射)
- ConsumeQueue          (逻辑队列, 索引到 CommitLog)
- IndexFile             (按消息 key 的哈希索引)
- TimerWheel            (延迟消息的时间轮)
- OffsetTable           (消费者位移管理)
- DLQ                   (死信队列)
- 重试队列与最大重试次数

启用方法: 同 categories/mysql/__init__.py
"""
from categories.registry import CategoryInfo, TypeInfo, register_category, register_type

_rmq = CategoryInfo(
    name="rocketmq",
    display_name="RocketMQ",
    description="分布式消息队列 - CommitLog 顺序写 + ConsumeQueue 索引",
    icon="R",
    color="#f59e0b",
    version="5.x",
    order=40,
    router=None,
)
register_category(_rmq)

register_type("rocketmq", TypeInfo(
    name="CommitLog",
    description="顺序写, MappedFile 内存映射, 文件组滚动",
    encodings=["MappedFile", "WAL"],
    icon="📝",
    color="#f59e0b",
    status="planned",
))
register_type("rocketmq", TypeInfo(
    name="ConsumeQueue",
    description="逻辑队列, 按 queue 索引到 CommitLog 偏移",
    encodings=["CQ", "Index"],
    icon="📬",
    color="#3b82f6",
    status="planned",
))
register_type("rocketmq", TypeInfo(
    name="IndexFile",
    description="按 message key 哈希索引, 支持按 key 查询",
    encodings=["Hash Index"],
    icon="🗂️",
    color="#10b981",
    status="planned",
))
register_type("rocketmq", TypeInfo(
    name="TimerWheel",
    description="时间轮, 实现延迟消息与定时投递",
    encodings=["Hierarchical Wheel"],
    icon="⏰",
    color="#7c3aed",
    status="planned",
))
register_type("rocketmq", TypeInfo(
    name="Offset + DLQ",
    description="消费者位移管理, 死信队列, 重试机制",
    encodings=["Offset Table", "DLQ"],
    icon="💀",
    color="#dc2626",
    status="planned",
))
