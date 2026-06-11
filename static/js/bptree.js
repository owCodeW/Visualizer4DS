/**
 * MySQL B+Tree — 页面脚本
 */
(function () {
    'use strict';

    document.getElementById('navBar').innerHTML = createNavBar();

    // ===================== B+Tree API =====================
    var BPTreeAPI = {
        getStructure: function () { return apiGet('/mysql/bptree/structure'); },
        insert: function (key, value) { return apiPost('/mysql/bptree/insert', { key: key, value: value }); },
        search: function (key) { return apiPost('/mysql/bptree/search', { key: key }); },
        delete: function (key) { return apiPost('/mysql/bptree/delete', { key: key }); },
        range: function (low, high) { return apiPost('/mysql/bptree/range', { low: low, high: high }); },
        bulkFill: function (count, strategy) { return apiPost('/mysql/bptree/bulk-fill', { count: count, strategy: strategy }); },
        reset: function () { return apiPost('/mysql/bptree/reset', {}); }
    };

    // ===================== 渲染 B+Tree =====================
    var currentStructure = null;
    var lastHighlight = { type: null, ids: [] };

    function escapeHtml(s) {
        return String(s).replace(/[<>&"]/g, function (c) {
            return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        });
    }

    function renderBPTree(structure) {
        currentStructure = structure;
        var canvas = document.getElementById('treeCanvas');

        if (!structure.nodes || structure.nodes.length === 0) {
            canvas.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:60px;">空树, 请插入数据</div>';
            updateStats(structure);
            return;
        }

        // 构建 edge 映射: parentId -> [{childId, pos}]
        var edgeMap = {};
        for (var ei = 0; ei < (structure.edges || []).length; ei++) {
            var e = structure.edges[ei];
            if (!edgeMap[e.from]) edgeMap[e.from] = [];
            edgeMap[e.from].push({ childId: e.to, pos: e.pos });
        }
        // 按 pos 排序
        for (var fk in edgeMap) {
            edgeMap[fk].sort(function (a, b) { return a.pos - b.pos; });
        }

        // 按 depth 分层
        var levels = {};
        for (var i = 0; i < structure.nodes.length; i++) {
            var n = structure.nodes[i];
            if (!levels[n.depth]) levels[n.depth] = [];
            levels[n.depth].push(n);
        }
        var maxDepth = 0;
        var depthKeys = Object.keys(levels);
        for (var k = 0; k < depthKeys.length; k++) {
            var d = parseInt(depthKeys[k]);
            if (d > maxDepth) maxDepth = d;
        }

        // 构建 HTML
        var html = '';
        for (var di = 1; di <= maxDepth; di++) {
            var nodes = (levels[di] || []).slice().sort(function (a, b) { return a.id - b.id; });
            var labelMap = { 1: '根 (Root)', 2: '叶子层 (Leaf Level)' };
            html += '<div class="tree-level" data-depth="' + di + '">';
            html += '<div class="tree-level-label">' + (labelMap[di] || '第 ' + di + ' 层') + ' · ' + nodes.length + ' 个节点</div>';
            for (var ni = 0; ni < nodes.length; ni++) {
                html += renderNode(nodes[ni], edgeMap);
            }
            html += '</div>';
        }

        // 叶子双向链表
        if (structure.leaf_links && structure.leaf_links.length > 0) {
            var leafMap = {};
            for (var li = 0; li < structure.nodes.length; li++) {
                var ln = structure.nodes[li];
                if (ln.type === 'leaf') leafMap[ln.id] = ln;
            }
            html += '<div class="leaf-link-row">';
            html += '<div class="label">↔ 叶子节点双向链表 (范围扫描通道)</div>';
            var first = true;
            var visited = new Set();
            var cur = structure.first_leaf_id;
            while (cur && !visited.has(cur)) {
                visited.add(cur);
                if (!first) html += '<span class="leaf-link-arrow">⇄</span>';
                first = false;
                var leaf = leafMap[cur];
                var keys = leaf ? leaf.keys.join(',') : '?';
                html += '<div class="leaf-link-mini">L' + cur + ' <span>[' + keys + ']</span></div>';
                var link = null;
                for (var ll = 0; ll < structure.leaf_links.length; ll++) {
                    if (structure.leaf_links[ll].from === cur) { link = structure.leaf_links[ll]; break; }
                }
                cur = link ? link.to : null;
            }
            html += '</div>';
        }

        canvas.innerHTML = html;
        updateStats(structure);
        applyHighlight();
        // 等待 DOM 布局完成后再绘制连线
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                drawEdges(structure);
            });
        });
    }

    function renderNode(n, edgeMap) {
        var isEmpty = n.type === 'leaf' && n.keys.length === 0;
        var classes = ['bpnode'];
        if (n.type === 'internal') classes.push('bpnode-internal');
        if (n.type === 'leaf') classes.push('bpnode-leaf');
        if (isEmpty) classes.push('bpnode-empty');
        var cls = classes.join(' ');
        var typeLabel = n.type === 'internal' ? 'I' : 'L';

        var row = '<div class="bpnode-row">';
        if (n.type === 'internal') {
            var children = edgeMap[n.id] || [];
            for (var ci = 0; ci <= n.keys.length; ci++) {
                var childInfo = children[ci] || {};
                var childId = childInfo.childId;
                var ptrLabel = childId ? (childId < 100 ? '→' + (findNodeType(currentStructure, childId) === 'leaf' ? 'L' : 'I') + childId : '→' + childId) : '↓';
                row += '<div class="bpnode-cell pointer" data-child-id="' + (childId || '') + '">' + ptrLabel + '</div>';
                if (ci < n.keys.length) {
                    row += '<div class="bpnode-cell key">' + n.keys[ci] + '</div>';
                }
            }
        } else {
            for (var j = 0; j < n.keys.length; j++) {
                row += '<div class="bpnode-cell key">' + n.keys[j] + '</div>';
                row += '<div class="bpnode-cell">' + escapeHtml(n.values[j] || '') + '</div>';
            }
        }
        row += '</div>';

        var label = n.type === 'internal'
            ? '内部 ' + typeLabel + n.id + ' (' + n.keys.length + ' keys)'
            : '叶子 ' + typeLabel + n.id + ' (' + n.keys.length + ' kv)';

        return '<div class="' + cls + '" data-node-id="' + n.id + '">' + row + '<div class="bpnode-label">' + label + '</div><div class="bpnode-id">' + typeLabel + n.id + '</div></div>';
    }

    function findNodeType(structure, nodeId) {
        if (!structure || !structure.nodes) return null;
        for (var i = 0; i < structure.nodes.length; i++) {
            if (structure.nodes[i].id === nodeId) return structure.nodes[i].type;
        }
        return null;
    }

    function drawEdges(structure) {
        if (!structure.edges || structure.edges.length === 0) return;
        var canvas = document.getElementById('treeCanvas');

        // 移除旧的 SVG
        var oldSvg = canvas.querySelector('.tree-svg');
        if (oldSvg) oldSvg.remove();

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tree-svg');
        svg.setAttribute('width', canvas.scrollWidth);
        svg.setAttribute('height', canvas.scrollHeight);
        svg.style.width = canvas.scrollWidth + 'px';
        svg.style.height = canvas.scrollHeight + 'px';
        svg.style.overflow = 'visible';

        // 判断哪些边需要高亮
        var highlightEdgeSet = {};
        if (lastHighlight && lastHighlight.ids && lastHighlight.ids.length > 1) {
            for (var hi = 0; hi < lastHighlight.ids.length - 1; hi++) {
                var fromId = lastHighlight.ids[hi];
                var toId = lastHighlight.ids[hi + 1];
                highlightEdgeSet[fromId + '-' + toId] = true;
            }
        }

        // 使用 offsetTop/offsetLeft 相对于 canvas 计算坐标, 避免滚动偏移问题
        for (var i = 0; i < structure.edges.length; i++) {
            var edge = structure.edges[i];
            var parentEl = canvas.querySelector('.bpnode[data-node-id="' + edge.from + '"]');
            var childEl = canvas.querySelector('.bpnode[data-node-id="' + edge.to + '"]');
            if (!parentEl || !childEl) continue;

            // 从父节点的对应指针格底部出发
            var ptrCell = parentEl.querySelector('.bpnode-cell.pointer[data-child-id="' + edge.to + '"]');
            var startX, startY;
            if (ptrCell) {
                startX = getOffsetLeft(ptrCell, canvas) + ptrCell.offsetWidth / 2;
                startY = getOffsetTop(ptrCell, canvas) + ptrCell.offsetHeight;
            } else {
                startX = getOffsetLeft(parentEl, canvas) + parentEl.offsetWidth / 2;
                startY = getOffsetTop(parentEl, canvas) + parentEl.offsetHeight;
            }

            // 到子节点的顶部中心
            var endX = getOffsetLeft(childEl, canvas) + childEl.offsetWidth / 2;
            var endY = getOffsetTop(childEl, canvas);

            // 贝塞尔曲线
            var midY = (startY + endY) / 2;
            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            var d = 'M ' + startX + ' ' + startY + ' C ' + startX + ' ' + midY + ', ' + endX + ' ' + midY + ', ' + endX + ' ' + endY;
            path.setAttribute('d', d);

            var isHighlighted = highlightEdgeSet[edge.from + '-' + edge.to];
            path.classList.add('tree-edge');
            if (isHighlighted) {
                path.classList.add('tree-edge-active');
            }
            path.setAttribute('data-from', edge.from);
            path.setAttribute('data-to', edge.to);

            // 箭头: 在终点画一个小三角
            var arrowSize = 5;
            var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            arrow.setAttribute('points',
                (endX - arrowSize) + ',' + (endY - arrowSize * 2) + ' ' +
                (endX + arrowSize) + ',' + (endY - arrowSize * 2) + ' ' +
                endX + ',' + endY
            );
            arrow.setAttribute('fill', isHighlighted ? '#f59e0b' : '#94a3b8');
            arrow.classList.add('tree-edge-arrow');

            svg.appendChild(path);
            svg.appendChild(arrow);
        }

        canvas.insertBefore(svg, canvas.firstChild);
    }

    function getOffsetTop(el, ancestor) {
        var top = 0;
        while (el && el !== ancestor) {
            top += el.offsetTop;
            el = el.offsetParent;
        }
        return top;
    }

    function getOffsetLeft(el, ancestor) {
        var left = 0;
        while (el && el !== ancestor) {
            left += el.offsetLeft;
            el = el.offsetParent;
        }
        return left;
    }

    function applyHighlight() {
        if (!lastHighlight || !lastHighlight.ids || lastHighlight.ids.length === 0) return;
        for (var i = 0; i < lastHighlight.ids.length; i++) {
            var id = lastHighlight.ids[i];
            var el = document.querySelector('.bpnode[data-node-id="' + id + '"]');
            if (el) {
                el.classList.remove('bpnode-path', 'bpnode-found', 'bpnode-range');
                if (lastHighlight.type === 'path') el.classList.add('bpnode-path');
                else if (lastHighlight.type === 'found') el.classList.add('bpnode-found');
                else if (lastHighlight.type === 'range') el.classList.add('bpnode-range');
            }
        }
        // 重绘连线以更新高亮状态
        if (currentStructure) {
            requestAnimationFrame(function () {
                drawEdges(currentStructure);
            });
        }
    }

    function clearHighlight() {
        document.querySelectorAll('.bpnode').forEach(function (el) {
            el.classList.remove('bpnode-path', 'bpnode-found', 'bpnode-range', 'bpnode-highlight');
        });
    }

    function updateStats(s) {
        document.getElementById('treeHeight').textContent = s.height || 0;
        document.getElementById('nodeCount').textContent = (s.nodes || []).length;
        document.getElementById('kvCount').textContent = s.size || 0;

        var internalCount = (s.nodes || []).filter(function (n) { return n.type === 'internal'; }).length;
        var leafCount = (s.nodes || []).filter(function (n) { return n.type === 'leaf'; }).length;
        var totalKeys = (s.nodes || []).filter(function (n) { return n.type === 'leaf'; }).reduce(function (sum, n) { return sum + n.keys.length; }, 0);
        var avgFill = totalKeys / Math.max(1, leafCount);
        document.getElementById('bpStats').innerHTML =
            '<div class="stat"><strong>' + internalCount + '</strong> 内部节点</div>' +
            '<div class="stat"><strong>' + leafCount + '</strong> 叶子节点</div>' +
            '<div class="stat">叶子平均填充 <strong>' + avgFill.toFixed(1) + '</strong> / ' + s.leaf_max + '</div>';
    }

    // ===================== 操作处理 =====================
    var logEl = document.getElementById('operLog');
    var statusEl = document.getElementById('opStatus');

    function setStatus(text, color) {
        statusEl.textContent = text;
        statusEl.style.color = color || '#0ea5e9';
    }

    function refresh() {
        return BPTreeAPI.getStructure().then(function (s) {
            renderBPTree(s);
        });
    }

    document.getElementById('btnInsert').onclick = function () {
        var key = parseInt(document.getElementById('inputKey').value);
        var value = document.getElementById('inputValue').value || 'row' + key;
        if (isNaN(key)) return;
        setStatus('插入中...');
        BPTreeAPI.insert(key, value).then(function (r) {
            renderBPTree(r.structure);
            writeLog(logEl, '[INSERT] key=' + key + ', value=' + value + (r.result.split ? ' [触发分裂]' : ''));
            setStatus(r.result.split ? '分裂完成' : '已插入', r.result.split ? '#d97706' : '#059669');
        });
    };

    document.getElementById('btnSearch').onclick = function () {
        var key = parseInt(document.getElementById('inputSearchKey').value);
        if (isNaN(key)) return;
        setStatus('搜索中...');
        clearHighlight();
        BPTreeAPI.search(key).then(function (r) {
            renderBPTree(r.structure);
            var pathIds = r.result.path.map(function (p) { return p.node_id; });
            if (r.result.found) {
                lastHighlight = { type: 'found', ids: pathIds };
                writeLog(logEl, '[SEARCH] key=' + key + ' 命中 -> value=' + r.result.value + '  (路径: ' + pathIds.join('→') + ')');
                setStatus('命中', '#059669');
            } else {
                lastHighlight = { type: 'path', ids: pathIds };
                writeLog(logEl, '[SEARCH] key=' + key + ' 未命中 (查至路径: ' + pathIds.join('→') + ')', 'blocked');
                setStatus('未命中', '#dc2626');
            }
            applyHighlight();
        });
    };

    document.getElementById('btnRange').onclick = function () {
        var low = parseInt(document.getElementById('inputLow').value);
        var high = parseInt(document.getElementById('inputHigh').value);
        if (isNaN(low) || isNaN(high)) return;
        setStatus('范围扫描中...');
        clearHighlight();
        BPTreeAPI.range(low, high).then(function (r) {
            renderBPTree(r.structure);
            lastHighlight = { type: 'range', ids: r.result.visited_leaves || [] };
            applyHighlight();
            var resultKeys = r.result.results.map(function (x) { return x.key; }).join(',');
            writeLog(logEl, '[RANGE] [' + low + ',' + high + '] 命中 ' + r.result.results.length + ' 条: {' + resultKeys + '}  (扫描叶子: ' + (r.result.visited_leaves || []).join('→') + ')');
            setStatus('命中 ' + r.result.results.length + ' 条', '#7c3aed');
        });
    };

    document.getElementById('btnDelete').onclick = function () {
        var key = parseInt(document.getElementById('inputDelKey').value);
        if (isNaN(key)) return;
        setStatus('删除中...');
        BPTreeAPI.delete(key).then(function (r) {
            renderBPTree(r.structure);
            if (r.result.ok) {
                writeLog(logEl, '[DELETE] key=' + key + ' 删除成功');
                setStatus('已删除', '#dc2626');
            } else {
                writeLog(logEl, '[DELETE] key=' + key + ' 不存在', 'blocked');
                setStatus('key 不存在', '#dc2626');
            }
        });
    };

    document.getElementById('btnBulkFill').onclick = function () {
        var count = parseInt(document.getElementById('inputBulkCount').value) || 10;
        var strategy = document.getElementById('bulkStrategy').value;
        setStatus('批量填充 ' + count + ' 个...');
        BPTreeAPI.bulkFill(count, strategy).then(function (r) {
            renderBPTree(r.structure);
            writeLog(logEl, '[BULK_FILL] ' + strategy + ' 插入 ' + count + ' 个, 触发 ' + r.split_count + ' 次分裂');
            setStatus('分裂 ' + r.split_count + ' 次', '#d97706');
        });
    };

    document.getElementById('btnReset').onclick = function () {
        BPTreeAPI.reset().then(function (r) {
            renderBPTree(r.structure);
            clearHighlight();
            logEl.innerHTML = '';
            writeLog(logEl, '[RESET] B+Tree 已重置');
            setStatus('已重置', '#64748b');
        });
    };

    // 启动
    refresh();
})();
