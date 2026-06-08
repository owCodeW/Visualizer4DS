"""ZSet 类型 API 路由"""
from fastapi import APIRouter
from models.schemas import OperationRequest, BulkFillRequest
from categories.redis.structures.redis_types import RedisZSet

router = APIRouter(prefix="/zset", tags=["ZSet"])

redis_zset = RedisZSet()


@router.get("/structure")
def get_zset_structure():
    return redis_zset.get_structure()


@router.post("/operate")
def operate_zset(req: OperationRequest):
    if req.operation == "ZADD":
        if req.field is None or req.score is None:
            return {"error": "ZADD 操作需要 field(member) 和 score 参数"}
        return redis_zset.zadd(req.field, req.score)
    elif req.operation == "ZREM":
        if req.field is None:
            return {"error": "ZREM 操作需要 field(member) 参数"}
        return redis_zset.zrem(req.field)
    else:
        return {"error": f"不支持的操作: {req.operation}"}


@router.post("/bulk-fill")
def bulk_fill_zset(req: BulkFillRequest):
    """批量填充 N 个 member-score 对，用于演示编码升级"""
    return redis_zset.bulk_fill(req.count)


@router.post("/reset")
def reset_zset():
    redis_zset.reset()
    return {"message": "ZSet 结构已重置", "structure": redis_zset.get_structure()}
