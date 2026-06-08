"""String 类型 API 路由"""
from fastapi import APIRouter
from models.schemas import OperationRequest
from categories.redis.structures.redis_types import RedisString

router = APIRouter(prefix="/string", tags=["String"])

# 全局实例
redis_string = RedisString()


@router.get("/structure")
def get_string_structure():
    """获取 String 当前结构"""
    return redis_string.get_structure()


@router.post("/operate")
def operate_string(req: OperationRequest):
    """执行 String 操作"""
    if req.operation == "SET":
        if req.value is None:
            return {"error": "SET 操作需要 value 参数"}
        return redis_string.set(req.value)
    elif req.operation == "APPEND":
        if req.value is None:
            return {"error": "APPEND 操作需要 value 参数"}
        return redis_string.append(req.value)
    elif req.operation == "INCR":
        return redis_string.incr()
    else:
        return {"error": f"不支持的操作: {req.operation}"}


@router.post("/reset")
def reset_string():
    """重置 String 结构"""
    redis_string.reset()
    return {"message": "String 结构已重置", "structure": redis_string.get_structure()}
