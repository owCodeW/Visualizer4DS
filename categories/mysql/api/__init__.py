"""MySQL 分类 API 路由聚合"""
from fastapi import APIRouter
from .bptree_api import router as bptree_router
from .sql_execution_api import router as sql_exec_router
from .mvcc_api import router as mvcc_router

router = APIRouter()
router.include_router(bptree_router)
router.include_router(sql_exec_router)
router.include_router(mvcc_router)
