/* =========================================================
 * UI · 手牌区（出牌 / 消除 / 牌堆查看）
 * ========================================================= */
"use strict";

const UIHand = {

  render() {
    const b = State.battle;
    const handList = document.getElementById("hand-list");
    handList.innerHTML = "";
    document.querySelector("#draw-pile b").textContent = b ? b.piles.draw.length : 0;
    document.querySelector("#discard-pile b").textContent = b ? b.piles.discard.length : 0;
    document.querySelector("#exhaust-pile b").textContent = b ? b.piles.exhaust.length : 0;
    if (!b) {
      handList.innerHTML = `<div class="hand-empty">添加唤醒体与怪物后点击「开始战斗」建牌组；战斗中可在左侧「卡牌」面板任意生成卡牌</div>`;
      return;
    }
    if (!b.piles.hand.length) {
      handList.innerHTML = `<div class="hand-empty">手牌为空——点击「回合结束」进入下一回合，或从左侧生成卡牌</div>`;
      return;
    }
    for (const inst of b.piles.hand) {
      handList.appendChild(this._cardEl(inst));
    }
  },

  _cardEl(inst) {
    const card = Cards.def(inst);
    const b = State.battle;
    /* X 费（无边荒影）：消耗所有算力，任何算力值都可打出（T15） */
    const cantAfford = b && b.phase === "play" && card.type !== "狂气爆发" && card.cost !== "X" && b.energy < card.cost;
    const el = document.createElement("div");
    el.className = "card" + (inst.generated ? " generated" : "")
      + (cantAfford ? " disabled" : "")
      + (TargetMode.active && TargetMode.cardUid === inst.uid ? " playable-selected" : "");
    const text = inst.upgraded && card.upgrade ? card.upgrade.text : card.text;
    /* 动态卡面：手牌数值始终与实际效果一致（含当前状态/属性/卡牌等级） */
    const owner = b.allies.find(a => a.def.id === card.owner) || b.allies[0] || null;
    const dyn = Cards.describeEffects(card, owner, "actual");
    const dynHtml = dyn.length
      ? `<div class="c-dyn">${dyn.join("；")}。</div><div class="c-orig" title="卡面原文">${text}</div>`
      : `<div class="c-text">${text}</div>`;
    let warn = "";
    if (card.terms && card.terms.some(tid => { const t = State.getTerm(tid); return t && (t.stack === "unknown" || !t.confirmed); }))
      warn = `<div class="c-warn">⚠ 含未确认词条</div>`;
    if (cantAfford) warn += `<div class="c-warn">算力不足</div>`;
    el.innerHTML = `
      <div class="c-cost">${card.cost}</div>
      <div class="c-name">${card.name}${inst.upgraded ? "+" : ""}</div>
      <div class="c-type">${card.type} · ${card.target === "enemy" ? "需选敌方" : card.target === "ally" ? "需选我方" : card.target === "self" ? "自身" : card.target === "none" ? "无目标" : "无目标"}</div>
      ${dynHtml}
      ${warn}
      <div class="c-exhaust-btn" title="消除此牌" onclick="event.stopPropagation();Cards.exhaustFromHand('${inst.uid}')">✕</div>`;
    el.onclick = () => this.clickCard(inst.uid);
    return el;
  },

  /* 点击手牌：单击即打出（T32 实测批 2026-10-02 用户口径）——
   * 攻击牌自动从上到下取首个存活敌人，我方牌默认打出生效者；不再进入选目标模式 */
  clickCard(uid) {
    const inst = State.battle.piles.hand.find(c => c.uid === uid);
    if (!inst || State.battle.phase !== "play") { if (State.battle.phase !== "play") Log.add("当前不是出牌阶段", "sys"); return; }
    TargetMode.active = false;
    Cards.play(uid, null);
  },

  /* 选择分支弹窗（自毁改造等 choices 卡）：点选项后带分支重入出牌 */
  showChoices(uid, card) {
    const opts = card.choices.map((c, i) =>
      `<button class="mini-btn" style="display:block;width:100%;margin:6px 0;padding:8px" onclick="UIHand.hideChoices();Cards.play('${uid}', null, ${i})">${c.name}</button>`).join("");
    Modal.open(`选择：${card.name}`, `<div>${opts}</div>`);
  },
  hideChoices() { try { Modal.close(); } catch (e) { /* Modal 未加载 */ } },

  /* 点击牌堆/弃牌堆：弹窗列出内容 */
  viewPile(zone, title) {
    const b = State.battle;
    if (!b) return;
    const cards = b.piles[zone];
    if (!cards.length) { Modal.open(title, `<div class="dim">（空）</div>`); return; }
    let html = "";
    const shown = {};
    for (const inst of cards) {
      const key = inst.defId + (inst.upgraded ? "+" : "");
      shown[key] = (shown[key] || 0) + 1;
    }
    for (const [key, n] of Object.entries(shown)) {
      const def = State.getCard(key.replace(/\+$/, ""));
      const up = key.endsWith("+");
      const owner = State.battle.allies.find(a => a.def.id === def.owner) || State.battle.allies[0] || null;
      const dyn = owner ? Cards.describeEffects(def, owner, "actual").join("；") : "";
      html += `<div class="m-row">${n > 1 ? `<b>${n}</b> × ` : ""}<b>${def.name}${up ? "+" : ""}</b> <span class="dim">[${def.type}]</span>
        ${dyn ? `<span style="color:var(--gold)">${dyn}。</span>` : `<span class="dim">${def.text}</span>`}</div>`;
    }
    Modal.open(title + `（${cards.length}张）`, html);
  }
};
