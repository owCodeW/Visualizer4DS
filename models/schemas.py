"""API 数据模型"""
from pydantic import BaseModel
from typing import Optional, Any


class OperationRequest(BaseModel):
    """通用操作请求"""
    operation: str
    value: Optional[str] = None
    field: Optional[str] = None
    score: Optional[float] = None
    node_idx: Optional[int] = None


class BulkFillRequest(BaseModel):
    """批量填充请求 - 用于快速演示编码升级"""
    count: int = 10
    prefix: Optional[str] = None  # 可选: 自定义前缀


class OperationResponse(BaseModel):
    """通用操作响应"""
    type: str
    operation: str
    encoding: Optional[str] = None
    result: Optional[Any] = None
    encoding_change: Optional[Any] = None
    structure: Optional[Any] = None
    error: Optional[str] = None


class StructureResponse(BaseModel):
    """结构信息响应"""
    type: str
    encoding: Optional[str] = None
    structure: Optional[Any] = None
