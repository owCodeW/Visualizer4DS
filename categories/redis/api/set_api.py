"""Set 类型 API 路由"""
from fastapi import APIRouter
from models.schemas import OperationRequest, BulkFillRequest
from categories.redis.structures.redis_types import RedisSet

router = APIRouter(prefix="/set", tags=["Set"])

redis_set = RedisSet()


@router.get("/structure")
def get_set_structure():
    return redis_set.get_structure()


@router.post("/operate")
def operate_set(req: OperationRequest):
    if req.operation == "SADD":
        if req.value is None:
            return {"error": "SADD 操作需要 value 参数"}
        return redis_set.sadd(req.value)
    elif req.operation == "SREM":
        if req.value is None:
            return {"error": "SREM 操作需要 value 参数"}
        return redis_set.srem(req.value)
    else:
        return {"error": f"不支持的操作: {req.operation}"}


@router.post("/bulk-fill")
def bulk_fill_set(req: BulkFillRequest):
    """批量填充 N 个元素，用于演示编码升级"""
    return redis_set.bulk_fill(req.count)


@router.post("/reset")
def reset_set():
    redis_set.reset()
    return {"message": "Set 结构已重置", "structure": redis_set.get_structure()}
