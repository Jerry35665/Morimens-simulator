/* =========================================================
 * UI · 战场渲染
 * ---------------------------------------------------------
 * v0.2：我方左列（队伍共享血条在列顶，角色卡只带狂气条 x/100），
 *       敌方右列（单体血条+意图），默认从上往下索敌。
 * ========================================================= */
"use strict";

const UIBoard = {

  render() {
    const b = State.battle;
    const allyList = document.getElementById("ally-list");
    const enemyList = document.getElementById("enemy-list");
    allyList.innerHTML = "";
    enemyList.innerHTML = "";
    this.renderTeamHp();
    if (!b) return;
    for (const u of b.allies) allyList.appendChild(this._allyEl(u));
    for (const u of b.enemies) enemyList.appendChild(this._enemyEl(u));
  },

  /* 我方共享生命条 + 队伍公共资源（触腕/熔炉等界域效果） */
  renderTeamHp() {
    const fill = document.getElementById("team-hp-fill");
    const text = document.getElementById("team-hp-text");
    const shieldChip = document.getElementById("team-shield-chip");
    const resBox = document.getElementById("team-resources");
    if (resBox) {
      const b2 = State.battle;
      const t = b2 ? b2.tentacle : null;
      const fur = b2 && b2.team.resources ? b2.team.resources.furnace || 0 : 0;
      const perHit = t ? Math.ceil(Tentacle.singleDamage() * (Tentacle.MULT[t.stance] || 1)) : 0;
      const flesh = typeof RealmSys !== "undefined" && RealmSys.hasFlesh();
      const hyper = typeof RealmSys !== "undefined" && RealmSys.hasHyper();
      const realmChips =
        (flesh ? `<span class="res-chip-mini" title="胚胎融合（猩红献祭）：回合开始+30，满100置「胚胎」入手。点击打开界域系统菜单" onclick="UIBoard.menuRealm()">🧬 融合 ${b2.fleshFusion || 0}/100</span>` : "") +
        (hyper ? `<span class="res-chip-mini" title="超维空间（维度跃迁）：每回合首张指令卡的复制置入；点击打开菜单（湮灭/进入超维回合）" onclick="UIBoard.menuRealm()">🌀 超维 ${(b2.hyperCards || []).length}</span>` : "");
      resBox.innerHTML = (b2 ? `
        ${realmChips}<span class="res-chip-mini" title="触腕（T7 实装）：深海界域队伍公共资源，回合结束自动攻击前排。点击弹姿态菜单（每回合可切1次）：潮涌×100% / 静海×50%+护盾 / 怒涛×125%" onclick="UIBoard.menuTentacle()">🐙 触腕 ${t ? `${perHit}×${t.count}` : "×0"}${t ? `·${t.stance}${t.rally ? `·集结${t.rally}` : ""}` : ""}</span>
        <span class="res-chip-mini" title="猩红熔炉：血肉界域公共资源（点击调整，结算待实现）" onclick="UIBoard.menuResources()">🔥 熔炉 ×${fur}</span>` : "");
    }
    if (!fill) return;
    const b = State.battle;
    if (!b) { fill.style.width = "0%"; text.textContent = "队伍生命 -"; if (shieldChip) shieldChip.textContent = ""; return; }
    const pct = b.team.maxHp ? Math.max(0, Math.min(100, b.team.hp / b.team.maxHp * 100)) : 0;
    fill.style.width = pct + "%";
    text.textContent = `队伍生命 ${b.team.hp} / ${b.team.maxHp}`;
    const teamShield = b.allies.reduce((s, a) => s + a.shield, 0);
    if (shieldChip) shieldChip.innerHTML = teamShield > 0 ? `<span class="shield-chip">🛡 全队护盾合计 ${teamShield}</span>` : "";
  },

  /* 我方角色卡（竖列） */
  _allyEl(u) {
    const el = document.createElement("div");
    el.className = "unit ally column-unit";
    el.id = "unit-" + u.uid;
    if (window.TargetMode && TargetMode.active) {
      const card = Cards.def(State.battle.piles.hand.find(c => c.uid === TargetMode.cardUid) || {});
      if (card && (card.target === "ally" || card.target === "self" || card.target === "none")) el.classList.add("targetable");
    }

    let html = `<div class="u-head">
      <span class="u-name">${u.def.name}</span>
      <span class="u-lv">Lv${u.level} · ${u.def.rarity} · ${u.def.realm} · ${u.def.role}</span>
    </div>
    <div class="u-menu">
      <button title="养成配置：等级/启灵/灵塑适性/内在灵格/命轮/密契" onclick="event.stopPropagation();UIGear.open('${u.uid}')">⚙配置</button>
      <button title="该唤醒体的卡牌（生成到手牌，数值只随其属性结算）" onclick="event.stopPropagation();UIBoard.menuCards('${u.uid}')">卡</button>
      <button title="添加buff/debuff" onclick="event.stopPropagation();UIBoard.menuBuff('${u.uid}')">+B</button>
      <button title="调整狂气/触腕" onclick="event.stopPropagation();UIBoard.menuAlly('${u.uid}')">调</button>
      <button title="移除" onclick="event.stopPropagation();State.removeUnit('${u.uid}')">✕</button>
    </div>
    <div class="u-lv">攻 ${u.stats.attack} · 防 ${u.stats.defense} · 强效 ${u.stats.damageBoost}% · 暴击 ${u.stats.critRate}/${u.stats.critDmg}%</div>`;

    /* 狂气条：第一条(0-100)黄色，第二条(100-200)红色覆盖在第一条上；右侧爆发按钮 */
    const g1 = Math.min(u.guku, 100);
    const g2 = Math.max(0, Math.min(u.guku - 100, 100));
    const canBurst = u.guku >= 100 && State.battle.phase === "play";
    html += `<div class="guku-row">
      <div class="hp-bar guku-bar" title="狂气：打出卡牌积累，满 ${u.gukuMax} 释放狂气爆发（黄=第一管0-100，红=第二管覆盖显示）">
        <div class="bar-track ${u.gukuMax > 100 ? "has-2" : ""}">
          <div class="bar-fill guku1" style="width:${u.gukuMax > 100 ? g1 : Math.min(100, u.guku / u.gukuMax * 100)}%"></div>
          ${u.gukuMax > 100 ? `<div class="bar-fill guku2" style="width:${g2}%"></div>` : ""}
          <div class="bar-text">狂气 ${u.guku}/${u.gukuMax}</div></div></div>
      <button class="burst-btn ${canBurst ? "" : "disabled"}" title="释放狂气爆发（狂气≥100可用；满200=超限爆发）"
        onclick="event.stopPropagation();Cards.releaseBurst(State.findUnit('${u.uid}'))">⚡爆发</button>
    </div>`;
    html += `<div class="u-lv">卡牌等级 ${u.cardLv || 1}/6（打击/防御每级+2%）</div>`;

    /* 装备摘要 */
    const gearBits = [];
    if (u.fatewheels.length) gearBits.push(`命轮×${u.fatewheels.length}`);
    if (u.pacts.length) gearBits.push(`密契×${u.pacts.length}`);
    if (u.personaLv) gearBits.push(`深化+${u.personaLv}`);
    if (u.spiritAdaptLv) gearBits.push(`灵塑${u.spiritAdaptLv}`);
    if (u.innerGridLv) gearBits.push(`灵格${u.innerGridLv}`);
    if (u.omenLv) gearBits.push(`预兆${u.omenLv}`);
    if (gearBits.length) html += `<div class="u-gear dim">◈ ${gearBits.join(" · ")}</div>`;

    /* buff 图标行 */
    html += `<div class="buff-row">`;
    for (const inst of u.buffs) html += this._buffIcon(u, inst);
    if (!u.buffs.length) html += `<span class="dim" style="font-size:11px">无状态</span>`;
    html += `</div>`;

    el.innerHTML = html;
    el.onclick = () => this.clickUnit(u.uid);
    return el;
  },

  /* 敌方卡（竖列） */
  _enemyEl(u) {
    const el = document.createElement("div");
    el.className = "unit enemy column-unit";
    el.id = "unit-" + u.uid;
    if (window.TargetMode && TargetMode.active) {
      const card = Cards.def(State.battle.piles.hand.find(c => c.uid === TargetMode.cardUid) || {});
      if (card && card.target === "enemy") el.classList.add("targetable");
    }

    let html = `<div class="u-head"><span class="u-name">${u.def.name}</span></div>
      <div class="u-menu">
      <button title="添加buff/debuff" onclick="event.stopPropagation();UIBoard.menuBuff('${u.uid}')">+B</button>
      <button title="调整血量" onclick="event.stopPropagation();UIBoard.menuEnemy('${u.uid}')">HP</button>
      <button title="移除" onclick="event.stopPropagation();State.removeUnit('${u.uid}')">✕</button>
      </div>
      <div class="u-lv">攻 ${u.attack}（⚠ 占位数值）</div>`;

    const hpPct = Math.max(0, Math.min(100, u.hp / u.maxHp * 100));
    html += `<div class="hp-bar"><div class="bar-track">
      <div class="bar-fill hp" style="width:${hpPct}%"></div>
      <div class="bar-text">${u.hp} / ${u.maxHp}</div></div></div>`;
    if (u.shield > 0) html += `<span class="shield-chip">🛡 ${u.shield}</span>`;

    const acts = u.def.actions || [];
    if (acts.length) {
      /* value 支持难度对象 {normal,hard,nightmare,insane}：显示当前难度值（缺档回落普通值） */
      const bdiff = (State.battle && State.battle.difficulty) || "normal";
      const valOf = v => (v != null && typeof v === "object") ? (v[bdiff] ?? v.normal) : v;
      /* T28：意图显示值含当前力量（游戏实测：显示=基础值+当前力量，MECHANICS ★行 59+9=68/118+18=136） */
      const strFlat = (u.buffs ? Buffs.collect(u, "damageFlat").reduce((s, m) => s + m.total, 0) : 0);
      const cur = State.battle.aiIndex[u.uid] % acts.length;
      const chain = acts.map((a, i) => {
        const av = valOf(a.value);
        const shown = (a.type === "attack" && av != null && strFlat !== 0) ? av + strFlat : av;
        const detail = a.type === "attack" ? `（${shown != null ? shown : "攻×" + (a.scaleSelfAttack || 1)}${a.times > 1 ? "×" + a.times : ""}）` : "";
        /* T34 条件边：⎇ 标记 + title 说明（goto=1-based 意图行号） */
        const cEsc = String(a.cond == null ? "" : a.cond).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const edgeTip = a.cond ? `｜条件 ${cEsc}${a.goto ? `→意图${a.goto}` : ""}${a.wait ? "（未命中保持）" : ""}` : "";
        const tip = (a.name + detail + (a.type === "attack" && av != null && strFlat !== 0 ? `｜基础 ${av}${strFlat > 0 ? "+" : ""}${strFlat} 力量` : "") + edgeTip);
        const flag = a.cond ? '<span style="color:var(--gold)">⎇</span>' : "";
        return i === cur ? `<b style="color:var(--yellow)" title="${tip}">${a.name}${detail}${flag}</b>` : `<span class="dim" title="${tip}">${a.name}${flag}</span>`;
      }).join('<span class="dim">→</span>');
      html += `<div class="intent">意图链：${chain}</div>`;
    }
    if (u.def.passives && u.def.passives.length)
      html += `<div class="intent" style="color:var(--text-dim)">被动：${u.def.passives.join("；")}</div>`;

    html += `<div class="buff-row">`;
    for (const inst of u.buffs) html += this._buffIcon(u, inst);
    if (!u.buffs.length) html += `<span class="dim" style="font-size:11px">无状态</span>`;
    html += `</div>`;

    el.innerHTML = html;
    el.onclick = () => this.clickUnit(u.uid);
    return el;
  },

  _buffIcon(u, inst) {
    const def = State.getBuff(inst.defId);
    if (!def) return "";
    const durTxt = inst.duration != null ? ` <span class="dim">${inst.duration}回合</span>` : "";
    return `<span class="buff-icon ${def.kind === "debuff" ? "debuff" : ""} ${def.stack === "unknown" ? "unknown-rule" : ""}"
      title="${def.desc}${def.stack === "unknown" ? "（叠加规则未确认）" : ""}"
      onclick="event.stopPropagation();UIBoard.clickBuff('${u.uid}','${inst.uid}')">${def.icon}<span class="stk">×${inst.stacks}</span>${durTxt}</span>`;
  },

  /* 点击单位：选目标模式则打出 */
  clickUnit(uid) {
    if (!window.TargetMode) return;
    if (TargetMode.active) {
      const card = Cards.def(State.battle.piles.hand.find(c => c.uid === TargetMode.cardUid) || {});
      if (!card) { TargetMode.active = false; State.notify(); return; }
      const unit = State.findUnit(uid);
      if (card.target === "enemy" && unit.side !== "enemy") return;
      if (card.target === "ally" && unit.side !== "ally") return;
      const cardUid = TargetMode.cardUid;
      TargetMode.active = false;
      Cards.play(cardUid, uid);
    }
  },

  /* ---- 飘字 ---- */
  float(uid, text, cls = "") {
    const el = document.getElementById("unit-" + uid);
    if (!el) return;
    const f = document.createElement("div");
    f.className = "float-dmg " + cls;
    f.textContent = text;
    el.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  },

  /* 队伍血条上的飘字 */
  floatTeam(text, cls = "") {
    const el = document.getElementById("team-hp-box");
    if (!el) return;
    const f = document.createElement("div");
    f.className = "float-dmg " + cls;
    f.textContent = text;
    el.style.position = "relative";
    el.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  },

  /* ---- 血量调整 ---- */
  zeroHp(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    if (u.side === "ally") { State.battle.team.hp = 0; Log.add("队伍生命归零", "sys"); }
    else { u.hp = 0; Log.add(`${u.def.name} 生命归零`, "sys"); }
    State.notify();
  },

  fullHp(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    if (u.side === "ally") { State.battle.team.hp = State.battle.team.maxHp; Log.add("队伍生命回满", "sys"); }
    else { u.hp = u.maxHp; Log.add(`${u.def.name} 生命回满`, "sys"); }
    State.notify();
  },

  /* ---- 弹窗：加 buff ---- */
  menuBuff(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    let html = `<div class="m-row dim">选择要添加到 <b>${u.def.name}</b> 的状态（战斗未开始也可预先挂状态）：</div>`;
    for (const def of DBF.buffs) {
      html += `<div class="m-row">
        <button class="btn" onclick="Buffs.add(State.findUnit('${uid}'),'${def.id}',1);Modal.close()">+
          ${def.icon} ${def.name}
        </button>
        <span class="tag ${def.stack === "unknown" ? "unknown" : def.stack}">${def.stack === "add" ? "加算" : def.stack === "mul" ? "乘算" : "叠加未知"}</span>
        ${def.confirmed ? "" : '<span class="tag no">未确认</span>'}
        <span class="dim">${def.desc}</span></div>`;
    }
    Modal.open(`添加状态 → ${u.def.name}`, html);
  },

  /* ---- 我方：狂气/触腕调整（属性由配置自动计算，不在此调整） ---- */
  menuAlly(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    let html = `<div class="m-row dim">属性（体质/攻击/防御/暴击等）由 <b>等级+命轮+密契</b> 自动计算，请在「⚙配置」中调整养成项。</div>
      <div class="m-row">狂气：${u.guku}/${u.gukuMax}
      <button class="btn" onclick="UIBoard._guku('${uid}',5)">+5</button>
      <button class="btn" onclick="UIBoard._guku('${uid}',10)">+10</button>
      <button class="btn" onclick="UIBoard._guku('${uid}',25)">+25</button>
      <button class="btn" onclick="UIBoard._guku('${uid}',-10)">-10</button>
      <button class="btn primary" onclick="UIBoard._guku('${uid}',999)">充满</button>
      <button class="btn" onclick="State.findUnit('${uid}').guku=0;State.notify()">清零</button></div>
      <div class="m-row">狂气上限：
      <button class="btn ${u.gukuMax === 100 ? "primary" : ""}" onclick="UIBoard.setGukuMaxRefresh('${uid}',100)">100</button>
      <button class="btn ${u.gukuMax === 200 ? "primary" : ""}" onclick="UIBoard.setGukuMaxRefresh('${uid}',200)">200（需人格深化+4）</button></div>
      <div class="m-row">触腕（队伍，T7）：${State.battle.tentacle ? `${State.battle.tentacle.count} 条 · ${State.battle.tentacle.stance}` : "无（需深海成员开战）"}
      <button class="btn" onclick="if(!State.battle.tentacle)State.battle.tentacle={count:0,stance:'潮涌',rally:0,swapped:false};State.battle.tentacle.count++;State.notify()">+1</button>
      <button class="btn" onclick="if(State.battle.tentacle)State.battle.tentacle.count=Math.max(0,State.battle.tentacle.count-1);State.notify()">-1</button>
      <button class="btn" onclick="Tentacle.cycleStance();UIBoard.menuAlly('${uid}')">切换姿态</button></div>
      <div class="m-row dim">护盾（当前 ${u.shield}）：
      <button class="btn" onclick="State.findUnit('${uid}').shield+=5;State.notify()">+5</button>
      <button class="btn" onclick="State.findUnit('${uid}').shield=0;State.notify()">清空</button></div>
      ${(() => {   /* 灵塑适性：wiki 逐级专属效果（data/wiki.js） */
        const sa = State.getSpiritAdaptInfo(u);
        if (!sa.found) return "";
        let row = `<div class="m-row dim">灵塑适性 Lv${sa.level}（通用三维 +3%/级为占位；专属效果逐级查表）`;
        if (sa.lvText) row += `<br><b>当前 Lv${sa.level}：</b>${sa.lvText}`;
        if (sa.nextText) row += `<br><span class="dim">下一级 Lv${sa.level + 1}：${sa.nextText}</span>`;
        return row + "</div>";
      })()}`;
    Modal.open(`调整 ${u.def.name}`, html);
  },

  /* 该唤醒体的卡牌列表（生成到手牌；数值只随其属性结算） */
  menuCards(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    const cards = DBF.cards.filter(c => c.owner === u.def.id);
    let html = `<div class="m-row dim"><b>${u.def.name}</b> 的专属卡牌——生成到手牌。下方数值为<b>原始值</b>：只按其当前属性与卡牌等级计算，不含战斗中的状态加成（手牌上的卡面才是实际值）。</div>`;
    if (State.battle.phase !== "play") html += `<div class="m-row warn-text">当前不是出牌阶段，生成的牌可在出牌阶段使用。</div>`;
    for (const c of cards) {
      const dyn = Cards.describeEffects(c, u, "raw");
      html += `<div class="m-row">
        <button class="btn" onclick="Cards.generate('${c.id}');Modal.close()">[${c.cost}] ${c.name}</button>
        <span class="si-tag">${c.type}</span>
        <div class="c-dyn" style="font-size:12px">${dyn.length ? dyn.join("；") + "。" : ""}</div>
        <div class="dim" style="font-size:11px">${c.text}</div></div>`;
    }
    Modal.open(`卡牌 · ${u.def.name}`, html);
  },

  /* 狂气上限切换并立即刷新弹窗 */
  setGukuMaxRefresh(uid, max) {
    const u = State.findUnit(uid);
    if (!u) return;
    State.setGukuMax(u, max);
    this.menuAlly(uid);
  },

  /* 队伍公共资源调整（熔炉等） */
  /* 触腕姿态菜单（用户 10-02：点击后选择切哪种姿态，而非直接循环切） */
  menuTentacle() {
    const b = State.battle;
    if (!b) return;
    const t = b.tentacle;
    if (!t) { alert("当前队伍没有触腕（需要深海界域成员并开始战斗）"); return; }
    const mult = { "潮涌": 1.0, "静海": 0.5, "怒涛": 1.25 };
    const per = Math.ceil(Tentacle.singleDamage() * (mult[t.stance] || 1));
    const desc = {
      "潮涌": "×100% ｜ 回合结束自动攻击；保持到下回合开始则 +1 条",
      "静海": "×50% ｜ 立刻获 8% 最大生命护盾；每次触腕攻击再 +0.2%",
      "怒涛": "×125% ｜ 造成主动伤害后 1 条触腕追击（50%）；回合结束 -1 条"
    };
    let html = `<div class="m-row">当前：<b>${t.stance}</b> ×${t.count} 条${t.rally ? ` · 集结 ${t.rally}` : ""} ｜ 单条伤害 <b>${per}</b></div>
      <div class="m-row dim">每回合可切换 1 次${t.swapped ? "（本回合已切换）" : ""}：</div>`;
    for (const s of ["潮涌", "静海", "怒涛"]) {
      const cur = t.stance === s;
      const locked = t.swapped && !cur;
      html += `<div class="m-row">
        <button class="btn ${cur ? "primary" : ""}" ${cur || locked || !Tentacle.hasDeepSea() ? "disabled" : ""}
          onclick="Tentacle.setStance('${s}');UIBoard.menuTentacle()">${cur ? "✓ " : ""}${s}</button>
        <span class="dim">${desc[s]}</span></div>`;
    }
    html += `<div class="m-row dim">单条伤害公式：ceil(Σ成员ceil(攻×(1+0.03灵塑))×0.095×(1+面板强效)×姿态)+共生+力量/2（E6 v5）</div>`;
    Modal.open("触腕姿态", html);
  },

  /* 界域系统菜单（血肉·猩红献祭 / 超维·维度跃迁，T36 界域系统） */
  menuRealm() {
    const b = State.battle;
    if (!b) return;
    const flesh = typeof RealmSys !== "undefined" && RealmSys.hasFlesh();
    const hyper = typeof RealmSys !== "undefined" && RealmSys.hasHyper();
    let html = "";
    if (flesh) {
      const pure = RealmSys.isPureFlesh();
      html += `<div class="m-row"><b>🧬 猩红献祭</b>${pure ? "（至纯血肉：精通/熔炉积攒翻倍）" : ""}</div>
        <div class="m-row">胚胎融合：<b>${b.fleshFusion || 0}/100</b>（回合开始+30，生命越低至多+100%；满100置「胚胎」入手）</div>
        <div class="m-row">猩红熔炉：<b>${b.resources.furnace || 0}</b> / ${RealmSys.maxFurnace()}（回合开始+3%最大生命；战斗结束+5%+手牌胚胎×5%）
          <button class="btn" onclick="RealmSys.furnaceHeal();UIBoard.menuRealm()">消耗全部熔炉回复等量生命</button></div>
        <div class="m-row dim">胚胎吞噬：血肉唤醒体狂气爆发时消耗手牌 1 张「胚胎」；队伍每回合首次触发：4%最大生命护盾+2%临时力量（生命越低至多×2，血肉精通按界域精通加成）</div>`;
    }
    if (hyper) {
      const pure = RealmSys.isPureHyper();
      const cards = (b.hyperCards || []).map(c => Cards.def(c).name);
      html += `<div class="m-row"><b>🌀 维度跃迁</b>${pure ? "（至纯超维：精通翻倍，超维回合不再−25%）" : ""}${b.hyperTurnActive ? "｜<b>当前为超维回合</b>（效果−25%）" : ""}</div>
        <div class="m-row">超维空间（${(b.hyperCards || []).length} 张）：${cards.length ? cards.join("、") : "空"}</div>
        <div class="m-row">
          <button class="btn" onclick="RealmSys.annihilation();UIBoard.menuRealm()" ${b.annihilUsed || !(b.hyperCards || []).length ? "disabled" : ""}>湮灭（移除最左卡，置「灵感」）</button>
          <button class="btn" onclick="RealmSys.enterHyperTurn()" ${b.hyperPending || b.hyperTurnActive ? "disabled" : ""}>进入超维回合</button></div>
        <div class="m-row dim">维度穿梭：每回合首张指令卡的复制置入超维空间；超维精通：界域精通×0.125% 概率回合开始得灵感${pure ? "（至纯×2）" : ""}；进入条件待实测（按钮手动触发）</div>`;
    }
    if (!html) html = `<div class="m-row dim">队伍中没有激活血肉/超维界域天赋的唤醒体</div>`;
    Modal.open("界域天赋系统", html);
  },

  menuResources() {
    const b = State.battle;
    if (!b) return;
    if (!b.team.resources) b.team.resources = { furnace: 0 };
    const t = b.tentacle;
    let html = `<div class="m-row dim">界域效果的队伍公共资源（触腕=T7 已实装 E6 v5 公式，回合末自动攻击；熔炉为血肉界域资源，结算待实现）：</div>
      <div class="m-row">🐙 触腕：${t ? `${t.count} 条 · ${t.stance}${t.rally ? ` · 集结 ${t.rally}` : ""} · 单次 ${Tentacle.singleDamage()}` : "无"}
      <button class="mini-btn" onclick="if(!State.battle.tentacle)State.battle.tentacle={count:0,stance:'潮涌',rally:0,swapped:false};State.battle.tentacle.count++;State.notify();UIBoard.menuResources()">+1</button>
      <button class="mini-btn" onclick="if(State.battle.tentacle)State.battle.tentacle.count=Math.max(0,State.battle.tentacle.count-1);State.notify();UIBoard.menuResources()">-1</button></div>
      <div class="m-row">🔥 猩红熔炉：${b.team.resources.furnace}
      <button class="mini-btn" onclick="UIBoard.bumpFurnace(-1)">-1</button>
      <button class="mini-btn" onclick="UIBoard.bumpFurnace(1)">+1</button>
      <button class="mini-btn" onclick="UIBoard.bumpFurnace(10)">+10</button></div>`;
    Modal.open("队伍公共资源", html);
  },

  bumpFurnace(d) {
    const b = State.battle;
    if (!b) return;
    if (!b.team.resources) b.team.resources = { furnace: 0 };
    b.team.resources.furnace = Math.max(0, (b.team.resources.furnace || 0) + d);
    State.notify();
    this.menuResources();
  },

  _guku(uid, d) {
    const u = State.findUnit(uid);
    if (!u) return;
    u.guku = Math.max(0, Math.min(u.gukuMax, u.guku + d));
    State.notify();
  },

  /* ---- 敌方：血量调整 ---- */
  menuEnemy(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    let html = `<div class="m-row">当前 HP：<b>${u.hp} / ${u.maxHp}</b></div>
      <div class="m-row">
      <button class="btn" onclick="State.adjustHp('${uid}',-50)">-50</button>
      <button class="btn" onclick="State.adjustHp('${uid}',-10)">-10</button>
      <button class="btn" onclick="State.adjustHp('${uid}',-1)">-1</button>
      <button class="btn" onclick="State.adjustHp('${uid}',1)">+1</button>
      <button class="btn" onclick="State.adjustHp('${uid}',10)">+10</button>
      <button class="btn" onclick="State.adjustHp('${uid}',50)">+50</button>
      <button class="btn" onclick="UIBoard.zeroHp('${uid}')">归零</button>
      <button class="btn primary" onclick="UIBoard.fullHp('${uid}')">回满</button>
      </div>
      <div class="m-row dim">护盾（当前 ${u.shield}）：
      <button class="btn" onclick="State.findUnit('${uid}').shield+=5;State.notify()">+5</button>
      <button class="btn" onclick="State.findUnit('${uid}').shield=0;State.notify()">清空</button></div>`;
    Modal.open(`调整 ${u.def.name}`, html);
  },

  /* ---- 点击 buff 图标 ---- */
  clickBuff(unitUid, instUid) {
    const u = State.findUnit(unitUid);
    const inst = u && u.buffs.find(x => x.uid === instUid);
    if (!inst) return;
    const def = State.getBuff(inst.defId);
    let html = `<div class="m-row"><b>${def.icon} ${def.name}</b> ×${inst.stacks}
      ${inst.duration != null ? `（剩 ${inst.duration} 回合）` : "（无持续限制）"}</div>
      <div class="m-row dim">${def.desc}</div>
      <div class="m-row">叠加规则：<span class="tag ${def.stack === "unknown" ? "unknown" : def.stack}">${def.stack === "add" ? "加算" : def.stack === "mul" ? "乘算" : "未确认"}</span>
      ${def.confirmed ? "" : '<span class="tag no">未实测确认</span>'}</div>
      ${def.notes ? `<div class="m-row dim">备注：${def.notes}</div>` : ""}
      <div class="m-row">
      <button class="btn" onclick="Buffs.removeStacks(State.findUnit('${unitUid}'),'${def.id}',1);Modal.close()">减1层</button>
      <button class="btn" onclick="Buffs.removeStacks(State.findUnit('${unitUid}'),'${def.id}',Infinity);Modal.close()">全部移除</button>
      <button class="btn primary" onclick="Buffs.add(State.findUnit('${unitUid}'),'${def.id}',1);Modal.close()">加1层</button>
      </div>`;
    Modal.open(`状态详情：${def.name}`, html);
  }
};

window.UIBoard = UIBoard;
