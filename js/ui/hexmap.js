/* =========================================================
 * UI · 六边形地图共享模块（主页面地图面板 + 采集窗共用）
 * ---------------------------------------------------------
 * 数据：localStorage `morimens_collector_map`
 *   { cells: { "r,c": { type, once, used, no, name } }, pos: "r,c" | null }
 *   type: empty / monster / event / shop / spawn
 * 渲染：pointy-top 六边形（上下尖角，奇数列下错半格）
 * 交互模式（clickMode）：
 *   walk  = 左键行走/进入战斗，右键循环内容，双击切换只走一次（采集窗沿用）
 *   cycle / once / del / name = 主页面地图面板的显式模式
 * ========================================================= */
"use strict";

const HexMap = {

  MAP_ROWS: 6, MAP_COLS: 8,
  CYCLE: ["monster", "event", "shop", "spawn"],
  ICON: { monster: "👹", event: "❗", shop: "💰", spawn: "🚩" },

  load() {
    try {
      const m = JSON.parse(localStorage.getItem("morimens_collector_map") || '{"cells":{},"pos":null}');
      m.cells = m.cells || {};
      return m;
    } catch (e) { return { cells: {}, pos: null }; }
  },

  save(map) {
    try { localStorage.setItem("morimens_collector_map", JSON.stringify(map)); } catch (e) {}
    /* 主页面地图面板若开着，跟随刷新 */
    if (window.UIMapPanel && window.UIMapPanel.visible) window.UIMapPanel.render();
  },

  /* 相邻判定（pointy-top，奇数列下错半格；同列上下也相邻） */
  adjacent(k1, k2) {
    const [r1, c1] = k1.split(",").map(Number);
    const [r2, c2] = k2.split(",").map(Number);
    if (r1 === r2 && Math.abs(c1 - c2) === 1) return true;
    if (Math.abs(r1 - r2) === 1) return Math.abs(c1 - c2) <= 1;
    return false;
  },

  nextMonsterNo(map) {
    let mx = 0;
    for (const v of Object.values(map.cells || {})) if (v.type === "monster" && v.no) mx = Math.max(mx, v.no);
    return mx + 1;
  },

  nameMonster(map, k, name) {
    const cell = map.cells && map.cells[k];
    if (!cell) return;
    cell.name = (name || "").trim() || `怪物${this.nextMonsterNo(map)}`;
    this.save(map);
  },

  /* 在第一个空位添加普通格，返回坐标或 null */
  addFirstEmpty(map) {
    map.cells = map.cells || {};
    for (let r = 0; r < this.MAP_ROWS; r++)
      for (let c = 0; c < this.MAP_COLS; c++) {
        const k = `${r},${c}`;
        if (!map.cells[k]) {
          map.cells[k] = { type: "empty", once: false, used: false };
          return k;
        }
      }
    return null;
  },

  /* ================= 渲染 =================
   * opts: { editable, clickMode("legacy"|"walk"|"cycle"|"once"|"del"|"name"),
   *        once(新格默认), onStatus(t), onDirty(), onEnterBattle(k,cell) } */
  render(box, map, opts = {}) {
    if (!box) return;
    map.cells = map.cells || {};
    let html = "";
    for (let r = 0; r < this.MAP_ROWS; r++) {
      html += `<div class="hexrow ${r % 2 ? "odd" : ""}">`;
      for (let c = 0; c < this.MAP_COLS; c++) {
        const k = `${r},${c}`;
        const cell = map.cells[k];
        if (!cell) {
          html += opts.editable
            ? `<div class="hex hex-empty" data-add="${k}" title="添加格子"></div>`
            : `<div class="hex hex-empty" style="opacity:.35"></div>`;
          continue;
        }
        const icon = this.ICON[cell.type] || "";
        const isPos = map.pos === k;
        const noTag = cell.type === "monster" && cell.no ? `<u>${cell.no}</u>` : "";
        const nameTag = cell.name ? `<i class="hex-name">${cell.name}</i>` : "";
        html += `<div class="hex ${cell.type !== "empty" ? "hex-" + cell.type : ""} ${cell.once && cell.used ? "hex-used" : ""} ${isPos ? "hex-pos" : ""}"
          data-k="${k}" title="${cell.type}${cell.name ? "：" + cell.name : ""}${cell.once ? "（只能走一次）" : ""}${cell.used ? " 已走过" : ""}">${icon}${noTag}${nameTag}</div>`;
      }
      html += `</div>`;
    }
    box.innerHTML = html;
    if (!opts.editable) return;

    const mode = opts.clickMode || "legacy";

    box.querySelectorAll(".hex-empty[data-add]").forEach(el => {
      el.onclick = () => {
        map.cells[el.dataset.add] = { type: "empty", once: !!opts.once, used: false };
        this.save(map);
        if (opts.onDirty) opts.onDirty();
        this.render(box, map, opts);
      };
    });

    box.querySelectorAll(".hex[data-k]").forEach(el => {
      const k = el.dataset.k;
      const cell = map.cells[k];

      if (mode === "name") {
        el.onclick = () => {
          if (cell.type !== "monster") { if (opts.onStatus) opts.onStatus("命名仅对怪物格生效"); return; }
          const n = window.prompt("怪物名称（空=自动编号）", cell.name || "");
          if (n === null) return;
          this.nameMonster(map, k, n);
          if (opts.onDirty) opts.onDirty();
          this.render(box, map, opts);
        };
        return;
      }
      if (mode === "del") {
        el.onclick = () => { delete map.cells[k]; if (map.pos === k) map.pos = null; this.save(map); if (opts.onDirty) opts.onDirty(); this.render(box, map, opts); };
        return;
      }
      if (mode === "once") {
        el.onclick = () => { cell.once = !cell.once; cell.used = false; this.save(map); if (opts.onDirty) opts.onDirty(); this.render(box, map, opts); };
        return;
      }
      if (mode === "cycle") {
        el.onclick = () => {
          const i = this.CYCLE.indexOf(cell.type);
          if (i === this.CYCLE.length - 1) { delete map.cells[k]; if (map.pos === k) map.pos = null; }
          else cell.type = this.CYCLE[i + 1];
          this.save(map);
          if (opts.onDirty) opts.onDirty();
          this.render(box, map, opts);
        };
        return;
      }
      /* legacy / walk：左键行走+怪物进战斗，右键循环，双击只走一次 */
      el.onclick = () => {
        if (map.pos && map.pos !== k && !this.adjacent(map.pos, k)) {
          if (opts.onStatus) opts.onStatus("只能移动到相邻格子");
          return;
        }
        if (cell.once && cell.used) {
          if (opts.onStatus) opts.onStatus("该格子只能走一次");
          return;
        }
        if (map.pos && map.cells[map.pos] && map.cells[map.pos].once) map.cells[map.pos].used = true;
        map.pos = k;
        if (cell.type === "monster") {
          cell.inBattle = true;
          if (opts.onEnterBattle) opts.onEnterBattle(k, cell);
        }
        this.save(map);
        if (opts.onDirty) opts.onDirty();
        this.render(box, map, opts);
      };
      el.oncontextmenu = (ev) => {
        ev.preventDefault();
        const i = this.CYCLE.indexOf(cell.type);
        if (i === this.CYCLE.length - 1) { delete map.cells[k]; if (map.pos === k) map.pos = null; }
        else cell.type = this.CYCLE[i + 1];
        this.save(map);
        if (opts.onDirty) opts.onDirty();
        this.render(box, map, opts);
      };
      el.ondblclick = () => {
        cell.once = !cell.once; cell.used = false;
        this.save(map);
        if (opts.onDirty) opts.onDirty();
        this.render(box, map, opts);
      };
    });
  }
};

window.HexMap = HexMap;
