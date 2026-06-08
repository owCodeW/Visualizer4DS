# Visualizer4DS

多分类数据结构可视化学习平台 (FastAPI + 静态前端)，当前已实现 Redis 7 五大类型，MySQL / Elasticsearch / RocketMQ 规划中。

## 启动

```bash
uv venv --python==3.14
uv pip install fastapi uvicorn
python -m uvicorn main:app --reload
#uvicorn main:app --reload
```

浏览器访问 `http://127.0.0.1:8000/`。

- 主入口: `main.py` (FastAPI `app`)
- 分类 API 前缀: `/api/<category>`，由 `categories/` 下子包自动注册
- 主页/分类页: 静态资源 `/static`、`/categories`
- 健康检查: `GET /health`
- 分类列表: `GET /api/categories`
