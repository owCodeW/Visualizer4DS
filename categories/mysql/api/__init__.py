"""MySQL 分类 API 路由聚合"""
from fastapi import APIRouter
from .bptree_api import router as bptree_router

router = APIRouter()
router.include_router(bptree_router)
