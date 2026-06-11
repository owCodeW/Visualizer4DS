/**
 * 主页 — 页面脚本
 */
(function () {
    'use strict';

    // 编码标签配色 (与各类型 encodings 对应)
    var ENC_COLORS = {
        // Redis
        'int':        '#a78bfa',
        'embstr':     '#10b981',
        'raw':        '#ef4444',
        'listpack':   '#06b6d4',
        'quicklist':  '#3b82f6',
        'hashtable':  '#f59e0b',
        'int16':      '#fbbf24',
        'int32':      '#fb923c',
        'int64':      '#f97316',
        'skiplist':   '#dc2626',
        // 缓存三大问题
        'penetration': '#f97316',
        'breakdown':   '#eab308',
        'avalanche':   '#3b82f6',
        // 集群方案
        'replication': '#ef4444',
        'sentinel':    '#f59e0b',
        'cluster':     '#c084fc',
        'proxy':       '#8b5cf6',
        // 网络模型
        'reactor':      '#06b6d4',
        'multiplexing': '#3b82f6',
        'iothread':     '#8b5cf6',
        'eventloop':    '#f59e0b'
    };

    // 渲染编码标签 + 箭头
    function renderEncodings(encodings) {
        if (!encodings || encodings.length === 0) return '';
        var parts = [];
        encodings.forEach(function (enc, i) {
            if (i > 0) parts.push('<span class="enc-arrow">→</span>');
            var color = ENC_COLORS[enc] || '#94a3b8';
            parts.push('<span class="enc-tag" style="background:' + color + ';color:#fff;">' + enc + '</span>');
        });
        return parts.join('');
    }

    // 渲染单个分类板块
    function renderCategory(cat) {
        var activeTypes = cat.types.filter(function (t) { return t.status === 'active'; });
        var status = activeTypes.length > 0
            ? '<span class="category-status status-active">● ' + activeTypes.length + ' 已上线</span>'
            : '<span class="category-status status-planned">○ 规划中</span>';

        var typesHtml = cat.types.map(function (t) {
            var isActive = t.status === 'active' && t.page_path;
            if (!isActive) {
                return '<div class="type-card-placeholder">' + t.name + '<br><span style="font-size:11px;">(规划中)</span></div>';
            }
            return '<a class="type-card" href="' + t.page_path + '">' +
                '<div class="type-card-icon" style="background:' + (t.color || cat.color) + ';">' + (t.icon || t.name[0]) + '</div>' +
                '<div class="type-card-name">' + t.name + '</div>' +
                '<div class="type-card-desc">' + t.description + '</div>' +
                '<div class="type-card-encodings">' + renderEncodings(t.encodings) + '</div>' +
                '</a>';
        }).join('');

        return '<div class="category-section">' +
            '<div class="category-header">' +
            '<div class="category-icon" style="background:' + cat.color + ';">' + (cat.icon || cat.name[0].toUpperCase()) + '</div>' +
            '<div class="category-title-block">' +
            '<h2 class="category-name">' + cat.display_name +
            '<span class="category-version">' + (cat.version || '') + '</span></h2>' +
            '<p class="category-desc">' + cat.description + '</p>' +
            '</div>' +
            status +
            '</div>' +
            '<div class="type-cards">' + typesHtml + '</div>' +
            '</div>';
    }

    // 加载并渲染
    function loadHome() {
        CategoryAPI.list().then(function (data) {
            var container = document.getElementById('categoryList');
            container.innerHTML = data.categories.map(renderCategory).join('');

            // 统计
            var totalTypes = data.categories.reduce(function (s, c) { return s + c.types.length; }, 0);
            var totalPlanned = data.categories.reduce(function (s, c) {
                return s + c.types.filter(function (t) { return t.status !== 'active'; }).length;
            }, 0);
            document.getElementById('statCategories').textContent = data.categories.length;
            document.getElementById('statTypes').textContent = totalTypes;
            document.getElementById('statPlanned').textContent = totalPlanned;
        }).catch(function (e) {
            document.getElementById('categoryList').innerHTML =
                '<div class="category-section" style="color:#dc2626;">加载失败: ' + e.message + '</div>';
        });
    }

    loadHome();
})();
