/**
 * Redis String (SDS) 页面脚本
 */
(function () {
    'use strict';

    document.getElementById('navBar').innerHTML = createNavBar();
    document.getElementById('encodingPath').innerHTML = createEncodingPath([
        { label: 'int', cls: 'enc-int' },
        { label: 'embstr', cls: 'enc-embstr' },
        { label: 'raw', cls: 'enc-raw' }
    ]);
    document.getElementById('irreversibleBar').innerHTML = createIrreversibleBar(
        'int → embstr → raw',
        'String 编码只升级不降级: 即使值变回短字符串，raw 也不会降回 embstr'
    );

    // 源码内容
    var codeContent = '\
        <h3>1. redisObject 结构体</h3>\
<pre>\
typedef struct redisObject {\
    <span class="highlight">unsigned type:4</span>;        /* 对象类型 OBJ_STRING=0 */\
    <span class="highlight">unsigned encoding:4</span>;    /* 编码方式 */\
    <span class="highlight">unsigned lru:24</span>;        /* LRU 时间 */\
    <span class="highlight">int refcount</span>;           /* 引用计数 */\
    <span class="highlight">void *ptr</span>;              /* 指向底层数据 */\
} robj;\
</pre>\
        <h3>2. SDS 结构体 (sdshdr8)</h3>\
<pre>\
struct __attribute__((__packed__)) sdshdr8 {\
    <span class="highlight">uint8_t len</span>;        /* 已使用长度 */\
    <span class="highlight">uint8_t alloc</span>;      /* 总分配长度 */\
    <span class="highlight">unsigned char flags</span>; /* 3 lsb of type */\
    <span class="highlight">char buf[]</span>;         /* 数据缓冲区 */\
};\
</pre>\
        <h3>3. 三种编码说明（只升级不降级）</h3>\
<pre>\
<span class="keyword">int</span>    : ptr 直接存整数值，不分配 SDS\
<span class="keyword">embstr</span> : SDS+robj 一次分配，连续内存\
         长度 ≤ <span class="highlight">44</span> 字节\
<span class="keyword">raw</span>    : SDS+robj 分开分配\
         长度 > <span class="highlight">44</span> 字节\
\
<span class="comment">// 核心规则: 编码只升级不降级!</span>\
<span class="comment">// int → embstr → raw 单向不可逆</span>\
<span class="comment">// 即使值变回短字符串，raw 也不会降回 embstr</span>\
</pre>';

    // 渲染源码按钮和面板
    var btnContainer = document.getElementById('codeBtnContainer');
    btnContainer.innerHTML = createCodePanel('stringCode');
    setTimeout(function () {
        var panel = document.getElementById('stringCode-panel');
        var mask = document.getElementById('stringCode-mask');
        if (panel && mask) {
            document.body.appendChild(mask);
            document.body.appendChild(panel);
            document.getElementById('stringCode-body').innerHTML = codeContent;
        }
    }, 0);

    var logDom = document.getElementById('operLog');
    var encDisplay = document.getElementById('encDisplay');
    var maxEncDisplay = document.getElementById('maxEncDisplay');
    var byteLenDisplay = document.getElementById('byteLen');
    var sdsFields = document.getElementById('sdsFields');
    var sdsBuf = document.getElementById('sdsBuf');
    var encAlert = document.getElementById('encAlert');
    var blockedAlert = document.getElementById('blockedAlert');

    function getEncClass(enc) {
        var map = { 'int': 'enc-int', 'embstr': 'enc-embstr', 'raw': 'enc-raw' };
        return map[enc] || 'enc-int';
    }

    function updateView(data) {
        var struct = data.structure || data;
        var enc = struct.encoding;
        var maxEnc = struct.max_encoding || enc;
        var value = struct.value || '';
        var byteLen = struct.byte_len || 0;

        encDisplay.textContent = enc;
        encDisplay.className = 'enc-value ' + getEncClass(enc);
        maxEncDisplay.textContent = maxEnc;
        maxEncDisplay.className = 'enc-value ' + getEncClass(maxEnc);
        byteLenDisplay.textContent = byteLen;

        sdsFields.innerHTML = '\
            • len = ' + byteLen + '<br>\
            • alloc = ' + (struct.alloc || byteLen) + '<br>\
            • flags = sds_type<br>\
            • encoding = <span style="color:' + (enc === 'int' ? '#3b82f6' : enc === 'embstr' ? '#10b981' : '#ef4444') + ';font-weight:bold;">' + enc + '</span><br>\
            • max_encoding = <span style="color:#dc2626;font-weight:bold;">' + maxEnc + '</span>（不可逆）\
        ';
        if (enc === 'int') {
            sdsBuf.innerHTML = '<div class="sds-buf-inner sds-buf-int">int64_t value = ' + escapeHtml(value) + ' &nbsp;(<code>ptr</code> 直接存储, 不分配 SDS)</div>';
        } else {
            sdsBuf.innerHTML = renderSdsBuf(value, struct.alloc || byteLen);
        }

        var change = data.result ? data.result.encoding_change : data.encoding_change;
        if (change) {
            showEncodingChange(encAlert, change);
            showDowngradeBlocked(blockedAlert, change);
            logEncodingChange(logDom, change, 'String');
        }
    }

    function loadStructure() {
        StringAPI.getStructure().then(function (data) {
            updateView(data);
            writeLog(logDom, '结构加载完成');
        });
    }

    document.getElementById('btnSet').addEventListener('click', function () {
        var value = document.getElementById('inputValue').value;
        StringAPI.set(value).then(function (data) {
            updateView(data);
            var change = data.result ? data.result.encoding_change : undefined;
            if (!change) {
                writeLog(logDom, 'SET "' + value + '" → 编码: ' + (data.structure ? data.structure.encoding : '') + ' (不变)');
            }
        });
    });

    document.getElementById('btnAppend').addEventListener('click', function () {
        var value = document.getElementById('inputAppend').value;
        StringAPI.append(value).then(function (data) {
            if (data.result && data.result.error) {
                writeLog(logDom, '错误: ' + data.result.error, 'blocked');
                return;
            }
            updateView(data);
            var change = data.result ? data.result.encoding_change : undefined;
            if (!change) {
                writeLog(logDom, 'APPEND "' + value + '" → 编码: ' + (data.structure ? data.structure.encoding : ''));
            }
        });
    });

    document.getElementById('btnIncr').addEventListener('click', function () {
        StringAPI.incr().then(function (data) {
            if (data.result && data.result.error) {
                writeLog(logDom, '错误: ' + data.result.error, 'blocked');
                return;
            }
            updateView(data);
            writeLog(logDom, 'INCR → 值: ' + (data.structure ? data.structure.value : ''));
        });
    });

    document.getElementById('btnReset').addEventListener('click', function () {
        StringAPI.reset().then(function (data) {
            updateView(data);
            writeLog(logDom, '结构已重置');
        });
    });

    loadStructure();
})();
