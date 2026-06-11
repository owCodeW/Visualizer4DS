/**
 * Redis ZSet (SkipList) 页面脚本
 */
(function () {
    'use strict';

    document.getElementById('navBar').innerHTML = createNavBar();
    document.getElementById('encodingPath').innerHTML = createEncodingPath([
        { label: 'listpack', cls: 'enc-listpack' },
        { label: 'skiplist+hashtable', cls: 'enc-skiplist' }
    ]);
    document.getElementById('irreversibleBar').innerHTML = createIrreversibleBar(
        'listpack → skiplist+hashtable',
        'ZSet 编码只升级不降级: skiplist 不会降回 listpack，即使元素很少'
    );

    var codeContent = '\
        <h3>1. ZSet 编码切换规则（只升级不降级）</h3>\
<pre>\
<span class="comment">// Redis 7 ZSet 编码选择:</span>\
元素数 ≤ <span class="highlight">128</span> 且值长度 ≤ 64 字节\
    → <span class="keyword">listpack</span> 编码\
\
元素数 > 128 或值长度 > 64 字节\
    → <span class="keyword">skiplist + hashtable</span> 编码\
\
<span class="comment">// 升级后不降级!</span>\
<span class="comment">// 即使删到只剩1个元素，skiplist 也不会变回 listpack</span>\
</pre>\
        <h3>2. SkipList 结构体</h3>\
<pre>\
typedef struct zskiplist {\
    <span class="highlight">struct zskiplistNode *header, *tail</span>;\
    <span class="highlight">unsigned long length</span>;    /* 节点数量 */\
    <span class="highlight">int level</span>;               /* 最大层数 */\
} zskiplist;\
\
typedef struct zskiplistNode {\
    <span class="highlight">sds ele</span>;                 /* 成员对象 */\
    <span class="highlight">double score</span>;            /* 分值 */\
    <span class="highlight">struct zskiplistNode *backward</span>;\
    struct zskiplistLevel {\
        <span class="highlight">struct zskiplistNode *forward</span>;\
        <span class="highlight">unsigned long span</span>;   /* 跨度 */\
    } level[];\
} zskiplistNode;\
</pre>\
        <h3>3. 跳表特性</h3>\
<pre>\
<span class="comment">// 最大 32 层</span>\
<span class="comment">// 每层以概率 1/4 升层</span>\
<span class="comment">// O(logN) 查找/插入/删除</span>\
<span class="comment">// 与 HashTable 配合实现 O(1) 成员查询</span>\
</pre>';

    document.getElementById('codeBtnContainer').innerHTML = createCodePanel('zsetCode');
    setTimeout(function () {
        var panel = document.getElementById('zsetCode-panel');
        var mask = document.getElementById('zsetCode-mask');
        if (panel && mask) {
            document.body.appendChild(mask);
            document.body.appendChild(panel);
            document.getElementById('zsetCode-body').innerHTML = codeContent;
        }
    }, 0);

    var logDom = document.getElementById('operLog');
    var encDisplay = document.getElementById('encDisplay');
    var entryCountDisplay = document.getElementById('entryCount');
    var encAlert = document.getElementById('encAlert');
    var blockedAlert = document.getElementById('blockedAlert');

    function getEncClass(enc) {
        return enc === 'listpack' ? 'enc-listpack' : 'enc-skiplist';
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function escapeAttr(s) { return escapeHtml(s); }

    // ---- 跳表分层渲染 ----
    function renderSkipList(struct) {
        var nodes = struct.nodes || [];
        var levels = struct.levels || [];
        var dist = struct.level_distribution || [];
        var lastOp = struct.last_op;

        if (nodes.length === 0) {
            return '<div class="sl-empty">跳表为空 - 通过 ZADD 添加节点</div>';
        }

        var colOf = new Map();
        nodes.forEach(function (n, idx) { colOf.set(n.member, idx); });
        var totalCols = nodes.length;

        var levelRowsHtml = levels.map(function (lv) {
            var cells = new Array(totalCols).fill(null);
            lv.nodes.forEach(function (n) {
                cells[colOf.get(n.member)] = n;
            });

            var cellsHtml = cells.map(function (n, idx) {
                if (!n) {
                    return '<div class="sl-cell sl-empty-cell" data-col="' + idx + '"></div>';
                }
                var isOpTarget = lastOp && lastOp.target === n.member;
                return '<div class="sl-cell sl-filled" data-col="' + idx + '" data-member="' + escapeAttr(n.member) + '" data-score="' + n.score + '">' +
                    '<div class="sl-node ' + (isOpTarget ? 'sl-op-target' : '') + '" title="score=' + n.score + '">' +
                    '<div class="sl-member">' + escapeHtml(n.member) + '</div>' +
                    '<div class="sl-score">' + n.score + '</div>' +
                    '</div></div>';
            }).join('');

            var gridStyle = 'grid-template-columns: repeat(' + totalCols + ', 90px);';
            return '<div class="sl-layer" data-level="' + lv.level + '">' +
                '<div class="sl-layer-label">L' + lv.level + (lv.level === struct.level ? ' <span class="sl-top">(顶层)</span>' : '') + '</div>' +
                '<div class="sl-layer-cells" style="' + gridStyle + '">' + cellsHtml + '</div>' +
                '</div>';
        }).join('');

        var tailNode = struct.tail ? '<span class="sl-tail">tail → ' + escapeHtml(struct.tail) + '</span>' : '';

        var distHtml = '';
        if (dist.length > 0) {
            distHtml = '<div class="sl-dist-card"><div class="sl-dist-title">各层节点数 (升层概率 1/4 → 指数衰减)</div>';
            distHtml += dist.map(function (d) {
                var ratio = nodes.length > 0 ? (d.count / nodes.length * 100).toFixed(0) : 0;
                var barWidth = Math.max(2, ratio);
                return '<div class="sl-dist-row"><span class="sl-dist-label">L' + d.level + '</span>' +
                    '<div class="sl-dist-bar-wrap"><div class="sl-dist-bar" style="width:' + barWidth + '%;"></div>' +
                    '<span class="sl-dist-count">' + d.count + '</span></div></div>';
            }).join('');
            distHtml += '</div>';
        }

        var pathHint = '';
        if (lastOp) {
            pathHint = '<div class="sl-path-hint">最近操作: <strong>' + (lastOp.kind === 'insert' ? 'ZADD' : 'ZREM') + '</strong>' +
                ' 目标: <code>' + escapeHtml(lastOp.target) + '</code>' +
                ' &nbsp;|&nbsp; 访问路径(每层): ' +
                lastOp.path.map(function (row, i) {
                    return '<span class="sl-path-row">L' + i + ': ' + row.map(function (m) { return escapeHtml(m); }).join(' → ') + '</span>';
                }).join('') + '</div>';
        }

        return '<div class="sl-container">' +
            '<div class="sl-header-row"><span class="sl-header-node">H (header)</span><span class="sl-tail">' + tailNode + '</span></div>' +
            '<div class="sl-layers" id="sl-layers">' + levelRowsHtml + '</div>' +
            pathHint + distHtml + '</div>';
    }

    function renderZSetHashTable(ht) {
        if (!ht) return '';
        return renderHashTable(ht, {
            title: '配套 HashTable (O(1) member → score 查询)',
            color: '#059669',
            showValue: true,
        });
    }

    function renderZSet(struct, animate) {
        var visual = document.getElementById('zsetVisual');
        encDisplay.textContent = struct.current_encoding;
        encDisplay.className = 'enc-value ' + getEncClass(struct.current_encoding);

        if (struct.current_encoding === 'listpack') {
            entryCountDisplay.textContent = struct.entry_count;
            var entries = struct.entries || [];
            visual.innerHTML = '<div class="struct-main" style="border-color:#8b5cf6;background:#f5f3ff;">' +
                '<div class="struct-title" style="color:#8b5cf6;">Listpack 编码</div>' +
                '<div class="struct-fields">• entry_count = ' + struct.entry_count + '<br>• total_bytes = ' + struct.total_bytes + '<br>• max_entries = ' + struct.max_entries + '</div>' +
                '<div class="listpack-box" style="margin-top:12px;"><div class="lp-title">有序键值对 (按 score 排序)</div>' +
                '<div class="lp-items">' + entries.map(function (e) { return '<span class="item key">' + e.field + '</span><span class="item score">' + e.value + '</span>'; }).join('') + '</div></div></div>';
        } else {
            entryCountDisplay.textContent = struct.length;
            visual.innerHTML = '<div class="struct-main" style="border-color:#dc2626;background:#fef2f2;">' +
                '<div class="struct-title" style="color:#dc2626;">SkipList 编码（不可逆）</div>' +
                '<div class="struct-fields">• level = ' + struct.level + '&nbsp;&nbsp;• length = ' + struct.length + '<br>• max_level = ' + struct.max_level + '&nbsp;&nbsp;• probability = ' + struct.probability + '</div></div>' +
                '<div class="skiplist-visual" id="skiplistVisual">' + renderSkipList(struct) + '</div>' +
                renderZSetHashTable(struct.hashtable);
            drawSkipListArrows(struct);
            if (animate && struct.last_op) playOpAnimation(struct.last_op);
        }
    }

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function cssEscape(s) {
        if (window.CSS && CSS.escape) return CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\' + c; });
    }

    async function playOpAnimation(lastOp) {
        if (!lastOp || !lastOp.path) return;
        var container = document.getElementById('sl-layers');
        if (!container) return;
        var visitedMembers = new Set();
        for (var lvl = lastOp.path.length - 1; lvl >= 0; lvl--) {
            for (var j = 0; j < lastOp.path[lvl].length; j++) {
                var m = lastOp.path[lvl][j];
                if (visitedMembers.has(m)) continue;
                visitedMembers.add(m);
                var cell = container.querySelector('.sl-layer[data-level="' + lvl + '"] .sl-cell[data-member="' + cssEscape(m) + '"]');
                if (cell) {
                    cell.classList.add('sl-flash');
                    setTimeout(function (c) { c.classList.remove('sl-flash'); }, 1200, cell);
                }
                await sleep(120);
            }
        }
    }

    function drawSkipListArrows(struct) {
        var container = document.getElementById('sl-layers');
        if (!container) return;
        var old = container.querySelector('svg.sl-svg');
        if (old) old.remove();

        var levels = struct.levels || [];
        var nodes = struct.nodes || [];
        if (nodes.length === 0) return;
        var colOf = new Map();
        nodes.forEach(function (n, idx) { colOf.set(n.member, idx); });

        var layerEls = container.querySelectorAll('.sl-layer');
        var containerRect = container.getBoundingClientRect();

        var points = [];
        layerEls.forEach(function (layerEl) {
            var lvl = parseInt(layerEl.dataset.level);
            var cells = layerEl.querySelectorAll('.sl-cell.sl-filled');
            var row = [];
            cells.forEach(function (cell) {
                var r = cell.getBoundingClientRect();
                var member = cell.dataset.member;
                row.push({
                    col: colOf.get(member),
                    x: r.left - containerRect.left + r.width / 2,
                    y: r.top - containerRect.top + r.height / 2,
                    member: member,
                });
            });
            points[lvl] = row;
        });

        var SVG_NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'sl-svg');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = containerRect.width + 'px';
        svg.style.height = containerRect.height + 'px';
        svg.style.pointerEvents = 'none';
        svg.setAttribute('viewBox', '0 0 ' + containerRect.width + ' ' + containerRect.height);

        var lastOp = struct.last_op;

        levels.forEach(function (lv) {
            var row = points[lv.level] || [];
            for (var i = 0; i < row.length - 1; i++) {
                var a = row[i];
                var b = row[i + 1];
                if (b.x <= a.x) continue;

                var line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', a.x);
                line.setAttribute('y1', a.y);
                line.setAttribute('x2', b.x);
                line.setAttribute('y2', b.y);
                line.setAttribute('stroke', '#dc2626');
                line.setAttribute('stroke-width', '2');
                line.setAttribute('marker-end', 'url(#sl-arrow)');
                if (lastOp && lastOp.path[lv.level] &&
                    lastOp.path[lv.level].includes(a.member) &&
                    lastOp.path[lv.level].includes(b.member)) {
                    line.setAttribute('class', 'sl-edge sl-edge-active');
                }
                svg.appendChild(line);
            }
        });

        var defs = document.createElementNS(SVG_NS, 'defs');
        var marker = document.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', 'sl-arrow');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');
        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.setAttribute('fill', '#dc2626');
        marker.appendChild(path);
        defs.appendChild(marker);
        svg.appendChild(defs);

        container.style.position = container.style.position || 'relative';
        container.appendChild(svg);
    }

    function loadStructure() {
        ZSetAPI.getStructure().then(function (data) {
            renderZSet(data);
            writeLog(logDom, '结构加载完成');
        });
    }

    document.getElementById('btnZadd').addEventListener('click', function () {
        var member = document.getElementById('inputMember').value;
        var score = parseFloat(document.getElementById('inputScore').value);
        ZSetAPI.zadd(member, score).then(function (data) {
            renderZSet(data.structure, true);
            var change = data.encoding_change;
            if (change) {
                showEncodingChange(encAlert, change);
                showDowngradeBlocked(blockedAlert, change);
                logEncodingChange(logDom, change, 'ZADD');
            } else {
                writeLog(logDom, 'ZADD ' + member + ' ' + score + ' → 编码: ' + data.encoding);
            }
        });
    });

    document.getElementById('btnZrem').addEventListener('click', function () {
        var member = document.getElementById('inputMember').value;
        ZSetAPI.zrem(member).then(function (data) {
            renderZSet(data.structure, true);
            writeLog(logDom, 'ZREM ' + member);
        });
    });

    document.getElementById('btnBulkFill').addEventListener('click', function () {
        var count = parseInt(document.getElementById('inputBulkCount').value) || 130;
        ZSetAPI.bulkFill(count).then(function (data) {
            renderZSet(data.structure, false);
            var change = data.encoding_change;
            if (change) {
                logEncodingChange(logDom, change, 'BULK_FILL');
            } else {
                writeLog(logDom, 'BULK_FILL 填充 ' + data.added + ' 个 member-score (目标: ' + data.target + ')');
            }
        });
    });

    document.getElementById('btnReset').addEventListener('click', function () {
        ZSetAPI.reset().then(function (data) {
            renderZSet(data.structure, false);
            writeLog(logDom, '结构已重置');
        });
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (encDisplay.textContent === 'skiplist') {
                ZSetAPI.getStructure().then(function (d) {
                    var visual = document.getElementById('zsetVisual');
                    if (visual.querySelector('#sl-layers')) {
                        renderZSet(d, false);
                    }
                });
            }
        }, 200);
    });

    loadStructure();
})();
