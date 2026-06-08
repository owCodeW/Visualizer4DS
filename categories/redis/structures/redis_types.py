"""Redis 类型封装器 - 管理编码自动切换逻辑（只升级不降级）"""
from .sds import SDS
from .quicklist import QuickList
from .listpack import Listpack
from .hashtable import HashTable
from .intset import IntSet
from .skiplist import SkipList


class RedisString:
    """String 类型 - 管理 int/embstr/raw 编码切换（只升级不降级）

    升级路径: int → embstr → raw（单向不可逆）
    - 即使值变回短字符串，raw 也不会降回 embstr
    - 即使值变回整数，embstr/raw 也不会降回 int
    """

    def __init__(self):
        self.sds = SDS()
        self.type_name = "String"

    def set(self, value: str) -> dict:
        result = self.sds.set_value(value)
        return {
            "type": self.type_name,
            "operation": "SET",
            "result": result,
            "structure": self.get_structure()
        }

    def append(self, suffix: str) -> dict:
        result = self.sds.append_value(suffix)
        return {
            "type": self.type_name,
            "operation": "APPEND",
            "result": result,
            "structure": self.get_structure()
        }

    def incr(self) -> dict:
        result = self.sds.incr()
        return {
            "type": self.type_name,
            "operation": "INCR",
            "result": result,
            "structure": self.get_structure()
        }

    def get_structure(self) -> dict:
        return self.sds.get_structure()

    def reset(self):
        self.sds.reset()


class RedisList:
    """List 类型 - 管理 listpack/quicklist 编码切换（只升级不降级）

    升级路径: listpack → quicklist（单向不可逆）
    - 小列表: listpack (元素少时)
    - 大列表: quicklist (双向链表 + 多个 listpack 节点)
    - 一旦升级为 quicklist，即使删除到只剩少量元素也不降级
    """

    LISTPACK_MAX_ENTRIES = 8  # 简化阈值: 元素数超过此值升级为 quicklist

    def __init__(self):
        self.encoding = "listpack"
        self.entries: list[str] = []  # listpack 模式下用纯字符串列表
        self.total_bytes = 0
        self.quicklist = QuickList()
        self.type_name = "List"
        self.encoding_history: list[dict] = []
        self.LISTPACK_MAX_ENTRIES = 8

    def _check_convert_to_quicklist(self) -> dict | None:
        """检查是否需要从 listpack 升级为 quicklist"""
        if self.encoding == "listpack" and len(self.entries) > self.LISTPACK_MAX_ENTRIES:
            old_enc = self.encoding
            # 迁移数据到 quicklist (保持原顺序)
            for item in self.entries:
                self.quicklist.rpush(item)
            self.entries = []
            self.encoding = "quicklist"
            change = {
                "from": old_enc,
                "to": "quicklist",
                "reason": f"元素数量超过 {self.LISTPACK_MAX_ENTRIES} 阈值，升级为 quicklist（不可逆）",
                "irreversible": True
            }
            self.encoding_history.append(change)
            return change
        return None

    def lpush(self, item: str) -> dict:
        if self.encoding == "listpack":
            self.entries.insert(0, item)
            self.total_bytes += len(item.encode('utf-8')) + 4
            result = {"action": "lpush", "item": item}
            change = self._check_convert_to_quicklist()
        else:
            result = self.quicklist.lpush(item)
            change = None

        return {
            "type": self.type_name,
            "operation": "LPUSH",
            "encoding": self.encoding,
            "result": result,
            "encoding_change": change,
            "structure": self.get_structure()
        }

    def rpush(self, item: str) -> dict:
        if self.encoding == "listpack":
            self.entries.append(item)
            self.total_bytes += len(item.encode('utf-8')) + 4
            result = {"action": "rpush", "item": item}
            change = self._check_convert_to_quicklist()
        else:
            result = self.quicklist.rpush(item)
            change = None

        return {
            "type": self.type_name,
            "operation": "RPUSH",
            "encoding": self.encoding,
            "result": result,
            "encoding_change": change,
            "structure": self.get_structure()
        }

    def lpop(self) -> dict:
        if self.encoding == "listpack":
            if self.entries:
                item = self.entries.pop(0)
                self.total_bytes -= len(item.encode('utf-8')) + 4
                result = {"action": "lpop", "item": item}
            else:
                result = {"error": "列表为空"}
            change = None
        else:
            result = self.quicklist.lpop()
            # 注意: 即使 quicklist 中元素很少，也不降级回 listpack
            change = None

        return {
            "type": self.type_name,
            "operation": "LPOP",
            "encoding": self.encoding,
            "result": result,
            "encoding_change": change,
            "structure": self.get_structure()
        }

    def rpop(self) -> dict:
        if self.encoding == "listpack":
            if self.entries:
                item = self.entries.pop()
                self.total_bytes -= len(item.encode('utf-8')) + 4
                result = {"action": "rpop", "item": item}
            else:
                result = {"error": "列表为空"}
            change = None
        else:
            result = self.quicklist.rpop()
            change = None

        return {
            "type": self.type_name,
            "operation": "RPOP",
            "encoding": self.encoding,
            "result": result,
            "encoding_change": change,
            "structure": self.get_structure()
        }

    def split(self, node_idx: int) -> dict:
        """手动触发节点分裂"""
        if self.encoding == "listpack":
            return {"error": "listpack 编码不支持节点分裂", "structure": self.get_structure()}
        result = self.quicklist.split_node(node_idx)
        return {
            "type": self.type_name,
            "operation": "SPLIT",
            "encoding": self.encoding,
            "result": result,
            "structure": self.get_structure()
        }

    def bulk_fill(self, count: int) -> dict:
        """批量填充 N 个元素 (RPUSH 顺序追加)，用于演示编码升级

        - 元素命名: item_0, item_1, ..., item_{N-1}
        - 返回最终结构 + 升级信息（若升级发生）
        """
        added = 0
        for i in range(count):
            self.rpush(f"item_{i}")
            added += 1
        struct = self.get_structure()
        return {
            "type": self.type_name,
            "operation": "BULK_FILL",
            "encoding": self.encoding,
            "added": added,
            "target": count,
            "structure": struct,
            "encoding_change": struct.get("encoding_history", [])[-1] if struct.get("encoding_history") else None
        }

    def get_structure(self) -> dict:
        if self.encoding == "listpack":
            return {
                "type": "List",
                "current_encoding": "listpack",
                "encoding": "listpack",
                "count": len(self.entries),
                "node_count": 1,
                "total_bytes": self.total_bytes,
                "entries": [{"field": e, "value": "1"} for e in self.entries],
                "max_entries": self.LISTPACK_MAX_ENTRIES,
                "threshold": {
                    "listpack_max_entries": self.LISTPACK_MAX_ENTRIES,
                },
                "encoding_history": self.encoding_history,
            }
        else:
            ql_state = self.quicklist.get_structure()
            ql_state["encoding_history"] = self.encoding_history
            ql_state["downgrade_note"] = "quicklist 即使删除到只剩 1 个元素，也不会降回 listpack"
            return ql_state

    def reset(self):
        self.encoding = "listpack"
        self.entries = []
        self.total_bytes = 0
        self.quicklist = QuickList()
        self.encoding_history = []


class RedisHash:
    """Hash 类型 - 管理 listpack/hashtable 编码切换（只升级不降级）

    升级路径: listpack → hashtable（单向不可逆）
    - 元素数 ≤ 128 且值长度 ≤ 64B → listpack
    - 任一条件突破 → hashtable，不降级
    - 即使后来删到只剩几个小元素，仍为 hashtable
    """

    LISTPACK_MAX_ENTRIES = 128  # hash-max-listpack-entries

    def __init__(self):
        self.encoding = "listpack"
        self.listpack = Listpack()
        self.hashtable = HashTable()
        self.type_name = "Hash"
        self.encoding_history: list[dict] = []

    def _check_convert(self) -> dict | None:
        """检查是否需要从 listpack 升级为 hashtable（不可逆）"""
        if self.encoding == "listpack" and self.listpack.entry_count() > self.LISTPACK_MAX_ENTRIES:
            old_enc = self.encoding
            # 迁移数据
            for field, value in self.listpack.get_all_entries():
                self.hashtable.set(field, value)
            self.encoding = "hashtable"
            change = {
                "from": old_enc,
                "to": "hashtable",
                "reason": f"元素数量超过 {self.LISTPACK_MAX_ENTRIES} 阈值，升级为 hashtable（不可逆）",
                "irreversible": True
            }
            self.encoding_history.append(change)
            return change
        return None

    def hset(self, field: str, value: str) -> dict:
        if self.encoding == "listpack":
            result = self.listpack.add_entry(field, value)
            change = self._check_convert()
        else:
            # 已经是 hashtable，不会降级回 listpack
            result = self.hashtable.set(field, value)
            change = None

        return {
            "type": self.type_name,
            "operation": "HSET",
            "encoding": self.encoding,
            "result": result,
            "encoding_change": change,
            "structure": self.get_structure()
        }

    def hdel(self, field: str) -> dict:
        if self.encoding == "listpack":
            result = self.listpack.remove_entry(field)
        else:
            # hashtable 删除元素后不会降级回 listpack
            result = self.hashtable.delete(field)

        return {
            "type": self.type_name,
            "operation": "HDEL",
            "encoding": self.encoding,
            "result": result,
            "structure": self.get_structure()
        }

    def hget(self, field: str) -> dict:
        if self.encoding == "listpack":
            value = self.listpack.get_entry(field)
        else:
            value = self.hashtable.get(field)

        return {
            "type": self.type_name,
            "operation": "HGET",
            "encoding": self.encoding,
            "field": field,
            "value": value
        }

    def bulk_fill(self, count: int) -> dict:
        """批量填充 N 个 field-value 对，用于演示编码升级

        - 字段命名: field_0, field_1, ..., field_{N-1}
        - 值命名:   value_0, value_1, ..., value_{N-1}
        """
        added = 0
        for i in range(count):
            self.hset(f"field_{i}", f"value_{i}")
            added += 1
        struct = self.get_structure()
        return {
            "type": self.type_name,
            "operation": "BULK_FILL",
            "encoding": self.encoding,
            "added": added,
            "target": count,
            "structure": struct,
            "encoding_change": struct.get("encoding_history", [])[-1] if struct.get("encoding_history") else None
        }

    def get_structure(self) -> dict:
        if self.encoding == "listpack":
            struct = self.listpack.get_structure()
        else:
            # hashtable 数据契约与 Set/ZSet 统一: 放到 struct["hashtable"]
            ht_struct = self.hashtable.get_structure()
            struct = {
                "type": "hash",
                "encoding": "hashtable",
                "hashtable": ht_struct,
            }
        struct["type"] = self.type_name
        struct["current_encoding"] = self.encoding
        struct["encoding_history"] = self.encoding_history
        struct["irreversible"] = True
        struct["threshold"] = {"listpack_max_entries": self.LISTPACK_MAX_ENTRIES}
        if self.encoding == "hashtable":
            struct["downgrade_note"] = "hashtable 不支持降级回 listpack，即使删除元素到很少"
        return struct

    def reset(self):
        self.encoding = "listpack"
        self.listpack = Listpack()
        self.hashtable = HashTable()
        self.encoding_history = []


class RedisSet:
    """Set 类型 - 管理 intset/hashtable 编码切换（只升级不降级）

    升级路径: intset → hashtable（单向不可逆）
    - 全部为整数且数量 ≤ 512 → intset
    - 包含非整数或数量 > 512 → hashtable，永不降级
    - 即使删除所有非整数元素，仍为 hashtable
    """

    INTSET_MAX_ENTRIES = 512  # set-max-intset-entries

    def __init__(self):
        self.encoding = "intset"
        self.intset = IntSet()
        self.hashtable = HashTable()
        self.type_name = "Set"
        self.encoding_history: list[dict] = []

    def _convert_to_hashtable(self, reason: str) -> dict:
        """执行 intset → hashtable 升级（不可逆）"""
        old_enc = self.encoding
        # 迁移数据
        for v in self.intset.contents:
            self.hashtable.set(str(v), "1")
        self.encoding = "hashtable"
        change = {
            "from": old_enc,
            "to": "hashtable",
            "reason": reason,
            "irreversible": True
        }
        self.encoding_history.append(change)
        return change

    def sadd(self, value: str) -> dict:
        if self.encoding == "intset":
            try:
                int_val = int(value)
                result = self.intset.add(int_val)
                # 检查是否需要升级
                change = None
                if self.intset.should_convert_to_hashtable():
                    change = self._convert_to_hashtable(
                        f"元素数量超过 {self.INTSET_MAX_ENTRIES} 阈值，升级为 hashtable（不可逆）"
                    )
                    result["converted"] = True
            except ValueError:
                # 非整数，必须升级为 hashtable
                change = self._convert_to_hashtable(
                    f"元素 '{value}' 不是整数，IntSet 无法存储，升级为 hashtable（不可逆）"
                )
                self.hashtable.set(value, "1")
                result = {"action": "add", "value": value, "converted": True}
        else:
            # 已经是 hashtable，不会降级回 intset
            result = self.hashtable.set(value, "1")
            change = None

        return {
            "type": self.type_name,
            "operation": "SADD",
            "encoding": self.encoding,
            "result": result,
            "encoding_change": change,
            "structure": self.get_structure()
        }

    def srem(self, value: str) -> dict:
        if self.encoding == "intset":
            try:
                int_val = int(value)
                result = self.intset.remove(int_val)
            except ValueError:
                result = {"action": "not_found", "value": value}
        else:
            # hashtable 删除元素后不会降级回 intset
            result = self.hashtable.delete(value)

        return {
            "type": self.type_name,
            "operation": "SREM",
            "encoding": self.encoding,
            "result": result,
            "structure": self.get_structure()
        }

    def bulk_fill(self, count: int) -> dict:
        """批量填充 N 个元素，用于演示编码升级

        - 元素命名: member_0, member_1, ..., member_{N-1}
        - 使用纯整数（intset 阶段），触发 intset 升级时再混入非整数
        """
        added = 0
        for i in range(count):
            self.sadd(f"member_{i}")
            added += 1
        struct = self.get_structure()
        return {
            "type": self.type_name,
            "operation": "BULK_FILL",
            "encoding": self.encoding,
            "added": added,
            "target": count,
            "structure": struct,
            "encoding_change": struct.get("encoding_history", [])[-1] if struct.get("encoding_history") else None
        }

    def get_structure(self) -> dict:
        if self.encoding == "intset":
            struct = self.intset.get_structure()
        else:
            # hashtable 数据契约与 Hash/ZSet 统一: 放到 struct["hashtable"]
            ht_struct = self.hashtable.get_structure()
            struct = {
                "type": "set",
                "encoding": "hashtable",
                "hashtable": ht_struct,
            }
        struct["type"] = self.type_name
        struct["current_encoding"] = self.encoding
        struct["encoding_history"] = self.encoding_history
        struct["irreversible"] = True
        struct["threshold"] = {"intset_max_entries": self.INTSET_MAX_ENTRIES}
        if self.encoding == "hashtable":
            struct["downgrade_note"] = "hashtable 不支持降级回 intset，即使删除所有非整数元素"
        return struct

    def reset(self):
        self.encoding = "intset"
        self.intset = IntSet()
        self.hashtable = HashTable()
        self.encoding_history = []


class RedisZSet:
    """ZSet 类型 - 管理 listpack/skiplist 编码切换（只升级不降级）

    升级路径: listpack → skiplist+hashtable（单向不可逆）
    - 元素数 ≤ 128 且值长度 ≤ 64B → listpack
    - 超限 → 跳表+哈希表，不降级
    - 即使后来删除元素到很少，仍为 skiplist
    """

    LISTPACK_MAX_ENTRIES = 128  # zset-max-listpack-entries

    def __init__(self):
        self.encoding = "listpack"
        self.listpack = Listpack()
        self.skiplist = SkipList()
        self.skiplist_ht = HashTable()  # skiplist 配合的 hashtable
        self.type_name = "ZSet"
        self.encoding_history: list[dict] = []

    def _check_convert(self) -> dict | None:
        """检查是否需要从 listpack 升级为 skiplist（不可逆）"""
        if self.encoding == "listpack" and self.listpack.entry_count() > self.LISTPACK_MAX_ENTRIES:
            old_enc = self.encoding
            # 迁移数据
            for field, value in self.listpack.get_all_entries():
                try:
                    score = float(value)
                except ValueError:
                    score = 0.0
                self.skiplist.insert(score, field)
                self.skiplist_ht.set(field, value)
            self.encoding = "skiplist"
            change = {
                "from": old_enc,
                "to": "skiplist",
                "reason": f"元素数量超过 {self.LISTPACK_MAX_ENTRIES} 阈值，升级为 skiplist + hashtable（不可逆）",
                "irreversible": True
            }
            self.encoding_history.append(change)
            return change
        return None

    def zadd(self, member: str, score: float) -> dict:
        if self.encoding == "listpack":
            result = self.listpack.add_entry(member, str(score))
            change = self._check_convert()
        else:
            # 已经是 skiplist，不会降级回 listpack
            self.skiplist.insert(score, member)
            self.skiplist_ht.set(member, str(score))
            result = {"action": "add", "member": member, "score": score}
            change = None

        return {
            "type": self.type_name,
            "operation": "ZADD",
            "encoding": self.encoding,
            "result": result,
            "encoding_change": change,
            "structure": self.get_structure()
        }

    def zrem(self, member: str) -> dict:
        if self.encoding == "listpack":
            result = self.listpack.remove_entry(member)
        else:
            # skiplist 删除元素后不会降级回 listpack
            val = self.skiplist_ht.get(member)
            if val:
                score = float(val)
                result = self.skiplist.delete(score, member)
                self.skiplist_ht.delete(member)
            else:
                result = {"action": "not_found", "member": member}

        return {
            "type": self.type_name,
            "operation": "ZREM",
            "encoding": self.encoding,
            "result": result,
            "structure": self.get_structure()
        }

    def bulk_fill(self, count: int) -> dict:
        """批量填充 N 个 member-score 对，用于演示编码升级

        - member 命名: member_0, member_1, ..., member_{N-1}
        - score:  i * 1.0 (升序)
        """
        added = 0
        for i in range(count):
            self.zadd(f"member_{i}", float(i))
            added += 1
        struct = self.get_structure()
        return {
            "type": self.type_name,
            "operation": "BULK_FILL",
            "encoding": self.encoding,
            "added": added,
            "target": count,
            "structure": struct,
            "encoding_change": struct.get("encoding_history", [])[-1] if struct.get("encoding_history") else None
        }

    def get_structure(self) -> dict:
        if self.encoding == "listpack":
            struct = self.listpack.get_structure()
        else:
            struct = self.skiplist.get_structure()
            # 直接复用 HashTable.get_structure() 保持与 Hash/Set 一致的数据契约
            struct["hashtable"] = self.skiplist_ht.get_structure()
        struct["type"] = self.type_name
        struct["current_encoding"] = self.encoding
        struct["encoding_history"] = self.encoding_history
        struct["irreversible"] = True
        struct["threshold"] = {"listpack_max_entries": self.LISTPACK_MAX_ENTRIES}
        if self.encoding == "skiplist":
            struct["downgrade_note"] = "skiplist 不支持降级回 listpack，即使删除元素到很少"
        return struct

    def reset(self):
        self.encoding = "listpack"
        self.listpack = Listpack()
        self.skiplist = SkipList()
        self.skiplist_ht = HashTable()
        self.encoding_history = []
