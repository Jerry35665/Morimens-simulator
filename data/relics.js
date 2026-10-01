/* =========================================================
 * 忘却前夜战斗模拟器 · 造物 + 角色养成选项（真实数据）
 * ---------------------------------------------------------
 * 【造物】幻梦深潜/融灾禁区 roguelike 遗物，探索内生效（官方617244）。
 *   window.DBF.relics      全量定义（效果多为战斗触发逻辑，框架先记录文字）
 *   window.DBF.relicDeck   当前携带（顶栏造物栏）
 *
 * 【灵塑适性】星辰天赋（仅星辰篇生效），等级1~8，每级+3%体质/攻击/防御
 *   【灰机wiki摘要，攻略转述——数值待实测核实】
 * 【疯狂预兆】调查等级30解锁的天赋，每角色词条不同，等级1~3；
 *   通用占位效果=战斗开始获 5×等级 狂气（按示例角色，待逐角色替换）
 * 【内在灵格】V2.5.1.0 起常驻唤醒体可强化体质/攻击/防御，数值待确认
 *   （框架占位：每级+2%三维，标注待确认）
 * ========================================================= */

window.DBF.relics = [
  {
    id: "relic_gold_guide",
    name: "黄金向导",
    effect: "回合开始获12护盾。",
    statMods: {},
    confirmed: true,
    source: "gamekee 造物刻印调整(617244)", notes: ""
  },
  {
    id: "relic_sweet_ink",
    name: "甜蜜墨水",
    effect: "额外使最大生命+51。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: "队伍总血+51（框架暂未并入，血上限手动调整可模拟）"
  },
  {
    id: "relic_prism",
    name: "三棱镜",
    effect: "超维回合额外获40点临时力量。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_beautiful_moment",
    name: "美丽瞬间",
    effect: "额外使[打击]暴击伤害+20%。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_doctor_case",
    name: "医生手提箱",
    effect: "战斗结束回复70生命。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_broken_face",
    name: "残缺面孔",
    effect: "获狂气30→35。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: "调整计划原文（35为新值）"
  },
  {
    id: "relic_old_puzzle",
    name: "老旧拼图",
    effect: "基础伤害87→174；打出第21次[打击]时对所有敌人造成4785点伤害。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_faded_photo",
    name: "褪色照片",
    effect: "偷取力量8→16。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_suspicious_salve",
    name: "可疑的药膏",
    effect: "基础中毒10→30层，每回合+5→+15。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_dear_baby",
    name: "亲爱的宝贝",
    effect: "战斗开始胚胎融合25%→50%，狂气≥50%即可触发。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_butterfly_specimen",
    name: "蝴蝶标本",
    effect: "治疗时获护盾16→20（每回合限3次）。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  },
  {
    id: "relic_memphis_mirror",
    name: "孟菲斯仪式镜",
    effect: "基础暴击率15%→10%，仅打出指令卡才额外加。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: "削弱后数值"
  },
  {
    id: "relic_road_skeleton",
    name: "行道之骸",
    effect: "敌人受伤+50%（由翻倍削弱）。",
    statMods: { enemyTakenPct: 50 },
    confirmed: true,
    source: "gamekee(617244)", notes: "敌方易伤类；enemyTakenPct 字段暂未并入管线，仅记录"
  },
  {
    id: "relic_snake_molt",
    name: "怪蛇残蜕",
    effect: "打出指令卡获死亡抵抗8%、临时力量10（削弱后）。",
    statMods: { deathResist: 8 },
    confirmed: true,
    source: "gamekee(617244)", notes: "队伍级 deathResist 已并入队伍属性"
  },
  {
    id: "relic_color_straitjacket",
    name: "变色拘束服",
    effect: "首领战提供的虚弱与易伤1→2回合。",
    statMods: {},
    confirmed: true,
    source: "gamekee(617244)", notes: ""
  }
];

/* 当前携带的造物（顶栏造物栏） */
window.DBF.relicDeck = ["relic_snake_molt"];

/* 灵塑适性：星辰天赋，等级1~10，每级+3%体质/攻击/防御；高等级另有特殊效果（待逐级录入） */
window.DBF.spiritAdaptMaxLv = 10;
window.DBF.spiritAdaptPerLv = { hpPct: 3, attackPct: 3, defensePct: 3 };
window.DBF.spiritAdaptNote = "等级1：该唤醒体体质、攻击、防御提高3%，并使首次打出「灵感」获得加力效果；逐级+3%；高等级附特殊效果（如首次打出灵知觉醒获350银钥能量）——待逐级录入，仅星辰篇生效";

/* 内在灵格：共5级，每级相当于角色属性成长 +2 等级（按 effLevel=等级+2×灵格 计算基础属性） */
window.DBF.innerGridMaxLv = 5;
window.DBF.innerGridNote = "每级使基础属性按 +2 等级计算（等效等级=等级+2×灵格级）；上限数值待实测核实";

/* 疯狂预兆：12级，全角色通用效果（当前占位：战斗开始获5×等级狂气） */
window.DBF.omenMaxLv = 12;
window.DBF.omenNote = "全角色通用；当前占位效果=战斗开始获5×等级狂气，实际通用效果待实测确认";
