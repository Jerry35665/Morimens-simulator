/* =========================================================
 * UI · 主页面地图面板（UIMapPanel）
 * ---------------------------------------------------------
 * 交互全走 HexMap.render 的 clickMode：
 *   walk 行走 | cycle 放内容（点空位加怪，再点循环类型） | once 只走一次 | del 删除 | name 命名
 * 数据与采集窗共用（localStorage morimens_collector_map）。
 * ========================================================= */
"use strict";

const UIMapPanel = {

  visible: false,
  mode: "walk",
  once: false,

  MODE_LABEL: { walk: "行走", cycle: "放内容", once: "只走一次", del: "删除", name: "命名" },

  toggle() {
    const panel = document.getElementById("map-panel");
    if (!panel) return;
    if (this.visible) { this.close(); return; }
    if (Collector.isOpen()) { Log.add("🗺 请先关闭采集窗（悬浮窗），再使用主页面地图", "sys"); return; }
    if (!Collector.openInMain()) return;
    panel.style.display = "block";
    this.visible = true;
    this.render();
    Log.add("🗺 地图面板已打开（数据与采集窗互通）", "sys");
  },

  close() {
    const panel = document.getElementById("map-panel");
    if (panel) panel.style.display = "none";
    Collector.closeInMain();
    this.visible = false;
  },

  setMode(m) {
    if (!this.MODE_LABEL[m]) return;
    this.mode = m;
    this.render();
  },

  setOnce(v) {
    this.once = !!v;
    this.render();
  },

  /* ================= 渲染 ================= */
  render() {
    if (!this.visible) return;
    const box = document.getElementById("col-hexmap");
    const map = HexMap.load();
    HexMap.render(box, map, {
      editable: true,
      clickMode: this.mode,
      once: this.once,
      onStatus: (t) => { const el = document.getElementById("map-status"); if (el) el.textContent = t || ""; }
    });
    /* 模式按钮态 + 信息行 */
    document.querySelectorAll("#map-panel [data-mode]").forEach(b => {
      b.classList.toggle("on", b.dataset.mode === this.mode);
    });
    const pos = map.pos || "未出发";
    let monsters = 0, events = 0, shops = 0;
    for (const c of Object.values(map.cells)) {
      if (c.type === "monster") monsters++;
      else if (c.type === "event") events++;
      else if (c.type === "shop") shops++;
    }
    const info = document.getElementById("map-info");
    if (info) info.textContent = `位置 ${pos} · 怪物格 ${monsters} · 事件格 ${events} · 商店格 ${shops}`;
  }
};

window.UIMapPanel = UIMapPanel;
