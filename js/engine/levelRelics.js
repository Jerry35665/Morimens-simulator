/* =========================================================
 * 忘却前夜战斗模拟器 · 关卡造物 + 刻印 引擎框架（T50，2026-10-05）
 * ---------------------------------------------------------
 * 【关卡造物 LevelRelics】关卡/禁区探索内获得的造物（DBF.levelRelics，224 条），
 *   作用域=探索层级（State.levelRelicDeck，随存档持久；探索边界清空——
 *   主页开战/State.reset/resetMapRun，与 usedYogensExplore 同语义 T12）。
 *   数据 source=游戏内图鉴+悬浮窗截图 269 张（造物与刻印/ 2026-10-05）；
 *   mods=人工 curated 结算映射，未建模条目 notes 注明（AI 顾问清单强制携带）。
 * 【刻印 Sigils】附加在指令卡上的词缀（DBF.sigils，35 条）：
 *   inst.sigil = 刻印 id，打出该卡时触发 mods.onPlay（一期子集）。
 * 已建模结算子集（MODELED）：
 *   造物：team 四键 / battleStart(strength/shield/gukuAll/draw/energy/silver/tentacles) /
 *         turnStart(draw/energy/shield/tempStrength + condLowHpPct + 奇偶分流) /
 *         turnEnd(heal/gukuPerHandCard) / maxEnergy / onBurst(silver/tempStrength) /
 *         onSilverAwaken(draw/energy/shield/strength/silver) / onDeathResist(silver)
 *   刻印：draw/energy/shield/strength/tempStrength/gukuSelf/gukuOthers/
 *         weakAll/vulnAll/poisonAll/drainTempStrAll
 * 口径注释：
 *   - 「临时力量」引擎无独立 buff → buff_strength 挂 duration=1（回合末衰减）近似，notes 已注
 *   - 守护之手/无上荣宠的低血条件按「每名唤醒体独立判定生命%」实现（主语承前=唤醒体）
 *   - 失衡的天平手牌归属经 Cards.def(inst).owner，shared 卡回落 allies[0]（与 play 同语义）
 *   - 力量点数直接进 buff_strength per（与 T37①「点数即层数、每层1点」一致）
 * ========================================================= */

window.LevelRelics = {
  UNMODELED_VERSION: "2026-10-05",

  /* ---------- 携带管理（探索级） ---------- */
  deck() { return State.levelRelicDeck || (State.levelRelicDeck = []); },
  defs() {
    return this.deck().map(id => (DBF.levelRelics || []).find(r => r.id === id)).filter(Boolean);
  },
  has(id) { return this.deck().includes(id); },
  add(id) {
    const d = (DBF.levelRelics || []).find(r => r.id === id);
    if (!d) { Log.add(`未知关卡造物: ${id}`, "sys"); return false; }
    const dk = this.deck();
    if (dk.includes(id)) return false;
    dk.push(id);
    Log.add(`🏺 获得关卡造物「${d.name}」（${d.quality}）：${d.effect}`, "good");
    State.persist();
    State.notify();
    return true;
  },
  remove(id) {
    const dk = this.deck();
    const i = dk.indexOf(id);
    if (i < 0) return false;
    dk.splice(i, 1);
    State.persist();
    State.notify();
    return true;
  },
  clear() { if (State.levelRelicDeck) State.levelRelicDeck = []; State.persist(); },

  /* ---------- 队伍静态键增量（state.js teamStats() 消费，无战斗也计入） ---------- */
  _teamSum() {
    const s = { damageBoost: 0, realmMastery: 0, blackImprint: 0, deathResist: 0 };
    for (const d of this.defs()) {
      const t = d.mods && d.mods.team;
      if (!t) continue;
      for (const k of Object.keys(s)) s[k] += t[k] || 0;
    }
    return s;
  },
  maxEnergyBonus() {
    return this.defs().reduce((t, d) => t + ((d.mods && d.mods.maxEnergy) || 0), 0);
  },

  /* ---------- 战斗内钩子（turn.js / cards.js / yogen.js 挂点调用） ---------- */
  onBattleStart() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.battleStart;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.strength) for (const a of b.allies) {
        Buffs.add(a, "buff_strength", 1, null, tag, m.strength);
        Log.add(`🏺 ${tag}：${a.def.name} 战斗开始获得 ${m.strength} 点力量`, "good");
      }
      if (m.shield) for (const a of b.allies) {
        Damage.addShield(a, m.shield, tag);
        Log.add(`🏺 ${tag}：${a.def.name} 战斗开始获得 ${m.shield} 点护盾`, "good");
      }
      if (m.gukuAll) for (const a of b.allies) {
        a.guku = Math.min(a.gukuMax || 100, a.guku + m.gukuAll);
      }
      if (m.gukuAll) Log.add(`🏺 ${tag}：全体唤醒体狂气 +${m.gukuAll}`, "good");
      if (m.draw) { Cards.draw(m.draw); Log.add(`🏺 ${tag}：战斗开始抽 ${m.draw} 张`, "good"); }
      if (m.energy) { b.energy += m.energy; Log.add(`🏺 ${tag}：算力 +${m.energy}`, "good"); }
      if (m.silver) { b.silver += m.silver; Log.add(`🏺 ${tag}：银钥能量 +${m.silver}`, "good"); }
      if (m.tentacles && typeof Tentacle !== "undefined") {
        if (!b.tentacle && typeof Tentacle.initBattle === "function") Tentacle.initBattle();
        if (b.tentacle) {
          b.tentacle.count += m.tentacles;
          Log.add(`🏺 ${tag}：触腕 +${m.tentacles} 条（当前 ${b.tentacle.count}）`, "good");
        }
      }
    }
  },

  onTurnStart() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const mods = d.mods || {};
      const tag = `关卡造物·${d.name}`;
      /* 奇偶分流（日月轮盘：turnStart+odd / turnStart2+even） */
      for (const [key, parity] of [["turnStart", mods.turnParity], ["turnStart2", mods.turnParity2]]) {
        const m = mods[key];
        if (!m) continue;
        const turnIsOdd = b.turn % 2 === 1;
        if (parity === "odd" && !turnIsOdd) continue;
        if (parity === "even" && turnIsOdd) continue;
        if (m.draw) { Cards.draw(m.draw); Log.add(`🏺 ${tag}：回合开始抽 ${m.draw} 张`, "good"); }
        if (m.energy) { b.energy += m.energy; Log.add(`🏺 ${tag}：回合开始算力 +${m.energy}`, "good"); }
        if (m.gukuAll) for (const a of b.allies) a.guku = Math.min(a.gukuMax || 100, a.guku + m.gukuAll);
        if (m.gukuAll) Log.add(`🏺 ${tag}：回合开始全体狂气 +${m.gukuAll}`, "good");
        /* 低血条件按每名唤醒体独立判定（主语承前）；shield/tempStrength 为获得型 */
        if (m.shield || m.tempStrength) {
          for (const a of b.allies) {
            if (a.hp <= 0) continue;
            const pct = a.hp / (a.maxHp || 1);
            if (m.condLowHpPct != null && pct >= m.condLowHpPct) continue;
            if (m.shield) { Damage.addShield(a, m.shield, tag); Log.add(`🏺 ${tag}：${a.def.name} 生命 ${Math.round(pct * 100)}%<25% → 护盾 +${m.shield}`, "good"); }
            if (m.tempStrength) { Buffs.add(a, "buff_strength", 1, 1, tag, m.tempStrength); Log.add(`🏺 ${tag}：${a.def.name} 生命 ${Math.round(pct * 100)}%<25% → 临时力量 +${m.tempStrength}（1 回合）`, "good"); }
          }
        }
      }
    }
  },

  onTurnEnd() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.turnEnd;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.heal) {
        const before = b.team.hp;
        b.team.hp = Math.min(b.team.maxHp, b.team.hp + m.heal);
        Log.add(`🏺 ${tag}：回合结束回复 ${b.team.hp - before} 生命（${b.team.hp}/${b.team.maxHp}）`, "good");
      }
      if (m.gukuPerHandCard) {
        /* 手牌归属经卡定义 owner（shared 回落 allies[0]，与 play 同语义）；同名多张逐张计 */
        for (const inst of b.piles.hand) {
          const def = Cards.def(inst);
          const owner = b.allies.find(a => a.def.id === def.owner) || b.allies[0];
          if (owner && owner.hp > 0) owner.guku = Math.min(owner.gukuMax || 100, owner.guku + m.gukuPerHandCard);
        }
        Log.add(`🏺 ${tag}：回合结束前手牌 ${b.piles.hand.length} 张 → 各所属唤醒体狂气 +${m.gukuPerHandCard}/张`, "good");
      }
    }
  },

  onBurst(ally) {
    const b = State.battle;
    if (!b || !ally) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onBurst;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.silver) { b.silver += m.silver; Log.add(`🏺 ${tag}：${ally.def.name} 爆发后银钥 +${m.silver}`, "good"); }
      if (m.tempStrength) { Buffs.add(ally, "buff_strength", 1, 1, tag, m.tempStrength); Log.add(`🏺 ${tag}：${ally.def.name} 爆发后临时力量 +${m.tempStrength}（1 回合）`, "good"); }
    }
  },

  onSilverAwaken() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onSilverAwaken;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      /* 主语=使用银钥觉醒的守密人/队伍：力量类给全体（造物全局语义），其余按资源落 */
      if (m.draw) { Cards.draw(m.draw); Log.add(`🏺 ${tag}：银钥觉醒后抽 ${m.draw} 张`, "good"); }
      if (m.energy) { b.energy += m.energy; Log.add(`🏺 ${tag}：银钥觉醒后算力 +${m.energy}`, "good"); }
      if (m.silver) { b.silver += m.silver; Log.add(`🏺 ${tag}：银钥觉醒后银钥能量 +${m.silver}`, "good"); }
      if (m.strength) for (const a of b.allies) {
        Buffs.add(a, "buff_strength", 1, null, tag, m.strength);
        Log.add(`🏺 ${tag}：${a.def.name} 银钥觉醒后力量 +${m.strength}`, "good");
      }
      if (m.shield) for (const a of b.allies) { Damage.addShield(a, m.shield, tag); }
      if (m.shield) Log.add(`🏺 ${tag}：银钥觉醒后全体护盾 +${m.shield}`, "good");
    }
  },

  /* 死亡抵抗触发钩子（过往的贡物：触发后 +500 银钥）——文件加载时注册进 State.DEATH_RESIST_HOOKS */
  onDeathResist() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onDeathResist;
      if (!m || !m.silver) continue;
      b.silver += m.silver;
      Log.add(`🏺 关卡造物·${d.name}：触发死亡抵抗 → 银钥能量 +${m.silver}`, "good");
    }
  },

  /* AI 顾问未建模清单（advisor KNOWN/UNMODELED 携带；清单外禁给确定性数值结论） */
  UNMODELED: [
    "关卡造物 224 条中 187 条效果未建模（文字已录 DBF.levelRelics.notes）：反击/湮灭/超维回合/猩红熔炉/胚胎融合/吞噬/姿态激发/探索层造物上限/维度影像族（61 条整族）/银白差分机冷却/每回合计数乘区/钥令返还/治疗护盾增幅键/「额外生效」族",
    "关卡造物已建模子集仅限 LevelRelics.MODELED 列出的键；复合条件（如普特尼晨报后半句）整条按未建模处理",
    "刻印 35 条中 14 条未建模：镜像/灵感/折跃/统御/嗜血/尖刺/回声（超维空间/洗入/触腕次数/胚胎融合/反击/额外生效依赖）",
    "刻印毒素的「触发 25%/50% 中毒」立即结算未建模；「临时力量」以 buff_strength 1 回合近似",
    "星辰篇环境「时空扭曲」组（存在悖论/无底创痕/棱彩透镜/命运光锥）未实装（反击/中毒上限/凝视等依赖）",
  ],
};

/* 死亡抵抗钩子注册（State.DEATH_RESIST_HOOKS 静态表，T48） */
try { if (window.State && Array.isArray(State.DEATH_RESIST_HOOKS)) State.DEATH_RESIST_HOOKS.push(() => LevelRelics.onDeathResist()); } catch (e) { /* state 未加载时静默 */ }

/* =========================================================
 * 刻印（卡牌词缀）：inst.sigil = 刻印 id；Cards.play 尾部触发 onPlay
 * ========================================================= */
window.Sigils = {
  UNMODELED_VERSION: "2026-10-05",

  def(id) { return (DBF.sigils || []).find(s => s.id === id || s.name === id); },

  /* 给手牌/牌堆实例附加刻印（一卡一印，覆盖式；sigilId 兼容 id 或名称） */
  attach(inst, sigilId) {
    const s = this.def(sigilId);
    if (!s) { Log.add(`未知刻印: ${sigilId}`, "sys"); return false; }
    inst.sigil = s.id;
    Log.add(`📿 刻印「${s.name}」附加到「${Cards.def(inst).name}」：${s.effect}`, "good");
    State.notify();
    return true;
  },
  detach(inst) { delete inst.sigil; State.notify(); },

  /* 打出附印卡时触发（cards.js play 尾部调用） */
  onCardPlayed(inst, owner) {
    const b = State.battle;
    if (!b || !inst || !inst.sigil || !owner) return;
    const s = this.def(inst.sigil);
    if (!s) return;
    const m = s.mods || {};
    if (!Object.keys(m).length) return;   // 未建模条目静默跳过（notes 有登记）
    const tag = `刻印·${s.name}`;
    Log.add(`📿 ${tag} 触发`, "good");
    if (m.draw) { Cards.draw(m.draw); Log.add(`📿 ${tag}：抽 ${m.draw} 张`, "good"); }
    if (m.energy) { b.energy += m.energy; Log.add(`📿 ${tag}：算力 +${m.energy}`, "good"); }
    if (m.shield) { Damage.addShield(owner, m.shield, tag); Log.add(`📿 ${tag}：${owner.def.name} 护盾 +${m.shield}`, "good"); }
    if (m.strength) { Buffs.add(owner, "buff_strength", 1, null, tag, m.strength); Log.add(`📿 ${tag}：${owner.def.name} 力量 +${m.strength}`, "good"); }
    if (m.tempStrength) { Buffs.add(owner, "buff_strength", 1, 1, tag, m.tempStrength); Log.add(`📿 ${tag}：${owner.def.name} 临时力量 +${m.tempStrength}（1 回合）`, "good"); }
    if (m.gukuSelf) { owner.guku = Math.min(owner.gukuMax || 100, owner.guku + m.gukuSelf); Log.add(`📿 ${tag}：${owner.def.name} 狂气 +${m.gukuSelf}`, "good"); }
    if (m.gukuOthers) for (const a of b.allies) {
      if (a.uid === owner.uid || a.hp <= 0) continue;
      a.guku = Math.min(a.gukuMax || 100, a.guku + m.gukuOthers);
    }
    if (m.gukuOthers) Log.add(`📿 ${tag}：其他唤醒体狂气 +${m.gukuOthers}`, "good");
    if (m.weakAll && b.enemies.length) { Buffs.add(b.enemies[0], "debuff_weak", m.weakAll, null, tag); Log.add(`📿 ${tag}：虚弱所有敌人 ${m.weakAll} 回合`, "good"); }
    if (m.vulnAll && b.enemies.length) { Buffs.add(b.enemies[0], "debuff_vul", m.vulnAll, null, tag); Log.add(`📿 ${tag}：易伤所有敌人 ${m.vulnAll} 回合`, "good"); }
    if (m.poisonAll && b.enemies.length) { Buffs.add(b.enemies[0], "debuff_poison", m.poisonAll, null, tag); Log.add(`📿 ${tag}：所有敌人中毒 +${m.poisonAll} 层`, "good"); }
    if (m.drainTempStrAll) {
      let total = 0;
      for (const e of b.enemies) {
        const bi = (e.buffs || []).find(x => x.defId === "buff_strength");
        if (bi && bi.per) { const cut = Math.min(bi.per, m.drainTempStrAll); bi.per -= cut; total += cut; }
      }
      if (total) Log.add(`📿 ${tag}：敌人失去 ${total} 点临时力量`, "good");
    }
  },
};
