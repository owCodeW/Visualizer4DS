"""MySQL MVCC API 路由 — 场景数据与可见性规则查询"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/mvcc", tags=["MySQL MVCC"])


# MVCC 可见性判断规则
def check_visibility(trx_id: int, read_view: dict) -> bool:
    """根据 ReadView 判断版本可见性"""
    m_ids = read_view.get("m_ids", [])
    min_trx = read_view.get("min_trx", 0)
    max_trx = read_view.get("max_trx", 0)

    if trx_id < min_trx:
        return True
    if trx_id >= max_trx:
        return False
    return trx_id not in m_ids


class VisibilityRequest(BaseModel):
    trx_id: int
    read_view: dict


@router.post("/visibility")
def check_visibility_api(req: VisibilityRequest):
    """判断给定 trx_id 在指定 ReadView 下是否可见"""
    visible = check_visibility(req.trx_id, req.read_view)
    return {
        "trx_id": req.trx_id,
        "read_view": req.read_view,
        "visible": visible,
        "reason": _explain_visibility(req.trx_id, req.read_view, visible),
    }


def _explain_visibility(trx_id: int, read_view: dict, visible: bool) -> str:
    m_ids = read_view.get("m_ids", [])
    min_trx = read_view.get("min_trx", 0)
    max_trx = read_view.get("max_trx", 0)

    if trx_id < min_trx:
        return f"trx_id={trx_id} < min_trx={min_trx}, 事务在快照前已提交, 可见"
    if trx_id >= max_trx:
        return f"trx_id={trx_id} >= max_trx={max_trx}, 事务在快照后才开启, 不可见"
    if trx_id in m_ids:
        return f"trx_id={trx_id} 在活跃事务列表 m_ids={m_ids} 中, 未提交, 不可见"
    return f"trx_id={trx_id} 在 min_trx~max_trx 之间且不在 m_ids 中, 已提交, 可见"


class ReadViewRequest(BaseModel):
    iso_level: str = "RR"  # RR / RC
    active_trx_ids: list[int] = []
    current_trx_id: Optional[int] = None


@router.post("/readview/generate")
def generate_read_view(req: ReadViewRequest):
    """生成 ReadView 快照"""
    m_ids = sorted(req.active_trx_ids)
    min_trx = m_ids[0] if m_ids else 0
    max_trx = max(m_ids) + 1 if m_ids else 1

    return {
        "iso_level": req.iso_level,
        "read_view": {
            "m_ids": m_ids,
            "min_trx": min_trx,
            "max_trx": max_trx,
            "creator": req.current_trx_id,
        },
        "rule": "RR: 事务内首次SELECT创建, 全程复用; RC: 每次SELECT重建" if req.iso_level == "RR"
        else "RC: 每次SELECT重建ReadView",
    }


@router.get("/scenarios")
def list_scenarios():
    """列出所有 MVCC 演示场景"""
    return {
        "scenarios": [
            {
                "id": "base",
                "name": "基础MVCC",
                "description": "并发修改+快照读, 演示Undo回溯与ReadView可见性",
            },
            {
                "id": "rcrr",
                "name": "RC vs RR 不可重复读对比",
                "description": "RC允许不可重复读, RR通过复用ReadView规避",
            },
            {
                "id": "phantom",
                "name": "幻读 + 当前读对比",
                "description": "RR快照读无幻读, 当前读(FOR UPDATE)仍存在幻读",
            },
            {
                "id": "delete",
                "name": "删除+长事务",
                "description": "删除标记版本链, 长事务通过Undo仍可见原数据",
            },
        ]
    }
