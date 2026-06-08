"""DS Visualizer - 多分类数据结构可视化学习平台

支持的分类 (categories/):
    - redis         Redis 7 五大类型
    - mysql         MySQL 8 存储引擎  (规划中)
    - elasticsearch ES 倒排索引/FST  (规划中)
    - rocketmq      RocketMQ 消息存储  (规划中)

新加一个分类时:
    1. 在 categories/ 下建子包
    2. 在子包的 __init__.py 中调用 register_category / register_type
    3. (可选) 暴露一个 router 变量
    4. 重启服务即可, main.py 通过自动发现挂载
"""
import importlib
import pkgutil
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import categories
from categories.registry import get_all_categories, get_active_categories

app = FastAPI(
    title="DS Visualizer",
    description="多分类数据结构可视化学习平台 (Redis / MySQL / Elasticsearch / RocketMQ)",
    version="2.0.0"
)

# ---- 静态资源 ----
app.mount("/static", StaticFiles(directory="static"), name="static")
# 分类页面统一挂载在 /categories/ 路径下
app.mount("/categories", StaticFiles(directory="categories"), name="categories")


# ---- 自动发现并注册所有分类 ----
def _bootstrap_categories() -> None:
    """遍历 categories/ 子包, 触发其 __init__.py 完成注册"""
    for finder, name, ispkg in pkgutil.iter_modules(categories.__path__):
        if not ispkg:
            continue
        if name.startswith("_"):
            continue
        importlib.import_module(f"categories.{name}")


_bootstrap_categories()


# ---- 挂载每个分类的 API 路由 ----
for cat in get_all_categories():
    if cat.router is not None:
        app.include_router(cat.router, prefix=f"/api/{cat.name}")
        print(f"[bootstrap] mounted /api/{cat.name} (category={cat.display_name})")
    else:
        print(f"[bootstrap] skip   /api/{cat.name} (no router, planned)")


# ---- 元信息接口 ----
@app.get("/api/categories")
async def list_categories():
    """返回所有已注册分类 + 各自包含的类型, 供前端主页动态渲染"""
    return {
        "categories": [
            {
                "name": c.name,
                "display_name": c.display_name,
                "description": c.description,
                "icon": c.icon,
                "color": c.color,
                "version": c.version,
                "order": c.order,
                "types": [
                    {
                        "name": t.name,
                        "description": t.description,
                        "encodings": t.encodings,
                        "page_path": t.page_path,
                        "api_prefix": t.api_prefix,
                        "icon": t.icon,
                        "color": t.color,
                        "status": t.status,
                    }
                    for t in c.types
                ],
            }
            for c in get_all_categories()
        ]
    }


@app.get("/api/categories/{name}/types")
async def list_types(name: str):
    """返回某个分类下所有类型"""
    from categories.registry import get_category
    cat = get_category(name)
    if cat is None:
        return {"error": f"Category '{name}' not found"}
    return {
        "category": cat.name,
        "display_name": cat.display_name,
        "types": [
            {
                "name": t.name,
                "description": t.description,
                "encodings": t.encodings,
                "page_path": t.page_path,
                "api_prefix": t.api_prefix,
            }
            for t in cat.types
        ],
    }


@app.get("/")
async def index():
    """主页面 (多分类导航)"""
    return FileResponse("index.html")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "categories": [c.name for c in get_all_categories()],
    }
