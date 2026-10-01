/* =========================================================
 * 引擎 · 钥令 / 银钥觉醒（机制实测 2026-09-28，见 docs/MECHANICS.md）
 * ---------------------------------------------------------
 * 【释放规则（实测）】
 *  - 银钥满 1000 点亮钥令按钮；点开二选一「钥令」或「银钥觉醒」
 *  - 每回合第 1 次只能释放携带钥令；第 2 次只能释放尘封旧忆
 *    （随机 3 选 1；每钥令每探索限 1 次；不可选初始携带）；不能第 3 次
 *  - 1 次钥令消耗 1000 银钥
 * 【银钥觉醒】置入 1 张「灵知觉醒」到手牌；每获得 1 张消耗提高 100%
 *  （1000/2000/4000…）；消耗后银钥可为负值（可透支）
 * 【数值口径】钥令数值 = 研究深度 × 百分比向上取整（data/yogens.js 顶部说明）：
 *  护盾/生命/力量 ×物象深度、中毒/反击/旧日余烬 ×灵识深度；29 条图鉴值全吻合
 * ========================================================= */
"use strict";

const Yogens = {

  BASE_COST: 1000,   // 释放一次钥令的银钥消耗

  /* 值解析：p=物象深度%、s=灵识深度%、v=固定值（全部向上取整） */
  val(e) {
    if (e.v != null) return e.v;
    if (e.p != null) return Math.ceil((State.depths.physical || 0) * e.p / 100);
    if (e.s != null) return Math.ceil((State.depths.spirit || 0) * e.s / 100);
    return 0;
  },

  /* 钥令按钮是否可点（游戏内：银钥满 1000 点亮；出牌阶段；每回合≤2次） */
  ready() {
    const b = State.battle;
    return !!(b && b.phase === "play" && b.silver >= this.BASE_COST && (b.yogenCastsThisTurn || 0) < 2);
  },

  /* 银钥觉醒当前消耗：每已获得 1 张翻倍 */
  awakenCost() {
    return this.BASE_COST * Math.pow(2, (State.battle && State.battle.silverAwakenCount) || 0);
  },

  /* 可置入的「灵知觉醒」卡（当前卡牌库中该类型全部卡牌） */
  awakenCards() { return DBF.cards.filter(c => c.type === "灵知觉醒"); },

  /* 尘封旧忆候选：全部钥令 − 初始携带 − 本探索已释放；随机取 3 */
  forgottenOptions() {
    const b = State.battle;
    const pool = DBF.yogens.filter(y => y.id !== b.carriedYogen && !(b.usedYogens || []).includes(y.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  },

  /* ---------- 释放钥令 ----------
   * opts.via: "carried"（携带钥令，须为当回合第 1 次）
   *           | "forgotten"（尘封旧忆，须为第 2 次；排除携带与已用）
   * opts.choice: { allyUid, option, page } —— 需要选择的效果由 UI 先收集后传入 */
  cast(id, opts = {}) {
    const b = State.battle;
    const yg = DBF.yogens.find(y => y.id === id);
    if (!yg) { Log.add("未知钥令", "sys"); return false; }
    if (!b || b.phase !== "play") { Log.add('<span class="warn-text">钥令只能在我方出牌阶段释放</span>', "sys"); return false; }
    if ((b.yogenCastsThisTurn || 0) >= 2) { Log.add('<span class="warn-text">每回合最多释放 2 次钥令</span>', "sys"); return false; }
    if (b.silver < this.BASE_COST) { Log.add(`<span class="warn-text">银钥不足 ${this.BASE_COST}</span>`, "sys"); return false; }
    if (opts.via === "carried") {
      if ((b.yogenCastsThisTurn || 0) !== 0) { Log.add('<span class="warn-text">每回合第 1 次才能释放携带钥令</span>', "sys"); return false; }
      if (id !== b.carriedYogen) { Log.add('<span class="warn-text">该钥令不是当前携带的钥令</span>', "sys"); return false; }
    } else if (opts.via === "forgotten") {
      if ((b.yogenCastsThisTurn || 0) !== 1) { Log.add('<span class="warn-text">每回合第 2 次才能释放尘封旧忆</span>', "sys"); return false; }
      if (id === b.carriedYogen) { Log.add('<span class="warn-text">尘封旧忆不可选择初始携带的钥令</span>', "sys"); return false; }
      if ((b.usedYogens || []).includes(id)) { Log.add('<span class="warn-text">该钥令本次探索已释放过（每钥令每探索 1 次）</span>', "sys"); return false; }
    }
    b.silver -= this.BASE_COST;
    b.yogenCastsThisTurn = (b.yogenCastsThisTurn || 0) + 1;
    b.yogenCastHistory = b.yogenCastHistory || [];
    b.yogenCastHistory.push(id);   // 供 firstOnly（岁末花火）判定，须在 resolve 前记录
    if (opts.via === "forgotten") {
      b.usedYogens = b.usedYogens || [];
      if (!b.usedYogens.includes(id)) b.usedYogens.push(id);
      /* 探索级同步（T12）：每钥令每探索 1 次跨战斗持久——下一场战斗 startBattle 时拷回镜像 */
      State.usedYogensExplore = State.usedYogensExplore || [];
      if (!State.usedYogensExplore.includes(id)) State.usedYogensExplore.push(id);
      State.persist();
    }
    Log.add(`<b style="color:var(--gold)">🔑 释放钥令「${yg.name}」</b>（${opts.via === "forgotten" ? "尘封旧忆" : "携带"} · 消耗 1000 银钥，余 ${b.silver} · 本回合第 ${b.yogenCastsThisTurn} 次）`, "sys");
    /* 命轮钥令钩子（T8 四期）：专注精神/搭档特训/理智明灯/慈悲的哺育 */
    if (typeof Wheels !== "undefined") Wheels.onYogenCast(id);
    this.resolve(yg, opts.choice || {});
    Turn.checkEnd();
    State.notify();
    return true;
  },

  /* ---------- 银钥觉醒 ----------
   * 门槛银钥≥1000（按钮口径），消耗可透支为负；每次置入手牌 1 张灵知觉醒 */
  awaken(cardId) {
    const b = State.battle;
    if (!b || b.phase !== "play") { Log.add('<span class="warn-text">银钥觉醒只能在我方出牌阶段使用</span>', "sys"); return false; }
    if (b.silver < this.BASE_COST) { Log.add(`<span class="warn-text">银钥不足 ${this.BASE_COST}（按钮门槛）</span>`, "sys"); return false; }
    if (b.piles.hand.length >= Cards.HAND_LIMIT) { Log.add('<span class="warn-text">手牌已满，无法置入灵知觉醒</span>', "sys"); return false; }
    const card = State.getCard(cardId);
    if (!card || card.type !== "灵知觉醒") { Log.add('<span class="warn-text">请选择一张「灵知觉醒」</span>', "sys"); return false; }
    const cost = this.awakenCost();
    b.silver -= cost;
    b.silverAwakenCount = (b.silverAwakenCount || 0) + 1;
    b.piles.hand.push(Cards.inst(cardId, false));
    Log.add(`<b style="color:var(--gold)">🔓 银钥觉醒</b>：消耗 ${cost} 银钥（银钥 ${b.silver}${b.silver < 0 ? "，已透支" : ""}），「${card.name}」置入手牌；下次消耗 ${this.awakenCost()}（每获得 1 张翻倍）`, "sys");
    State.notify();
    return true;
  },

  /* 回合开始：结算延迟护盾（蚀骨的拥抱等）——由 Turn.startTurn 调用 */
  tickDelayed() {
    const b = State.battle;
    if (!b || !b.delayed || !b.delayed.length) return;
    for (const d of b.delayed) {
      for (const a of b.allies) {
        const real = (typeof Damage !== "undefined") ? Damage.addShield(a, d.v) : (a.shield += d.v, d.v);
        if (window.UIBoard) UIBoard.float(a.uid, `+${real}🛡`, "shield");
      }
      Log.add(`💫（延迟效果）全体唤醒体获得护盾 +${d.v}（${d.label}）`, "good");
    }
    b.delayed = [];
  },

  /* 需选目标的兜底：未传 choice 时取第一位唤醒体（UI 面板会先收集选择） */
  _pickAlly(ch) {
    const b = State.battle;
    return (ch && ch.allyUid ? b.allies.find(a => a.uid === ch.allyUid) : null) || b.allies[0] || null;
  },

  /* ---------- 钥令效果结算（解释 data/yogens.js 的 eff 数组） ---------- */
  resolve(yg, ch) {
    const b = State.battle;
    const name = `钥令·${yg.name}`;
    for (const e of (yg.eff || [])) {
      const v = this.val(e);
      switch (e.op) {

        case "block": {
          /* 队伍级技能 → 挂全体唤醒体（目标范围待实测确认） */
          for (const a of b.allies) {
            const real = (typeof Damage !== "undefined") ? Damage.addShield(a, v) : (a.shield += v, v);
            if (window.UIBoard) UIBoard.float(a.uid, `+${real}🛡`, "shield");
          }
          Log.add(`💫 全体唤醒体获得护盾 +${v}（当前合计 ${b.allies.reduce((s, a) => s + a.shield, 0)}；目标范围按全员，待实测）`, "good");
          break;
        }

        case "delayedBlock": {
          b.delayed = b.delayed || [];
          b.delayed.push({ v, label: name });
          Log.add(`💫 下回合开始时获得护盾 +${v}`, "good");
          break;
        }

        case "heal":
          Damage.heal(b.allies[0], v, name);
          break;

        case "healIfLow":
          if (b.team.hp < b.team.maxHp * 0.25) {
            Log.add(`💫（当前生命低于 25%，触发额外回复）`, "sys");
            Damage.heal(b.allies[0], v, name + "（生命<25%）");
          } else {
            Log.add(`<span class="dim">当前生命 ${b.team.hp}/${b.team.maxHp} 未低于 25%，回复部分未触发</span>`, "sys");
          }
          break;

        case "str": {
          for (const a of b.allies) Buffs.add(a, "buff_strength", 1, e.temp ? 1 : null, name + (e.tag ? `（${e.tag}）` : ""), v);
          Log.add(`💫 全体唤醒体力量 ${e.tag ? `（${e.tag}）` : ""}+${v}${e.temp ? "（临时，回合末消失）" : ""}`, "good");
          break;
        }

        case "strDown": {
          const tgts = b.enemies.filter(x => x.hp > 0);
          for (const t of tgts) Buffs.add(t, "debuff_strength_down", 1, e.temp ? 1 : null, name + (e.tag ? `（${e.tag}）` : ""), -v);
          Log.add(`💫 所有敌人力量降低 ${v}${e.tag ? `（${e.tag}）` : ""}${e.temp ? "（临时）" : ""}`, "good");
          break;
        }

        case "guku": {
          const t = this._pickAlly(ch);
          if (!t) break;
          t.guku = Math.min(t.gukuMax || 100, t.guku + v);
          Log.add(`💫 ${t.def.name} 获得 ${v} 点狂气（${t.guku}/${t.gukuMax}）`, "good");
          break;
        }

        case "gukuAll": {
          for (const a of b.allies) a.guku = Math.max(0, Math.min(a.gukuMax || 100, a.guku + v));
          Log.add(`💫 所有唤醒体狂气 ${v > 0 ? "+" : ""}${v}`, "good");
          break;
        }

        case "gukuSteal": {
          const t = this._pickAlly(ch);
          if (!t) break;
          let left = v;
          for (const a of b.allies) {
            if (a === t || left <= 0) continue;
            const take = Math.min(left, a.guku);
            if (take > 0) {
              a.guku -= take;
              left -= take;
              Log.add(`💫 从 ${a.def.name} 偷取 ${take} 点狂气`, "sys");
            }
          }
          const got = v - left;
          t.guku = Math.min(t.gukuMax || 100, t.guku + got);
          Log.add(`💫 ${t.def.name} 共获得 ${got} 点狂气（偷取上限 ${v}）`, "good");
          break;
        }

        case "energy":
          b.energy = Math.min(10, b.energy + v);
          Log.add(`💫 获得 ${v} 点算力（当前 ${b.energy}）`, "good");
          break;

        case "draw":
          Cards.draw(v);
          break;

        case "drawLowCost": {
          const n = Math.min(v, Cards.HAND_LIMIT - b.piles.hand.length);
          if (n <= 0) { Log.add("手牌已满，无法抽牌", "sys"); break; }
          const sorted = b.piles.draw.slice().sort((x, y) =>
            ((State.getCard(x.defId) || {}).cost || 0) - ((State.getCard(y.defId) || {}).cost || 0));
          for (let i = 0; i < n && sorted.length; i++) {
            const inst = sorted.shift();
            b.piles.draw.splice(b.piles.draw.indexOf(inst), 1);
            b.piles.hand.push(inst);
            Log.add(`抽到 <b>${Cards.def(inst).name}</b>（算力消耗最低）`, "sys");
          }
          if (n < v) Log.add(`<span class="dim">手牌上限，实际抽到 ${n}/${v} 张</span>`, "sys");
          break;
        }

        case "drawType": {
          const n = Math.min(v, Cards.HAND_LIMIT - b.piles.hand.length);
          let drawn = 0;
          for (let i = b.piles.draw.length - 1; i >= 0 && drawn < n; i--) {
            if ((State.getCard(b.piles.draw[i].defId) || {}).type === e.cardType) {
              const [c] = b.piles.draw.splice(i, 1);
              b.piles.hand.push(c);
              drawn++;
              Log.add(`抽到 <b>${Cards.def(c).name}</b>（${e.cardType}）`, "sys");
            }
          }
          if (drawn < v) Log.add(`<span class="dim">牌堆中「${e.cardType}」不足（抽到 ${drawn}/${v}）</span>`, "sys");
          break;
        }

        case "poison": {
          const alive = b.enemies.filter(x => x.hp > 0);
          const tgts = e.target === "maxHp" ? [alive.slice().sort((a, c) => c.maxHp - a.maxHp)[0]].filter(Boolean) : alive;
          for (const t of tgts) Buffs.add(t, "debuff_poison", v, null, name, 1);
          break;
        }

        case "ember": {
          const count = (b.yogenCastHistory || []).filter(x => x === yg.id).length;
          if (e.firstOnly && count > 1) {
            Log.add(`<span class="dim">（非本场战斗首次释放，「旧日余烬」部分不生效）</span>`, "sys");
            break;
          }
          for (const t of b.enemies.filter(x => x.hp > 0)) Buffs.add(t, "buff_ember", v, null, name);
          break;
        }

        case "riposte":
          for (const a of b.allies) Buffs.add(a, "buff_riposte", 1, null, name, v);
          break;

        case "debuff":
          for (const t of b.enemies.filter(x => x.hp > 0))
            Buffs.add(t, e.buffId, e.stacks || 1, e.duration != null ? e.duration : undefined, name);
          break;

        case "crit": {
          const bid = e.dmg ? "buff_critdmg_up" : "buff_crit_up";
          for (const a of b.allies) Buffs.add(a, bid, 1, 1, name, v);
          Log.add(`💫 全体唤醒体临时${e.dmg ? "暴击伤害" : "暴击率"} +${v}%（回合末消失）`, "good");
          break;
        }

        case "boost":
          for (const a of b.allies) Buffs.add(a, "buff_boost_up", 1, 1, name, v);
          Log.add(`💫 全体唤醒体临时伤害强效 +${v}%（回合末消失）`, "good");
          break;

        case "cardGen": {
          const n = Math.min(e.v || 1, Cards.HAND_LIMIT - b.piles.hand.length);
          for (let i = 0; i < n; i++) b.piles.hand.push(Cards.inst(e.cardId, false));
          if (n > 0) Log.add(`💫 <b>${State.getCard(e.cardId).name}</b> ×${n} 置入手牌`, "good");
          else Log.add("手牌已满，未能置入", "sys");
          break;
        }

        case "copyBasics": {
          const t = this._pickAlly(ch);
          if (!t) break;
          for (const bn of ["打击", "防御"]) {
            const def = DBF.cards.find(c => c.owner === t.def.id && new RegExp(`^(基础)?${bn}$`).test(c.name || ""));
            if (def && b.piles.hand.length < Cards.HAND_LIMIT) {
              const inst = Cards.inst(def.id, false);
              inst.forceExhaust = true;   // 「消耗」：打出后消除
              b.piles.hand.push(inst);
              Log.add(`💫 ${t.def.name} 的「${def.name}」原始复制置入手牌（消耗）`, "good");
            }
          }
          break;
        }

        case "strFromShield": {
          const total = b.allies.reduce((s, a) => s + a.shield, 0);
          const sv = Math.ceil(total * (e.pct || 10) / 100);
          if (sv > 0) {
            for (const a of b.allies) Buffs.add(a, "buff_strength", 1, 1, name, sv);
            Log.add(`💫 按当前护盾合计 ${total} 的 ${e.pct || 10}% → 全体临时力量 +${sv}`, "good");
          }
          break;
        }

        case "starBless": {
          const opt = ch.option === "苏醒" ? "苏醒" : "沉眠";
          if (opt === "苏醒") {
            const used = b.starBless || 0;
            for (const a of b.allies) a.guku = Math.min(a.gukuMax || 100, a.guku + 8);
            if (used > 0) {
              b.energy = Math.min(10, b.energy + used);
              Log.add(`💫 苏醒：消耗 ${used} 层「星辰庇佑」→ 算力 +${used}；全体唤醒体狂气 +8`, "good");
            } else {
              Log.add(`💫 苏醒：无「星辰庇佑」可消耗；全体唤醒体狂气 +8`, "good");
            }
            b.starBless = 0;
          } else {
            b.starBless = Math.min(5, (b.starBless || 0) + 1);
            for (const a of b.allies) { const real = (typeof Damage !== "undefined") ? Damage.addShield(a, v) : (a.shield += v, v); void real; }
            Log.add(`💫 沉眠：全体护盾 +${v}，「星辰庇佑」${b.starBless}/5 层（跨战斗保留待实现）`, "good");
          }
          break;
        }

        case "poem": {
          const all = Object.keys(e.pages || {});
          b.poemUsed = b.poemUsed || [];
          let left = all.filter(p => !b.poemUsed.includes(p));
          if (!left.length) {
            b.poemUsed = [];
            left = all.slice();
            Log.add(`💫 四种诗页已全部选择，选项重置`, "sys");
          }
          const page = (ch.page && left.includes(ch.page)) ? ch.page : left[0];
          b.poemUsed.push(page);
          Log.add(`💫 选择诗页「${page}」（剩余选项：${left.filter(p => p !== page).join("、") || "无，下次将重置"}）`, "good");
          this.resolve({ name: `${yg.name}·${page}`, eff: [e.pages[page]] }, ch);
          break;
        }

        case "note":
          Log.add(`<span class="warn-text">⚠ 未自动结算：${e.text}</span>`, "sys");
          break;

        default:
          Log.add(`⚠ 钥令效果类型未实现: ${e.op}`, "sys");
      }
    }
  }
};

window.Yogens = Yogens;
