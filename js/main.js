/* =========================================================
 * 入口 · 渲染协调 + 事件绑定
 * ========================================================= */
"use strict";

/* 目标选择模式（点卡牌 → 点单位打出） */
window.TargetMode = { active: false, cardUid: null };

const UIRender = {

  renderAll() {
    UIBoard.render();
    UIHand.render();
    this.renderTopbar();
    this.renderTeamChip();
    this.renderRollback();
    if (window.PipPanel) PipPanel.render();
  },

  /* 回溯控件：列出可回到的回合（不含当前回合） */
  renderRollback() {
    const sel = document.getElementById("rollback-select");
    const btn = document.getElementById("btn-rollback");
    if (!sel || !btn) return;
    const b = State.battle;
    const turns = (b && b.history) ? b.history.map(h => h.turn).filter(t => t < b.turn) : [];
    const prev = sel.value;
    sel.innerHTML = turns.length
      ? turns.map(t => `<option value="${t}" ${String(t) === prev ? "selected" : ""}>回到第${t}回合开始</option>`).join("")
      : `<option value="">（无回溯记录）</option>`;
    btn.disabled = !turns.length;
  },

  renderTeamChip() {
    const chip = document.getElementById("team-stats-chip");
    if (!chip) return;
    const s = State.teamStats();
    chip.innerHTML = `队伍属性：界域精通 <b>${s.realmMastery}</b> · 伤害强效 <b>${s.damageBoost}%</b> · 黑印掉落 <b>${s.blackImprint}%</b> · 死亡抵抗 <b>${s.deathResist}%</b> · 禁忌学识 <b>${s.tabooKnowledge}</b> 级`;
  },
  renderTopbar() {
    const b = State.battle;
    const phaseEl = document.getElementById("phase-display");
    const turnEl = document.getElementById("turn-display");
    const energyEl = document.getElementById("energy-display");
    const silverEl = document.getElementById("silver-display");
    const btnEnd = document.getElementById("btn-end-turn");
    const btnStart = document.getElementById("btn-start-battle");
    if (!b) {
      phaseEl.textContent = "准备阶段";
      turnEl.textContent = "回合 0";
      energyEl.textContent = "算力 -";
      silverEl.textContent = "银钥 -";
      silverEl.classList.remove("ready");
      btnEnd.disabled = true;
      btnStart.disabled = false;
      return;
    }
    const phaseText = {
      prep: "准备阶段（添加单位）",
      starting: "战斗开始",
      play: "我方出牌阶段",
      enemy: "敌方行动中",
      over: b.result === "win" ? "战斗胜利" : "战斗失败"
    }[b.phase] || b.phase;
    phaseEl.textContent = phaseText;
    turnEl.textContent = "回合 " + b.turn;
    if (energyEl) energyEl.textContent = `算力 ${b.energy}/${State.ENERGY_PER_TURN}`;
    if (silverEl) {
      silverEl.textContent = `银钥 ${b.silver}/1000${b.silver < 0 ? "（透支）" : ""}`;
      /* T44② 强制暴击 chip（沙盒三态） */
      const fcEl = document.getElementById("forcecrit-display");
      if (fcEl) {
        const fc = State.forceCrit;
        fcEl.textContent = fc === true ? "🎯暴击 必暴" : fc === false ? "🎯暴击 禁止" : "🎯暴击 正常";
        fcEl.classList.toggle("primary", fc === true || fc === false);
      }
      /* 银钥满1000且可释放钥令时金色高亮（点击打开钥令面板） */
      silverEl.classList.toggle("ready", !!(window.Yogens && Yogens.ready()));
    }
    btnEnd.disabled = b.phase !== "play";
    btnStart.disabled = b.phase !== "prep";
  }
};

/* ---------- 初始化 ---------- */
window.UIRender = UIRender;

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-start-battle").onclick = () => {
    if (typeof Collector !== "undefined" && Collector.unlockTopSelectors) Collector.unlockTopSelectors();   // T35：自由战斗=脱离跑关，顶栏解锁
    State.usedYogensExplore = [];   // 主页面每场战斗=一次独立探索：尘封旧忆已用清零（T12；地图探索不走此路径）
    Turn.startBattle();
  };
  document.getElementById("btn-end-turn").onclick = () => Turn.endTurn();
  document.getElementById("btn-reset").onclick = () => State.reset();
  document.getElementById("btn-mechanics").onclick = () => UIMechanics.open();
  document.getElementById("btn-clear-log").onclick = () => Log.clear();
  document.getElementById("draw-pile").onclick = () => UIHand.viewPile("draw", "牌堆");
  document.getElementById("discard-pile").onclick = () => UIHand.viewPile("discard", "弃牌堆");
  document.getElementById("exhaust-pile").onclick = () => UIHand.viewPile("exhaust", "消除堆");
  document.getElementById("difficulty-select").onchange = () => { main_fillAutoLevel(); UISearch.render(); };
  document.getElementById("wave-select").onchange = () => main_fillAutoLevel();
  document.getElementById("btn-pip").onclick = () => PipPanel.openPip();
  document.getElementById("btn-collector").onclick = () => Collector.open();
  document.getElementById("btn-map").onclick = () => UIMapPanel.toggle();
  document.getElementById("map-close").onclick = () => {
    if (typeof Collector !== "undefined" && Collector.unlockTopSelectors) Collector.unlockTopSelectors();   // T35：关地图=脱离跑关
    UIMapPanel.close();
  };
  const whaleBtn = document.getElementById("btn-whale");
  whaleBtn.onclick = () => {
    State.whale = !State.whale;
    State.persist();
    whaleBtn.classList.toggle("primary", State.whale);
    Log.add(`🐋 氪佬模式 ${State.whale ? "开启——新增唤醒体养成全满（命轮/密契不自动装）" : "关闭"}`, "sys");
    if (State.whale && State.battle) {
      for (const a of State.battle.allies) { State.maxOut(a); State.refreshAlly(a); }
      Log.add("🐋 现有唤醒体养成项已拉满（已装备的命轮/密契保持不动）", "sys");
    }
  };
  document.getElementById("btn-rollback").onclick = () => {
    const n = parseInt(document.getElementById("rollback-select").value, 10);
    if (n) Turn.rollbackTo(n);
  };
  document.getElementById("keeper-input").onchange = (e) => {
    State.keeperLv = Math.max(1, parseInt(e.target.value, 10) || 1);
    e.target.value = State.keeperLv;
    State.persist();
    State.notify();
  };
  document.getElementById("btn-relic-manage").onclick = () => UIGear.manageRelics();
  document.getElementById("team-stats-chip").onclick = () => UIGear.openTeamStats();
  document.getElementById("silver-display").onclick = () => UIYogen.panel();   // 钥令面板
  document.getElementById("energy-display").onclick = () => UIBoard.editResource("energy");   // T44① 沙盒改算力
  document.getElementById("forcecrit-display").onclick = () => UIBoard.cycleForceCrit();       // T44② 强制暴击三态

  /* 守密人等级/研究深度/携带钥令本地恢复 */
  const saved = State.loadSave();
  State.keeperLv = saved.keeperLv || 1;
  State.usedYogensExplore = Array.isArray(saved.usedYogensExplore) ? saved.usedYogensExplore : [];   // T12：探索级已用钥令随存档恢复
  document.getElementById("keeper-input").value = State.keeperLv;
  if (saved.depths) State.depths = Object.assign(State.depths, saved.depths);
  State.carriedYogen = saved.carriedYogen || null;
  State.whale = !!saved.whale;
  if (State.whale) whaleBtn.classList.add("primary");

  UIGear.renderRelicBar();
  UISearch.init();
  UIRender.renderAll();

  Log.add("欢迎使用忘却前夜战斗模拟器 v0.1（框架版）", "sys");
  Log.add(`数据载入：唤醒体 ${DBF.characters.length} · 卡牌 ${DBF.cards.length} · 怪物 ${DBF.enemies.length} · buff ${DBF.buffs.length} · 词条 ${DBF.terms.length}`, "sys");
  Log.add("流程：左侧添加唤醒体与怪物 → 设难度/等级 → 开始战斗 → 抽牌出牌 → 「机制面板」查看词条规则与待确认清单", "sys");
});

/* 等级随第几波和难度自动变化（推荐等级占位公式：波次×难度系数，癫狂5波=70） */
function main_fillAutoLevel() {
  const wave = parseInt(document.getElementById("wave-select").value, 10) || 1;
  const diff = document.getElementById("difficulty-select").value;
  const lv = State.autoLevel(wave, diff);
  const input = document.getElementById("level-input");
  input.value = lv;
  if (State.battle) State.battle.level = lv;
}

