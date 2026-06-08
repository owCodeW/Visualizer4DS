"""List 类型 API 路由"""
from fastapi import APIRouter
from models.schemas import OperationRequest, BulkFillRequest
from categories.redis.structures.redis_types import RedisList

router = APIRouter(prefix="/list", tags=["List"])

redis_list = RedisList()


@router.get("/structure")
def get_list_structure():
    return redis_list.get_structure()


@router.post("/operate")
def operate_list(req: OperationRequest):
    if req.operation == "LPUSH":
        if req.value is None:
            return {"error": "LPUSH 操作需要 value 参数"}
        return redis_list.lpush(req.value)
    elif req.operation == "RPUSH":
        if req.value is None:
            return {"error": "RPUSH 操作需要 value 参数"}
        return redis_list.rpush(req.value)
    elif req.operation == "LPOP":
        return redis_list.lpop()
    elif req.operation == "RPOP":
        return redis_list.rpop()
    elif req.operation == "SPLIT":
        if req.node_idx is None:
            return {"error": "SPLIT 操作需要 node_idx 参数"}
        return redis_list.split_node(req.node_idx)
    else:
        return {"error": f"不支持的操作: {req.operation}"}


@router.post("/bulk-fill")
def bulk_fill_list(req: BulkFillRequest):
    """批量填充 N 个元素（RPUSH 顺序），用于演示编码升级"""
    return redis_list.bulk_fill(req.count)


@router.post("/reset")
def reset_list():
    redis_list.reset()
    return {"message": "List 结构已重置", "structure": redis_list.get_structure()}
