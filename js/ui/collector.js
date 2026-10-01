/* =========================================================
 * UI · 数据采集悬浮窗（Document Picture-in-Picture）
 * ---------------------------------------------------------
 * 模板化记录：怪物(意图链)/卡牌实测(含启灵/灵塑/灵格上下文)/造物/密契/机制/自由
 * 附：📸局面快照、🗺地图(pointy-top六边形；沙盘编辑/使用行走，一次性格子走后封路)、收起
 * 导出：复制全部(markdown) / 下载 .json —— 均走主窗口（PiP 内剪贴板/下载受限）
 * ========================================================= */
"use strict";

const Collector = {

  win: null,
  cat: "monster",
  drafts: {},            // 分类→字段草稿
  intents: [],           // 怪物意图链草稿 [{n,v}]，间隔 transitions [t,...]
  collapsed: false,

  CATS: [
    { id: "monster",    icon: "👹", label: "怪物·战斗" },
    { id: "card",       icon: "🃏", label: "卡牌实测" },
    { id: "relic",      icon: "🏺", label: "造物" },
    { id: "pact",       icon: "🧿", label: "密契" },
    { id: "mech",       icon: "❓", label: "机制疑问" },
    { id: "free",       icon: "📝", label: "自由记录" },
    { id: "mons",       icon: "👾", label: "怪物图鉴" }   /* 伪分类：同名聚合只读视图（T33 一期），无保存表单 */
  ],
  /* 已移除分类（旧记录仍可查看/导出，编辑被守卫拦截）：命轮/角色面板/角色启灵（2026-09-26，wiki.js 供给）、
   * 卡牌理论（2026-10-02，T32 全量入库后 wiki 数据冗余） */

  _atlasOpen: null,      /* 图鉴当前展开的怪名（单开） */
  _topLocked: false,     /* T35：地图战斗期间顶栏选择器已锁定 */

  isOpen() { return this.win && !this.win.closed; },
  _load() { try { return JSON.parse(localStorage.getItem("morimens_collector") || "[]"); } catch (e) { return []; } },
  _save(list) { try { localStorage.setItem("morimens_collector", JSON.stringify(list)); } catch (e) {} },

  /* ================= 剪贴板/下载：全部走主窗口 ================= */
  copyText(text, okMsg) {
    const fallback = () => {
      const ta = document.createElement("textarea");   // 主文档
      ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      this.setStatus(ok ? (okMsg || "已复制") : "复制失败，请手动选择输入框内容复制");
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => this.setStatus(okMsg || "已复制")).catch(fallback);
      } else fallback();
    } catch (e) { fallback(); }
  },

  downloadJSON(obj, filename) {
    /* 主窗口锚点触发下载（PiP 文档内下载无效果） */
    const blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
    const a = document.createElement("a");   // 主文档
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    this.setStatus(`已下载 ${filename}`);
  },

  /* ================= 开窗 ================= */
  async open() {
    if (!("documentPictureInPicture" in window)) {
      Log.add('<span class="warn-text">采集窗需要 Chrome/Edge 116+ 且经 start.bat（http 访问）。</span>', "sys");
      alert("采集窗需要 Chrome/Edge 116+，并通过 start.bat 访问。");
      return;
    }
    if (this.isOpen()) { this.win.focus(); return; }
    try {
      const w = await documentPictureInPicture.requestWindow({ width: 330, height: 660 });
      this.win = w;
      [...document.styleSheets].forEach(sheet => {
        try {
          const style = w.document.createElement("style");
          style.textContent = [...sheet.cssRules].map(r => r.cssText).join("\n");
          w.document.head.appendChild(style);
        } catch (e) {}
      });
      this.collapsed = localStorage.getItem("morimens_collector_collapsed") === "1";
      w.document.body.innerHTML = `
        <div class="pip-shell">
          <div class="pip-head">📋 数据采集 <span class="dim" style="font-weight:normal">导出发给助手入库</span>
            <button class="pip-col" id="col-collapse" title="收起/展开">${this.collapsed ? "▸" : "▾"}</button>
            <button class="pip-close" title="关闭">✕</button></div>
          <div class="col-wrap" id="col-wrap" style="${this.collapsed ? "display:none" : ""}">
            <div class="col-body">
              <div class="col-form" id="col-form"></div>
              <div class="col-list-head">已记录 <span id="col-count"></span> 条
                <button id="col-snap" class="mini-btn" title="截图模拟器整页并下载 PNG">📸截图</button>
                <button id="col-shotgame" class="mini-btn" title="截取屏幕/游戏窗口/任意标签页（弹窗中选择）">📷游戏画面</button>
                <button id="col-copy" class="mini-btn">复制全部</button>
                <button id="col-dl" class="mini-btn">下载 .json</button>
                <button id="col-clear" class="mini-btn">清空</button>
              </div>
              <div class="col-list" id="col-list"></div>
              <div class="col-list-head">🗺 地图
                <button id="col-mode-edit" class="mini-btn" title="编辑地块：添加/右键选类型/双击填内容">沙盘</button>
                <button id="col-mode-use" class="mini-btn" title="按格子行走：点击相邻格移动">使用</button>
                <button id="col-map-save" class="mini-btn" title="复制地图 JSON（单行）到剪贴板，可粘贴给助手">复制</button>
                <button id="col-map-dl" class="mini-btn" title="下载地图 JSON 文件到本地（浏览器默认下载目录）">本地保存</button>
                <button id="col-map-import" class="mini-btn" title="粘贴地图 JSON 载入（覆盖当前地图）">导入</button>
                <button id="col-level-save" class="mini-btn" title="打包地图+关联战斗记录为关卡 JSON（复制到剪贴板，可分享）">📦存关卡</button>
                <button id="col-level-load" class="mini-btn" title="粘贴关卡 JSON：导入地图，并以关卡内版本替换同号战斗">📥入关卡</button>
                <button id="col-map-clear" class="mini-btn">清空地图</button>
                <button id="col-keys" class="mini-btn" style="display:none" title="锈蚀钥匙：事件获得，最多一把，开门不消耗">🔑无</button>
                <span id="col-map-shift" class="mini-tools" style="display:none">整图平移
                  <input id="col-shift-dx" class="col-in" style="flex:0 0 40px" value="0" title="行偏移（正=向下）">
                  <input id="col-shift-dy" class="col-in" style="flex:0 0 40px" value="0" title="列偏移（正=向右）">
                  <button id="col-map-shift-go" class="mini-btn" title="全部格子按行/列偏移平移（越界丢弃）">↦平移</button>
                </span>
              </div>
              <div class="hexmap-wrap"><div class="hexmap" id="col-hexmap"></div>
                <div class="dim" id="col-map-hint" style="padding:2px 8px;font-size:10px"></div>
              </div>
            </div>
          </div>
        </div>`;
      w.document.title = "忘却前夜 · 数据采集";
      w.document.querySelector(".pip-close").onclick = () => w.close();
      w.document.getElementById("col-collapse").onclick = () => this.toggleCollapse();
      w.document.getElementById("col-copy").onclick = () => this.exportCopy();
      w.document.getElementById("col-dl").onclick = () => this.exportFile();
      w.document.getElementById("col-clear").onclick = () => {
        if (w.confirm("清空全部采集记录？")) { this._save([]); this.renderList(); }
      };
      w.document.getElementById("col-snap").onclick = () => this.takeScreenshot();
      w.document.getElementById("col-shotgame").onclick = () => this.takeGameScreenshot();
      w.document.getElementById("col-mode-edit").onclick = () => this.setMapMode("edit");
      w.document.getElementById("col-mode-use").onclick = () => this.setMapMode("use");
      w.document.getElementById("col-map-save").onclick = () => this.exportMap();
      w.document.getElementById("col-map-dl").onclick = () => this.downloadMap();
      w.document.getElementById("col-level-save").onclick = () => this.exportLevel();
      w.document.getElementById("col-level-load").onclick = () => this.importLevel();
      w.document.getElementById("col-map-import").onclick = () => this.importMap();
      w.document.getElementById("col-map-clear").onclick = () => { if (w.confirm("清空地图？")) { this.mapCells = { cells: {} }; this.mapPos = null; this.runKeys = 0; this.runHei = 0; this.runHp = 0; this.runMaxHp = 0; this.saveMap(); this.renderMap(); } };
      /* 整图平移（沙盘）：全部格子按行/列偏移，越界丢弃，出生点跟随 */
      w.document.getElementById("col-map-shift-go").onclick = () => {
        const dr = parseInt(w.document.getElementById("col-shift-dx").value, 10) || 0;
        const dc = parseInt(w.document.getElementById("col-shift-dy").value, 10) || 0;
        if (!dr && !dc) { this.setStatus("偏移量为 0"); return; }
        const cells = this.mapCells.cells || {};
        const moved = {};
        let dropped = 0;
        for (const [k, v] of Object.entries(cells)) {
          const [r, c] = k.split(",").map(Number);
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= this.MAP_ROWS || nc < 0 || nc >= this.MAP_COLS) { dropped++; continue; }
          moved[nr + "," + nc] = v;
        }
        this.mapCells.cells = moved;
        if (this.mapPos) {
          const [pr, pc] = this.mapPos.split(",").map(Number);
          const np = (pr + dr) + "," + (pc + dc);
          if (moved[np]) this.mapPos = np;
        }
        this.saveMap(); this.renderMap();
        this.setStatus(`整图平移 行${dr > 0 ? "+" : ""}${dr} 列${dc > 0 ? "+" : ""}${dc}（${Object.keys(moved).length}格${dropped ? `，越界丢弃${dropped}` : ""}）`);
      };
      w.document.getElementById("col-keys").onclick = () => { this.runKeys = this.runKeys ? 0 : 1; this.saveMap(); this.renderMap(); };
      w.addEventListener("pagehide", () => { this.win = null; this.unlockTopSelectors(); });
      this.mapCells = this.loadMap();
      this.mapPos = this.mapCells.pos || null;
      this.runKeys = this.mapCells.keys || 0;
      this.runHei = this.mapCells.hei || 0;
      this.runHp = this.mapCells.hp || 0;
      this.runMaxHp = this.mapCells.maxHp || 0;
      this.setMapMode("edit");
      this.renderForm();
      this.renderList();
      this.renderMap();
      Log.add("📋 数据采集窗已开启", "sys");
    } catch (e) {
      Log.add(`<span class="warn-text">采集窗开启失败：${e.message}</span>`, "sys");
    }
  },

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    localStorage.setItem("morimens_collector_collapsed", this.collapsed ? "1" : "0");
    const wrap = this.win.document.getElementById("col-wrap");
    if (wrap) wrap.style.display = this.collapsed ? "none" : "";
    const btn = this.win.document.getElementById("col-collapse");
    if (btn) btn.textContent = this.collapsed ? "▸" : "▾";
  },

  setStatus(t) {
    if (!this.isOpen()) return;
    const el = this.win.document.getElementById("col-status");
    if (el) el.textContent = t || "";
  },

  /* ================= 草稿 ================= */
  _draft(cat, key, val) {
    this.drafts[cat] = this.drafts[cat] || {};
    if (val !== undefined) this.drafts[cat][key] = val;
    return this.drafts[cat][key] || "";
  },

  _field(label, key, type = "text", rows = 0, extra = "") {
    const cur = this._draft(this.cat, key);
    let el;
    if (type === "textarea") {
      el = `<textarea class="col-in" data-k="${key}" rows="${rows}">${cur}</textarea>`;
    } else if (type === "select") {
      el = `<select class="col-in" data-k="${key}">${label.opts.map(o => `<option value="${o}" ${cur === o || (!cur && o === label.def) ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    } else {
      el = extra.includes("value=") ? `<input type="${type}" class="col-in" data-k="${key}" ${extra}>`
        : `<input type="${type}" class="col-in" data-k="${key}" value="${cur}" ${extra}>`;
    }
    return `<div class="col-field"><span class="col-lb">${type === "select" ? label.label : label}</span>${el}</div>`;
  },

  /* 怪物批次草稿：{ diff, wave, enemies: [{no,name,hp,statusTiming,intents:[{n,v}],trans:[]}] }
   * 一场战斗的多只怪记为一条（难度/波次填一次） */
  /* 难度标签归一化：旧「普通/困难/噩梦/癫狂」与「普通n1」等混写、引擎键（normal/hard/…）→ 统一 n1-n7 */
  normalizeDiff(d) {
    const s = String(d || "").trim();
    if (/^n[1-7]$/i.test(s)) return s.toLowerCase();
    const eng = { normal: "n1", hard: "n2", nightmare: "n3", insane: "n4" };
    if (eng[s.toLowerCase()]) return eng[s.toLowerCase()];
    if (/^普通/.test(s)) return "n1";
    if (/^困难/.test(s)) return "n2";
    if (/^噩梦/.test(s)) return "n3";
    if (/^癫狂/.test(s)) return "n4";
    return s;
  },

  getMB() {
    if (!this.drafts.monster || !Array.isArray(this.drafts.monster.enemies)) {
      const old = this.drafts.monster || {};
      this.drafts.monster = { diff: old.diff || "", wave: old.wave || "", fno: old.fno || "", enemies: [] };
    }
    return this.drafts.monster;
  },
  /* 战斗编号（fno）：与地图战斗格关联；历史最大+1 */
  autoFightNo() {
    let mx = 0;
    for (const e of this._load()) {
      if (e.cat !== "monster") continue;
      if (e.fields.fno) mx = Math.max(mx, parseInt(e.fields.fno, 10) || 0);
      else if (Array.isArray(e.fields.batch)) for (const b of e.fields.batch) mx = Math.max(mx, parseInt(b.no, 10) || 0);   // 旧记录无 fno：用怪物编号兜底
    }
    return mx + 1;
  },
  addEnemyBlock() {
    const mb = this.getMB();
    let mx = 0;   // 怪物编号全局自动+1（历史记录+当前草稿，兼容新旧格式）
    for (const e of this._load()) {
      if (e.cat !== "monster") continue;
      if (Array.isArray(e.fields.batch)) for (const b of e.fields.batch) mx = Math.max(mx, parseInt(b.no, 10) || 0);
      else if (e.fields.no) mx = Math.max(mx, parseInt(e.fields.no, 10) || 0);
    }
    for (const en of mb.enemies) mx = Math.max(mx, parseInt(en.no, 10) || 0);
    mb.enemies.push({ no: String(mx + 1), name: "", lv: "", hp: "", statusTiming: "", intents: [{ n: "", v: "" }], trans: [] });
    return mb.enemies.length - 1;
  },

  /* ================= 表单 ================= */
  renderForm() {
    if (!this.isOpen()) return;
    const d = this.win.document;
    const form = d.getElementById("col-form");
    if (!form) return;
    const catBar = `<div class="col-cats">${this.CATS.map(c =>
      `<button class="col-cat ${this.cat === c.id ? "on" : ""}" data-c="${c.id}">${c.icon}${c.label}</button>`).join("")}</div>`;

    let fields = "";
    const c = this.cat;
    if (c === "mons") {   /* 👾 怪物图鉴：同名聚合+变体对照+一键去重（只读，无保存按钮） */
      form.innerHTML = `${catBar}${this.renderAtlas()}`;
      form.querySelectorAll(".col-cat").forEach(btn => {
        btn.onclick = () => { this.cat = btn.dataset.c; this.renderForm(); };
      });
      this.bindAtlas(form);
      return;
    }
    if (c === "monster") {
      const mb = this.getMB();
      if (!mb.enemies.length) this.addEnemyBlock();
      if (!mb.fno) mb.fno = String(this.autoFightNo());   // 战斗编号自动分配（可改）
      const opt = (v, cur) => `<option ${v === cur ? "selected" : ""}>${v}</option>`;
      fields =
        `<div class="col-field"><span class="col-lb">难度</span>
        <select class="col-in" data-mb="diff">${["n1", "n2", "n3", "n4", "n5", "n6", "n7"].map(v => opt(v, this.normalizeDiff(mb.diff) || "n1")).join("")}</select>
        <span class="col-lb" title="与地图战斗格关联的编号">战斗#</span>
        <input class="col-in" style="flex:0 0 52px" value="${mb.fno}" data-mb="fno"></div>
        <div id="col-enemies"></div>
        <div class="col-field"><button class="mini-btn" id="col-enemy-add">＋怪物（同场战斗）</button>
        <button class="mini-btn" id="col-battle-new" title="清空当前怪物模板，开始录下一场战斗">🆕新战斗</button>
        <span class="dim" style="font-size:10px">保存后模板保留：换难度改数值直接再存（战斗#自动+1）</span></div>`;
    } else if (c === "card") {
      fields =
        this._field("角色", "char") +
        this._field("卡名", "name") +
        this._field({ label: "等级", opts: ["1", "2", "3", "4", "5", "6"], def: "1" }, "lv", "select") +
        this._field("启灵", "qiling", "text", 0, 'placeholder="如 3启 / +7（实测时角色状态）"') +
        this._field("灵塑适性", "lingsu", "number", 0, 'placeholder="1-10"') +
        this._field("内在灵格", "lingge", "number", 0, 'placeholder="实测时灵格"') +
        this._field("实际数值", "val", "textarea", 2) +
        this._field("自身 buff（实测所挂）", "selfBuffs", "text") +
        this._field("敌人 buff（实测所挂）", "enemyBuffs", "text");
    } else if (c === "relic") {
      fields =
        this._field("名字", "name") +
        this._field("效果（个人数据，公式未定）", "val", "textarea", 2);
    } else if (c === "pact") {
      fields =
        this._field({ label: "模式", opts: ["套装", "单个"], def: "套装" }, "mode", "select") +
        this._field("套装名", "setname") +
        this._field("部位(1-6)", "part", "number") +
        this._field("主属性", "mainStat") +
        this._field("强化(0-12)", "enh", "number") +
        this._field("词条（分号分隔：暴击率3,暴击伤害2.4…）", "subs", "text") +
        this._field("套装效果", "val", "textarea", 2);
    } else if (c === "mech") {
      fields =
        this._field("标题", "title") +
        this._field("描述（含实测数值）", "desc", "textarea", 3);
    } else {
      fields = this._field("内容", "text", "textarea", 4);
    }
    form.innerHTML = `${catBar}${fields}
      <div class="col-field"><button id="col-save" class="pip-btn-send" style="width:100%">➕ 保存这条</button></div>`;

    d.getElementById("col-save").onclick = () => this.saveEntry();
    form.querySelectorAll("[data-k]").forEach(el => {
      el.addEventListener("input", () => this._draft(this.cat, el.dataset.k, el.value));
      el.addEventListener("change", () => this._draft(this.cat, el.dataset.k, el.value));
    });
    form.querySelectorAll(".col-cat").forEach(btn => {
      btn.onclick = () => { this.cat = btn.dataset.c; this.renderForm(); };
    });
    if (c === "monster") {
      form.querySelectorAll("[data-mb]").forEach(el => {
        el.addEventListener("input", () => { this.getMB()[el.dataset.mb] = el.value; });
        el.addEventListener("change", () => { this.getMB()[el.dataset.mb] = el.value; });
      });
      d.getElementById("col-enemy-add").onclick = () => { this.addEnemyBlock(); this.renderEnemies(); };
      d.getElementById("col-battle-new").onclick = () => {
        if (this.win.confirm("清空当前怪物模板，开始录下一场战斗？（已保存的记录不受影响）")) {
          this.drafts.monster = {};
          this.renderForm();
        }
      };
      this.renderEnemies();
    }
  },

  /* 怪物批次子表：每只怪一块（名称/HP/状态/意图链+转换），✕ 删除该怪 */
  /* ================= 怪物/意图模板库 =================
   * 来源：采集记录（同名词后采覆盖=最新）+ DBF.enemies 已入库怪 */
  monsterTemplates() {
    const map = new Map();
    for (const e of this._load()) {
      if (e.cat !== "monster" || !Array.isArray(e.fields.batch)) continue;
      for (const b of e.fields.batch) {
        if (!b.name) continue;
        map.set(b.name.trim(), {
          lv: b.lv || "", hp: b.hp || "", statusTiming: b.statusTiming || "", summon: !!b.summon,
          summonedBy: b.summonedBy || "",
          stages: Array.isArray(b.stages) ? b.stages.map(s => ({ at: s.at, hp: s.hp, ...(s.buff ? { buff: s.buff } : {}) })) : [],
          intents: Array.isArray(b.intentRows) && b.intentRows.length ? b.intentRows.map(r => ({
            n: r.n, v: r.v, once: !!r.once,
            ...(r.cond ? { cond: r.cond } : {}), ...(r.goto != null && r.goto !== "" ? { goto: r.goto } : {}), ...(r.wait ? { wait: true } : {})
          })) : null,
          trans: Array.isArray(b.intentRows) ? b.intentRows.slice(0, -1).map(r => r.t || "下回合开始") : null
        });
      }
    }
    for (const e of (window.DBF.enemies || [])) {
      if (map.has(e.name)) continue;
      /* 值格式化：库内 value/per 常为难度对象 {normal,...}——直接字符串拼接会变 [object Object] */
      const fmtVal = x => x == null ? "" : (typeof x === "object" ? (x.normal != null ? String(x.normal) : "") : String(x));
      const intents = (e.actions || []).map(a => ({
        n: a.name,
        v: a.type === "attack" ? fmtVal(a.value) + (a.times > 1 ? "*" + a.times : "")
          : a.type === "buff" && a.buffId === "debuff_poison" ? (a.per != null ? fmtVal(a.per) + "中毒" : "")
          : "",
        ...(a.cond ? { cond: a.cond } : {}), ...(a.goto ? { goto: a.goto } : {}), ...(a.wait ? { wait: true } : {})
      }));
      map.set(e.name, { lv: "", hp: String((e.hp && e.hp.normal) ?? ""), statusTiming: (e.passives || [])[0] || "",
        summon: /召唤|待召唤/.test(e.notes || "") || /（召唤）/.test(e.name),
        intents: intents.length ? intents : null, trans: null });
    }
    return map;
  },
  /* 意图名 → 最近一次数值（同名词后采覆盖） */
  intentIndex() {
    const idx = new Map();
    for (const e of this._load()) {
      if (e.cat !== "monster" || !Array.isArray(e.fields.batch)) continue;
      for (const b of e.fields.batch) for (const r of (b.intentRows || [])) if (r.n) idx.set(r.n.trim(), r.v || "");
    }
    return idx;
  },

  /* ================= 怪物图鉴（T33 一期） =================
   * 同名聚合：全部采集记录的怪物实例（含旧单怪格式）按怪名归组
   * 变体对照：组内按 难度→lv→HP 排序，跨难度/lv/召唤档并排；
   * 同档差异标记：同难度+同lv+同召唤位 但 HP/意图不同 = ⚠（疑似误采或浮动，人工对照）
   * 一键去重：内容完全相同的战斗记录（难度+战斗#+整批怪物逐字段）只保留最早一条 */
  monsterAtlas() {
    const map = new Map();   /* 怪名 → 变体[] */
    const add = (name, v) => {
      name = String(name || "").trim();
      if (!name) return;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(v);
    };
    this._load().forEach((e, ri) => {
      if (e.cat !== "monster") return;
      const diff = this.normalizeDiff(e.fields.diff) || "?";
      const fno = String(e.fields.fno || "");
      const mk = b => ({
        ri, diff, fno, time: e.time || "",
        no: String(b.no || ""), lv: String(b.lv || ""), hp: String(b.hp || ""),
        summon: !!b.summon,
        summonedBy: String(b.summonedBy || ""),
        stages: Array.isArray(b.stages) ? b.stages.length : 0,
        statusTiming: String(b.statusTiming || ""),
        intents: Array.isArray(b.intentRows)
          ? b.intentRows.map(r => `${r.n || "?"}${r.v ? `(${r.v})` : ""}${r.once ? "【仅一次】" : ""}${r.wait ? "⏸" : ""}${r.cond ? `{${r.cond}⇒行${r.goto || "→"}}` : ""}`)
          : (Array.isArray(b.intents) ? b.intents.map(String) : []),
        raw: b
      });
      if (Array.isArray(e.fields.batch)) {
        for (const b of e.fields.batch) add(b.name, mk(b));
      } else if (e.fields.name) {   /* 旧单怪格式 */
        add(e.fields.name, mk(e.fields));
      }
    });
    const DORD = ["n1", "n2", "n3", "n4", "n5", "n6", "n7"];
    const num = s => parseFloat(String(s).replace(/[^\d.]/g, "")) || 0;
    for (const vs of map.values()) {
      vs.sort((x, y) => {
        const dx = DORD.indexOf(x.diff), dy = DORD.indexOf(y.diff);
        if (dx !== dy) return (dx < 0 ? 99 : dx) - (dy < 0 ? 99 : dy);
        const lx = num(x.lv), ly = num(y.lv);
        if (lx !== ly) return lx - ly;
        return num(x.hp) - num(y.hp);
      });
    }
    const names = [...map.keys()].sort((a, b) => {
      const d = map.get(b).length - map.get(a).length;
      return d !== 0 ? d : a.localeCompare(b, "zh");
    });
    const dbfNames = new Set((window.DBF.enemies || []).map(x => x.name));
    /* 同档差异：同 难度+lv+召唤位 的多变体内容不一致 → 标 ⚠ */
    const warn = new Set();   /* 变体对象引用 */
    for (const vs of map.values()) {
      const bins = new Map();
      for (const v of vs) {
        const k = `${v.diff}|${v.lv}|${v.summon ? 1 : 0}`;
        if (!bins.has(k)) bins.set(k, []);
        bins.get(k).push(v);
      }
      for (const bin of bins.values()) {
        if (bin.length < 2) continue;
        const fp = v => JSON.stringify([v.hp, v.stages, v.statusTiming, v.intents]);
        const first = fp(bin[0]);
        if (bin.some(v => fp(v) !== first)) bin.forEach(v => warn.add(v));
      }
    }
    return { map, names, dbfNames, warn };
  },

  /* 战斗记录内容指纹：难度+战斗#+整批怪物逐字段（顺序敏感；旧单怪格式按单怪批参与） */
  battleFingerprint(e) {
    const norm = b => ({
      no: String(b.no || "").trim(), name: String(b.name || "").trim(),
      lv: String(b.lv || "").trim(), hp: String(b.hp || "").trim(),
      summon: !!b.summon,
      summonedBy: String(b.summonedBy || "").trim(),
      statusTiming: String(b.statusTiming || "").trim(),
      stages: Array.isArray(b.stages) ? b.stages.map(s => ({ at: s.at, hp: String(s.hp || "").trim(), ...(s.buff ? { buff: String(s.buff).trim() } : {}) })) : [],
      intents: Array.isArray(b.intents) ? b.intents.map(String) : [],
      intentRows: Array.isArray(b.intentRows)
        ? b.intentRows.map(r => ({
            n: String(r.n || "").trim(), v: String(r.v || "").trim(), t: String(r.t || "").trim(),
            ...(r.once ? { once: true } : {}),
            ...(r.cond ? { cond: String(r.cond).trim() } : {}),
            ...(r.goto != null && r.goto !== "" ? { goto: r.goto } : {}),
            ...(r.wait ? { wait: true } : {})
          }))
        : []
    });
    return JSON.stringify({
      diff: this.normalizeDiff(e.fields.diff) || "",
      fno: String(e.fields.fno || "").trim(),
      batch: (Array.isArray(e.fields.batch) ? e.fields.batch : [e.fields]).map(norm)
    });
  },

  countBattleDups() {
    const list = this._load(), seen = new Set();
    let dups = 0;
    for (const e of list) {
      if (e.cat !== "monster") continue;
      const fp = this.battleFingerprint(e);
      if (seen.has(fp)) dups++;
      else seen.add(fp);
    }
    return dups;
  },

  /* 一键去重：重复记录整条删除（保最早一条），返回去除数；不弹确认（调用方负责） */
  dedupBattles() {
    const list = this._load(), seen = new Map(), kill = new Set();
    list.forEach((e, i) => {
      if (e.cat !== "monster") return;
      const fp = this.battleFingerprint(e);
      if (seen.has(fp)) kill.add(i);
      else seen.set(fp, i);
    });
    if (kill.size) this._save(list.filter((_, i) => !kill.has(i)));
    return kill.size;
  },

  renderAtlas() {
    const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const { map, names, dbfNames, warn } = this.monsterAtlas();
    const total = [...map.values()].reduce((s, v) => s + v.length, 0);
    const dups = this.countBattleDups();
    let html = `<div class="col-field"><span class="col-lb">👾 同名聚合</span>
      <span class="dim" style="flex:1 1 auto">${names.length} 名怪 · ${total} 条变体</span>
      <button class="mini-btn" id="col-atlas-dedup" title="内容完全相同的战斗记录只保留最早一条（难度+战斗#+整批逐字段比对）">🧹去重${dups ? `(${dups})` : ""}</button></div>
    <div class="dim" style="font-size:10px;padding:0 6px 2px">点怪名展开：跨难度/lv 变体对照；⚠=同难度同lv但数值/意图不同；✎跳回编辑</div>`;
    if (!names.length) return html + `<div class="dim" style="padding:4px 8px">（暂无怪物记录——先在「👹怪物·战斗」里录入）</div>`;
    for (const name of names) {
      const vs = map.get(name);
      const diffs = [...new Set(vs.map(v => v.diff))].sort((a, b) => a.localeCompare(b));
      const open = this._atlasOpen === name;
      const inDb = dbfNames.has(name);
      html += `<div class="col-item" data-an="${esc(name)}" style="cursor:pointer">
        <b>${esc(name)}</b><span class="dim">×${vs.length} · ${esc(diffs.join("/"))}${inDb ? " · ✓入库" : ""}${vs.some(v => warn.has(v)) ? " · <span style='color:#e8b84b'>⚠</span>" : ""}</span><span>${open ? "▾" : "▸"}</span></div>`;
      if (!open) continue;
      for (const v of vs) {
        const meta = [
          v.diff, v.lv ? `lv${esc(v.lv)}` : "", v.hp ? `HP ${esc(v.hp)}` : "",
          v.stages ? `${v.stages + 1}管血` : "",
          v.summon ? (v.summonedBy ? `📤←${esc(v.summonedBy)}` : "📤待召唤") : "📍开场",
          v.fno ? `战斗#${esc(v.fno)}` : "", warn.has(v) ? `<span style="color:#e8b84b">⚠同档差异</span>` : ""
        ].filter(Boolean).join(" · ");
        const its = v.intents.length ? `<div class="dim" style="font-size:10px;word-break:break-all;padding:0 6px 3px 14px">意图: ${esc(v.intents.join("→"))}${v.statusTiming ? `<br>状态: ${esc(v.statusTiming)}` : ""}</div>` : "";
        html += `<div class="col-item" style="border-left:2px solid #2a3550;margin-left:8px">
          <span style="flex:1 1 auto;overflow:hidden">${meta}</span>
          <button class="mini-btn col-atlas-edit" data-ari="${v.ri}" title="载入编辑这条战斗记录">✎</button></div>${its}`;
      }
    }
    return html;
  },

  bindAtlas(form) {
    const dedupBtn = form.querySelector("#col-atlas-dedup");
    if (dedupBtn) dedupBtn.onclick = () => {
      const n = this.countBattleDups();
      if (!n) { this.setStatus("没有完全重复的战斗记录"); return; }
      if (this.win.confirm(`发现 ${n} 条内容完全相同的战斗记录，去重后保留最早一条。确认？`)) {
        const removed = this.dedupBattles();
        this.renderForm();
        this.renderList();
        this.setStatus(`已去重：删除 ${removed} 条重复战斗记录`);
      }
    };
    form.querySelectorAll("[data-an]").forEach(el => {
      el.onclick = () => {
        const name = el.dataset.an;
        this._atlasOpen = this._atlasOpen === name ? null : name;
        this.renderForm();
      };
    });
    form.querySelectorAll(".col-atlas-edit").forEach(el => {
      el.onclick = () => this.editEntry(parseInt(el.dataset.ari, 10));
    });
  },


  renderEnemies() {
    if (!this.isOpen() || this.cat !== "monster") return;
    const d = this.win.document;
    const box = d.getElementById("col-enemies");
    if (!box) return;
    const mb = this.getMB();
    const tplNames = [...this.monsterTemplates().keys()];
    const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    box.innerHTML = `<datalist id="col-mon-names">${tplNames.map(n => `<option value="${esc(n)}">`).join("")}</datalist>` +
      mb.enemies.map((en, i) => {
      const fold = !!en.fold;
      const nIntent = (en.intents || []).filter(x => x.n || x.v).length;
      return `
      <div style="border:1px solid var(--line);border-radius:6px;padding:3px 6px;margin:4px 0">
        <div class="col-field"><span class="col-lb">怪${i + 1}·#${en.no}</span>
          <input class="col-in" value="${esc(en.name)}" data-e="${i}" data-ek="name" list="col-mon-names" placeholder="名称（输入可带出模板）">
          <button class="mini-btn" data-efold="${i}" title="折叠/展开意图">${fold ? "▸" : "▾"}</button>
          <button class="mini-btn" data-edel="${i}" title="删除这只怪">✕</button></div>
        <div class="col-field"><span class="col-lb">等级 / HP</span>
          <input class="col-in" style="flex:0 0 70px" value="${en.lv}" data-e="${i}" data-ek="lv" placeholder="等级">
          <input class="col-in" value="${en.hp}" data-e="${i}" data-ek="hp" placeholder="HP">
          <button class="mini-btn" data-esummon="${i}" title="开场在场 / 待召唤（如食尸鬼队长召唤的分殖体）">${en.summon ? "📤待召唤" : "📍开场"}</button></div>
        ${en.summon ? `<div class="col-field"><span class="col-lb">召唤源</span>
          <input class="col-in" value="${esc(en.summonedBy || "")}" data-e="${i}" data-ek="summonedBy" placeholder="#no 或名称（同场召唤它的怪，多源可写「A死后/B」）"></div>` : ""}
        ${fold
          ? `<div class="col-field"><span class="dim" style="font-size:10px">${en.statusTiming ? esc(en.statusTiming).slice(0, 30) + " · " : ""}意图${nIntent}项${(en.stages || []).length ? `·${(en.stages || []).length + 1}管血` : ""}${nIntent ? "：" + en.intents.filter(x => x.n || x.v).map(x => esc(x.n)).join("→") : ""}</span></div>`
          : `<div class="col-field"><input class="col-in" value="${esc(en.statusTiming)}" data-e="${i}" data-ek="statusTiming" placeholder="状态时机(可写特殊状态)"></div>
        <div class="col-field"><span class="col-lb">意图</span>
          <button class="mini-btn" data-eiadd="${i}">＋意图</button>
          <span class="dim" style="font-size:10px">行间「≡」=等价随机；转换填「阶段」或点⬇=转阶段</span></div>
        ${(() => {
          const stageMap = {};
          const stageBuffMap = {};
          for (const s of (en.stages || [])) { stageMap[s.at] = s.hp; stageBuffMap[s.at] = s.buff || ""; }
          let stageNo = 1;
          return en.intents.map((it, j) => {
            let pre = "";
            if (j > 0 && stageMap[j] != null) {
              stageNo++;
              pre = `<div class="col-field"><span class="dim">━━ 第${stageNo}管 ━━</span>
              <input class="col-in" style="flex:0 0 90px" value="${esc(stageMap[j])}" data-e="${i}" data-estagehp="${j}" placeholder="该管血量">
              <input class="col-in" value="${esc(stageBuffMap[j])}" data-e="${i}" data-estagebuff="${j}" placeholder="转阶段状态 如 免疫伤害×1" title="转阶段时自动挂载的状态（名称或 buff_id×层数，分号分隔多个；引擎自动解析）">
              <button class="mini-btn" data-e="${i}" data-estagedel="${j}" title="取消这条阶段线">✕</button></div>`;
            } else if (j === 0) {
              pre = `<div class="col-field"><span class="dim" style="font-size:10px">第1管=${en.hp || "?"}（上方HP），管满后切下一段意图</span></div>`;
            }
            const isEq = (en.trans[j] || "") === "等价";
            return pre + `
          <div class="col-field"><input class="col-in" value="${esc(it.n)}" data-e="${i}" data-ei="${j}" data-eik="n" placeholder="意图名" list="col-mon-names">
          <input class="col-in" style="flex:0 0 110px" value="${esc(it.v)}" data-e="${i}" data-ei="${j}" data-eik="v" placeholder="数值"></div>
          <div class="col-field"><span class="col-lb">定位</span>
            <button class="mini-btn" data-e="${i}" data-eonce="${j}" title="循环内=每次轮到都执行；仅一次=开场执行一次后不再出现">${it.once ? "➊仅一次（循环外）" : "🔁循环内"}</button>
            <button class="mini-btn" data-e="${i}" data-eedge="${j}" title="条件边（T34）：条件成立→跳转指定意图行；⏸等待=条件未中保持本意图（如门之钥按出牌数推进）">${(it.cond != null || it.goto != null || it.wait) ? "⎇✓" : "⎇条件"}</button>
            <button class="mini-btn" data-e="${i}" data-eiup="${j}" ${j === 0 ? "disabled" : ""} title="上移该意图行">↑</button>
            <button class="mini-btn" data-e="${i}" data-eidown="${j}" ${j === en.intents.length - 1 ? "disabled" : ""} title="下移该意图行">↓</button>
            <button class="mini-btn" data-e="${i}" data-eidel="${j}" title="删除该意图行（转移/阶段线随行号自动整理）">✕</button></div>
          ${(it.cond != null || it.goto != null || it.wait) ? `
          <div class="col-field"><span class="col-lb">⎇条件边</span>
            <input class="col-in" style="flex:0 0 86px" value="${esc(it.cond == null ? "" : it.cond)}" data-e="${i}" data-eicond="${j}" placeholder="条件 饥饿>=5" title="左值：状态层数名/hp(%)/出牌/回合；不可解析=回落固定循环">
            <input class="col-in" style="flex:0 0 58px" value="${esc(it.goto == null ? "" : it.goto)}" data-e="${i}" data-eigoto="${j}" placeholder="跳转行号" title="命中后跳到的意图行号（从1数，按整条意图链）">
            <button class="mini-btn" data-e="${i}" data-ewait="${j}" title="等待：条件未中时保持本意图不前进（再点=未命中也照常前进）">⏸${it.wait ? "保持" : "等待"}</button></div>` : ""}
          ${j < en.intents.length - 1 ? `<div class="col-field"><span class="col-lb">└ 转换</span>
          <input class="col-in" value="${esc(en.trans[j] || "下回合开始")}" data-e="${i}" data-et="${j}" placeholder="转换关系">
          <button class="mini-btn" data-e="${i}" data-eeq="${j}" title="与下一行等价：循环中同一位置随机其一">${isEq ? "≡✓" : "≡"}</button>
          <button class="mini-btn" data-e="${i}" data-estageadd="${j + 1}" title="下一行开始为新的一管血（转阶段）">⬇阶段</button></div>` : ""}
        `;}).join("");
        })()}`}
        ${mb.enemies.length > 1 ? `<div class="col-field"><span class="col-lb">排序</span>
          <button class="mini-btn" data-eup="${i}" ${i === 0 ? "disabled" : ""} title="上移">↑</button>
          <button class="mini-btn" data-edown="${i}" ${i === mb.enemies.length - 1 ? "disabled" : ""} title="下移">↓</button></div>` : ""}
      </div>`;
      }).join("");
    const EN = () => this.getMB().enemies;
    box.querySelectorAll("[data-ek]").forEach(el => {
      el.addEventListener("input", () => { EN()[+el.dataset.e][el.dataset.ek] = el.value; });
      /* 名称失焦：完全匹配模板 → 带出等级/HP/状态/意图 */
      if (el.dataset.ek === "name") el.addEventListener("change", () => {
        const en = EN()[+el.dataset.e];
        const name = (en.name || "").trim();
        if (!name) return;
        const tpl = this.monsterTemplates().get(name);
        if (!tpl) return;
        en.lv = tpl.lv; en.hp = tpl.hp; en.statusTiming = tpl.statusTiming; en.summon = tpl.summon;
        en.summonedBy = tpl.summonedBy || "";
        en.stages = (tpl.stages || []).map(s => ({ ...s }));
        if (tpl.intents) { en.intents = tpl.intents.map(r => ({ ...r })); en.trans = [...(tpl.trans || [])]; }
        this.setStatus(`已加载怪物模板「${name}」——数值/意图已带出，改数值后保存即可`);
        this.renderEnemies();
      });
    });
    box.querySelectorAll("[data-eik]").forEach(el => {
      el.addEventListener("input", () => { EN()[+el.dataset.e].intents[+el.dataset.ei][el.dataset.eik] = el.value; });
      /* 意图名失焦：命中历史意图 → 自动带数值 */
      if (el.dataset.eik === "n") el.addEventListener("change", () => {
        const en = EN()[+el.dataset.e], it = en.intents[+el.dataset.ei];
        const n = (it.n || "").trim();
        if (!n) return;
        const idx = this.intentIndex();
        if (idx.has(n)) { it.v = idx.get(n); this.setStatus(`意图「${n}」已带出上次数值：${it.v || "（空）"}`); this.renderEnemies(); }
      });
    });
    box.querySelectorAll("[data-et]").forEach(el => el.addEventListener("input", () => { this.getMB().enemies[+el.dataset.e].trans[+el.dataset.et] = el.value; }));
    box.querySelectorAll("[data-eiadd]").forEach(el => el.onclick = () => { this.getMB().enemies[+el.dataset.eiadd].intents.push({ n: "", v: "" }); this.renderEnemies(); });
    box.querySelectorAll("[data-edel]").forEach(el => el.onclick = () => { this.getMB().enemies.splice(+el.dataset.edel, 1); this.renderEnemies(); });
    box.querySelectorAll("[data-efold]").forEach(el => el.onclick = () => { const en = EN()[+el.dataset.efold]; en.fold = !en.fold; this.renderEnemies(); });
    box.querySelectorAll("[data-esummon]").forEach(el => el.onclick = () => { const en = EN()[+el.dataset.esummon]; en.summon = !en.summon; this.renderEnemies(); });
    box.querySelectorAll("[data-eup]").forEach(el => el.onclick = () => { const i = +el.dataset.eup, a = EN(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; this.renderEnemies(); });
    box.querySelectorAll("[data-edown]").forEach(el => el.onclick = () => { const i = +el.dataset.edown, a = EN(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; this.renderEnemies(); });
    box.querySelectorAll("[data-eonce]").forEach(el => el.onclick = () => {
      const it = EN()[+el.dataset.e].intents[+el.dataset.eonce];
      it.once = !it.once;
      this.renderEnemies();
    });
    /* T34 条件边：⎇ 开/关编辑器；条件/跳转即时写入草稿；⏸等待切换 */
    box.querySelectorAll("[data-eedge]").forEach(el => el.onclick = () => {
      const it = EN()[+el.dataset.e].intents[+el.dataset.eedge];
      if (it.cond === undefined && it.goto === undefined && !it.wait) it.cond = "";
      else { delete it.cond; delete it.goto; delete it.wait; }
      this.renderEnemies();
    });
    box.querySelectorAll("[data-eicond]").forEach(el => el.addEventListener("input", () => {
      EN()[+el.dataset.e].intents[+el.dataset.eicond].cond = el.value;
    }));
    box.querySelectorAll("[data-eigoto]").forEach(el => el.addEventListener("input", () => {
      EN()[+el.dataset.e].intents[+el.dataset.eigoto].goto = el.value;
    }));
    box.querySelectorAll("[data-ewait]").forEach(el => el.onclick = () => {
      const it = EN()[+el.dataset.e].intents[+el.dataset.ewait];
      it.wait = !it.wait;
      this.renderEnemies();
    });
    /* 意图行排序/删除：行移动=位置制转移不变（多数为默认「下回合开始」，特殊转移可后改）；
     * 删除=移除进入该行的转移，其后阶段线行号前移 */
    box.querySelectorAll("[data-eiup]").forEach(el => el.onclick = () => {
      const en2 = EN()[+el.dataset.e], j = +el.dataset.eiup;
      [en2.intents[j - 1], en2.intents[j]] = [en2.intents[j], en2.intents[j - 1]];
      this.renderEnemies();
    });
    box.querySelectorAll("[data-eidown]").forEach(el => el.onclick = () => {
      const en2 = EN()[+el.dataset.e], j = +el.dataset.eidown;
      [en2.intents[j + 1], en2.intents[j]] = [en2.intents[j], en2.intents[j + 1]];
      this.renderEnemies();
    });
    box.querySelectorAll("[data-eidel]").forEach(el => el.onclick = () => {
      const en2 = EN()[+el.dataset.e], j = +el.dataset.eidel;
      en2.intents.splice(j, 1);
      if (j > 0) en2.trans.splice(j - 1, 1);
      else if (en2.trans.length) en2.trans.shift();
      en2.stages = (en2.stages || []).filter(s => s.at !== j).map(s => s.at > j ? { ...s, at: s.at - 1 } : s);
      if (!en2.intents.length) en2.intents.push({ n: "", v: "" });
      this.renderEnemies();
    });
    /* 转阶段线：⬇ 在指定意图行前开新的一管血；✕ 取消；血量即时写入 */
    box.querySelectorAll("[data-estageadd]").forEach(el => el.onclick = () => {
      const en = EN()[+el.dataset.e];
      en.stages = (en.stages || []).filter(s => s.at !== +el.dataset.estageadd);
      en.stages.push({ at: +el.dataset.estageadd, hp: "" });
      en.stages.sort((a, b) => a.at - b.at);
      this.renderEnemies();
    });
    box.querySelectorAll("[data-estagedel]").forEach(el => el.onclick = () => {
      const en = EN()[+el.dataset.e];
      en.stages = (en.stages || []).filter(s => s.at !== +el.dataset.estagedel);
      this.renderEnemies();
    });
    box.querySelectorAll("[data-estagehp]").forEach(el => el.addEventListener("input", () => {
      const en = EN()[+el.dataset.e], at = +el.dataset.estagehp;
      const s = (en.stages || []).find(x => x.at === at);
      if (s) s.hp = el.value;
    }));
    box.querySelectorAll("[data-estagebuff]").forEach(el => el.addEventListener("input", () => {
      const en = EN()[+el.dataset.e], at = +el.dataset.estagebuff;
      const s = (en.stages || []).find(x => x.at === at);
      if (s) s.buff = el.value;
    }));
    /* 等价：转换="等价" → 循环中同一位置随机其一 */
    box.querySelectorAll("[data-eeq]").forEach(el => el.onclick = () => {
      const j = +el.dataset.eeq, en = EN()[+el.dataset.e];
      en.trans[j] = en.trans[j] === "等价" ? "下回合开始" : "等价";
      this.renderEnemies();
    });
  },

  /* 怪物批次子表：见 renderEnemies（旧的 renderIntents 已被其取代） */

  /* ================= 保存 ================= */
  saveEntry() {
    if (!this.isOpen()) return;
    const d = this.win.document;
    const fields = {};
    d.querySelectorAll("#col-form [data-k]").forEach(el => { fields[el.dataset.k] = el.value.trim(); });
    if (this.cat === "monster") {
      const mb = this.getMB();
      const batch = mb.enemies.filter(en => en.name || en.hp || (en.intents || []).some(x => x.n || x.v)).map(en => {
        const intents = en.intents.filter(x => x.n || x.v);
        const f = { no: en.no, name: en.name, hp: en.hp };
        if (en.lv) f.lv = en.lv;
        if (en.summon) f.summon = true;
        if (en.summonedBy) f.summonedBy = String(en.summonedBy).trim();   // 召唤归属：同批次召唤源（#no 或名称）
        if (en.stages && en.stages.length) f.stages = en.stages.map(s => ({ at: s.at, hp: s.hp, ...(String(s.buff || "").trim() ? { buff: String(s.buff).trim() } : {}) }));
        if (en.statusTiming) f.statusTiming = en.statusTiming;
        if (intents.length) {
          f.intents = intents.map(x => x.n + (x.v ? `(${x.v})` : ""));
          f.intentRows = intents.map((x, i) => {
            const row = { n: x.n, v: x.v, t: i < intents.length - 1 ? (en.trans[i] || "下回合开始") : "", ...(x.once ? { once: true } : {}) };
            /* T34 条件边：goto 按草稿行号（1起，含空行）填 → 解析为过滤后链上行号；目标行为空=丢弃跳转留条件 */
            const cond = String(x.cond == null ? "" : x.cond).trim();
            if (cond) row.cond = cond;
            if (x.wait) row.wait = true;
            const g = parseInt(x.goto, 10);
            if (Number.isFinite(g) && g >= 1 && g <= en.intents.length) {
              const pos = intents.indexOf(en.intents[g - 1]);
              if (pos >= 0) row.goto = pos + 1;
            }
            return row;
          });
        }
        return f;
      });
      if (!batch.length) { this.setStatus("请至少填写一只怪（名称/HP/意图任一）"); return; }
      fields.diff = this.normalizeDiff(mb.diff) || "n1";
      fields.fno = mb.fno || String(this.autoFightNo());
      fields.batch = batch;
    }
    if (this.cat === "pact") {
      if (fields.mode === "套装" && !fields.setname) { this.setStatus("套装模式需填套装名"); return; }
    }
    const main = fields.name || fields.char || fields.title || fields.text || fields.setname
      || (Array.isArray(fields.batch) && fields.batch[0] && fields.batch[0].name);
    if (!main) { this.setStatus("请先填写内容"); return; }
    const catDef = this.CATS.find(c => c.id === this.cat);
    const list = this._load();
    const entry = { time: new Date().toLocaleString("zh-CN", { hour12: false }), cat: this.cat, catLabel: catDef.label, icon: catDef.icon, fields };
    if (this.editIdx != null && list[this.editIdx]) {
      entry.time = list[this.editIdx].time;
      list[this.editIdx] = entry;
      this.editIdx = null;
    } else {
      list.push(entry);
    }
    /* 模板模式：保存怪物批次后保留草稿（名称/意图/状态），换难度改数值可直接再存下一档；🆕新战斗才清空 */
    const keepMonster = this.cat === "monster"
      ? { diff: fields.diff, enemies: this.getMB().enemies } : null;
    this._save(list);
    this.drafts[this.cat] = {};
    if (keepMonster) {
      this.drafts.monster = keepMonster;
      /* 战斗编号不保留：下一次保存自动分配新编号（同场不同难度想共用编号就手动改回） */
      this.drafts.monster.fno = "";
    }
    this.renderForm();
    this.renderList();
    this.setStatus(`已保存 ✓（${Array.isArray(fields.batch) ? `战斗#${fields.fno}·${fields.batch.length}只·${fields.diff || ""}` : "1条"}）${Array.isArray(fields.batch) ? "——模板已保留：换难度改数值可直接再存同#战斗；🆕新战斗开始下一场" : ""}`);
  },

  renderList() {
    if (!this.isOpen()) return;
    const d = this.win.document;
    const box = d.getElementById("col-list");
    const cnt = d.getElementById("col-count");
    if (!box) return;
    const list = this._load();
    if (cnt) cnt.textContent = list.length;
    box.innerHTML = list.length ? [...list].reverse().map((e, i) => {
      const idx = list.length - 1 - i;
      let summary = e.fields.name || e.fields.char || e.fields.title || e.fields.setname || String(e.fields.text || "").slice(0, 16);
      let extra = e.fields.hp ? ` HP${e.fields.hp}` : e.fields.lv ? ` ${e.fields.lv}级` : "";
      if (Array.isArray(e.fields.batch)) {   // 怪物批次：战斗#fno 首怪名 等N只
        summary = `战斗#${e.fields.fno || "?"} ${e.fields.batch[0] ? e.fields.batch[0].name : "?"}${e.fields.batch.length > 1 ? ` 等${e.fields.batch.length}只` : ""}`;
        extra = ` ${this.normalizeDiff(e.fields.diff)}`;
      }
      return `<div class="col-item"><span>${e.icon}</span><b>${summary}</b><span class="dim">${extra} ${e.time}</span>
        ${Array.isArray(e.fields.batch) ? `<button class="mini-btn col-copy" data-i="${idx}" title="复制这场战斗为新记录">⧉</button>` : ""}
        <button class="mini-btn col-edit" data-i="${idx}" title="修改">✎</button>
        <button class="mini-btn col-del" data-i="${idx}">✕</button></div>`;
    }).join("") : `<div class="dim" style="padding:4px 8px">（暂无记录）</div>`;
    box.querySelectorAll(".col-del").forEach(btn => {
      btn.onclick = () => { const l = this._load(); l.splice(parseInt(btn.dataset.i, 10), 1); this._save(l); this.renderList(); };
    });
    box.querySelectorAll(".col-copy").forEach(btn => {
      btn.onclick = () => this.copyMonsterEntry(parseInt(btn.dataset.i, 10));
    });
    box.querySelectorAll(".col-edit").forEach(btn => {
      btn.onclick = () => this.editEntry(parseInt(btn.dataset.i, 10));
    });
  },

  /* 修改：把记录载回对应分类表单，保存时原地替换 */
  editEntry(idx) {
    const list = this._load();
    const e = list[idx];
    if (!e) return;
    /* 已移除分类（命轮/角色面板/角色启灵/卡牌理论）：不载入编辑——通用表单保存会丢原字段 */
    if (!this.CATS.some(c => c.id === e.cat)) {
      this.setStatus(`「${e.catLabel || e.cat}」分类已移除——旧记录仅可查看与删除，不载入编辑`);
      return;
    }
    this.editIdx = idx;
    this.cat = e.cat;
    this.drafts[e.cat] = { ...e.fields };
    if (e.cat === "monster" && Array.isArray(e.fields.batch)) {
      /* 批次格式：还原多怪草稿（战斗编号原样保留——编辑不改变战斗#） */
      this.drafts.monster = {
        diff: this.normalizeDiff(e.fields.diff) || "", fno: e.fields.fno || "",
        enemies: e.fields.batch.map(b => ({
          no: b.no || "", name: b.name || "", lv: b.lv || "", hp: b.hp || "", statusTiming: b.statusTiming || "", summon: !!b.summon,
          summonedBy: b.summonedBy || "",
          stages: Array.isArray(b.stages) ? b.stages.map(s => ({ at: s.at, hp: s.hp, ...(s.buff ? { buff: s.buff } : {}) })) : [],
          intents: Array.isArray(b.intentRows) && b.intentRows.length ? b.intentRows.map(r => ({
            n: r.n, v: r.v, once: !!r.once,
            ...(r.cond ? { cond: r.cond } : {}), ...(r.goto != null && r.goto !== "" ? { goto: r.goto } : {}), ...(r.wait ? { wait: true } : {})
          })) : [{ n: "", v: "" }],
          trans: Array.isArray(b.intentRows) ? b.intentRows.slice(0, -1).map(r => r.t || "下回合开始") : []
        }))
      };
    } else if (e.cat === "monster" && Array.isArray(e.fields.intentRows)) {
      /* 旧单怪格式：迁移为单怪批次 */
      this.drafts.monster = {
        diff: this.normalizeDiff(e.fields.diff) || "", fno: e.fields.fno || "",
        enemies: [{
          no: e.fields.no || "", name: e.fields.name || "", hp: e.fields.hp || "", statusTiming: e.fields.statusTiming || "",
          intents: e.fields.intentRows.map(r => ({
            n: r.n, v: r.v, once: !!r.once,
            ...(r.cond ? { cond: r.cond } : {}), ...(r.goto != null && r.goto !== "" ? { goto: r.goto } : {}), ...(r.wait ? { wait: true } : {})
          })),
          trans: e.fields.intentRows.slice(0, -1).map(r => r.t || "下回合开始")
        }]
      };
    }
    this.renderForm();
    this.setStatus(`正在修改第 ${idx + 1} 条（保存后原地替换）`);
  },

  /* ================= 导出（走主窗口） ================= */
  exportMarkdown() {
    const list = this._load();
    if (!list.length) return "";
    const groups = {};
    for (const e of list) (groups[e.catLabel] = groups[e.catLabel] || []).push(e);
    let md = `# 采集数据（${new Date().toLocaleDateString("zh-CN")}）\n`;
    for (const [cat, items] of Object.entries(groups)) {
      md += `\n## ${cat}（${items.length}条）\n`;
      for (const e of items) {
        if (Array.isArray(e.fields.batch)) {   // 怪物批次：一条=一场战斗
          md += `- [${e.time}] 战斗#${e.fields.fno || "?"}；难度: ${this.normalizeDiff(e.fields.diff)}（${e.fields.batch.length}只）\n`;
          for (const b of e.fields.batch) {
            const st = Array.isArray(b.stages) && b.stages.length
              ? `；stages: ${b.stages.map((s, k) => `第${k + 2}管@意图${s.at + 1}=${s.hp}${s.buff ? `（挂:${s.buff}）` : ""}`).join(",")}` : "";
            const intentTxt = (b.intentRows || []).map(r => `${r.n || "?"}(${r.v || ""})${r.once ? "【仅一次】" : ""}${r.wait ? "⏸" : ""}${r.cond ? `{${r.cond}⇒行${r.goto || "→"}}` : ""}`).join("→");
            md += `  - #${b.no} ${b.name || "（未命名）"}${b.lv ? `；lv: ${b.lv}` : ""}${b.hp ? `；hp: ${b.hp}` : ""}${b.summon ? "；【待召唤】" : ""}${b.summonedBy ? `；召唤源: ${b.summonedBy}` : ""}${b.statusTiming ? `；statusTiming: ${b.statusTiming}` : ""}${intentTxt ? `；intents: ${intentTxt}` : ""}${st}\n`;
          }
          continue;
        }
        const kv = Object.entries(e.fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("；");
        md += `- [${e.time}] ${kv}\n`;
      }
    }
    return md;
  },

  exportCopy() {
    const md = this.exportMarkdown();
    if (!md) { this.setStatus("没有可导出的记录"); return; }
    this.copyText(md, "已复制——回到 ZCode 粘贴即可");
  },

  copyText(text, okMsg) {
    /* 主文档兜底复制（PiP 内 clipboard 受限是之前失败根因） */
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      this.setStatus(ok ? (okMsg || "已复制") : "复制失败，请用「下载 .json」");
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => this.setStatus(okMsg || "已复制")).catch(fallback);
      } else fallback();
    } catch (e) { fallback(); }
  },

  exportFile() {
    const list = this._load();
    if (!list.length) { this.setStatus("没有可导出的记录"); return; }
    /* 主窗口锚点（PiP 文档内下载无效果） */
    const blob = new Blob([JSON.stringify(list, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `采集数据-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    this.setStatus("已下载——把文件发给我即可入库");
  },

  /* ================= 截图：html2canvas 渲染主页面 → 下载 PNG ================= */
  async takeScreenshot() {
    if (!(typeof html2canvas === "function")) { this.setStatus("截图库未加载"); return; }
    this.setStatus("截图生成中…");
    try {
      const canvas = await html2canvas(document.body, { backgroundColor: "#0c0e14", scale: 1.5, logging: false, useCORS: true });
      const stamp = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/[/\s:]/g, "-");
      const fname = `截图-${stamp}.png`;
      const a = document.createElement("a");   // 主窗口锚点下载（PiP 内下载无效果）
      a.href = canvas.toDataURL("image/png");
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      const list = this._load();
      list.push({ time: new Date().toLocaleString("zh-CN", { hour12: false }), cat: "snapshot", catLabel: "📸截图", icon: "🖼", fields: { text: `截图已下载：${fname}` } });
      this._save(list);
      this.renderList();
      this.setStatus(`已下载 ${fname}（浏览器默认下载目录）`);
    } catch (e) {
      this.setStatus("截图失败：" + (e.message || e));
    }
  },

  /* ================= 屏幕捕获：截游戏窗口/其他标签页（getDisplayMedia） =================
   * 用户在浏览器弹窗中选择 整个屏幕 / 某窗口 / 某标签页，抓取一帧下载 PNG。
   * 注意：需要 Chrome/Edge；游戏全屏（独占）时选不到，请用无边框窗口模式。 */
  async takeGameScreenshot() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) {
      this.setStatus("此浏览器不支持屏幕捕获（需 Chrome/Edge + http 访问）");
      return;
    }
    this.setStatus("请在弹出的选择框中挑选 屏幕 / 游戏窗口 / 网页标签页…");
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" }, audio: false });
    } catch (e) {
      this.setStatus("已取消或不可用：" + (e.message || e.name));
      return;
    }
    this.setStatus("抓取画面中…");
    try {
      const video = document.createElement("video");   // 主文档
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise(r => setTimeout(r, 350));      // 等首帧渲染
      const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = vw; canvas.height = vh;
      canvas.getContext("2d").drawImage(video, 0, 0, vw, vh);
      for (const t of stream.getVideoTracks()) t.stop();
      const stamp = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/[/\s:]/g, "-");
      const fname = `游戏截图-${stamp}.png`;
      const a = document.createElement("a");           // 主窗口锚点下载
      a.href = canvas.toDataURL("image/png");
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      const list = this._load();
      list.push({ time: new Date().toLocaleString("zh-CN", { hour12: false }), cat: "snapshot", catLabel: "📷游戏画面", icon: "📷", fields: { text: `截图已下载：${fname}（${vw}×${vh}）` } });
      this._save(list);
      this.renderList();
      this.setStatus(`已下载 ${fname}（浏览器默认下载目录）`);
    } catch (e) {
      try { for (const t of (stream && stream.getTracks() || [])) t.stop(); } catch (e2) {}
      this.setStatus("截取失败：" + (e.message || e));
    }
  },

  /* ================= 地图（pointy-top 六边形；沙盘=编辑 / 使用=行走） ================= */
  MAP_ROWS: 12, MAP_COLS: 14,
  mapMode: "edit",       // edit=沙盘（编辑地块） use=使用（点击相邻格移动）
  runKeys: 0,            // 使用模式：锈蚀钥匙（0/1，最多一把，开门不消耗）
  runHei: 0,             // 使用模式：黑印（遗迹买/祭祀/感应）
  runHp: 0,              // 使用模式：当前生命
  runMaxHp: 0,           // 使用模式：最大生命（开新跑时从主页面战斗取；没有则首次感应时问）
  HEX_MENU: ["empty", "monster", "elite", "boss", "event", "shop", "spawn", "once", "tunnel", "door", "illusion", "bones", "pin", "pout", "key", "light", "hazard", "mark"],   // 右键菜单顺序
  hexSvg(inner) {
    return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  },
  /* 图标=内联 SVG（线性风格，贴近游戏内图标） */
  HEX_PATH: {
    monster: '<path d="M4 3.5 15.5 15M16 3.5 4.5 15M12.8 17 17 12.8M3 12.8 7.2 17"/>',
    elite: '<path d="M3.2 3.2 6.9 6.9M16.8 3.2 13.1 6.9M6.9 13.1 3.2 16.8M13.1 13.1 16.8 16.8"/><circle cx="10" cy="10" r="4.6"/><circle cx="8.1" cy="9.7" r="1" fill="currentColor" stroke="none"/><circle cx="11.9" cy="9.7" r="1" fill="currentColor" stroke="none"/><path d="M8.3 14.5v1.7M10 14.8v1.7M11.7 14.5v1.7"/>',
    boss: '<path d="M4.6 6.2C5.2 3.2 6.7 2.1 8.4 1.9M15.4 6.2C14.8 3.2 13.3 2.1 11.6 1.9"/><circle cx="10" cy="9.4" r="4.8"/><circle cx="8.1" cy="9.2" r="1" fill="currentColor" stroke="none"/><circle cx="11.9" cy="9.2" r="1" fill="currentColor" stroke="none"/><path d="M7.8 14v1.7M10 14.4v1.7M12.2 14v1.7"/>',
    event: '<text x="10" y="15" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor" stroke="none" font-family="Consolas,monospace">?</text>',
    shop: '<path d="M3.2 5.8 16.8 5.8M6 5.8 6 14.6M14 5.8 14 14.6M4.2 14.6 15.8 14.6M8 9.4 12 9.4"/>',
    spawn: '<path d="M10 2.6a4.6 4.6 0 0 1 4.6 4.6C14.6 11 10 16.2 10 16.2S5.4 11 5.4 7.2A4.6 4.6 0 0 1 10 2.6Z"/><circle cx="10" cy="7.2" r="1.7" fill="currentColor" stroke="none"/>',
    once: '<path d="M10.6 2.2 8.8 7 12 9.2 8.8 12 10.8 17.8"/><path d="M4.2 5.4 7.6 7.8M15.8 4.8 12.6 8.2M3.8 14.6 7.6 12.2M16.4 14.8 12.6 11.6"/>',
    tunnel: '<path d="M10.8 9.2a1.7 1.7 0 0 1 1.7 1.7 3.4 3.4 0 0 1-3.4 3.4 5.2 5.2 0 0 1-5.2-5.2A7 7 0 0 1 10.9 2.1 8.6 8.6 0 0 1 17.9 9.1"/>',
    door: '<path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9"/><rect x="4.6" y="9" width="10.8" height="7.4" rx="1.4"/><circle cx="10" cy="12.2" r="1.1" fill="currentColor" stroke="none"/>',
    doorOpen: '<path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.3-.9"/><rect x="4.6" y="9" width="10.8" height="7.4" rx="1.4"/>',
    illusion: '<path d="M10 2.4v15.2M2.4 10h15.2M4.7 4.7l10.6 10.6M15.3 4.7 4.7 15.3"/>',
    bones: '<path d="M4.6 16C4.1 10.6 4.9 7.1 7.3 3.7"/><path d="M8.3 16C7.9 11.6 8.7 8.5 10.7 5.3"/><path d="M11.9 16C11.5 12.9 12.3 10.5 14.1 7.7"/><path d="M15.4 16C15.1 14.1 15.6 12.5 16.8 10.5"/>',
    pin: '<path d="M13.2 4H6.8v12h6.4"/><path d="M4.4 10h8.2M9.2 6.6 12.6 10 9.2 13.4"/>',
    pout: '<path d="M6.8 4h6.4v12H6.8"/><path d="M15.6 10H7.4M10.8 6.6 7.4 10l3.4 3.4"/>',
    key: '<circle cx="6.3" cy="6.3" r="3.3"/><path d="M8.7 8.7 16.6 16.6M13.4 13.4 15.6 11.2M11.2 15.6 13.2 17.6"/>',
    light: '<circle cx="10" cy="2.5" r="1.3"/><path d="M10 3.8v1"/><rect x="5.8" y="4.8" width="8.4" height="8.8" rx="2.2"/><path d="M10 6.6c1.1 1.2 1.7 2.1 1.7 3a1.7 1.7 0 0 1-3.4 0c0-.9.6-1.8 1.7-3Z" fill="currentColor" stroke="none"/><path d="M6.8 14.9h6.4"/>',
    hazard: '<path d="M3.6 7.8c2.1-2 4.3-2 6.4 0s4.3 2 6.4 0"/><path d="M3.6 12.4c2.1-2 4.3-2 6.4 0s4.3 2 6.4 0"/>',
    mark: '<circle cx="10" cy="10" r="7.4"/><path d="M10 4.4 13.7 10.8 6.3 10.8Z"/><path d="M10 10.8v4.8M8.1 13.4h3.8"/>'
  },
  HEX_LABEL: { empty: "空格", monster: "战斗", elite: "精英", boss: "Boss", event: "事件", shop: "灰烬遗迹", spawn: "出生点", once: "一次性", tunnel: "隧道", door: "锈蚀门扉", illusion: "幻象", bones: "褪色遗骨", pin: "密道入口", pout: "密道出口", key: "锈蚀钥匙", light: "探照灯", hazard: "蓝色地块", mark: "黑印" },
  isBattle(t) { return t === "monster" || t === "elite" || t === "boss"; },
  /* 出生点：独立出生点格优先，其次兼任出生点的战斗格 */
  findSpawnKey() {
    const cells = this.mapCells.cells || {};
    return Object.keys(cells).find(k => cells[k].type === "spawn")
      || Object.keys(cells).find(k => cells[k].spawn && this.isBattle(cells[k].type))
      || null;
  },
  mapIcon(cell) {
    const t = cell.type;
    if (t === "door") return this.hexSvg(cell.open ? this.HEX_PATH.doorOpen : this.HEX_PATH.door);
    return this.hexSvg(this.HEX_PATH[t] || "");
  },

  loadMap() {
    try {
      const m = JSON.parse(localStorage.getItem("morimens_collector_map") || '{"cells":{},"pos":null}');
      /* 旧格式迁移：「只走一次」标记 → 一次性格子类型；走过标记不入沙盘；事件旧 note → 主题 */
      for (const v of Object.values(m.cells || {})) {
        if (v.once && v.type === "empty") v.type = "once";
        delete v.once; delete v.used;
        if (v.type === "event" && v.note && !v.theme) { v.theme = v.note; delete v.note; }
      }
      return m;
    } catch (e) { return { cells: {}, pos: null }; }
  },
  saveMap() {
    this.mapCells.pos = this.mapPos || null;
    this.mapCells.keys = this.runKeys || 0;
    this.mapCells.hei = this.runHei || 0;
    this.mapCells.hp = this.runHp || 0;
    this.mapCells.maxHp = this.runMaxHp || 0;
    this.mapCells.cells = this.mapCells.cells || {};
    localStorage.setItem("morimens_collector_map", JSON.stringify(this.mapCells));
  },

  /* pointy-top 奇数行右错半格：(r,c) 的六个相邻格 key */
  hexNeighbors(r, c) {
    const d = r % 2
      ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
      : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    return d.map(([dr, dc]) => `${r + dr},${c + dc}`);
  },

  setMapMode(mode, keepRun = false) {
    this.mapMode = mode;
    /* T35：回沙盘=脱离跑关，顶栏选择器解锁（自由沙盘保留手动控制） */
    if (mode === "edit") this.unlockTopSelectors();
    if (!this.isOpen()) return;
    const d = this.win.document;
    const be = d.getElementById("col-mode-edit"), bu = d.getElementById("col-mode-use");
    if (be) be.classList.toggle("on", mode === "edit");
    if (bu) bu.classList.toggle("on", mode === "use");
    /* 复制/本地保存/清空=编辑操作只留沙盘；导入两种模式都在（使用下可贴入地图继续走） */
    const bs = d.getElementById("col-map-save"), bd = d.getElementById("col-map-dl"), bi = d.getElementById("col-map-import"), bc = d.getElementById("col-map-clear");
    if (bs) bs.style.display = mode === "edit" ? "" : "none";
    if (bd) bd.style.display = mode === "edit" ? "" : "none";
    if (bc) bc.style.display = mode === "edit" ? "" : "none";
    if (bi) bi.style.display = "";
    const lsv = d.getElementById("col-level-save");   /* 存关卡=编辑操作只留沙盘；入关卡两种模式都在 */
    if (lsv) lsv.style.display = mode === "edit" ? "" : "none";
    const keysSpan = d.getElementById("col-keys");
    if (keysSpan) keysSpan.style.display = mode === "use" ? "" : "none";
    const shiftSpan = d.getElementById("col-map-shift");
    if (shiftSpan) shiftSpan.style.display = mode === "edit" ? "" : "none";
    if (mode === "use" && !keepRun) {
      /* 进入使用=开一把新走：清走过/触发标记、钥匙与黑印清零、生命回满；
         最大生命优先取主页面当前战斗的队伍生命上限；起点=出生点（没有则点击任意格开始） */
      for (const v of Object.values(this.mapCells.cells || {})) { delete v.used; delete v.done; }
      this.runKeys = 0;
      this.runHei = 0;
      this.runMaxHp = (typeof State !== "undefined" && State.battle && State.battle.team && State.battle.team.maxHp) || 0;
      this.runHp = this.runMaxHp;
      this.mapPos = this.findSpawnKey();
    }
    this.saveMap(); this.renderMap();
  },

  /* 复制：地图 JSON 单行进剪贴板，可粘贴给助手/存档 */
  exportMap() {
    const cells = this.mapCells.cells || {};
    if (!Object.keys(cells).length) { this.setStatus("地图为空，先在沙盘画格子"); return; }
    this.copyText(JSON.stringify({ cells, pos: this.mapPos || null, keys: this.runKeys || 0, hei: this.runHei || 0, hp: this.runHp || 0, maxHp: this.runMaxHp || 0 }), "地图 JSON 已复制——粘贴保存或发给助手");
  },

  /* 本地保存：下载地图 JSON 文件（走主窗口锚点，PiP 内下载无效果）；保存前可命名 */
  downloadMap() {
    const cells = this.mapCells.cells || {};
    if (!Object.keys(cells).length) { this.setStatus("地图为空，先在沙盘画格子"); return; }
    const name = this.win.prompt("给这张地图起个名字（用于文件名与导入后识别）：", this.mapCells.name || "");
    if (name === null) return;   // 取消=不保存
    if (this.mapCells.cells === cells) this.mapCells.name = name.trim();
    const blob = new Blob([JSON.stringify({ name: name.trim(), cells, pos: this.mapPos || null, keys: this.runKeys || 0, hei: this.runHei || 0, hp: this.runHp || 0, maxHp: this.runMaxHp || 0 }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");   // 主窗口锚点
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `地图-${name.trim() || stamp}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    this.setStatus(`已下载 地图-${name.trim() || stamp}-${stamp}.json（浏览器默认下载目录）`);
  },

  /* 导入：粘贴 JSON 整体载入（覆盖当前地图）；保留 note/no/used，非法格丢弃 */
  importMap() {
    const s = this.win.prompt("粘贴地图 JSON（由「保存」导出的单行文本）", "");
    if (s === null) return;
    const t = String(s).trim();
    if (!t) { this.setStatus("未粘贴内容"); return; }
    let m;
    try { m = JSON.parse(t); } catch (e) { this.setStatus("JSON 解析失败"); return; }
    if (!m || typeof m !== "object" || !m.cells || typeof m.cells !== "object") { this.setStatus("格式不对（需含 cells 字段）"); return; }
    const n = this._applyMapJson(m);
    if (!n) { this.setStatus("没有有效格子"); return; }
    this.setStatus(`已导入地图（${n} 格）`);
  },

  /* 地图 JSON → 应用到当前地图（importMap/importLevel 共用）；返回有效格数 */
  _applyMapJson(m) {
    const cells = {};
    for (const [k, v] of Object.entries(m.cells)) {
      const [r, c] = k.split(",").map(Number);
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= this.MAP_ROWS || c < 0 || c >= this.MAP_COLS) continue;
      if (!v || typeof v !== "object" || !this.HEX_LABEL[v.type]) continue;
      const cell = { type: v.type };
      if (v.note) cell.note = String(v.note).slice(0, 60);
      if (v.theme) cell.theme = String(v.theme).slice(0, 60);
      if (Array.isArray(v.opts)) cell.opts = v.opts.map(x => String(x).slice(0, 40)).filter(Boolean).slice(0, 6);
      if (v.no) cell.no = parseInt(v.no, 10) || 0;
      if (v.used) cell.used = true;
      if (v.spawn) cell.spawn = true;
      if (v.open) cell.open = true;
      if (v.done) cell.done = true;
      if (Array.isArray(v.relics)) cell.relics = v.relics.slice(0, 3)
        .map(x => ({ name: String((x && x.name) || "").slice(0, 20), price: Math.max(0, parseInt(x && x.price, 10) || 0), gold: !!(x && x.gold) }));
      if (v.sacs) cell.sacs = parseInt(v.sacs, 10) || 0;
      cells[r + "," + c] = cell;
    }
    if (!Object.keys(cells).length) return 0;
    this.mapCells = { name: m.name || "", cells };
    this.mapPos = (m.pos && cells[m.pos]) ? m.pos : null;
    this.runKeys = parseInt(m.keys, 10) || 0;
    this.runHei = parseInt(m.hei, 10) || 0;
    this.runMaxHp = parseInt(m.maxHp, 10) || 0;
    this.runHp = Math.max(0, parseInt(m.hp, 10) || 0);
    this.saveMap(); this.renderMap();
    return Object.keys(cells).length;
  },

  /* ================= 关卡系统（T35） =================
   * Level JSON = fmt + name + diff + map（整份地图存档）+ battles（关联战斗号的原样怪物记录）
   * 一次导出/导入/分享；导入时以关卡内版本替换同战斗号的记录（其余记录不动） */
  buildLevel(name) {
    const cells = this.mapCells.cells || {};
    const nos = new Set();
    for (const v of Object.values(cells)) if (v && this.isBattle(v.type) && v.no) nos.add(String(v.no));
    const battles = this._load().filter(e => e.cat === "monster" && nos.has(String((e.fields && e.fields.fno) || "")));
    return {
      fmt: "morimens-level-1",
      name: String(name || "").trim() || "未命名关卡",
      diff: [...new Set(battles.map(b => this.normalizeDiff(b.fields.diff)).filter(Boolean))].join("/"),
      map: { name: String(name || "").trim() || "未命名关卡", cells, pos: this.mapPos || null,
        keys: this.runKeys || 0, hei: this.runHei || 0, hp: this.runHp || 0, maxHp: this.runMaxHp || 0 },
      battles
    };
  },

  exportLevel() {
    const cells = this.mapCells.cells || {};
    if (!Object.keys(cells).length) { this.setStatus("地图为空，先在沙盘画格子"); return; }
    const battleCells = Object.values(cells).filter(v => this.isBattle(v.type) && v.no).length;
    const name = this.win.prompt(`关卡名称（${battleCells} 个战斗格）`, this.mapCells.name || "");
    if (name === null) return;
    const lvl = this.buildLevel(name);
    this.copyText(JSON.stringify(lvl),
      `关卡「${lvl.name}」已复制：${Object.keys(cells).length} 格 + ${lvl.battles.length}/${battleCells} 场战斗${lvl.diff ? `（${lvl.diff}）` : ""}——粘贴保存或分享`);
  },

  importLevel() {
    const s = this.win.prompt("粘贴关卡 JSON（由「📦存关卡」导出的单行文本）", "");
    if (s === null) return;
    const t = String(s).trim();
    if (!t) { this.setStatus("未粘贴内容"); return; }
    let m;
    try { m = JSON.parse(t); } catch (e) { this.setStatus("JSON 解析失败"); return; }
    if (!m || m.fmt !== "morimens-level-1" || !m.map || typeof m.map !== "object" || !m.map.cells) {
      this.setStatus("格式不对（需为「📦存关卡」导出的关卡 JSON）"); return;
    }
    const battles = (Array.isArray(m.battles) ? m.battles : []).filter(b =>
      b && b.fields && Array.isArray(b.fields.batch) && b.fields.fno).slice(0, 200);
    const diffs = [...new Set(battles.map(b => this.normalizeDiff(b.fields.diff)).filter(Boolean))];
    if (!this.win.confirm(`导入关卡「${m.name || "未命名"}」？\n\n· 覆盖当前地图（${Object.keys(m.map.cells).length} 格）\n· 以关卡内版本替换 ${battles.length} 场同号战斗${diffs.length ? `\n· 难度：${diffs.join("/")}` : ""}`)) return;
    const n = this._applyMapJson(m.map);
    if (!n) { this.setStatus("关卡地图没有有效格子"); return; }
    const nos = new Set(battles.map(b => String(b.fields.fno)));
    const list = this._load().filter(e => !(e.cat === "monster" && nos.has(String((e.fields && e.fields.fno) || ""))));
    for (const b of battles) list.push({ time: b.time || "关卡导入", cat: "monster", catLabel: "怪物·战斗", icon: "👹", fields: b.fields });
    this._save(list);
    this.renderList();
    this.setStatus(`已导入关卡「${m.name || "未命名"}」：${n} 格 + ${battles.length} 场战斗${diffs.length ? `（${diffs.join("/")}）` : ""}`);
  },

  /* 顶栏选择器锁定/同步（T35）：地图战斗时 波次/难度/等级/守密人 锁定，
   * 难度与波次自动同步本场战斗，等级=该难度推荐等级（autoLevel）；自由沙盘（回沙盘/开始自由战斗/关地图）解锁 */
  lockTopSelectors(engineDiff) {
    try {
      const d = document.getElementById("difficulty-select");
      const w = document.getElementById("wave-select");
      if (!d || !w) return;
      if (engineDiff && [...d.options].some(o => o.value === engineDiff)) d.value = engineDiff;
      w.value = "1";
      if (typeof State !== "undefined" && State.autoLevel) {
        const auto = State.autoLevel(1, d.value);
        const lv = document.getElementById("level-input");
        if (lv) lv.value = auto;
        if (State.battle) State.battle.level = auto;
      }
      d.disabled = true; w.disabled = true;
      const lv = document.getElementById("level-input"), kp = document.getElementById("keeper-input");
      if (lv) lv.disabled = true;
      if (kp) kp.disabled = true;
      this._topLocked = true;
    } catch (e) {}
  },
  unlockTopSelectors() {
    if (!this._topLocked) return;
    this._topLocked = false;
    try {
      for (const id of ["difficulty-select", "wave-select", "level-input", "keeper-input"]) {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
      }
    } catch (e) {}
  },

  mapHint() {
    return this.mapMode === "edit"
      ? "沙盘：点空位添加格子；右键弹菜单选类型/删除（战斗格菜单里可兼选🚩出生点）；双击战斗=改编号(匹配采集记录)+备注，双击事件=填内容"
      : "使用：点相邻格移动；踩战斗格=按编号加载对应「怪物·战斗」记录开打（无匹配=用主页面当前队列）；胜→✔通关，普通/精英可跳过，击败 Boss=探索胜利；败=探索失败（可选是否结束游戏）；🔒门扉需锈蚀钥匙（🔑切换、不消耗）；碎裂格离开后塌成空隙（不可再走）；隧道/灰烬遗迹可反复触发，密道口=单向传送；幻象/遗骨有选择交互；蓝色地块=踩上扣1/20最大生命；黑印格=踩上+25黑印（每把一次）";
  },

  /* 右键：弹出类型选择菜单（一步到位，不再逐个循环） */
  openCellMenu(ev, k) {
    const d = this.win.document;
    this.closeCellMenu();
    const cell = (this.mapCells.cells || {})[k];
    const menu = d.createElement("div");
    menu.id = "hex-menu";
    const spawnToggle = cell && this.isBattle(cell.type)
      ? `<button data-spawntoggle="1" class="menu-extra">${this.hexSvg(this.HEX_PATH.spawn)}🚩 出生点${cell.spawn ? " ✓" : ""}</button>` : "";
    menu.innerHTML = this.HEX_MENU.map(t =>
      `<button data-t="${t}"${cell && cell.type === t ? ' class="cur"' : ""}>${t !== "empty" && this.HEX_PATH[t] ? this.hexSvg(this.HEX_PATH[t]) : ""}${this.HEX_LABEL[t]}${cell && cell.type === t ? " ✓" : ""}</button>`
    ).join("") + spawnToggle + (cell ? `<hr><button class="del" data-del="1">✕ 删除格子</button>` : "");
    d.body.appendChild(menu);
    this._menuDoc = d;
    /* 收进视窗内 */
    menu.style.left = Math.max(2, Math.min(ev.clientX, (d.documentElement.clientWidth || 330) - menu.offsetWidth - 4)) + "px";
    menu.style.top = Math.max(2, Math.min(ev.clientY, (d.documentElement.clientHeight || 560) - menu.offsetHeight - 4)) + "px";
    menu.querySelectorAll("[data-t]").forEach(b => {
      b.onclick = () => {
        const t = b.dataset.t;
        const c = this.mapCells.cells[k] || (this.mapCells.cells[k] = { type: "empty" });
        if (c.type !== t) {
          c.type = t;
          if (t === "empty") { delete c.note; delete c.no; }   // 转空格=清成普通路
          else delete c.note;                                  // 内容只属于当前类型
          if (t !== "door") delete c.open;
          if (!this.isBattle(t)) delete c.spawn;               // 出生点标记只挂在战斗格上
        }
        this.closeCellMenu(); this.saveMap(); this.renderMap();
      };
    });
    const sp = menu.querySelector("[data-spawntoggle]");
    if (sp) sp.onclick = () => {
      const c = this.mapCells.cells[k];
      if (c.spawn) delete c.spawn; else c.spawn = true;
      this.closeCellMenu(); this.saveMap(); this.renderMap();
    };
    const del = menu.querySelector("[data-del]");
    if (del) del.onclick = () => {
      delete this.mapCells.cells[k];
      if (this.mapPos === k) this.mapPos = null;
      this.closeCellMenu(); this.saveMap(); this.renderMap();
    };
    /* 点别处/再次右键 = 关菜单（延后注册，避免被打开菜单的这次事件立刻关掉；once 自清理） */
    setTimeout(() => {
      d.addEventListener("click", this._closeMenu = () => this.closeCellMenu(), { once: true });
      d.addEventListener("contextmenu", this._closeMenuC = (e) => { e.preventDefault(); this.closeCellMenu(); }, { once: true });
    }, 0);
  },
  closeCellMenu() {
    /* 不依赖 win 状态：监听器/菜单挂在打开时的文档上，务必总能清干净 */
    const d = this._menuDoc, h1 = this._closeMenu, h2 = this._closeMenuC;
    this._menuDoc = null; this._closeMenu = null; this._closeMenuC = null;
    if (!d) return;
    const m = d.getElementById("hex-menu");
    if (m) m.remove();
    if (h1) d.removeEventListener("click", h1);
    if (h2) d.removeEventListener("contextmenu", h2);
  },

  /* ================= 地图内小面板 ================= */
  closePanel() {
    const d = this._panelDoc;
    this._panelDoc = null; this._panelKey = null;
    if (!d) return;
    const m = d.getElementById("hex-panel");
    if (m) m.remove();
  },

  /* 事件编辑：主题 + 可增减选项（使用模式踩上会按序号选一项） */
  openEventEditor(k) {
    const d = this.win.document;
    this.closePanel();
    const cell = this.mapCells.cells[k];
    if (!cell) return;
    const opts = Array.isArray(cell.opts) ? [...cell.opts] : [];
    const escA = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const p = d.createElement("div");
    p.id = "hex-panel"; p.className = "hex-panel";
    p.innerHTML =
      `<div class="hp-title"><span>事件 · 主题与选项</span><button data-x="1" title="取消">✕</button></div>
       <div class="hp-row"><span class="hp-tag">主题</span><input class="col-in" id="hp-theme" value="${escA(cell.theme || cell.note || "")}" placeholder="事件主题"></div>
       <div id="hp-opts"></div>
       <div class="hp-row"><button class="mini-btn" id="hp-add">＋选项</button><span class="dim" style="font-size:10px">使用模式踩上会按序号选一项</span></div>
       <div class="hp-foot"><button class="mini-btn" id="hp-ok">确定</button></div>`;
    d.body.appendChild(p);
    this._panelDoc = d; this._panelKey = k;
    const renderOpts = () => {
      p.querySelector("#hp-opts").innerHTML = opts.map((o, i) =>
        `<div class="hp-row"><span class="hp-tag">${i + 1}</span><input class="col-in" data-o="${i}" value="${escA(o)}" placeholder="选项${i + 1}"><button class="mini-btn" data-od="${i}" title="删除该选项">－</button></div>`).join("");
      p.querySelectorAll("[data-o]").forEach(el => el.addEventListener("input", () => { opts[+el.dataset.o] = el.value; }));
      p.querySelectorAll("[data-od]").forEach(el => el.onclick = () => { opts.splice(+el.dataset.od, 1); renderOpts(); });
    };
    renderOpts();
    p.querySelector("#hp-add").onclick = () => { if (opts.length < 6) { opts.push(""); renderOpts(); } };
    p.querySelector("[data-x]").onclick = () => this.closePanel();
    p.querySelector("#hp-ok").onclick = () => {
      const theme = (p.querySelector("#hp-theme").value || "").trim();
      const clean = opts.map(o => (o || "").trim()).filter(Boolean);
      if (theme) cell.theme = theme; else delete cell.theme;
      if (clean.length) cell.opts = clean; else delete cell.opts;
      delete cell.note;   // 主题取代旧内容
      this.closePanel(); this.saveMap(); this.renderMap();
    };
  },

  /* ===== 使用模式生命结算辅助 ===== */
  ensureMaxHp() {
    if (this.runMaxHp) return true;
    const v = parseInt(this.win.prompt("角色最大生命值？（生命条上限，如 2514）", ""), 10);
    if (!v) return false;
    this.runMaxHp = v;
    if (!this.runHp) this.runHp = v;
    return true;
  },
  loseHp(loss) {
    this.runHp = Math.max(0, (this.runHp || this.runMaxHp) - loss);
    /* 同步主页面战斗队伍生命 */
    if (typeof State !== "undefined" && State.battle && State.battle.team) {
      State.battle.team.hp = Math.max(0, State.battle.team.hp - loss);
    }
  },
  deadCheck() {
    if (typeof State !== "undefined" && State.battle && State.battle.team && State.battle.team.hp <= 0 && State.battle.phase !== "prep") {
      Log.add(`<span class="warn-text">☠ 队伍生命耗尽——探索失败</span>`, "turn");
      if (this.win.confirm("☠ 队伍生命耗尽，探索失败！\n\n是否结束游戏？（确定=重置地图回出生点；取消=留在原地）")) this.resetMapRun();
    }
  },

  /* 灰烬遗迹面板：出售3造物（买）、祭祀白银→黄金（1.5×价格+30×本遗迹已祭祀次数）、感应（-30%最大生命→+30黑印） */
  openShop(k) {
    const d = this.win.document;
    this.closePanel();
    const cell = this.mapCells.cells[k];
    if (!cell) return;
    if (!Array.isArray(cell.relics)) cell.relics = [];
    cell.relics = cell.relics.slice(0, 3);
    while (cell.relics.length < 3) cell.relics.push({ name: "", price: "" });
    const escA = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const p = d.createElement("div");
    p.id = "hex-panel"; p.className = "hex-panel";
    p.innerHTML =
      `<div class="hp-title"><span>灰烬遗迹（已祭祀 ${cell.sacs || 0} 次）</span><button data-x="1" title="关闭">✕</button></div>
       <div class="hp-row"><span class="hp-tag">🖤 黑印 <b id="hp-hei">${this.runHei || 0}</b></span>
        <span class="hp-tag">❤ <b id="hp-hp">${this.runHp || "—"}${this.runMaxHp ? "/" + this.runMaxHp : ""}</b></span>
        <span class="hp-tag">🔑${this.runKeys ? "有" : "无"}</span></div>
       ${[0, 1, 2].map(i => {
         const r = cell.relics[i];
         return `<div class="hp-row"><span class="hp-tag">${i + 1}</span>
        <input class="col-in" data-r="${i}" data-rk="name" value="${escA(r.name)}" placeholder="造物${i + 1}">
        <input class="col-in" data-r="${i}" data-rk="price" type="number" style="flex:0 0 50px" value="${escA(r.price)}" placeholder="价格">
        <span class="hp-tag">${r.gold ? "金" : "银"}</span>
        <button class="mini-btn" data-buy="${i}" title="花黑印购买该造物">买</button>
        <button class="mini-btn" data-sac="${i}" title="花费 1.5×价格 + 30×本遗迹已祭祀次数 的黑印，白银→黄金">祭祀</button></div>`;
       }).join("")}
       <div class="hp-foot"><button class="mini-btn" id="hp-sense" title="失去30%最大生命值的生命，获得30黑印">感应</button>
       <button class="mini-btn" id="hp-close">离开（保存）</button></div>`;
    d.body.appendChild(p);
    this._panelDoc = d; this._panelKey = k;
    const sync = () => p.querySelectorAll("[data-r]").forEach(el => { cell.relics[+el.dataset.r][el.dataset.rk] = el.value; });
    const cost = r => Math.round((parseFloat(r.price) || 0) * 1.5) + 30 * (cell.sacs || 0);
    const refresh = () => { sync(); this.saveMap(); this.renderMap(); this.openShop(k); };   // 重开面板刷新显示（含提示行资源）
    const close = () => { sync(); this.closePanel(); this.saveMap(); this.renderMap(); };
    p.querySelector("[data-x]").onclick = close;
    p.querySelector("#hp-close").onclick = close;
    p.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => {
      const rl = cell.relics[+b.dataset.buy];
      const price = parseInt(rl.price, 10) || 0;
      if (!price) { this.setStatus("先填造物价格"); return; }
      if ((this.runHei || 0) < price) { this.setStatus(`黑印不足（需 ${price}）`); return; }
      this.runHei -= price;
      Log.add(`🏺 购买造物「${rl.name || "未命名"}」：-${price} 黑印（余 ${this.runHei}）`, "sys");
      refresh();
    });
    p.querySelectorAll("[data-sac]").forEach(b => b.onclick = () => {
      const rl = cell.relics[+b.dataset.sac];
      const price = parseInt(rl.price, 10) || 0;
      if (!price) { this.setStatus("先填造物价格"); return; }
      const c = cost(rl);
      if ((this.runHei || 0) < c) { this.setStatus(`黑印不足（祭祀需 ${c}）`); return; }
      this.runHei -= c;
      cell.sacs = (cell.sacs || 0) + 1;
      rl.gold = true;
      Log.add(`🗿 祭祀：「${rl.name || "未命名"}」白银→黄金，-${c} 黑印（本遗迹第 ${cell.sacs} 次，下次祭祀再 +30）`, "sys");
      refresh();
    });
    p.querySelector("#hp-sense").onclick = () => {
      if (!this.ensureMaxHp()) return;
      const loss = Math.ceil(this.runMaxHp * 0.3);
      this.loseHp(loss);
      this.runHei = (this.runHei || 0) + 30;
      Log.add(`🖤 感应：生命 -${loss}（余 ${this.runHp}/${this.runMaxHp}），获得 30 黑印（共 ${this.runHei}）`, "sys");
      this.deadCheck();
      refresh();
    };
  },

  renderMap() {
    if (!this.isOpen()) return;
    const d = this.win.document;
    const box = d.getElementById("col-hexmap");
    if (!box) return;
    const hint = d.getElementById("col-map-hint");
    if (hint) hint.textContent = this.mapHint()
      + (this.mapMode === "use" ? ` ｜ 🖤黑印 ${this.runHei || 0} · ❤ ${this.runHp || "—"}${this.runMaxHp ? "/" + this.runMaxHp : ""}` : "");
    const kb = d.getElementById("col-keys");
    if (kb) kb.textContent = this.runKeys ? "🔑有" : "🔑无";
    this.mapCells.cells = this.mapCells.cells || {};
    const cells = this.mapCells.cells;
    const edit = this.mapMode === "edit";
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    let html = "";
    for (let r = 0; r < this.MAP_ROWS; r++) {
      html += `<div class="hexrow ${r % 2 ? "odd" : ""}">`;
      for (let c = 0; c < this.MAP_COLS; c++) {
        const k = `${r},${c}`;
        const cell = cells[k];
        /* 无格子（暗，未探开）；踩过的一次性格 = 塌成同样的无格子状态（数据仍在，封路由 used 判定兜底） */
        if (!cell) {
          html += edit ? `<div class="hex hex-empty" data-add="${k}" title="添加格子"></div>`
            : `<div class="hex hex-empty" style="opacity:.15"></div>`;
          continue;
        }
        if (!edit && cell.type === "once" && cell.used) {
          html += `<div class="hex hex-empty" style="opacity:.15"></div>`;
          continue;
        }
        const icon = this.mapIcon(cell);
        const cls = `${cell.type !== "empty" ? "hex-" + cell.type : "hex-emptycell"} ${!edit && cell.done ? "hex-done" : ""} ${!edit && this.mapPos === k ? "hex-pos" : ""} ${cell.spawn && this.isBattle(cell.type) ? "hex-spawnflag" : ""}`;
        const main = cell.theme || cell.note;
        const tip = `${this.HEX_LABEL[cell.type] || cell.type}${cell.spawn && this.isBattle(cell.type) ? "🚩" : ""}${cell.type === "door" ? (cell.open ? "（已打开）" : "（需锈蚀钥匙）") : ""}${main ? `：${main}` : ""}${cell.type === "event" && Array.isArray(cell.opts) && cell.opts.length ? `（选项：${cell.opts.join("／")}）` : ""}${edit ? "（右键选类型，双击编辑）" : ""}`;
        html += `<div class="hex ${cls}" data-k="${k}" title="${esc(tip)}">${icon}${cell.no ? `<u>${cell.no}</u>` : ""}${main ? `<i>${esc(main)}</i>` : ""}</div>`;
      }
      html += `</div>`;
    }
    box.innerHTML = html;

    if (edit) {
      /* 沙盘：点空位添加；右键弹菜单（已有格选类型/删除，空位直接放类型） */
      box.querySelectorAll(".hex-empty[data-add]").forEach(el => {
        el.onclick = () => {
          cells[el.dataset.add] = { type: "empty" };
          this.saveMap(); this.renderMap();
        };
        el.oncontextmenu = (ev) => { ev.preventDefault(); this.openCellMenu(ev, el.dataset.add); };
      });
      box.querySelectorAll(".hex[data-k]").forEach(el => {
        el.oncontextmenu = (ev) => { ev.preventDefault(); this.openCellMenu(ev, el.dataset.k); };
        /* 双击：战斗=改编号+备注；事件=主题与选项面板；灰烬遗迹=造物/祭祀/感应面板；钥匙/探照灯=备注 */
        el.ondblclick = () => {
          const cell = cells[el.dataset.k];
          if (this.isBattle(cell.type)) {
            const battles = this._load().filter(e => e.cat === "monster" && Array.isArray(e.fields.batch));
            const no = this.win.prompt(
              "战斗编号（对应「怪物·战斗」采集记录的战斗#，使用模式踩上即加载整场战斗）\n"
              + "已采集：" + (battles.map(e => `#${e.fields.fno || "?"}(${(e.fields.batch || []).map(b => b.name).join(",")})`).join(" ") || "（暂无）"),
              cell.no || "");
            if (no === null) return;
            const n = parseInt(no, 10);
            if (n) cell.no = String(n); else delete cell.no;
            const note = this.win.prompt("战斗内容备注（可选，留空清除）", cell.note || "");
            if (note === null) return;
            if (note.trim()) cell.note = note.trim(); else delete cell.note;
            this.saveMap(); this.renderMap();
          } else if (cell.type === "event") {
            this.openEventEditor(el.dataset.k);
          } else if (cell.type === "shop") {
            this.openShop(el.dataset.k);
          } else if (cell.type === "key" || cell.type === "light") {
            const note = this.win.prompt("内容（可留空）", cell.note || "");
            if (note === null) return;
            if (note.trim()) cell.note = note.trim(); else delete cell.note;
            this.saveMap(); this.renderMap();
          }
        };
      });
      return;
    }

    /* 使用：点击相邻格移动；门扉需钥匙、一次性格离开后封路、隧道/密道/幻象/遗骨有交互 */
    box.querySelectorAll(".hex[data-k]").forEach(el => {
      el.onclick = () => {
        const k = el.dataset.k, cell = cells[k];
        if (this.mapPos === k) return;
        if (!this.mapPos) { this.mapPos = k; }
        else {
          const [pr, pc] = this.mapPos.split(",").map(Number);
          if (!this.hexNeighbors(pr, pc).includes(k)) { this.setStatus("只能移动到相邻格子"); return; }
          if (cell.type === "once" && cell.used) { this.setStatus("该一次性格子已走过"); return; }
          if (cell.type === "door" && !cell.open) {
            if (!this.runKeys) { this.setStatus("锈蚀门扉需要锈蚀钥匙"); return; }
            cell.open = true;
            Log.add("🔑 用锈蚀钥匙打开了锈蚀门扉", "sys");
          }
          const from = cells[this.mapPos];
          if (from && from.type === "once") from.used = true;
        }
        this.mapPos = k;
        /* 战斗外死亡检查：队伍生命在任何时候归零=探索失败 */
        if (State.battle && State.battle.team && State.battle.team.hp <= 0 && State.battle.phase !== "prep") {
          Log.add(`<span class="warn-text">☠ 队伍生命耗尽——探索失败</span>`, "turn");
          if (this.win.confirm("☠ 队伍生命耗尽，探索失败！\n\n是否结束游戏？（确定=重置地图回出生点；取消=留在原地）")) this.resetMapRun();
          this.saveMap(); this.renderMap();
          return;
        }
        if (this.isBattle(cell.type)) {
          /* 战斗格：按编号匹配「怪物·战斗」采集记录 → 加载整场战斗；无匹配则用主页面当前队列 */
          cell.no = cell.no || (() => { let mx = 0; for (const v of Object.values(this.mapCells.cells)) if (this.isBattle(v.type) && v.no) mx = Math.max(mx, parseInt(v.no, 10) || 0); return mx + 1; })();
          if (cell.done) { this.setStatus(`地图${this.HEX_LABEL[cell.type]} #${cell.no} 已通关，不再触发`); }
          else if (State.battle.phase === "play") { this.setStatus("请先结束当前战斗"); }
          else this.enterMapFight(cell);
        } else if (cell.type === "event") {
          if (cell.done) this.setStatus("该事件已触发过");
          else {
            cell.done = true;
            const opts = Array.isArray(cell.opts) ? cell.opts : [];
            if (opts.length) {
              const theme = cell.theme || "未命名事件";
              const ch = this.win.prompt(`事件「${theme}」：` + opts.map((o, i) => `${i + 1}=${o}`).join(" "), "1");
              const n = parseInt(ch, 10);
              Log.add(`❗ 事件「${theme}」${n >= 1 && n <= opts.length ? `选择：${opts[n - 1]}` : "（未选择，已触发）"}`, "sys");
            } else {
              Log.add(`❗ 触发事件${cell.theme ? `：${cell.theme}` : cell.note ? `：${cell.note}` : ""}`, "sys");
            }
          }
        } else if (cell.type === "shop") {
          /* 灰烬遗迹：买卖造物 / 祭祀 / 感应（面板内操作，关闭后继续走） */
          this.openShop(k);
        } else if (cell.type === "key") {
          if (!this.runKeys) { this.runKeys = 1; Log.add("🔑 拾取锈蚀钥匙（开门不消耗）", "sys"); }
          else this.setStatus("已有锈蚀钥匙");
        } else if (cell.type === "light") {
          Log.add(`💡 探照灯亮起${cell.note ? `：${cell.note}` : ""}`, "sys");
        } else if (cell.type === "hazard") {
          /* 蓝色地块：踩上扣 1/20 最大生命（向下取整），可重复触发 */
          if (!this.ensureMaxHp()) return;
          const loss = Math.floor(this.runMaxHp / 20);
          this.loseHp(loss);
          Log.add(`🌊 蓝色地块：生命 -${loss}（余 ${this.runHp}/${this.runMaxHp}）`, "sys");
          this.deadCheck();
        } else if (cell.type === "mark") {
          /* 黑印格：踩上获得 25 黑印（每把一次） */
          if (cell.done) { this.setStatus("黑印已领取"); }
          else {
            cell.done = true;
            this.runHei = (this.runHei || 0) + 25;
            Log.add(`🖤 黑印记号：获得 25 黑印（共 ${this.runHei}）`, "sys");
          }
        } else if (cell.type === "pin") {
          /* 密道：入口→出口单向传送（到达出口不再触发） */
          const pout = Object.keys(cells).find(x => cells[x].type === "pout");
          if (pout) { this.mapPos = pout; Log.add(`🕳️ 经密道单向传送到出口 (${pout})`, "sys"); }
          else this.setStatus("地图上没有密道出口");
        } else if (cell.type === "tunnel") {
          /* 隧道：可选择进入（从另一个隧道出来）或留在原地 */
          const others = Object.keys(cells).filter(x => cells[x].type === "tunnel" && x !== k);
          if (others.length && this.win.confirm("进入隧道？（确定=从另一个隧道出来，取消=留在原地）")) {
            let t = others[0];
            if (others.length > 1) {
              const i = parseInt(this.win.prompt("去哪个隧道？" + others.map((x, j) => `${j + 1}=(${x})`).join(" "), "1"), 10);
              if (i >= 1 && i <= others.length) t = others[i - 1];
            }
            this.mapPos = t;
            Log.add(`🚇 穿过隧道，从另一端 (${t}) 出来`, "sys");
          }
        } else if (cell.type === "illusion") {
          /* 幻象：离开或驱散；驱散感染随机症状（不可见） */
          if (this.win.confirm("驱散幻象？（确定=感染随机症状·看不见是哪张，取消=离开）"))
            Log.add("👻 驱散幻象：随机感染一张症状牌（看不见是哪张）", "sys");
        } else if (cell.type === "bones") {
          /* 褪色遗骨：安葬或祷告 */
          const ch = this.win.prompt("褪色遗骨：1=安葬（回复X点生命·选1张指令卡删除） 2=祷告（随机黄金造物+可见症状）", "1");
          if (ch === "2") Log.add("🦴 祷告：获得随机黄金造物，感染随机症状（可见具体是哪个）", "sys");
          else if (ch === "1") Log.add("🦴 安葬：回复X点生命，选择1张指令卡删除", "sys");
        }
        this.saveMap(); this.renderMap();
      };
    });
  },

  /* ================= 地图 × 怪物·战斗联动 ================= */
  /* 按战斗编号找采集记录（地图战斗格 no = 战斗#fno）：
   * 同一战斗#可能有多条（不同难度版本）→ 优先匹配当前难度，无则用该#第一条；
   * 旧记录无 fno 时回退按怪物编号匹配 */
  findBatchByNo(no) {
    const list = this._load();
    const curDiff = this.normalizeDiff(State.battle ? State.battle.difficulty : "") || "";
    let first = null;
    for (const e of list) {
      if (e.cat !== "monster" || !Array.isArray(e.fields.batch)) continue;
      if (e.fields.fno && String(e.fields.fno) === String(no)) {
        if (!first) first = { rec: e, diff: this.normalizeDiff(e.fields.diff), batch: e.fields.batch };
        if (this.normalizeDiff(e.fields.diff) === curDiff) {
          return { rec: e, diff: this.normalizeDiff(e.fields.diff), batch: e.fields.batch };
        }
      }
    }
    if (first) return first;
    for (const e of list) {   // 兜底：旧记录按怪物编号
      if (e.cat !== "monster" || !Array.isArray(e.fields.batch) || e.fields.fno) continue;
      const en = e.fields.batch.find(b => String(b.no) === String(no));
      if (en) return { rec: e, en, diff: this.normalizeDiff(e.fields.diff) || "n1", batch: e.fields.batch };
    }
    return null;
  },

  /* 复制一场战斗为新记录：战斗#重新分配、怪物编号全局重排，内容原样保留 */
  copyMonsterEntry(idx) {
    const list = this._load();
    const src = list[idx];
    if (!src || !Array.isArray(src.fields.batch)) return;
    const clone = JSON.parse(JSON.stringify(src));
    clone.time = new Date().toLocaleString("zh-CN", { hour12: false });
    /* 战斗编号保持原值：复制通常用于录同一场战斗的其他难度（同#不同难度，地图按难度加载） */
    let mx = 0;
    for (const e of list) {
      if (e.cat !== "monster") continue;
      if (Array.isArray(e.fields.batch)) for (const b of e.fields.batch) mx = Math.max(mx, parseInt(b.no, 10) || 0);
      else if (e.fields.no) mx = Math.max(mx, parseInt(e.fields.no, 10) || 0);
    }
    for (const b of clone.fields.batch) b.no = String(++mx);
    list.splice(idx + 1, 0, clone);
    this._save(list);
    this.renderList();
    this.setStatus(`已复制为 战斗#${clone.fields.fno}（${clone.fields.batch.length}只，编号不变——改难度后即为其另一难度版本）`);
  },

  /* 采集意图行 → 引擎行动（v 解析：32*3=伤害3次；含"虚弱/中毒"附 debuff；无数字=特殊） */
  parseIntentAction(row) {
    const v = String(row.v || "");
    const m = v.match(/(\d+(?:\.\d+)?)(?:\s*\*\s*(\d+))?/);
    const val = m ? parseFloat(m[1]) : null, times = m && m[2] ? parseInt(m[2], 10) : 1;
    const act = { name: row.n || "？（未采集名）", note: v };
    if (/中毒/.test(v)) { act.type = "buff"; act.buffId = "debuff_poison"; act.stacks = 1; act.per = val || 9; act.target = "enemy"; }
    else if (val != null) { act.type = "attack"; act.value = val; if (times > 1) act.times = times; if (/虚弱/.test(v)) act.debuff = { buffId: "debuff_weak", stacks: 1, duration: 1 }; }
    else act.type = "special";
    return act;
  },

  /* 进入地图战斗：优先加载编号匹配的采集批次（难度/波次同步、整批敌人）；否则用主页面当前队列 */
  enterMapFight(cell) {
    const hit = this.findBatchByNo(cell.no);
    /* T35：主页面还没开过战斗（State.battle=null）时先建一场——地图先于战斗使用的流程兜底 */
    if (!State.battle) State.newBattle();
    const b = State.battle;
    /* 上一场已结束未重置：软重开（按原队伍重新编入，配置从本地存档恢复） */
    if (b.phase === "over") {
      const team = b.allies.map(a => ({ id: a.def.id, level: a.level }));
      State.newBattle();
      for (const m of team) { try { State.addAlly(m.id, m.level); } catch (e) {} }
      Log.add("上一场已结束，自动重开一局并恢复队伍", "sys");
    }
    if (!hit) {
      Log.add(`进入战斗：地图${this.HEX_LABEL[cell.type]} #${cell.no}${cell.note ? `「${cell.note}」` : ""}（未匹配采集记录，用主页面当前队列）`, "sys");
    } else {
      const { diff, batch } = hit;
      const dN = this.normalizeDiff(diff);
      const diffMap = { n1: "normal", n2: "hard", n3: "nightmare", n4: "insane", n5: "n5", n6: "n6", n7: "n7" };
      State.battle.difficulty = diffMap[dN] || "normal";
      State.battle.wave = 1;   // 波次以关联地图为准（采集不再录波次）
      State.battle.enemies = [];
      State.battle.aiIndex = {};
      for (const en of batch) {
        const hp = parseFloat(en.hp) || 100;
        const actions = (en.intentRows || []).map((r, ri) => {
          const a = this.parseIntentAction(r); a._rowIdx = ri; a.once = !!r.once;
          if (r.cond) a.cond = String(r.cond).trim();   // T34 条件边
          if (r.wait) a.wait = true;
          const gr = parseInt(r.goto, 10);
          if (Number.isFinite(gr) && gr >= 1) a._gotoRow = gr;   // 1-based 行号，组重映射后写回
          return a;
        });
        /* 等价意图：intentRows[i].t === "等价" → 第 i+1 条并入第 i 条（循环中同一位置随机其一） */
        const groups = [];
        for (let ri = 0; ri < actions.length; ri++) {
          const prevRow = ri > 0 ? en.intentRows[ri - 1] : null;
          if (prevRow && prevRow.t === "等价" && groups.length) groups[groups.length - 1].push(actions[ri]);
          else groups.push([actions[ri]]);
        }
        /* 组属性聚合：once=任一成员仅一次；记录旧行索引→新索引映射（转阶段 start 重算用） */
        groups.forEach(g => { g.once = g.some(x => x.once); });
        groups.sort((a, b) => (b.once ? 1 : 0) - (a.once ? 1 : 0));   // 仅一次组前置
        const newIdxOfRow = {};
        groups.forEach((g, gi) => g.forEach(x => { if (x._rowIdx != null) newIdxOfRow[x._rowIdx] = gi; }));
        /* T34：条件边属于组（引擎读 acts[idx].cond）；成员的边上提包装 */
        for (const g of groups) {
          const src = g.find(x => x.cond || x.wait || x._gotoRow != null);
          if (src) { g.cond = src.cond; g.wait = src.wait; g._gotoRow = src._gotoRow; }
        }
        const actionsMerged = groups.map(g => g.length === 1 ? g[0]
          : { name: g.map(x => x.name).join("／"), either: g, type: g[0].type, note: "等价意图（随机其一）",
              ...(g.cond ? { cond: g.cond } : {}), ...(g.wait ? { wait: true } : {}), ...(g._gotoRow != null ? { _gotoRow: g._gotoRow } : {}) });
        /* T34：goto 行号→等价组新行号（1-based 保持）；无效目标=0（引擎视为无跳转）；清理内部字段 */
        for (const a of actionsMerged) {
          if (a._gotoRow != null) {
            const t = newIdxOfRow[a._gotoRow - 1];
            a.goto = (t != null && t + 1 !== actionsMerged.indexOf(a)) ? t + 1 : 0;
          }
          delete a._gotoRow; delete a._rowIdx;
          for (const x of (a.either || [])) { delete x._gotoRow; delete x._rowIdx; delete x.cond; delete x.wait; delete x.once; }
        }
        const loopStart = groups.reduce((s, g, gi) => g.once ? s + g.length : s, 0);   // 一次性段长度
        const mainDmg = actionsMerged.find(a => a.type === "attack" && a.value != null);
        const stages = Array.isArray(en.stages) ? en.stages : [];
        const def = {
          id: "mapfight_" + en.no, name: en.name + (en.lv ? ` Lv${en.lv}` : ""), tier: "normal",
          hp: { normal: hp }, attack: { normal: mainDmg ? mainDmg.value : Math.round(hp / 30) },
          actions: actionsMerged, loopStart,
          phases: stages.length ? stages.map(s => {
            const ph = { hp: parseFloat(s.hp) || hp, start: newIdxOfRow[s.at] ?? s.at };   // 第2+管：血量与意图起点（once 前置后重算）
            /* T34 补：转阶段状态「免疫伤害×1；力量×9」——按名称或 buff_id 解析（×层数可省=1），未知名称跳过 */
            const txt = String(s.buff || "").trim();
            if (txt) {
              const buffs = txt.split("；").join(";").split(";").map(t => t.trim()).filter(Boolean).map(t => {
                const parts = t.split("×").join("*").split("*");
                const nm = (parts[0] || "").trim();
                const st2 = parseInt(parts[1], 10) || 1;
                if (!nm) return null;
                const def = (window.DBF.buffs || []).find(x => x.id === nm || x.name === nm);
                return def ? { buffId: def.id, stacks: st2 } : null;
              }).filter(Boolean);
              if (buffs.length) ph.buffs = buffs;
            }
            return ph;
          }) : null,
          passives: en.statusTiming ? [en.statusTiming] : [],
          source: "「怪物·战斗」采集记录 #" + en.no
        };
        const u = { uid: State.nextUid("enemy"), side: "enemy", def, hp, maxHp: hp, phaseIdx: 0, loopStart: loopStart || 0,
          attack: def.attack.normal, defense: 0, shield: 0, guku: 0, gukuMax: 100, tentacles: 0, buffs: [] };
        State.battle.enemies.push(u);
        State.battle.aiIndex[u.uid] = 0;
      }
      if (b.phase !== "play") Turn.startBattle();
      Log.add(`⚔ 进入${this.HEX_LABEL[cell.type]}战 #${cell.no}：已加载采集批次（${this.normalizeDiff(diff)}，${batch.length}只：${batch.map(x => x.name).join("、")}）`, "turn");
    }
    /* T35：地图战斗=跑关模式，顶栏选择器锁定并同步本场（自由沙盘回「沙盘」/关地图/开始自由战斗时解锁） */
    this.lockTopSelectors(State.battle.difficulty);
    /* 战斗结果监视：胜→标记 done（Boss=探索胜利）；败→失败弹窗（是否结束游戏） */
    this.monitorMapFight(cell);
    this.saveMap(); this.renderMap();
  },

  monitorMapFight(cell) {
    clearInterval(this._fightTimer);
    const started = Date.now();
    this._fightTimer = setInterval(() => {
      const b = State.battle;
      const over = b && b.phase === "over";
      const deadTeam = b && b.team && b.team.hp <= 0 && b.phase !== "prep";
      if (!over && !deadTeam) {
        if (Date.now() - started > 600000) clearInterval(this._fightTimer);   // 10分钟上限
        return;
      }
      clearInterval(this._fightTimer);
      const lose = deadTeam || b.result === "lose";
      if (lose) {
        Log.add(`<span class="warn-text">☠ 探索失败（队伍生命耗尽）</span>`, "turn");
        if (this.win.confirm("☠ 战斗失败！\n\n是否结束游戏？（确定=重置地图回出生点重新开始；取消=留在原地）")) this.resetMapRun();
      } else {
        cell.done = true;
        this.saveMap(); this.renderMap();
        if (cell.type === "boss") {
          Log.add(`<b style="color:var(--gold)">🏆 Boss 已击败——本次探索胜利！</b>`, "turn");
          if (this.win.confirm("🏆 Boss 已击败，探索胜利！\n\n是否结束游戏？（确定=重置地图回出生点开始新的一轮；取消=保留进度继续逛）")) this.resetMapRun();
        } else {
          Log.add(`✔ ${this.HEX_LABEL[cell.type]}战 #${cell.no} 通关`, "good");
        }
      }
      State.notify();
    }, 400);
  },

  /* 重置本次探索：清通关/走过标记、回出生点、钥匙黑印清零、生命回满 */
  resetMapRun() {
    for (const v of Object.values(this.mapCells.cells || {})) { delete v.done; delete v.used; }
    this.mapPos = this.findSpawnKey();
    this.runKeys = 0;
    this.runHei = 0;
    this.runHp = this.runMaxHp;
    State.usedYogensExplore = [];   // T12：重开一把=新探索，尘封旧忆已用记录清零
    this.saveMap(); this.renderMap();
    Log.add("🗺 地图已重置，回到出生点——新的探索开始", "sys");
  },

  /* ================= 主页面地图面板（win 门面复用全部地图逻辑） =================
   * 主页面面板复用 col-* 元素 id；开启时把 this.win 指向主文档门面，
   * 渲染/交互/弹窗全部落在主页面。与采集窗互斥（共用同一份 win 引用与数据）。 */
  openInMain() {
    if (this.isOpen()) { Log.add("🗺 请先关闭采集窗（悬浮窗），再使用主页面地图", "sys"); return false; }
    this._realWin = this.win || null;
    this._inMain = true;
    this.win = {
      document: document,
      closed: false,
      confirm: (m) => window.confirm(m),
      prompt: (m, d) => window.prompt(m, d == null ? "" : d),
      focus() {}
    };
    const d = this.win.document;
    /* 绑定面板工具（元素缺失时跳过，兼容精简面板） */
    const bind = (id, fn) => { const el = d.getElementById(id); if (el) el.onclick = fn; };
    bind("col-mode-edit", () => this.setMapMode("edit"));
    bind("col-mode-use", () => this.setMapMode("use"));
    bind("col-map-save", () => this.exportMap());
    bind("col-map-dl", () => this.downloadMap());
    bind("col-level-save", () => this.exportLevel());
    bind("col-level-load", () => this.importLevel());
    bind("col-map-import", () => this.importMap());
    bind("col-map-clear", () => {
      if (window.confirm("清空地图？")) {
        this.mapCells = { cells: {} };
        this.mapPos = null; this.runKeys = 0; this.runHei = 0; this.runHp = 0; this.runMaxHp = 0;
        this.saveMap(); this.renderMap();
      }
    });
    bind("col-map-shift-go", () => {
      const dr = parseInt(d.getElementById("col-shift-dx")?.value, 10) || 0;
      const dc = parseInt(d.getElementById("col-shift-dy")?.value, 10) || 0;
      if (!dr && !dc) return;
      const cells = this.mapCells.cells || {};
      const moved = {};
      for (const [k, v] of Object.entries(cells)) {
        const [r, c] = k.split(",").map(Number);
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= this.MAP_ROWS || nc < 0 || nc >= this.MAP_COLS) continue;
        moved[nr + "," + nc] = v;
      }
      this.mapCells.cells = moved;
      if (this.mapPos) {
        const [pr, pc] = this.mapPos.split(",").map(Number);
        const np = (pr + dr) + "," + (pc + dc);
        if (moved[np]) this.mapPos = np;
      }
      this.saveMap(); this.renderMap();
    });
    bind("col-keys", () => { this.runKeys = this.runKeys ? 0 : 1; this.saveMap(); this.renderMap(); });
    this.mapCells = this.loadMap();
    this.mapPos = this.mapCells.pos || null;
    this.runKeys = this.mapCells.keys || 0;
    this.runHei = this.mapCells.hei || 0;
    this.runHp = this.mapCells.hp || 0;
    this.runMaxHp = this.mapCells.maxHp || 0;
    this.setMapMode(this.mapMode || "use", true);   // 只同步按钮态，不重置探索进度
    this.renderMap();
    Log.add("🗺 地图面板已在主页面打开（数据与采集窗互通）", "sys");
    return true;
  },

  closeInMain() {
    if (!this._inMain) return;
    this.win = this._realWin || null;
    this._realWin = null;
    this._inMain = false;
  }
};

window.Collector = Collector;
