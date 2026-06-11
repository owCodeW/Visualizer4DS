/**
 * Redis Set 页面脚本
 */
(function () {
    'use strict';

    document.getElementById('navBar').innerHTML = createNavBar();
    document.getElementById('encodingPath').innerHTML = createEncodingPath([
        { label: 'int16', cls: 'enc-intset' },
        { label: 'int32', cls: 'enc-intset' },
        { label: 'int64', cls: 'enc-intset' },
        { label: 'hashtable', cls: 'enc-hashtable' }
    ]);
    document.getElementById('irreversibleBar').innerHTML = createIrreversibleBar(
        'int16 → int32 → int64 → hashtable',
        'Set 编码只升级不降级: int16→int32→int64 不可逆，intset→hashtable 也不可逆'
    );

    var codeContent = '\
        <h3>1. IntSet 结构体</h3>\
<pre>\
typedef struct intset {\
    <span class="highlight">uint32_t encoding</span>;  /* INT16/INT32/INT64 */\
    <span class="highlight">uint32_t length</span>;    /* 元素数量 */\
    <span class="highlight">int8_t contents[]</span>; /* 有序整数数组 */\
} intset;\
</pre>\
        <h3>2. 编码升级规则（只升级不降级）</h3>\
<pre>\
<span class="comment">// 元素值范围决定编码:</span>\
int16: <span class="highlight">-32768 ~ 32767</span>  (2 bytes)\
int32: <span class="highlight">-2147483648 ~ 2147483647</span>  (4 bytes)\
int64: <span class="highlight">-9.2e18 ~ 9.2e18</span>  (8 bytes)\
\
<span class="comment">// 新元素超出当前范围 → 升级编码</span>\
<span class="comment">// 升级不可逆! 不会降级!</span>\
<span class="comment">// 即使删除大元素，int64 也不会降回 int32</span>\
</pre>\
        <h3>3. Set 编码切换规则（只升级不降级）</h3>\
<pre>\
<span class="comment">// 全部为整数且数量 ≤ 512:</span>\
    → <span class="keyword">intset</span> 编码\
\
<span class="comment">// 包含非整数 或 数量 > 512:</span>\
    → <span class="keyword">hashtable</span> 编码\
\
<span class="comment">// intset → hashtable 不可逆!</span>\
<span class="comment">// 即使删到只剩几个整数，也不会降回 intset</span>\
</pre>';

    document.getElementById('codeBtnContainer').innerHTML = createCodePanel('setCode');
    setTimeout(function () {
        var panel = document.getElementById('setCode-panel');
        var mask = document.getElementById('setCode-mask');
        if (panel && mask) {
            document.body.appendChild(mask);
            document.body.appendChild(panel);
            document.getElementById('setCode-body').innerHTML = codeContent;
        }
    }, 0);

    var logDom = document.getElementById('operLog');
    var encDisplay = document.getElementById('encDisplay');
    var intEncDisplay = document.getElementById('intEncoding');
    var entryCountDisplay = document.getElementById('entryCount');
    var encAlert = document.getElementById('encAlert');
    var blockedAlert = document.getElementById('blockedAlert');

    function getEncClass(enc) {
        return enc === 'intset' ? 'enc-intset' : 'enc-hashtable';
    }

    function renderSet(struct) {
        var visual = document.getElementById('setVisual');
        encDisplay.textContent = struct.current_encoding;
        encDisplay.className = 'enc-value ' + getEncClass(struct.current_encoding);

        if (struct.current_encoding === 'intset') {
            intEncDisplay.textContent = struct.int_encoding;
            entryCountDisplay.textContent = struct.entry_count;
            var contents = struct.contents || [];
            visual.innerHTML = '<div class="intset-visual">' +
                '<div class="intset-title">IntSet (' + struct.int_encoding + ' 编码)</div>' +
                '<div class="struct-fields">• encoding = ' + struct.int_encoding + '<br>• length = ' + struct.entry_count + '<br>• bytes_per_entry = ' + struct.bytes_per_entry + ' bytes<br>• total_bytes = ' + struct.total_bytes + ' bytes</div>' +
                renderIntSetBuf(contents, struct.bytes_per_entry, struct.int_encoding) +
                '</div>' +
                '<div style="margin-top:12px;font-size:13px;color:#666;">编码范围: int16[' + struct.encoding_ranges.int16.min + '~' + struct.encoding_ranges.int16.max + ']</div>';
        } else {
            intEncDisplay.textContent = '-';
            entryCountDisplay.textContent = struct.hashtable.used;
            visual.innerHTML = renderHashTable(struct.hashtable, { title: 'HashTable 编码 (不可逆)', color: '#059669', showValue: false });
        }
    }

    function loadStructure() {
        SetAPI.getStructure().then(function (data) {
            renderSet(data);
            writeLog(logDom, '结构加载完成');
        });
    }

    document.getElementById('btnSadd').addEventListener('click', function () {
        var value = document.getElementById('inputValue').value;
        SetAPI.sadd(value).then(function (data) {
            renderSet(data.structure);
            var change = data.encoding_change;
            if (change) {
                showEncodingChange(encAlert, change);
                showDowngradeBlocked(blockedAlert, change);
                logEncodingChange(logDom, change, 'SADD');
            } else {
                writeLog(logDom, 'SADD "' + value + '" → 编码: ' + data.encoding);
            }
        });
    });

    document.getElementById('btnSrem').addEventListener('click', function () {
        var value = document.getElementById('inputValue').value;
        SetAPI.srem(value).then(function (data) {
            renderSet(data.structure);
            writeLog(logDom, 'SREM "' + value + '"');
        });
    });

    document.getElementById('btnBulkFill').addEventListener('click', function () {
        var count = parseInt(document.getElementById('inputBulkCount').value) || 520;
        SetAPI.bulkFill(count).then(function (data) {
            renderSet(data.structure);
            var change = data.encoding_change;
            if (change) {
                logEncodingChange(logDom, change, 'BULK_FILL');
            } else {
                writeLog(logDom, 'BULK_FILL 填充 ' + data.added + ' 个元素 (目标: ' + data.target + ')');
            }
        });
    });

    document.getElementById('btnReset').addEventListener('click', function () {
        SetAPI.reset().then(function (data) {
            renderSet(data.structure);
            writeLog(logDom, '结构已重置');
        });
    });

    loadStructure();
})();
