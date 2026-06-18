/**
 * MySQL MVCC — 页面脚本
 * 基于 MVCC 隔离级别与 Read View 机制详解文档增强
 * 布局结构: 左侧 grid(时间轴 + 事务列) + 右侧版本链
 */
(function () {
    'use strict';

    document.getElementById('navBar').innerHTML = createNavBar();

    // ===================== 场景数据模型 =====================
    var SCENES = {
        base: {
            name: "基础MVCC",
            isoSupport: true,
            timeline: [
                {
                    time: "T0", actions: {
                        "A": { type: "INIT", desc: "基线数据: id=1,age=20, 无活跃事务", trxId: null },
                        "B": { type: "INIT", desc: "未启动", trxId: null }
                    }
                },
                {
                    time: "T1", actions: {
                        "A": { type: "BEGIN", trxId: 100, active: true, desc: "BEGIN; 开启事务, 未分配trx_id, 不生成Undo, 无快照" },
                        "B": { type: "BEGIN", trxId: null, active: true, desc: "BEGIN; 懒加载: 不创建ReadView, 无快照, 不分配事务ID" }
                    }
                },
                {
                    time: "T2", actions: {
                        "A": { type: "UPDATE", newVal: "age=21", trxId: 100, desc: "UPDATE t SET age=21; 分配trx_id=100, 写入隐藏列, 生成Undo(age=20), 未COMMIT", commitAfter: false },
                        "B": { type: "IDLE", desc: "无操作, 无快照", trxId: null }
                    }
                },
                {
                    time: "T3", actions: {
                        "A": { type: "IDLE", desc: "保持未提交, trx_id=100仍活跃", trxId: 100 },
                        "B": { type: "SELECT", value: "首次快照读", trxId: null, readView: { m_ids: [100], min_trx: 100, max_trx: 101, creator: null }, desc: "SELECT age FROM t WHERE id=1; 懒加载触发: 首次SELECT新建ReadView, 活跃列表[100], 行trx_id=100属活跃事务, 走Undo回溯旧镜像", result: "20" }
                    }
                },
                {
                    time: "T4", actions: {
                        "A": { type: "COMMIT", trxId: 100, desc: "COMMIT; trx_id=100从活跃列表移除, 修改持久化" },
                        "B": { type: "IDLE", desc: "RC: 原有ReadView销毁; RR: 旧ReadView完全保留不刷新", trxId: null }
                    }
                },
                {
                    time: "T5", actions: {
                        "A": { type: "IDLE", desc: "已提交, 最新数据age=21", trxId: null },
                        "B": { type: "SELECT", value: "再次快照读", trxId: null, readViewRepeat: true, desc: "SELECT age FROM t WHERE id=1; RC: 重建ReadView, 活跃列表空, 直接读最新→21(不可重复读); RR: 复用T3快照, 仍认为100活跃, 走Undo→20(规避不可重复读)", rcResult: "21", rrResult: "20" }
                    }
                }
            ],
            initialVersionChain: { data: "age=20", trx_id: 99, roll_ptr: null }
        },

        rcrr: {
            name: "RC vs RR 不可重复读对比",
            isoSupport: true,
            timeline: [
                {
                    time: "T0", actions: {
                        "A": { type: "INIT", desc: "基线数据: id=1,age=40", trxId: null },
                        "B": { type: "INIT", desc: "未启动", trxId: null }
                    }
                },
                {
                    time: "T1", actions: {
                        "A": { type: "BEGIN", trxId: 200, active: true, desc: "BEGIN; 写事务 trx_id=200" },
                        "B": { type: "BEGIN", trxId: null, active: true, desc: "BEGIN; 只读事务, 懒加载" }
                    }
                },
                {
                    time: "T2", actions: {
                        "A": { type: "IDLE", desc: "未操作", trxId: 200 },
                        "B": { type: "SELECT", value: "首次读(age=40)", trxId: null, readView: { m_ids: [200], min_trx: 200, max_trx: 201, creator: null }, desc: "首次SELECT新建ReadView, 活跃列表[200], 行trx_id=199<min_trx→可见", result: "40" }
                    }
                },
                {
                    time: "T3", actions: {
                        "A": { type: "UPDATE", newVal: "age=45", trxId: 200, desc: "UPDATE t SET age=45; trx_id=200写入行, 生成Undo(age=40)", commitAfter: true },
                        "B": { type: "IDLE", desc: "无操作", trxId: null }
                    }
                },
                {
                    time: "T4", actions: {
                        "A": { type: "COMMIT", trxId: 200, desc: "COMMIT; trx_id=200移出活跃列表" },
                        "B": { type: "IDLE", desc: "无操作", trxId: null }
                    }
                },
                {
                    time: "T5", actions: {
                        "A": { type: "IDLE", desc: "已提交, age=45", trxId: null },
                        "B": { type: "SELECT", value: "再次读(不可重复读演示)", trxId: null, readViewRepeat: true, desc: "RC: 重建ReadView, 活跃列表空, 直接读最新→45(不可重复读!); RR: 复用T2快照, 200仍在m_ids中, 走Undo→40(一致)", rcResult: "45", rrResult: "40" }
                    }
                }
            ],
            initialVersionChain: { data: "age=40", trx_id: 199, roll_ptr: null }
        },

        phantom: {
            name: "幻读 + 当前读对比",
            isoSupport: true,
            timeline: [
                {
                    time: "T0", actions: {
                        "A": { type: "INIT", desc: "基线数据: id=1,age=20", trxId: null },
                        "B": { type: "INIT", desc: "未启动", trxId: null }
                    }
                },
                {
                    time: "T1", actions: {
                        "A": { type: "BEGIN", trxId: 300, active: true, desc: "BEGIN; 写事务 trx_id=300" },
                        "B": { type: "BEGIN", trxId: null, active: true, desc: "BEGIN; 只读事务, 懒加载" }
                    }
                },
                {
                    time: "T2", actions: {
                        "A": { type: "IDLE", desc: "未操作", trxId: 300 },
                        "B": { type: "SELECT", value: "范围快照读(age>10)", trxId: null, readView: { m_ids: [300], min_trx: 300, max_trx: 301, creator: null }, desc: "首次SELECT新建ReadView, 活跃列表[300], 查到1行(id=1)", result: "1行(id=1)" }
                    }
                },
                {
                    time: "T3", actions: {
                        "A": { type: "INSERT", newVal: "id=2,age=22", trxId: 300, desc: "INSERT INTO t(id,age) VALUES(2,22); 新行trx_id=300", commitAfter: true },
                        "B": { type: "IDLE", desc: "无操作", trxId: null }
                    }
                },
                {
                    time: "T4", actions: {
                        "A": { type: "COMMIT", trxId: 300, desc: "COMMIT; 新行id=2已持久化" },
                        "B": { type: "IDLE", desc: "无操作", trxId: null }
                    }
                },
                {
                    time: "T5", actions: {
                        "A": { type: "IDLE", desc: "已提交", trxId: null },
                        "B": { type: "SELECT", value: "再次范围快照读(age>10)", trxId: null, readViewRepeat: true, desc: "RC: 重建ReadView, 读最新→2行(幻读!); RR: 复用T2快照, id=2的trx_id=300在m_ids中→不可见, 仍1行(快照读无幻读)", rcResult: "2行(幻读)", rrResult: "1行(无幻读)" }
                    }
                },
                {
                    time: "T6", actions: {
                        "A": { type: "IDLE", desc: "已提交", trxId: null },
                        "B": { type: "CURRENT_READ", value: "SELECT ... FOR UPDATE", trxId: null, desc: "当前读: 放弃MVCC快照, 直接读最新已提交数据, 读取到id=1,id=2共2行; RR下当前读仍存在幻读!", result: "2行(当前读幻读)" }
                    }
                }
            ],
            initialVersionChain: { data: "age=20", trx_id: 299, roll_ptr: null }
        },

        delete: {
            name: "删除+长事务",
            isoSupport: true,
            timeline: [
                {
                    time: "T0", actions: {
                        "C": { type: "INIT", desc: "基线数据: id=1,age=50", trxId: null },
                        "D": { type: "INIT", desc: "未启动", trxId: null }
                    }
                },
                {
                    time: "T1", actions: {
                        "C": { type: "BEGIN", trxId: 400, active: true, desc: "BEGIN; 长事务 trx_id=400" },
                        "D": { type: "BEGIN", trxId: 401, active: true, desc: "BEGIN; 删除事务 trx_id=401" }
                    }
                },
                {
                    time: "T2", actions: {
                        "C": { type: "SELECT", value: "快照读(age=50)", trxId: 400, readView: { m_ids: [400, 401], min_trx: 400, max_trx: 402, creator: 400 }, desc: "首次SELECT新建ReadView, 活跃列表[400,401], 行trx_id=399<min_trx→可见", result: "50" },
                        "D": { type: "IDLE", desc: "无操作", trxId: 401 }
                    }
                },
                {
                    time: "T3", actions: {
                        "C": { type: "IDLE", desc: "无操作", trxId: 400 },
                        "D": { type: "DELETE", markDelete: true, trxId: 401, desc: "DELETE FROM t WHERE id=1; 标记删除, trx_id=401写入删除标记版本, 生成Undo", commitAfter: true }
                    }
                },
                {
                    time: "T4", actions: {
                        "C": { type: "IDLE", desc: "无操作", trxId: 400 },
                        "D": { type: "COMMIT", trxId: 401, desc: "COMMIT; 删除标记已持久化" }
                    }
                },
                {
                    time: "T5", actions: {
                        "C": { type: "SELECT", value: "再次读(仍可见原版本)", trxId: 400, readViewRepeat: true, desc: "RC: 重建ReadView, 401已提交不在活跃列表, 删除标记版本可见→行不存在; RR: 复用T2快照, 401在m_ids中→删除标记不可见, 走Undo→age=50仍可见", rcResult: "行不存在", rrResult: "50(仍可见)" },
                        "D": { type: "IDLE", desc: "已提交", trxId: null }
                    }
                }
            ],
            initialVersionChain: { data: "age=50", trx_id: 399, roll_ptr: null }
        }
    };

    var currentScene = "base";
    var currentIso = "RR";
    var activeReadViewMap = new Map();

    // ===================== 渲染主函数 =====================
    function renderScene() {
        var scene = SCENES[currentScene];
        if (!scene) return;
        var timeline = scene.timeline;

        // 构建版本链 (最新版本在索引 0)
        var versionChain = [{ data: scene.initialVersionChain.data, trx_id: scene.initialVersionChain.trx_id, roll_ptr: null, isDel: false }];
        for (var i = 0; i < timeline.length; i++) {
            var ev = timeline[i];
            for (var tx in ev.actions) {
                var act = ev.actions[tx];
                if (act.type === "UPDATE" && act.newVal) {
                    versionChain.unshift({ data: act.newVal, trx_id: act.trxId, roll_ptr: "\u2190 prev", isDel: false });
                }
                if (act.type === "INSERT" && act.newVal) {
                    versionChain.unshift({ data: act.newVal + " (新行)", trx_id: act.trxId, roll_ptr: null, isDel: false, isNewRow: true });
                }
                if (act.type === "DELETE" && act.markDelete) {
                    versionChain.unshift({ data: "\u3010\u5df2\u5220\u9664\u6807\u8bb0\u3011", trx_id: act.trxId, roll_ptr: "\u2190 prev", isDel: true });
                }
            }
        }

        // 收集所有事务
        var allTx = {};
        var txRoles = {}; // 写/读/读写都有
        for (var i = 0; i < timeline.length; i++) {
            for (var tx in timeline[i].actions) {
                allTx[tx] = true;
                var act = timeline[i].actions[tx];
                if (act.type === "UPDATE" || act.type === "INSERT" || act.type === "DELETE") {
                    txRoles[tx] = "write";
                } else if (act.type === "SELECT" || act.type === "CURRENT_READ") {
                    if (txRoles[tx] !== "write") txRoles[tx] = "read";
                }
            }
        }
        var txList = Object.keys(allTx).sort();

        // ============= 渲染 grid(时间 + 事务) =============
        var grid = document.getElementById("mvccGrid");
        grid.innerHTML = "";

        // 动态设置 grid 列模板: 70px 时间 + 1fr 事务数
        grid.style.gridTemplateColumns = "70px repeat(" + txList.length + ", minmax(150px, 1fr))";

        // 头行: 时间列 + 各事务头
        var timeHeader = document.createElement("div");
        timeHeader.className = "mvcc-time-marker mvcc-time-header";
        timeHeader.textContent = "\u23f1 时间";
        grid.appendChild(timeHeader);

        for (var i = 0; i < txList.length; i++) {
            var tx = txList[i];
            var h = document.createElement("div");
            h.className = "mvcc-tx-col-header";
            if (txRoles[tx] === "write") h.classList.add("mvcc-tx-write");
            else if (txRoles[tx] === "read") h.classList.add("mvcc-tx-read");
            h.textContent = "事务 " + tx;
            grid.appendChild(h);
        }

        // 时间行
        for (var ti = 0; ti < timeline.length; ti++) {
            var timeSlot = timeline[ti];

            var timeDiv = document.createElement("div");
            timeDiv.className = "mvcc-time-marker";
            timeDiv.textContent = timeSlot.time;
            grid.appendChild(timeDiv);

            for (var txi = 0; txi < txList.length; txi++) {
                var tx = txList[txi];
                var colDiv = document.createElement("div");
                colDiv.className = "mvcc-transaction-col";
                var action = timeSlot.actions[tx];
                if (action) {
                    colDiv.appendChild(createActionBlock(tx, action, timeSlot.time, ti));
                } else {
                    colDiv.classList.add("mvcc-col-placeholder");
                    colDiv.textContent = "——";
                }
                grid.appendChild(colDiv);
            }
        }

        // ============= 渲染版本链(独立容器) =============
        renderVersionChain(versionChain);
    }

    // ===================== 版本链渲染 =====================
    function renderVersionChain(chain) {
        var container = document.getElementById("globalVersionChain");
        // 保留第一个 title
        var title = container.querySelector(".mvcc-chain-title");
        container.innerHTML = "";
        if (title) container.appendChild(title);
        else {
            var t = document.createElement("div");
            t.className = "mvcc-chain-title";
            t.textContent = "版本链 (Undo Log)";
            container.appendChild(t);
        }

        for (var i = 0; i < chain.length; i++) {
            var ver = chain[i];
            var card = document.createElement("div");
            card.className = "mvcc-version-card";
            card.setAttribute("data-trx-id", ver.trx_id);
            card.setAttribute("data-version-index", i);

            var label = i === 0 ? "最新" : "历史版本";
            if (ver.isNewRow) label = "新插入行";

            var head = document.createElement("div");
            head.className = "mvcc-version-head";
            head.innerHTML = '<span>\ud83d\udcc4 ' + label + '</span>' + (ver.isDel ? '<span class="mvcc-version-del">\ud83d\uddd1 删除标记</span>' : '');
            card.appendChild(head);

            var fields = document.createElement("div");
            fields.className = "mvcc-fields";
            fields.innerHTML =
                '<span class="mvcc-field">\ud83d\udce6 Data: ' + escapeHtml(String(ver.data)) + '</span>' +
                '<span class="mvcc-field">\ud83c\udff7 DB_TRX_ID: ' + ver.trx_id + '</span>' +
                '<span class="mvcc-field">\ud83d\udd17 DB_ROLL_PTR: ' + (ver.roll_ptr || "null") + '</span>';
            card.appendChild(fields);

            if (ver.isDel) card.style.opacity = "0.75";
            container.appendChild(card);

            if (i < chain.length - 1) {
                var arrow = document.createElement("div");
                arrow.className = "mvcc-roll-ptr-arrow";
                arrow.textContent = "\u2b07 ROLL_PTR \u2b07";
                container.appendChild(arrow);
            }
        }
    }

    // ===================== 操作块创建 =====================
    function createActionBlock(tx, action, timeVal, idx) {
        var div = document.createElement("div");

        var isRead = (action.type === "SELECT");
        var isWrite = (action.type === "UPDATE" || action.type === "DELETE" || action.type === "INSERT");
        var isCurrentRead = (action.type === "CURRENT_READ");
        var isCommit = (action.type === "COMMIT");
        var isInit = (action.type === "INIT");
        var isIdle = (action.type === "IDLE");

        var cls = "mvcc-action-block";
        if (isRead) cls += " read";
        else if (isCurrentRead) cls += " current-read";
        else if (isWrite) cls += " write";
        else if (isInit) cls += " init";
        else if (isIdle) cls += " idle";
        if (action.active && (action.type === "BEGIN" || action.type === "UPDATE" || action.type === "INSERT" || action.type === "DELETE")) {
            cls += " active-tx";
        }
        if (action.commitAfter || isCommit) cls += " committed";
        div.className = cls;

        // 图标
        var icon = "";
        if (isRead) icon = "\ud83d\udc41 快照读";
        else if (isCurrentRead) icon = "\ud83d\udd12 当前读";
        else if (action.type === "UPDATE") icon = "\u270f UPDATE";
        else if (action.type === "INSERT") icon = "\u2795 INSERT";
        else if (action.type === "DELETE") icon = "\u274c DELETE";
        else if (isCommit) icon = "\u2705 COMMIT";
        else if (isInit) icon = "\ud83d\udccb 初始化";
        else if (isIdle) icon = "\u23f8 等待";
        else if (action.type === "BEGIN") icon = "\ud83d\ude80 BEGIN";

        var trxIdText = action.trxId ? "trx:" + action.trxId : "无ID";

        // 头部
        var head = document.createElement("div");
        head.className = "mvcc-action-head";
        head.innerHTML =
            '<span class="mvcc-action-icon">' + icon + '</span>' +
            '<span>' + tx + '</span>' +
            '<span class="mvcc-action-trx">' + trxIdText + '</span>';
        div.appendChild(head);

        // 详情
        var valueText = "";
        if (action.newVal) valueText = "\u2192 " + action.newVal;
        else if (action.value) valueText = action.value;
        else if (action.markDelete) valueText = "删除行";
        else if (action.result) valueText = "结果: " + action.result;

        if (valueText) {
            var detail = document.createElement("div");
            detail.className = "mvcc-action-detail";
            detail.textContent = valueText;
            div.appendChild(detail);
        }

        // 描述
        if (action.desc && !isInit && !isIdle) {
            var desc = document.createElement("div");
            desc.className = "mvcc-action-desc";
            desc.textContent = action.desc;
            div.appendChild(desc);
        } else if (action.desc) {
            var desc = document.createElement("div");
            desc.className = "mvcc-action-desc";
            desc.textContent = action.desc;
            div.appendChild(desc);
        }

        // RC/RR 结果对比
        if (action.rcResult !== undefined || action.rrResult !== undefined) {
            if (action.rcResult !== undefined) {
                var rcP = document.createElement("div");
                rcP.className = "mvcc-result-panel rc-result";
                rcP.textContent = "RC \u2192 " + action.rcResult;
                div.appendChild(rcP);
            }
            if (action.rrResult !== undefined) {
                var rrP = document.createElement("div");
                rrP.className = "mvcc-result-panel rr-result";
                rrP.textContent = "RR \u2192 " + action.rrResult;
                div.appendChild(rrP);
            }
        }

        // 当前读幻读提示
        if (isCurrentRead) {
            var hint = document.createElement("div");
            hint.className = "mvcc-phantom-hint";
            hint.textContent = "\u26a0 当前读放弃MVCC快照, 直接读最新已提交数据, RR下当前读仍存在幻读!";
            div.appendChild(hint);
        }

        // ReadView 交互
        if (isRead || isCurrentRead) {
            var panel = document.createElement("div");
            panel.className = "mvcc-read-view-panel";
            panel.id = "rv-" + tx + "-" + timeVal;
            panel.innerHTML = '\ud83d\udccb ReadView待生成 <button class="mvcc-small-step mvcc-step-readview">\ud83d\udd0d 生成快照并追溯</button>';
            div.appendChild(panel);

            var btn = panel.querySelector(".mvcc-step-readview");
            btn.addEventListener("click", (function (txKey, act, blockEl) {
                return function (e) {
                    e.stopPropagation();
                    simulateReadView(txKey, act, blockEl);
                };
            })(tx, action, div));
        }

        return div;
    }

    // ===================== ReadView 模拟 =====================
    function simulateReadView(tx, action, blockElem) {
        var iso = currentIso;
        var readViewObj = null;
        var isReused = false;

        if (iso === "RR" && action.readViewRepeat === true && activeReadViewMap.has(tx + "_first")) {
            readViewObj = activeReadViewMap.get(tx + "_first");
            isReused = true;
        } else {
            var newView = action.readView || { m_ids: [], min_trx: 999, max_trx: 1000, creator: null };
            // RC 模式下第二次读: 模拟已提交后活跃列表为空
            if (iso === "RC" && action.readViewRepeat === true) {
                newView = { m_ids: [], min_trx: 999, max_trx: 1000, creator: null };
            }
            readViewObj = newView;
            if (iso === "RR" && !activeReadViewMap.has(tx + "_first")) {
                activeReadViewMap.set(tx + "_first", readViewObj);
            }
        }

        showReadViewPanel(blockElem, readViewObj, isReused);
        highlightVersionByReadView(readViewObj);
    }

    function showReadViewPanel(block, view, isReused) {
        var panel = block.querySelector(".mvcc-read-view-panel");
        if (!panel) return;
        var m_ids_str = view.m_ids ? view.m_ids.join(",") : "[]";
        var tag = isReused ? "RR复用快照" : (currentIso === "RR" ? "RR首次快照" : "RC新快照");
        panel.innerHTML =
            '<div style="font-weight:bold;margin-bottom:2px;">\ud83d\udcd6 Read View (' + tag + ')</div>' +
            '<div>m_ids: {' + m_ids_str + '}  min:' + view.min_trx + '  max:' + view.max_trx + '</div>' +
            '<div class="mvcc-rule-hint">规则: DB_TRX_ID &lt; min_trx 或 不在m_ids且 &lt; max_trx \u2192 可见</div>' +
            '<button class="mvcc-small-step mvcc-trace-chain">\ud83d\udd0e 追溯版本链</button>';

        var traceBtn = panel.querySelector(".mvcc-trace-chain");
        traceBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            highlightVersionByReadView(view);
        });
    }

    function highlightVersionByReadView(readView) {
        var versionCards = document.querySelectorAll(".mvcc-version-card");
        var m_ids = readView.m_ids || [];
        var min_trx = readView.min_trx;
        var max_trx = readView.max_trx;

        for (var i = 0; i < versionCards.length; i++) {
            var card = versionCards[i];
            var trxIdAttr = card.getAttribute("data-trx-id");
            if (!trxIdAttr) continue;
            var trxIdNum = parseInt(trxIdAttr, 10);
            var visible = false;

            if (trxIdNum < min_trx) {
                visible = true;
            } else if (trxIdNum >= max_trx) {
                visible = false;
            } else if (m_ids.indexOf(trxIdNum) !== -1) {
                visible = false;
            } else {
                visible = true;
            }

            card.classList.remove("highlight-green", "highlight-red");
            if (visible) card.classList.add("highlight-green");
            else card.classList.add("highlight-red");
            card.setAttribute("title", visible ? "\u2705 可见: 符合MVCC可见性规则" : "\u274c 不可见: 事务ID在活跃m_ids中或 \u2265 max_trx");
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[<>&"]/g, function (c) {
            return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        });
    }

    // ===================== 事件绑定 =====================
    function bindEvents() {
        var scenarioBtns = document.querySelectorAll(".mvcc-scenario-btn");
        for (var i = 0; i < scenarioBtns.length; i++) {
            scenarioBtns[i].addEventListener("click", function () {
                for (var j = 0; j < scenarioBtns.length; j++) {
                    scenarioBtns[j].classList.remove("active");
                }
                this.classList.add("active");
                currentScene = this.dataset.scene;
                activeReadViewMap.clear();
                renderScene();
            });
        }

        var isoOpts = document.querySelectorAll(".mvcc-iso-opt");
        for (var i = 0; i < isoOpts.length; i++) {
            isoOpts[i].addEventListener("click", function () {
                for (var j = 0; j < isoOpts.length; j++) {
                    isoOpts[j].classList.remove("active");
                }
                this.classList.add("active");
                currentIso = this.dataset.iso;
                activeReadViewMap.clear();
                renderScene();
            });
        }

        var resetBtn = document.getElementById("mvccResetBtn");
        if (resetBtn) {
            resetBtn.addEventListener("click", function () {
                activeReadViewMap.clear();
                renderScene();
            });
        }
    }

    bindEvents();
    renderScene();
})();
