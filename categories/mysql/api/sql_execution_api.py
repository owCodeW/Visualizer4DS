"""MySQL SQL 执行流程分析 API 路由

提供 SQL 语句解析、执行计划模拟、流程阶段信息等接口
供前端 SQL Execution Flow 可视化页面调用
"""
import re
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/sql-exec", tags=["MySQL SQL Execution Flow"])


class SQLAnalyzeRequest(BaseModel):
    sql: str


def _parse_sql(sql: str) -> dict:
    """解析 SQL 语句, 返回类型、表名、条件、索引推测等信息"""
    trimmed = sql.strip()
    upper = trimmed.upper()

    sql_type = "UNKNOWN"
    is_write = False
    table = "--"
    where_clause = "--"
    index_hint = "--"
    lock_type = "无"
    plan_rows = []

    if upper.startswith("SELECT"):
        sql_type = "SELECT"
        is_write = False
        lock_type = "共享锁 (S) / 无锁 (MVCC 快照读)"
    elif upper.startswith("INSERT"):
        sql_type = "INSERT"
        is_write = True
        lock_type = "排他锁 (X) + 自增锁 (AUTO-INC)"
    elif upper.startswith("UPDATE"):
        sql_type = "UPDATE"
        is_write = True
        lock_type = "排他锁 (X) + 可能间隙锁 (Gap Lock)"
    elif upper.startswith("DELETE"):
        sql_type = "DELETE"
        is_write = True
        lock_type = "排他锁 (X) + 可能间隙锁 (Gap Lock)"
    elif upper.startswith("CREATE"):
        sql_type = "CREATE"
        is_write = True
        lock_type = "元数据锁 (MDL Write)"
    elif upper.startswith("ALTER"):
        sql_type = "ALTER"
        is_write = True
        lock_type = "元数据锁 (MDL Write)"
    elif upper.startswith("DROP"):
        sql_type = "DROP"
        is_write = True
        lock_type = "元数据锁 (MDL Write)"
    elif upper.startswith("REPLACE"):
        sql_type = "REPLACE"
        is_write = True
        lock_type = "排他锁 (X) + 自增锁"

    # 提取表名
    from_m = re.search(r"\bFROM\s+(\w+)", trimmed, re.IGNORECASE)
    into_m = re.search(r"\bINTO\s+(\w+)", trimmed, re.IGNORECASE)
    update_m = re.search(r"\bUPDATE\s+(\w+)", trimmed, re.IGNORECASE)
    table_m = re.search(r"\bTABLE\s+(\w+)", trimmed, re.IGNORECASE)
    table = (
        from_m.group(1) if from_m
        else into_m.group(1) if into_m
        else update_m.group(1) if update_m
        else table_m.group(1) if table_m
        else "--"
    )

    # 提取 WHERE
    where_m = re.search(
        r"\bWHERE\s+(.+?)(?:\s+(?:GROUP|ORDER|LIMIT|HAVING|UNION|$))",
        trimmed, re.IGNORECASE
    )
    where_clause = where_m.group(1).strip() if where_m else "--"

    # 索引推测
    if where_clause != "--":
        if re.search(r"\bid\s*=", trimmed, re.IGNORECASE):
            index_hint = "PRIMARY KEY (聚簇索引, 等值查询)"
        elif re.search(r"\bname\s*=", trimmed, re.IGNORECASE):
            index_hint = "idx_name (二级索引) → 回表查询"
        elif re.search(r"\bid\s*[<>]", trimmed, re.IGNORECASE):
            index_hint = "PRIMARY KEY (范围扫描)"
        elif re.search(r"\bstatus\s*=", trimmed, re.IGNORECASE):
            index_hint = "idx_status (二级索引, 等值过滤)"
        else:
            index_hint = "全表扫描 (无可用索引)"
    else:
        index_hint = "全表扫描" if sql_type == "SELECT" else "--"

    # 模拟执行计划
    if sql_type == "SELECT":
        access_type = "const" if where_clause != "--" and "id" in trimmed.lower() else "ALL"
        key_used = "PRIMARY" if access_type == "const" else None
        rows_est = "1" if access_type == "const" else "~1000"
        extra = "" if access_type == "const" else "Using where"
        plan_rows = [{
            "id": 1,
            "select_type": "SIMPLE",
            "table": table,
            "type": access_type,
            "possible_keys": key_used or "NULL",
            "key": key_used or "NULL",
            "key_len": "4" if key_used else "NULL",
            "ref": "const" if key_used else "NULL",
            "rows": rows_est,
            "filtered": "100.00",
            "Extra": extra,
        }]
    elif sql_type == "UPDATE":
        plan_rows = [{
            "id": 1,
            "select_type": "UPDATE",
            "table": table,
            "type": "range",
            "possible_keys": "PRIMARY",
            "key": "PRIMARY",
            "key_len": "4",
            "ref": "const",
            "rows": "1",
            "filtered": "100.00",
            "Extra": "Using where",
        }]
    elif sql_type == "INSERT":
        plan_rows = [{
            "id": 1,
            "select_type": "INSERT",
            "table": table,
            "type": "ALL",
            "possible_keys": "NULL",
            "key": "NULL",
            "key_len": "NULL",
            "ref": "NULL",
            "rows": "1",
            "filtered": "100.00",
            "Extra": "",
        }]
    elif sql_type == "DELETE":
        plan_rows = [{
            "id": 1,
            "select_type": "DELETE",
            "table": table,
            "type": "range",
            "possible_keys": "PRIMARY",
            "key": "PRIMARY",
            "key_len": "4",
            "ref": "const",
            "rows": "1",
            "filtered": "100.00",
            "Extra": "Using where",
        }]

    return {
        "sql_type": sql_type,
        "is_write": is_write,
        "table": table,
        "where": where_clause,
        "index_hint": index_hint,
        "lock_type": lock_type,
        "plan_rows": plan_rows,
    }


# SQL 执行流程阶段定义
EXECUTION_STAGES = [
    {
        "id": "client",
        "name": "客户端 (Client)",
        "order": 1,
        "description": "发送 SQL 请求",
        "details": [
            "客户端通过 TCP 连接向 MySQL Server 发送 SQL 文本",
            "使用 mysql_real_query() 或命令行发送请求",
            "通信协议: 支持压缩、SSL 加密传输",
        ],
    },
    {
        "id": "connector",
        "name": "连接器 (Connector)",
        "order": 2,
        "description": "连接管理 & 权限校验",
        "details": [
            "检查连接是否有效, 超时则断开 (wait_timeout=28800s)",
            "验证用户名密码: 查询 mysql.user 表",
            "加载权限信息到内存: SELECT * FROM mysql.user WHERE user=?",
            "此后该连接的权限判断均使用此快照 (修改权限需重连)",
            "连接模式: 长连接 / 短连接, 支持连接池",
        ],
    },
    {
        "id": "query_cache",
        "name": "查询缓存 (Query Cache)",
        "order": 3,
        "description": "MySQL 8.0 已移除此功能",
        "details": [
            "MySQL 5.7 及之前: 以 SQL 为 key 查缓存, 命中则直接返回",
            "移除原因: 表更新导致缓存频繁失效, 高并发下锁竞争严重",
            "替代方案: 使用 Redis / 应用层缓存",
        ],
        "skipped_in_80": True,
    },
    {
        "id": "parser",
        "name": "解析器 (Parser)",
        "order": 4,
        "description": "词法分析 & 语法分析",
        "details": [
            "词法分析: 将 SQL 文本拆分为 Token 序列",
            "识别关键字: SELECT / FROM / WHERE 等",
            "识别标识符: 表名、列名",
            "语法分析: 根据 MySQL 语法规则构建解析树 (Parse Tree)",
            "语法错误则返回: ERROR 1064",
        ],
    },
    {
        "id": "preprocessor",
        "name": "预处理器 (Preprocessor)",
        "order": 5,
        "description": "语义检查 & 查询重写",
        "details": [
            "检查表是否存在, 列是否属于该表",
            "解析 * 为所有列名, 解析别名",
            "二次权限校验: 检查用户对表是否有相应权限",
            "查询重写: 视图展开、子查询扁平化、常量折叠",
        ],
    },
    {
        "id": "optimizer",
        "name": "优化器 (Optimizer)",
        "order": 6,
        "description": "选择执行计划 & 索引优化",
        "details": [
            "基于代价的优化 (CBO): 计算不同执行计划的 IO/CPU 代价",
            "选择索引: PRIMARY KEY vs 二级索引 vs 全表扫描",
            "决定连接顺序 (多表 JOIN), 选择驱动表",
            "优化策略: 索引下推 (ICP)、MRR、范围优化",
            "输出执行计划: 可用 EXPLAIN 查看",
        ],
    },
    {
        "id": "executor",
        "name": "执行器 (Executor)",
        "order": 7,
        "description": "调用存储引擎 API & 迭代器模型",
        "details": [
            "根据执行计划调用存储引擎接口",
            "读操作: 调用 ha_innobase::index_read() / rnd_next()",
            "写操作: 调用 ha_innobase::write_row() / update_row()",
            "权限最终校验: 行级权限检查 (WHERE 条件过滤)",
            "使用 Volcano 迭代器模型: open() → next() → close()",
        ],
    },
    {
        "id": "engine",
        "name": "存储引擎层 (InnoDB)",
        "order": 8,
        "description": "数据读写 & 事务 & 日志",
        "details": [
            "Buffer Pool: 先查内存缓冲池, 命中则直接读取 (命中率 > 99%)",
            "未命中则从磁盘数据文件加载 .ibd 页到 Buffer Pool",
            "写操作: 修改 Buffer Pool 中的页 (脏页), 记录 Redo Log",
            "Undo Log: 记录数据修改前的旧值, 支持回滚和 MVCC",
            "WAL 机制: 先写 Redo Log, 再写数据页 (Crash Safe)",
            "脏页异步刷盘: 由后台线程按 LRU / Flush List 策略刷新",
        ],
    },
    {
        "id": "binlog",
        "name": "Binlog (归档日志)",
        "order": 9,
        "description": "主从复制 & 数据恢复 (仅写操作)",
        "details": [
            "执行器在事务提交时写入 Binlog (Server 层)",
            "两阶段提交: 先写 Redo Log (prepare) → 写 Binlog → Redo Log (commit)",
            "保证主从数据一致性: 从库通过 IO Thread 拉取 Binlog 回放",
            "格式: ROW (行变更) / STATEMENT (SQL 文本) / MIXED",
        ],
        "write_only": True,
    },
    {
        "id": "result",
        "name": "返回结果 (Result)",
        "order": 10,
        "description": "结果集 / 影响行数返回客户端",
        "details": [
            "读操作: 逐行返回结果集, 客户端按协议解析",
            "写操作: 返回影响行数 affected rows",
            "释放锁资源: 行锁、间隙锁、自增锁等",
            "连接保持: 长连接不断开, 等待下一条 SQL",
        ],
    },
]


@router.post("/analyze")
def analyze_sql(req: SQLAnalyzeRequest):
    """分析 SQL 语句, 返回解析信息、执行计划、流程阶段"""
    parsed = _parse_sql(req.sql)
    return {
        "type": "SQL Execution Flow",
        "sql": req.sql,
        "parsed": parsed,
        "stages": EXECUTION_STAGES,
        "skipped_stages": _get_skipped_stages(parsed["is_write"]),
    }


@router.get("/stages")
def get_stages():
    """获取 SQL 执行流程的所有阶段定义"""
    return {
        "stages": EXECUTION_STAGES,
    }


def _get_skipped_stages(is_write: bool) -> list[str]:
    """根据 SQL 类型返回应跳过的阶段"""
    skipped = ["query_cache"]  # 8.0 始终跳过
    if not is_write:
        skipped.append("binlog")  # 读操作跳过 Binlog
    return skipped
