/* =========================================================
 * 引擎 · 触腕（T7，2026-10-01 实装）
 * ---------------------------------------------------------
 * 深海界域队伍公共资源。公式=E6 v5 终版（MULTIPLIER-TESTS.md，56/56 全中）：
 *   单次 = ceil( 0.095 × Σ各队员ceil(基础面板攻×(1+0.03×灵塑适性))
 *                × (1+Σ面板强效/100) × 独立词条乘区
 *                + 深海共生(1%×队最大生命×混沌数) + 0.5×力量合计 )
 *        + 固定触伤点数
 * 口径注意：
 *   - 基础面板攻优先取 DBF.personal.characters 同名 atk（用户实测面板，含灵格
 *     成长、不含灵塑通胀），回落 statAt(def, effLevel, "attack")——
 *     不能用 ally.attack（引擎灵塑占位 +3%/级已通胀，会重复放大）
 *   - Σ面板强效=Σstats.damageBoost（命轮主属性强效轮生效）；深化组强效未实装，
 *     无强效命轮时会低估（待 gear 侧补深化组）
 *   - 姿态倍率：潮涌×1.0（默认，回合开始重置）/ 静海×0.5+护盾 / 怒涛×1.25+主动触发
 *   - 数量：触腕统御开战1条；至纯深海（全深海队）翻倍=2条；潮涌保持每回合+1；
 *     爆发后+1层集结（回合末每层额外1条）；深海精通每点0.25%概率额外集结层（至纯×2）
 * 未建模（数据可靠，见 DATA-TODO 蓝级）：异格「晦暝·深海」变体、成员触伤词条、
 *   固定触伤点数来源、怒涛主动触发的精通加成、静海护盾分配方式（现按均分）
 * ========================================================= */
"use strict";

const Tentacle = {

  /* ---------- 界域判断 ---------- */
  hasDeepSea() {
    const b = State.battle;
    return !!b && b.allies.some(a => (a.def.realm || "").includes("深海"));
  },
  isPureDeepSea() {
    const b = State.battle;
    return !!b && b.allies.length > 0 && b.allies.every(a => (a.def.realm || "").includes("深海"));
  },

  /* ---------- 战斗开始（触腕统御）---------- */
  initBattle() {
    const b = State.battle;
    b.tentacle = null;
    if (!this.hasDeepSea()) return null;
    b.tentacle = { count: this.isPureDeepSea() ? 2 : 1, stance: "潮涌", rally: 0, swapped: false };
    Log.add(`🐙 触腕统御：战斗开始生成 ${b.tentacle.count} 条触腕${this.isPureDeepSea() ? "（至纯深海翻倍）" : ""}`, "sys");
    return b.tentacle;
  },
  active() { const b = State.battle; return !!b && !!b.tentacle; },

  /* ---------- 基础面板攻（E6 口径：含灵格、不含灵塑通胀）---------- */
  baseAttack(ally) {
    const p = ((window.DBF && DBF.personal && DBF.personal.characters) || []).find(c => c.name === ally.def.name);
    if (p && p.atk != null) return p.atk;
    return State.statAt(ally.def, ally.level + (ally.innerGridLv || 0) * 2, "attack");
  },

  /* ---------- 单次伤害（v5 公式，不含姿态倍率）---------- */
  singleDamage() {
    const b = State.battle;
    if (!b || !b.tentacle) return 0;
    let pool = 0;
    for (const a of b.allies) {
      pool += Math.ceil(this.baseAttack(a) * (1 + 0.03 * (a.spiritAdaptLv || 0)));
    }
    const boost = b.allies.reduce((s, a) => s + ((a.stats && a.stats.damageBoost) || 0), 0);
    /* 深海共生（混沌界域天赋，队伍含深海时生效）：每混沌 +1%×队最大生命（加算项，
     * 2026-10-01 定量验证：2混沌+队生命2533 → +50.66，ceil(945×0.095+50.66)=141 分毫命中；
     * ⚠ 用基础 maxHp（baseMaxHp，不含命轮灵魂诞生/局内生命增益）——用户实测 10-01：
     * 灵魂诞生+10%HP 与局内加生命均不影响共生（E6 第七批"+10%HP 触伤 111 不变"的真正解释）） */
    let symbiosis = 0;
    if (this.hasDeepSea()) {
      const chaosN = b.allies.filter(a => State.realmGroup(a.def.realm) === "混沌").length;
      const baseHp = b.team.baseMaxHp || b.team.maxHp;
      if (chaosN > 0 && baseHp > 0) symbiosis = baseHp * 0.01 * chaosN;
    }
    /* 「触腕伤害加一半的力量」（E6 机制发现B：32力量→+16触伤）：当前力量合计×0.5
     * T32 实测批：力量为全队共享 buff——共享实例只计一次（否则按队员数重复累加） */
    let power = 0;
    const seenShared = new Set();
    for (const a of b.allies) {
      if (!a.buffs) continue;
      for (const inst of a.buffs) {
        const def = State.getBuff(inst.defId);
        if (!def || def.effect.damageFlat == null) continue;
        if (def.shared) {
          if (seenShared.has(inst.defId)) continue;
          seenShared.add(inst.defId);
        }
        const per = inst.per != null ? inst.per : def.effect.damageFlat;
        power += per * inst.stacks;
      }
    }
    /* 临时触腕伤害（T32 实测批：螺湮圆舞潮涌等「触腕伤害+[攻×X%]」）——加算点数，⚠加算位置未经实测，估算入基础段 */
    const tempDmg = this._tempDmgSum();
    const main = pool * 0.095 * (1 + boost / 100);
    if (tempDmg > 0) return Math.ceil(main + symbiosis + power * 0.5 + tempDmg);
    return Math.ceil(main + symbiosis + power * 0.5);
  },

  /* 临时触腕伤害（T32 实测批）：「触腕伤害 +[攻击力*X%]」= 单次触伤加算 攻×X% 点（⚠加算位置未经实测，暂入基础段） */
  addTempDmg(ally, pct) {
    const b = State.battle;
    if (!b || !b.tentacle) return;
    b.tempTentacleDmg = b.tempTentacleDmg || [];
    b.tempTentacleDmg.push({ uid: ally.uid, pct });
    Log.add(`🐙 ${ally.def.name} 触腕伤害 +攻击力×${pct}%（临时，本回合）`, "sys");
  },

  _tempDmgSum() {
    const b = State.battle;
    if (!b || !b.tempTentacleDmg || !b.tempTentacleDmg.length) return 0;
    let sum = 0;
    for (const t of b.tempTentacleDmg) {
      const a = b.allies.find(x => x.uid === t.uid);
      if (a) sum += (a.attack || 0) * t.pct;
    }
    return sum;
  },

  /* ---------- 单条触腕攻击：基础值 → ④虚弱 → ⑤易伤 → ⑥触腕暴击 → 落账 ----------
   * src（T41）：触发本次触腕攻击的成员（怒涛追击传入）；E6 实测成员触伤词条不进自动触腕，
   * 因此仅 src 有值时应用 Spirit.tentacleSrcMult（自动触腕 src=null 不吃词条） */
  strike(target, mult = 1, label = "触腕", src = null) {
    const b = State.battle;
    if (!target || target.hp <= 0 || !b || !b.tentacle) return null;
    let base = this.singleDamage() * mult;
    /* 灵塑成员触伤词条（T41）：希莱斯特/弥利亚姆——仅成员触发的触腕攻击 ×(1+X%) */
    if (typeof Spirit !== "undefined" && src) {
      const tm = Spirit.tentacleSrcMult(src);
      if (tm > 1) {
        base = Math.ceil(base * tm);
      }
    }
    const steps = [{
      label: "① 触腕基础", value: base,
      note: `E6 v5：Σ成员ceil(攻×(1+0.03灵塑))×0.095×(1+Σ面板强效%)${mult !== 1 ? `×${mult}` : ""}（+共生/力量加算）`
    }];
    let v = base;
    /* ④ 增伤状态区（虚弱等：触腕伤害降低25%——官方词条确认吃触腕） */
    let vmods = [];
    for (const a of b.allies) {
      if (a.buffs) vmods = vmods.concat(Buffs.collect(a, "damagePct"));
    }
    if (vmods.length) {
      const agg = Buffs.aggregate(vmods);
      v *= agg.factor; v = Math.ceil(v);
      steps.push({ label: "④ 增伤状态区", value: v, mods: agg.mods, factorText: `× ${agg.factor.toFixed(3)}` });
    }
    /* ⑤ 易伤区（E6 实测：触腕吃易伤） */
    if (target.buffs) {
      const tmods = Buffs.collect(target, "takenPct");
      if (tmods.length) {
        const agg = Buffs.aggregate(tmods);
        v *= agg.factor; v = Math.ceil(v);
        steps.push({ label: "⑤ 易伤区", value: v, mods: agg.mods, factorText: `× ${agg.factor.toFixed(3)}` });
      }
    }
    /* ⑥ 触腕暴击（深海天赋：初始=全队暴击率和×50%，爆伤同；关卡内+1%/人→+0.25% 动态项未追踪） */
    const crPct = b.allies.reduce((s, a) => s + ((a.stats && a.stats.critRate) || 0), 0) * 0.5;
    const cdPct = b.allies.reduce((s, a) => s + ((a.stats && a.stats.critDmg) || 0), 0) * 0.5;
    let isCrit = false;
    /* T44②：触腕=我方侧，跟随强制暴击开关 */
    const fcT = State.forceCrit;
    if (fcT === true || (fcT !== false && crPct > 0 && Math.random() * 100 < crPct)) {
      v *= 1 + cdPct / 100; v = Math.ceil(v); isCrit = true;
      steps.push({ label: "⑥ 触腕暴击", value: v, factorText: `× ${(1 + cdPct / 100).toFixed(2)}`, note: `触腕暴击率 ${crPct}%（全队和×50%）` });
    }
    const final = v > 0 ? Math.ceil(v) : 0;
    steps.push({ label: "⑦ 最终伤害", value: final, note: "向上取整" });
    Damage.applyRawDamage(target, final, `🐙${label}${isCrit ? "（暴击）" : ""}`, { final, steps, warnings: [], crit: isCrit });
    return { final, crit: isCrit };
  },

  /* ---------- 回合结束结算（触腕统御：回合结束自动攻击前排）---------- */
  resolveTurnEnd() {
    const b = State.battle;
    if (!b || !b.tentacle) return;
    const t = b.tentacle;
    const strikes = t.count + t.rally
      + (typeof Wheels !== "undefined" ? Wheels.bonusTentacleStrikes() : 0);   // 于暴雨之中：深海+1（T8）
    if (strikes > 0) {
      const mult = t.stance === "静海" ? 0.5 : t.stance === "怒涛" ? 1.25 : 1.0;
      const tgt = () => b.enemies.find(e => e.hp > 0);
      if (tgt()) {
        Log.add(`🐙 触腕回合结束结算：${t.count} 条${t.rally ? ` + 集结 ${t.rally} 层` : ""}（姿态「${t.stance}」×${mult}）`, "dmg");
        for (let i = 0; i < strikes; i++) {
          const target = tgt();
          if (!target) break;
          this.strike(target, mult, `触腕 #${i + 1}`);
          /* 静海：每次触腕攻击获得 0.2% 最大生命护盾（分配方式待确认，现均分全体队员） */
          if (t.stance === "静海" && b.team.maxHp > 0 && b.allies.length) {
            const sh = Math.ceil(b.team.maxHp * 0.002 / b.allies.length);
            for (const a of b.allies) { const real = (typeof Damage !== "undefined") ? Damage.addShield(a, sh) : (a.shield += sh, sh); void real; }
            if (window.UIBoard) UIBoard.floatTeam(`+盾${sh * b.allies.length}`, "shield");
          }
        }
      }
    }
    t.rally = 0;   // 触腕集结：回合末结算后清除
    if (t.stance === "怒涛" && t.count > 0) {
      t.count -= 1;
      Log.add(`🐙 怒涛姿态：回合结束失去 1 条触腕（余 ${t.count}）`, "sys");
    }
    if (t.stance === "潮涌" && t.count > 0) {
      t.count += 1;   // 潮涌保持 → 下回合开始生成1条（数值上等价于回合末+1）
      Log.add(`🐙 潮涌保持：下回合开始生成 1 条触腕（共 ${t.count}）`, "sys");
    }
  },

  /* ---------- 回合开始：姿态重置为潮涌、可切换次数重置 ---------- */
  onTurnStart() {
    const b = State.battle;
    if (!b || !b.tentacle) return;
    b.tentacle.stance = "潮涌";
    b.tentacle.swapped = false;
    b.tempTentacleDmg = [];   // 临时触腕伤害（螺湮圆舞潮涌等）每回合清空（T32 实测批）
  },

  /* ---------- 爆发钩子（触腕集结）---------- */
  onBurst(ally) {
    const b = State.battle;
    if (!b || !b.tentacle || !this.hasDeepSea()) return;
    b.tentacle.rally += 1;
    Log.add(`🐙 触腕集结 +1 层（${ally.def.name} 爆发，现 ${b.tentacle.rally}）——回合末每层驱使 1 条触腕`, "sys");
    /* 深海精通：每点界域精通 0.25% 概率额外 +1 层（至纯深海翻倍；超100%可多层） */
    const mastery = (() => { const ts = State.teamStats(); return ts.realmMastery || 0; })();
    let p = mastery * 0.25 * (this.isPureDeepSea() ? 2 : 1);
    let extra = 0;
    while (p > 0 && Math.random() * 100 < Math.min(p, 100)) { extra += 1; p -= 100; }
    if (extra > 0) {
      b.tentacle.rally += extra;
      Log.add(`🐙 深海精通触发：额外 +${extra} 层触腕集结（精通 ${mastery}×0.25%）`, "sys");
    }
  },

  /* ---------- 怒涛：造成主动伤害后使 1 条触腕以 50% 触腕伤害追击（src=触发成员，灵塑触伤词条随行） ---------- */
  onAllyDeal(target, src = null) {
    const b = State.battle;
    if (!b || !b.tentacle || b.tentacle.stance !== "怒涛" || b.tentacle.count <= 0) return;
    this.strike(target, 0.5, "怒涛触发", src);
  },

  /* ---------- 姿态切换（UI：每回合 1 次）---------- */
  STANCES: { "潮涌": "静海", "静海": "怒涛", "怒涛": "潮涌" },
  MULT: { "潮涌": 1.0, "静海": 0.5, "怒涛": 1.25 },   // 姿态倍率（chip 显示/结算共用）
  cycleStance() {
    const b = State.battle;
    if (!b || !b.tentacle) { alert("当前队伍没有触腕（需要深海界域成员并开始战斗）"); return; }
    const t = b.tentacle;
    if (t.swapped) { alert("每回合只能切换 1 次触腕姿态"); return; }
    this.setStance(this.STANCES[t.stance] || "潮涌");
  },
  /* 直接切到指定姿态（共用结算：swapped 标记 + 静海护盾；调用方负责存在性/swapped 预检——T30 Executor 复用） */
  setStance(name) {
    const b = State.battle;
    const t = b && b.tentacle;
    if (!t) return false;
    t.stance = name;
    t.swapped = true;
    Log.add(`🐙 触腕姿态切换为「${t.stance}」（每回合可切 1 次）`, "sys");
    /* 静海：立刻获得 8% 最大生命护盾（均分队员，分配方式待确认） */
    if (t.stance === "静海" && b.team.maxHp > 0 && b.allies.length) {
      const sh = Math.ceil(b.team.maxHp * 0.08 / b.allies.length);
      for (const a of b.allies) { const real = (typeof Damage !== "undefined") ? Damage.addShield(a, sh) : (a.shield += sh, sh); void real; }
      Log.add(`🐙 静海：全体获得护盾 ${sh}/人（8% 最大生命均分，合计 ${sh * b.allies.length}）`, "good");
    }
    State.notify();
    return true;
  }
};
