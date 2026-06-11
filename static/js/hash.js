/**
 * Redis Hash 页面脚本
 */
(function () {
    'use strict';

    document.getElementById('navBar').innerHTML = createNavBar();
    document.getElementById('encodingPath').innerHTML = createEncodingPath([
        { label: 'listpack', cls: 'enc-listpack' },
        { label: 'hashtable', cls: 'enc-hashtable' }
    ]);
    document.getElementById('irreversibleBar').innerHTML = createIrreversibleBar(
        'listpack → hashtable',
        'Hash 编码只升级不降级: hashtable 不会降回 listpack，即使元素很少'
    );

    var codeContent = '\
        <h3>1. Hash 底层编码切换规则（只升级不降级）</h3>\
<pre>\
<span class="comment">// Redis 7 Hash 编码选择:</span>\
元素数 ≤ <span class="highlight">128</span> 且值长度 ≤ 64 字节\
    → <span class="keyword">listpack</span> 编码 (紧凑)\
\
元素数 > 128 或值长度 > 64 字节\
    → <span class="keyword">hashtable</span> 编码 (哈希表)\
\
<span class="comment">// 升级后不降级!</span>\
<span class="comment">// 即使删到只剩1个元素，hashtable 也不会变回 listpack</span>\
</pre>\
        <h3>2. Listpack 结构</h3>\
<pre>\
<span class="comment">// 连续内存，无指针</span>\
| total-bytes | num-elements |\
| entry1 | entry2 | ... | end |\
<span class="comment">// 每个 entry: backlen + encoding + data</span>\
</pre>\
        <h3>3. HashTable (dict) 结构</h3>\
<pre>\
typedef struct dictht {\
    <span class="highlight">dictEntry **table</span>;      /* 哈希表数组 */\
    <span class="highlight">unsigned long size</span>;     /* 哈希表大小 */\
    <span class="highlight">unsigned long sizemask</span>; /* 掩码 = size-1 */\
    <span class="highlight">unsigned long used</span>;     /* 已有节点数 */\
} dictht;\
\
typedef struct dictEntry {\
    <span class="highlight">void *key</span>;\
    union { void *val; uint64_t u64;\
            int64_t s64; double d; } v;\
    <span class="highlight">struct dictEntry *next</span>; /* 链地址法 */\
} dictEntry;\
</pre>';

    document.getElementById('codeBtnContainer').innerHTML = createCodePanel('hashCode');
    setTimeout(function () {
        var panel = document.getElementById('hashCode-panel');
        var mask = document.getElementById('hashCode-mask');
        if (panel && mask) {
            document.body.appendChild(mask);
            document.body.appendChild(panel);
            document.getElementById('hashCode-body').innerHTML = codeContent;
        }
    }, 0);

    var logDom = document.getElementById('operLog');
    var encDisplay = document.getElementById('encDisplay');
    var entryCountDisplay = document.getElementById('entryCount');
    var encAlert = document.getElementById('encAlert');
    var blockedAlert = document.getElementById('blockedAlert');

    function getEncClass(enc) {
        return enc === 'listpack' ? 'enc-listpack' : 'enc-hashtable';
    }

    function renderHash(struct) {
        var visual = document.getElementById('hashVisual');
        encDisplay.textContent = struct.current_encoding;
        encDisplay.className = 'enc-value ' + getEncClass(struct.current_encoding);

        if (struct.current_encoding === 'listpack') {
            entryCountDisplay.textContent = struct.entry_count;
            var entries = struct.entries || [];
            visual.innerHTML = '<div class="struct-main" style="border-color:#8b5cf6;background:#f5f3ff;">' +
                '<div class="struct-title" style="color:#8b5cf6;">Listpack 编码</div>' +
                '<div class="struct-fields">• entry_count = ' + struct.entry_count + '<br>• total_bytes = ' + struct.total_bytes + '<br>• max_entries = ' + struct.max_entries + '</div>' +
                '<div class="listpack-box" style="margin-top:12px;">' +
                '<div class="lp-title">键值对列表 (连续内存)</div>' +
                '<div class="lp-items">' + entries.map(function (e) { return '<span class="item key">' + e.field + '</span><span class="item">' + e.value + '</span>'; }).join('') + '</div>' +
                '</div></div>';
        } else {
            entryCountDisplay.textContent = struct.hashtable.used;
            visual.innerHTML = renderHashTable(struct.hashtable, { title: 'HashTable 编码 (不可逆)', color: '#059669' });
        }
    }

    function loadStructure() {
        HashAPI.getStructure().then(function (data) {
            renderHash(data);
            writeLog(logDom, '结构加载完成');
        });
    }

    document.getElementById('btnHset').addEventListener('click', function () {
        var field = document.getElementById('inputField').value;
        var value = document.getElementById('inputValue').value;
        HashAPI.hset(field, value).then(function (data) {
            renderHash(data.structure);
            var change = data.encoding_change;
            if (change) {
                showEncodingChange(encAlert, change);
                showDowngradeBlocked(blockedAlert, change);
                logEncodingChange(logDom, change, 'HSET');
            } else {
                writeLog(logDom, 'HSET ' + field + '="' + value + '" → 编码: ' + data.encoding);
            }
        });
    });

    document.getElementById('btnHdel').addEventListener('click', function () {
        var field = document.getElementById('inputField').value;
        HashAPI.hdel(field).then(function (data) {
            renderHash(data.structure);
            writeLog(logDom, 'HDEL ' + field);
        });
    });

    document.getElementById('btnHget').addEventListener('click', function () {
        var field = document.getElementById('inputField').value;
        HashAPI.hget(field).then(function (data) {
            writeLog(logDom, 'HGET ' + field + ' → ' + (data.value !== null ? data.value : '(nil)'));
        });
    });

    document.getElementById('btnBulkFill').addEventListener('click', function () {
        var count = parseInt(document.getElementById('inputBulkCount').value) || 130;
        HashAPI.bulkFill(count).then(function (data) {
            renderHash(data.structure);
            var change = data.encoding_change;
            if (change) {
                logEncodingChange(logDom, change, 'BULK_FILL');
            } else {
                writeLog(logDom, 'BULK_FILL 填充 ' + data.added + ' 个 field-value (目标: ' + data.target + ')');
            }
        });
    });

    document.getElementById('btnReset').addEventListener('click', function () {
        HashAPI.reset().then(function (data) {
            renderHash(data.structure);
            writeLog(logDom, '结构已重置');
        });
    });

    loadStructure();
})();
