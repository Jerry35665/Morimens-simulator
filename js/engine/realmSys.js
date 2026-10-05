/* =========================================================
 * 引擎 · 界域天赋系统（血肉·猩红献祭 / 超维·维度跃迁）
 * ---------------------------------------------------------
 * 2026-10-02 按 2.6.1 界域天赋截图实装。数据全文见 data/realms.js。
 *
 * 血肉·猩红献祭：
 *   胚胎融合：回合开始 +30（生命越低效果越高，至多 +100%→+60）；≥100 置「胚胎」入手牌并 −100
 *   猩红熔炉：回合开始积攒 3%maxHp（至纯×2）；战斗结束 +5%maxHp + 手牌每胚胎 5%；上限 25%maxHp；可回复生命
 *   胚胎吞噬：血肉唤醒体狂气爆发时消耗手牌 1 张胚胎；队伍每回合首次触发：4%maxHp 盾 + 2%maxHp 临时力量（生命越低至多 ×2）
 *   血肉精通：吞噬奖励额外 +0.01%maxHp 盾 / +0.005%maxHp 力 × 界域精通（至纯精通×2）
 *   至纯血肉：全血肉队 → 血肉精通最终值翻倍、熔炉积攒翻倍
 *
 * 超维·维度跃迁：
 *   维度穿梭：每回合首次打出指令卡后，其临时原始复制置入超维空间（超维回合内无法发动）
 *   超维回合：进入后超维空间所有卡置入手牌代替抽牌；该回合 伤害/护盾/生命回复等 −25%（至纯免疫）
 *   湮灭：每回合 1 次，移除超维空间最左侧卡牌，置 1 张「灵感」入手牌
 *   超维精通：队伍每 1 点界域精通，回合开始 0.125% 概率得 1 张灵感（>100% 多张）
 *   至纯超维：全超维队 → 精通效果翻倍、超维回合不再 −25%
 *
 * 未建模/简化（见 DATA-TODO）：超维回合的 银钥/狂气/力量变化/中毒/反击/出血 −25% 仅覆盖 伤害/护盾/回复 主路径；
 *   胚胎吞噬消耗「手牌中的胚胎」按每爆发 1 张；血肉精通的界域精通取 teamStats 求和值
 * ========================================================= */
"use strict";

const RealmSys = {
  hasFlesh() { const b = State.battle; return !!b && b.allies.some(a => State.realmGroup(a.def.realm) === "血肉"); },
  hasHyper() { const b = State.battle; return !!b && b.allies.some(a => State.realmGroup(a.def.realm) === "超维"); },
  isPureFlesh() { const b = State.battle; return !!b && b.allies.length > 0 && b.allies.every(a => State.realmGroup(a.def.realm) === "血肉"); },
  isPureHyper() { const b = State.battle; return !!b && b.allies.length > 0 && b.allies.every(a => State.realmGroup(a.def.realm) === "超维"); },
  /* 超维回合效果系数：−25%（至纯超维免疫）；覆盖 伤害/护盾/生命回复（银钥/狂气/力量/中毒/反击/出血待全） */
  hyperDamageMul() {
    const b = State.battle;
    if (!b || !b.hyperTurnActive) return 1;
    return this.isPureHyper() ? 1 : 0.75;
  },
  mastery() { return State.teamStats().realmMastery || 0; },
  /* 生命越低效果越高（至多提高 100% → 倍率 1~2） */
  lowHpBoost() {
    const b = State.battle;
    if (!b || !b.team.maxHp) return 1;
    return 1 + Math.max(0, Math.min(1, 1 - b.team.hp / b.team.maxHp));
  },

  /* ---------- 战斗开始：熔炉继承跨战斗 carry ---------- */
  onBattleStart() {
    const b = State.battle;
    if (!b) return;
    b.fleshFusion = 0;
    b.hyperCards = [];
    b.hyperPending = false;
    b.hyperTurnActive = false;
    b.devourFirst = false;
    b.annihilUsed = false;
    b.team.resources.furnace = State.furnaceCarry || 0;   // 熔炉跨战斗保留（猩红熔炉可用于回复生命）
    State.furnaceCarry = 0;
  },

  maxFurnace() { const b = State.battle; return Math.ceil(b.team.maxHp * 0.25); },

  /* ---------- 回合开始（turn.js startTurn 调用，在抽牌前）---------- */
  onTurnStart() {
    const b = State.battle;
    if (!b) return;
    b.devourFirst = false;
    b.annihilUsed = false;
    if (this.hasFlesh()) {
      /* 胚胎融合：+30，生命越低至多 ×2 */
      const gain = Math.round(30 * this.lowHpBoost());
      b.fleshFusion += gain;
      Log.add(`🧬 胚胎融合 +${gain}（当前 ${b.fleshFusion}/100）`, "good");
      while (b.fleshFusion >= 100) {
        b.fleshFusion -= 100;
        const inst = Cards.inst("shared_embryo", false);
        b.piles.hand.push(inst);
        Log.add(`🧬 胚胎融合达 100：「胚胎」置入手牌（溢出保留）`, "good");
      }
      /* 猩红熔炉：回合开始积攒 3%maxHp（至纯×2），上限 25%maxHp */
      const pure = this.isPureFlesh();
      const fv = Math.ceil(b.team.maxHp * 0.03 * (pure ? 2 : 1));
      b.team.resources.furnace = Math.min(this.maxFurnace(), (b.team.resources.furnace || 0) + fv);
      Log.add(`🔥 猩红熔炉积攒 +${fv}（当前 ${b.team.resources.furnace}/${this.maxFurnace()}${pure ? "，至纯翻倍" : ""}）`, "good");
    }
    if (this.hasHyper()) {
      /* 超维精通：0.125% × 界域精通 概率得灵感（至纯×2；>100% 多张） */
      const pure = this.isPureHyper();
      const total = Math.floor(this.mastery() * 0.125 * (pure ? 2 : 1));
      let n = Math.floor(total / 100);                       // 概率超 100% 保底多张
      if (Math.random() * 100 < total - n * 100) n++;
      for (let i = 0; i < n; i++) b.piles.hand.push(Cards.inst("shared_inspire", false));
      if (n > 0) Log.add(`🌀 超维精通：获得 ${n} 张「灵感」（界域精通 ${this.mastery()}${pure ? "，至纯翻倍" : ""}）`, "good");
    }
  },

  /* ---------- 超维回合消费（startTurn 抽牌时调用；返回 true=已代替抽牌）---------- */
  hyperDrawReplacement() {
    const b = State.battle;
    if (!b || !b.hyperPending) return false;
    b.hyperPending = false;
    b.hyperTurnActive = true;
    const cards = b.hyperCards.splice(0);
    for (const c of cards) b.piles.hand.push(c);
    Log.add(`🌀 <b>超维回合</b>：超维空间 ${cards.length} 张卡置入手牌，代替抽牌（本回合效果 −25%${this.isPureHyper() ? "，至纯免疫" : ""}）`, "turn");
    return true;
  },

  /* ---------- 维度穿梭：每回合首次打出指令卡后（cards.play 调用）---------- */
  onFirstCardPlayed(card) {
    const b = State.battle;
    if (!b || b.hyperTurnActive || b.hyperPending) return;   // 超维回合无法发动
    if (!this.hasHyper()) return;
    if (!card || card.type === "狂气爆发") return;
    b.hyperCards.push(Cards.inst(card.defId || card.id, false));
    Log.add(`🌀 维度穿梭：「${card.name}」的临时原始复制置入超维空间（共 ${b.hyperCards.length}）`, "good");
  },

  /* ---------- 湮灭（UI 按钮调用；每回合 1 次）---------- */
  annihilation() {
    const b = State.battle;
    if (!b || !this.hasHyper()) { alert("队伍中没有超维唤醒体"); return; }
    if (b.annihilUsed) { alert("湮灭每回合只能使用 1 次"); return; }
    if (!b.hyperCards.length) { alert("超维空间为空"); return; }
    b.annihilUsed = true;
    const [left] = b.hyperCards.splice(0, 1);
    b.piles.hand.push(Cards.inst("shared_inspire", false));
    Log.add(`🌀 湮灭：移除超维空间的「${Cards.def(left).name}」，置 1 张「灵感」入手牌`, "good");
    /* 关卡造物湮灭钩子（T53）：超弦怀表护盾/时间之虫狂气，3 回合冷却 */
    if (typeof LevelRelics !== "undefined") LevelRelics.onAnnihilate();
    State.notify();
  },

  /* ---------- 胚胎吞噬（cards.releaseBurst 调用；血肉唤醒体爆发时）---------- */
  onBurst(burstAlly) {
    const b = State.battle;
    if (!b || !this.hasFlesh()) return;
    if (State.realmGroup(burstAlly.def.realm) !== "血肉") return;
    /* 尝试消耗手牌 1 张胚胎 */
    const idx = b.piles.hand.findIndex(c => c.defId === "shared_embryo");
    if (idx < 0) { Log.add(`<span class="dim">狂戮触发失败：手牌中没有「胚胎」</span>`, "sys"); return; }
    b.piles.hand.splice(idx, 1);
    Log.add(`🧬 胚胎吞噬：消耗 1 张「胚胎」`, "good");
    /* 队伍每回合首次触发：4%maxHp 盾 + 2%maxHp 临时力量（生命越低至多 ×2）+ 血肉精通额外（至纯精通×2） */
    if (!b.devourFirst) {
      b.devourFirst = true;
      const pure = this.isPureFlesh();
      const masteryMul = pure ? 2 : 1;
      const boost = this.lowHpBoost();
      const sh = Math.ceil(b.team.maxHp * (0.04 + 0.0001 * this.mastery() * masteryMul) * boost);
      const pw = Math.ceil(b.team.maxHp * (0.02 + 0.00005 * this.mastery() * masteryMul) * boost);
      for (const a of b.allies) {
        if (typeof Damage !== "undefined") Damage.addShield(a, sh); else a.shield += sh;
      }
      /* T52：力量 shared 挂队伍一份——旧代码循环内 add，N 人队叠 N 层=4 倍力量，挪出循环单次 */
      if (b.allies[0]) Buffs.add(b.allies[0], "buff_strength", 1, null, "胚胎吞噬", pw);
      Log.add(`🧬 胚胎吞噬：全体护盾 +${sh}、临时力量 +${pw}（生命越低效果越高${pure ? "，至纯精通翻倍" : ""}）`, "good");
    }
  },

  /* ---------- 超维回合结束（turn.js endTurn 调用：-25% 效果仅超维回合内）---------- */
  onTurnEnd() {
    const b = State.battle;
    if (b && b.hyperTurnActive) {
      b.hyperTurnActive = false;
      Log.add(`🌀 超维回合结束（效果恢复 100%）`, "turn");
    }
  },

  /* ---------- 熔炉回复生命（UI 按钮调用：消耗全部熔炉回复等量生命）---------- */
  furnaceHeal() {
    const b = State.battle;
    if (!b) return;
    const v = b.team.resources.furnace || 0;
    if (v <= 0) { alert("猩红熔炉为空"); return; }
    b.team.resources.furnace = 0;
    Damage.heal(b.allies[0] || { side: "ally" }, v, "猩红熔炉");
    Log.add(`🔥 消耗猩红熔炉 ${v} 点回复生命`, "good");
  },

  /* ---------- 战斗结束（turn.checkEnd 胜利时调用）----------
   * 战斗结束积攒 5%maxHp + 手牌每剩 1 胚胎 5%；至纯积攒翻倍；熔炉跨战斗 carry */
  onBattleWin() {
    const b = State.battle;
    if (!b || !this.hasFlesh()) { State.furnaceCarry = b ? (b.team.resources.furnace || 0) : 0; return; }
    const pure = this.isPureFlesh();
    const embryoInHand = b.piles.hand.filter(c => c.defId === "shared_embryo").length;
    const gain = Math.ceil(b.team.maxHp * 0.05 * (1 + embryoInHand) * (pure ? 2 : 1));
    b.team.resources.furnace = Math.min(this.maxFurnace(), (b.team.resources.furnace || 0) + gain);
    State.furnaceCarry = b.team.resources.furnace || 0;
    Log.add(`🔥 战斗结束：猩红熔炉积攒 +${gain}${embryoInHand ? `（手牌胚胎×${embryoInHand}）` : ""}${pure ? "，至纯翻倍" : ""}，携带至下一场（${State.furnaceCarry}）`, "good");
  }
};
