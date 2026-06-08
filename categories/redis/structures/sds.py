"""SDS (Simple Dynamic String) 模拟 - Redis 7.0"""
from typing import Optional


class SDS:
    """模拟 Redis 7.0 的 SDS 结构

    编码类型 (升级优先级: int < embstr < raw):
    - int: 整数值 (long 类型范围内)
    - embstr: 短字符串 (<=44 字节)，SDS 和 redisObject 一次分配
    - raw: 长字符串 (>44 字节)，SDS 和 redisObject 分开分配

    核心规则: 编码只升级不降级！
    - int → embstr → raw 单向不可逆
    - 即使值变回短字符串，raw 也不会降回 embstr
    - 即使值变回整数，embstr/raw 也不会降回 int
    """

    EMBSTR_MAX_LEN = 44  # Redis 7 中 embstr 最大长度

    # 编码优先级: 数字越大优先级越高，只允许往高优先级升级
    ENCODING_LEVEL = {"int": 0, "embstr": 1, "raw": 2}

    def __init__(self, value: str = ""):
        self.value = value
        self.encoding_history: list[dict] = []
        # 直接根据初始值计算编码，避免空串被误判为 embstr
        # 同时把 max_encoding 初始化为与 encoding 一致，防止后续空 SET 触发误报
        if value == "":
            self.encoding = "int"
            self.max_encoding = "int"
        else:
            self.encoding = self._compute_encoding()
            self.max_encoding = self.encoding

    def _compute_encoding(self) -> str:
        """根据当前值计算「应该」使用的编码 (不考虑不可逆规则)"""
        try:
            int_val = int(self.value)
            if str(int_val) == self.value:
                return "int"
            else:
                raise ValueError
        except (ValueError, OverflowError):
            byte_len = len(self.value.encode('utf-8'))
            if byte_len <= self.EMBSTR_MAX_LEN:
                return "embstr"
            else:
                return "raw"

    def _update_encoding(self, init: bool = False) -> Optional[dict]:
        """根据当前值更新编码，遵循只升级不降级规则"""
        old_encoding = self.encoding
        target_encoding = self._compute_encoding()

        # 核心规则: 只升级不降级
        if self.ENCODING_LEVEL[target_encoding] > self.ENCODING_LEVEL[self.max_encoding]:
            # 可以升级
            self.encoding = target_encoding
            self.max_encoding = target_encoding
        elif self.ENCODING_LEVEL[target_encoding] < self.ENCODING_LEVEL[self.max_encoding]:
            # 试图降级 → 阻止，保持最高编码
            self.encoding = self.max_encoding
            downgrade_blocked = True
        else:
            # 同级别，不变
            self.encoding = target_encoding
            downgrade_blocked = False

        # 检测是否发生了降级阻止
        downgrade_blocked = (
            self.ENCODING_LEVEL[target_encoding] < self.ENCODING_LEVEL[old_encoding]
            or (self.ENCODING_LEVEL[target_encoding] < self.ENCODING_LEVEL[self.max_encoding] and not init)
        )

        if not init and old_encoding != self.encoding:
            change = {
                "from": old_encoding,
                "to": self.encoding,
                "reason": self._get_switch_reason(old_encoding, self.encoding),
                "threshold": self._get_threshold_info(),
                "irreversible": True  # 标记升级不可逆
            }
            self.encoding_history.append(change)
            return change
        elif not init and downgrade_blocked:
            # 降级被阻止
            blocked_change = {
                "from": old_encoding,
                "to": self.encoding,
                "attempted_encoding": target_encoding,
                "reason": self._get_downgrade_blocked_reason(target_encoding, self.max_encoding),
                "blocked": True,
                "threshold": self._get_threshold_info()
            }
            self.encoding_history.append(blocked_change)
            return blocked_change
        return None

    def _get_switch_reason(self, from_enc: str, to_enc: str) -> str:
        reasons = {
            ("int", "embstr"): "整数被修改为非整数字符串，且长度 <= 44 字节，升级为 embstr（不可逆）",
            ("int", "raw"): "整数被修改为非整数字符串，且长度 > 44 字节，升级为 raw（不可逆）",
            ("embstr", "raw"): "字符串长度超过 44 字节阈值，升级为 raw（不可逆）",
        }
        return reasons.get((from_enc, to_enc), f"编码从 {from_enc} 升级为 {to_enc}（不可逆）")

    def _get_downgrade_blocked_reason(self, attempted: str, current: str) -> str:
        reasons = {
            ("int", "embstr"): "值变为整数，但 embstr 不支持降级为 int（Redis 编码只升级不降级）",
            ("int", "raw"): "值变为整数，但 raw 不支持降级为 int（Redis 编码只升级不降级）",
            ("embstr", "raw"): "值变为短字符串，但 raw 不支持降级为 embstr（Redis 编码只升级不降级）",
        }
        return reasons.get((attempted, current), f"编码 {current} 不支持降级为 {attempted}（Redis 编码只升级不降级）")

    def _get_threshold_info(self) -> dict:
        return {
            "embstr_max_len": self.EMBSTR_MAX_LEN,
            "current_byte_len": len(self.value.encode('utf-8')),
            "is_integer": self._compute_encoding() == "int",
            "max_encoding": self.max_encoding,
            "irreversible": True
        }

    def set_value(self, value: str) -> dict:
        """设置新值，返回操作结果"""
        self.value = value
        change = self._update_encoding()
        return {
            "value": self.value,
            "encoding": self.encoding,
            "byte_len": len(self.value.encode('utf-8')),
            "encoding_change": change,
            "threshold": self._get_threshold_info()
        }

    def append_value(self, suffix: str) -> dict:
        """追加字符串"""
        self.value += suffix
        change = self._update_encoding()
        return {
            "value": self.value,
            "encoding": self.encoding,
            "byte_len": len(self.value.encode('utf-8')),
            "encoding_change": change,
            "threshold": self._get_threshold_info()
        }

    def incr(self) -> dict:
        """自增操作 (仅 int 编码可用)"""
        if self.encoding != "int":
            return {
                "error": f"INCR 操作仅适用于整数编码的 String，当前编码为 {self.encoding}（已升级不可逆）",
                "encoding": self.encoding
            }
        int_val = int(self.value) + 1
        self.value = str(int_val)
        return {
            "value": self.value,
            "encoding": self.encoding,
            "byte_len": len(self.value.encode('utf-8')),
            "encoding_change": None,
            "threshold": self._get_threshold_info()
        }

    def get_structure(self) -> dict:
        """获取当前结构信息"""
        byte_len = len(self.value.encode('utf-8'))
        return {
            "type": "String",
            "value": self.value,
            "encoding": self.encoding,
            "max_encoding": self.max_encoding,
            "byte_len": byte_len,
            "alloc": byte_len,
            "flags": "sds_type",
            "threshold": self._get_threshold_info(),
            "encoding_history": self.encoding_history,
            "irreversible": True,
            "source_code": {
                "sds_struct": """struct __attribute__((__packed__)) sdshdr8 {
    uint8_t len;        /* 已使用长度 */
    uint8_t alloc;      /* 总分配长度，不含头和空终止 */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];         /* 数据缓冲区 */
};""",
                "redisobject": """typedef struct redisObject {
    unsigned type:4;        /* 对象类型 */
    unsigned encoding:4;    /* 编码方式 */
    unsigned lru:24;        /* LRU 时间 */
    int refcount;           /* 引用计数 */
    void *ptr;              /* 指向底层数据的指针 */
} robj;""",
                "encoding_desc": {
                    "int": "ptr 直接存储整数值，不分配 SDS",
                    "embstr": "SDS 和 redisObject 在一块连续内存中分配，减少内存碎片",
                    "raw": "SDS 和 redisObject 分开分配，适用于长字符串"
                },
                "irreversible_rule": "编码只升级不降级: int → embstr → raw 单向不可逆"
            }
        }

    def reset(self):
        """重置结构"""
        self.value = ""
        self.encoding = "int"
        self.max_encoding = "int"
        self.encoding_history = []
