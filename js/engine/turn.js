/* =========================================================
 * 引擎 · 回合流程
 * ---------------------------------------------------------
 * 准备(prep) → 回合开始(抽牌) → 出牌(play) → 回合结束：
 *   弃手牌 → 我方触腕结算 → 我方buff衰减 → 敌方行动 → 胜负 → 敌方buff衰减 → 下一回合
 * 注意：衰减时机/触腕时机/怪物AI均为框架假设，见 MECHANICS.md 待确认清单
 * ========================================================= */
"use strict";

const Turn = {

  DRAW_COUNT: 5,   // 每回合抽牌数（用户实测：5张）

  startBattle() {
    const b = State.battle || State.newBattle();
    if (!b.allies.length) { alert("请先在左侧面板添加唤醒体"); return; }
    if (!b.enemies.length) { alert("请先在左侧面板添加怪物"); return; }
    b.phase = "starting";
    Log.add("========== 战斗开始 ==========", "sys");
    /* 尘封旧忆「每钥令每探索 1 次」跨战斗持久（T12）：战斗镜像从探索级拷入；
     * 清空点在探索边界——主页开始战斗按钮/State.reset（每场=新探索）、resetMapRun（重开一把） */
    b.usedYogens = (State.usedYogensExplore || []).slice();
    /* 触腕（T7，深海界域队伍公共资源）：触腕统御开战1条，至纯深海翻倍 */
    if (typeof Tentacle !== "undefined") Tentacle.initBattle();
    /* 命轮开战效果（T8）：冬夜追忆易伤/神王的颂歌狂气 */
    if (typeof Wheels !== "undefined") Wheels.onBattleStart();
    /* 界域系统（血肉熔炉继承/超维空间重置） */
    if (typeof RealmSys !== "undefined") RealmSys.onBattleStart();
    for (const a of b.allies) {
      /* 疯狂预兆（通用占位效果：战斗开始获5×等级狂气，逐角色词条待录入） */
      if (a.omenLv > 0) {
        a.guku = Math.min(a.gukuMax, a.guku + 5 * a.omenLv);
        Log.add(`${a.def.name} 疯狂预兆 Lv${a.omenLv}：战斗开始获 ${5 * a.omenLv} 狂气（占位效果）`, "sys");
      }
      /* 密契「机械降神」6件套：每场战斗首回合获1点额外算力（官方文本，已实现） */
      if ((State.pactSetCounts(a)["pact_deus_ex"] || 0) >= 6) {
        b.pactEnergyBonus = 1;
        Log.add(`${a.def.name} 密契「机械降神」6件套：首回合算力+1`, "sys");
      }
    }
    Cards.buildPiles();
    this.startTurn();
  },

  startTurn() {
    const b = State.battle;
    b.turn += 1;
    b.phase = "play";
    b.energy = State.ENERGY_PER_TURN + (b.turn === 1 ? (b.pactEnergyBonus || 0) : 0);
    b.yogenCastsThisTurn = 0;   // 钥令每回合释放次数重置（第1次携带/第2次尘封旧忆）
    b.firstCardPlayed = false;  // 魔女宽檐帽首卡标记重置（T8）
    b.strikesPlayed = {};       // 长刃·陨 discPerStrike 打击计数重置（T32 实测批）
    if (typeof Tentacle !== "undefined") Tentacle.onTurnStart();   // 触腕姿态每回合开始重置为潮涌
    if (typeof RealmSys !== "undefined") RealmSys.onTurnStart();   // 血肉融合/熔炉积攒 + 超维精通（T36 界域系统）
    if (window.Yogens) Yogens.tickDelayed();   // 延迟护盾等（下回合开始时结算）
    Log.add(`—— 第 ${b.turn} 回合：我方行动（算力 ${b.energy}） ——`, "turn");
    /* 超维回合：超维空间所有卡置入手牌，代替抽牌（维度跃迁；至纯免疫 -25%） */
    if (typeof RealmSys !== "undefined" && RealmSys.hyperDrawReplacement()) {
      Log.add(`🌀（超维回合效果已替代本回合抽牌）`);
    } else {
      Cards.draw(this.DRAW_COUNT);
    }
    this.snapshotTurn();   // 记录回合开始状态与手牌（供回溯）
    State.notify();
  },

  /* 序列化当前战斗状态（def 不序列化，恢复时按 id 重挂）——回合快照/回溯/AI 预览（T30）共用 */
  serializeState() {
    const b = State.battle;
    const ser = (u) => { const copy = JSON.parse(JSON.stringify(u, (k, v) => k === "def" ? undefined : v)); copy.defId = u.def.id; return copy; };
    return JSON.parse(JSON.stringify({
      turn: b.turn, phase: b.phase, energy: b.energy, silver: b.silver,
      pactEnergyBonus: b.pactEnergyBonus || 0,
      yogen: {
        casts: b.yogenCastsThisTurn || 0, awaken: b.silverAwakenCount || 0,
        used: (b.usedYogens || []).slice(), castHistory: (b.yogenCastHistory || []).slice(),
        starBless: b.starBless || 0, poem: (b.poemUsed || []).slice(),
        delayed: JSON.parse(JSON.stringify(b.delayed || []))
      },
      team: b.team, teamStats: b.teamStats, aiIndex: b.aiIndex,
      playedCount: b.playedCount || 0,   // T34 条件边：本战斗我方累计打牌数（「出牌>=N」条件用）
      firstCardPlayed: b.firstCardPlayed === true,
      fleshFusion: b.fleshFusion || 0,
      devourFirst: b.devourFirst === true,
      annihilUsed: b.annihilUsed === true,
      hyperPending: b.hyperPending === true,
      hyperTurnActive: b.hyperTurnActive === true,
      hyperCards: JSON.parse(JSON.stringify(b.hyperCards || [])),
      fleshFusion: b.fleshFusion || 0,
      devourFirst: b.devourFirst === true,
      annihilUsed: b.annihilUsed === true,
      hyperPending: b.hyperPending === true,
      hyperTurnActive: b.hyperTurnActive === true,
      hyperCards: JSON.parse(JSON.stringify(b.hyperCards || [])),
      tentacle: b.tentacle ? JSON.parse(JSON.stringify(b.tentacle)) : null,
      piles: b.piles,
      allies: b.allies.map(ser), enemies: b.enemies.map(ser)
    }));
  },

  /* 从序列化状态恢复（不写日志、不动 history）——rollbackTo/Executor.preview 共用 */
  restoreState(s) {
    const b = State.battle;
    b.turn = s.turn; b.phase = s.phase; b.energy = s.energy; b.silver = s.silver;
    b.pactEnergyBonus = s.pactEnergyBonus;
    if (s.yogen) {
      b.yogenCastsThisTurn = s.yogen.casts;
      b.silverAwakenCount = s.yogen.awaken;
      b.usedYogens = s.yogen.used.slice();
      b.yogenCastHistory = s.yogen.castHistory.slice();
      b.starBless = s.yogen.starBless;
      b.poemUsed = s.yogen.poem.slice();
      b.delayed = JSON.parse(JSON.stringify(s.yogen.delayed));
    }
    b.team = JSON.parse(JSON.stringify(s.team));
    b.teamStats = JSON.parse(JSON.stringify(s.teamStats));
    b.aiIndex = JSON.parse(JSON.stringify(s.aiIndex));
    b.playedCount = s.playedCount || 0;   // T34：打牌计数随快照还原（预览/回溯不虚增）
    b.firstCardPlayed = s.firstCardPlayed === true;   // 首卡标记随快照还原（T8）
    b.fleshFusion = s.fleshFusion || 0;
    b.devourFirst = s.devourFirst === true;
    b.annihilUsed = s.annihilUsed === true;
    b.hyperPending = s.hyperPending === true;
    b.hyperTurnActive = s.hyperTurnActive === true;
    b.hyperCards = s.hyperCards ? JSON.parse(JSON.stringify(s.hyperCards)) : [];
    if (s.tentacle) b.tentacle = JSON.parse(JSON.stringify(s.tentacle));   // 旧存档无此字段时保留现值
    b.piles = JSON.parse(JSON.stringify(s.piles));
    b.allies = s.allies.map(a => { const u = JSON.parse(JSON.stringify(a)); u.def = State.getChar(a.defId); return u; });
    b.enemies = s.enemies.map(e => { const u = JSON.parse(JSON.stringify(e)); u.def = State.getEnemy(e.defId); return u; });
    if (window.TargetMode) { TargetMode.active = false; TargetMode.cardUid = null; }
  },

  /* 回合开始快照（含手牌；def 不序列化，恢复时按 id 重挂） */
  snapshotTurn() {
    const b = State.battle;
    if (!b.history) b.history = [];
    b.history.push(this.serializeState());
    if (b.history.length > 30) b.history.shift();
  },

  /* 回溯到第 n 回合开始 */
  rollbackTo(n) {
    const b = State.battle;
    if (!b || !b.history) return;
    const idx = b.history.findIndex(h => h.turn === n);
    if (idx < 0) { alert(`没有第 ${n} 回合的记录`); return; }
    const s = b.history[idx];
    this.restoreState(s);
    b.history = b.history.slice(0, idx + 1);   // 该回合之后的记录作废
    Log.add(`⏪ 回溯到第 ${n} 回合开始（状态与手牌已还原）`, "sys");
    State.notify();
  },

  /* 点击「回合结束」 */
  endTurn() {
    const b = State.battle;
    if (!b || b.phase !== "play") return;
    b.phase = "enemy";

    /* 命轮回合末钩子（T8 四期）：极夜与破晓银钥/阿库特之春/慈悲的哺育/永不停歇的演奏 */
    if (typeof Wheels !== "undefined") Wheels.onTurnEnd();
    /* 超维回合结束（维度跃迁：-25% 效果仅超维回合内） */
    if (typeof RealmSys !== "undefined") RealmSys.onTurnEnd();

    /* 1. 弃掉手牌（retain 的保留在手） */
    this.discardHand();
    /* 命轮减费清零（T8 二期，巨人之刃：disc 仅本回合有效） */
    for (const c of b.piles.hand) delete c.disc;

    /* 2. 触腕结算（触腕统御：回合结束自动攻击前排敌人；姿态倍率/集结层见 tentacle.js） */
    if (typeof Tentacle !== "undefined") Tentacle.resolveTurnEnd();

    /* 3. 我方 buff 衰减与回合结束触发 */
    for (const a of b.allies) Buffs.tickTurnEnd(a);

    /* 4. 护盾移除（gamekee新手指南：护盾在回合结束时自动移除） */
    for (const u of [...b.allies, ...b.enemies]) {
      if (u.shield > 0) { Log.add(`${u.def.name} 的护盾 ${u.shield} 点随回合结束消失`, "sys"); u.shield = 0; }
    }

    /* 4. 胜负判定 */
    if (this.checkEnd()) return;

    /* 5. 敌方行动 */
    this._enemyPhase();

    /* 6. 胜负判定（反击后） */
    if (this.checkEnd()) return;

    /* 7. 敌方 buff 衰减 */
    for (const e of b.enemies) if (e.hp > 0) Buffs.tickTurnEnd(e);

    /* 8. 下一回合 */
    this.startTurn();
  },

  _discardOne(uid) {
    const c = Cards._move(uid, "discard");
    if (c) Log.add(`弃置 <b>${Cards.def(c).name}</b>`, "sys");
  },
  /* 回合结束弃手牌：def.retain 的卡保留在手（词条 2026-09-22） */
  discardHand() {
    const b = State.battle;
    const keep = [];
    for (const inst of [...b.piles.hand]) {
      const def = Cards.def(inst);
      if (def.retain) { keep.push(inst); Log.add(`${def.name}（保留）留在了手中`, "sys"); }
      else this._discardOne(inst.uid);
    }
    b.piles.hand = keep;
  },

  /* 触腕：已由 Tentacle.resolveTurnEnd() 接管（js/engine/tentacle.js，T7 实装） */

  _enemyPhase() {
    const b = State.battle;
    Log.add(`—— 敌方行动 ——`, "turn");
    for (const e of b.enemies) {
      if (e.hp <= 0) continue;
      const acts = e.def.actions || [];
      if (!acts.length) continue;
      /* loopStart：仅一次意图排在循环段前——首轮线性走完，之后只在循环段内回绕 */
      const loopStart = e.loopStart || 0;
      let idx = b.aiIndex[e.uid] || 0;
      if (idx >= acts.length) idx = loopStart + ((idx - loopStart) % Math.max(1, acts.length - loopStart));
      let act = acts[idx];
      /* 等价意图（either 组）：循环中同一位置随机其一 */
      if (act && Array.isArray(act.either) && act.either.length) {
        act = act.either[Math.floor(Math.random() * act.either.length)];
      }
      /* T34 条件边：执行后决定下一步（条件跳转 > 等待保持 > 线性推进） */
      b.aiIndex[e.uid] = this._nextEnemyIdx(e, idx, acts);
      this._enemyAct(e, act);
    }
  },

  /* T34 意图转移决策（条件边/节点图）：
   * ① act.cond 成立且 goto 有效（1-based 意图行号，0/缺省=无目标）→ 跳转
   * ② act.cond 成立但无/无效 goto → 线性推进（等待被命中解除）
   * ③ 条件未中（或不可解析=false，回落固定循环）且 act.wait → 保持当前意图
   * ④ 其余 → 线性推进（下轮 pick 时回绕 loopStart） */
  _nextEnemyIdx(e, idx, acts) {
    const g = acts[idx] || {};
    if (g.cond) {
      if (this._evalCond(e, g.cond)) {
        const t = Number.isInteger(g.goto) ? g.goto : parseInt(g.goto, 10);
        if (Number.isInteger(t) && t >= 1 && t <= acts.length && t - 1 !== idx) {
          Log.add(`⇒ ${e.def.name} 条件「${g.cond}」成立，意图切换`, "sys");
          return t - 1;
        }
        return idx + 1;
      }
      if (g.wait) return idx;
    } else if (g.wait) {
      return idx;   // 纯等待：无条件时永不前进（仅手写数据用；采集端等待必带条件）
    }
    return idx + 1;
  },

  /* T34 条件表达式求值：<左值><op><数字>[%]，op ∈ >= <= > < = ==
   * 左值：出牌=本战斗我方累计打牌数｜回合=当前回合数｜hp/生命=自身生命（%后缀=百分比向下取整）｜其他=自身状态层数（defId 或 Buffs.DEFS 名）
   * 全角运算符容错（＝＞＜）；不可解析 → false（回落固定循环） */
  _evalCond(u, expr) {
    let s = String(expr || "").trim();
    s = s.split("＝").join("=").split("＞").join(">").split("＜").join("<");
    const OPS = [">=", "<=", "==", ">", "<", "="];
    let op = null, oi = -1;
    for (const o of OPS) {
      const i = s.indexOf(o);
      if (i > 0 && (oi < 0 || i < oi)) { op = o; oi = i; }
    }
    if (!op) return false;
    const lhs = s.slice(0, oi).trim();
    let rhsStr = s.slice(oi + op.length).trim();
    const pct = rhsStr.endsWith("%");
    if (pct) rhsStr = rhsStr.slice(0, -1).trim();
    const rhs = parseInt(rhsStr, 10);
    if (!Number.isFinite(rhs) || String(rhs) !== rhsStr) return false;
    let cur = null;
    const lLow = lhs.toLowerCase();
    if (lhs.startsWith("出牌")) {
      cur = (State.battle && State.battle.playedCount) || 0;
    } else if (lhs.startsWith("回合")) {
      cur = (State.battle && State.battle.turn) || 1;
    } else if (lLow === "hp" || lLow.startsWith("hp") || lhs.startsWith("生命")) {
      cur = pct ? Math.floor((u.hp || 0) / Math.max(1, u.maxHp || 1) * 100) : (u.hp || 0);
    } else {
      const bf = (u.buffs || []).find(x => {
        if (x.defId === lhs) return true;
        const d = (typeof Buffs !== "undefined" && Buffs.DEFS && Buffs.DEFS[x.defId]) || null;
        return !!(d && d.name === lhs);
      });
      if (!bf) return false;
      cur = bf.stacks || 0;
    }
    if (op === ">=") return cur >= rhs;
    if (op === "<=") return cur <= rhs;
    if (op === ">") return cur > rhs;
    if (op === "<") return cur < rhs;
    return cur === rhs;   // = / ==
  },

  /* 按 battle.difficulty 取难度数值：value/per 可为数字或 {normal,hard,nightmare,insane} 对象；
   * 对象缺档时回落 普通值×DBF.enemyDiff 系数（DBF.enemyDiff 见 enemies.js 顶部） */
  _diffVal(v, kind) {
    if (v == null || typeof v !== "object") return v;
    const diff = (State.battle && State.battle.difficulty) || "normal";
    if (v[diff] != null) return v[diff];
    const mult = (window.DBF.enemyDiff && window.DBF.enemyDiff[diff]) ? window.DBF.enemyDiff[diff][kind] : null;
    return (v.normal != null && mult) ? Math.round(v.normal * mult) : v.normal;
  },

  _enemyAct(enemy, act) {
    const b = State.battle;
    Log.add(`<b>${enemy.def.name}</b> 使用「${act.name}」`, "turn");
    if (act.type === "attack") {
      const times = act.times || 1;
      const val = this._diffVal(act.value, "dmg");
      for (let i = 0; i < times; i++) {
        /* 我方共享生命：默认攻击队列最上方的唤醒体（索敌从上到下） */
        const tgt = b.allies[0];
        if (!tgt) break;
        const eff = val != null
          ? { value: val }
          : { scaleAttack: act.scaleSelfAttack || 1 };
        Damage.deal({ source: enemy, target: tgt, card: null, eff, label: act.name });
      }
      /* attack.debuff：攻击附带 debuff（如 毒牙：30伤害+1回合虚弱），每次行动附加1次 */
      if (act.debuff) {
        const t = b.allies[0];
        if (t) Buffs.add(t, act.debuff.buffId, act.debuff.stacks || 1, act.debuff.duration, `${enemy.def.name}·${act.name}`);
      }
      /* selfDestruct：自爆类行动，造成伤害后自身死亡（如 腐尸/深海分殖体） */
      if (act.selfDestruct && enemy.hp > 0) {
        enemy.hp = 0;
        Log.add(`<b>${enemy.def.name}</b> 自爆消散`, "turn");
      }
    } else if (act.type === "buff") {
      const t = act.target === "enemy" ? b.allies[0] : enemy;
      /* act.per：点数型 debuff 的每层点数（如 诅咒「施加9点中毒」按 per=9 建模），支持难度对象 */
      if (t) Buffs.add(t, act.buffId, act.stacks || 1, act.duration, `${enemy.def.name}·${act.name}`, this._diffVal(act.per, "dmg"));
    } else if (act.type === "heal") {
      Damage.heal(enemy, this._diffVal(act.value, "dmg"), act.name);
    }
    /* type "special"：特殊意图（认知汲取等），仅展示文字，效果未建模 */
  },

  /* 胜负判定。返回 true 表示战斗已结束 */
  checkEnd() {
    const b = State.battle;
    if (!b || b.phase === "over") return false;
    /* 多管血推进（转阶段）：当前管打空且有下一管 → 血量重置、意图切到新段，不算死亡 */
    for (const e of b.enemies) {
      if (e.hp > 0 || !e.def.phases || !e.def.phases.length) continue;
      const pi = e.phaseIdx || 0;
      if (pi < e.def.phases.length) {
        const nxt = e.def.phases[pi];
        e.phaseIdx = pi + 1;
        e.hp = e.maxHp = Math.round(nxt.hp);
        b.aiIndex[e.uid] = nxt.start || 0;
        /* T34 补：转阶段自动挂状态（石之眼案例：1阶段死亡→立刻获得1层免疫伤害） */
        for (const bf of (nxt.buffs || [])) {
          const inst = (typeof Buffs !== "undefined") && Buffs.add(e, bf.buffId, bf.stacks || 1, bf.duration, "阶段转换");
          if (!inst) Log.add(`<span class="warn-text">⚠ 转阶段状态「${bf.buffId}」未定义，未挂载</span>`, "sys");
        }
        Log.add(`<b style="color:var(--gold)">⚡ ${e.def.name} 转入第 ${pi + 2} 阶段</b>（血量重置 ${e.maxHp}，意图循环切换）`, "turn");
      }
    }
    if (!b.enemies.some(e => e.hp > 0)) {
      b.phase = "over"; b.result = "win";
      Log.add("========== 🎉 所有敌人被消灭，战斗胜利 ==========", "sys");
      /* 猩红熔炉：战斗结束积攒 5%maxHp+手牌胚胎×5%，跨战斗 carry（血肉·猩红献祭） */
      if (typeof RealmSys !== "undefined") RealmSys.onBattleWin();
      State.notify();
      return true;
    }
    if (b.team.hp <= 0) {
      b.phase = "over"; b.result = "lose";
      Log.add("========== ☠ 队伍生命耗尽，战斗失败 ==========", "sys");
      State.notify();
      return true;
    }
    return false;
  }
};
