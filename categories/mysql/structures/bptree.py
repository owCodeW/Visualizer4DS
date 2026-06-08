"""B+Tree 数据结构 (InnoDB 索引页的简化模型)

设计目标 (与生产 InnoDB 的对应关系):
    - 每个节点 = 一个 InnoDB Page (16KB), 这里用 fanout 控制
    - 内部节点: 包含 n-1 个 key + n 个 child 指针
    - 叶子节点: 包含 n 个 (key, value) 对 + next_leaf / prev_leaf 指针
    - 叶子节点用双向链表串起来, 支持范围扫描 (range scan)
    - 分裂: 节点满时 (keys 超过 fanout-1) 沿中点分裂, 中位 key 上提到父节点
    - 合并: 节点过空时 (< ceil(fanout/2)-1) 触发 rebalance

为了方便可视化, 这里使用:
    - fanout = 4 (内部节点最多 4 个 child / 3 个 key)
    - leaf_max = 4 (叶子节点最多 4 个 kv 对)
    - 自动按整数 key 排序
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


# ---- 可视化参数 ----
FANOUT = 4                  # 内部节点最大 child 数
LEAF_MAX = 4                # 叶子节点最大 kv 对数
LEAF_MIN = 2                # 叶子节点最小 kv 对数 (再少会触发下溢)
INTERNAL_MIN_KEYS = 1       # 内部节点最小 key 数 (>= ceil(FANOUT/2) - 1)


# ---- 节点类型 ----
LEAF = "leaf"
INTERNAL = "internal"


@dataclass
class LeafNode:
    """B+Tree 叶子节点: 存放 (key, value) 对 + 双向链表指针"""
    keys: list[int] = field(default_factory=list)
    values: list[str] = field(default_factory=list)
    next_leaf: Optional["LeafNode"] = None
    prev_leaf: Optional["LeafNode"] = None
    id: int = 0              # 稳定 id, 方便前端追踪

    def is_full(self) -> bool:
        return len(self.keys) >= LEAF_MAX

    def is_underflow(self) -> bool:
        return len(self.keys) < LEAF_MIN

    def insert_kv(self, key: int, value: str) -> bool:
        """插入 kv, 已存在则覆盖并返回 False"""
        # 二分查找插入位置
        idx = self._find_index(key)
        if idx < len(self.keys) and self.keys[idx] == key:
            self.values[idx] = value
            return False  # 覆盖
        self.keys.insert(idx, key)
        self.values.insert(idx, value)
        return True

    def delete_kv(self, key: int) -> Optional[str]:
        """删除 kv, 返回被删的 value, 不存在返回 None"""
        idx = self._find_index(key)
        if idx >= len(self.keys) or self.keys[idx] != key:
            return None
        old_value = self.values[idx]
        self.keys.pop(idx)
        self.values.pop(idx)
        return old_value

    def _find_index(self, key: int) -> int:
        """二分查找 key 应在的位置 (第一个 >= key 的下标)"""
        lo, hi = 0, len(self.keys)
        while lo < hi:
            mid = (lo + hi) // 2
            if self.keys[mid] < key:
                lo = mid + 1
            else:
                hi = mid
        return lo


# ============================ 内部节点 ============================
@dataclass
class InternalNode:
    """B+Tree 内部节点: 包含 n-1 个分隔 key + n 个 child 指针

    布局: keys[i] 是 child[i] 和 child[i+1] 之间的分隔 key
    """
    keys: list[int] = field(default_factory=list)  # 分隔 key, 不存数据
    children: list[object] = field(default_factory=list)  # 子节点 (InternalNode 或 LeafNode)
    id: int = 0

    def is_full(self) -> bool:
        return len(self.children) >= FANOUT

    def is_underflow(self) -> bool:
        return len(self.children) < (FANOUT + 1) // 2


class BPlusTree:
    """B+Tree (聚簇索引的简化模型)

    数据约定:
        - key 始终是 int (聚簇索引通常是主键)
        - value 是 str (行数据的简化表示)
    """
    _node_counter = 0

    def __init__(self):
        self._reset_state()

    def _reset_state(self):
        self.root: Optional[object] = None
        BPlusTree._node_counter = 0
        self._first_leaf: Optional[LeafNode] = None
        self._last_leaf: Optional[LeafNode] = None
        self.op_log: list[dict] = []
        self.size = 0
        self.height = 0

    @classmethod
    def _new_id(cls) -> int:
        cls._node_counter += 1
        return cls._node_counter

    # ============================ 插入 ============================
    def insert(self, key: int, value: str) -> dict:
        """插入一个 kv, 必要时自动分裂"""
        if self.root is None:
            leaf = self._new_leaf()
            self.root = leaf
            self._first_leaf = leaf
            self._last_leaf = leaf
            self.height = 1
            leaf.insert_kv(key, value)
            self.size = 1
            return {"ok": True, "split": False, "log": [self._log("INSERT", f"空树 -> 创建根叶子 {self._node_repr(leaf)}")]}

        # 走到叶子
        path = []  # 记录从根到叶子的访问路径
        node = self.root
        depth = 1
        while not isinstance(node, LeafNode):
            assert isinstance(node, InternalNode)
            path.append(node)
            idx = self._find_child_index(node, key)
            node = node.children[idx]

        leaf = node
        # 1) 叶子已存在该 key -> 覆盖
        idx = leaf._find_index(key)
        if idx < len(leaf.keys) and leaf.keys[idx] == key:
            old = leaf.values[idx]
            leaf.values[idx] = value
            return {"ok": True, "split": False, "updated": True, "old_value": old,
                    "log": [self._log("INSERT", f"覆盖 key={key} (old={old} -> new={value})")]}

        # 2) 叶子有空间, 直接插入
        if not leaf.is_full():
            leaf.insert_kv(key, value)
            self.size += 1
            return {"ok": True, "split": False,
                    "log": [self._log("INSERT", f"key={key} 插入叶子 {self._node_repr(leaf)}")]}

        # 3) 叶子满了 -> 分裂
        return self._insert_with_split(leaf, key, value, path)

    def _insert_with_split(self, leaf: LeafNode, key: int, value: str, path: list[InternalNode]) -> dict:
        """叶子分裂路径"""
        log = []
        # 先插入到临时拷贝
        tmp_keys = list(leaf.keys)
        tmp_values = list(leaf.values)
        ins_idx = leaf._find_index(key)
        tmp_keys.insert(ins_idx, key)
        tmp_values.insert(ins_idx, value)
        # 分裂点: 中点 (左半保留 ceil(n/2), 右半拿 floor(n/2))
        mid = (len(tmp_keys) + 1) // 2
        new_leaf = self._new_leaf()
        new_leaf.keys = tmp_keys[mid:]
        new_leaf.values = tmp_values[mid:]
        # 更新原叶子
        leaf.keys = tmp_keys[:mid]
        leaf.values = tmp_values[:mid]
        # 维护双向链表
        new_leaf.next_leaf = leaf.next_leaf
        new_leaf.prev_leaf = leaf
        if leaf.next_leaf is not None:
            leaf.next_leaf.prev_leaf = new_leaf
        leaf.next_leaf = new_leaf
        if self._last_leaf is leaf:
            self._last_leaf = new_leaf
        self.size += 1

        log.append(self._log("SPLIT", f"叶子 {self._node_repr(leaf)} 满 -> 分裂为 {self._node_repr(leaf)} + {self._node_repr(new_leaf)}, 分隔 key={new_leaf.keys[0]}"))

        # 上提分隔 key 到父节点
        sep_key = new_leaf.keys[0]
        self._propagate_split_up(leaf, new_leaf, sep_key, path, log)
        return {"ok": True, "split": True, "log": log}

    def _propagate_split_up(self, left_child, right_child, sep_key: int,
                            path: list[InternalNode], log: list[dict]) -> None:
        """将分隔 key 沿 path 向上推, 必要时触发内部节点分裂/根分裂"""
        current_left = left_child
        current_right = right_child
        current_sep = sep_key

        for parent in reversed(path):
            if not parent.is_full():
                idx = self._find_child_index(parent, current_sep)
                parent.keys.insert(idx, current_sep)
                parent.children.insert(idx + 1, current_right)
                log.append(self._log("PROMOTE", f"分隔 key={current_sep} 插入到 {self._node_repr(parent)}"))
                return
            # 父节点也满了 -> 分裂父节点
            new_parent, new_sep, new_right = self._split_internal(parent, current_sep, current_right)
            log.append(self._log("SPLIT", f"内部 {self._node_repr(parent)} 满 -> 分裂, 上提 key={new_sep}"))
            current_left = parent
            current_right = new_right
            current_sep = new_sep

        # 走到 path 顶端仍然要分裂 -> 创建新根
        new_root = InternalNode()
        new_root.id = self._new_id()
        new_root.keys = [current_sep]
        new_root.children = [current_left, current_right]
        self.root = new_root
        self.height += 1
        log.append(self._log("NEW_ROOT", f"创建新根 {self._node_repr(new_root)} (height={self.height})"))

    def _split_internal(self, node: InternalNode, sep_key: int, right_child) -> tuple[InternalNode, int, InternalNode]:
        """分裂一个内部节点, 返回 (新右节点, 上提的 key, new_right)"""
        # 模拟插入 sep_key 后再分裂
        tmp_children = list(node.children)
        tmp_keys = list(node.keys)
        ins_idx = self._find_child_index(node, sep_key)
        tmp_keys.insert(ins_idx, sep_key)
        tmp_children.insert(ins_idx + 1, right_child)
        # 分裂点: 中位 key 上提
        mid = len(tmp_keys) // 2
        promoted = tmp_keys[mid]
        # 左节点保留: keys[:mid] + children[:mid+1]
        # 右节点保留: keys[mid+1:] + children[mid+1:]
        new_right = InternalNode()
        new_right.id = self._new_id()
        new_right.keys = tmp_keys[mid + 1:]
        new_right.children = tmp_children[mid + 1:]
        node.keys = tmp_keys[:mid]
        node.children = tmp_children[:mid + 1]
        return new_right, promoted, new_right

    # ============================ 搜索 ============================
    def search(self, key: int) -> dict:
        """精确查找 key, 返回访问路径和结果"""
        if self.root is None:
            return {"found": False, "path": [], "value": None,
                    "log": [self._log("SEARCH", f"key={key} -> 空树")]}

        path = []  # 节点 id 列表
        node = self.root
        while not isinstance(node, LeafNode):
            assert isinstance(node, InternalNode)
            path.append({"node_id": node.id, "type": INTERNAL, "keys": list(node.keys)})
            idx = self._find_child_index(node, key)
            node = node.children[idx]
        leaf = node
        path.append({"node_id": leaf.id, "type": LEAF, "keys": list(leaf.keys)})
        idx = leaf._find_index(key)
        if idx < len(leaf.keys) and leaf.keys[idx] == key:
            return {"found": True, "path": path, "value": leaf.values[idx],
                    "log": [self._log("SEARCH", f"key={key} 命中 -> {leaf.values[idx]}")]}
        return {"found": False, "path": path, "value": None,
                "log": [self._log("SEARCH", f"key={key} 未命中 (查至叶子 {self._node_repr(leaf)})")]}

    # ============================ 范围查询 ============================
    def range_query(self, low: int, high: int) -> dict:
        """范围查询 [low, high]"""
        if self.root is None or low > high:
            return {"results": [], "log": [self._log("RANGE", f"[{low},{high}] -> 空结果")]}

        # 1) 找到 low 所在的叶子
        node = self.root
        while not isinstance(node, LeafNode):
            idx = self._find_child_index(node, low)
            node = node.children[idx]
        start_leaf = node

        # 2) 从 start_leaf 开始顺序扫描, 利用 next_leaf 链表
        results = []
        visited_leaves = []
        cur = start_leaf
        while cur is not None:
            visited_leaves.append(cur.id)
            for k, v in zip(cur.keys, cur.values):
                if low <= k <= high:
                    results.append({"key": k, "value": v})
                elif k > high:
                    return {"results": results, "visited_leaves": visited_leaves,
                            "log": [self._log("RANGE", f"[{low},{high}] 扫描 {len(visited_leaves)} 个叶子, 命中 {len(results)} 条")]}
            cur = cur.next_leaf
        return {"results": results, "visited_leaves": visited_leaves,
                "log": [self._log("RANGE", f"[{low},{high}] 扫描 {len(visited_leaves)} 个叶子, 命中 {len(results)} 条")]}

    # ============================ 删除 ============================
    def delete(self, key: int) -> dict:
        """删除 key

        注意: 为了保证可视化简洁, 叶子下溢时不做 rebalance,
        允许节点保留少于 LEAF_MIN 的 key (结构仍是合法的 B+Tree, 只是非平衡).
        根节点仍会收缩 (如果根是叶子且变空 -> 树空).
        """
        if self.root is None:
            return {"ok": False, "log": [self._log("DELETE", f"key={key} -> 空树")]}

        node = self.root
        while not isinstance(node, LeafNode):
            idx = self._find_child_index(node, key)
            node = node.children[idx]
        leaf = node

        old_value = leaf.delete_kv(key)
        if old_value is None:
            return {"ok": False, "log": [self._log("DELETE", f"key={key} 不存在")]}
        self.size -= 1
        log = [self._log("DELETE", f"key={key} (value={old_value}) 从叶子 {self._node_repr(leaf)} 删除")]

        # 根节点特殊处理: 根是叶子且变空 -> 树空
        if isinstance(self.root, LeafNode) and len(self.root.keys) == 0:
            self.root = None
            self._first_leaf = None
            self._last_leaf = None
            self.height = 0
            log.append(self._log("DELETE", "根叶子变空 -> 树空"))
        return {"ok": True, "log": log}

    def _rebalance_after_delete(self, leaf: LeafNode, path: list[tuple], log: list[dict]) -> None:
        """叶子下溢: 先尝试借, 否则合并"""
        if not path:
            return
        parent, idx = path[-1]
        # 优先从左兄弟借
        if idx > 0:
            left = parent.children[idx - 1]
            if isinstance(left, LeafNode) and len(left.keys) > LEAF_MIN:
                # 旋转: 借最右的 key 到 leaf 的最左
                borrowed_k = left.keys.pop()
                borrowed_v = left.values.pop()
                leaf.keys.insert(0, borrowed_k)
                leaf.values.insert(0, borrowed_v)
                # 父节点的分隔 key 要更新
                parent.keys[idx - 1] = leaf.keys[0]
                log.append(self._log("REBALANCE", f"叶子 {self._node_repr(leaf)} 从左兄弟 {self._node_repr(left)} 借 1 个 key, 分隔 key 更新为 {leaf.keys[0]}"))
                return
        # 从右兄弟借
        if idx + 1 < len(parent.children):
            right = parent.children[idx + 1]
            if isinstance(right, LeafNode) and len(right.keys) > LEAF_MIN:
                borrowed_k = right.keys.pop(0)
                borrowed_v = right.values.pop(0)
                leaf.keys.append(borrowed_k)
                leaf.values.append(borrowed_v)
                parent.keys[idx] = right.keys[0] if right.keys else borrowed_k
                log.append(self._log("REBALANCE", f"叶子 {self._node_repr(leaf)} 从右兄弟 {self._node_repr(right)} 借 1 个 key, 分隔 key 更新为 {parent.keys[idx]}"))
                return
        # 都没法借 -> 合并
        if idx > 0:
            left = parent.children[idx - 1]
            self._merge_leaves(left, leaf, parent, idx, log)
        else:
            right = parent.children[idx + 1]
            self._merge_leaves(leaf, right, parent, idx + 1, log)
        # 父节点下溢检查
        if parent.is_underflow() and len(path) > 1:
            self._rebalance_internal_after_delete(path, log)

    def _merge_leaves(self, left: LeafNode, right: LeafNode, parent: InternalNode,
                      right_idx: int, log: list[dict]) -> None:
        """合并 left 和 right (left 在前), 删除 parent.keys[right_idx-1]"""
        left.keys.extend(right.keys)
        left.values.extend(right.values)
        left.next_leaf = right.next_leaf
        if right.next_leaf is not None:
            right.next_leaf.prev_leaf = left
        else:
            self._last_leaf = left
        parent.children.pop(right_idx)
        parent.keys.pop(right_idx - 1)
        log.append(self._log("MERGE", f"叶子 {self._node_repr(left)} 合并 {self._node_repr(right)}, 父 {self._node_repr(parent)} 减少 1 个 key"))

    def _rebalance_internal_after_delete(self, path: list[tuple], log: list[dict]) -> None:
        """内部节点下溢处理 (简化: 暂时只处理顶层, 根节点会收缩)"""
        # 根节点收缩: 如果根只有 1 个 child, 把 child 提为新根
        if isinstance(self.root, InternalNode) and len(self.root.children) == 1:
            new_root = self.root.children[0]
            old_root_id = self.root.id
            self.root = new_root
            self.height -= 1
            log.append(self._log("SHRINK", f"根 {old_root_id} 只剩 1 个 child, 收缩为新根 {self._node_repr(new_root)} (height={self.height})"))

    # ============================ 工具 ============================
    def _new_leaf(self) -> LeafNode:
        leaf = LeafNode()
        leaf.id = self._new_id()
        return leaf

    def _find_child_index(self, node: InternalNode, key: int) -> int:
        """找到 key 应在的 child 下标 (第一个 keys[i] > key 的位置, 否则 n-1)"""
        for i, k in enumerate(node.keys):
            if key < k:
                return i
        return len(node.children) - 1

    def _link_leaf(self, leaf: LeafNode) -> None:
        """把新叶子挂到双向链表中"""
        if self._last_leaf is None:
            self._first_leaf = leaf
            self._last_leaf = leaf
        else:
            self._last_leaf.next_leaf = leaf
            leaf.prev_leaf = self._last_leaf
            self._last_leaf = leaf

    def _node_repr(self, node) -> str:
        if isinstance(node, LeafNode):
            return f"L{node.id}({node.keys})"
        return f"I{node.id}({node.keys})"

    def _log(self, op: str, msg: str) -> dict:
        entry = {"op": op, "msg": msg}
        self.op_log.append(entry)
        return entry

    # ============================ 序列化 ============================
    def get_structure(self) -> dict:
        """返回当前树结构的完整 JSON 表示"""
        nodes = []
        edges = []
        leaf_links = []
        if self.root is None:
            return {"height": 0, "size": 0, "nodes": [], "edges": [], "leaf_links": [],
                    "fanout": FANOUT, "leaf_max": LEAF_MAX, "first_leaf_id": None, "last_leaf_id": None}

        def visit(node, depth, parent_id=None, parent_pos=None):
            if isinstance(node, LeafNode):
                nodes.append({
                    "id": node.id, "type": LEAF, "depth": depth,
                    "keys": list(node.keys), "values": list(node.values),
                })
            else:
                nodes.append({
                    "id": node.id, "type": INTERNAL, "depth": depth,
                    "keys": list(node.keys),
                })
            if parent_id is not None:
                edges.append({"from": parent_id, "to": node.id, "pos": parent_pos})
            if isinstance(node, InternalNode):
                for i, child in enumerate(node.children):
                    visit(child, depth + 1, node.id, i)
        visit(self.root, 1)

        # 叶子双向链表 (带循环检测, 防止死循环)
        cur = self._first_leaf
        seen_leaf = set()
        while cur and cur.next_leaf and cur.id not in seen_leaf:
            seen_leaf.add(cur.id)
            leaf_links.append({"from": cur.id, "to": cur.next_leaf.id})
            cur = cur.next_leaf

        return {
            "height": self.height,
            "size": self.size,
            "fanout": FANOUT,
            "leaf_max": LEAF_MAX,
            "nodes": nodes,
            "edges": edges,
            "leaf_links": leaf_links,
            "first_leaf_id": self._first_leaf.id if self._first_leaf else None,
            "last_leaf_id": self._last_leaf.id if self._last_leaf else None,
            "op_log": list(self.op_log[-20:]),  # 最近 20 条
        }

    def reset(self) -> None:
        self._reset_state()
