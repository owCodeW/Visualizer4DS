/* DS Visualizer - API 通信模块
   所有路由通过 /api/<category>/<type>/<action> 访问
   例如: /api/redis/string/structure, /api/redis/list/operate
*/

const API_BASE = '/api';

async function apiGet(path) {
    const resp = await fetch(`${API_BASE}${path}`);
    return resp.json();
}

async function apiPost(path, body) {
    const resp = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return resp.json();
}

// 分类信息接口
const CategoryAPI = {
    list: () => apiGet('/categories'),
    getTypes: (name) => apiGet(`/categories/${name}/types`),
};

// ===== Redis 分类 =====
// String API
const StringAPI = {
    getStructure: () => apiGet('/redis/string/structure'),
    set: (value) => apiPost('/redis/string/operate', { operation: 'SET', value }),
    append: (value) => apiPost('/redis/string/operate', { operation: 'APPEND', value }),
    incr: () => apiPost('/redis/string/operate', { operation: 'INCR' }),
    reset: () => apiPost('/redis/string/reset', {})
};

// List API
const ListAPI = {
    getStructure: () => apiGet('/redis/list/structure'),
    lpush: (value) => apiPost('/redis/list/operate', { operation: 'LPUSH', value }),
    rpush: (value) => apiPost('/redis/list/operate', { operation: 'RPUSH', value }),
    lpop: () => apiPost('/redis/list/operate', { operation: 'LPOP' }),
    rpop: () => apiPost('/redis/list/operate', { operation: 'RPOP' }),
    split: (node_idx) => apiPost('/redis/list/operate', { operation: 'SPLIT', node_idx }),
    bulkFill: (count) => apiPost('/redis/list/bulk-fill', { count }),
    reset: () => apiPost('/redis/list/reset', {})
};

// Hash API
const HashAPI = {
    getStructure: () => apiGet('/redis/hash/structure'),
    hset: (field, value) => apiPost('/redis/hash/operate', { operation: 'HSET', field, value }),
    hdel: (field) => apiPost('/redis/hash/operate', { operation: 'HDEL', field }),
    hget: (field) => apiPost('/redis/hash/operate', { operation: 'HGET', field }),
    bulkFill: (count) => apiPost('/redis/hash/bulk-fill', { count }),
    reset: () => apiPost('/redis/hash/reset', {})
};

// Set API
const SetAPI = {
    getStructure: () => apiGet('/redis/set/structure'),
    sadd: (value) => apiPost('/redis/set/operate', { operation: 'SADD', value }),
    srem: (value) => apiPost('/redis/set/operate', { operation: 'SREM', value }),
    bulkFill: (count) => apiPost('/redis/set/bulk-fill', { count }),
    reset: () => apiPost('/redis/set/reset', {})
};

// ZSet API
const ZSetAPI = {
    getStructure: () => apiGet('/redis/zset/structure'),
    zadd: (member, score) => apiPost('/redis/zset/operate', { operation: 'ZADD', field: member, score }),
    zrem: (member) => apiPost('/redis/zset/operate', { operation: 'ZREM', field: member }),
    bulkFill: (count) => apiPost('/redis/zset/bulk-fill', { count }),
    reset: () => apiPost('/redis/zset/reset', {})
};

// 工具函数
function writeLog(logDom, text, type = 'normal') {
    const now = new Date().toLocaleTimeString();
    let cls = '';
    if (type === 'blocked') cls = ' class="log-blocked"';
    else if (type === 'upgrade') cls = ' class="log-upgrade"';
    logDom.innerHTML += `<span${cls}>[${now}] ${text}</span><br>`;
    logDom.scrollTop = logDom.scrollHeight;
}

function showEncodingChange(alertDom, change) {
    if (!change) {
        alertDom.classList.remove('show');
        return;
    }
    if (change.blocked) {
        // 降级场景交给 showDowngradeBlocked 专门处理，避免重复弹窗
        alertDom.classList.remove('show');
        return;
    }
    alertDom.querySelector('.alert-title').textContent =
        `编码升级: ${change.from} → ${change.to}（不可逆）`;
    alertDom.querySelector('.alert-detail').textContent =
        `原因: ${change.reason}`;
    alertDom.classList.add('show');
    setTimeout(() => alertDom.classList.remove('show'), 5000);
}

// 降级阻止专用提示
function showDowngradeBlocked(blockedDom, change) {
    if (!change || !change.blocked) {
        blockedDom.classList.remove('show');
        return;
    }
    blockedDom.querySelector('.blocked-title').textContent =
        `降级被阻止: 试图 ${change.from} → ${change.attempted_encoding}`;
    blockedDom.querySelector('.blocked-detail').textContent =
        change.reason;
    blockedDom.classList.add('show');
    setTimeout(() => blockedDom.classList.remove('show'), 6000);
}

// 日志写入时判断是否为降级阻止
function logEncodingChange(logDom, change, operation) {
    if (!change) return;
    if (change.blocked) {
        writeLog(logDom, `${operation} | 降级被阻止: ${change.from} → ${change.attempted_encoding}，保持 ${change.to}`, 'blocked');
    } else if (change.irreversible) {
        writeLog(logDom, `${operation} | 编码升级: ${change.from} → ${change.to}（不可逆）`, 'upgrade');
    } else {
        writeLog(logDom, `${operation} | 编码切换: ${change.from} → ${change.to}`, 'upgrade');
    }
}

function createNavBar() {
    return `
    <div class="nav-bar">
        <a href="/" class="string">首页</a>
        <a href="/categories/redis/pages/string.html" class="string">String</a>
        <a href="/categories/redis/pages/list.html" class="list">List</a>
        <a href="/categories/redis/pages/hash.html" class="hash">Hash</a>
        <a href="/categories/redis/pages/set.html" class="set">Set</a>
        <a href="/categories/redis/pages/zset.html" class="zset">ZSet</a>
        <a href="/categories/redis/pages/cache_issues.html" class="cache">缓存三大问题</a>
        <span class="nav-sep">|</span>
        <a href="/categories/mysql/pages/bptree.html" class="mysql">B+Tree</a>
        <a href="/categories/mysql/pages/sql_execution.html" class="mysql">SQL Flow</a>
        <a href="/categories/mysql/pages/mvcc.html" class="mysql">MVCC</a>
    </div>`;
}

// 创建不可逆规则提示栏
function createIrreversibleBar(arrowText, ruleText) {
    return `
    <div class="irreversible-bar">
        <span class="irr-icon">&#9888;</span>
        <span class="irr-text">${ruleText}</span>
        <span class="irr-arrow">${arrowText}</span>
    </div>`;
}

// 创建编码路径图 (单向箭头)
function createEncodingPath(steps) {
    // steps: [{label, class}, ...]
    let html = '<div class="encoding-path"><span style="color:#666;">编码路径:</span>';
    steps.forEach((step, i) => {
        html += `<span class="path-step ${step.cls}">${step.label}</span>`;
        if (i < steps.length - 1) {
            html += '<span class="path-arrow">&#10132;</span>';
        }
    });
    html += '<span class="path-note">(只升级不降级)</span></div>';
    return html;
}

// 创建源码面板
function createCodePanel(codeId) {
    // 源码按钮
    const btnHtml = `<button class="code-toggle-btn" onclick="toggleCodePanel('${codeId}')">查看源码</button>`;
    // 遮罩
    const maskHtml = `<div class="code-floating-panel-mask" id="${codeId}-mask" onclick="closeCodePanel('${codeId}')"></div>`;
    // 容器 (内容由页面填充)
    const panelHtml = `<div class="code-floating-panel" id="${codeId}-panel">
        <div class="panel-header">
            <span class="panel-title">C 源码 / 结构体定义</span>
            <button class="panel-close" onclick="closeCodePanel('${codeId}')">关闭</button>
        </div>
        <div class="panel-body" id="${codeId}-body"></div>
    </div>`;
    return btnHtml + maskHtml + panelHtml;
}

// 统一渲染 HashTable (Hash / Set / ZSet 配套的 hashtable 共用)
// ht: 来自 HashTable.get_structure() 的数据,字段为
//   { encoding, size, used, load_factor, entries:[{key,value,bucket}], buckets:[{index,count}] }
// options:
//   { title, color, showValue } - 标题、主色、是否显示 value
//   { targetKey } - 高亮某个 key (可选, 用于操作回显)
function renderHashTable(ht, options = {}) {
    if (!ht) return '';
    const {
        title = 'HashTable',
        color = '#059669',
        showValue = true,
        targetKey = null,
    } = options;

    const size = ht.size ?? 0;
    const used = ht.used ?? 0;
    const load = ht.load_factor ?? 0;
    const entries = ht.entries || [];
    const buckets = ht.buckets || [];

    // 按 bucket 索引聚合 entries
    const byBucket = new Map();
    buckets.forEach(b => byBucket.set(b.index, []));
    entries.forEach(e => {
        if (!byBucket.has(e.bucket)) byBucket.set(e.bucket, []);
        byBucket.get(e.bucket).push(e);
    });

    // 计算负载因子颜色 (>= 1 警告, < 0.3 浪费)
    const loadColor = load >= 1 ? '#dc2626' : (load < 0.3 ? '#d97706' : color);

    const entriesHtml = showValue
        ? (e) => `<span class="ht-entry" data-key="${escapeHtml(e.key)}" data-bucket="${e.bucket}">${escapeHtml(e.key)}=${escapeHtml(e.value)}</span>`
        : (e) => `<span class="ht-entry" data-key="${escapeHtml(e.key)}" data-bucket="${e.bucket}">${escapeHtml(e.key)}</span>`;

    const bucketsHtml = buckets.map(b => {
        const list = byBucket.get(b.index) || [];
        const isTarget = (node) => targetKey && node.key === targetKey;
        const items = list.length
            ? list.map(e => entriesHtml(e) + (e !== list[list.length - 1] ? '<span class="ht-arrow">→</span>' : '')).join('')
            : '<span class="ht-null">NULL</span>';
        return `
            <div class="ht-bucket ${list.length === 0 ? 'ht-bucket-empty' : ''}">
                <span class="bucket-idx">[${b.index}]</span>
                <div class="bucket-chain">${items}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="ht-card">
            <div class="ht-header" style="border-color:${color};background:${hexToBg(color)};">
                <span class="ht-title" style="color:${color};">${escapeHtml(title)}</span>
                <span class="ht-stats">
                    <span class="ht-stat"><b>size</b>=${size}</span>
                    <span class="ht-stat"><b>used</b>=${used}</span>
                    <span class="ht-stat" style="color:${loadColor};"><b>load</b>=${load}</span>
                </span>
            </div>
            <div class="ht-visual">${bucketsHtml}</div>
            <div class="ht-legend">
                <span class="ht-legend-item"><span class="ht-entry ht-entry-sample">key=value</span> 链地址节点</span>
                <span class="ht-legend-item"><span class="ht-arrow">→</span> next 指针</span>
                <span class="ht-legend-item"><span class="ht-null">NULL</span> 桶为空</span>
            </div>
        </div>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function hexToBg(hex) {
    // 把 #RRGGBB 转成 10% 透明的同色背景
    if (!hex || !hex.startsWith('#') || hex.length !== 7) return '#f0fdf4';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.08)`;
}

// 渲染 IntSet 的 int8_t contents[] 连续内存块 (与 SDS char buf[] 同一 UI 模式)
// contents: 整数数组
// bytesPerEntry: 2 / 4 / 8
// encoding: int16 / int32 / int64
function renderIntSetBuf(contents, bytesPerEntry, encoding) {
    if (!Array.isArray(contents) || contents.length === 0) {
        return `<div class="is-buf is-buf-empty">int8_t contents[] = (空数组)</div>`;
    }

    // 每个元素占一格, 标注字节偏移
    const cells = contents.map((v, i) => {
        const offset = i * bytesPerEntry;
        return `
            <div class="is-cell" style="--cell-width:${Math.max(56, bytesPerEntry * 10)}px;">
                <div class="is-cell-offset">+${offset}</div>
                <div class="is-cell-value">${v}</div>
            </div>
        `;
    }).join('');

    const totalBytes = contents.length * bytesPerEntry;
    const summary = `length=${contents.length} &nbsp;|&nbsp; bytes_per_entry=${bytesPerEntry} &nbsp;|&nbsp; total=${totalBytes + 8} bytes (含 encoding/length 头)`;

    return `
        <div class="is-buf">
            <div class="is-buf-header">
                <span class="is-buf-type">int8_t</span>
                <span class="is-buf-name">contents[]</span>
                <span class="is-buf-equals">=</span>
                <span class="is-buf-shape">[ ${contents.length} × ${bytesPerEntry}B ]</span>
            </div>
            <div class="is-buf-cells">${cells}</div>
            <div class="is-buf-info">${summary}</div>
        </div>
    `;
}

// 渲染 SDS 的 char buf[] 连续字节块 (与 IntSet contents[] 同一 UI 模式)
// value: 字符串值 (非 int 编码时),  bytesTotal: 总字节数
function renderSdsBuf(value, bytesTotal) {
    if (value === '' || value === null || value === undefined) {
        return `<div class="sds-buf-inner sds-buf-empty">char buf[] = (空字符串)</div>`;
    }
    // 把字符串拆成字节格子
    const bytes = [];
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        const code = value.charCodeAt(i);
        bytes.push({ ch: ch, code: code, ascii: code >= 0x20 && code < 0x7f ? ch : `\\x${code.toString(16).padStart(2, '0')}` });
    }
    const cells = bytes.map((b, i) => `
        <div class="sds-cell">
            <div class="sds-cell-offset">+${i}</div>
            <div class="sds-cell-byte">${b.ascii}</div>
        </div>
    `).join('');
    return `
        <div class="sds-buf-inner">
            <div class="sds-buf-header">
                <span class="sds-buf-type">char</span>
                <span class="sds-buf-name">buf[]</span>
                <span class="sds-buf-equals">=</span>
                <span class="sds-buf-shape">"${escapeHtml(value)}" (${bytes.length} bytes)</span>
            </div>
            <div class="sds-buf-cells">${cells}</div>
            <div class="sds-buf-info">len=${bytes.length} &nbsp;|&nbsp; alloc=${bytesTotal} &nbsp;|&nbsp; flags=1byte</div>
        </div>
    `;
}

function toggleCodePanel(codeId) {
    const panel = document.getElementById(codeId + '-panel');
    const mask = document.getElementById(codeId + '-mask');
    if (panel && mask) {
        panel.classList.add('show');
        mask.classList.add('show');
    }
}

function closeCodePanel(codeId) {
    const panel = document.getElementById(codeId + '-panel');
    const mask = document.getElementById(codeId + '-mask');
    if (panel && mask) {
        panel.classList.remove('show');
        mask.classList.remove('show');
    }
}
