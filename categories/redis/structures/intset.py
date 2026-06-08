"""IntSet 模拟 - Redis 7.0"""
from typing import Optional


class IntSet:
    """模拟 Redis 7.0 的 IntSet 结构

    IntSet 是 Redis 中 Set 的底层编码之一：
    - 所有元素都是整数
    - 元素按从小到大有序排列
    - 根据元素大小自动升级编码 (int16 -> int32 -> int64)
    - 内存紧凑，无指针
    """

    INT16_MIN = -32768
    INT16_MAX = 32767
    INT32_MIN = -2147483648
    INT32_MAX = 2147483647

    def __init__(self):
        self.encoding = "int16"  # int16 / int32 / int64
        self.contents: list[int] = []
        self.encoding_history: list[dict] = []

    def _needs_upgrade(self, value: int) -> Optional[str]:
        """判断是否需要升级编码"""
        if self.encoding == "int16":
            if value < self.INT16_MIN or value > self.INT16_MAX:
                if value < self.INT32_MIN or value > self.INT32_MAX:
                    return "int64"
                return "int32"
        elif self.encoding == "int32":
            if value < self.INT32_MIN or value > self.INT32_MAX:
                return "int64"
        return None

    def _upgrade_encoding(self, new_encoding: str):
        """升级编码"""
        old_encoding = self.encoding
        self.encoding = new_encoding
        self.encoding_history.append({
            "from": old_encoding,
            "to": new_encoding,
            "reason": f"新增元素超出 {old_encoding} 范围，升级为 {new_encoding}"
        })

    def add(self, value: int) -> dict:
        """添加整数元素"""
        # 检查是否需要升级
        new_encoding = self._needs_upgrade(value)
        if new_encoding:
            self._upgrade_encoding(new_encoding)

        # 有序插入
        if value not in self.contents:
            self.contents.append(value)
            self.contents.sort()
            return {"action": "add", "value": value, "encoding": self.encoding, "upgraded": new_encoding is not None}
        return {"action": "already_exists", "value": value, "encoding": self.encoding}

    def remove(self, value: int) -> dict:
        """删除元素"""
        if value in self.contents:
            self.contents.remove(value)
            return {"action": "remove", "value": value, "encoding": self.encoding}
        return {"action": "not_found", "value": value}

    def contains(self, value: int) -> bool:
        return value in self.contents

    def should_convert_to_hashtable(self) -> bool:
        """判断是否应转换为 hashtable"""
        return len(self.contents) > 512  # set-max-intset-entries 默认值

    def add_non_integer(self, value: str) -> dict:
        """添加非整数值，触发转换为 hashtable"""
        return {
            "action": "convert_to_hashtable",
            "reason": f"元素 '{value}' 不是整数，IntSet 无法存储，需转换为 HashTable",
            "current_entries": list(self.contents)
        }

    def get_structure(self) -> dict:
        encoding_sizes = {"int16": 2, "int32": 4, "int64": 8}
        return {
            "encoding": "intset",
            "int_encoding": self.encoding,
            "entry_count": len(self.contents),
            "bytes_per_entry": encoding_sizes.get(self.encoding, 2),
            "total_bytes": len(self.contents) * encoding_sizes.get(self.encoding, 2) + 8,
            "contents": self.contents,
            "encoding_ranges": {
                "int16": {"min": self.INT16_MIN, "max": self.INT16_MAX},
                "int32": {"min": self.INT32_MIN, "max": self.INT32_MAX},
                "int64": {"min": -9223372036854775808, "max": 9223372036854775807}
            },
            "encoding_history": self.encoding_history,
            "source_code": """typedef struct intset {
    uint32_t encoding;  /* 编码类型: INT16/INT32/INT64 */
    uint32_t length;    /* 元素数量 */
    int8_t contents[];  /* 有序整数数组 */
} intset;

/* 编码升级过程:
   1. 重新分配更大内存
   2. 从后往前移动元素到新位置
   3. 插入新元素
   4. 修改 encoding */
"""
        }

    def reset(self):
        self.encoding = "int16"
        self.contents = []
        self.encoding_history = []
