"""QuickList 模拟 - Redis 7.0 List 底层结构"""
from typing import Optional


class QuickListNode:
    """quicklistNode 节点"""

    def __init__(self, items: Optional[list[str]] = None):
        self.prev: Optional['QuickListNode'] = None
        self.next: Optional['QuickListNode'] = None
        self.items: list[str] = items or []  # 模拟 listpack 中的元素
        self.sz: int = 0  # listpack 内存大小估算
        self._update_sz()

    def _update_sz(self):
        self.sz = sum(len(item.encode('utf-8')) + 4 for item in self.items) + 10

    def item_count(self) -> int:
        return len(self.items)


class QuickList:
    """模拟 Redis 7.0 的 QuickList 结构

    QuickList = 双向链表 + 每个节点内嵌 Listpack
    - Redis 7 使用 listpack 替代了 ziplist
    - 消除了连锁更新问题
    """

    MAX_ITEM_PER_NODE = 6  # 单节点最大元素数 (简化阈值)

    def __init__(self):
        self.head: Optional[QuickListNode] = None
        self.tail: Optional[QuickListNode] = None
        self.count: int = 0  # 全局总元素数
        self.len: int = 0    # quicklistNode 节点总数
        self.encoding = "quicklist"
        self.encoding_history: list[dict] = []

    def _add_first_node(self, item: str, left: bool = True) -> dict:
        """添加第一个节点"""
        node = QuickListNode([item])
        self.head = node
        self.tail = node
        self.len = 1
        self.count = 1
        return {"action": "add_node", "node_id": id(node), "item": item}

    def lpush(self, item: str) -> dict:
        """从头部添加元素"""
        self.count += 1
        if self.head is None:
            return self._add_first_node(item, left=True)

        head = self.head
        if head.item_count() < self.MAX_ITEM_PER_NODE:
            head.items.insert(0, item)
            head._update_sz()
        else:
            # 头节点已满，创建新节点
            new_node = QuickListNode([item])
            new_node.next = self.head
            self.head.prev = new_node
            self.head = new_node
            self.len += 1

        return self._get_state()

    def rpush(self, item: str) -> dict:
        """从尾部添加元素"""
        self.count += 1
        if self.tail is None:
            return self._add_first_node(item, left=False)

        tail = self.tail
        if tail.item_count() < self.MAX_ITEM_PER_NODE:
            tail.items.append(item)
            tail._update_sz()
        else:
            # 尾节点已满，创建新节点
            new_node = QuickListNode([item])
            new_node.prev = self.tail
            self.tail.next = new_node
            self.tail = new_node
            self.len += 1

        return self._get_state()

    def lpop(self) -> dict:
        """从头部弹出元素"""
        if self.head is None:
            return {"error": "列表为空"}

        head = self.head
        item = head.items.pop(0)
        self.count -= 1
        head._update_sz()

        if len(head.items) == 0:
            # 节点为空，移除
            self.head = head.next
            if self.head:
                self.head.prev = None
            else:
                self.tail = None
            self.len -= 1

        return {"action": "lpop", "item": item, **self._get_state()}

    def rpop(self) -> dict:
        """从尾部弹出元素"""
        if self.tail is None:
            return {"error": "列表为空"}

        tail = self.tail
        item = tail.items.pop()
        self.count -= 1
        tail._update_sz()

        if len(tail.items) == 0:
            self.tail = tail.prev
            if self.tail:
                self.tail.next = None
            else:
                self.head = None
            self.len -= 1

        return {"action": "rpop", "item": item, **self._get_state()}

    def split_node(self, node_idx: int) -> dict:
        """手动触发节点分裂"""
        nodes = self._get_node_list()
        if node_idx < 0 or node_idx >= len(nodes):
            return {"error": "无效的节点索引"}

        old_node = nodes[node_idx]
        if old_node.item_count() <= 1:
            return {"error": "节点元素不足，无法分裂"}

        mid = len(old_node.items) // 2
        left_items = old_node.items[:mid]
        right_items = old_node.items[mid:]

        # 创建新节点
        new_node = QuickListNode(right_items)
        new_node.next = old_node.next
        new_node.prev = old_node

        if old_node.next:
            old_node.next.prev = new_node
        else:
            self.tail = new_node

        old_node.next = new_node
        old_node.items = left_items
        old_node._update_sz()
        self.len += 1

        return {"action": "split", "node_idx": node_idx, **self._get_state()}

    def _get_node_list(self) -> list[QuickListNode]:
        """获取节点列表"""
        nodes = []
        current = self.head
        while current:
            nodes.append(current)
            current = current.next
        return nodes

    def _get_state(self) -> dict:
        """获取当前状态"""
        nodes = self._get_node_list()
        return {
            "type": "List",
            "current_encoding": self.encoding,
            "encoding": self.encoding,
            "count": self.count,
            "node_count": self.len,
            "nodes": [
                {
                    "id": i,
                    "is_head": (i == 0),
                    "is_tail": (i == len(nodes) - 1),
                    "item_count": node.item_count(),
                    "items": node.items,
                    "sz": node.sz,
                    "prev": None if i == 0 else i - 1,
                    "next": None if i == len(nodes) - 1 else i + 1,
                }
                for i, node in enumerate(nodes)
            ],
            "max_item_per_node": self.MAX_ITEM_PER_NODE,
        }

    def get_structure(self) -> dict:
        state = self._get_state()
        state["encoding_history"] = self.encoding_history
        state["source_code"] = {
            "quicklist": """typedef struct quicklist {
    quicklistNode *head;       /* 链表头节点 */
    quicklistNode *tail;       /* 链表尾节点 */
    unsigned long count;       /* 全局总元素数 */
    unsigned long len;         /* quicklistNode 节点总数 */
    signed int fill : QL_FILL_BITS;       /* 单节点容量配置 */
    unsigned int compress : QL_COMP_BITS; /* 压缩深度配置 */
    unsigned int bookmark_count: QL_BM_BITS;
    quicklistBookmark bookmarks[];
} quicklist;""",
            "quicklistNode": """typedef struct quicklistNode {
    struct quicklistNode *prev;  /* 前驱指针 */
    struct quicklistNode *next;  /* 后继指针 */
    unsigned char *entry;        /* 指向内部 listpack */
    size_t sz;                   /* listpack 内存大小 */
    unsigned int count : QL_BITS;/* 当前节点内元素个数 */
    unsigned int encoding : 2;   /* 编码方式: RAW/LZF */
    unsigned int container : 2;  /* 容器类型: PLAIN/LISTPACK */
    unsigned int recompress : 1; /* 是否需要再次压缩 */
    unsigned int attempted_compress : 1;
    unsigned int extra : 10;
    quicklistNode *enc_prev;     /* 压缩时的前驱 */
} quicklistNode;""",
            "listpack_note": "Redis 7 使用 Listpack 替代 Ziplist，消除连锁更新问题"
        }
        return state

    def reset(self):
        self.head = None
        self.tail = None
        self.count = 0
        self.len = 0
        self.encoding = "quicklist"
        self.encoding_history = []
