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
  UNMODELED_VERSION: "2026-10-06",

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

  /* ---------- 造物运行时状态（冷却/每回合计数）——挂 b.relicState 随快照回溯（T53） ----------
   * cool: {造物id: 剩余回合}——触发时置 N，onTurnStart 递减（3 回合冷却）
   * cnt:  {键: 次数}——每回合开始清零；键形如 `exhaust_lr054` / `diffOwn_char_doll` */
  _rs() { const b = State.battle; return b.relicState || (b.relicState = { cool: {}, cnt: {}, cntB: {} }); },
  _coolReady(id) { const c = this._rs().cool[id]; return !(c > 0); },
  _setCool(id, n) { this._rs().cool[id] = n; },
  _tickCool() { const rs = this._rs(); for (const k of Object.keys(rs.cool)) if (rs.cool[k] > 0) rs.cool[k]--; },
  /* scope:"battle"=战斗级计数（每场 N 次类，如雷娅影像「每场战斗最多10次」），默认每回合清零 */
  _cnt(key, cap, scope) {
    const rs = this._rs();
    const store = scope === "battle" ? (rs.cntB || (rs.cntB = {})) : rs.cnt;
    const cur = store[key] || 0;
    if (cap != null && cur >= cap) return false;
    store[key] = cur + 1;
    return true;
  },
  _cntOf(key, scope) {
    const rs = this._rs();
    return (scope === "battle" ? (rs.cntB || {}) : rs.cnt)[key] || 0;
  },
  _cntAdd(key, n, scope) {
    const rs = this._rs();
    const store = scope === "battle" ? (rs.cntB || (rs.cntB = {})) : rs.cnt;
    store[key] = (store[key] || 0) + n;
    return store[key];
  },
  _turnReset() { const rs = this._rs(); rs.cnt = {}; this._tickCool(); },

  /* 维度影像族：按角色名找队内唤醒体（「维度影像·朵尔」→ mods.ownerName="朵尔"） */
  _byOwner(name) {
    const b = State.battle;
    return (b && b.allies.find(a => a.def.name === name)) || null;
  },
  /* 我方=共享血条架构（T7）：单位无独立 hp 字段——存活判断统一走 b.team.hp。
   * T53 修正：T50 首批四处钩子误用 a.hp（undefined 恒不>0）静默失效——gukuPerHandCard/
   * 低血条件/gukuSelf/gukuLowest 均改为队伍生命口径 */
  _teamAlive(b) { return !!(b && b.team && b.team.hp > 0); },
  /* 首领战判定（春之祭/恶童「首领战效果翻倍」——敌方含 tier==="boss" 视为首领战） */
  _isBossFight() {
    const b = State.battle;
    return !!(b && b.enemies.some(e => e.def && e.def.tier === "boss"));
  },

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
  /* 回合开始主抽牌减量（哀嚎摇铃：回合开始时少抽 1 张——turn.js startTurn 消费） */
  startDrawPenalty() {
    return this.defs().reduce((t, d) => t + ((d.mods && d.mods.startDrawPenalty) || 0), 0);
  },

  /* ---------- 战斗内钩子（turn.js / cards.js / yogen.js 挂点调用） ---------- */
  onBattleStart() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.battleStart;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      /* 力量=共享 buff：单次挂即全队一份（b.team.buffs，2026-10-05 用户实测口径），勿循环每人 */
      if (m.strength) {
        Buffs.add(b.allies[0], "buff_strength", 1, null, tag, m.strength);
        Log.add(`🏺 ${tag}：全体唤醒体战斗开始获得 ${m.strength} 点力量（共享一份）`, "good");
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
      /* T53 扩展：开战全体易伤/虚弱（春之祭/恶童/空间偏折仪；bossDouble=首领战翻倍） */
      const dbl = m.bossDouble && this._isBossFight() ? 2 : 1;
      if (m.vulnAll) {
        for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_vul", m.vulnAll * dbl, null, tag);
        Log.add(`🏺 ${tag}：所有敌人易伤 ${m.vulnAll * dbl} 层${m.bossDouble && dbl > 1 ? "（首领战翻倍）" : ""}`, "good");
      }
      if (m.weakAll) {
        for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_weak", m.weakAll * dbl, null, tag);
        Log.add(`🏺 ${tag}：所有敌人虚弱 ${m.weakAll * dbl} 层${m.bossDouble && dbl > 1 ? "（首领战翻倍）" : ""}`, "good");
      }
      /* T53 扩展：开战使所有敌人失去 N 点临时力量（妙手空空——只削临时实例 per，与刻印 drainTempStrAll 同口径） */
      if (m.drainTempStrAll) {
        let total = 0;
        for (const e of b.enemies) {
          for (const bi of (e.buffs || []).filter(x => x.defId === "buff_strength" && x.duration != null)) {
            const cut = Math.min(bi.per || 0, m.drainTempStrAll);
            bi.per -= cut; total += cut;
          }
        }
        if (total) Log.add(`🏺 ${tag}：所有敌人失去 ${total} 点临时力量`, "good");
      }
    }
  },

  onTurnStart() {
    const b = State.battle;
    if (!b) return;
    this._turnReset();   // T53：每回合计数清零 + 冷却递减（先于本回合效果判定）
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
        /* 低血条件按每名唤醒体独立判定（主语承前）；shield/tempStrength 为获得型。
         * ⚠我方共享血条（T53 修正 T50 遗留）：生命% 取队伍血条，非单位 a.hp（无此字段） */
        if (m.shield || m.tempStrength) {
          const teamPct = this._teamAlive(b) ? b.team.hp / (b.team.maxHp || 1) : 1;
          for (const a of b.allies) {
            if (m.condLowHpPct != null && teamPct >= m.condLowHpPct) continue;
            if (m.shield) { Damage.addShield(a, m.shield, tag); Log.add(`🏺 ${tag}：生命 ${Math.round(teamPct * 100)}%<25% → ${a.def.name} 护盾 +${m.shield}`, "good"); }
            if (m.tempStrength) { Buffs.add(a, "buff_strength", 1, 1, tag, m.tempStrength); Log.add(`🏺 ${tag}：生命 ${Math.round(teamPct * 100)}%<25% → ${a.def.name} 临时力量 +${m.tempStrength}（1 回合）`, "good"); }
          }
        }
        /* T53 扩展：狂气不足以爆发的唤醒体获得狂气（彩蛋时间——爆发门槛 guku<100；全队存活才生效） */
        if (m.gukuIfBurstUnable && this._teamAlive(b)) {
          let n = 0;
          for (const a of b.allies) {
            if (a.guku >= 100) continue;
            a.guku = Math.min(a.gukuMax || 100, a.guku + m.gukuIfBurstUnable);
            n++;
          }
          if (n) Log.add(`🏺 ${tag}：${n} 名狂气不足的唤醒体各获得 ${m.gukuIfBurstUnable} 狂气`, "good");
        }
        /* T53 扩展：维度影像族——回合开始指定唤醒体获得狂气（ownerName 定向） */
        if (m.gukuSelf && m.ownerName && this._teamAlive(b)) {
          const t = this._byOwner(m.ownerName);
          if (t) {
            t.guku = Math.min(t.gukuMax || 100, t.guku + m.gukuSelf);
            Log.add(`🏺 ${tag}：${t.def.name} 回合开始获得 ${m.gukuSelf} 狂气（${t.guku}/${t.gukuMax}）`, "good");
          }
        }
        /* T58 扩展：回合开始获得反击（行道之骸）/力量（杜勒赛因影像第二子句） */
        if (m.riposte) {
          for (const a of b.allies) Buffs.add(a, "buff_riposte", m.riposte, null, tag, 1);
          Log.add(`🏺 ${tag}：全体唤醒体反击 +${m.riposte}`, "good");
        }
        if (m.strength) {
          Buffs.add(b.allies[0], "buff_strength", 1, null, tag, m.strength);
          Log.add(`🏺 ${tag}：回合开始力量 +${m.strength}（共享一份）`, "good");
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
      if (m.gukuPerHandCard && this._teamAlive(b)) {
        /* 手牌归属经卡定义 owner（shared 回落 allies[0]，与 play 同语义）；同名多张逐张计。
         * ⚠我方共享血条（T53 修正 T50 遗留）：存活判断走 team.hp，原 a.hp>0 恒 false 从未生效 */
        for (const inst of b.piles.hand) {
          const def = Cards.def(inst);
          const owner = b.allies.find(a => a.def.id === def.owner) || b.allies[0];
          if (owner) owner.guku = Math.min(owner.gukuMax || 100, owner.guku + m.gukuPerHandCard);
        }
        Log.add(`🏺 ${tag}：回合结束前手牌 ${b.piles.hand.length} 张 → 各所属唤醒体狂气 +${m.gukuPerHandCard}/张`, "good");
      }
      /* T53 扩展：姿态条件触腕伤害（裂头蚴——潮涌姿态回合结束 +78 触伤，3 回合冷却） */
      if (m.tentacleDmg) {
        if (m.stanceCond && (!b.tentacle || b.tentacle.stance !== m.stanceCond)) continue;
        if (m.cool && !this._coolReady(d.id)) continue;
        if (m.cool) this._setCool(d.id, m.cool);
        if (b.tentacle) {
          b.tentacle.dmgBonus = (b.tentacle.dmgBonus || 0) + m.tentacleDmg;
          Log.add(`🏺 ${tag}：${m.stanceCond ? `处于${m.stanceCond}姿态，` : ""}触腕伤害 +${m.tentacleDmg}（冷却 ${m.cool} 回合）`, "good");
        }
      }
    }
  },

  onBurst(ally, pre) {
    const b = State.battle;
    if (!b || !ally) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onBurst;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      /* T58 扩展：爆发后立刻生成触腕（图鲁影像）/按消耗狂气分发（熔毁朵尔影像）/纯粹伤害+中毒（镭射颌骨） */
      if (m.tentacles && b.tentacle) {
        b.tentacle.count += m.tentacles;
        Log.add(`🏺 ${tag}：爆发后触腕 +${m.tentacles} 条（当前 ${b.tentacle.count}）`, "good");
      }
      if (m.gukuSharePer20) {
        const share = Math.floor((pre || 0) / 20);
        if (share > 0) {
          for (const a of b.allies) { if (a.uid === ally.uid || a.hp <= 0) continue; a.guku = Math.min(a.gukuMax || 100, a.guku + share); }
          Log.add(`🏺 ${tag}：消耗 ${pre} 狂气 → 其他唤醒体各 +${share} 狂气（每20点+1）`, "good");
        }
      }
      if (m.rawDmgPctMaxHp) {
        const raw = Math.ceil(b.team.maxHp * m.rawDmgPctMaxHp / 100);
        for (const e of b.enemies) if (e.hp > 0) Damage.applyRawDamage(e, raw, `${tag}（纯粹）`);
        Log.add(`🏺 ${tag}：所有敌人受到 ${raw} 点纯粹伤害（maxHp×${m.rawDmgPctMaxHp}%）`, "good");
      }
      if (m.poisonPctMaxHp) {
        const st = Math.ceil(b.team.maxHp * m.poisonPctMaxHp / 100);
        for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_poison", st, null, tag, 1);
        Log.add(`🏺 ${tag}：所有敌人中毒 +${st} 层（maxHp×${m.poisonPctMaxHp}%，层数口径待实测）`, "good");
      }
      /* 维度影像族：其他唤醒体爆发时自己获益（温柯尔影像 +5 狂气） */
      if (m.onBurstOthers && m.onBurstOthers.ownerName && ally.def.name !== m.onBurstOthers.ownerName && this._teamAlive(b)) {
        const t = this._byOwner(m.onBurstOthers.ownerName);
        if (t) {
          t.guku = Math.min(t.gukuMax || 100, t.guku + m.onBurstOthers.guku);
          Log.add(`🏺 ${tag}：${ally.def.name} 爆发 → ${t.def.name} 狂气 +${m.onBurstOthers.guku}（${t.guku}/${t.gukuMax}）`, "good");
        }
      }
      /* T53 扩展：一回合内第 N 次爆发触发（银白差分机——每回合计数，3 回合冷却） */
      if (m.countGE) {
        const k = `burst_${d.id}`;
        if (!this._coolReady(d.id)) { this._rs().cnt[k] = 0; }
        else {
          const cur = this._cntOf(k) + 1;
          if (cur >= m.countGE) {
            this._rs().cnt[k] = 0;
            this._setCool(d.id, m.cool || 3);
            if (m.energy) { b.energy += m.energy; Log.add(`🏺 ${tag}：一回合第 ${m.countGE} 次爆发 → 算力 +${m.energy}（冷却 ${m.cool || 3}）`, "good"); }
            if (m.silver) { b.silver += m.silver; Log.add(`🏺 ${tag}：一回合第 ${m.countGE} 次爆发 → 银钥 +${m.silver}（冷却 ${m.cool || 3}）`, "good"); }
          } else {
            this._rs().cnt[k] = cur;
          }
        }
      }
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
      if (m.strength) {
        Buffs.add(b.allies[0], "buff_strength", 1, null, tag, m.strength);
        Log.add(`🏺 ${tag}：全体唤醒体银钥觉醒后力量 +${m.strength}（共享一份）`, "good");
      }
      if (m.shield) for (const a of b.allies) { Damage.addShield(a, m.shield, tag); }
      if (m.shield) Log.add(`🏺 ${tag}：银钥觉醒后全体护盾 +${m.shield}`, "good");
      /* T53 扩展三键 */
      if (m.gukuAll) {
        for (const a of b.allies) a.guku = Math.min(a.gukuMax || 100, a.guku + m.gukuAll);
        Log.add(`🏺 ${tag}：银钥觉醒后全体狂气 +${m.gukuAll}`, "good");
      }
      if (m.heal) {
        const before = b.team.hp;
        b.team.hp = Math.min(b.team.maxHp, b.team.hp + m.heal);
        Log.add(`🏺 ${tag}：银钥觉醒后回复 ${b.team.hp - before} 生命`, "good");
      }
      if (m.poisonAll) {
        for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_poison", m.poisonAll, null, tag, 1);
        Log.add(`🏺 ${tag}：银钥觉醒后所有敌人中毒 +${m.poisonAll} 层`, "good");
      }
    }
  },

  /* ---------- T53 新钩子：打出指令卡后（cards.js play 尾部调用）----------
   * 键集：tempStrPerExhaust{v,cap} / drawIfHandLE{hand,draw,cap} / silverPerOwnerFirst{v} /
   *       tempBoostPerDiffOwner{pct} / energyIfCostGE{cost,v,cap} / copyToDraw{copies,disc,cool} /
   *       diffOwner4{gukuAll|tempBoost,gukuCost,cool} */
  onCardPlayed(inst, owner, card) {
    const b = State.battle;
    if (!b || !card) return;
    const isExhaust = inst.forceExhaust === true || card.exhaust === true;
    const nonDerived = card.owner !== "shared";   // 近似：shared 卡=衍生（灵感/胚胎/硬币等）
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onCardPlayed;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.tempStrPerExhaust && isExhaust) {
        if (this._cnt(`exh_${d.id}`, m.cap)) {
          Buffs.add(b.allies[0], "buff_strength", 1, 1, tag, m.tempStrPerExhaust);
          Log.add(`🏺 ${tag}：打出消耗牌 → 临时力量 +${m.tempStrPerExhaust}（本回合 ${this._cntOf(`exh_${d.id}`)}/${m.cap}）`, "good");
        }
      }
      if (m.drawIfHandLE && b.piles.hand.length <= m.hand) {
        if (this._cnt(`dhle_${d.id}`, m.cap)) {
          Cards.draw(m.drawIfHandLE);
          Log.add(`🏺 ${tag}：手牌≤${m.hand} → 抽 ${m.drawIfHandLE} 张（本回合 ${this._cntOf(`dhle_${d.id}`)}/${m.cap}）`, "good");
        }
      }
      if (m.silverPerOwnerFirst && owner) {
        const k = `opf_${d.id}_${owner.def.id}`;
        if (!this._cntOf(k)) { this._rs().cnt[k] = 1; b.silver += m.silverPerOwnerFirst; Log.add(`🏺 ${tag}：${owner.def.name} 本回合首张指令卡 → 银钥 +${m.silverPerOwnerFirst}`, "good"); }
      }
      if (m.tempBoostPerDiffOwner && owner) {
        const k = `dbo_${d.id}_${owner.def.id}`;
        if (!this._cntOf(k)) {
          this._rs().cnt[k] = 1;
          Buffs.add(b.allies[0], "buff_boost_up", 1, 1, tag, m.tempBoostPerDiffOwner);
          Log.add(`🏺 ${tag}：打出不同唤醒体（${owner.def.name}）指令卡 → 临时伤害强效 +${m.tempBoostPerDiffOwner}%`, "good");
        }
      }
      if (m.energyIfCostGE && (card.cost || 0) >= m.cost) {
        if (this._cnt(`ecg_${d.id}`, m.cap)) {
          b.energy += m.v;
          Log.add(`🏺 ${tag}：打出 ${m.cost} 费以上 → 算力 +${m.v}（本回合 ${this._cntOf(`ecg_${d.id}`)}/${m.cap}）`, "good");
        }
      }
      if (m.copyToDraw && nonDerived) {
        if (this._coolReady(d.id)) {
          this._setCool(d.id, m.cool || 3);
          for (let i = 0; i < (m.copies || 1); i++) {
            const cp = Cards.inst(card.id, false);
            if (m.disc) cp.disc = (cp.disc || 0) + m.disc;
            b.piles.draw.splice(Math.floor(Math.random() * (b.piles.draw.length + 1)), 0, cp);
          }
          Log.add(`🏺 ${tag}：「${card.name}」×${m.copies || 1} 临时复制（算力-${m.disc || 0}）洗入抽牌堆（冷却 ${m.cool || 3} 回合）`, "good");
        }
      }
      /* T58 扩展：打出防御类卡→临时反击（故人的怀表）/置入指定卡（奥瑞塔影像）/每体第N张→算力（艾瑞卡影像） */
      if (m.tempRiposte && m.tempRiposte.whenType && card.type === m.tempRiposte.whenType && owner) {
        if (this._cnt(`trp_${d.id}`, m.tempRiposte.cap)) {
          Buffs.add(owner, "buff_riposte", 1, 1, tag, m.tempRiposte.v);
          Log.add(`🏺 ${tag}：打出${m.tempRiposte.whenType}牌 → ${owner.def.name} 临时反击 +${m.tempRiposte.v}（本回合 ${this._cntOf(`trp_${d.id}`)}/${m.tempRiposte.cap}）`, "good");
        }
      }
      if (m.gainCard && m.gainCard.whenType && card.type === m.gainCard.whenType) {
        const need = m.gainCard.ownerName ? (b.allies.find(a => a.def.name === m.gainCard.ownerName) || {}).def?.id : null;
        if ((!m.gainCard.ownerName || card.owner === need) && b.piles.hand.length < Cards.HAND_LIMIT
            && this._cnt(`gc_${d.id}`, m.gainCard.oncePerTurn ? 1 : null)) {
          b.piles.hand.push(Cards.inst(m.gainCard.cardId, false));
          Log.add(`🏺 ${tag}：打出${m.gainCard.ownerName || ""}的「${card.name}」→「${State.getCard(m.gainCard.cardId).name}」置入手牌`, "good");
        }
      }
      if (m.ownerCardsN && owner) {
        const n = this._cntAdd(`ocn_${d.id}_${owner.uid}`, 1);
        if (n === m.ownerCardsN.n && this._cnt(`ocnf_${d.id}`, 1)) {
          b.energy += m.ownerCardsN.energy;
          Log.add(`🏺 ${tag}：${owner.def.name} 一回合第 ${m.ownerCardsN.n} 张指令卡 → 算力 +${m.ownerCardsN.energy}`, "good");
        }
      }
      if (m.diffOwner4 && owner) {
        const seen = `d4_${d.id}_${owner.def.id}`;
        if (!this._cntOf(seen)) {
          this._rs().cnt[seen] = 1;
          const distinct = Object.keys(this._rs().cnt).filter(k => k.startsWith(`d4_${d.id}_`)).length;
          if (distinct >= 4 && this._coolReady(d.id)) {
            this._setCool(d.id, m.cool || 3);
            if (m.gukuAll) { for (const a of b.allies) a.guku = Math.min(a.gukuMax || 100, a.guku + m.gukuAll); Log.add(`🏺 ${tag}：一回合 4 名不同唤醒体指令卡 → 全体狂气 +${m.gukuAll}（冷却 ${m.cool || 3}）`, "good"); }
            if (m.tempBoost) { Buffs.add(b.allies[0], "buff_boost_up", 1, 1, tag, m.tempBoost); Log.add(`🏺 ${tag}：一回合 4 名不同唤醒体指令卡 → 伤害强效 +${m.tempBoost}%（近似「最终伤害」，冷却 ${m.cool || 3}）`, "good"); }
            if (m.gukuCost) { for (const a of b.allies) a.guku = Math.max(0, a.guku - m.gukuCost); Log.add(`🏺 ${tag}：全体狂气 -${m.gukuCost}`, "sys"); }
          }
        }
      }
    }
  },

  /* ---------- T53 新钩子：释放钥令后（yogen.js cast 调用，castIdx=本回合第几次）---------- */
  onYogenCast(castIdx) {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onYogenCast;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.refundPct && castIdx === 1) {
        const back = Math.ceil(1000 * m.refundPct / 100);   // 钥令基础消耗 1000（Yogens.BASE_COST，避免循环依赖不引用）
        b.silver += back;
        Log.add(`🏺 ${tag}：首次钥令返还 ${m.refundPct}% → 银钥 +${back}`, "good");
      }
      if (m.refundSilver && castIdx === 1) {
        b.silver += m.refundSilver;
        Log.add(`🏺 ${tag}：首次钥令 → 银钥 +${m.refundSilver}`, "good");
      }
      if (m.onSecondCast && castIdx === 2) {
        if (m.onSecondCast.silver) { b.silver += m.onSecondCast.silver; Log.add(`🏺 ${tag}：第二次钥令 → 银钥 +${m.onSecondCast.silver}`, "good"); }
        if (m.onSecondCast.gukuAll) { for (const a of b.allies) a.guku = Math.min(a.gukuMax || 100, a.guku + m.onSecondCast.gukuAll); Log.add(`🏺 ${tag}：第二次钥令 → 全体狂气 +${m.onSecondCast.gukuAll}`, "good"); }
      }
      if (m.poisonFirstCast && castIdx === 1) {
        for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_poison", m.poisonFirstCast, null, tag, 1);
        Log.add(`🏺 ${tag}：首次钥令 → 所有敌人中毒 +${m.poisonFirstCast} 层`, "good");
      }
      if (m.tentacleStrikeFirstCast && castIdx === 1 && typeof Tentacle !== "undefined" && b.tentacle) {
        for (const e of b.enemies.filter(x => x.hp > 0)) {
          for (let i = 0; i < m.tentacleStrikeFirstCast; i++) Tentacle.strike(e, m.mult || 1, `造物·${d.name}`, null);
        }
        Log.add(`🏺 ${tag}：首次钥令激发所有触腕攻击 ${m.tentacleStrikeFirstCast} 次（${Math.round((m.mult || 1) * 100)}% 伤害）`, "good");
      }
    }
  },

  /* ---------- T53 新钩子：湮灭后（realmSys.annihilation 调用）---------- */
  onAnnihilate() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onAnnihilate;
      if (!m) continue;
      if (m.cool && !this._coolReady(d.id)) continue;
      if (m.cool) this._setCool(d.id, m.cool);
      const tag = `关卡造物·${d.name}`;
      if (m.shield) for (const a of b.allies) Damage.addShield(a, m.shield, tag);
      if (m.shield) Log.add(`🏺 ${tag}：湮灭后全体护盾 +${m.shield}（冷却 ${m.cool}）`, "good");
      if (m.gukuLowest && this._teamAlive(b)) {
        /* ⚠我方共享血条（T53 修正 T50 遗留）：a.hp 无字段，存活走 team.hp */
        const t = b.allies.slice().sort((x, y) => x.guku - y.guku)[0];
        if (t) { t.guku = Math.min(t.gukuMax || 100, t.guku + m.gukuLowest); Log.add(`🏺 ${tag}：湮灭后 ${t.def.name}（狂气最低）+${m.gukuLowest} 狂气（冷却 ${m.cool}）`, "good"); }
      }
    }
  },

  /* ---------- T53 新钩子：造成主动伤害后（damage.js deal 尾部调用；T58 扩展 card/dmg 与四键）---------- */
  onDeal(source, target, card, dmg) {
    const b = State.battle;
    if (!b || !source || source.side !== "ally") return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onDeal;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.tempStrPerHit && this._cnt(`hit_${d.id}`, m.cap)) {
        Buffs.add(b.allies[0], "buff_strength", 1, 1, tag, m.tempStrPerHit);
        Log.add(`🏺 ${tag}：造成伤害 → 临时力量 +${m.tempStrPerHit}（本回合 ${this._cntOf(`hit_${d.id}`)}/${m.cap}）`, "good");
      }
      /* 祭司权杖族：造成主动伤害后全体中毒（每回合 cap） */
      if (m.poisonAllOnHit && this._cnt(`pah_${d.id}`, m.poisonAllOnHit.cap)) {
        for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_poison", m.poisonAllOnHit.v, null, tag, 1);
        Log.add(`🏺 ${tag}：造成伤害 → 全体敌人中毒 +${m.poisonAllOnHit.v} 层（本回合 ${this._cntOf(`pah_${d.id}`)}/${m.poisonAllOnHit.cap}）`, "good");
      }
      /* 异种喉舌族：打击伤害按 % 转中毒层数（每回合累计点数封顶） */
      if (m.poisonFromStrikePct && target && target.hp > 0) {
        const isStr = card && (typeof Cards !== "undefined" && Cards.isStrikeCard ? Cards.isStrikeCard(card) : /^(基础)?打击$/.test(card.name || ""));
        if (isStr && dmg > 0) {
          const pts = Math.floor(dmg * m.poisonFromStrikePct / 100);
          const cur = this._cntOf(`pfsp_${d.id}`);
          const add = Math.min(pts, (m.capPoints || 0) - cur);
          if (add > 0) {
            this._cntAdd(`pfsp_${d.id}`, add);
            Buffs.add(target, "debuff_poison", add, null, tag, 1);
            Log.add(`🏺 ${tag}：打击伤害 ${dmg} → 目标中毒 +${add} 层（本回合累计 ${cur + add}/${m.capPoints}）`, "good");
          }
        }
      }
      /* 维度影像·血链·希洛：主动伤害附加 20% 出血（层数=伤害20%，per=1 点） */
      if (m.bleedPct && target && target.hp > 0 && dmg > 0) {
        const st = Math.round(dmg * m.bleedPct / 100);
        if (st > 0) Buffs.add(target, "debuff_bleed", st, null, tag);
      }
      /* 维度影像·艾继丝：对易伤目标偷取临时力量（每回合 cap） */
      if (m.stealTempStrFromVul && target && target.hp > 0 && this._cnt(`stv_${d.id}`, m.stealTempStrFromVul.cap)) {
        const hasVul = (target.buffs || []).some(x => x.defId === "debuff_vul");
        if (hasVul) {
          let stolen = 0;
          for (const bi of (target.buffs || []).filter(x => x.defId === "buff_strength" && x.duration != null)) {
            const cut = Math.min(bi.per || 0, m.stealTempStrFromVul.v - stolen);
            if (cut > 0) { bi.per -= cut; stolen += cut; }
          }
          if (stolen > 0) {
            Buffs.add(source, "buff_strength", 1, 1, tag, stolen);
            Log.add(`🏺 ${tag}：偷取 ${target.def.name}（易伤）临时力量 ${stolen} 点（本回合 ${this._cntOf(`stv_${d.id}`)}/${m.stealTempStrFromVul.cap}）`, "good");
          }
        }
      }
    }
  },

  /* ---------- T58 新钩子：抽牌后（Cards.draw 每张调用）---------- */
  onDraw() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onDraw;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.tempStr && this._cnt(`drw_${d.id}`, m.cap)) {
        Buffs.add(b.allies[0], "buff_strength", 1, 1, tag, m.tempStr);
        Log.add(`🏺 ${tag}：抽牌 → 临时力量 +${m.tempStr}（本回合 ${this._cntOf(`drw_${d.id}`)}/${m.cap}）`, "good");
      }
      if (m.gukuSelf && m.ownerName && this._teamAlive(b)) {
        const t = this._byOwner(m.ownerName);
        if (t) t.guku = Math.min(t.gukuMax || 100, t.guku + m.gukuSelf);
      }
    }
  },

  /* ---------- T58 新钩子：弃牌后（Turn._discardOne 调用；回合末弃手同走此口）---------- */
  onDiscard() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onDiscard;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.tempStr && this._cnt(`dis_${d.id}`, m.cap)) {
        Buffs.add(b.allies[0], "buff_strength", 1, 1, tag, m.tempStr);
        Log.add(`🏺 ${tag}：弃牌 → 临时力量 +${m.tempStr}（本回合 ${this._cntOf(`dis_${d.id}`)}/${m.cap}）`, "good");
      }
      if (m.gukuSelf && m.ownerName && this._teamAlive(b)) {
        const t = this._byOwner(m.ownerName);
        if (t) t.guku = Math.min(t.gukuMax || 100, t.guku + m.gukuSelf);
      }
    }
  },

  /* ---------- T58 新钩子：我方受到伤害后（Damage.applyRawDamage ally 分支，lost=实际失去生命）---------- */
  onAllyDamaged(unit, lost) {
    const b = State.battle;
    if (!b || lost <= 0) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onDamaged;
      if (!m) continue;
      const tag = `关卡造物·${d.name}`;
      if (m.strength && this._cnt(`dmgd_${d.id}`, m.cap, m.capScope)) {
        Buffs.add(unit, "buff_strength", 1, null, tag, m.strength);
        Log.add(`🏺 ${tag}：失去生命 → ${unit.def.name} 力量 +${m.strength}（${m.capScope === "battle" ? `本场 ${this._cntOf(`dmgd_${d.id}`, m.capScope)}/${m.cap}` : `本回合 ${this._cntOf(`dmgd_${d.id}`)}/${m.cap}`}）`, "good");
      }
      if (m.riposte && this._cnt(`dmgdr_${d.id}`, m.cap)) {
        Buffs.add(unit, "buff_riposte", 1, null, tag, m.riposte);
        Log.add(`🏺 ${tag}：受到伤害 → ${unit.def.name} 反击 +${m.riposte}（本回合 ${this._cntOf(`dmgdr_${d.id}`)}/${m.cap}）`, "good");
      }
    }
  },

  /* 视力矫正器族：本回合前 N 次主动/触腕伤害 ×pct（deal/strike 各计一次同一计数） */
  dealDamageMult() {
    const b = State.battle;
    if (!b) return 1;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.dealMult;
      if (!m) continue;
      if (this._cntOf(`dmgN_${d.id}`) < m.times) return 1 + m.pct / 100;
    }
    return 1;
  },
  countDeal() {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) if (d.mods && d.mods.dealMult) this._rs().cnt[`dmgN_${d.id}`] = this._cntOf(`dmgN_${d.id}`) + 1;
  },

  /* ---------- T53 新钩子：切换触腕姿态后（tentacle.setStance 调用）---------- */
  onSetStance(name) {
    const b = State.battle;
    if (!b) return;
    for (const d of this.defs()) {
      const m = d.mods && d.mods.onSetStance;
      if (!m || m.stance !== name) continue;
      if (m.cool && !this._coolReady(d.id)) continue;
      if (m.cool) this._setCool(d.id, m.cool);
      const tag = `关卡造物·${d.name}`;
      if (m.tentacleStrike && typeof Tentacle !== "undefined" && b.tentacle) {
        for (const e of b.enemies.filter(x => x.hp > 0)) {
          for (let i = 0; i < m.tentacleStrike; i++) Tentacle.strike(e, m.mult || 1, `造物·${d.name}`, null);
        }
        Log.add(`🏺 ${tag}：使用${name}姿态 → 激发所有触腕攻击 ${m.tentacleStrike} 次（冷却 ${m.cool}）`, "good");
      }
      if (m.drainTempStrAll) {
        let total = 0;
        for (const e of b.enemies) {
          for (const bi of (e.buffs || []).filter(x => x.defId === "buff_strength" && x.duration != null)) {
            const cut = Math.min(bi.per || 0, m.drainTempStrAll);
            bi.per -= cut; total += cut;
          }
        }
        if (total) Log.add(`🏺 ${tag}：使用${name}姿态 → 所有敌人失去 ${total} 点临时力量（冷却 ${m.cool}）`, "good");
      }
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

  /* ---------- 星辰篇·时空扭曲环境规则（T53 部分实装；State.levelEnv=规则名数组） ----------
   * 存在悖论：战斗开始把死亡抵抗 ×75% 转为最大生命%（至多转换 300% 死抗、至多 +10% maxHp；
   *           转换后死抗不扣减——「转换是否移除原值」未实测，保守口径 notes 注明）
   * 无底创痕：首领战，生命回复量每累计达 100% maxHp → 后续回复 -25%（envWoundHealPen 乘区）
   *           + 死亡抵抗总量 +25 个百分点（envWoundDR），最多 3 次（Damage.heal / tryDeathResist 消费）
   * 棱彩透镜/命运光锥：依赖反击系统与「光锥界限」等未入库卡，维持转录未实装（UNMODELED 登记） */
  levelEnvOn() { return Array.isArray(State.levelEnv) ? State.levelEnv : []; },
  envHas(name) { return this.levelEnvOn().includes(name); },
  envDeathResistBonus() {
    const b = State.battle;
    if (!b || !this.envHas("无底创痕")) return 0;
    return (b.envWoundDR || 0);
  },
  envHealPen() {
    const b = State.battle;
    if (!b || !this.envHas("无底创痕")) return 1;
    return Math.max(0, 1 - 0.25 * (b.envWoundHealPen || 0));
  },
  applyEnvOnBattle() {
    const b = State.battle;
    if (!b) return;
    if (this.envHas("存在悖论") && !b.envParadoxApplied) {
      b.envParadoxApplied = true;
      const dr = this._teamDRSnapshot();
      const bonusPct = Math.min(10, Math.min(dr * 3, dr * 0.75));   // 至多转换 300% 死抗、至多 +10% maxHp
      if (bonusPct > 0) {
        const add = Math.ceil(b.team.maxHp * bonusPct / 100);
        b.team.maxHp += add; b.team.hp += add;
        b.envParadoxDR = dr;
        Log.add(`🌀 时空扭曲·存在悖论：死亡抵抗 ${dr}% ×75% → 最大生命 +${add}（+${bonusPct}%）`, "good");
      }
    }
    if (this.envHas("无底创痕")) {
      b.envWoundHealed = 0; b.envWoundHealPen = 0; b.envWoundDR = 0;
      if (this._isBossFight()) Log.add(`🌀 时空扭曲·无底创痕：首领战生效（回复每累计 100% maxHp → 后续回复-25% + 死抗+25，至多 3 次）`, "sys");
    }
  },
  _teamDRSnapshot() {
    try { return Math.min(100, State.teamStats().deathResist || 0); } catch (e) { return 0; }
  },
  /* 无底创痕：heal 后累计（damage.js heal 尾部调用，amount=实际回复量） */
  envOnHeal(amount) {
    const b = State.battle;
    if (!b || !this.envHas("无底创痕") || !this._isBossFight() || amount <= 0) return;
    b.envWoundHealed = (b.envWoundHealed || 0) + amount;
    while (b.envWoundHealed >= b.team.maxHp && (b.envWoundHealPen || 0) < 3) {
      b.envWoundHealed -= b.team.maxHp;
      b.envWoundHealPen = (b.envWoundHealPen || 0) + 1;
      b.envWoundDR = (b.envWoundDR || 0) + 25;
      Log.add(`🌀 无底创痕：累计回复达 100% maxHp → 后续回复效果 -25%、死亡抵抗 +25（${b.envWoundHealPen}/3 次）`, "good");
    }
  },

  /* AI 顾问未建模清单（advisor KNOWN/UNMODELED 携带；清单外禁给确定性数值结论） */
  UNMODELED: [
    "关卡造物 224 条中未建模条目见 data/level_relics.js notes（T53 二期后：可结算家族已建模，残余=反击/湮灭子句/超维空间/猩红熔炉/胚胎融合/吞噬/姿态激发部分/维度影像族第二子句/钥令返还部分/治疗护盾增幅键/「额外生效」族/每回合计数乘区部分）",
    "刻印 35 条中 14 条未建模：镜像/灵感/折跃/统御/嗜血/尖刺/回声（超维空间/洗入/触腕次数/胚胎融合/反击/额外生效依赖）",
    "刻印毒素的「触发 25%/50% 中毒」立即结算未建模；「临时力量」以 buff_strength 1 回合近似",
    "星辰篇环境「时空扭曲」组：存在悖论/无底创痕已部分实装（死抗转maxHp 转换后是否扣减未实测；无底创痕触发后死抗+25 为动态加成）；棱彩透镜/命运光锥未实装（反击系统/「光锥界限」等卡未入库）",
    "维度影像族 61 条仅建模第一子句（回合开始 +15 狂气）；第二子句（角色专属机制）逐条 notes 未建模",
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
    /* debuff 无 shared（T37⑮）——「所有敌人」须逐个施加（2026-10-05 修正：原只挂首个敌人） */
    if (m.weakAll) { for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_weak", m.weakAll, null, tag); Log.add(`📿 ${tag}：虚弱所有敌人 ${m.weakAll} 回合`, "good"); }
    if (m.vulnAll) { for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_vul", m.vulnAll, null, tag); Log.add(`📿 ${tag}：易伤所有敌人 ${m.vulnAll} 回合`, "good"); }
    if (m.poisonAll) { for (const e of b.enemies) if (e.hp > 0) Buffs.add(e, "debuff_poison", m.poisonAll, null, tag); Log.add(`📿 ${tag}：所有敌人中毒 +${m.poisonAll} 层`, "good"); }
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
