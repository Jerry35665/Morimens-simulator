/* =========================================================
 * 引擎 · buff / debuff 系统
 * ========================================================= */
"use strict";

const Buffs = {

  /* 添加（同名叠层）。per: 点数型buff每层覆盖值（如力量N点）。返回实例或 null
   * T32 实测批（2026-10-02 用户口径）：
   * ① def.roundLayers（易伤/虚弱/脆弱/重创/戒备）：「N 回合」= N 层，每回合结束 -1 层，0 层移除
   * ② def.shared（力量/戒备，T37③）：全队共享——**2026-10-05 用户实测修正：挂队伍级一份实例**
   *    （b.team.buffs，显示在共享血条下，不每个人重复挂；触腕/伤害结算只吃一次），
   *    collect 对我方单位合并读取=效果仍全队生效 */
  add(unit, buffId, stacks = 1, duration = null, note = "", per = null) {
    const def = State.getBuff(buffId);
    if (!def) { Log.add(`未知buff: ${buffId}`, "sys"); return null; }
    if (def.shared) {
      if (unit.side !== "ally" || !State.battle) return this._addOne(unit, def, stacks, duration, note, per);
      const team = State.battle.team;
      if (!team.buffs) team.buffs = [];
      return this._addOne(team, def, stacks, duration, note, per);
    }
    return this._addOne(unit, def, stacks, duration, note, per);
  },

  _addOne(unit, def, stacks, duration, note, per) {
    const buffId = def.id;
    let inst = unit.buffs.find(x => x.defId === buffId);
    if (!inst) {
      inst = {
        uid: State.nextUid("buff"), defId: buffId,
        stacks: 0,
        duration: duration != null ? duration : def.defaultDuration,
        per: per != null ? per : null
      };
      unit.buffs.push(inst);
    } else if (per != null) {
      inst.per = per;
    }
    inst.stacks += stacks;
    if (def.maxStacks) inst.stacks = Math.min(inst.stacks, def.maxStacks);
    if (def.roundLayers && duration != null) {
      /* 「N 回合」= N 层：层即剩余回合（用户口径 2026-10-02），不再走 duration 倒计时 */
      inst.duration = null;
    } else if (duration != null) {
      inst.duration = duration;
    }

    Log.add(
      `${(unit.def && unit.def.name) || "队伍"} 获得 <b class="${def.kind === "debuff" ? "warn-text" : ""}">${def.name}</b>×${inst.stacks}` +
      (per != null ? `（每层${per > 0 ? "+" : ""}${per}）` : "") +
      (def.shared ? "（全队共享）" : "") +
      (inst.duration != null ? `（剩 ${inst.duration} 回合）` : "") +
      (def.stack === "unknown" ? ' <span class="warn-text">⟨叠加规则未确认⟩</span>' : "") +
      (note ? ` <span class="dim">${note}</span>` : ""), "sys"
    );
    State.notify();
    return inst;
  },

  /* 减少层数 / 移除（shared 类同步全队） */
  removeStacks(unit, buffId, stacks = Infinity) {
    const def = State.getBuff(buffId);
    const units = def && def.shared
      ? (unit.side === "ally" ? State.battle.allies : State.battle.enemies)
      : [unit];
    for (const u of units) {
      const inst = u.buffs.find(x => x.defId === buffId);
      if (!inst) continue;
      inst.stacks -= stacks;
      if (inst.stacks <= 0) u.buffs = u.buffs.filter(x => x !== inst);
    }
    State.notify();
  },

  removeInstance(unit, instUid) {
    unit.buffs = unit.buffs.filter(x => x.uid !== instUid);
    State.notify();
  },

  /* 回合结束：持续时间 -1，到 0 移除。onEnd="damageFlat" 的先结算再移除；
   * onEnd="damageFlatPurge"（出血）结算等量层数纯粹伤害后整个移除 */
  tickTurnEnd(unit) {
    for (const inst of [...unit.buffs]) {
      const def = State.getBuff(inst.defId);
      if (def && def.onEnd === "damageFlat") {
        if (!unit.def) continue;   // team 容器无 def（dot 类不会是 shared，双保险）
        const per = inst.per != null ? inst.per : def.effect.dotFlat;
        const dmg = per * inst.stacks;
        Damage.applyRawDamage(unit, dmg, `${def.name}（每层${per}×${inst.stacks}层，触发时机待确认）`);
      }
      if (def && def.onEnd === "damageFlatPurge") {
        /* dot 类不会是 shared（力量/戒备 onEnd 均 null）——team 容器无 def 永不走此分支，双保险守卫 */
        if (!unit.def) continue;
        const per = inst.per != null ? inst.per : def.effect.dotFlat;
        const dmg = per * inst.stacks;
        Damage.applyRawDamage(unit, dmg, `${def.name}（${inst.stacks}层，结算后移除）`);
        unit.buffs = unit.buffs.filter(x => x !== inst);
        continue;
      }
      if (inst.duration != null) {
        inst.duration -= 1;
        if (inst.duration <= 0) {
          Log.add(`${(unit.def && unit.def.name) || "队伍"} 的 ${def.name} 效果结束`, "sys");
          unit.buffs = unit.buffs.filter(x => x !== inst);
        }
      } else if (def.roundLayers && inst.stacks > 0) {
        /* 「N 回合」= N 层：每回合 -1 层（用户口径 2026-10-02） */
        inst.stacks -= 1;
        if (inst.stacks <= 0) {
          Log.add(`${(unit.def && unit.def.name) || "队伍"} 的 ${def.name} 效果结束`, "sys");
          unit.buffs = unit.buffs.filter(x => x !== inst);
        }
      }
    }
  },

  /* 收集某作用字段的全部修正来源（buff实例）
   * 返回 [{name, per, stacks, total, stack, confirmed, from}]
   * stack:"duration"（易伤/虚弱/脆弱——层数=持续回合数，不影响数值）total 不乘层数 */
  collect(unit, field) {
    const mods = [];
    const grab = (inst) => {
      const def = State.getBuff(inst.defId);
      if (def && def.effect[field] != null) {
        const per = inst.per != null ? inst.per : def.effect[field];
        mods.push({
          name: def.name,
          per, stacks: inst.stacks,
          total: def.stack === "duration" ? per : per * inst.stacks,
          stack: def.stack, confirmed: def.confirmed,
          from: def.shared ? "buff·队伍共享" : "buff"
        });
      }
    };
    for (const inst of unit.buffs) grab(inst);
    /* 共享 buff（力量/戒备）挂队伍级一份（2026-10-05 用户实测修正）：我方单位合并读取=全队生效 */
    const b = State.battle;
    if (unit.side === "ally" && b && b.team && b.team !== unit && Array.isArray(b.team.buffs)) {
      for (const inst of b.team.buffs) grab(inst);
    }
    return mods;
  },

  /* 聚合一个修正区。返回 {factor, mods, hasUnknown}
   * 全部 "add"（含 "duration"）→ 因子 = 1 + Σ修正
   * 全部 "mul"   → 因子 = Π(1+修正)
   * 混合或含 unknown → 框架按乘算预估并标黄提示 */
  aggregate(mods) {
    if (!mods.length) return { factor: 1, mods, hasUnknown: false };
    const allAdd = mods.every(m => m.stack === "add" || m.stack === "duration");
    const allMul = mods.every(m => m.stack === "mul");
    const factor = allAdd
      ? 1 + mods.reduce((s, m) => s + m.total, 0)
      : mods.reduce((f, m) => f * (1 + m.total), 1);
    const hasUnknown = !allAdd;   // 只要不是纯加算，就提示"乘算/混合方式待实测区分"
    return { factor, mods, hasUnknown };
  }
};
