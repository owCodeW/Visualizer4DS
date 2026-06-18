/**
 * 日志触发状态变化模块
 * 从 日志触发.html 提取，供 sql_execution.html 嵌入使用
 *
 * 用法:
 *   const ctrl = initLogTrigger(containerEl, options);
 *   ctrl.advance();       // 推进一步
 *   ctrl.reset();         // 重置
 *   ctrl.simulateCrash(); // 模拟宕机
 *   ctrl.getCurrentStep(); // 获取当前步骤索引
 *   ctrl.getTotalSteps();  // 获取总步骤数
 */

function initLogTrigger(containerEl, options) {
    const {
        tableName = 't',
        beforeValue = 'c=10',
        afterValue = 'c=11',
        sqlText = 'UPDATE t SET c=c+1 WHERE id=1',
        compact = true  // 嵌入模式使用紧凑样式
    } = options || {};

    // 生成步骤数据
    const stepList = buildStepList(tableName, beforeValue, afterValue, sqlText);

    let currentStep = 0;

    // 渲染HTML结构
    containerEl.innerHTML = buildHTML(compact);

    // 缓存DOM
    const dom = {
        statusText: containerEl.querySelector('.lt-status'),
        stepDesc: containerEl.querySelector('.lt-step-desc'),
        crashTip: containerEl.querySelector('.lt-crash-alert'),
        undoContent: containerEl.querySelector('.lt-undo-content'),
        poolContent: containerEl.querySelector('.lt-pool-content'),
        redoMemContent: containerEl.querySelector('.lt-redo-mem-content'),
        binMemContent: containerEl.querySelector('.lt-bin-mem-content'),
        redoDiskContent: containerEl.querySelector('.lt-redo-disk-content'),
        binDiskContent: containerEl.querySelector('.lt-bin-disk-content'),
        dataDiskContent: containerEl.querySelector('.lt-data-disk-content'),
        modules: containerEl.querySelectorAll('.lt-module'),
    };

    // 渲染初始状态
    renderStep(0);

    // ---- 内部函数 ----

    function buildStepList(table, before, after, sql) {
        return [
            {
                title: '阶段0：修改前 - 原始初始状态',
                desc: '未执行任何写入SQL，数据、日志均为出厂原始状态。<br>原始数据：id=1，' + before + '；所有内存缓冲区、磁盘日志无内容。',
                crash: false,
                active: [],
                undo: '暂无数据',
                pool: 'id=1, ' + before,
                redoMem: '暂无日志',
                binMem: '暂无日志',
                redoDisk: '暂无日志',
                binDisk: '暂无日志',
                dataDisk: 'id=1, ' + before
            },
            {
                title: '阶段1：写入 Undo 缓冲区（备份旧数据）',
                desc: '执行写入前，先把旧数据写入Undo内存，用于回滚与MVCC。<br>【宕机后果】仅内存写入，磁盘无变更，重启事务丢弃，数据保持原值 ' + before + '。',
                crash: true,
                active: ['undo'],
                undo: '旧数据备份：id=1, ' + before + ' <span class="lt-highlight">新增</span>',
                pool: 'id=1, ' + before,
                redoMem: '暂无日志',
                binMem: '暂无日志',
                redoDisk: '暂无日志',
                binDisk: '暂无日志',
                dataDisk: 'id=1, ' + before
            },
            {
                title: '阶段2：修改缓冲池 + Redo 刷盘(PREPARE)',
                desc: 'Buffer Pool 数据更新，产生脏页；Redo写入内存并强制落盘，标记PREPARE。<br>【宕机后果】Redo已落盘、Binlog为空，重启执行Undo回滚，数据恢复 ' + before + '。',
                crash: true,
                active: ['pool', 'redoMem', 'redoDisk'],
                undo: '旧数据备份：id=1, ' + before,
                pool: 'id=1, ' + after + ' <span class="lt-tag lt-tag-dirty">脏页</span> <span class="lt-highlight">已修改</span>',
                redoMem: '物理日志：' + sql + ' <span class="lt-highlight">新增</span>',
                binMem: '暂无日志',
                redoDisk: '物理日志：' + sql + ' <span class="lt-tag lt-tag-prepare">PREPARE</span> <span class="lt-highlight">磁盘落盘</span>',
                binDisk: '暂无日志',
                dataDisk: 'id=1, ' + before
            },
            {
                title: '阶段3：Binlog 写入缓存并刷入磁盘',
                desc: 'Server层生成逻辑Binlog，先写入内存缓存，再强制刷到磁盘。<br>【宕机后果】Binlog已落盘、Redo仍为PREPARE，重启自动补提交，数据 ' + after + ' 生效。',
                crash: true,
                active: ['binMem', 'binDisk'],
                undo: '旧数据备份：id=1, ' + before,
                pool: 'id=1, ' + after + ' <span class="lt-tag lt-tag-dirty">脏页</span>',
                redoMem: '物理日志：' + sql,
                binMem: '逻辑日志：' + sql + ' <span class="lt-highlight">新增</span>',
                redoDisk: '物理日志：' + sql + ' <span class="lt-tag lt-tag-prepare">PREPARE</span>',
                binDisk: '逻辑日志：' + sql + ' <span class="lt-highlight">磁盘落盘</span>',
                dataDisk: 'id=1, ' + before
            },
            {
                title: '阶段4：Redo 标记 COMMIT，事务提交',
                desc: 'Binlog落盘完成，修改Redo状态为COMMIT，事务正式提交，客户端收到成功响应。',
                crash: false,
                active: ['redoDisk'],
                undo: '旧数据备份：id=1, ' + before,
                pool: 'id=1, ' + after + ' <span class="lt-tag lt-tag-dirty">脏页</span>',
                redoMem: '物理日志：' + sql,
                binMem: '逻辑日志：' + sql,
                redoDisk: '物理日志：' + sql + ' <span class="lt-tag lt-tag-commit">COMMIT</span> <span class="lt-highlight">状态更新</span>',
                binDisk: '逻辑日志：' + sql,
                dataDisk: 'id=1, ' + before
            },
            {
                title: '阶段5：后台异步刷脏页，数据最终落盘',
                desc: '脏页由后台线程异步刷入物理磁盘，数据永久持久化。<br>【宕机后果】所有日志已落盘，重启重放Redo恢复数据，最终保持 ' + after + '。',
                crash: true,
                active: ['dataDisk'],
                undo: '旧数据备份：id=1, ' + before,
                pool: 'id=1, ' + after,
                redoMem: '物理日志：' + sql,
                binMem: '逻辑日志：' + sql,
                redoDisk: '物理日志：' + sql + ' <span class="lt-tag lt-tag-commit">COMMIT</span>',
                binDisk: '逻辑日志：' + sql,
                dataDisk: 'id=1, ' + after + ' <span class="lt-highlight">最终持久化</span>'
            }
        ];
    }

    function buildHTML(isCompact) {
        const cls = isCompact ? ' lt-compact' : '';
        // 样式只注入一次
        let styleTag = '';
        if (!document.getElementById('lt-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'lt-styles';
            styleEl.textContent = buildStyles(isCompact);
            document.head.appendChild(styleEl);
        }
        return `
        <div class="lt-root${cls}">
            <div class="lt-status" id="ltStatus">初始状态：SQL 未执行，所有数据/日志为原始值</div>
            <div class="lt-wrapper">
                <div class="lt-area lt-memory">
                    <div class="lt-area-title">内存区域</div>
                    <div class="lt-module" data-id="undo">
                        <div class="lt-module-title">Undo 缓冲区</div>
                        <div class="lt-content lt-undo-content">暂无数据</div>
                    </div>
                    <div class="lt-module" data-id="pool">
                        <div class="lt-module-title">Buffer Pool 缓冲池</div>
                        <div class="lt-content lt-pool-content">id=1, ${beforeValue}</div>
                    </div>
                    <div class="lt-module" data-id="redoMem">
                        <div class="lt-module-title">Redo Log Buffer</div>
                        <div class="lt-content lt-redo-mem-content">暂无日志</div>
                    </div>
                    <div class="lt-module" data-id="binMem">
                        <div class="lt-module-title">Binlog Cache</div>
                        <div class="lt-content lt-bin-mem-content">暂无日志</div>
                    </div>
                </div>
                <div class="lt-area lt-disk">
                    <div class="lt-area-title">磁盘区域</div>
                    <div class="lt-module" data-id="redoDisk">
                        <div class="lt-module-title">Redo Log 磁盘文件</div>
                        <div class="lt-content lt-redo-disk-content">暂无日志</div>
                    </div>
                    <div class="lt-module" data-id="binDisk">
                        <div class="lt-module-title">Binlog 磁盘文件</div>
                        <div class="lt-content lt-bin-disk-content">暂无日志</div>
                    </div>
                    <div class="lt-module" data-id="dataDisk">
                        <div class="lt-module-title">物理数据磁盘</div>
                        <div class="lt-content lt-data-disk-content">id=1, ${beforeValue}</div>
                    </div>
                </div>
            </div>
            <div class="lt-crash-alert" id="ltCrashTip">当前阶段发生宕机</div>
            <div class="lt-step-desc" id="ltStepDesc">
                【初始状态】未执行写入语句。<br>
                原始数据：id=1，${beforeValue}；所有日志缓冲区、磁盘日志均为空。
            </div>
        </div>`;
    }

    function buildStyles(isCompact) {
        const base = `
        .lt-root { font-size: 13px; }
        .lt-status { text-align: center; color: #666; margin-bottom: 8px; font-size: 13px; font-weight: 600; min-height: 20px; }
        .lt-wrapper { display: flex; gap: 10px; margin-bottom: 8px; }
        .lt-area { flex: 1; border: 2px solid #409eff; border-radius: 6px; padding: 8px; background: #f0f7ff; }
        .lt-area.lt-disk { border-color: #67c23a; background: #f4fcf0; }
        .lt-area-title { font-size: 12px; font-weight: bold; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px dashed #ccc; }
        .lt-module { border: 1px solid #999; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px; background: #fff; transition: all 0.3s ease; }
        .lt-module.active { border-color: #e64340; background: #ffe9e9; transform: scale(1.02); }
        .lt-module-title { font-weight: bold; font-size: 11px; color: #333; margin-bottom: 3px; }
        .lt-content { font-size: 12px; line-height: 1.6; color: #444; }
        .lt-highlight { color: #e64340; font-weight: bold; }
        .lt-tag { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 10px; color: #fff; }
        .lt-tag-prepare { background: #e6a23c; }
        .lt-tag-commit { background: #67c23a; }
        .lt-tag-dirty { background: #9c88ff; }
        .lt-crash-alert { background: #f56c6c; color: #fff; padding: 6px 10px; border-radius: 4px; margin: 6px 0; display: none; font-weight: bold; font-size: 12px; }
        .lt-step-desc { background: #2c3e50; color: #fff; padding: 10px; border-radius: 4px; font-size: 12px; line-height: 1.6; }
        `;
        if (isCompact) {
            return base + `
            .lt-compact .lt-wrapper { gap: 6px; }
            .lt-compact .lt-area { padding: 6px; }
            .lt-compact .lt-module { padding: 4px 6px; margin-bottom: 4px; }
            .lt-compact .lt-module-title { font-size: 10px; }
            .lt-compact .lt-content { font-size: 11px; line-height: 1.4; }
            .lt-compact .lt-step-desc { padding: 8px; font-size: 11px; }
            `;
        }
        return base;
    }

    function clearActive() {
        dom.modules.forEach(el => el.classList.remove('active'));
        dom.crashTip.style.display = 'none';
    }

    function renderStep(idx) {
        clearActive();
        const s = stepList[idx];

        dom.statusText.textContent = s.title;
        dom.stepDesc.innerHTML = s.desc;
        dom.crashTip.style.display = s.crash ? 'block' : 'none';

        // 模块高亮
        s.active.forEach(id => {
            const el = containerEl.querySelector(`.lt-module[data-id="${id}"]`);
            if (el) el.classList.add('active');
        });

        // 刷新内容
        dom.undoContent.innerHTML = s.undo;
        dom.poolContent.innerHTML = s.pool;
        dom.redoMemContent.innerHTML = s.redoMem;
        dom.binMemContent.innerHTML = s.binMem;
        dom.redoDiskContent.innerHTML = s.redoDisk;
        dom.binDiskContent.innerHTML = s.binDisk;
        dom.dataDiskContent.innerHTML = s.dataDisk;
    }

    // ---- 公开接口 ----

    function advance() {
        if (currentStep < stepList.length - 1) {
            currentStep++;
            renderStep(currentStep);
            return true;
        }
        return false; // 已到最后一步
    }

    function reset() {
        currentStep = 0;
        renderStep(0);
    }

    function simulateCrash() {
        const s = stepList[currentStep];
        if (s && s.crash) {
            dom.crashTip.style.display = 'block';
            const crashInfo = s.desc.split('【宕机后果】')[1];
            const crashText = crashInfo ? crashInfo.split('<br>')[0] : '数据可能丢失';
            dom.crashTip.innerHTML = '当前阶段发生宕机 — ' + crashText;
        } else if (s) {
            dom.crashTip.style.display = 'block';
            dom.crashTip.innerHTML = '当前阶段发生宕机 — 此阶段已提交，数据安全';
        }
    }

    function getCurrentStep() {
        return currentStep;
    }

    function getTotalSteps() {
        return stepList.length;
    }

    function isComplete() {
        return currentStep >= stepList.length - 1;
    }

    return {
        advance,
        reset,
        simulateCrash,
        getCurrentStep,
        getTotalSteps,
        isComplete
    };
}
