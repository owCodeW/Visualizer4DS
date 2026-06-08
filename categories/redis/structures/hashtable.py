"""HashTable 模拟 - Redis 7.0"""
from typing import Optional


class HashTableEntry:
    """哈希表节点"""

    def __init__(self, key: str, value: str):
        self.key = key
        self.value = value
        self.next: Optional['HashTableEntry'] = None  # 链地址法


class HashTable:
    """模拟 Redis 7.0 的 HashTable 结构

    Redis 使用链地址法解决哈希冲突
    渐进式 rehash: 从旧表逐步迁移到新表
    """

    INITIAL_SIZE = 4  # 哈希表初始大小

    def __init__(self):
        self.size = self.INITIAL_SIZE
        self.table: list[Optional[HashTableEntry]] = [None] * self.size
        self.used = 0
        self.rehash_idx = -1  # -1 表示未在进行 rehash
        self.rehashing = False
        self.old_table: Optional[list[Optional[HashTableEntry]]] = None
        self.old_size = 0
        self.old_used = 0

    def _hash(self, key: str) -> int:
        """简单哈希函数 (模拟)"""
        return hash(key) % self.size

    def _needs_expand(self) -> bool:
        """判断是否需要扩容 (负载因子 >= 1)"""
        return self.used >= self.size

    def _expand(self):
        """扩容哈希表 (2 倍)"""
        new_size = self.size * 2
        new_table: list[Optional[HashTableEntry]] = [None] * new_size

        # 迁移所有条目
        for i in range(self.size):
            entry = self.table[i]
            while entry:
                next_entry = entry.next
                # 重新哈希到新表
                new_idx = hash(entry.key) % new_size
                entry.next = new_table[new_idx]
                new_table[new_idx] = entry
                entry = next_entry

        self.table = new_table
        self.size = new_size

    def set(self, key: str, value: str) -> dict:
        """设置键值对"""
        idx = self._hash(key)

        # 检查是否已存在
        entry = self.table[idx]
        while entry:
            if entry.key == key:
                old_value = entry.value
                entry.value = value
                return {"action": "update", "key": key, "old_value": old_value, "new_value": value}
            entry = entry.next

        # 新增
        new_entry = HashTableEntry(key, value)
        new_entry.next = self.table[idx]
        self.table[idx] = new_entry
        self.used += 1

        # 检查是否需要扩容
        expanded = False
        if self._needs_expand():
            self._expand()
            expanded = True

        return {"action": "add", "key": key, "value": value, "expanded": expanded}

    def get(self, key: str) -> Optional[str]:
        """获取值"""
        idx = self._hash(key)
        entry = self.table[idx]
        while entry:
            if entry.key == key:
                return entry.value
            entry = entry.next
        return None

    def delete(self, key: str) -> dict:
        """删除键值对"""
        idx = self._hash(key)
        prev = None
        entry = self.table[idx]

        while entry:
            if entry.key == key:
                if prev:
                    prev.next = entry.next
                else:
                    self.table[idx] = entry.next
                self.used -= 1
                return {"action": "delete", "key": key, "value": entry.value}
            prev = entry
            entry = entry.next

        return {"action": "not_found", "key": key}

    def get_all_entries(self) -> list[dict]:
        """获取所有条目"""
        entries = []
        for i in range(self.size):
            entry = self.table[i]
            while entry:
                entries.append({"key": entry.key, "value": entry.value, "bucket": i})
                entry = entry.next
        return entries

    def get_bucket_info(self) -> list[dict]:
        """获取桶信息"""
        buckets = []
        for i in range(self.size):
            count = 0
            entry = self.table[i]
            while entry:
                count += 1
                entry = entry.next
            buckets.append({"index": i, "count": count})
        return buckets

    def get_structure(self) -> dict:
        return {
            "encoding": "hashtable",
            "size": self.size,
            "used": self.used,
            "load_factor": round(self.used / self.size, 2) if self.size > 0 else 0,
            "entries": self.get_all_entries(),
            "buckets": self.get_bucket_info(),
            "source_code": """typedef struct dictht {
    dictEntry **table;      /* 哈希表数组 */
    unsigned long size;     /* 哈希表大小 */
    unsigned long sizemask; /* 哈希表大小掩码 = size-1 */
    unsigned long used;     /* 已有节点数 */
} dictht;

typedef struct dictEntry {
    void *key;              /* 键 */
    union {                 /* 值 */
        void *val;
        uint64_t u64;
        int64_t s64;
        double d;
    } v;
    struct dictEntry *next; /* 下一个节点 (链地址法) */
} dictEntry;"""
        }

    def reset(self):
        self.size = self.INITIAL_SIZE
        self.table = [None] * self.size
        self.used = 0
        self.rehash_idx = -1
        self.rehashing = False
        self.old_table = None
