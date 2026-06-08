"""SkipList 模拟 - Redis 7.0"""
import random
from typing import Optional


class SkipListNode:
    """跳表节点"""

    def __init__(self, score: float, member: str, level: int = 0):
        self.score = score
        self.member = member
        self.backward: Optional['SkipListNode'] = None
        self.levels: list[Optional['SkipListNode']] = [None] * (level + 1)
        self.spans: list[int] = [0] * (level + 1)  # 跨度


class SkipList:
    """模拟 Redis 7.0 的 SkipList 结构

    Redis 跳表特点:
    - 最大 32 层
    - 每层以概率 1/4 升层
    - 支持范围查询
    - 与 HashTable 配合实现 ZSet
    """

    MAX_LEVEL = 32
    PROBABILITY = 0.25  # 升层概率

    def __init__(self):
        self.level = 0  # 当前最大层数 (不含头节点)
        self.length = 0  # 节点数量
        self.header = SkipListNode(0, "__HEADER__", self.MAX_LEVEL - 1)
        self.tail: Optional['SkipListNode'] = None
        # 最近一次操作的访问路径 (按层记录,供前端动画)
        self.last_op_path: list[list[str]] = []
        self.last_op_kind: str = ""     # "insert" / "delete" / ""
        self.last_op_target: str = ""   # 操作相关的 member

    def _random_level(self) -> int:
        """随机生成层数"""
        level = 0
        while random.random() < self.PROBABILITY and level < self.MAX_LEVEL - 1:
            level += 1
        return level

    def insert(self, score: float, member: str) -> dict:
        """插入节点"""
        update = [None] * self.MAX_LEVEL
        rank = [0] * self.MAX_LEVEL

        # 从最高层开始查找插入位置,记录每层访问过的节点 (供动画)
        x = self.header
        per_level_visit: list[list['SkipListNode']] = [[] for _ in range(self.MAX_LEVEL)]
        for i in range(self.level, -1, -1):
            rank[i] = rank[i + 1] if i < self.MAX_LEVEL - 1 else 0
            per_level_visit[i].append(x)
            while (x.levels[i] and
                   (x.levels[i].score < score or
                    (x.levels[i].score == score and x.levels[i].member < member))):
                rank[i] += x.spans[i]
                x = x.levels[i]
                per_level_visit[i].append(x)
            update[i] = x

        # 随机层数
        new_level = self._random_level()
        if new_level > self.level:
            for i in range(self.level + 1, new_level + 1):
                rank[i] = 0
                update[i] = self.header
                update[i].spans[i] = self.length
                per_level_visit[i].append(self.header)
            self.level = new_level

        # 创建新节点
        new_node = SkipListNode(score, member, new_level)

        # 更新各层指针和跨度
        for i in range(new_level + 1):
            new_node.levels[i] = update[i].levels[i]
            update[i].levels[i] = new_node

            new_node.spans[i] = update[i].spans[i] - (rank[0] - rank[i])
            update[i].spans[i] = (rank[0] - rank[i]) + 1

        # 更新更高层的跨度
        for i in range(new_level + 1, self.level + 1):
            update[i].spans[i] += 1

        # 设置后退指针
        new_node.backward = update[0] if update[0] != self.header else None
        if new_node.levels[0]:
            new_node.levels[0].backward = new_node
        else:
            self.tail = new_node

        self.length += 1

        # 记录访问路径
        self.last_op_path = [[n.member for n in per_level_visit[i]] for i in range(self.level + 1)]
        self.last_op_kind = "insert"
        self.last_op_target = member

        return {"action": "insert", "score": score, "member": member, "level": new_level}

    def delete(self, score: float, member: str) -> dict:
        """删除节点"""
        update = [None] * self.MAX_LEVEL

        x = self.header
        per_level_visit: list[list['SkipListNode']] = [[] for _ in range(self.MAX_LEVEL)]
        for i in range(self.level, -1, -1):
            per_level_visit[i].append(x)
            while (x.levels[i] and
                   (x.levels[i].score < score or
                    (x.levels[i].score == score and x.levels[i].member < member))):
                x = x.levels[i]
                per_level_visit[i].append(x)
            update[i] = x

        x = x.levels[0] if x.levels[0] else None
        if x and x.score == score and x.member == member:
            per_level_visit[0].append(x)
            for i in range(self.level + 1):
                if update[i].levels[i] != x:
                    update[i].spans[i] -= 1
                else:
                    update[i].spans[i] += x.spans[i]
                    update[i].levels[i] = x.levels[i]

            if x.levels[0]:
                x.levels[0].backward = x.backward
            else:
                self.tail = x.backward

            while self.level > 0 and self.header.levels[self.level] is None:
                self.level -= 1

            self.length -= 1

            self.last_op_path = [[n.member for n in per_level_visit[i]] for i in range(self.level + 1)]
            self.last_op_kind = "delete"
            self.last_op_target = member

            return {"action": "delete", "score": score, "member": member}

        # 未命中也要记录访问路径,便于前端展示"查找过程"
        self.last_op_path = [[n.member for n in per_level_visit[i]] for i in range(self.level + 1)]
        self.last_op_kind = "delete"
        self.last_op_target = member
        return {"action": "not_found", "score": score, "member": member}

    def get_all_nodes(self) -> list[dict]:
        """获取所有节点 (按 score 排序) - 兼容旧接口"""
        nodes = []
        x = self.header.levels[0] if self.header.levels else None
        while x:
            nodes.append({
                "score": x.score,
                "member": x.member,
                "level_count": len(x.levels),
                "backward": x.backward.member if x.backward else None
            })
            x = x.levels[0]
        return nodes

    def get_structure(self) -> dict:
        """按层组织结构化数据,供前端按层渲染"""
        # 1) 全部节点 (按 score 顺序,含完整 forward / span / backward)
        all_nodes: list[dict] = []
        x = self.header.levels[0] if self.header.levels else None
        while x:
            all_nodes.append({
                "score": x.score,
                "member": x.member,
                "level": len(x.levels),
                "backward": x.backward.member if x.backward else None,
                "forwards": [n.member if n else None for n in x.levels],
                "spans": list(x.spans),
            })
            x = x.levels[0]

        # 2) 按层分组的节点序列
        levels_data: list[dict] = []
        node_count_per_level: list[int] = [0] * self.MAX_LEVEL
        for i in range(self.level, -1, -1):
            row: list[dict] = []
            cur = self.header
            while cur.levels[i]:
                cur = cur.levels[i]
                row.append({
                    "member": cur.member,
                    "score": cur.score,
                    "span": cur.spans[i],
                })
                node_count_per_level[i] += 1
            levels_data.append({
                "level": i,
                "nodes": row,
                "count": node_count_per_level[i],
            })

        # 3) 每层节点数 (供统计卡片),倒序展示 (高层在上)
        level_distribution: list[dict] = [
            {"level": i, "count": node_count_per_level[i]}
            for i in range(self.level, 0, -1)
        ]

        return {
            "encoding": "skiplist",
            "level": self.level,
            "length": self.length,
            "max_level": self.MAX_LEVEL,
            "probability": self.PROBABILITY,
            "nodes": all_nodes,
            "levels": levels_data,                # 按层分组 (供分层渲染)
            "level_distribution": level_distribution,  # 每层节点数 (供统计卡片)
            "header_label": "__HEADER__",
            "tail": self.tail.member if self.tail else None,
            "last_op": {
                "kind": self.last_op_kind,
                "target": self.last_op_target,
                "path": self.last_op_path,
            } if self.last_op_kind else None,
        }

    def reset(self):
        self.level = 0
        self.length = 0
        self.header = SkipListNode(0, "__HEADER__", self.MAX_LEVEL - 1)
        self.tail = None
        self.last_op_path = []
        self.last_op_kind = ""
        self.last_op_target = ""
