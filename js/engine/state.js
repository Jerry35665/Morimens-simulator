/* =========================================================
 * 引擎 · 战斗状态管理
 * ---------------------------------------------------------
 * v0.2 变更：
 *  - 我方队伍共享一根生命条（battle.team.hp，上限=Σ角色HP），角色不再单独掉血
 *  - 每个角色保留独立狂气条（guku/gukuMax，显示 35/100 或 15/200 形式）
 *  - 角色属性由 等级基础 + 命轮/密契加成 自动计算（不可手动调整数值）
 *  - 角色可调项：等级/启灵开关/灵塑适性/内在灵格疯狂预兆/命轮×2/密契×6
 *  - 队伍属性：界域精通/伤害强效/黑印掉落/死亡抵抗/禁忌学识等级
 * ========================================================= */
"use strict";

const State = {

  battle: null,          // 战斗进行中的状态对象
  _uid: 1,

  /* ---------- 本地保存（唤醒体配置 / 守密人等级） ---------- */
  SAVE_KEY: "morimens_sim_save_v1",

  loadSave() {
    try { return JSON.parse(localStorage.getItem(this.SAVE_KEY) || "{}"); }
    catch (e) { return {}; }
  },

  persist() {
    try {
      const data = this.loadSave();
      data.keeperLv = this.keeperLv;
      data.depths = this.depths;
      data.whale = !!this.whale;
      data.carriedYogen = this.carriedYogen || null;   // 携带钥令（账号级配置）
      data.usedYogensExplore = this.usedYogensExplore || [];   // 尘封旧忆本探索已用（T12，随存档跨刷新）
      data.chars = data.chars || {};
      for (const a of (this.battle ? this.battle.allies : [])) {
        data.chars[a.def.id] = {
          level: a.level, personaLv: a.personaLv, enlightenOn: a.enlightenOn,
          spiritAdaptLv: a.spiritAdaptLv, innerGridLv: a.innerGridLv, omenLv: a.omenLv,
          cardLv: a.cardLv, fatewheels: a.fatewheels, fwStacks: a.fwStacks, pacts: a.pacts,
          pactDetails: a.pactDetails, pactSetBound: a.pactSetBound, gukuMax: a.gukuMax
        };
      }
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage 不可用时静默跳过 */ }
  },

  savedCharConfig(charId) {
    return this.loadSave().chars?.[charId] || null;
  },

  /* ---------- 工具 ---------- */
  nextUid(prefix) { return `${prefix}_${this._uid++}`; },

  notify() { if (window.UIRender) UIRender.renderAll(); },

  /* 界域归一：奇点·超维→超维、晦暝·深海→深海、繁育·血肉→血肉、原初·混沌→混沌 */
  realmGroup(realm) {
    for (const g of ["超维", "深海", "血肉", "混沌"]) if ((realm || "").includes(g)) return g;
    return realm;
  },

  /* ---------- 数据查找 ---------- */
  getChar(id)   { return DBF.characters.find(c => c.id === id); },
  getCard(id)   { return DBF.cards.find(c => c.id === id); },
  getEnemy(id)  { return DBF.enemies.find(e => e.id === id); },
  getBuff(id)   { return DBF.buffs.find(b => b.id === id); },
  getTerm(id)   { return DBF.terms.find(t => t.id === id); },
  getFw(id)     { return (DBF.fatewheels || []).find(f => f.id === id); },
  getPact(id)   { return (DBF.pacts || []).find(p => p.id === id); },
  getRelic(id)  { return (DBF.relics || []).find(r => r.id === id); },

  /* 等级上限：基础80；人格深化+8 再+5（85）；+12 再+5（90）并开启最终法则 */
  LEVEL_CAP_BASE: 80,
  levelCap(ally) {
    let cap = this.LEVEL_CAP_BASE;
    if (ally) {
      if ((ally.personaLv || 0) >= 8) cap += 5;
      if ((ally.personaLv || 0) >= 12) cap += 5;
    }
    return cap;
  },

  /* 等级 → 属性基础值。优先用实测数值 levels[L]，否则线性成长（公式待确认）
   * 内在灵格：每级等效 +2 等级的属性成长 */
  /* 三维成长比例表（社区实测：等级10→×3、20→×4 … 90→×11，段内线性插值；
   * 全部数据向上取整——官方群确认）。levels 实测数值优先 */
  GROWTH_RATIO: [[1, 1], [10, 3], [20, 4], [30, 5], [40, 6], [50, 7], [60, 8], [70, 9], [80, 10], [90, 11]],

  ratioAt(level) {
    const t = this.GROWTH_RATIO;
    if (level <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) {
      if (level <= t[i][0]) {
        const [l0, r0] = t[i - 1], [l1, r1] = t[i];
        return r0 + (r1 - r0) * (level - l0) / (l1 - l0);
      }
    }
    return t[t.length - 1][1];
  },

  /* SKeyDB 线性成长数据查找（按中文名/原名/ingameId 匹配） */
  growthFor(charDef) {
    const g = (window.DBF && DBF.growth) || [];
    if (this._growthCacheKey !== g.length + ":" + (charDef && charDef.id)) {
      this._growthCache = null; this._growthCacheKey = g.length + ":" + (charDef && charDef.id);
      const hit = g.find(x => x.zh === charDef.name || x.name === charDef.name ||
        (charDef.ingameId && x.ingameId === charDef.ingameId));
      this._growthCache = hit || null;
    }
    return this._growthCache;
  },

  statAt(charDef, level, field) {
    /* ⓪ SKeyDB 线性成长（base + growth×(等级-1)，向上取整）——优先于比例表；
     * 三维与暴击率等成长型字段适用；体质/攻/防之外的二级属性也随 substatScaling */
    const gr = this.growthFor(charDef);
    if (gr && !charDef.levels) {
      const map = { constitution: "con", attack: "atk", defense: "def", hp: "con" };
      if (map[field] && gr[map[field]]) {
        const v = Math.floor(gr[map[field]].base + gr[map[field]].growth * (level - 1));  // 游戏口径=floor（面板锚点验证）
        return field === "hp" ? v * 10 : v;   // hp 沿用体质×10 占位
      }
      if (gr.subs && gr.subs[field]) {
        /* 二级属性按升格成长（+growth/10级，自11级起）：朵儿升格表验证（银钥16.2→17.4→18.6） */
        const sub = gr.subs[field];
        return Math.floor((sub.base + sub.growth * Math.floor((level - 1) / 10)) * 100) / 100;
      }
    }
    /* ① 有实测 levels 检查点：档间线性插值 + 向上取整（朵儿实测表） */
    const lv = charDef.levels;
    if (lv) {
      const pts = Object.keys(lv).map(Number).sort((a, b) => a - b);
      const val = (L) => (lv[L] && lv[L][field] != null) ? lv[L][field] : null;
      if (field !== "hp") {
        const exact = val(level);
        if (exact != null) return exact;
        if (level <= pts[0]) { const v = val(pts[0]); if (v != null) return v; }
        if (level >= pts[pts.length - 1]) {
          const v = val(pts[pts.length - 1]);
          if (v != null) return Math.ceil(v * level / pts[pts.length - 1]);
        }
        for (let i = 1; i < pts.length; i++) {
          if (level < pts[i]) {
            const v0 = val(pts[i - 1]), v1 = val(pts[i]);
            if (v0 != null && v1 != null)
              return Math.ceil(v0 + (v1 - v0) * (level - pts[i - 1]) / (pts[i] - pts[i - 1]));
          }
        }
      } else if (val(pts[0]) == null && lv[pts[0]].constitution != null) {
        /* hp 无实测：按 体质×10 占位（换算公式待确认） */
        return Math.ceil(this.statAt(charDef, level, "constitution") * 10);
      }
    }
    /* ② 无实测：三维用比例表兜底（社区数据，待验证）；
     * 暴击/狂充/银充/界域精通等面板属性不随等级缩放，直接取基础值 */
    const base = charDef.stats[field] || 0;
    if (["constitution", "attack", "defense", "hp"].includes(field))
      return Math.ceil(base * this.ratioAt(level));   // 向上取整（官方确认）
    return base;
  },

  /* ---------- 密契套装统计 ---------- */
  pactSetCounts(ally) {
    const counts = {};
    for (const pid of (ally.pacts || [])) {
      if (!pid) continue;
      counts[pid] = (counts[pid] || 0) + 1;
    }
    return counts;
  },

  /* 生效中的密契套装效果（3件/6件） */
  activePactBonuses(ally) {
    const out = [];
    const counts = this.pactSetCounts(ally);
    for (const [pid, n] of Object.entries(counts)) {
      const p = this.getPact(pid);
      if (!p) continue;
      if (n >= 3 && p.bonus3) out.push({ set: p.name, pieces: n, tier: "3件", ...p.bonus3 });
      if (n >= 6 && p.bonus6) out.push({ set: p.name, pieces: n, tier: "6件", ...p.bonus6 });
    }
    return out;
  },

  /* ---------- 属性自动计算（不可手动调整） ----------
   * 最终属性 = 等级基础 ×(1+百分比加成) + 平坦加成
   * 加成来源：命轮×2 + 密契套装3件效果 + 灵塑适性/内在灵格等级 */
  /* 人格深化属性表（用户 2026-09-29）：每角色从 8 个二级属性中选 2 个（=启灵 extra 词条）；
   * 每层深化：第一个属性 +1×密契满词条、第二个 +0.5×密契满词条。
   * 未在此表的角色回落朵尔型（狂气回充/银钥充能）。已知四组来自异格角色启灵文本 */
  DEEPEN_TERMS: {
    "暴击率":       ["critRate", 1.6],
    "暴击伤害":     ["critDmg", 2.4],
    "狂气回充等级": ["gukuRecharge", 0.8],
    "银钥充能等级": ["silverKeyCharge", 2.4],
    "伤害强效":     ["damageBoost", 1.6],
    "界域精通":     ["realmMastery", 4],
    "黑印掉落":     ["blackImprint", 1.2],
    "死亡抵抗":     ["deathResist", 5.6]
  },
  DEEPEN_SUBS: {
    "蚀灭·萝坦":  ["黑印掉落", "死亡抵抗"],
    "负誓·奥吉尔": ["暴击率", "暴击伤害"],
    "诞妄·墨菲":  ["银钥充能等级", "暴击伤害"],
    "血链·希洛":  ["暴击率", "伤害强效"]
  },
  /* E6 面板强效档位表（T8，MULTIPLIER-TESTS.md E6 v4 节七面板锚点定案）：
   * 大档 1.6/级、小档 0.8/级；表外角色=无强效深化组（面板强效不由此项产生）。
   * 表内角色的强效由 E6 公式全权结算（recalcAllyStats 跳过 statAt 旧实录残值防双算） */
  BOOST_TIER_16: ["希洛", "血链·希洛", "卡斯托尔", "徐", "旺达", "法洛思"],
  BOOST_TIER_08: ["爱继丝", "波吕克斯", "克莱门汀", "达芙黛尔", "杜勒赛因"],
  boostTierOf(name) {
    if (this.BOOST_TIER_16.includes(name)) return 1.6;
    if (this.BOOST_TIER_08.includes(name)) return 0.8;
    return 0;
  },
  collectStatMods(ally) {
    const mods = [];
    (ally.fatewheels || []).forEach((fwId, slot) => {
      const fw = this.getFw(fwId);
      if (!fw || !fw.statMods) return;
      /* 命轮叠位：属性 = 基础 × (1 + 叠位/12)，叠位 0~12（满叠2倍，游戏内实测） */
      const stacks = (ally.fwStacks && ally.fwStacks[slot]) || 0;
      const factor = 1 + stacks / 12;
      const scaled = {};
      for (const [k, v] of Object.entries(fw.statMods)) scaled[k] = Math.round(v * factor * 100) / 100;
      mods.push({ from: "命轮·" + fw.name + (stacks ? `(叠位${stacks})` : ""), ...scaled });
    });
    /* 人格深化：每层深化属性 = 该角色从 8 个二级属性中选 2 个（=启灵 extra 词条），
     * 一个 +1×密契满词条、另一个 +0.5×密契满词条（用户 2026-09-29 确认）。
     * 未录入深化属性的角色回落朵尔型（狂气回充满档 + 银钥充能半档，朵尔升格表实测） */
    const p = ally.personaLv || 0;
    if (p > 0) {
      const pair = this.DEEPEN_SUBS[ally.def.name] || ["狂气回充等级", "银钥充能等级"];
      const t1 = this.DEEPEN_TERMS[pair[0]], t2 = this.DEEPEN_TERMS[pair[1]];
      const mod = { from: `人格深化+${p}（${pair[0]}满档/${pair[1]}半档）` };
      mod[t1[0]] = Math.round(t1[1] * p * 100) / 100;
      /* 伤害强效改由 E6 面板强效公式结算（T8：率×(1+星级+升格数)+率×max(0,深化-3)），
       * 不再走「半档×每层」旧算法——避免与 E6 双算（血链·希洛案例） */
      if (pair[1] !== "伤害强效") mod[t2[0]] = Math.round(t2[1] / 2 * p * 100) / 100;
      mods.push(mod);
    }
    /* E6 面板强效（T8 实装，七面板锚点定案，见 MULTIPLIER-TESTS.md E6 v4 节）：
     * 面板强效 = 率×(1+星级+升格数) + 率×max(0,人格深化−3)
     * 升格 = Lv20/30/40/50/60 里程碑共 5 次（Lv60 后不再涨）；率 = 深化组强效档（大1.6/小0.8/无0）
     * 星级取 DBF.personal 实测（波吕克斯/法洛思 0 星），无个人数据回落 3（多数角色 3 星，E6 口径） */
    const tier = this.boostTierOf(ally.def.name);
    if (tier > 0) {
      const per = ((window.DBF && DBF.personal && DBF.personal.characters) || []).find(c => c.name === ally.def.name);
      const stars = per && per.stars != null ? per.stars : 3;
      const ascend = Math.min(5, Math.max(0, Math.floor(ally.level / 10) - 1));
      const v = tier * (1 + stars + ascend) + tier * Math.max(0, (ally.personaLv || 0) - 3);
      mods.push({ from: `面板强效(E6：${tier}×(1+星${stars}+升格${ascend})+${tier}×max(0,深化${p}-3))`, damageBoost: Math.round(v * 100) / 100 });
    }
    const sb = ally.pactSetBound || {};
    for (const b of this.activePactBonuses(ally)) {
      if (!b.statMods) continue;
      const mult = sb[b.set] ? 1.5 : 1;
      const scaled = {};
      for (const [k, v] of Object.entries(b.statMods)) scaled[k] = Math.round(v * mult * 100) / 100;
      mods.push({ from: `密契套装·${b.set}(${b.tier})${mult > 1 ? "(结合)" : ""}`, ...scaled });
    }
    /* 密契件主属性与词条：
     * 主属性初始值(强化0)=一条满词条效果(substatMax)，每级强化 +1.5×substatMax/12，
     * 满级(12)=2.5×substatMax（界域精通 4→10 与 gamekee 吻合）；「结合」开启 ×1.5（分单个/套装） */
    const maxes = DBF.subStatMax || {};
    const setBound = ally.pactSetBound || {};
    for (const pd of (ally.pactDetails || [])) {
      if (!pd) continue;
      const setName = pd.set ? (this.getPact(pd.set) || {}).name : null;
      const bound = !!(pd.bound || (setName && setBound[setName]));
      if (pd.mainStat) {
        const subMax = maxes[pd.mainStat] || 0;
        const v = subMax * (1 + 1.5 * (pd.enhanceLv || 0) / (DBF.mainStatMaxLv || 12));
        const final = bound ? Math.round(v * 1.5 * 100) / 100 : Math.round(v * 100) / 100;
        if (final > 0) mods.push({ from: `密契主属性·${(DBF.statNames || {})[pd.mainStat] || pd.mainStat}${bound ? "(结合)" : ""}`, [pd.mainStat]: final });
      }
      for (const sub of (pd.subs || [])) {
        if (sub && sub.stat && sub.lv > 0) {
          mods.push({ from: `密契词条·${(DBF.statNames || {})[sub.stat] || sub.stat}`, [sub.stat]: (maxes[sub.stat] || 0) * sub.lv / (DBF.subStatMaxLv || 8) });
        }
      }
    }
    /* 灵塑适性（星辰天赋）：通用三维每级+3%为占位；专属效果按 wiki 逐级表（getSpiritAdaptInfo 查询） */
    const ad = ally.spiritAdaptLv || 0;
    if (ad > 0) {
      const per = DBF.spiritAdaptPerLv || { hpPct: 3, attackPct: 3, defensePct: 3 };
      mods.push({ from: `灵塑适性 Lv${ad}`, hpPct: per.hpPct * ad, attackPct: per.attackPct * ad, defensePct: per.defensePct * ad });
    }
    /* 内在灵格已并入基础值计算（effLevel = 等级 + 2×灵格级），不再作为百分比修正 */
    return mods;
  },

  /* 灵塑适性查表：wiki 逐级专属效果（data/wiki.js spiritAdapt.levels[等级-1]）
   * 返回 { found, name, level, lvText, nextText }；未匹配角色 found=false */
  getSpiritAdaptInfo(ally) {
    const lv = ally.spiritAdaptLv || 0;
    const c = DBF.wiki && DBF.wiki.characters && DBF.wiki.characters[ally.def.name];
    if (!c || !c.spiritAdapt || !c.spiritAdapt.levels.length) return { found: false, level: lv, lvText: "", nextText: "" };
    const strip = s => String(s || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\{\{词条\|([^}]+)\}\}/g, "$1")
      .replace(/\{\{属性\|([^}]+)\}\}/g, "$1")
      .replace(/\{\{[^}|]+\|([^}]*)\}\}/g, "$1")
      .replace(/<font[^>]*>/g, "").replace(/<\/font>/g, "")
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/'''/g, "").replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ").replace(/\n+/g, " / ").trim();
    const levels = c.spiritAdapt.levels;
    return {
      found: true,
      note: c.spiritAdapt.note || "",
      level: lv,
      lvText: lv >= 1 && levels[lv - 1] ? strip(levels[lv - 1]) : "",
      nextText: lv >= 1 && lv < levels.length && levels[lv] ? strip(levels[lv]) : ""
    };
  },

  recalcAllyStats(ally) {
    const def = ally.def, lv = ally.level;
    const mods = this.collectStatMods(ally);
    const pct = (k) => mods.reduce((s, m) => s + (m[k + "Pct"] || 0), 0);
    const flat = (k) => mods.reduce((s, m) => s + (m[k + "Flat"] !== undefined ? m[k + "Flat"] : (m[k] || 0)), 0);

    /* 内在灵格：每级等效 +2 等级的属性成长（effLevel 参与基础值计算） */
    const effLevel = lv + (ally.innerGridLv || 0) * 2;

    const baseHp = this.statAt(def, effLevel, "hp");
    const hp = Math.round(baseHp * (1 + pct("hp") / 100)) + flat("hp");
    const attack = Math.round(this.statAt(def, effLevel, "attack") * (1 + pct("attack") / 100)) + flat("attack");
    const defense = Math.round((this.statAt(def, effLevel, "defense") || 0) * (1 + pct("defense") / 100)) + flat("defense");

    /* 升格型二级属性（朵尔实测）：狂气回充/银钥充能随等级分段成长，不吃等级倍率 */
    const tier = Math.floor(lv / 10);
    const sg = def.secGrowth || null;
    const gukuReBase = sg ? sg.perTierGuku * tier : this.statAt(def, lv, "gukuRecharge");
    const silverBase = sg ? sg.silverBase + sg.perTierSilver * tier : this.statAt(def, lv, "silverKeyCharge");

    /* E6 档内角色强效由面板强效公式全权结算，跳过旧实录残值防双算（T8） */
    const boostFromE6 = this.boostTierOf(def.name) > 0;

    const r2 = (x) => Math.round(x * 100) / 100;   // 浮点显示误差全局修复
    ally.stats = {
      constitution: this.statAt(def, effLevel, "constitution"),
      attack, defense,
      maxHp: hp,
      critRate: r2(this.statAt(def, lv, "critRate") + flat("critRate")),
      critDmg: r2(this.statAt(def, lv, "critDmg") + flat("critDmg")),
      realmMastery: r2(this.statAt(def, lv, "realmMastery") + flat("realmMastery")),
      damageBoost: r2((boostFromE6 ? 0 : this.statAt(def, lv, "damageBoost")) + flat("damageBoost")),
      blackImprint: r2(this.statAt(def, lv, "blackImprint") + flat("blackImprint")),
      deathResist: r2(this.statAt(def, lv, "deathResist") + flat("deathResist")),
      gukuRecharge: r2(gukuReBase + flat("gukuRecharge")),
      silverKeyCharge: r2(silverBase + flat("silverKeyCharge"))
    };
    ally.maxHp = hp;
    ally.attack = attack;          // 便捷引用（伤害管线用）
    ally.defense = defense;        // 便捷引用（护盾/降力按防御%结算用，如 未损的骑士心）
    if (ally.hpMirror == null) ally.hpMirror = hp;   // 配置变化时由 syncTeamHp 处理
    return ally.stats;
  },

  /* ===== 银钥充能/狂气回冲：等级→收益对照表（用户实测 2026-09-28，收益随等级衰减）=====
   * 银钥=打出指令卡时每消耗1算力获得的银钥能量；回冲=释放狂气爆发后获得的狂气。
   * 命名注意：采集文本写「狂气回冲」，面板属性名「狂气回充」——同一属性 */
  SILVER_CURVE: [[17.1, 18], [24, 24], [27, 27], [28.8, 28], [30.3, 29], [35.1, 33], [38.4, 36], [46.8, 42], [50.1, 44], [53.4, 46], [62.4, 51], [65.4, 53], [72.6, 57], [80.4, 60], [87.9, 64], [89.7, 65], [111.3, 73], [132.9, 80], [154.5, 86]],
  RECHARGE_CURVE: [[15.2, 13], [17.8, 15], [20, 16], [22, 17], [23.8, 18], [24.6, 19], [31.8, 23], [39, 26], [43.2, 28], [52.6, 31]],

  /* 分段线性插值（表内插值，表外按末端斜率外推） */
  _curveValue(curve, level) {
    if (!curve.length) return 0;
    if (level <= curve[0][0]) {
      const [l0, v0] = curve[0], [l1, v1] = curve[1] || curve[0];
      const k = l1 === l0 ? 0 : (v1 - v0) / (l1 - l0);
      return Math.max(0, v0 + (level - l0) * k);
    }
    for (let i = 1; i < curve.length; i++) {
      if (level <= curve[i][0]) {
        const [la, va] = curve[i - 1], [lb, vb] = curve[i];
        return va + (vb - va) * (level - la) / (lb - la);
      }
    }
    const n = curve.length;
    const [la, va] = curve[n - 2], [lb, vb] = curve[n - 1];
    const k = lb === la ? 0 : (vb - va) / (lb - la);
    return Math.max(0, va + (level - la) * k);
  },

  silverPerCost(level) { return Math.round(this._curveValue(this.SILVER_CURVE, level)); },
  rechargeBonus(level) { return Math.round(this._curveValue(this.RECHARGE_CURVE, level)); },

  /* 队伍生命上限 = Σ唤醒体体质 × 活体研究深度 ÷ 100（向上取整）
   * 物象/灵识深度暂只作记录（造物/固定效果缩放待实现） */
  syncTeamHp() {
    const b = this.battle;
    if (!b) return;
    const oldMax = b.team.maxHp;
    const conSum = b.allies.reduce((s, a) => s + (a.stats.constitution || 0), 0);
    /* 命轮队伍生命上限%（灵魂诞生 +10%/个，E6 第七批实测 1933→2127=ceil(base×1.1)——先取整 base 再乘系数）
     * baseMaxHp=不含命轮/局内增益的基础值（深海共生专用——用户实测 10-01：灵魂诞生/局内加生命不影响共生） */
    const hpPct = (typeof Wheels !== "undefined") ? Wheels.teamHpPct() : 0;
    b.team.baseMaxHp = Math.ceil(conSum * (this.depths.live || 270) / 100);
    b.team.maxHp = Math.ceil(b.team.baseMaxHp * (1 + hpPct / 100));
    if (oldMax > 0) {
      b.team.hp = Math.min(b.team.maxHp, Math.round(b.team.hp * (b.team.maxHp / oldMax)));
    } else {
      b.team.hp = b.team.maxHp;
    }
  },

  /* 队伍属性合计。界域精通=各唤醒体之和（超好玩攻略口径：队伍值取和、无稀释）；
   * 伤害强效/黑印/死抗取平均（口径待确认）；+ 造物队伍加成 */
  teamStats() {
    const b = this.battle;
    const sum = { realmMastery: 0, damageBoost: 0, blackImprint: 0, deathResist: 0, tabooKnowledge: this.tabooLevel() };
    if (!b) return sum;
    for (const a of b.allies) {
      sum.realmMastery += a.stats.realmMastery;                 // 求和
      sum.damageBoost += a.stats.damageBoost / Math.max(1, b.allies.length);
      sum.blackImprint += a.stats.blackImprint / Math.max(1, b.allies.length);
      sum.deathResist += a.stats.deathResist;
    }
    for (const rid of (DBF.relicDeck || [])) {
      const r = this.getRelic(rid);
      if (r && r.statMods) {
        sum.damageBoost += r.statMods.teamDamageBoost || 0;
        sum.deathResist += r.statMods.deathResist || 0;
      }
    }
    for (const k of Object.keys(sum)) sum[k] = Math.round(sum[k] * 10) / 10;
    return sum;
  },

  /* ---------- 战斗生命周期 ---------- */
  ALLY_LIMIT: 4,   // 编队人数（NGA：编队最多4名）
  ENERGY_PER_TURN: 5,   // 每回合初始算力（gamekee新手指南；上限10）
  keeperLv: 1,     // 守密人等级（顶栏输入，本地保存）
  carriedYogen: null,  // 携带钥令 id（探索前设置，账号级配置，本地保存）
  usedYogensExplore: [],  // 本探索经尘封旧忆释放过的钥令（T12：跨战斗持久，重开一把/主页重置才清）
  /* 三种研究深度（官方截图示例值；活体决定体质→队伍生命转化强度，可编辑）
   * 物象/灵识还决定钥令数值：护盾/生命/力量×物象、中毒/反击/余烬×灵识（2026-09-28 实测破解） */
  depths: { live: 270, physical: 1032, spirit: 3694 },

  newBattle() {
    const wave = parseInt(document.getElementById("wave-select").value, 10) || 1;
    this.battle = {
      phase: "prep",          // prep | play | enemy | over
      turn: 0,
      difficulty: document.getElementById("difficulty-select").value,  // normal | hard | nightmare
      wave,
      level: parseInt(document.getElementById("level-input").value, 10) || 1,
      allies: [],
      enemies: [],
      piles: { draw: [], hand: [], discard: [], exhaust: [] },
      aiIndex: {},
      team: { hp: 0, maxHp: 0, resources: { furnace: 0 } },   // 我方共享生命 + 队伍公共资源
      teamStats: {},
      energy: 0,
      silver: 0,
      /* ---- 钥令 / 银钥觉醒（2026-09-28 实装）---- */
      carriedYogen: this.carriedYogen || null,  // 本探索携带钥令（=账号配置）
      yogenCastsThisTurn: 0,                    // 本回合已释放钥令次数（≤2）
      silverAwakenCount: 0,                     // 已获得灵知觉醒张数（银钥觉醒消耗=1000×2^此值）
      usedYogens: [],                           // 本场战斗的尘封旧忆已用镜像（startBattle 时从 State.usedYogensExplore 拷入，T12）
      yogenCastHistory: [],                     // 本场战斗全部释放记录（岁末花火 firstOnly 判定）
      starBless: 0,                             // 星辰庇佑层数（群星的庇佑，上限5）
      poemUsed: [],                             // 春天的献诗已选诗页
      delayed: [],                              // 延迟效果（下回合开始护盾等）：{v,label}
      result: null
    };
    this.notify();
    return this.battle;
  },

  /* 设置携带钥令（钥令面板点选；账号级配置随本地保存） */
  setCarriedYogen(id) {
    this.carriedYogen = id || null;
    if (this.battle) this.battle.carriedYogen = this.carriedYogen;
    this.persist();
    const y = (DBF.yogens || []).find(x => x.id === id);
    Log.add(`🔑 携带钥令设置为「${y ? y.name : "（无）"}」`, "sys");
    this.notify();
  },

  /* 推荐等级 = 波次 × 难度系数（普通10/困难12/噩梦13/癫狂14；癫狂5波=70 与官方推荐等级吻合，推测占位） */
  LEVEL_TABLE: {
    normal:    [36, 42, 48, 54, 60],
    hard:      [64, 68, 72, 76, 80],
    nightmare: [82, 84, 86, 88, 90],
    insane:    [92, 94, 96, 98, 100]
  },
  autoLevel(wave, difficulty) {
    /* n5-n7 推荐等级未采：暂按癫狂档回落（最接近已知档） */
    const t = this.LEVEL_TABLE[difficulty] || this.LEVEL_TABLE[/^n[5-7]$/.test(difficulty) ? "insane" : "normal"];
    return t[Math.max(1, Math.min(5, wave)) - 1] || 1;
  },
  _oldAutoLevel(wave, difficulty) {
    const coef = { normal: 10, hard: 12, nightmare: 13, insane: 14 }[difficulty] || 10;
    return Math.max(1, wave * coef);
  },

  /* 禁忌学识等级（官方规则，用户截图）：与守密人等级一致；
   * 若编队平均等级 ≥ 守密人等级，则取（编队平均等级+守密人等级）的均值 */
  tabooLevel() {
    const keeper = this.keeperLv || 1;
    if (!this.battle || !this.battle.allies.length) return keeper;
    const avg = this.battle.allies.reduce((s, a) => s + a.level, 0) / this.battle.allies.length;
    return avg >= keeper ? Math.round((avg + keeper) / 2) : keeper;
  },

  researchDepths() {
    return {
      live: this.depths.live,          // 活体：唤醒体每100点体质→队伍生命
      physical: this.depths.physical,  // 物象：造物/刻印/钥令的力量、触腕伤害、护盾、回复、力量降低类强度
      spirit: this.depths.spirit,      // 灵识：固定中毒、固定反击、固定伤害、固定出血类强度
      formulaConfirmed: false
    };
  },

  reset() {
    this.battle = null;
    this.usedYogensExplore = [];   // T12：重置=放弃本次探索，尘封旧忆已用记录清零
    this.notify();
    if (window.Log) Log.clear();
    Log.add("已重置。请在左侧面板添加唤醒体与怪物，然后点击「开始战斗」。", "sys");
  },

  findUnit(uid) {
    if (!this.battle) return null;
    return this.battle.allies.find(u => u.uid === uid)
        || this.battle.enemies.find(u => u.uid === uid)
        || null;
  },

  /* ---------- 添加单位 ---------- */
  addAlly(charId, level) {
    if (!this.battle) this.newBattle();
    const def = this.getChar(charId);
    if (!def) return null;
    if (this.battle.phase !== "prep") { alert("战斗开始后不能更换队伍，请重置。"); return null; }
    const b = this.battle;
    if (b.allies.length >= this.ALLY_LIMIT) { alert(`编队最多 ${this.ALLY_LIMIT} 名唤醒体`); return null; }

    /* 不能上重复的唤醒体 */
    if (b.allies.some(a => a.def.id === def.id)) { alert(`「${def.name}」已在队伍中，不能重复上阵`); return null; }

    /* 界域混编规则：队伍中只能有一个或两个界域（奇点·超维与超维同界域，其余类似） */
    const groups = new Set(b.allies.map(a => this.realmGroup(a.def.realm)));
    const g = this.realmGroup(def.realm);
    if (!groups.has(g) && groups.size >= 2) {
      alert(`队伍中只能有一种或两种界域：已有「${[...groups].join("、")}」，无法再加入「${def.realm}」`);
      return null;
    }

    const saved = this.savedCharConfig(charId);
    const u = {
      uid: this.nextUid("ally"), side: "ally", def,
      level: Math.min(level || b.level, this.LEVEL_CAP_BASE),
      personaLv: 0,
      enlightenOn: [true, true, true],
      spiritAdaptLv: 0,
      innerGridLv: 0,
      omenLv: 0,
      cardLv: 1,                             // 卡牌等级 1~6：基础打击/防御=倍率(10%+2%/级)、狂气5(+1/级)——灰机2026-10-02全量核验（T32）
      fatewheels: [],
      fwStacks: [0, 0],                      // 命轮叠位（每槽0~12，满叠属性2倍）
      pacts: [],
      pactDetails: [null, null, null, null, null, null],   // 密契件详情：{set, mainStat, enhanceLv, bound, subs:[{stat,lv}×3]}
      pactSetBound: {},                      // 套装结合：{套装名:true} → 套装数值效果×1.5
      gukuMax: 100,
      shield: 0,
      guku: 0,
      silver: 0,
      tentacles: 0,
      buffs: []
    };
    /* 氪佬模式：所有数值默认理论最高 */
    if (this.whale) {
      this.maxOut(u);
      Log.add(`🐋 氪佬模式：${def.name} 按理论最高配置`, "sys");
    }
    /* 应用本地保存的配置 */
    if (saved && !this.whale) {
      for (const k of ["level", "personaLv", "enlightenOn", "spiritAdaptLv", "innerGridLv", "omenLv", "cardLv", "fatewheels", "fwStacks", "pacts", "pactDetails", "pactSetBound", "gukuMax"]) {
        if (saved[k] != null) u[k] = saved[k];
      }
      u.level = Math.min(u.level, this.levelCap(u));
      u.gukuMax = (u.personaLv || 0) >= 4 ? (u.gukuMax || 100) : 100;
    }
    this.recalcAllyStats(u);
    u.hpMirror = u.maxHp;
    b.allies.push(u);
    this.syncTeamHp();
    this.persist();
    Log.add(`添加唤醒体：${def.name}（Lv${u.level}，体质 ${u.stats.constitution}（生命 ${u.maxHp}）/ 攻击 ${u.stats.attack} / 防御 ${u.stats.defense}${u.stats.damageBoost ? ` / 强效 ${u.stats.damageBoost}%` : ""}${saved ? "，已应用保存配置" : ""}）`, "sys");
    this.notify();
    return u;
  },

  /* 氪佬：单个唤醒体按理论最高配置（命轮叠满/密契主属性+词条最大+结合/养成全满） */
  maxOut(a) {
    if (!a) return;
    const cap = this.levelCap(a);
    a.level = cap >= 90 ? 90 : cap;
    a.personaLv = 12; a.cardLv = 6;
    a.spiritAdaptLv = 10; a.innerGridLv = 5; a.omenLv = 12;
    a.gukuMax = 200;
    a.fwStacks = [12, 12];
    const MSP = DBF.mainStatByPart || {};
    const allSubs = Object.keys(DBF.subStatMax || {});
    a.pactDetails = [1, 2, 3, 4, 5, 6].map(part => {
      const ms = (MSP[part] && MSP[part][0]) || "critRate";
      const subs = allSubs.filter(k => k !== ms).slice(0, 3).map(k => ({ stat: k, lv: DBF.subStatMaxLv || 8 }));
      return { set: null, mainStat: ms, enhanceLv: DBF.mainStatMaxLv || 12, bound: true, subs };
    });
    a.pactSetBound = {};
    this.recalcAllyStats(a);
  },

  /* 配置修改后刷新属性与队伍血条，并写入本地保存 */
  refreshAlly(ally) {
    this.recalcAllyStats(ally);
    const cap = this.levelCap(ally);
    if (ally.level > cap) {
      ally.level = cap;
      this.recalcAllyStats(ally);
    }
    if (ally.gukuMax > 100 && (ally.personaLv || 0) < 4) {
      ally.gukuMax = 100;
      ally.guku = Math.min(ally.guku, 100);
    }
    this.syncTeamHp();
    this.persist();
    this.notify();
  },

  /* 切换狂气上限（persona≥4 才允许 200；超限爆发） */
  setGukuMax(ally, max) {
    if (!ally) return;
    if (max > 100 && (ally.personaLv || 0) < 4) {
      Log.add(`${ally.def.name} 人格深化未达+4，无法切换 200 上限`, "sys");
      return;
    }
    ally.gukuMax = max;
    ally.guku = Math.min(ally.guku, max);
    State.notify();
  },

  addEnemy(enemyId) {
    if (!this.battle) this.newBattle();
    const def = this.getEnemy(enemyId);
    if (!def) return null;
    if (this.battle.phase !== "prep") { alert("战斗开始后不能添加怪物，请重置。"); return null; }
    const b = this.battle;
    const diff = b.difficulty;                       // normal | hard | nightmare | insane
    let hp = def.hp[diff] ?? def.hp.hard ?? def.hp.normal;
    let atk = def.attack[diff] ?? def.attack.hard ?? def.attack.normal;
    const waveScale = 1 + (b.wave - 1) * 0.15;       // 波次缩放（占位公式，待确认）
    hp = Math.round(hp * waveScale);
    atk = Math.round(atk * waveScale);
    const u = {
      uid: this.nextUid("enemy"), side: "enemy", def,
      hp, maxHp: hp, attack: atk, defense: 0,
      shield: 0, guku: 0, tentacles: 0,
      buffs: []
    };
    b.enemies.push(u);
    b.aiIndex[u.uid] = 0;
    /* 开局「旧日余烬」：从 passives 文本提取四档层数（格式 73/242/716/1811 层按难度），按当前难度挂载 */
    const pvText = (def.passives || []).join("；");
    const em = pvText.match(/旧日余烬[^\d]*?(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*层/);
    if (em) {
      const idx = { normal: 0, hard: 1, nightmare: 2, insane: 3 }[diff] ?? 0;
      const stacks = parseInt([em[1], em[2], em[3], em[4]][idx], 10) || 0;
      if (stacks > 0 && typeof Buffs !== "undefined") Buffs.add(u, "buff_ember", stacks, null, "开局自带");
    }
    const diffName = { normal: "普通n1", hard: "困难n2", nightmare: "噩梦n3", insane: "癫狂n4", n5: "n5", n6: "n6", n7: "n7" }[diff] || diff;
    Log.add(`添加怪物：${def.name}（${diffName} 第${b.wave}波，HP ${hp} / 攻击 ${atk}）`, "sys");
    this.notify();
    return u;
  },

  removeUnit(uid) {
    if (!this.battle || this.battle.phase !== "prep") return;
    const b = this.battle;
    const wasAlly = b.allies.some(u => u.uid === uid);
    b.allies = b.allies.filter(u => u.uid !== uid);
    b.enemies = b.enemies.filter(u => u.uid !== uid);
    if (wasAlly) this.syncTeamHp();
    this.notify();
  },

  /* ---------- 沙盒干预 ---------- */
  /* 我方：调队伍共享血量；敌方：调单体血量 */
  adjustHp(uid, delta) {
    const u = this.findUnit(uid);
    if (!u) return;
    if (u.side === "ally") {
      const t = this.battle.team;
      t.hp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
      Log.add(`队伍生命 ${delta > 0 ? "+" : ""}${delta} → ${t.hp}/${t.maxHp}`, "sys");
    } else {
      u.hp = Math.max(0, Math.min(u.maxHp, u.hp + delta));
      Log.add(`${u.def.name} 生命 ${delta > 0 ? "+" : ""}${delta} → ${u.hp}/${u.maxHp}`, "sys");
    }
    this.notify();
  },

  /* ---------- 汇总：待确认项 ---------- */
  collectUnknownRules() {
    const out = [];
    for (const t of DBF.terms) if (t.stack === "unknown" || !t.confirmed)
      out.push({ kind: "词条", name: t.name, stack: t.stack, confirmed: t.confirmed, formula: t.formula, howToTest: t.howToTest });
    for (const b of DBF.buffs) if (b.stack === "unknown" || !b.confirmed)
      out.push({ kind: b.kind === "buff" ? "增益" : "减益", name: b.name, stack: b.stack, confirmed: b.confirmed, formula: b.desc, howToTest: "" });
    return out;
  }
};
