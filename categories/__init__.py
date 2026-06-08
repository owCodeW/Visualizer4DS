"""分类层 - 每个子包代表一个数据库/中间件的数据结构分类

新增加一个分类时:
1. 在 categories/ 下新建一个子包, 例如 categories/mysql/
2. 在该子包的 __init__.py 中:
   a. 调用 register_category() 注册分类元信息
   b. 调用 register_type() 注册该分类下的所有数据类型
   c. (可选) 暴露一个 router 变量 (FastAPI APIRouter)
3. main.py 会自动发现并挂载

参考: categories/redis/__init__.py
"""
