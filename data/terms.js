/* =========================================================
 * 忘却前夜战斗模拟器 · 词条机制知识库（社区研究线索汇总）
 * ---------------------------------------------------------
 * 本文件是「词条叠加规则」的研究记录：每条标注当前认知的
 * 叠加规则、推测公式、验证方法与来源。confirmed=false 的条目
 * 会出现在「机制面板 → 待确认清单」中，实测后请回填并更新
 * docs/MECHANICS.md。
 *
 * 【schema: term】
 *   id / name / appliesTo(card|character|global)
 *   stack     "add"加算 / "mul"乘算 / "unknown"未确认
 *   formula   当前认知的公式位置与推测
 *   howToTest 建议实测方法（可用本模拟器对比数值）
 *   confirmed 是否已实测确认
 *   source    结论出处
 * ========================================================= */

if (!window.DBF) window.DBF = {};
window.DBF.version = "0.1";
window.DBF.terms = [

  {
    id: "term_strength",
    name: "力量",
    appliesTo: "character",
    stack: "add",
    formula: "加算项：按点数直接加进伤害（如 +10 力量 = 伤害+10）。社区共识：力量不吃伤害强效放大，与百分比增伤分属不同区",
    confirmed: false,
    howToTest: "0力量打一张固定伤害卡记录数值 → 加N点力量再打，差值应恰为N（不受强效/增伤放大则证实独立加算项）",
    source: "巴哈姆特《命轮指南》(forum.gamer.com.tw bsn=78829)；官方公告以“X点力量/攻击力X%的力量”表述"
  },
  {
    id: "term_damage_boost",
    name: "伤害强效",
    appliesTo: "character",
    stack: "mul",
    formula: "推测：×(1+伤害强效%) 独立乘区，作用于卡牌基础伤害；巴哈结论“伤害强效吃不到力量加成”→ 位于力量加算之前",
    confirmed: false,
    howToTest: "同一张卡在 0% 与 8% 伤害强效下各打一次，比值应恰为 1.08；再叠力量看力量部分是否也被放大",
    source: "巴哈姆特《命轮指南》；萝坦等级1面板自带 伤害强效8%（gamekee）"
  },
  {
    id: "term_vul",
    name: "易伤",
    appliesTo: "global",
    stack: "unknown",
    formula: "推测：敌方侧独立乘区 ×(1+易伤%)。一测：+50%、不可叠层、可叠回合；V1.4.1.0公告出现“3层易伤”→ 现行可能已可叠层，多层是加算还是乘算待确认",
    confirmed: false,
    howToTest: "挂1层/3层易伤分别打同一张卡，对比 1.5×/1.5+1.0×(加算) 还是 1.5³(乘算)",
    source: "NGA一测系统解析帖；灰机wiki V1.4.1.0公告"
  },
  {
    id: "term_weak",
    name: "虚弱",
    appliesTo: "global",
    stack: "unknown",
    formula: "推测：攻方侧独立乘区 ×(1-33%/层)。可叠层（回合结束移除1层），多层递减方式待确认",
    confirmed: false,
    howToTest: "挂1层/2层虚弱打木桩，对比 -33%/-66% 还是递减",
    source: "NGA一测系统解析帖"
  },
  {
    id: "term_empower",
    name: "强化（造成伤害提高）",
    appliesTo: "character",
    stack: "unknown",
    formula: "官方文本：造成的伤害提高25%。与力量/易伤的乘区关系待确认",
    confirmed: false,
    howToTest: "先打基准 → 强化+力量 → 强化+易伤，逐对分离乘区顺序",
    source: "gamekee V1.5前瞻(625544)官方文本"
  },
  {
    id: "term_crit",
    name: "暴击/暴击伤害",
    appliesTo: "character",
    stack: "mul",
    formula: "面板有暴击率/暴击伤害（等级1：5%/50%）。推测独立乘区 ×(1+爆伤%)。框架阶段未实现暴击判定，仅做数值记录",
    confirmed: false,
    howToTest: "游戏内记录暴击前后数值比（是否恰为 1+爆伤%）",
    source: "gamekee 角色状态面板"
  },
  {
    id: "term_full_formula",
    name: "完整伤害公式（社区线索）",
    appliesTo: "global",
    stack: "unknown",
    formula: "TapTap攻略转述：`(初始伤害 × 队伍伤害强效 × 命轮提升 × 斩首 + 力量) × 爆伤 × 其他乘区`——力量为加算项，强效/命轮/斩首/爆伤为乘区。原文未核对，仅供参考",
    confirmed: false,
    howToTest: "以本模拟器管线逐区对比游戏内实测值，反推每个乘区的位置",
    source: "TapTap 达芙戴尔攻略（摘要转述，可信度中低）；B站 BV1AgxHzjEKS 伤害乘区视频（未文本化）"
  }
];
