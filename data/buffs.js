/* =========================================================
 * 忘却前夜战斗模拟器 · buff / debuff 定义（真实数据）
 * ---------------------------------------------------------
 * 【schema: buff】
 *   id / name / kind("buff"|"debuff")
 *   stack     同名多来源间的叠加规则: "add"加算 / "mul"乘算 / "unknown"未确认
 *             （同名多层 = 层内加算合并为单个修正值，再按本字段参与乘区）
 *   maxStacks 最大层数（null=无限/未确认）
 *   defaultDuration 默认持续回合（null=直到移除）
 *   effect    管线作用字段 → 每层默认数值。可用字段：
 *             damageFlat 力量类：直接加到伤害的点数（加算项，社区共识）
 *             damagePct  增伤/减伤状态（乘区，叠法待确认）
 *             takenPct   易伤类：目标受到伤害+%（乘区）
 *             shieldPct  脆弱类：获得护盾±%（作用于护盾获得量）
 *             dotFlat    中毒类：回合结束每层固定伤害
 *   per可变   点数型 buff（如力量）每层数值可由卡牌传入覆盖实例默认
 *   confirmed 叠加/数值是否已实测确认
 * 数据来源：gamekee 新手指南/角色页（游戏内文本）、NGA 一测系统解析帖、
 *          灰机wiki 更新公告、巴哈姆特命轮指南（见 docs/MECHANICS.md）
 * ========================================================= */

window.DBF.buffs = [

  { id: "buff_guard", name: "戒备", kind: "buff", stack: "add", maxStacks: null, defaultDuration: null,
    shared: true,   // T32 实测批（2026-10-02 用户口径）：全队共享
    effect: {},
    desc: "戒备：全队共享状态（数值机制未建模，用户 2026-10-02 口述确认共享属性）",
    icon: "🛡", onEnd: null, confirmed: false,
    source: "用户口述 2026-10-02",
    notes: "占位 def：仅挂载与共享传播，效果数值待游戏内实测后回填" },


  /* ---------- 增益 ---------- */
  {
    id: "buff_damage_immune",
    name: "免疫伤害",
    kind: "buff",
    stack: "add",
    maxStacks: null,
    defaultDuration: null,
    effect: {},   // 机制未建模：词条=非穿刺伤害无效、回合末移除（2026-09-26）；伤害管线未接入，现为状态展示
    desc: "免疫非穿刺伤害（机制未建模，仅状态展示——伤害结算未读取此状态）",
    icon: "🛡",
    onEnd: null,
    confirmed: false,
    source: "游戏内词条（用户 2026-09-26）；载体案例：石之眼阶段转换保护（phases.buffs，T34）",
    notes: "转阶段自动挂载（turn.js checkEnd 读 phases[].buffs）"
  },
  {
    id: "buff_strength",
    shared: true,   // T32 实测批（2026-10-02 用户口径）
    name: "力量",
    kind: "buff",
    stack: "add",
    maxStacks: null,
    defaultDuration: null,
    effect: { damageFlat: 1 },   // 每层默认1点；卡牌可传具体点数（如骑士热诚=攻×3.75%）
    desc: "伤害获得加成（点数型，直接加算进伤害；社区共识为加算项，不吃伤害强效放大）",
    icon: "💪",
    onEnd: null,
    confirmed: false,
    source: "巴哈姆特命轮指南+官方公告（“获得攻击力4%的力量”）",
    notes: "有永久/临时力量之分（临时力量回合末消失，框架暂不区分）；中后期几十上百点是常态"
  },
  {
    id: "buff_empower",
    name: "强化",
    kind: "buff",
    stack: "unknown",
    maxStacks: null,
    defaultDuration: 2,
    effect: { damagePct: 0.25 },
    desc: "造成的伤害提高25%（官方公告文本）",
    icon: "🔥",
    onEnd: null,
    confirmed: false,
    source: "gamekee V1.5前瞻(625544)官方文本",
    notes: "与力量的关系（独立乘区还是加算项）待实测"
  },

  /* ---------- 减益 ---------- */
  {
    id: "debuff_vul",
    shared: true, roundLayers: true,   // T32 实测批（2026-10-02 用户口径）
    name: "易伤",
    kind: "debuff",
    stack: "duration",
    maxStacks: null,
    defaultDuration: 2,
    effect: { takenPct: 0.50 },
    desc: "承受的主动伤害和触腕伤害提高50%，回合结束时移除1层（游戏内词条实测 2026-09-23，确认按层衰减）",
    icon: "💔",
    onEnd: null,
    confirmed: true,
    source: "游戏内词条（用户采集 2026-09-23）",
    notes: "仅加成主动+触腕伤害；层数=持续回合数、数值恒+50%不随层叠加（用户确认 2026-09-28，引擎 stack:\"duration\" 已实装）"
  },
  {
    id: "debuff_weak",
    shared: true, roundLayers: true,   // T32 实测批（2026-10-02 用户口径）
    name: "虚弱",
    kind: "debuff",
    stack: "duration",
    maxStacks: null,
    defaultDuration: 2,
    effect: { damagePct: -0.25 },
    desc: "造成的主动和触腕伤害降低25%；层数只影响持续时间，不影响数值（词条实测 2026-09-26），回合结束移除1层",
    icon: "🔻",
    onEnd: null,
    confirmed: true,
    source: "游戏内词条（用户采集 2026-09-23）",
    notes: "数值由一测 -33% 修正为现行 -25%；层数=持续回合（用户再确认 2026-09-28，引擎已实装）"
  },
  {
    id: "debuff_fragile",
    shared: true, roundLayers: true,   // T32 实测批（2026-10-02 用户口径）
    name: "脆弱",
    kind: "debuff",
    stack: "duration",
    maxStacks: null,
    defaultDuration: 2,
    effect: { shieldPct: -0.25 },
    desc: "获得的护盾降低25%，回合结束移除1层（层数=持续回合数；游戏内实测 2026-09-25，**修正**一测值-33%→现行-25%）",
    icon: "🥀",
    onEnd: null,
    confirmed: true,
    source: "游戏内词条（用户采集 2026-09-25）",
    notes: "易伤/虚弱/脆弱的层数均为持续回合数，不影响数值（用户再确认 2026-09-28，引擎已实装）"
  },
  {
    id: "debuff_poison",
    name: "中毒",
    kind: "debuff",
    stack: "add",
    maxStacks: null,
    defaultDuration: 2,
    effect: { dotFlat: 3 },   // 每层数值依来源卡牌，可在添加时覆盖
    desc: "回合结束后，受到（当前中毒层数的）纯粹伤害（无法暴击、不视为对应唤醒体造成）；「N点中毒」=「N层中毒」（用户确认 2026-09-25）",
    icon: "☠",
    onEnd: "damageFlat",
    confirmed: true,
    source: "游戏内词条（用户采集 2026-09-23/25）",
    notes: "点=层（已确认）；每层数值依施加来源（引擎 per 覆盖保留）"
  },
  {
    id: "debuff_strength_down",
    shared: true,   // T32 实测批（2026-10-02 用户口径）
    name: "力量降低",
    kind: "debuff",
    stack: "add",
    maxStacks: null,
    defaultDuration: null,
    effect: { damageFlat: -1 },
    desc: "力量降低（点数型负修正，如拉蒙娜「攻势推演」降低4点）",
    icon: "⬇",
    onEnd: null,
    confirmed: false,
    source: "gamekee 拉蒙娜角色页",
    notes: "与力量同区聚合（damageFlat 加算）"
  },

  /* ---------- 2026-09-23 游戏内词条批量录入（数值文本确认，结算未实现） ---------- */
  { id: "buff_riposte", name: "反击", kind: "buff", stack: "add", maxStacks: null, defaultDuration: null,
    effect: { riposteFlat: 1 }, confirmed: true,
    desc: "承受主动伤害时，对伤害来源造成等量层数的纯粹伤害（游戏内词条 2026-09-23）",
    icon: "🗡", onEnd: null, source: "游戏内词条（用户采集）", notes: "纯粹伤害=无法暴击、不视为唤醒体造成；引擎结算未实现" },
  { id: "debuff_crush",
    shared: true, roundLayers: true,   // T32 实测批（2026-10-02 用户口径） name: "重创", kind: "debuff", stack: "add", maxStacks: null, defaultDuration: 2,
    effect: { healPct: -0.25 }, confirmed: true,
    desc: "受到的生命回复降低25%，回合结束时移除1层（游戏内词条 2026-09-23）",
    icon: "🩹", onEnd: null, source: "游戏内词条（用户采集）", notes: "治疗降低类；healPct 引擎未实现" },
  { id: "buff_reinforce", name: "加固", kind: "buff", stack: "add", maxStacks: null, defaultDuration: null,
    effect: { takenPct: -0.01 }, confirmed: true,
    desc: "承受的所有伤害降低 层数%（游戏内词条 2026-09-23）",
    icon: "🛡", onEnd: null, source: "游戏内词条（用户采集）", notes: "通用减伤；叠加与乘区位置未实测" },
  { id: "debuff_infatuation", name: "痴醉", kind: "debuff", stack: "add", maxStacks: null, defaultDuration: null,
    effect: {}, confirmed: true,
    desc: "被「相许」施加；「夺魄」移除时每层造成1%目标最大生命的纯粹伤害并触发其40%中毒（2026-09-23）",
    icon: "💜", onEnd: null, source: "游戏内词条（用户采集）", notes: "痴醉本身无独立效果（引爆器为夺魄）" },
  { id: "debuff_murmur", name: "呓语", kind: "debuff", stack: "add", maxStacks: 1, defaultDuration: 1,
    effect: { damagePct: -0.65 }, confirmed: true,
    desc: "造成的主动伤害减少65%，攻击次数翻倍（旺达「呓语回音」施加，2026-09-23）",
    icon: "🌙", onEnd: null, source: "游戏内词条（用户采集）", notes: "伤害-65%与次数×2并存；引擎未实现" },
  { id: "debuff_seal", name: "封印", kind: "debuff", stack: "add", maxStacks: null, defaultDuration: null,
    effect: {}, confirmed: true,
    desc: "被封印的唤醒体无法释放狂气爆发（游戏内词条 2026-09-23）",
    icon: "⛓", onEnd: null, source: "游戏内词条（用户采集）", notes: "引擎未实现" },
  { id: "debuff_emptiness", name: "空虚", kind: "debuff", stack: "add", maxStacks: null, defaultDuration: null,
    effect: {}, confirmed: true,
    desc: "每层降低回合结束时自然回复的狂气 1 点（游戏内词条 2026-09-23）",
    icon: "🕳", onEnd: null, source: "游戏内词条（用户采集）", notes: "引擎未实现" },
  { id: "debuff_bleed", name: "出血", kind: "debuff", stack: "add", maxStacks: null, defaultDuration: null,
    effect: { dotFlat: 1 }, onEnd: "damageFlatPurge", confirmed: true,
    desc: "回合结束时受到等量层数的纯粹伤害并移除该状态（血链·希洛系，词条 2026-09-22）",
    icon: "🩸", source: "游戏内词条（用户采集）", notes: "与中毒不同：结算即清空；引擎已接 tickTurnEnd purge 分支" },
  { id: "buff_ember", name: "旧日余烬", kind: "debuff", stack: "add", maxStacks: null, defaultDuration: null,
    effect: {}, burnOnHit: true, confirmed: true,
    desc: "承受主动伤害后移除等量层数并失去300%移除量的生命，其他伤害移除一半；层数每回合重置（蜕化者系，词条 2026-09-23）",
    icon: "🔥", onEnd: null, source: "游戏内词条（用户采集）", notes: "引擎已接 deal 引爆钩子（burnOnHit）；每回合重置到初始层未实现" },

  /* ---------- 2026-09-28 钥令临时属性（回合末消失；目标范围按全员实现，待实测） ---------- */
  { id: "buff_crit_up", name: "临时暴击率", kind: "buff", stack: "add", maxStacks: null, defaultDuration: 1,
    effect: { critRateFlat: 1 }, confirmed: false,
    desc: "临时提高暴击率（点数型，回合结束消失）。来源：钥令/春天的献诗月颂等",
    icon: "🎯", onEnd: null, source: "钥令图鉴（用户采集 2026-09-28）", notes: "引擎经 critRateFlat 并入 deal 暴击判定；与面板暴击率加算" },
  { id: "buff_critdmg_up", name: "临时暴击伤害", kind: "buff", stack: "add", maxStacks: null, defaultDuration: 1,
    effect: { critDmgFlat: 1 }, confirmed: false,
    desc: "临时提高暴击伤害（点数型，回合结束消失）。来源：钥令/空心人",
    icon: "💥", onEnd: null, source: "钥令图鉴（用户采集 2026-09-28）", notes: "引擎经 critDmgFlat 并入暴击乘区" },
  { id: "buff_boost_up", name: "临时伤害强效", kind: "buff", stack: "add", maxStacks: null, defaultDuration: 1,
    effect: { damageBoostPct: 1 }, confirmed: false,
    desc: "临时提高伤害强效（点数型，回合结束消失）。来源：钥令/罗网轮转",
    icon: "✨", onEnd: null, source: "钥令图鉴（用户采集 2026-09-28）", notes: "引擎经 damageBoostPct 并入伤害强效区（与面板强效加算）" },
  { id: "buff_strike_tmp", name: "临时打击伤害", kind: "buff", stack: "add", maxStacks: null, defaultDuration: 1,
    effect: { strikeFlat: 1 }, confirmed: true,
    desc: "临时提高打击伤害（固定点数型，每层+56 点，回合结束消失）。来源：狂戮至世界尽头——打出任意打击后+56/层（2026-10-01 用户实测修正：112 为点数非百分比）",
    icon: "⚔", onEnd: null, source: "命轮实测（T8）", notes: "引擎经 strikeFlat 在 ③力量区后按打击卡加算（非乘区）" }
];
