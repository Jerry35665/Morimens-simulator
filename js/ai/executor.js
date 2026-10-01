/* =========================================================
 * AI · 执行器：推荐→模拟预览→一键采纳（T30，2026-10-02）
 * ---------------------------------------------------------
 * 闭环一期：融灾顾问（advisor.js）输出的「行动方案 plan JSON」
 * 由本模块结构化执行——
 *   getContext()  结构化局面（手牌 uid/费用/目标 + 敌方 uid/HP/意图 + 资源）
 *   parsePlan()   宽松解析 AI 回复中的 plan 块（围栏/裸对象/全角引号/尾逗号容错；
 *                 无 plan 块 → null=回落纯建议）
 *   preview()     Turn.serializeState 捕获 → 真调引擎 API 逐步执行 → 逐步 diff
 *                 → restoreState 还原（复用现有回溯序列化；Log 暂存不进日志面板；
 *                 history/usedYogensExplore 一并还原，预览不消耗探索资源）
 *   adopt()       真实重放（不还原）；随机项（暴击等）以实际执行为准
 * 铁律：plan 契约只含操作（op/uid/target…），不含预测数值——数值一律由
 *   引擎回放产生；未知字段剔除并告警（UNMODELED 系统不得进 plan 确定值）。
 * 纯逻辑模块（UI 挂钩在 pip.js），测试可直接调用。
 * ========================================================= */
"use strict";

const Executor = {

  /* plan 支持的操作（白名单=契约=铁律边界：引擎能模拟的才允许进 plan） */
  PLAN_OPS: {
    play:     { keys: ["uid", "target"], hint: "打出手牌 uid（索敌卡需 target=敌方/我方 uid）" },
    burst:    { keys: ["ally"],          hint: "释放我方 ally 的狂气爆发（狂气≥100）" },
    yogen:    { keys: ["id", "via"],     hint: "释放钥令：via=carried（默认，第1次）/forgotten（尘封旧忆，第2次，需 id）" },
    awaken:   { keys: ["card"],          hint: "银钥觉醒置入灵知觉醒（card=卡名，缺省=当前可用第一张）" },
    tentacle: { keys: ["stance"],        hint: "切换触腕姿态（stance=静海/怒涛/潮涌，缺省=顺序切换）" },
    end:      { keys: [],                hint: "结束回合（触发敌方行动与下回合开始）" }
  },

  /* ================= ① 结构化局面 ================= */
  getContext() {
    const b = State.battle;
    if (!b) return null;
    const strFlat = (u) => (u.buffs ? Buffs.collect(u, "damageFlat").reduce((s, m) => s + m.total, 0) : 0);
    const buffList = (u) => u.buffs.map(x => { const d = State.getBuff(x.defId); return { name: d ? d.name : x.defId, stacks: x.stacks }; });
    return {
      turn: b.turn, phase: b.phase, energy: b.energy, silver: b.silver,
      team: { hp: b.team.hp, maxHp: b.team.maxHp, shield: b.allies.reduce((s, a) => s + (a.shield || 0), 0) },
      allies: b.allies.map(a => ({
        uid: a.uid, name: a.def.name, guku: a.guku, gukuMax: a.gukuMax,
        burstReady: a.guku >= 100, strength: strFlat(a), buffs: buffList(a)
      })),
      hand: b.piles.hand.map(inst => {
        const def = Cards.def(inst);
        const owner = b.allies.find(a => a.def.id === def.owner) || b.allies[0];
        const cost = def.cost === "X" ? "X" : Math.max(0, (def.cost || 0) - (inst.disc || 0));
        return {
          uid: inst.uid, name: def.name, type: def.type, cost,
          owner: owner ? owner.def.name : "",
          needTarget: def.target === "enemy" ? "enemy" : (def.target === "ally" ? "ally" : null),
          playable: def.type === "狂气爆发" ? !!(owner && owner.guku >= 100)
            : (def.cost === "X" || b.energy >= cost),
          desc: Cards.describeEffects(def, owner, "actual").join("；")
        };
      }),
      enemies: b.enemies.filter(e => e.hp > 0).map(e => {
        const acts = e.def.actions || [];
        const act = acts.length ? acts[(b.aiIndex[e.uid] || 0) % acts.length] : null;
        const bdiff = b.difficulty || "normal";
        const valOf = v => (v != null && typeof v === "object") ? (v[bdiff] != null ? v[bdiff] : v.normal) : v;
        let intent = null;
        if (act) {
          const av = act.type === "attack" ? valOf(act.value) : null;
          intent = {
            name: act.name,
            base: av != null ? av : (act.scaleSelfAttack ? `攻×${act.scaleSelfAttack}` : null),
            times: act.times || 1,
            strength: strFlat(e)
          };
        }
        return { uid: e.uid, name: e.def.name, hp: e.hp, maxHp: e.maxHp, shield: e.shield || 0, intent, buffs: buffList(e) };
      }),
      tentacle: b.tentacle ? { count: b.tentacle.count, rally: b.tentacle.rally, stance: b.tentacle.stance, canSwitch: !b.tentacle.swapped } : null,
      yogen: {
        silver: b.silver, castsThisTurn: b.yogenCastsThisTurn || 0,
        carried: b.carriedYogen ? (DBF.yogens.find(y => y.id === b.carriedYogen) || {}).name : null,
        awakenCost: (typeof Yogens !== "undefined") ? Yogens.awakenCost() : null
      },
      handLimit: Cards.HAND_LIMIT
    };
  },

  /* ================= ② plan 解析（宽松） ================= */
  /* 返回 { plan, why, warnings } 或 null（无 plan 块=回落纯建议） */
  parsePlan(text) {
    if (!text || text.indexOf("plan") < 0) return null;
    const warnings = [];
    let obj = null;
    /* 1) ```json 围栏块 */
    const fences = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
    for (const f of fences) {
      const o = this._tryParse(f[1], warnings);
      if (o && o.plan) { obj = o; break; }
    }
    /* 2) 裸平衡对象（含 "plan" 键；字符串感知的花括号配对） */
    if (!obj) {
      const s = String(text);
      let key = s.indexOf('"plan"');
      if (key < 0) key = s.indexOf("plan");
      if (key >= 0) {
        const start = s.lastIndexOf("{", key);
        if (start >= 0) {
          let depth = 0, inStr = false, esc = false, end = -1;
          for (let i = start; i < s.length; i++) {
            const ch = s[i];
            if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
            if (ch === '"') inStr = true;
            else if (ch === "{") depth++;
            else if (ch === "}") { depth--; if (!depth) { end = i; break; } }
          }
          if (end > start) {
            const o = this._tryParse(s.slice(start, end + 1), warnings);
            if (o && o.plan) obj = o;
          }
        }
      }
    }
    if (!obj) return null;

    /* 3) 逐步校验：op 白名单 + 键白名单（多余字段剔除并告警=数值不得进 plan） */
    const rawPlan = Array.isArray(obj.plan) ? obj.plan : [];
    const plan = [];
    for (let i = 0; i < rawPlan.length; i++) {
      const st = rawPlan[i];
      if (!st || typeof st !== "object" || Array.isArray(st)) { warnings.push(`步骤 ${i + 1} 不是对象，已跳过`); continue; }
      const spec = this.PLAN_OPS[st.op];
      if (!spec) { warnings.push(`步骤 ${i + 1} op「${st.op}」不在支持清单（${Object.keys(this.PLAN_OPS).join("/")}），已跳过`); continue; }
      const clean = { op: st.op };
      for (const k of spec.keys) if (st[k] != null) clean[k] = String(st[k]);
      const extra = Object.keys(st).filter(k => k !== "op" && !spec.keys.includes(k));
      if (extra.length) warnings.push(`步骤 ${i + 1}（${st.op}）含未支持字段 ${extra.join("/")} 已剔除——计划只写操作，数值由模拟器回放得出`);
      plan.push(clean);
    }
    if (!plan.length) return null;
    return { plan, why: typeof obj.why === "string" ? obj.why : "", warnings };
  },

  _tryParse(s, warnings) {
    const base = String(s)
      .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'")   // 弯/全角引号
      .replace(/,\s*([}\]])/g, "$1");                    // 尾逗号
    try { return JSON.parse(base); } catch (e) { /* 落到二段宽松 */ }
    /* 二段宽松：全角结构符（，：（）等）——值内全角标点可能被改写，容错优先 */
    const loose = base.replace(/，/g, ",").replace(/：/g, ":").replace(/（/g, "(").replace(/）/g, ")")
      .replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(loose); } catch (e) { if (warnings) warnings.push(`plan 块 JSON 解析失败（${e.message}）`); return null; }
  },

  /* ================= ③ 预览（执行→diff→还原） ================= */
  preview(plan) {
    const b = State.battle;
    if (!b) return { ok: false, error: "未开战" };
    if (b.phase !== "play") return { ok: false, error: `当前阶段 ${b.phase}，仅出牌阶段可预览` };
    const before = Turn.serializeState();
    const beforeStr = JSON.stringify(before);
    const histBefore = (b.history || []).slice();
    const exploreBefore = (State.usedYogensExplore || []).slice();

    const logs = [];
    const origAdd = Log.add;
    Log.add = (html, cls) => { logs.push({ text: String(html).replace(/<[^>]*>/g, ""), cls: cls || "" }); };

    const steps = [];
    const warnings = [];
    let damaged = false;
    try {
      for (const st of plan) {
        const mark = logs.length;
        const d0 = this._deltas();
        let r;
        try { r = this._execStep(st); }
        catch (e) { r = { ok: false, note: "执行异常：" + e.message }; }
        const d1 = this._deltas();
        const delta = this._diff(d0, d1);
        if (delta.some(x => x.includes("HP") || x.includes("生命"))) damaged = true;
        steps.push({ step: st, ok: r.ok, note: r.note || "", delta, logs: logs.slice(mark) });
        if (!r.ok) break;
        if (State.battle.phase !== "play" && State.battle.phase !== "enemy") break;   // 战斗结束等
      }
    } finally {
      Log.add = origAdd;
      Turn.restoreState(before);
      b.history = histBefore;                                   // 预览期间 endTurn 产生的回合快照作废
      if ((State.usedYogensExplore || []).join() !== exploreBefore.join()) {
        State.usedYogensExplore = exploreBefore;                // 尘封旧忆不因预览消耗（T12 探索级）
        State.persist();
      }
      State.notify();
    }
    if (damaged) warnings.push("含伤害步骤：暴击/触腕暴击等随机项以实际执行为准（预览为当次回放读数）");
    return {
      ok: true, steps, warnings,
      lossless: JSON.stringify(Turn.serializeState()) === beforeStr,   // 自检：还原后与捕获逐字节一致
      context: this.getContext()
    };
  },

  /* ================= ④ 采纳（真实重放，不还原） ================= */
  adopt(plan) {
    const b = State.battle;
    if (!b || b.phase !== "play") return { ok: false, error: "仅出牌阶段可执行" };
    const steps = [];
    for (const st of plan) {
      let r;
      try { r = this._execStep(st); }
      catch (e) { r = { ok: false, note: "执行异常：" + e.message }; }
      steps.push({ step: st, ok: r.ok, note: r.note || "" });
      if (!r.ok) break;
      if (State.battle.phase !== "play" && State.battle.phase !== "enemy") break;
    }
    State.notify();
    return { ok: steps.every(s => s.ok), steps };
  },

  /* ---------- 单步执行（全部预检，绝不触发引擎 alert） ---------- */
  _execStep(st) {
    const b = State.battle;
    if (b.phase !== "play") return { ok: false, note: `当前阶段 ${b.phase}，无法执行` };
    switch (st.op) {
      case "play": {
        const inst = b.piles.hand.find(c => c.uid === st.uid);
        if (!inst) return { ok: false, note: `手牌中无 uid ${st.uid}` };
        const def = Cards.def(inst);
        const owner = b.allies.find(a => a.def.id === def.owner) || b.allies[0];
        if (def.type !== "狂气爆发") {
          const cost = def.cost === "X" ? 0 : Math.max(0, (def.cost || 0) - (inst.disc || 0));
          if (def.cost !== "X" && b.energy < cost) return { ok: false, note: `算力不足（需 ${def.cost}，余 ${b.energy}）` };
        } else if (!owner || owner.guku < 100) {
          return { ok: false, note: "狂气不足 100，无法打出爆发卡" };
        }
        let target = null;
        if (st.target) {
          target = State.findUnit(st.target);
          if (!target || target.hp <= 0) return { ok: false, note: `目标 ${st.target} 不存在或已倒下` };
        }
        if (def.target === "enemy" && (!target || target.side !== "enemy")) return { ok: false, note: `「${def.name}」需要敌方目标（target=敌方 uid）` };
        if (def.target === "ally" && (!target || target.side !== "ally")) return { ok: false, note: `「${def.name}」需要我方目标（target=我方 uid）` };
        const before = b.piles.hand.length;
        Cards.play(st.uid, st.target);
        return { ok: b.piles.hand.length < before, note: b.piles.hand.length < before ? "" : "打出未生效" };
      }
      case "burst": {
        const ally = b.allies.find(a => a.uid === st.ally);
        if (!ally) return { ok: false, note: `我方无 uid ${st.ally}` };
        if (ally.guku < 100) return { ok: false, note: `${ally.def.name} 狂气 ${ally.guku}/100` };
        const pre = ally.guku;
        Cards.releaseBurst(ally);
        return { ok: ally.guku !== pre, note: "" };
      }
      case "yogen": {
        const via = st.via === "forgotten" ? "forgotten" : "carried";
        let id = st.id;
        if (via === "carried") {
          if (!b.carriedYogen) return { ok: false, note: "未携带钥令" };
          id = b.carriedYogen;
          if (st.id && st.id !== b.carriedYogen) return { ok: false, note: "携带钥令与 id 不符" };
        } else {
          if (!id) return { ok: false, note: "尘封旧忆需要 id（从 3 选 1）" };
          if (id === b.carriedYogen) return { ok: false, note: "尘封旧忆不可选携带钥令" };
          if ((b.usedYogens || []).includes(id)) return { ok: false, note: "该钥令本探索已用（每钥令每探索 1 次）" };
        }
        if (!DBF.yogens.find(y => y.id === id)) return { ok: false, note: `未知钥令 id ${id}` };
        if (b.silver < (typeof Yogens !== "undefined" ? Yogens.BASE_COST : 1000)) return { ok: false, note: `银钥不足 1000（现 ${b.silver}）` };
        const expectCasts = (b.yogenCastsThisTurn || 0) + 1;
        const okCast = Yogens.cast(id, { via });
        return { ok: okCast === true && b.yogenCastsThisTurn === expectCasts, note: okCast === true ? "" : "钥令释放被引擎拒绝（回合次数/规则）" };
      }
      case "awaken": {
        let cardId = null;
        if (st.card) {
          const c = DBF.cards.find(x => x.type === "灵知觉醒" && x.name === st.card);
          if (!c) return { ok: false, note: `无名为「${st.card}」的灵知觉醒卡` };
          cardId = c.id;
        } else {
          const c = DBF.cards.find(x => x.type === "灵知觉醒" && b.allies.some(a => a.def.id === x.owner));
          if (!c) return { ok: false, note: "场上角色没有可用灵知觉醒定义" };
          cardId = c.id;
        }
        if (b.silver < (typeof Yogens !== "undefined" ? Yogens.BASE_COST : 1000)) return { ok: false, note: `银钥不足 1000（现 ${b.silver}）` };
        if (b.piles.hand.length >= Cards.HAND_LIMIT) return { ok: false, note: "手牌已满" };
        const before = b.piles.hand.length;
        Yogens.awaken(cardId);
        return { ok: b.piles.hand.length > before, note: "" };
      }
      case "tentacle": {
        const t = b.tentacle;
        if (!t) return { ok: false, note: "当前无触腕（需深海成员开战）" };
        if (t.swapped) return { ok: false, note: "本回合已切换过姿态" };
        if (st.stance) {
          if (!["潮涌", "静海", "怒涛"].includes(st.stance)) return { ok: false, note: `未知姿态「${st.stance}」` };
          if (st.stance === t.stance) return { ok: true, note: "已是该姿态（未消耗切换次数）" };
          Tentacle.setStance(st.stance);
        } else {
          Tentacle.cycleStance();
        }
        return { ok: true, note: "" };
      }
      case "end": {
        const t0 = b.turn;
        Turn.endTurn();
        return { ok: b.turn !== t0 || State.battle.phase === "over", note: State.battle.phase === "over" ? "战斗结束" : "" };
      }
      default:
        return { ok: false, note: `不支持的操作 ${st.op}` };
    }
  },

  /* ---------- diff 辅助 ---------- */
  _deltas() {
    const b = State.battle;
    return {
      turn: b.turn, energy: b.energy, silver: b.silver,
      teamHp: b.team.hp, teamShield: b.allies.reduce((s, a) => s + (a.shield || 0), 0),
      hand: b.piles.hand.length,
      allies: b.allies.map(a => ({ uid: a.uid, name: a.def.name, guku: a.guku })),
      enemies: b.enemies.map(e => ({ uid: e.uid, name: e.def.name, hp: e.hp, shield: e.shield || 0 }))
    };
  },
  _diff(a, c) {
    const out = [];
    if (c.turn !== a.turn) out.push(`回合 ${a.turn}→${c.turn}`);
    if (c.energy !== a.energy) out.push(`算力 ${a.energy}→${c.energy}`);
    if (c.silver !== a.silver) out.push(`银钥 ${a.silver}→${c.silver}`);
    if (c.teamHp !== a.teamHp) out.push(`队伍生命 ${a.teamHp}→${c.teamHp}`);
    if (c.teamShield !== a.teamShield) out.push(`护盾 ${a.teamShield}→${c.teamShield}`);
    if (c.hand !== a.hand) out.push(`手牌 ${a.hand}→${c.hand}`);
    for (const e of c.enemies) {
      const p = a.enemies.find(x => x.uid === e.uid);
      if (p && (p.hp !== e.hp || p.shield !== e.shield))
        out.push(`${e.name} HP${p.hp}→${e.hp}${p.shield !== e.shield ? ` 盾${p.shield}→${e.shield}` : ""}`);
    }
    for (const al of c.allies) {
      const p = a.allies.find(x => x.uid === al.uid);
      if (p && p.guku !== al.guku) out.push(`${al.name} 狂气 ${p.guku}→${al.guku}`);
    }
    return out;
  }
};

window.Executor = Executor;
