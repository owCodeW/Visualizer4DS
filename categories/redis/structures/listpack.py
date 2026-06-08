"""Listpack 模拟 - Redis 7.0 替代 ziplist"""
from typing import Optional


class Listpack:
    """模拟 Redis 7.0 的 Listpack 结构

    Listpack 是 Redis 7 中替代 ziplist 的紧凑数据结构：
    - 连续内存块
    - 无指针，无连锁更新问题
    - 用于 Hash (小规模)、ZSet (小规模) 等底层编码
    """

    MAX_ENTRIES = 128  # listpack 最大元素数阈值

    def __init__(self):
        self.entries: list[tuple[str, str]] = []  # (field, value) 对
        self.total_bytes = 0

    def _calc_bytes(self) -> int:
        """估算内存占用"""
        total = 6  # 头部 + 尾部开销
        for field, value in self.entries:
            total += len(field.encode('utf-8')) + len(value.encode('utf-8')) + 6
        return total

    def add_entry(self, field: str, value: str) -> dict:
        """添加一个键值对"""
        # 如果已存在则更新
        for i, (f, v) in enumerate(self.entries):
            if f == field:
                self.entries[i] = (field, value)
                self.total_bytes = self._calc_bytes()
                return {"action": "update", "field": field, "value": value}
        self.entries.append((field, value))
        self.total_bytes = self._calc_bytes()
        return {"action": "add", "field": field, "value": value}

    def remove_entry(self, field: str) -> dict:
        """删除一个键值对"""
        for i, (f, v) in enumerate(self.entries):
            if f == field:
                self.entries.pop(i)
                self.total_bytes = self._calc_bytes()
                return {"action": "remove", "field": field, "value": v}
        return {"action": "not_found", "field": field}

    def get_entry(self, field: str) -> Optional[str]:
        """获取一个键值对的值"""
        for f, v in self.entries:
            if f == field:
                return v
        return None

    def get_all_entries(self) -> list[tuple[str, str]]:
        return list(self.entries)

    def entry_count(self) -> int:
        return len(self.entries)

    def should_convert_to_hashtable(self) -> bool:
        """判断是否应该转换为 hashtable"""
        return self.entry_count() > self.MAX_ENTRIES

    def get_structure(self) -> dict:
        return {
            "encoding": "listpack",
            "entry_count": self.entry_count(),
            "total_bytes": self.total_bytes,
            "entries": [{"field": f, "value": v} for f, v in self.entries],
            "max_entries": self.MAX_ENTRIES,
            "source_code": """/* listpack 结构 -- Redis 7 替代 ziplist */
typedef struct listpack {
    uint8_t *data;   /* 指向数据起始 */
    size_t len;      /* listpack 总字节数 */
} listpack;

/* 每个 entry 格式:
   | backlen | encoding | data | */
"""
        }

    def reset(self):
        self.entries = []
        self.total_bytes = 0

