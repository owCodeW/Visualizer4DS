/**
 * Redis 集群方案 — 页面脚本
 */
(function () {
    'use strict';

    // 背景粒子生成
    (function () {
        var container = document.getElementById('bgParticles');
        var colors = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#34d399', '#60a5fa'];
        for (var i = 0; i < 35; i++) {
            var particle = document.createElement('div');
            particle.classList.add('bg-particle');
            var size = Math.random() * 3 + 1.5;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
            particle.style.animationDelay = Math.random() * 15 + 's';
            container.appendChild(particle);
        }
    })();

    // Tab切换逻辑
    var tabBtns = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.scheme-panel');
    var contentArea = document.getElementById('contentArea');

    tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var scheme = this.getAttribute('data-scheme');
            tabBtns.forEach(function (b) { b.classList.remove('active'); });
            this.classList.add('active');
            panels.forEach(function (p) { p.classList.remove('active'); });
            var targetPanel = document.getElementById('panel-' + scheme);
            if (targetPanel) {
                targetPanel.classList.add('active');
                var svgs = targetPanel.querySelectorAll('svg');
                svgs.forEach(function (svg) {
                    var clone = svg.cloneNode(true);
                    svg.parentNode.replaceChild(clone, svg);
                });
            }
            if (window.innerWidth < 768) {
                contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            history.replaceState(null, null, '#' + scheme);
        });
    });

    // 页面加载时检查URL hash
    function loadFromHash() {
        var hash = window.location.hash.replace('#', '');
        if (hash && ['replication', 'sentinel', 'cluster', 'proxy'].indexOf(hash) !== -1) {
            var btn = document.querySelector('[data-scheme="' + hash + '"]');
            if (btn) btn.click();
        }
    }
    loadFromHash();
    window.addEventListener('hashchange', loadFromHash);

    // 键盘导航
    document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            var activeBtn = document.querySelector('.tab-btn.active');
            if (!activeBtn) return;
            var allBtns = Array.from(tabBtns);
            var idx = allBtns.indexOf(activeBtn);
            var nextIdx;
            if (e.key === 'ArrowRight') {
                nextIdx = (idx + 1) % allBtns.length;
            } else {
                nextIdx = (idx - 1 + allBtns.length) % allBtns.length;
            }
            allBtns[nextIdx].click();
        }
    });
})();
