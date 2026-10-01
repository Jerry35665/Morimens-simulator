/* =========================================================
 * 引擎 · 伤害计算管线
 * ---------------------------------------------------------
 * 乘区顺序（2026-09-28/29 游戏实测钉死，详见 docs/MECHANICS.md 与 MULTIPLIER-TESTS.md）：
 *   ① 基础值     卡面值或 攻击力×倍率（向上取整）
 *   ② 伤害强效区 ×(1+面板强效%+临时强效%)——独立乘区，临时强效并入本区加算（E5 实测）
 *   ③ 力量区     + Σ力量点数（强效后加算、暴击前，实测确认）
 *   ④ 增伤状态区 ×(1+强化/虚弱类 damagePct)——在易伤区之前（E2 实测：虚弱先于易伤结算）
 *   ⑤ 易伤区     ×(1+目标易伤 takenPct)
 *   ⑥ 暴击区     ×(1+暴击伤害%)（实测确认）
 *   ⑥.5 最终伤害区 ×(1+finalBoostPct%)——独立乘算区（E4 塔薇实测 ×1.15，非并入强效）
 *   ⑦ 最终值     max(0, ceil)
 * ★ 每个乘区结算后立即向上取整，再进下一区（2026-09-29 E2/E3 边界值三重互证：
 *   205×1.288→265、265×1.4=371、222×0.75→167、167×1.5→251——非整条管线只取整一次）
 * ========================================================= */
"use strict";

const Damage = {

  /* 计算一次伤害，返回 {final, steps, warnings, crit}，不落账。
   * ignoreBuffs=true 时跳过力量/增伤/易伤等战斗状态区（只算角色属性，用于卡面原始值显示）
   * crit=true 真实暴击（deal 内判定后传入）；不传则跳过暴击区（预览用） */
  compute({ source, target, card, eff, ignoreBuffs = false, crit }) {
    const steps = [];
    const warnings = [];
    let isCrit = false;

    /* ① 基础值 */
    const isScaled = eff.scaleAttack != null && eff.value == null;
    let base = eff.value != null ? eff.value
      : isScaled ? Math.ceil(source.attack * eff.scaleAttack) : 0;   // 攻击×倍率向上取整（官方：101攻击→20.2=21）
    steps.push({
      label: "① 基础值",
      value: Math.round(base * 100) / 100,
      note: isScaled ? `${source.def.name}攻击${source.attack} × ${eff.scaleAttack}（向上取整）` : "卡面实测值"
    });

    /* ② 伤害强效区（角色面板，独立乘区；临时伤害强效（钥令等 buff_boost_up）并入同区加算） */
    let boostPct = (source.stats ? source.stats.damageBoost : source.damageBoost) || 0;
    const boostMods = (ignoreBuffs || !source.buffs) ? [] : Buffs.collect(source, "damageBoostPct");
    if (boostMods.length) boostPct += boostMods.reduce((s, m) => s + m.total, 0);
    if (boostPct) {
      base *= 1 + boostPct / 100;
      base = Math.ceil(base);   // ★ 每区结算后立即向上取整（2026-09-29 实测：205×1.288=264.04→265 再进下一区）
      steps.push({
        label: "② 伤害强效", value: base,
        factorText: `× ${(1 + boostPct / 100).toFixed(2)}`,
        note: `${source.def.name} 面板伤害强效 ${(source.stats ? source.stats.damageBoost : source.damageBoost) || 0}%`
          + (boostMods.length ? ` + 临时 ${boostMods.reduce((s, m) => s + m.total, 0)}%` : "")
      });
    }

    /* ②.5 命轮乘区（T8，2026-10-01 实测模型：**同措辞组内加算、组间乘算**——
     * 被缚+核心熔解 打击=42=ceil(27×1.55)、被缚+星天=100/基线56 同区、隐没×陨日=1.5×1.2 乘算）。
     * strike 组并入临时打击伤害 buff（狂戮 buff_strike_tmp，与装备词条同区加算）；
     * 打击卡：baseCard+basePlain+strike；爆发卡：baseCard+basePlain+burstStar+burst；
     * 装备常驻（ignoreBuffs 也生效）；✅触腕不吃命轮乘区（2026-10-01 用户实测） */
    if (typeof Wheels !== "undefined" && !ignoreBuffs) {
      const wm = Wheels.combatMods(source);
      const isStrike = card && /^(基础)?打击$/.test(card.name || "");
      const isBurst = card && card.type === "狂气爆发";
      const used = [wm.groups.baseCard, wm.groups.basePlain, wm.groups.cmdBase];
      if (isStrike) {
        used.push(wm.groups.strike);
      }
      if (isBurst) used.push(wm.groups.burstStar, wm.groups.burst);
      /* 魔女宽檐帽（T8 四期实测：首卡 ×1.603 独立乘算）——每回合第一张指令卡（firstCardPlayed 未置位=本次是首卡） */
      const battleState = State.battle;
      if (wm.groups.firstCard.pct && battleState && battleState.firstCardPlayed === false) used.push(wm.groups.firstCard);
      for (const grp of used) {
        if (!grp.pct) continue;
        base *= 1 + grp.pct / 100;
        base = Math.ceil(base);
        steps.push({
          label: "②.5 命轮乘区·" + grp.names.join("、"), value: base,
          factorText: `× ${(1 + grp.pct / 100).toFixed(3)}`,
          note: "同措辞组内加算（实测 42/100），组间乘算（E3/E8/隐没×陨日）"
        });
      }
    }

    /* ③ 力量区（点数加算，含负的力量降低）——强效后、暴击前（实测确认） */
    {
      const mods = ignoreBuffs ? [] : [...Buffs.collect(source, "damageFlat")];
      if (mods.length) {
        const flat = mods.reduce((s, m) => s + m.total, 0);
        base += flat;
        base = Math.ceil(base);
        steps.push({
          label: "③ 力量区", value: base, mods,
          factorText: `${flat >= 0 ? "+" : ""}${flat}`,
          note: "点数加算（不吃伤害强效放大；2026-09-26 实测）"
        });
      }
    }

    /* ③.5 打击伤害点数（T8：狂戮 buff_strike_tmp——「打击伤害临时提高56」为固定点数非百分比，
     * 2026-10-01 用户实测修正；仅打击卡，力量区后加算） */
    if (card && !ignoreBuffs && source.buffs && /^(基础)?打击$/.test(card.name || "")) {
      const sflat = Buffs.collect(source, "strikeFlat").reduce((s, m) => s + m.total, 0);
      if (sflat > 0) {
        base += sflat;
        base = Math.ceil(base);
        steps.push({
          label: "③.5 打击伤害点数", value: base, mods: Buffs.collect(source, "strikeFlat"),
          factorText: `+${sflat}`,
          note: "固定点数加算（狂戮实测：非百分比）"
        });
      }
    }

    /* ④ 增伤状态区（强化/虚弱等）——在易伤区之前（2026-09-29 E2 实测：虚弱先结算取整再进易伤） */
    {
      const mods = ignoreBuffs ? [] : Buffs.collect(source, "damagePct");
      if (mods.length) {
        const agg = Buffs.aggregate(mods);
        base *= agg.factor;
        base = Math.ceil(base);
        if (agg.hasUnknown) warnings.push("增伤状态区存在未知/混合叠加规则，当前按乘算预估");
        steps.push({
          label: "④ 增伤状态区", value: base, mods: agg.mods,
          factorText: `× ${agg.factor.toFixed(3)}`, unknown: agg.hasUnknown
        });
      }
    }

    /* ⑤ 易伤区（目标受到伤害+%） */
    if (target && !ignoreBuffs) {
      const mods = Buffs.collect(target, "takenPct");
      if (mods.length) {
        const agg = Buffs.aggregate(mods);
        base *= agg.factor;
        base = Math.ceil(base);
        if (agg.hasUnknown) warnings.push("易伤区存在未知叠加规则，当前按乘算预估");
        steps.push({
          label: "⑤ 易伤区", value: base, mods: agg.mods,
          factorText: `× ${agg.factor.toFixed(3)}`, unknown: agg.hasUnknown
        });
      }
    }

    /* ⑥ 暴击区（2026-09-26 实测确认：×(1+暴击伤害%)，力量在暴击前加算）
     * deal() 传 crit=true/false 真实判定；预览调用（不带 crit）跳过 */
    if (crit === true) {
      let cdBase = (source.stats && source.stats.critDmg) ?? 50;
      /* 打击暴伤（T8 四期实测：不灭的饥骨50/天之陨75——加到爆伤基础值，同区加算，仅打击卡） */
      if (card && typeof Wheels !== "undefined" && /^(基础)?打击$/.test(card.name || "")) {
        const scd = Wheels.combatMods(source).strikeCritDmg;
        if (scd > 0) cdBase += scd;
      }
      /* 临时暴击伤害（钥令/空心人等）与面板爆伤加算 */
      const cdExtra = (ignoreBuffs || !source.buffs) ? 0 : Buffs.collect(source, "critDmgFlat").reduce((s, m) => s + m.total, 0);
      const cdPct = cdBase + cdExtra;
      base *= 1 + cdPct / 100;
      isCrit = true;
      steps.push({
        label: "⑥ 暴击", value: Math.round(base * 100) / 100,
        factorText: `× ${(1 + cdPct / 100).toFixed(2)}`,
        note: `${source.def.name} 暴击伤害 ${cdPct}%`
      });
    } else if (crit === false && source.stats && source.stats.critRate > 0) {
      steps.push({ label: "⑥ 暴击", value: Math.round(base * 100) / 100, note: "未暴击" });
    }
    if (crit === true) base = Math.ceil(base);

    /* ⑥.5 最终伤害区（2026-09-29 E4 实测：独立乘算区，非并入强效——塔薇爆发+15% → ×1.15）
     * 来源：finalBoostPct 类 buff（塔薇爆发/黑暗中的安眠等，尚未建模挂载）
     * 命轮「爆发最终伤害提高」（T8 三期：黑暗中的安眠20/蓝环毒素8）仅爆发卡生效，并入本区 */
    if (!ignoreBuffs && source.buffs) {
      const fmods = Buffs.collect(source, "finalBoostPct");
      let f = fmods.reduce((s, m) => s + m.total, 0);
      if (card && card.type === "狂气爆发" && typeof Wheels !== "undefined") {
        const bf = Wheels.combatMods(source).burstFinal;
        if (bf > 0) {
          f += bf;
          steps.push({
            label: "⑥.5 命轮·爆发最终伤害", value: 0,
            factorText: `+${bf}%`,
            note: "并入最终伤害区（E4 独立区）"
          });
        }
      }
      if (f > 0) {
        base *= 1 + f;
        base = Math.ceil(base);
        steps.push({
          label: "⑥.5 最终伤害", value: base, mods: fmods,
          factorText: `× ${(1 + f).toFixed(3)}`,
          note: "独立乘算区（2026-09-29 实测确认）"
        });
      }
    }

    const final = base > 0 ? Math.ceil(base) : 0;
    steps.push({ label: "⑦ 最终伤害", value: final, note: "向上取整（官方群确认：游戏数据均向上取整）" });
    return { final, steps, warnings, crit: isCrit };
  },

  /* 计算 + 落账（护盾→血量）+ 日志 + 飘字 */
  deal({ source, target, card, eff, label }) {
    if (!target || target.hp <= 0) return null;
    /* 暴击判定（2026-09-26 实测：×(1+暴击伤害%)）：按攻击方面板暴击率+临时暴击率 roll */
    const crPct = ((source.stats && source.stats.critRate) || 0)
      + (source.buffs ? Buffs.collect(source, "critRateFlat").reduce((s, m) => s + m.total, 0) : 0);
    const isCrit = crPct > 0 && Math.random() * 100 < crPct;
    const r = this.compute({ source, target, card, eff, crit: crPct > 0 ? isCrit : undefined });
    this.applyRawDamage(target, r.final, (isCrit ? "暴击！" : "") + (label || (card ? card.name : "伤害")), r);
    if (isCrit && window.UIBoard) UIBoard.float(target.uid, "暴击", "crit");
    if (window.UIBoard) UIBoard.float(target.uid, `-${r.final}`, "dmg");
    /* 反击（词条 2026-09-23）：目标承受主动伤害时，对伤害来源造成等量层数的纯粹伤害 */
    if (source && target.buffs) {
      const rip = Buffs.collect(target, "riposteFlat").filter(m => m.total > 0);
      if (rip.length) {
        const total = rip.reduce((s, m) => s + m.total, 0);
        Log.add(`🗡 ${target.def.name} 的反击触发：${source.def.name} 受 ${total} 点纯粹伤害`, "sys");
        this.applyRawDamage(source, total, `反击（${target.def.name}）`);
      }
    }
    /* 侵蚀/旧日余烬（承受主动伤害后：移除等量层数并失去300%移除量的生命；其他伤害路径不触发） */
    if (target.buffs) {
      for (const inst of [...target.buffs]) {
        const def = State.getBuff(inst.defId);
        if (!def || !def.burnOnHit) continue;
        const removed = Math.min(inst.stacks, r.final);
        if (removed <= 0) continue;
        inst.stacks -= removed;
        if (inst.stacks <= 0) target.buffs = target.buffs.filter(x => x !== inst);
        const burn = Math.ceil(removed * 3);   // 官方词条：失去300%移除量的生命
        Log.add(`🔥 ${target.def.name} 的 ${def.name} 被移除 ${removed} 层，失去 ${burn} 点生命（300%移除量）`, "sys");
        this.applyRawDamage(target, burn, `${def.name} 引爆`);
      }
    }
    /* 怒涛姿态（触腕 T7）：造成主动伤害后使 1 条触腕以 50% 触腕伤害追击目标 */
    if (typeof Tentacle !== "undefined" && source && source.side === "ally") {
      Tentacle.onAllyDeal(target);
    }
    return r;
  },

  /* 护盾统一入口（T8 三期）：命轮「护盾提高X%」（blockPct）在此乘算——
   * 各获得护盾的路径（卡牌 block/钥令/触腕静海/延迟护盾）统一走本方法 */
  addShield(unit, v, label = "") {
    let f = 1;
    if (typeof Wheels !== "undefined" && unit.side === "ally" && unit.fatewheels) {
      const bp = Wheels.combatMods(unit).blockPct;
      if (bp > 0) {
        f = 1 + bp / 100;
        Log.add(`<span class="dim">${unit.def.name} 的护盾受命轮增益 ×${f.toFixed(2)}</span>`, "sys");
      }
    }
    const real = Math.max(0, Math.round(v * f));
    unit.shield += real;
    return real;
  },

  /* 绕过管线的直接伤害（dot、触腕等）。我方伤害走队伍共享血条 */
  applyRawDamage(unit, amount, label, detail = null) {
    let remain = amount;
    let shieldPart = 0;
    if (unit.shield > 0) {
      shieldPart = Math.min(unit.shield, remain);
      unit.shield -= shieldPart;
      remain -= shieldPart;
    }

    if (unit.side === "ally") {
      const t = State.battle.team;
      t.hp = Math.max(0, t.hp - remain);
    } else {
      unit.hp = Math.max(0, unit.hp - remain);
    }

    let html = `<b>${unit.def.name}</b> 受到 <b style="color:var(--red)">${amount}</b> 点伤害（${label}）` +
      (shieldPart > 0 ? `，护盾吸收 ${shieldPart}` : "");
    html += unit.side === "ally"
      ? ` → 队伍生命 ${State.battle.team.hp}/${State.battle.team.maxHp}`
      : ` → 剩余 HP ${unit.hp}/${unit.maxHp}`;
    if (detail) {
      html += `<details><summary>计算明细</summary><div class="log-steps">`;
      for (const s of detail.steps) {
        html += `<div class="log-step ${s.unknown ? "unknown" : ""}">
          <span>${s.label}</span>
          <span class="contrib">${s.value}${s.factorText ? ` <span class="dim">${s.factorText}</span>` : ""}${s.unknown ? " ⚠" : ""}</span></div>`;
        if (s.mods) {
          for (const m of s.mods) {
            html += `<div class="log-step"><span class="dim">├ ${m.name} ×${m.stacks}${m.condNote || ""}${m.confirmed ? "" : " ⟨未确认⟩"}</span>
              <span class="contrib dim">${(m.total >= 0 ? "+" : "") + (Math.round(m.total * 1000) / 1000)}</span></div>`;
          }
        }
      }
      html += `</div></details>`;
    }
    for (const w of (detail ? detail.warnings : [])) {
      html += `<div class="log-warn">⚠ ${w}</div>`;
    }
    Log.add(html, "dmg");
    State.notify();
  },

  heal(unit, amount, label) {
    /* 重创（healPct 负）：受到的生命回复降低（词条 2026-09-23）+ 命轮常驻治疗增益（T8 二期，灵魂诞生+10%）
     * 两来源同区加算：factor = (1+命轮healPct/100) × 重创聚合系数 */
    let factor = 1;
    if (typeof Wheels !== "undefined" && unit.side === "ally" && unit.fatewheels) {
      const wh = Wheels.combatMods(unit).healPct;
      if (wh > 0) factor *= 1 + wh / 100;
    }
    if (unit.buffs) {
      const crush = Buffs.collect(unit, "healPct");
      if (crush.length) {
        const agg = Buffs.aggregate(crush);
        factor *= agg.factor;
        Log.add(`<span class="dim">${unit.def.name} 的回复受 ${crush.map(m => m.name).join("、")} 影响 ×${agg.factor.toFixed(2)}</span>`, "sys");
      }
    }
    if (factor !== 1) {
      amount = Math.max(0, Math.round(amount * factor));
      if (factor > 1) Log.add(`<span class="dim">${unit.def.name} 回复受命轮增益 ×${factor.toFixed(2)}</span>`, "sys");
    }
    if (unit.side === "ally") {
      const t = State.battle.team;
      const real = Math.min(amount, t.maxHp - t.hp);
      t.hp += real;
      Log.add(`<b>${unit.def.name}</b> 回复 ${real} 点生命（${label}）→ 队伍生命 ${t.hp}/${t.maxHp}`, "good");
      if (window.UIBoard) UIBoard.floatTeam(`+${real}`, "heal");
    } else {
      const real = Math.min(amount, unit.maxHp - unit.hp);
      unit.hp += real;
      Log.add(`<b>${unit.def.name}</b> 回复 ${real} 点生命（${label}）→ HP ${unit.hp}/${unit.maxHp}`, "good");
      if (window.UIBoard) UIBoard.float(unit.uid, `+${real}`, "heal");
    }
    State.notify();
  }
};
