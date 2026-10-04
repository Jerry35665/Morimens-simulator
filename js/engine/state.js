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

  /* ---------- 本地保存（唤醒体配置 / 守密人等级） ----------
   * T45 分档：v2 键={active,slots:{原版·个人,原版·测试,自制}}，persist/load 全链走 active 槽；
   * 旧 v1 键一次性迁移进「原版·个人」并保留兜底（v1 不删）。test.html 备份-恢复按 morimens_* 前缀天然兼容 v2 */
  SAVE_KEY: "morimens_sim_save_v1",          // 旧键（兜底保留）
  SAVE_KEY_V2: "morimens_sim_save_v2",
  SAVE_SLOTS: ["原版·个人", "原版·测试", "自制"],
  saveSlot: "原版·个人",                     // 当前 active 槽（会话内存，随 persist 落 v2）

  _loadV2() {
    try {
      const v2 = JSON.parse(localStorage.getItem(this.SAVE_KEY_V2) || "null");
      if (v2 && v2.slots) {
        v2.active = this.SAVE_SLOTS.includes(v2.active) ? v2.active : "原版·个人";
        for (const s of this.SAVE_SLOTS) if (!v2.slots[s]) v2.slots[s] = null;
        return v2;
      }
    } catch (e) { /* 损坏则重建 */ }
    /* 迁移：旧 v1 → 原版·个人（v1 键保留兜底不删） */
    let v1 = {};
    try { v1 = JSON.parse(localStorage.getItem(this.SAVE_KEY) || "{}"); } catch (e) {}
    const v2 = { active: "原版·个人", slots: { "原版·个人": v1, "原版·测试": null, "自制": null } };
    try { localStorage.setItem(this.SAVE_KEY_V2, JSON.stringify(v2)); } catch (e) {}
    return v2;
  },

  loadSave() {
    const v2 = this._loadV2();
    this.saveSlot = v2.active;
    return v2.slots[v2.active] || {};
  },

  persist() {
    try {
      const data = this.loadSave();
      data.keeperLv = this.keeperLv;
      data.depths = this.depths;
      data.whale = !!this.whale;
      data.carriedYogen = this.carriedYogen || null;   // 携带钥令（账号级配置）
      data.usedYogensExplore = this.usedYogensExplore || [];   // 尘封旧忆本探索已用（T12，随存档跨刷新）
      data.levelRelicDeck = this.levelRelicDeck || [];         // 关卡造物携带（T50，随存档跨刷新）
      data.starEnv = !!this.starEnv;                   // 星辰篇环境开关（T48，随存档跨刷新）
      data.keeperYogenCount = this.keeperYogenCount || 0;   // 归档刻痕输入（T48）
      data.chars = data.chars || {};
      for (const a of (this.battle ? this.battle.allies : [])) {
        data.chars[a.def.id] = {
          level: a.level, personaLv: a.personaLv, enlightenOn: a.enlightenOn,
          spiritAdaptLv: a.spiritAdaptLv, innerGridLv: a.innerGridLv, omenLv: a.omenLv,
          cardLv: a.cardLv, fatewheels: a.fatewheels, fwStacks: a.fwStacks, pacts: a.pacts,
          pactDetails: a.pactDetails, pactSetBound: a.pactSetBound, gukuMax: a.gukuMax
        };
      }
      /* T45：写 v2 active 槽（旧 v1 不再更新，保留兜底） */
      const v2 = this._loadV2();
      v2.active = this.saveSlot;
      v2.slots[this.saveSlot] = data;
      localStorage.setItem(this.SAVE_KEY_V2, JSON.stringify(v2));
    } catch (e) { /* localStorage 不可用时静默跳过 */ }
  },

  /* T45：切档——当前状态存进旧槽 → 切 active → 新槽数据恢复内存 → 重置编队（按新档保存配置重新加人） */
  switchSaveSlot(name) {
    if (!this.SAVE_SLOTS.includes(name) || name === this.saveSlot) return;
    this.persist();                     // 当前状态落旧槽
    const v2 = this._loadV2();
    v2.active = name;
    try { localStorage.setItem(this.SAVE_KEY_V2, JSON.stringify(v2)); } catch (e) {}
    this.saveSlot = name;
    const saved = this.loadSave();
    this.keeperLv = saved.keeperLv || 1;
    this.usedYogensExplore = Array.isArray(saved.usedYogensExplore) ? saved.usedYogensExplore : [];
    this.levelRelicDeck = Array.isArray(saved.levelRelicDeck) ? saved.levelRelicDeck : [];   // T50：关卡造物随档恢复
    if (saved.depths) this.depths = Object.assign(this.depths, saved.depths);
    this.carriedYogen = saved.carriedYogen || null;
    this.starEnv = !!saved.starEnv;
    this.keeperYogenCount = saved.keeperYogenCount || 0;
    this.whale = !!saved.whale;
    if (this.battle) this.newBattle();   // 编队随档清空（保存配置在下次 addAlly 时套用）
    Log.add(`💾 已切换到存档槽「${name}」（编队已清空，唤醒体按该档保存配置重新添加）`, "good");
    this.notify();
  },

  /* T45：把当前 active 槽内容另存到目标槽 */
  copySaveSlot(target) {
    if (!this.SAVE_SLOTS.includes(target) || target === this.saveSlot) return;
    this.persist();
    const v2 = this._loadV2();
    v2.slots[target] = JSON.parse(JSON.stringify(v2.slots[this.saveSlot] || {}));
    try { localStorage.setItem(this.SAVE_KEY_V2, JSON.stringify(v2)); } catch (e) {}
    Log.add(`💾 已把「${this.saveSlot}」另存到「${target}」`, "good");
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

  /* 神界域变体（T38 E 框架层）：4 名特殊唤醒体在队时把基础界域替换为变体界域
   * （原初·混沌=蚀灭·萝坦 / 晦暝·深海=诞妄·墨菲 / 繁育·血肉=沙耶 / 奇点·超维=阿拉克涅）。
   * 现阶段：身份判定+单位卡展示+混编仍按基础界域组（realmGroup 不变，原初·混沌等仍属混沌组）；
   * 各变体专属机制（原初钥令替换/晦暝触腕姿态/繁育狂热/奇点信标）未建模，全文见 data/realms.js variants */
  variantRealmKey(defName) {
    const vs = (window.DBF && DBF.realms && DBF.realms.variants) || {};
    for (const k of Object.keys(vs)) if (vs[k].char === defName) return k;
    return null;
  },
  effectiveRealm(def) {
    return this.variantRealmKey(def && def.name) || (def && def.realm) || "";
  },

  /* 天赋实装钩子（T38 F 框架层）：charId → 结构化键；引擎结算点查询此表，未登记角色=天赋未实装
   * （全文仍在 characters.js def.talent / DATA-TODO）。
   * char_doll 灵知解构：每1点狂气回充等级，「外域手术」「等价交换」回复+0.5%——✅已由游戏锚点证实
   * （2026-10-03 用户三次校准：卡面44=ceil(ceil(102×39.9%)×1.072) 含天赋；heal op 与 describe 双侧消费）。
   * 灵塑专属：通用三维已实装（collectStatMods +3%/级）；专属逐级表 getSpiritAdaptInfo 仅展示，
   * 逐角色实装时在此登记结构化键（按用户常用队列分批） */
  TALENT_HOOKS: {
    char_doll: { healUpPerGuku: 0.005 },
    /* ---- T40 夜间批（2026-10-03）：attrCard 族=「自身/命轮/密契每 1 点 attr 属性→卡牌 cards[] 效果提高 perPoint」----
     * attr=DEEPEN_TERMS 同名 stats 键（critRate/realmMastery/blackImprint/deathResist/silverKeyCharge/damageBoost/gukuRecharge）
     * attrCardFlat→②.5 basePlain 组（damage.js 并入）；attrCardCritOnPlay→打出卡后临时暴击率+暴伤（cards.js play 挂点）；
     * attrCardGuku→该卡狂气获得量 +attr值×perPoint 点（cards.js guku 结点）；silverKeyFlat→collectStatMods 面板银充 +N */
    char_kasia:  { attrCardFlat: { cards: ["魔术嘉年华"], attr: "realmMastery", perPoint: 0.2 } },
    char_jenkin: { attrCardFlat: { cards: ["基础打击", "布朗出动"], attr: "critRate", perPoint: 2 } },
    char_d03:    { attrCardCritOnPlay: { cards: ["星彩极光"], attr: "blackImprint", perPoint: 0.15 } },
    char_d08:    { attrCardCritOnPlay: { cards: ["电磁爆破"], attr: "silverKeyCharge", perPoint: 0.5 } },
    char_o08:    { attrCardGuku: { cards: ["基础打击", "基础防御"], attr: "deathResist", perPoint: 0.03 } },
    char_b04:    { attrCardGuku: { cards: ["基础防御"], attr: "critRate", perPoint: 0.2 } },
    char_ramona_timeworn: { silverKeyFlat: 2.5 },   // 心与银的共振：额外+2.5 银充（同调率×0.5 部分=ally 无 sync 字段，登记未实现）
    char_ramona: { silverKeyFlat: 2.5 },
  },

  /* ---- T40 天赋钩子消费助手（挂点：damage.js ②.5 / cards.js play+guku / collectStatMods） ---- */
  talentAttr(unit, attr) { return (unit && unit.stats && unit.stats[attr]) || 0; },

  talentCardFlatPct(source, card) {
    if (!source || !card || !source.def) return 0;
    const h = this.TALENT_HOOKS[source.def.id];
    if (!h || !h.attrCardFlat) return 0;
    if (h.attrCardFlat.cards.indexOf(card.name || "") < 0) return 0;
    return (this.talentAttr(source, h.attrCardFlat.attr) || 0) * h.attrCardFlat.perPoint;
  },

  talentOnPlay(source, card) {
    if (!source || !card || !source.def) return;
    const h = this.TALENT_HOOKS[source.def.id];
    if (!h || !h.attrCardCritOnPlay) return;
    if (h.attrCardCritOnPlay.cards.indexOf(card.name || "") < 0) return;
    const pts = Math.round((this.talentAttr(source, h.attrCardCritOnPlay.attr) || 0) * h.attrCardCritOnPlay.perPoint * 10) / 10;
    if (pts <= 0) return;
    Buffs.add(source, "buff_crit_up", pts, null, "天赋·" + source.def.name);
    Buffs.add(source, "buff_critdmg_up", pts, null, "天赋·" + source.def.name);
    Log.add(`🌟 天赋【${source.def.name}】：打出「${card.name}」获得 ${pts}% 临时暴击率与暴击伤害`, "sys");
  },

  talentGukuBonus(source, card) {
    if (!source || !card || !source.def) return 0;
    const h = this.TALENT_HOOKS[source.def.id];
    if (!h || !h.attrCardGuku) return 0;
    if (h.attrCardGuku.cards.indexOf(card.name || "") < 0) return 0;
    return (this.talentAttr(source, h.attrCardGuku.attr) || 0) * h.attrCardGuku.perPoint;
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
    const base = (charDef.stats || {})[field] || 0;
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
  /* 二级属性统一基线（用户 10-02 口径）：全唤醒体相同；角色差异只来自深化属性+命轮/密契 */
  BASE_SECONDARY: { critRate: 5, critDmg: 50, silverKeyCharge: 15 },

  /* 深化对解析（T31 连带，wiki enlighten[4] 数据源）：每角色两个深化属性+各自率（层4 值=1 档）。
   * 面板深化值 = 率×(1+星级+升格数) + 率×max(0, 人格深化−3)（E6 同构公式，强效多点实测验证）。
   * 强效项在 collectStatMods 统一生成（deepen 段），wiki 无数据角色回落 DEEPEN_SUBS 旧逻辑 */
  DEEPEN_ENABLED: false,   // 深化数值开关：强效外的深化值实测校准后改 true（奥吉尔推定 8 vs 实录 2 差 4 倍未解）
  STAT_KEY_MAP: { "暴击率": "critRate", "暴击伤害": "critDmg", "伤害强效": "damageBoost", "界域精通": "realmMastery", "黑印掉落": "blackImprint", "死亡抵抗": "deathResist", "狂气回充等级": "gukuRecharge", "银钥充能等级": "silverKeyCharge" },
  DEEPEN_CACHE: null,
  deepenPairOf(ally) {
    const chs = (window.DBF && DBF.wiki && DBF.wiki.characters) || {};
    if (!this.DEEPEN_CACHE) {
      this.DEEPEN_CACHE = {};
      for (const n of Object.keys(chs)) {
        const e = (chs[n].enlighten || {})[4];
        if (!e || !e.effect) continue;
        const attrs = [...e.effect.matchAll(/\{\{属性\|([^}]+)\}\}(?:\s|<[^>]+>)*?\+?\s*([0-9.]+)/g)]
          .map(m => ({ cn: m[1], v: +m[2] }))
          .filter(a => this.STAT_KEY_MAP[a.cn]);
        if (attrs.length) this.DEEPEN_CACHE[n] = attrs;
      }
    }
    return this.DEEPEN_CACHE[ally.def.name] || null;
  },
  getAllyStars(ally) {
    const per = ((window.DBF && DBF.personal && DBF.personal.characters) || []).find(c => c.name === ally.def.name);
    if (per && per.stars != null) return per.stars;
    return ally.def.rarity === "SSR" ? 3 : ally.def.rarity === "SR" ? 1 : 0;   // 无个人数据按稀有度回退
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
  /* 造物个人属性键（用户 2026-10-03 定案）：造物 statMods 里这些键对**每名**唤醒体个人面板生效；
   * 死亡抵抗/界域精通/伤害强效/黑印等队伍共享键不在此列，只进 teamStats。后续实测确认新键就往里加 */
  RELIC_PERSONAL_KEYS: ["critRate", "critDmg", "silverKeyCharge"],

  collectStatMods(ally, opts = {}) {
    /* 注：造物的队伍共享属性（死亡抵抗/界域精通等）不在此处，只在 teamStats 计一次；
     * 个人属性键（暴击率/爆伤/银充，RELIC_PERSONAL_KEYS）在下方造物段处理（2026-10-03 用户定案） */
    const mods = [];
    (ally.fatewheels || []).forEach((fwId, slot) => {
      const fw = this.getFw(fwId);
      if (!fw || !fw.statMods) return;
      /* 命轮叠位：属性 = 基础 × (1 + 叠位/12)，叠位 0~12（满叠2倍，游戏内实测）；
       * 钳制 0~12：脏存档/旧版超界叠位不再无限放大属性（2026-10-02 属性对账批） */
      const stacks = Math.max(0, Math.min(12, (ally.fwStacks && ally.fwStacks[slot]) || 0));
      const factor = 1 + stacks / 12;
      const scaled = {};
      for (const [k, v] of Object.entries(fw.statMods)) scaled[k] = Math.round(v * factor * 100) / 100;
      mods.push({ from: "命轮·" + fw.name + (stacks ? `(叠位${stacks})` : ""), ...scaled });
    });
    /* 深化属性（2026-10-02 朵尔面板实测定案）：面板值 = 率×(1+星级+升格数) + 率×max(0, 人格深化−3)
     * 率 = wiki enlighten 层4 增量（56 角色全覆盖）；朵尔验证：狂充 0.8×18=14.4 ✓、银钥 1.2×18+15 基线=36.6 ✓
     * （18 = (1+3星+5升格) + (12深化−3)）；强效同一公式（E6 七面板锚点即此形状）。
     * 星级取 DBF.personal 实测，无则按稀有度回退 SSR3/SR1/R0 */
    {
      const per = ((window.DBF && DBF.personal && DBF.personal.characters) || []).find(c => c.name === ally.def.name);
      const stars = per && per.stars != null ? per.stars : (ally.def.rarity === "SSR" ? 3 : ally.def.rarity === "SR" ? 1 : 0);
      const ascend = Math.min(5, Math.max(0, Math.floor(ally.level / 10) - 1));
      const p = ally.personaLv || 0;
      const dp = this.deepenPairOf(ally);
      if (dp) {
        for (const q of dp) {
          const v = Math.round((q.v * (1 + stars + ascend) + q.v * Math.max(0, p - 3)) * 100) / 100;
          mods.push({ from: `深化属性·${q.cn}`, [this.STAT_KEY_MAP[q.cn]]: v });
        }
      } else if (p > 0 || this.boostTierOf(ally.def.name) > 0) {
        /* wiki 缺页回落：强效走 BOOST_TIER 硬表（E6 档位），其它深化走 DEEPEN_SUBS 手录/朵尔型 */
        const pair = this.DEEPEN_SUBS[ally.def.name] || ["狂气回充等级", "银钥充能等级"];
        const t1 = this.DEEPEN_TERMS[pair[0]], t2 = this.DEEPEN_TERMS[pair[1]];
        const mod = { from: `人格深化+${p}（${pair[0]}满档/${pair[1]}半档）` };
        mod[t1[0]] = Math.round(t1[1] * p * 100) / 100;
        if (pair[1] !== "伤害强效") mod[t2[0]] = Math.round(t2[1] / 2 * p * 100) / 100;
        if (p > 0) mods.push(mod);
        const tier = this.boostTierOf(ally.def.name);
        if (tier > 0) {
          const v = tier * (1 + stars + ascend) + tier * Math.max(0, p - 3);
          mods.push({ from: `面板强效(E6：${tier}×(1+星${stars}+升格${ascend})+${tier}×max(0,深化${p}-3))`, damageBoost: Math.round(v * 100) / 100 });
        }
      }
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
        const enh = Math.max(0, Math.min(DBF.mainStatMaxLv || 12, pd.enhanceLv || 0));   // 钳制 0~12 防脏存档
        const v = subMax * (1 + 1.5 * enh / (DBF.mainStatMaxLv || 12));
        const final = bound ? Math.round(v * 1.5 * 100) / 100 : Math.round(v * 100) / 100;
        if (final > 0) mods.push({ from: `密契主属性·${(DBF.statNames || {})[pd.mainStat] || pd.mainStat}${bound ? "(结合)" : ""}`, [pd.mainStat]: final });
      }
      for (const sub of (pd.subs || [])) {
        const slv = sub ? Math.max(0, Math.min(DBF.subStatMaxLv || 8, sub.lv || 0)) : 0;   // 钳制 0~8 防脏存档
        if (sub && sub.stat && slv > 0) {
          mods.push({ from: `密契词条·${(DBF.statNames || {})[sub.stat] || sub.stat}`, [sub.stat]: (maxes[sub.stat] || 0) * slv / (DBF.subStatMaxLv || 8) });
        }
      }
    }
    /* 灵塑适性（星辰天赋）：通用三维每级+3%——**实际生效**（用户 2026-10-02 澄清），
     * 但游戏「属性详情」面板不显示灵塑贡献（朵尔 Lv70 灵塑10：面板显示 83/111，实战 108/144）；
     * 对账时须剥离灵塑再比。专属效果按 wiki 逐级表（getSpiritAdaptInfo 查询） */
    const ad = ally.spiritAdaptLv || 0;
    if (ad > 0) {
      const per = DBF.spiritAdaptPerLv || { hpPct: 3, attackPct: 3, defensePct: 3 };
      mods.push({ from: `灵塑适性 Lv${ad}（面板不显示、实战生效）`, hpPct: per.hpPct * ad, attackPct: per.attackPct * ad, defensePct: per.defensePct * ad });
    }
    /* 固有天赋（T40）：silverKeyFlat（拉蒙娜「心与银的共振」额外+2.5 银充；同调率部分未实现登记） */
    const tkS = this.TALENT_HOOKS[ally.def && ally.def.id];
    if (tkS && tkS.silverKeyFlat) mods.push({ from: `天赋·${ally.def.name}`, silverKeyCharge: tkS.silverKeyFlat });
    /* 造物个人属性键：暴击率/爆伤/银充对每名唤醒体生效（平坦加成，进 flat 汇总）；
     * noRelics=true 供裸装对照行用（裸装=无装备口径） */
    if (!opts.noRelics) {
      for (const rid of (DBF.relicDeck || [])) {
        const r = this.getRelic(rid);
        if (!r || !r.statMods) continue;
        const personal = {};
        for (const k of this.RELIC_PERSONAL_KEYS) if (r.statMods[k]) personal[k] = r.statMods[k];
        if (Object.keys(personal).length) mods.push({ from: `造物·${r.name}`, ...personal });
      }
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

  /* 属性数学核心（纯函数，不改单位状态）：养成面板主行与裸装对照行共用（gear.js 传不同 mods） */
  computeStats(def, effLevel, mods) {
    const pct = (k) => mods.reduce((s, m) => s + (m[k + "Pct"] || 0), 0);
    const flat = (k) => mods.reduce((s, m) => s + (m[k + "Flat"] !== undefined ? m[k + "Flat"] : (m[k] || 0)), 0);

    const baseHp = this.statAt(def, effLevel, "hp");
    const hp = Math.round(baseHp * (1 + pct("hp") / 100)) + flat("hp");
    const attack = Math.round(this.statAt(def, effLevel, "attack") * (1 + pct("attack") / 100)) + flat("attack");
    const defense = Math.round((this.statAt(def, effLevel, "defense") || 0) * (1 + pct("defense") / 100)) + flat("defense");
    const baseCon = this.statAt(def, effLevel, "constitution");

    /* 升格型二级属性成长（旧口径）已废弃——二级属性统一基线见 ally.stats 段注释 */

    const r2 = (x) => Math.round(x * 100) / 100;   // 浮点显示误差全局修复
    /* 二级属性统一基线（用户 10-02 口径）：全唤醒体 暴击率5/爆伤50/银钥充能15，其余二级属性基础=0；
     * 角色差异只来自 深化属性（DEEPEN pair 两项/层）+命轮/密契 statMods（flat）。
     * 不再读 def.stats/levels 的 gamekee 实录杂值（旧面板读数含深化，与新口径冲突）。
     * 狂气回充/银钥充能的升格成长（sg）一并废弃——升格成长属旧口径 */
    return {
      constitution: baseCon,
      /* 实战口径体质（灵塑三维%，与攻/防同行口径，仅展示用）；
       * 公式输入（深海共生/星天兽轮/地图队伍生命/超限爆发）仍读 constitution 原始值——T19 实测口径不动 */
      constitutionCombat: Math.round(baseCon * (1 + pct("hp") / 100)),
      attack, defense,
      maxHp: hp,
      critRate: r2(State.BASE_SECONDARY.critRate + flat("critRate")),
      critDmg: r2(State.BASE_SECONDARY.critDmg + flat("critDmg")),
      realmMastery: r2(flat("realmMastery")),
      damageBoost: r2(flat("damageBoost")),
      blackImprint: r2(flat("blackImprint")),
      deathResist: r2(flat("deathResist")),
      gukuRecharge: r2(flat("gukuRecharge")),
      silverKeyCharge: r2(State.BASE_SECONDARY.silverKeyCharge + flat("silverKeyCharge"))
    };
  },

  recalcAllyStats(ally) {
    /* 内在灵格：每级等效 +2 等级的属性成长（effLevel 参与基础值计算） */
    const stats = this.computeStats(ally.def, ally.level + (ally.innerGridLv || 0) * 2, this.collectStatMods(ally));
    ally.stats = stats;
    ally.maxHp = stats.maxHp;
    ally.attack = stats.attack;          // 便捷引用（伤害管线用）
    ally.defense = stats.defense;        // 便捷引用（护盾/降力按防御%结算用，如 未损的骑士心）
    if (ally.hpMirror == null) ally.hpMirror = stats.maxHp;   // 配置变化时由 syncTeamHp 处理
    return stats;
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

  /* ===================== 星辰篇环境（T48，2026-10-05 实装） =====================
   * 源：「关卡篇章效果说明」截图（造物与刻印/ 文件夹前段），全文录 docs/MECHANICS.md */

  /* 归档刻痕（璀璨银辉）：守密人每拥有 1 个钥令 → 物象/灵识研究深度 +1%（至多 50%），仅星辰篇生效。
   * 钥令数值口径（Yogens.val）经此取深度；R 命轮效果变更（维度影像造物出现率）未建模——造物系统 T50 */
  effDepths() {
    const bonus = this.starEnv ? 1 + Math.min(50, this.keeperYogenCount || 0) / 100 : 1;
    return {
      live: this.depths.live,
      physical: Math.round((this.depths.physical || 0) * bonus),
      spirit: Math.round((this.depths.spirit || 0) * bonus)
    };
  },

  /* 队伍平均银钥充能（算力满盈 300% / 狂气调和 200% 的转化基数） */
  avgSilverCharge() {
    const b = this.battle;
    if (!b || !b.allies.length) return 0;
    return b.allies.reduce((s, a) => s + ((a.stats && a.stats.silverKeyCharge) || 0), 0) / b.allies.length;
  },

  /* 算力满盈：战斗中当前算力 > 12 时，超出的每点 → 300% 队伍平均银充的银钥能量。
   * 所有加算力的路径（卡牌 energy op / 钥令 energy op）在星辰篇调用；沙盒手改不触发 */
  clampEnergyStar() {
    const b = this.battle;
    if (!b || !this.starEnv || (b.energy || 0) <= 12) return 0;
    const over = b.energy - 12;
    b.energy = 12;
    const per = Math.round(3 * this.avgSilverCharge());
    const gain = per * over;
    b.silver += gain;
    Log.add(`⭐ 算力满盈：算力 ${12 + over} > 12，超出 ${over} 点 → 银钥 +${gain}（300%×平均银充 ${this.avgSilverCharge().toFixed(1)}=${per}/点）`, "good");
    return gain;
  },

  /* 死亡抵抗（T48②）：队伍受致命伤（hp 将 ≤0）时 roll 队伍死抗总和%（>100 按 100 封顶）。
   * 成功 → hp=1 存活 + 此后概率减半（deathResistChance 半衰）；失败 → hp 保持 0 由 checkEnd 判负。
   * 挂点=Damage.applyRawDamage 的 ally 分支（deal/中毒/余烬/触腕等所有伤害路径的统一落账口）。
   * 触发时依次调用 State.DEATH_RESIST_HOOKS（茉夏灵塑「触发死亡抵抗后获 50 狂气」等联动用） */
  tryDeathResist() {
    const b = this.battle;
    if (!b || b.team.hp > 0 || b.phase === "over") return false;
    const resist = Math.min(100, this.teamStats().deathResist || 0);
    if (resist <= 0) return false;
    b.deathResistChance = (b.deathResistChance != null) ? b.deathResistChance : 1;
    const chance = resist * b.deathResistChance;
    if (Math.random() * 100 < chance) {
      b.team.hp = 1;
      b.deathResistChance /= 2;
      Log.add(`<b style="color:var(--gold)">✨ 死亡抵抗触发！</b>队伍免于败北，保留 1 点生命（死抗 ${resist}%×系数${b.deathResistChance * 2} → 此后概率减半为 ×${b.deathResistChance}）`, "good");
      if (window.UIBoard) UIBoard.floatTeam("✨死亡抵抗", "heal");
      for (const h of (this.DEATH_RESIST_HOOKS || [])) { try { h(); } catch (e) { /* 钩子异常不阻断 */ } }
      return true;
    }
    Log.add(`<span class="warn-text">死亡抵抗判定失败（死抗 ${resist}% × 系数 ${b.deathResistChance}）</span>`, "sys");
    return false;
  },
  /* ===================== 星辰篇环境结束 ===================== */

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

  /* 队伍属性合计。**伤害强效/黑印/死亡抵抗/界域精通 = 各唤醒体之和**（用户 2026-10-02 攻略口径定案，
   * 旧「强效/黑印取平均」已改求和）；+ 造物队伍共享属性（队伍级仅计一次，不进个人面板——用户 2026-10-03 定案） */
  teamStats() {
    const b = this.battle;
    const TEAM_KEYS = ["realmMastery", "damageBoost", "blackImprint", "deathResist"];
    const sum = { realmMastery: 0, damageBoost: 0, blackImprint: 0, deathResist: 0, tabooKnowledge: this.tabooLevel() };
    /* 造物：死亡抵抗/界域精通/强效/黑印等队伍共享键直接进队伍属性（无战斗也计入顶栏）；
     * teamDamageBoost 为旧键名兼容。个人属性永不读造物（collectStatMods 无造物代码） */
    for (const rid of (DBF.relicDeck || [])) {
      const r = this.getRelic(rid);
      if (!r || !r.statMods) continue;
      for (const k of TEAM_KEYS) sum[k] += r.statMods[k] || 0;
      if (r.statMods.teamDamageBoost) sum.damageBoost += r.statMods.teamDamageBoost;
    }
    /* 关卡造物队伍静态键（T50：哭泣烟斗强效/蒙尘缝纫机界域等，探索内全局） */
    if (typeof LevelRelics !== "undefined") {
      const lr = LevelRelics._teamSum();
      for (const k of TEAM_KEYS) sum[k] += lr[k] || 0;
    }
    if (!b) {
      for (const k of TEAM_KEYS) sum[k] = Math.round(sum[k] * 10) / 10;
      return sum;
    }
    for (const a of b.allies) {
      sum.realmMastery += a.stats.realmMastery;
      sum.damageBoost += a.stats.damageBoost;
      sum.blackImprint += a.stats.blackImprint;
      sum.deathResist += a.stats.deathResist;
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
  levelRelicDeck: [],     // 关卡造物携带（T50：探索内获得，作用域同 usedYogensExplore——探索边界清空）
  /* ---- 星辰篇环境（T48，源图=造物与刻印/「关卡篇章效果说明」2026-10-05）----
   * starEnv=true 时启用「键能调和」（算力调和/算力满盈/狂气调和）与「璀璨银辉」
   * （银钥觉醒每回合1次+保留/键能超载/归档刻痕）；开关在钥令面板切换（非星辰关卡保持关闭） */
  starEnv: false,
  keeperYogenCount: 0,    // 归档刻痕输入：守密人拥有的钥令数（0~50，仅星辰篇生效）
  DEATH_RESIST_HOOKS: [], // 死亡抵抗触发钩子（茉夏灵塑「触发后获50狂气」等联动用，静态注册不进快照）
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
      /* ---- 星辰篇环境（T48）---- */
      energyTune: 0,                            // 算力调和层数（本回合出牌>10 张后每张+1；后续出牌算力消耗+1）
      playedThisTurn: 0,                        // 本回合已打出指令卡数（算力调和触发计数）
      burstUsedThisTurn: [],                    // 本回合已释放狂气爆发的 uid（狂气调和回合末未爆发→银钥）
      silverAwakenThisTurn: 0,                  // 星辰篇银钥觉醒每回合 1 次计数
      deathResistChance: 1,                     // 死亡抵抗当前概率系数（触发一次 ×1/2，startBattle 重置）
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
    this.levelRelicDeck = [];      // T50：关卡造物=探索内，重置即清
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
    Log.add(`添加唤醒体：${def.name}（Lv${u.level}，体质 ${u.stats.constitution}（生命 ${u.maxHp}）/ 攻击 ${u.stats.attack} / 防御 ${u.stats.defense}${u.stats.damageBoost ? ` / 强效 ${u.stats.damageBoost}%` : ""}${saved && !this.whale ? "，已应用保存配置" : ""}）`, "sys");
    this.notify();
    return u;
  },

  /* 氪佬：单个唤醒体按理论最高配置（养成全满）；命轮/密契不自动装（用户 2026-10-03 定案，
   * 部件详情静默满配曾导致「槽位空却有加成」的观感——装备一律由玩家自己配） */
  maxOut(a) {
    if (!a) return;
    const cap = this.levelCap(a);
    a.level = cap >= 90 ? 90 : cap;
    a.personaLv = 12; a.cardLv = 6;
    a.spiritAdaptLv = 10; a.innerGridLv = 5; a.omenLv = 12;
    a.gukuMax = 200;
    a.fwStacks = [12, 12];
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
