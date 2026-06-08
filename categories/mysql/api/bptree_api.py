"""MySQL B+Tree Index API 路由"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from categories.mysql.structures.bptree import BPlusTree

router = APIRouter(prefix="/bptree", tags=["MySQL B+Tree"])

# 全局实例
bptree = BPlusTree()


@router.get("/structure")
def get_structure():
    """获取 B+Tree 当前结构"""
    return bptree.get_structure()


class InsertRequest(BaseModel):
    key: int
    value: str = "row"


@router.post("/insert")
def insert(req: InsertRequest):
    """插入 (key, value)"""
    result = bptree.insert(req.key, req.value)
    return {
        "type": "B+Tree",
        "operation": "INSERT",
        "result": result,
        "structure": bptree.get_structure(),
    }


class SearchRequest(BaseModel):
    key: int


@router.post("/search")
def search(req: SearchRequest):
    """搜索 key"""
    result = bptree.search(req.key)
    return {
        "type": "B+Tree",
        "operation": "SEARCH",
        "result": result,
        "structure": bptree.get_structure(),
    }


class DeleteRequest(BaseModel):
    key: int


@router.post("/delete")
def delete(req: DeleteRequest):
    """删除 key"""
    result = bptree.delete(req.key)
    return {
        "type": "B+Tree",
        "operation": "DELETE",
        "result": result,
        "structure": bptree.get_structure(),
    }


class RangeRequest(BaseModel):
    low: int
    high: int


@router.post("/range")
def range_query(req: RangeRequest):
    """范围查询 [low, high]"""
    result = bptree.range_query(req.low, req.high)
    return {
        "type": "B+Tree",
        "operation": "RANGE",
        "result": result,
        "structure": bptree.get_structure(),
    }


class BulkFillRequest(BaseModel):
    count: int = 8
    strategy: str = "sequential"  # sequential / random


@router.post("/bulk-fill")
def bulk_fill(req: BulkFillRequest):
    """批量插入以快速演示分裂"""
    import random
    if req.strategy == "random":
        keys = random.sample(range(1, 1000), k=min(req.count, 999))
    else:
        keys = list(range(1, req.count + 1))
    log = []
    for k in keys:
        result = bptree.insert(k, f"row{k}")
        if result.get("split"):
            log.append({"key": k, "split": True})
    return {
        "type": "B+Tree",
        "operation": "BULK_FILL",
        "inserted_keys": keys,
        "split_count": sum(1 for x in log if x["split"]),
        "structure": bptree.get_structure(),
    }


@router.post("/reset")
def reset():
    """重置 B+Tree"""
    bptree.reset()
    return {"message": "B+Tree 已重置", "structure": bptree.get_structure()}
