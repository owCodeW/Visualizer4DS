/**
 * Redis List (QuickList) 页面脚本
 */
(function () {
    'use strict';

    document.getElementById('navBar').innerHTML = createNavBar();
    document.getElementById('encodingPath').innerHTML = createEncodingPath([
        { label: 'listpack', cls: 'enc-listpack' },
        { label: 'quicklist', cls: 'enc-quicklist' }
    ]);
    document.getElementById('irreversibleBar').innerHTML = createIrreversibleBar(
        'listpack → quicklist',
        'List 编码只升级不降级: quicklist 不会降回 listpack，即使元素很少'
    );

    var codeContent = '\
        <h3>1. List 编码切换规则（只升级不降级）</h3>\
<pre>\
<span class="comment">// Redis 7 List 编码选择:</span>\
元素数 ≤ <span class="highlight">8</span> (简化阈值)\
    → <span class="keyword">listpack</span> 编码 (紧凑)\
\
元素数 > 8\
    → <span class="keyword">quicklist</span> 编码 (双向链表+listpack)\
\
<span class="comment">// 升级后不降级!</span>\
<span class="comment">// 即使删除到只剩1个元素，quicklist 也不会变回 listpack</span>\
</pre>\
        <h3>2. quicklist 主结构体</h3>\
<pre>\
typedef struct quicklist {\
    <span class="highlight">quicklistNode *head</span>;       /* 链表头节点 */\
    <span class="highlight">quicklistNode *tail</span>;       /* 链表尾节点 */\
    <span class="highlight">unsigned long count</span>;       /* 全局总元素数 */\
    <span class="highlight">unsigned long len</span>;         /* 节点总数 */\
    signed int fill : QL_FILL_BITS;\
    unsigned int compress : QL_COMP_BITS;\
} quicklist;\
</pre>\
        <h3>3. quicklistNode 节点结构体</h3>\
<pre>\
typedef struct quicklistNode {\
    <span class="highlight">struct quicklistNode *prev</span>; /* 前驱指针 */\
    <span class="highlight">struct quicklistNode *next</span>; /* 后继指针 */\
    <span class="highlight">unsigned char *entry</span>;      /* 指向 listpack */\
    <span class="highlight">size_t sz</span>;                  /* listpack 内存大小 */\
    <span class="highlight">unsigned int count</span>;        /* 当前节点元素数 */\
} quicklistNode;\
</pre>';

    document.getElementById('codeBtnContainer').innerHTML = createCodePanel('listCode');
    setTimeout(function () {
        var panel = document.getElementById('listCode-panel');
        var mask = document.getElementById('listCode-mask');
        if (panel && mask) {
            document.body.appendChild(mask);
            document.body.appendChild(panel);
            document.getElementById('listCode-body').innerHTML = codeContent;
        }
    }, 0);

    var logDom = document.getElementById('operLog');
    var encDisplay = document.getElementById('encDisplay');

    function getEncClass(enc) {
        return enc === 'listpack' ? 'enc-listpack' : 'enc-quicklist';
    }

    function renderList(struct) {
        encDisplay.textContent = struct.current_encoding;
        encDisplay.className = 'enc-value ' + getEncClass(struct.current_encoding);
        document.getElementById('totalCount').textContent = struct.count || 0;
        document.getElementById('nodeCount').textContent = struct.node_count || 0;

        var visual = document.getElementById('listVisual');

        function renderLpBlock(items, blockTitle, isHead, isTail) {
            if (!items || items.length === 0) {
                return '<div class="lp-block">' +
                    (blockTitle ? '<div class="lp-block-title" style="font-size:12px;color:#6d28d9;margin-bottom:6px;">' + blockTitle + '</div>' : '') +
                    '<div class="lp-bytes" style="color:#999;">(空 listpack)</div>' +
                    '</div>';
            }
            var byteCells = items.map(function (_, i) { return '<div class="lp-byte-cell">+' + (i * 6) + '</div>'; }).join('');
            var elements = items.map(function (e) { return '<div class="lp-element">' + e + '</div>'; }).join('');
            return '<div class="lp-block">' +
                (isHead ? '<div class="node-head-tag">HEAD 节点</div>' : '') +
                (isTail ? '<div class="node-tail-tag">TAIL 节点</div>' : '') +
                (blockTitle ? '<div class="lp-block-title" style="font-size:12px;color:#6d28d9;margin-bottom:6px;">' + blockTitle + '</div>' : '') +
                '<div class="lp-bytes">' + byteCells + '</div>' +
                '<div class="lp-pointer-row">' +
                '<div class="lp-pointer lp-head lp-hidden">HEAD<span class="lp-arrow">▼</span></div>' +
                '<div class="lp-pointer lp-tail lp-hidden">TAIL<span class="lp-arrow">▼</span></div>' +
                '</div>' +
                '<div class="lp-elements-row">' + elements + '</div>' +
                '</div>';
        }

        if (struct.current_encoding === 'listpack') {
            var entries = struct.entries || [];
            var items = entries.map(function (e) { return e.field; });
            var lpBlock = renderLpBlock(items, 'Listpack (连续内存, 单节点)', true, true);
            visual.innerHTML = '<div class="struct-main" style="border-color:#8b5cf6;background:#f5f3ff;">' +
                '<div class="struct-title" style="color:#8b5cf6;">Listpack 编码 (单一连续内存块)</div>' +
                '<div class="struct-fields">• entry_count = ' + (struct.count || 0) + ' &nbsp; • total_bytes = ' + (struct.total_bytes || 0) + ' &nbsp; • max_entries = ' + (struct.threshold ? struct.threshold.listpack_max_entries : 8) + '</div>' +
                '<div style="margin-top:10px;padding:6px 10px;background:#ede9fe;border-radius:6px;font-size:13px;color:#5b21b6;">💡 <strong>LPUSH</strong> 插入到最左 (HEAD)，<strong>RPUSH</strong> 插入到最右 (TAIL)</div>' +
                lpBlock + '</div>';
        } else {
            var nodes = struct.nodes || [];
            var nodesHtml = nodes.map(function (node) {
                var lpBlock = renderLpBlock(
                    node.items,
                    'quicklistNode ' + node.id + ' · 内部 listpack · count=' + node.item_count + ' · sz=' + node.sz + 'B',
                    node.is_head,
                    node.is_tail
                );
                return lpBlock + (!node.is_tail ? '<div class="arrow" style="text-align:center;font-size:18px;color:#8b5cf6;margin:4px 0;">⇅ 双向指针</div>' : '');
            }).join('');
            visual.innerHTML = '<div class="struct-main">' +
                '<div class="struct-title">quicklist 主结构体</div>' +
                '<div class="struct-fields">• head → 头节点 &nbsp;&nbsp; • tail → 尾节点<br>• count = ' + struct.count + '（全局总元素）&nbsp;&nbsp; • len = ' + struct.node_count + '（节点总数）</div>' +
                '<div style="margin-top:10px;padding:6px 10px;background:#dbeafe;border-radius:6px;font-size:13px;color:#1e40af;">💡 <strong>LPUSH</strong> 插入到 Head 节点最左，<strong>RPUSH</strong> 插入到 Tail 节点最右；<strong>LPOP</strong> 从 Head 节点最左弹出，<strong>RPOP</strong> 从 Tail 节点最右弹出</div>' +
                '</div>' + nodesHtml +
                (struct.downgrade_note ? '<div style="margin-top:10px;padding:8px;background:#fee2e2;border-radius:6px;color:#991b1b;font-size:13px;">⚠ ' + struct.downgrade_note + '</div>' : '');
        }
        requestAnimationFrame(alignPointers);
    }

    function alignPointers() {
        document.querySelectorAll('.lp-block').forEach(function (block) {
            var elements = block.querySelectorAll('.lp-element');
            var head = block.querySelector('.lp-pointer.lp-head');
            var tail = block.querySelector('.lp-pointer.lp-tail');
            if (!head || !tail) return;
            if (elements.length === 0) {
                head.classList.add('lp-hidden');
                tail.classList.add('lp-hidden');
                return;
            }
            var blockRect = block.getBoundingClientRect();
            var firstRect = elements[0].getBoundingClientRect();
            var lastRect = elements[elements.length - 1].getBoundingClientRect();
            var headX = (firstRect.left + firstRect.width / 2) - blockRect.left;
            var tailX = (lastRect.left + lastRect.width / 2) - blockRect.left;
            var headSafe = Math.max(28, Math.min(headX, blockRect.width - 28));
            var tailSafe = Math.max(28, Math.min(tailX, blockRect.width - 28));
            head.style.left = headSafe + 'px';
            tail.style.left = tailSafe + 'px';
            head.classList.remove('lp-hidden');
            tail.classList.remove('lp-hidden');
        });
    }

    window.addEventListener('resize', alignPointers);

    function loadStructure() {
        ListAPI.getStructure().then(function (data) {
            renderList(data);
            writeLog(logDom, '结构加载完成');
        });
    }

    document.getElementById('btnLpush').addEventListener('click', function () {
        var value = document.getElementById('inputValue').value;
        ListAPI.lpush(value).then(function (data) {
            renderList(data.structure || data);
            var change = data.encoding_change;
            if (change) logEncodingChange(logDom, change, 'LPUSH');
            else writeLog(logDom, 'LPUSH "' + value + '"');
        });
    });

    document.getElementById('btnRpush').addEventListener('click', function () {
        var value = document.getElementById('inputValue').value;
        ListAPI.rpush(value).then(function (data) {
            renderList(data.structure || data);
            var change = data.encoding_change;
            if (change) logEncodingChange(logDom, change, 'RPUSH');
            else writeLog(logDom, 'RPUSH "' + value + '"');
        });
    });

    document.getElementById('btnLpop').addEventListener('click', function () {
        ListAPI.lpop().then(function (data) {
            renderList(data.structure || data);
            writeLog(logDom, 'LPOP → ' + ((data.result && data.result.item) || '空'));
        });
    });

    document.getElementById('btnRpop').addEventListener('click', function () {
        ListAPI.rpop().then(function (data) {
            renderList(data.structure || data);
            writeLog(logDom, 'RPOP → ' + ((data.result && data.result.item) || '空'));
        });
    });

    document.getElementById('btnSplit').addEventListener('click', function () {
        ListAPI.getStructure().then(function (struct) {
            if (struct.current_encoding === 'listpack') {
                writeLog(logDom, 'listpack 编码不支持节点分裂', 'blocked');
                return;
            }
            if (struct.node_count > 0) {
                var idx = Math.floor(Math.random() * struct.node_count);
                ListAPI.split(idx).then(function (data) {
                    renderList(data.structure || data);
                    writeLog(logDom, '手动分裂节点 ' + idx);
                });
            }
        });
    });

    document.getElementById('btnBulkFill').addEventListener('click', function () {
        var count = parseInt(document.getElementById('inputBulkCount').value) || 10;
        ListAPI.bulkFill(count).then(function (data) {
            renderList(data.structure || data);
            var change = data.encoding_change;
            if (change) {
                logEncodingChange(logDom, change, 'BULK_FILL');
            } else {
                writeLog(logDom, 'BULK_FILL 填充 ' + data.added + ' 个元素 (目标: ' + data.target + ')');
            }
        });
    });

    document.getElementById('btnReset').addEventListener('click', function () {
        ListAPI.reset().then(function (data) {
            renderList(data.structure || data);
            writeLog(logDom, '结构已重置');
        });
    });

    loadStructure();
})();
