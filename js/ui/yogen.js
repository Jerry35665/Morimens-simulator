/* =========================================================
 * UI · 钥令面板（携带钥令设置 / 释放 / 尘封旧忆 / 银钥觉醒 / 图鉴）
 * 入口：底部「银钥」资源条点击（银钥满1000且可释放时金色高亮）
 * ========================================================= */
"use strict";

const UIYogen = {

  panel() {
    const b = State.battle;
    const carried = (b && b.carriedYogen) ? DBF.yogens.find(y => y.id === b.carriedYogen) : null;
    const casts = (b && b.yogenCastsThisTurn) || 0;
    const awakenN = (b && b.silverAwakenCount) || 0;

    let html = `<div class="m-row">银钥 <b>${b ? b.silver : "-"}</b>/1000 · 本回合已释放 <b>${casts}</b>/2 · 灵知觉醒已获得 <b>${awakenN}</b> 张（下次觉醒消耗 ${Yogens.awakenCost()}）
      · 携带：<b>${carried ? carried.name : '<span class="warn-text">未设置</span>'}</b></div>`;
    html += `<div class="m-row dim">规则（2026-09-28 实测）：银钥满 1000 点亮钥令按钮；每回合第 1 次只能释放<b>携带钥令</b>、第 2 次只能释放<b>尘封旧忆</b>（随机 3 选 1，每钥令每探索限 1 次、不含携带），不能第 3 次；1 次钥令消耗 1000 银钥。<b>银钥觉醒</b>置入 1 张「灵知觉醒」，每获得 1 张消耗翻倍（1000/2000/4000…），银钥可透支为负。</div>`;
    html += `<div class="m-row dim">数值口径：护盾/生命/力量 = 物象研究深度×比例（现 ${State.depths.physical}）、中毒/反击/余烬 = 灵识深度×比例（现 ${State.depths.spirit}），向上取整。</div>`;

    /* 释放区 */
    if (b && b.phase === "play" && b.silver >= Yogens.BASE_COST) {
      html += `<div class="m-row"><b style="color:var(--gold)">释放</b>　`;
      if (casts === 0) {
        html += carried
          ? `<button class="btn primary" onclick="UIYogen.castCarried()">🔑 释放携带钥令「${carried.name}」（-1000）</button> `
          : `<span class="warn-text">未设置携带钥令，无法第 1 次释放（下方选择）</span> `;
      } else if (casts === 1) {
        html += `<button class="btn primary" onclick="UIYogen.pickForgotten()">🔑 尘封旧忆（随机3选1，-1000）</button> `;
      }
      html += `<button class="btn" onclick="UIYogen.pickAwaken()">🔓 银钥觉醒（-${Yogens.awakenCost()}，可透支）</button></div>`;
    } else if (b) {
      const why = b.phase !== "play" ? "不在出牌阶段"
        : b.silver < Yogens.BASE_COST ? "银钥不足 1000" : "每回合最多释放 2 次钥令";
      html += `<div class="m-row dim">（当前不可释放：${why}）</div>`;
    } else {
      html += `<div class="m-row dim">（开始战斗后可释放钥令）</div>`;
    }

    /* 携带钥令设置（任意阶段可换） */
    html += `<div class="m-row"><b>携带钥令</b> <span class="dim">（探索前设置；点击切换）</span></div><div class="m-row" style="flex-wrap:wrap;gap:4px">`;
    for (const y of DBF.yogens) {
      const sel = b && b.carriedYogen === y.id;
      html += `<button class="btn ${sel ? "primary" : ""}" style="margin:1px;padding:2px 8px" onclick="UIYogen.setCarried('${y.id}')">${y.name}</button>`;
    }
    html += `</div>`;

    /* 图鉴 */
    html += `<div class="m-row"><b>钥令图鉴（${DBF.yogens.length}）</b></div>`;
    for (const y of DBF.yogens) {
      const tag = [];
      if (b && b.carriedYogen === y.id) tag.push('<span class="tag add">携带中</span>');
      if (b && (b.usedYogens || []).includes(y.id)) tag.push('<span class="tag no">本探索已释放</span>');
      html += `<div class="m-row"><b>${y.name}</b> ${tag.join(" ")}
        <div class="dim" style="font-size:12px">${y.effect}</div></div>`;
    }
    Modal.open("钥令", html);
  },

  setCarried(id) {
    State.setCarriedYogen(id);
    this.panel();   // 同名弹窗原位刷新（保持滚动）
  },

  castCarried() {
    const b = State.battle;
    if (b && b.carriedYogen && Yogens.cast(b.carriedYogen, { via: "carried" })) Modal.close();
  },

  /* 尘封旧忆：随机 3 选 1 */
  pickForgotten() {
    const opts = Yogens.forgottenOptions();
    if (!opts.length) { alert("没有可选的钥令（全部已释放或为携带钥令）"); return; }
    let html = `<div class="m-row dim">尘封旧忆：从随机 3 个钥令中选择 1 个释放（每钥令每探索限 1 次；不含携带钥令）：</div>`;
    opts.forEach((y, i) => {
      html += `<div class="m-row"><button class="btn primary" onclick="UIYogen.castForgotten('${y.id}')">[${i + 1}] ${y.name}</button>
        <div class="dim" style="font-size:12px">${y.effect}</div></div>`;
    });
    Modal.open("尘封旧忆（3选1）", html);
  },

  castForgotten(id) {
    if (Yogens.cast(id, { via: "forgotten" })) Modal.close();
  },

  /* 银钥觉醒：选择 1 张灵知觉醒置入手牌 */
  pickAwaken() {
    const cards = Yogens.awakenCards();
    if (!cards.length) { alert("当前卡牌库中没有「灵知觉醒」类型卡牌"); return; }
    let html = `<div class="m-row dim">银钥觉醒：消耗 <b>${Yogens.awakenCost()}</b> 银钥（不足可透支为负），选择 1 张「灵知觉醒」置入手牌。每获得 1 张，下次消耗翻倍。</div>`;
    for (const c of cards) {
      const owner = State.battle ? State.battle.allies.find(a => a.def.id === c.owner) : null;
      const dyn = owner ? Cards.describeEffects(c, owner, "raw").join("；") : "";
      html += `<div class="m-row"><button class="btn primary" onclick="UIYogen.doAwaken('${c.id}')">置入「${c.name}」</button>
        <span class="si-tag">灵知觉醒</span>
        <span class="dim">${owner ? owner.def.name : (String(c.owner).startsWith("char_") ? c.owner + "（不在场，结算回退首位）" : "通用")}</span>
        ${dyn ? `<div class="c-dyn" style="font-size:12px">${dyn}。</div>` : ""}
        <div class="dim" style="font-size:11px">${c.text}</div></div>`;
    }
    Modal.open("银钥觉醒", html);
  },

  doAwaken(id) {
    if (Yogens.awaken(id)) Modal.close();
  }
};

window.UIYogen = UIYogen;
