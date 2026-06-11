/**
 * Redis 网络模型 — 页面脚本
 */
(function () {
    'use strict';

    // Tab 切换
    document.querySelectorAll('.network-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.network-tab').forEach(function (t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
            tab.classList.add('active');
            document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        });
    });

    // 导航栏加载
    fetch('/api/categories').then(function (r) { return r.json(); }).then(function (data) {
        var nav = document.getElementById('navBar');
        if (!nav) return;
        var html = '<div class="nav-bar">';
        data.categories.forEach(function (cat) {
            cat.types.forEach(function (t) {
                var cls = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                var isActive = t.status === 'active' && t.page_path;
                html += isActive
                    ? '<a class="' + cls + '" href="' + t.page_path + '">' + t.name + '</a>'
                    : '<a class="' + cls + '" style="opacity:0.4;cursor:not-allowed;">' + t.name + '</a>';
            });
            html += '<span class="nav-sep">|</span>';
        });
        html += '</div>';
        nav.innerHTML = html;
    }).catch(function () {});
})();
