/* =========================================================
 * UI · 游戏悬浮窗（Document Picture-in-Picture）
 * ---------------------------------------------------------
 * 置顶小窗伴随游戏：手牌实际数值 / 狂气爆发与钥令时机高亮 /
 * 融灾顾问 AI 对话（自动附带局面快照+引擎口径+未建模清单；
 * 未配 Key 降级为复制快照）。提示词组装见 js/ai/advisor.js（T11）。
 * PiP 窗口与主窗口共享同一 JS 上下文 —— State 直读，无需同步。
 * 要求：Chrome/Edge 116+，经 http://127.0.0.1 访问。
 * ========================================================= */
"use strict";

const PipPanel = {

  win: null,           // PiP 的 window 对象
  busy: false,         // 聊天请求中
  chatLog: [],         // {role, content}
  _draftSaved: "",     // 输入框草稿（渲染时不覆盖）

  /* ================= 开窗 ================= */
  async openPip() {
    if (!("documentPictureInPicture" in window)) {
      Log.add('<span class="warn-text">此浏览器不支持悬浮窗（需 Chrome/Edge 116+）。若你是双击 index.html 打开的，请改用 start.bat（或 node server.js 后访问 http://127.0.0.1:8768）。</span>', "sys");
      alert("悬浮窗需要 Chrome/Edge 116+，并通过 http://127.0.0.1 访问（双击 start.bat）。");
      return;
    }
    if (this.win && !this.win.closed) { this.win.focus(); return; }
    try {
      const w = await documentPictureInPicture.requestWindow({ width: 400, height: 680 });
      this.win = w;
      /* 复制主文档样式 */
      [...document.styleSheets].forEach(sheet => {
        try {
          const css = [...sheet.cssRules].map(r => r.cssText).join("\n");
          const style = w.document.createElement("style");
          style.textContent = css;
          w.document.head.appendChild(style);
        } catch (e) { /* 跨域样式表跳过 */ }
      });
      /* 骨架 */
      w.document.body.innerHTML = `
        <div class="pip-shell">
          <div class="pip-head">🪟 伴随面板 <button class="pip-close" title="关闭悬浮窗">✕</button></div>
          <div class="pip-body">
            <div class="pip-stats" id="pip-stats"></div>
            <div class="pip-teamhp" id="pip-teamhp"></div>
            <div class="pip-allies" id="pip-allies"></div>
            <div class="pip-sec-title">手牌（实际数值）</div>
            <div class="pip-hand" id="pip-hand"></div>
            <div class="pip-sec-title">敌人</div>
            <div class="pip-enemies" id="pip-enemies"></div>
            <div class="pip-sec-title" style="cursor:pointer" onclick="PipPanel.toggleMap()">🗺 查看地图 <span class="dim" id="pip-map-arrow">（收着）</span></div>
            <div id="pip-map" style="display:none;max-height:150px;overflow:auto"></div>
            <div class="pip-chat" id="pip-chat">
              <div class="pip-chat-head">🧭 融灾顾问（自动附带局面+引擎口径+未建模清单）</div>
              <div class="pip-msgs" id="pip-msgs"></div>
              <div id="pip-plan"></div>
              <div class="pip-input-row">
                <textarea id="pip-input" rows="2" placeholder="例：这回合先挂易伤还是先打爆发？/ n5 帮我配队？"></textarea>
                <button id="pip-send" class="pip-btn-send">发送</button>
              </div>
              <div class="pip-chat-tools">
                <button id="pip-copy" class="mini-btn">复制问题+局面</button>
                <button id="pip-clear" class="mini-btn">清空对话</button>
                <span id="pip-chat-status" class="dim"></span>
              </div>
            </div>
          </div>
        </div>`;
      w.document.title = "忘却前夜 · 伴随面板";
      w.document.querySelector(".pip-close").onclick = () => w.close();
      const input = w.document.getElementById("pip-input");
      input.value = localStorage.getItem("morimens_pip_notes") || "";
      input.oninput = () => { localStorage.setItem("morimens_pip_notes", input.value); };
      w.document.getElementById("pip-send").onclick = () => this.sendChat();
      w.document.getElementById("pip-copy").onclick = () => this.copySnapshot();
      w.document.getElementById("pip-clear").onclick = () => {
        this.chatLog = [];
        localStorage.removeItem("morimens_pip_chat");
        this.renderChat();
      };
      /* 历史恢复 */
      try { this.chatLog = JSON.parse(localStorage.getItem("morimens_pip_chat") || "[]"); } catch (e) { this.chatLog = []; }
      w.addEventListener("pagehide", () => { this.win = null; });
      this.render();
      Log.add("🪟 悬浮窗已开启（游戏请用无边框窗口模式）", "sys");
    } catch (e) {
      Log.add(`<span class="warn-text">悬浮窗开启失败：${e.message}</span>`, "sys");
    }
  },

  isOpen() { return this.win && !this.win.closed; },

  /* ================= 渲染（挂入 renderAll） ================= */
  render() {
    if (!this.isOpen()) return;
    const d = this.win.document;
    const b = State.battle;
    if (!b) {
      d.getElementById("pip-stats").innerHTML = `<span class="dim">准备阶段 —— 主窗口摆好局面后这里实时同步</span>`;
      d.getElementById("pip-teamhp").innerHTML = "";
      d.getElementById("pip-allies").innerHTML = "";
      d.getElementById("pip-hand").innerHTML = "";
      d.getElementById("pip-enemies").innerHTML = "";
      this.renderChat();
      return;
    }
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

    /* 状态条：回合/算力/银钥 */
    const keyReady = b.silver >= 1000;
    d.getElementById("pip-stats").innerHTML =
      `<span class="pip-chip">回合${b.turn}</span>
       <span class="pip-chip">算力 ${b.energy}</span>
       <span class="pip-chip ${keyReady ? "pip-ready" : ""}">🔑 银钥 ${b.silver}/1000${keyReady ? " · 钥令可用" : ""}</span>`;

    /* 队伍生命 */
    const tShield = b.allies.reduce((s, a) => s + (a.shield || 0), 0);
    d.getElementById("pip-teamhp").innerHTML =
      `<div class="pip-hpbar"><div class="pip-hpfill" style="width:${Math.max(0, b.team.hp / Math.max(1, b.team.maxHp) * 100)}%"></div>
       <span>队伍 ${b.team.hp}/${b.team.maxHp}${tShield ? ` 🛡${tShield}` : ""}</span></div>`;

    /* 唤醒体：狂气时机 */
    d.getElementById("pip-allies").innerHTML = b.allies.map(a => {
      const can = a.guku >= 100;
      const full = a.gukuMax > 100 && a.guku >= a.gukuMax;   // 超限仅指200上限打满
      const burstDef = DBF.cards.find(c => c.owner === a.def.id && c.type === "狂气爆发");
      const preview = burstDef ? Cards.describeEffects(burstDef, a, "actual").join("，") : "";
      const g1 = Math.min(a.guku, 100), g2 = Math.max(0, Math.min(a.guku - 100, 100));
      return `<div class="pip-ally ${can ? "pip-burst-ready" : ""}">
        <div class="pip-ally-top">
          <b>${esc(a.def.name)}</b>
          ${full ? '<span class="pip-tag-super">超限⚡</span>' : can ? '<span class="pip-tag-go">⚡可爆发</span>' : ""}
          <span class="dim">${a.guku}/${a.gukuMax}</span>
        </div>
        <div class="pip-gukubar"><i class="g1" style="width:${g1}%"></i><i class="g2" style="width:${g2}%"></i></div>
        ${preview ? `<div class="pip-preview">${esc(preview)}</div>` : ""}
      </div>`;
    }).join("");

    /* 手牌：实际数值 */
    const hand = b.piles.hand.map(inst => {
      const def = Cards.def(inst);
      const owner = b.allies.find(x => x.def.id === def.owner) || b.allies[0];
      const dyn = Cards.describeEffects(def, owner, "actual").join("；");
      const afford = def.type === "狂气爆发" ? owner.guku >= 100 : b.energy >= def.cost;
      return { def, dyn, afford };
    });
    d.getElementById("pip-hand").innerHTML = hand.length ? hand.map(h =>
      `<div class="pip-card ${h.afford ? "" : "pip-dim"}">
        <span class="pip-cost">${h.def.cost}</span><b>${esc(h.def.name)}</b>
        <span class="pip-dyn">${esc(h.dyn)}${h.dyn ? "。" : ""}</span>${h.afford ? "" : '<span class="warn-text">（费用不足）</span>'}
      </div>`).join("") : `<div class="dim">（手牌为空）</div>`;

    /* 敌人 */
    d.getElementById("pip-enemies").innerHTML = b.enemies.map(e => {
      const vul = e.buffs.filter(x => x.defId === "debuff_vul").reduce((s, x) => s + x.stacks, 0);
      return `<div class="pip-enemy">${esc(e.def.name)} ${e.hp}/${e.maxHp}${vul ? ` <span class="warn-text">易伤×${vul}</span>` : ""}${e.shield ? ` 🛡${e.shield}` : ""}</div>`;
    }).join("") || `<div class="dim">（无敌人）</div>`;

    this.renderChat();
  },

  toggleMap() {
    const box = this.win && this.win.document.getElementById("pip-map");
    if (!box) return;
    const show = box.style.display === "none";
    box.style.display = show ? "" : "none";
    const arrow = this.win.document.getElementById("pip-map-arrow");
    if (arrow) arrow.textContent = show ? "" : "（收着）";
    if (show) this.renderMiniMap();
  },

  /* 只读迷你地图（采集窗地图的同步视图；只渲染有格子的外接范围） */
  renderMiniMap() {
    if (!this.isOpen()) return;
    const box = this.win.document.getElementById("pip-map");
    if (!box) return;
    let map; try { map = JSON.parse(localStorage.getItem("morimens_collector_map") || '{"cells":{},"pos":null}'); } catch (e) { map = { cells: {} }; }
    const cells = map.cells || {};
    const ks = Object.keys(cells);
    if (!ks.length) { box.innerHTML = `<div class="dim" style="padding:4px 2px">（地图为空，去采集窗「沙盘」画）</div>`; return; }
    const rs = ks.map(k => +k.split(",")[0]), cs = ks.map(k => +k.split(",")[1]);
    const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
    let html = `<div class="hexmap" style="transform:scale(.8);transform-origin:top left">`;
    for (let r = r0; r <= r1; r++) {
      html += `<div class="hexrow ${r % 2 ? "odd" : ""}">`;
      for (let c = c0; c <= c1; c++) {
        const k = `${r},${c}`;
        const cell = cells[k];
        if (!cell || (cell.type === "once" && cell.used)) { html += `<div class="hex hex-empty" style="opacity:.35"></div>`; continue; }
        const icon = Collector.mapIcon(cell);
        html += `<div class="hex ${cell.type !== "empty" ? "hex-" + cell.type : "hex-emptycell"} ${cell.used ? "hex-used" : ""} ${map.pos === k ? "hex-pos" : ""}" title="${cell.note || ""}">${icon}</div>`;
      }
      html += `</div>`;
    }
    box.innerHTML = html + `</div>`;
  },

  /* ================= 局面快照文本 ================= */
  snapshotText() {
    const b = State.battle;
    if (!b) return "【局面】准备阶段（未开战）";
    const L = [];
    L.push(`【局面】第${b.turn}回合 | 算力${b.energy} | 银钥${b.silver}/1000${b.silver >= 1000 ? "（钥令可用）" : ""} | 队伍生命${b.team.hp}/${b.team.maxHp}${(b.usedYogens || []).length ? ` | 本探索已用尘封旧忆×${b.usedYogens.length}` : ""}`);
    if (b.tentacle) L.push(`🐙触腕×${b.tentacle.count}${b.tentacle.rally ? `+集结${b.tentacle.rally}` : ""}·${b.tentacle.stance}`);
    /* 敌人下回合意图（与 board.js 同口径：aiIndex % 长度；value 支持难度对象；
     * T28：意图显示值含当前力量=基础值+Σ力量点数，快照给有效值并注明基础拆分） */
    const bdiff = b.difficulty || "normal";
    const valOf = v => (v != null && typeof v === "object") ? (v[bdiff] != null ? v[bdiff] : v.normal) : v;
    const intentOf = (e) => {
      const acts = e.def.actions || [];
      if (!acts.length) return "";
      const act = acts[(b.aiIndex[e.uid] || 0) % acts.length];
      if (!act) return "";
      if (act.type !== "attack") return `，下回合意图：${act.name}`;
      const av = valOf(act.value);
      const strFlat = (e.buffs ? Buffs.collect(e, "damageFlat").reduce((s, m) => s + m.total, 0) : 0);
      const shown = (av != null && strFlat !== 0) ? av + strFlat : av;
      const body = shown != null
        ? `${shown}${strFlat !== 0 ? `（基础${av}${strFlat > 0 ? "+" : ""}${strFlat}力量）` : ""}`
        : `攻×${act.scaleSelfAttack || 1}`;
      return `，下回合意图：${act.name}（${body}${act.times > 1 ? "×" + act.times : ""}）`;
    };
    for (const a of b.allies) {
      const bl = a.buffs.map(x => `${State.getBuff(x.defId)?.name || x.defId}×${x.stacks}`).join("，");
      L.push(`- ${a.def.name}#${a.uid} Lv${a.level}：狂气${a.guku}/${a.gukuMax}${a.guku >= 100 ? "（可爆发）" : ""}${bl ? `，状态：${bl}` : ""}`);
    }
    const hand = b.piles.hand.map(inst => {
      const def = Cards.def(inst);
      const owner = b.allies.find(x => x.def.id === def.owner) || b.allies[0];
      return `[${def.cost}]${def.name}#${inst.uid}（${Cards.describeEffects(def, owner, "actual").join("；")}）`;
    });
    if (hand.length) L.push("手牌：" + hand.join("，"));
    for (const e of b.enemies) {
      const bl = e.buffs.map(x => `${State.getBuff(x.defId)?.name || x.defId}×${x.stacks}`).join("，");
      L.push(`- 敌 ${e.def.name}#${e.uid}：${e.hp}/${e.maxHp}${bl ? `，状态：${bl}` : ""}${intentOf(e)}`);
    }
    return L.join("\n");
  },

  /* ================= 聊天 ================= */
  renderChat() {
    if (!this.isOpen()) return;
    const d = this.win.document;
    const box = d.getElementById("pip-msgs");
    if (!box) return;
    box.innerHTML = this.chatLog.map(m =>
      `<div class="pip-msg ${m.role === "user" ? "pip-msg-user" : "pip-msg-ai"}">${m.role === "user" ? "" : "<b>助手：</b>"}${String(m.content).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`
    ).join("");
    box.scrollTop = box.scrollHeight;
  },

  setStatus(txt) {
    if (!this.isOpen()) return;
    const el = this.win.document.getElementById("pip-chat-status");
    if (el) el.textContent = txt || "";
  },

  async sendChat() {
    if (!this.isOpen() || this.busy) return;
    const d = this.win.document;
    const input = d.getElementById("pip-input");
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    localStorage.setItem("morimens_pip_notes", "");
    this.chatLog.push({ role: "user", content: q });
    this.saveChat(); this.renderChat();
    this.busy = true; this.setStatus("思考中…");

    /* 融灾顾问系统提示词（T11）：引擎口径+未建模清单铁律+局面快照+个人名册；
     * Advisor 未挂载时回落旧的一句话提示词（保持可用） */
    const sys = (typeof Advisor !== "undefined")
      ? Advisor.buildSystemPrompt(this.snapshotText())
      : `你是《忘却前夜》(Morimens) 卡牌构筑手游的打牌顾问。以下是玩家模拟器中的当前局面快照（伤害向上取整；力量为点数加算；易伤/虚弱为乘区）：
${this.snapshotText()}
请基于局面给出简明可执行的打牌建议（先出什么、爆发/钥令时机），控制在120字内；若信息不足就问一句关键问题。`;

    const messages = [{ role: "system", content: sys },
      ...this.chatLog.slice(-10).map(m => ({ role: m.role, content: m.content }))];

    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages })
      });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("event-stream")) {
        const j = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(j.message || j.error || ("HTTP " + res.status));
      }
      /* 流式解析 SSE */
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", full = "";
      this.chatLog.push({ role: "assistant", content: "" });
      this.renderChat();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const data = s.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (delta) { full += delta; this.chatLog[this.chatLog.length - 1].content = full; this.renderChat(); }
          } catch (e) { /* 跳过坏行 */ }
        }
      }
      if (!full) { this.chatLog.pop(); throw new Error("回复为空"); }
      this.setStatus("");
      /* T30 闭环一期：解析方案块 → 模拟预览 → 方案卡片（采纳=真实重放/驳回） */
      if (typeof Executor !== "undefined") {
        const parsed = Executor.parsePlan(full);
        if (parsed) this.showPlan(parsed, Executor.preview(parsed.plan));
      }
    } catch (e) {
      /* 降级：移除空回复，提示复制模式 */
      if (this.chatLog.length && this.chatLog[this.chatLog.length - 1].role === "assistant" && !this.chatLog[this.chatLog.length - 1].content) this.chatLog.pop();
      /* T47 在线版提示：GitHub Pages 纯静态无 /api/chat 代理——非本地访问时说明降级原因 */
      const online = !/^127\.0\.0\.1$|^localhost$/.test(location.hostname);
      this.chatLog.push({ role: "assistant", content: online
        ? `⚠ 在线版（GitHub Pages）为纯静态站点，不含 AI 代理，AI 直发不可用。已降级为复制模式：点「复制问题+局面」，把内容粘贴到任意 AI 助手即可获得方案（方案 JSON 贴回此处仍可模拟预览/采纳）。本地版（start.bat）配 Key 后可用直发。`
        : `⚠ 无法连接 AI（${e.message}）。已降级为复制模式：点「复制问题+局面」后回到 ZCode 会话粘贴提问。` });
      this.renderChat();
      this.setStatus("复制模式");
      input.value = q;   // 还原输入
    } finally {
      this.busy = false;
      this.saveChat();
    }
  },

  /* ================= 行动方案卡片（T30 闭环一期） ================= */

  /* 卡片宿主：PiP 开着进 PiP；否则主窗口回落容器（无悬浮窗降级入口，可真点） */
  planHost() {
    if (this.isOpen()) return this.win.document.getElementById("pip-plan");
    let el = document.getElementById("pip-plan-fallback");
    if (!el) {
      el = document.createElement("div");
      el.id = "pip-plan-fallback";
      el.style.cssText = "position:fixed;right:12px;bottom:130px;width:320px;max-height:55vh;overflow:auto;background:#171a26;border:1px solid #c8a44e;border-radius:8px;padding:8px 10px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.5);font-size:12px;color:#ddd";
      document.body.appendChild(el);
    }
    return el;
  },

  showPlan(parsed, pv) {
    this._plan = { parsed, pv };
    const host = this.planHost();
    host.innerHTML = this._planCardHtml(parsed, pv);
    const adoptBtn = host.querySelector("#pip-plan-adopt");
    if (adoptBtn) adoptBtn.onclick = () => this.adoptPlan();
    host.querySelector("#pip-plan-dismiss").onclick = () => this.dismissPlan("已驳回方案");
  },

  _planCardHtml(parsed, pv) {
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let body = "";
    if (!pv.ok) {
      body = `<div class="warn-text">⚠ 无法预览：${esc(pv.error || "未知原因")}</div>`;
    } else {
      const ctx = pv.context || {};
      const nm = (list, u) => { const x = (list || []).find(c => c.uid === u); return x ? x.name : u; };
      const opText = (st) => {
        switch (st.op) {
          case "play": return `打出 ${nm(ctx.hand, st.uid)}${st.target ? ` → ${nm(ctx.enemies, st.target) !== st.target ? nm(ctx.enemies, st.target) : nm(ctx.allies, st.target)}` : ""}`;
          case "burst": return `${nm(ctx.allies, st.ally)} 释放狂气爆发`;
          case "yogen": return st.via === "forgotten" ? `尘封旧忆：释放钥令 ${st.id}` : "释放携带钥令";
          case "awaken": return `银钥觉醒置入 ${st.card || "灵知觉醒"}`;
          case "tentacle": return `触腕姿态 → ${st.stance || "顺序切换"}`;
          case "end": return "结束回合";
          default: return st.op;
        }
      };
      body = `<ol class="pip-plan-steps" style="margin:4px 0;padding-left:18px">` + pv.steps.map(s =>
        `<li style="margin:2px 0${s.ok ? "" : ";color:#e08080"}">${esc(opText(s.step))}${s.delta && s.delta.length ? ` <span class="dim">（${esc(s.delta.join("，"))}）</span>` : ""}${!s.ok && s.note ? ` <span class="warn-text">${esc(s.note)}</span>` : ""}</li>`
      ).join("") + `</ol>`;
      for (const w of (pv.warnings || [])) body += `<div class="warn-text" style="font-size:11px">⚠ ${esc(w)}</div>`;
    }
    return `<div class="pip-plan-head" style="color:var(--gold);font-weight:bold;margin-bottom:2px">📋 行动方案预览${parsed.why ? ` — ${esc(parsed.why)}` : ""}</div>${body}
      <div class="pip-plan-btns" style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${pv.ok ? `<button id="pip-plan-adopt" class="mini-btn">✅ 采纳（真实执行）</button>` : ""}
        <button id="pip-plan-dismiss" class="mini-btn">✖ 驳回</button>
        <span class="dim" style="font-size:10px">数值=模拟器真实回放；暴击等随机项以实际执行为准</span>
      </div>`;
  },

  adoptPlan() {
    if (!this._plan) return;
    const { parsed } = this._plan;
    const r = Executor.adopt(parsed.plan);
    const okN = r.steps.filter(s => s.ok).length;
    const host = this.planHost();
    host.innerHTML = `<div class="pip-plan-head" style="color:var(--gold);font-weight:bold">${r.ok ? "✅ 方案已执行" : "⚠ 方案部分执行"}（${okN}/${r.steps.length} 步）</div>
      ${r.error ? `<div class="warn-text">${r.error}</div>` : ""}
      <div class="dim" style="font-size:11px">实际执行完成，明细见战斗日志。</div>
      <div class="pip-plan-btns" style="margin-top:4px"><button id="pip-plan-dismiss" class="mini-btn">关闭</button></div>`;
    host.querySelector("#pip-plan-dismiss").onclick = () => this.dismissPlan();
    this._plan = null;
    this.setStatus(r.ok ? "方案已执行" : "方案部分执行");
  },

  dismissPlan(msg) {
    this._plan = null;
    this.planHost().innerHTML = "";
    if (msg) this.setStatus(msg);
  },

  saveChat() {
    try { localStorage.setItem("morimens_pip_chat", JSON.stringify(this.chatLog.slice(-40))); } catch (e) {}
  },

  copySnapshot() {
    if (!this.isOpen()) return;
    const d = this.win.document;
    const q = d.getElementById("pip-input").value.trim();
    const text = `【融灾顾问】${q || "（见下，帮我看看这回合怎么打）"}\n\n${this.snapshotText()}`;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => this.setStatus("已复制——回到 ZCode 粘贴即可"))
      .catch(() => {
        /* 降级：选中复制 */
        const ta = d.createElement("textarea");
        ta.value = text; d.body.appendChild(ta); ta.select();
        try { d.execCommand("copy"); this.setStatus("已复制——回到 ZCode 粘贴即可"); }
        catch (e) { this.setStatus("复制失败，请手动复制输入框内容"); }
        ta.remove();
      });
  }
};

window.PipPanel = PipPanel;
