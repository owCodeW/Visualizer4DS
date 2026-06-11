/**
 * Redis 缓存三大问题 — 页面级脚本
 */
(function () {
    'use strict';

    // 注入项目导航栏 (与其它 Redis 页面保持一致)
    var navBar = document.getElementById('navBar');
    if (navBar && typeof createNavBar === 'function') {
        navBar.innerHTML = createNavBar();
    }
})();
