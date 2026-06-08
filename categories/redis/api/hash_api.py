"""Hash 类型 API 路由"""
from fastapi import APIRouter
from models.schemas import OperationRequest, BulkFillRequest
from categories.redis.structures.redis_types import RedisHash

router = APIRouter(prefix="/hash", tags=["Hash"])

redis_hash = RedisHash()


@router.get("/structure")
def get_hash_structure():
    return redis_hash.get_structure()


@router.post("/operate")
def operate_hash(req: OperationRequest):
    if req.operation == "HSET":
        if req.field is None or req.value is None:
            return {"error": "HSET 操作需要 field 和 value 参数"}
        return redis_hash.hset(req.field, req.value)
    elif req.operation == "HDEL":
        if req.field is None:
            return {"error": "HDEL 操作需要 field 参数"}
        return redis_hash.hdel(req.field)
    elif req.operation == "HGET":
        if req.field is None:
            return {"error": "HGET 操作需要 field 参数"}
        return redis_hash.hget(req.field)
    else:
        return {"error": f"不支持的操作: {req.operation}"}


@router.post("/bulk-fill")
def bulk_fill_hash(req: BulkFillRequest):
    """批量填充 N 个 field-value 对，用于演示编码升级"""
    return redis_hash.bulk_fill(req.count)


@router.post("/reset")
def reset_hash():
    redis_hash.reset()
    return {"message": "Hash 结构已重置", "structure": redis_hash.get_structure()}
