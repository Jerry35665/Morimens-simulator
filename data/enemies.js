/* =========================================================
 * 忘却前夜战斗模拟器 · 怪物定义
 * ---------------------------------------------------------
 * ⚠ 灰机wiki 官方说明：因 buff 加成及普通/困难模式数值不同，
 *   wiki 暂只记录怪物出招机制（段数、效果），不收录具体数值。
 *   → 怪物的 HP/攻击数值需要你在游戏内实测后录入本文件
 *     （这正是本模拟器的用途：实测数值 → 回填 → 验证公式）。
 *
 * 【schema: enemy】
 *   id / name
 *   tier  "boss"首领 / "normal"普通
 *   hp / attack  按难度数值 { normal, hard }（null=待实测，添加时需手动填）
 *   actions      循环行动（框架按顺序循环；实际怪物AI按意图系统，待确认）
 *   passives     被动/机制文字（原样转录）
 *   source / notes
 * ========================================================= */

window.DBF = window.DBF || {};

/* 融灾难度体系（2026-09-25 游戏更新）：7 难度 n1-n7，旧「普通/困难/噩梦/癫狂」= n1-n4。
 * 键名沿用 normal/hard/nightmare/insane（=n1/n2/n3/n4），n5-n7 键名直接用 "n5"/"n6"/"n7"。
 *
 * 新版难度系数表：
 *   n1-n4（2026-09-26，蜕化者/亚兰/侍从/灰烬融蚀体 四怪交叉验证）：
 *     HP类  1 : 3.163 : 9.390 : 23.75；伤害类 1 : 2.037 : 3.943 : 6.37
 *   n5-n7（2026-09-28 用户实测波1蜕化者七档：HP 1774→105k/247k/560k、攻击 33→314/403/485；
 *     按 n4→n7 步进比 2.514/2.352/2.267（HP）、1.474/1.283/1.204（伤害）链入，与直录差 ≤1.5% 设计浮动）：
 *     HP类  59.7 : 140.5 : 318.5；伤害类 9.39 : 12.05 : 14.51
 * ⚠ 版本更新重做了数值曲线：旧版（9/23 采集）系数 hp 1/10.44/69.6/221.3、dmg 1/4.43/10.1/13.65 已作废。
 * ⚠ 融灾每两周一轮（上期 9/14 起，本期 9/28 起）；n1-n4 = 2.6.1 数值在 2.6 版提前实装，2.6.1 后维持不变（用户确认）。
 *   旧轮次数据无法复核的按「不合理的舍弃」原则处理（如歇斯底里患者 n1-n3 同值 18988 已废弃）。
 * ✅ 本期波1蜕化者 HP 疑点已判明（2026-10-01 复采：1774 / n1 普通战斗格）——非精英格非本期修正，就是局内浮动（观测带 1525~1958，±15%）。
 * ⚠ 系数表精度补充（2026-10-01 五波 n1-n7 对照）：各怪实测总比在表 ±15% 内浮动（冷蛛群 312/灰烬 385/波3 293/波4 298/波5 256 vs 表 318.5）——蜕化者本身偏高（367）拉高了表值；n5-n7 伤害段普遍偏低 5~10%+（冷蛛群/灰烬同构互证）。表仍作缺档回落估算，直录为准。
 *   难度倍率阶梯跨波一致（n1→n2 ×3.2~3.6 → n6→n7 ×2.2~2.3）；HP 与等级强相关非纯函数（每级约+9~13%、n6/n7 尾段 ~16%/级；种类基数为主因子）；攻击独立曲线（每级 6~7% 递减至 3~4%）。 */
window.DBF.enemyDiff = {
  normal:    { hp: 1,     dmg: 1 },
  hard:      { hp: 3.163, dmg: 2.037 },
  nightmare: { hp: 9.390, dmg: 3.943 },
  insane:    { hp: 23.75, dmg: 6.37 },
  n5:        { hp: 59.7,  dmg: 9.39 },
  n6:        { hp: 140.5, dmg: 12.05 },
  n7:        { hp: 318.5, dmg: 14.51 }
};

window.DBF.enemies = [

  {
    id: "enemy_dummy",
    name: "木桩（沙盒用）",
    tier: "normal",
    hp: { normal: 1000, hard: 1000 },
    attack: { normal: 0, hard: 0 },
    actions: [],
    passives: ["不行动，用于测量伤害数值"],
    source: "模拟器自建",
    notes: "测试词条数值的靶子：把高血量怪挂进来，出牌看日志里的计算明细"
  },

  /* ===== 游戏内实测怪物（用户采集 2026-09-23，融灾 wave1，四难度全覆盖）===== */
  {
    id: "enemy_molted_a",
    name: "蜕化者A",
    tier: "normal",
    hp: { normal: 1525, hard: 4823, nightmare: 14316, insane: 36214, n5: 105000, n6: 247000, n7: 560000 },
    attack: { normal: 33, hard: 67, nightmare: 130, insane: 210, n5: 314, n6: 403, n7: 485 },
    actions: [
      { name: "螯针", type: "attack", value: { normal: 33, hard: 67, nightmare: 130, insane: 210, n5: 314, n6: 403, n7: 485 }, times: 3 },
      { name: "认知汲取", type: "special", note: "将1张「巢群捕食」置入我方手中，所有唤醒体暴击率-10%（未建模）" },
      { name: "螯针", type: "attack", value: { normal: 33, hard: 67, nightmare: 130, insane: 210 }, times: 3 },
      { name: "毒牙", type: "attack", value: { normal: 30, hard: 62, nightmare: 120, insane: 194 }, debuff: { buffId: "debuff_weak", stacks: 1, duration: 1 } }
    ],
    passives: [
      "旧日余烬（开局自带，新版 73/242/716/1811 层按难度）：承受主动/触腕伤害后移除等量并失去300%移除量生命，其他伤害移除一半；每回合重置",
      "巢群共感-传承1层：战斗开始时降低所有唤醒体暴击率10%；死亡后其他友方获得力量与旧日余烬（新版 8力/15层 → 16/49 → 30/144 → 49/363 按难度）"
    ],
    source: "游戏内实测（旧版 9/22-23；新版 n1-n4 = 2026-09-25/26 采集，lv 38/52/62/72；n5-n7 = 2026-09-28 本期波1实测，HP 105k/247k/560k 为 K 显示 ±千位）",
    notes: "⚠ 版本更新（融灾改7难度）后数值曲线重做：旧版 1753/18304/122000/388000 已作废（notes 并记）；新版两档同时采集两只同种怪（A/B 起手意图不同）；出场5回合后意图变凝视；⚠ 本期（9/28起新一轮）波1 HP 七档实测 1774/5583/16523/41760/105k/247k/560k——n1-n4 比本表高约15%（攻击 33/68/131/213 完全一致），疑精英格或本期修正，待复采判明；✅ 2026-10-01 本期复采判明=局内浮动（1774 与 1958 均为 n1 普通战斗格，n1 浮动带扩至 1455~1958 ±15%）；巢群共感-传承数值亦浮动：8力/15层（表）、9力/18层、8力/20层 三组观测并记；螯针 36×3 变体（vs 表 33）同浮动；意图链「毒牙→螯针→认知汲取」「认知汲取→螯针→毒牙→螯针」两变体（认知汲取效果见 9/25 采集）"
  },
  {
    id: "enemy_molted_b",
    name: "蜕化者B",
    tier: "normal",
    hp: { normal: 1455, hard: 4601, nightmare: 13657, insane: 34546 },
    attack: { normal: 34, hard: 71, nightmare: 136, insane: 221 },
    actions: [
      { name: "毒牙", type: "attack", value: { normal: 32, hard: 65, nightmare: 126, insane: 204 }, debuff: { buffId: "debuff_weak", stacks: 1, duration: 1 } },
      { name: "螯针", type: "attack", value: { normal: 35, hard: 71, nightmare: 136, insane: 221 }, times: 3 },
      { name: "认知汲取", type: "special", note: "将1张「巢群捕食」置入我方手中，所有唤醒体暴击率-10%（未建模）" },
      { name: "螯针", type: "attack", value: { normal: 35, hard: 71, nightmare: 136, insane: 221 }, times: 3 }
    ],
    passives: [
      "旧日余烬（开局自带，新版 73/231/683/1728 层按难度）：承受主动/触腕伤害后移除等量并失去300%移除量生命，其他伤害移除一半；每回合重置",
      "巢群共感-传承1层：战斗开始时降低所有唤醒体暴击率10%；死亡后其他友方获得力量与旧日余烬（新版 8力/15层 → 17/47 → 32/137 → 51/346 按难度）"
    ],
    source: "游戏内实测（旧版 9/22-23；新版 n1-n4 = 2026-09-25/26 采集）",
    notes: "与蜕化者A同种异体（普通档 HP 1672 vs 1753、整体伤害+2，疑似个体等级差，待确认）；意图链以毒牙起手；噩梦/癫狂HP为显示值±千位"
  },
  {
    id: "enemy_corpse_splitter",
    name: "腐尸分殖体",
    tier: "normal",
    hp: { normal: 828, hard: 2618, nightmare: 7771 },
    attack: { normal: 9, hard: 18, nightmare: 35 },
    actions: [
      { name: "诅咒", type: "buff", buffId: "debuff_poison", stacks: 1, per: { normal: 9, hard: 24, nightmare: 35 }, target: "enemy" },
      { name: "钉刺", type: "attack", value: { normal: 9, hard: 18, nightmare: 35 }, debuff: { buffId: "debuff_weak", stacks: 1, duration: 1 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 7, hard: 13, nightmare: 25 }, times: 2 },
      { name: "自爆", type: "attack", value: { normal: 29, hard: 58, nightmare: 112 }, selfDestruct: true }
    ],
    passives: [
      "腐尸的分食1层：回合开始时，若存在其他友方，失去X点生命，为生命最高友方增加1层死亡抵抗和X点力量（新版 207/9 → 655/18 → 1943/35 按难度）",
      "食尸鬼自爆1层：回合结束时，若场上没有其他友方，切换意图为自爆"
    ],
    source: "游戏内实测（旧版 9/22-23；新版 n1-n3 = 2026-09-25/26 采集，lv 38/52/62）",
    notes: "⚠ 版本更新后重采：新版 n1 828（旧版 952）、n2 2618（旧 9935）、n3 7771（旧 66278），n4 未采；n2 批该怪标【待召唤】（食尸鬼队长召唤）；旧版招式数值见 git 历史"
  },
  {
    id: "enemy_deep_splitter",
    name: "深海分殖体",
    tier: "normal",
    hp: { normal: 674, hard: 2130, nightmare: 6321, insane: 15989 },
    attack: { normal: 20, hard: 41, nightmare: 80, insane: 130 },
    actions: [
      { name: "海祭", type: "attack", value: { normal: 20, hard: 41, nightmare: 80, insane: 130 }, note: "若未被完全格挡，将1张「窒息」洗入我方抽牌堆（未建模）" },
      { name: "自爆", type: "attack", value: { normal: 32, hard: 66, nightmare: 128, insane: 208 }, selfDestruct: true }
    ],
    passives: [
      "深海的分食1层：回合开始时，若存在其他友方，失去X点生命，为生命最高友方增加1层死亡抵抗和X点毒刃（新版 169/5 → 533/11 → 1581/20 → 3998/33 按难度）"
    ],
    source: "游戏内实测（旧版 9/22-23；新版 n1-n4 = 2026-09-25/26 采集，lv 38/52/62/72）",
    notes: "「窒息」衍生卡未建卡；版本更新重做数值（旧版 774/8082/53915/175000 已作废并记）；新版四档全采"
  },

  /* ===== 融灾新怪（用户采集 2026-09-25，普通 wave1，带 lv 字段）===== */
  {
    id: "enemy_water_child",
    name: "水之子",
    tier: "normal",
    hp: { normal: 474, hard: 1499, nightmare: 4448, insane: 10492 },
    attack: { normal: 18, hard: 36, nightmare: 70, insane: 99 },
    actions: [
      { name: "脆弱毒素", type: "buff", buffId: "debuff_fragile", stacks: 1, duration: 1, target: "enemy", note: "并施加 { normal: 11, hard: 22, nightmare: 42, insane: 68 } 点中毒（按难度，未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 18, hard: 36, nightmare: 70, insane: 99 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 36, hard: 72, nightmare: 140, insane: 226 } },
      { name: "脆弱毒素", type: "buff", buffId: "debuff_fragile", stacks: 1, duration: 1, target: "enemy", note: "并施加 { normal: 11, hard: 22, nightmare: 42, insane: 68 } 点中毒（按难度，未建模）" }
    ],
    passives: ["早夭：死亡后，对玩家施加1回合的易伤"],
    source: "游戏内实测（新版 n1-n4 = 2026-09-25/26 采集，lv 38/52/62/72）",
    notes: "两个无名伤害意图；脆弱毒素附带的按难度中毒未建模（数值写在 note）；n4 伤害/HP 略低于系数推算（99 vs 113、10492 vs 11254），roguelike 浮动"
  },
  {
    id: "enemy_ghoul_servant",
    name: "食尸鬼侍从",
    tier: "normal",
    hp: { normal: 2609, hard: 8251, nightmare: 24493, insane: 61957 },
    attack: { normal: 26, hard: 53, nightmare: 102, insane: 165 },
    actions: [
      { name: "盛宴", type: "special", note: "所有友方回复食尸鬼自身已损失生命值的10%，获得 { normal: 4, hard: 8, nightmare: 15, insane: 24 } 点力量（按难度，未建模）" },
      { name: "尸染", type: "attack", value: { normal: 26, hard: 53, nightmare: 102, insane: 165 }, times: 2, note: "附加15%伤害的中毒（未建模）" },
      { name: "掘墓", type: "attack", value: { normal: 110, hard: 224, nightmare: 434, insane: 705 }, debuff: { buffId: "debuff_crush", stacks: 1, duration: 2 } }
    ],
    passives: [
      "旧日余烬（开局自带，新版 131/413/1225/3098 层按难度）：承受主动/触腕伤害移除等量并失去300%移除量生命，其他伤害移除一半，每回合重置"
    ],
    source: "游戏内实测（新版 n1-n4 = 2026-09-25/26 采集，lv 38/52/62/72）",
    notes: "意图循环：盛宴→尸染→掘墓→盛宴；另采到尸染起手的变体（尸染→掘墓→盛宴/掘墓×2，9/26 癫狂 #42）"
  },
  {
    id: "enemy_yalan_warrior",
    name: "亚兰战士",
    tier: "normal",
    hp: { normal: 1353, hard: 4280, nightmare: 12705, insane: 32137 },
    attack: { normal: 113, hard: 231, nightmare: 447, insane: 726 },
    actions: [
      { name: "穿心一击", type: "attack", value: { normal: 113, hard: 231, nightmare: 447, insane: 726 }, debuff: { buffId: "debuff_crush", stacks: 1, duration: 2 } },
      { name: "掩护", type: "special", note: "与最前排的友方交换位置，获得 { normal: 440, hard: 1408, nightmare: 4184, insane: 10584 } 点护盾（按难度，换位未建模）" },
      { name: "蓄势突袭", type: "attack", value: { normal: 45, hard: 93, nightmare: 179, insane: 291 }, note: "与后排的友方交换位置，获得 { normal: 15, hard: 15, nightmare: 60, insane: 97 } 点力量（按难度，未建模）" },
      { name: "殊死一搏", type: "attack", value: { normal: 30, hard: 62, nightmare: 120, insane: 194 }, times: 3, note: "易伤自身1回合（未建模）" }
    ],
    passives: [],
    source: "游戏内实测（新版 n1-n4 = 2026-09-25/26 采集，lv 38/52/62/72）",
    notes: "换位机制未建模；掩护护盾值四档齐全"
  },
  {
    id: "enemy_ghoul_chief",
    name: "食尸鬼卫队长",
    tier: "normal",
    hp: { normal: 69422, hard: 210000, nightmare: 514000 },
    attack: { normal: 64, hard: 131, nightmare: 236 },
    actions: [
      { name: "尸染", type: "attack", value: { normal: 64, hard: 131, nightmare: 236 }, times: 2, note: "附加10%伤害的中毒（未建模）" },
      { name: "墓碑之嚎", type: "attack", value: { normal: 237, hard: 489, nightmare: 884 }, debuff: { buffId: "debuff_crush", stacks: 1, duration: 3 } },
      { name: "满月的呼唤", type: "attack", value: { normal: 79, hard: 163, nightmare: 295 }, note: "施加 { normal: 16, hard: 33, nightmare: 33 } 点中毒，并召唤2个「腐尸分殖体」（召唤未建模）" },
      { name: "盛宴", type: "buff", buffId: "buff_strength", stacks: { normal: 8, hard: 17, nightmare: 30 }, per: 1, target: "self" }
    ],
    passives: [
      "重创加深50层：造成的重创效果变为降低50%生命回复",
      "旧版 3472层 / 新版 n2 10515、n3 22391 旧日余烬（承受主动/触腕伤害移除等量并失去300%移除量生命，其他伤害移除一半，每回合重置）"
    ],
    source: "游戏内实测（旧版普通 9/25 lv41；新版 n2/n3 = 9/25-26 采集，lv 55/65）",
    notes: "⚠ 更名：曾误写「食尸鬼队长」，正确名「食尸鬼卫队长」（用户更正 2026-09-25）；normal 为更新前旧版值，新版 n1 未采集；hp 210k/514k 为显示值（>10万只显示K）"
  },
  {
    id: "enemy_corpse_splitter_summoned",
    name: "腐尸分殖体（召唤）",
    tier: "normal",
    hp: { normal: 6943, hard: 21029, nightmare: 53116 },
    attack: { normal: 15, hard: 14, nightmare: 24 },
    actions: [
      { name: "诅咒", type: "buff", buffId: "debuff_poison", stacks: 1, per: { normal: 7, hard: 14, nightmare: 24 }, target: "enemy" },
      { name: "钉刺", type: "attack", value: { normal: 15, hard: 14, nightmare: 24 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 5, hard: 10, nightmare: 17 }, times: 2 },
      { name: "自爆", type: "attack", value: { normal: 29, hard: 44, nightmare: 77 }, selfDestruct: true }
    ],
    passives: [
      "腐尸的分食1层：回合开始时，若存在其他友方，失去X点生命，为生命最高友方增加1层死亡抵抗和X点力量（旧版普通 1736/7；新版 n2 5258/14、n3 13279/24）"
    ],
    source: "游戏内实测（旧版普通 9/25；新版 n2/n3 = 2026-09-25 采集，lv 52/62）",
    notes: "⚠ 待召唤怪：由食尸鬼卫队长「满月的呼唤」召唤，非开局在场；两只同场可起手不同（诅咒起手 4 意图 / 10*2 起手 3 意图，9/25 困难 #24/#25）；数值显著强于野生腐尸分殖体"
  },
  {
    id: "enemy_dimension_student",
    name: "异维学子",
    tier: "normal",
    hp: { normal: 672, hard: 1913, nightmare: 5678, insane: 14361 },
    attack: { normal: 26, hard: 42, nightmare: 80, insane: 130 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 46, hard: 42, nightmare: 145, insane: 235 }, note: "获得2层屏障（屏障未建模）" },
      { name: "狂气窃取", type: "attack", value: { normal: 26, hard: 42, nightmare: 80, insane: 130 }, times: 2, note: "狂气最高的唤醒体失去50%狂气（未建模）" }
    ],
    passives: ["怨恨锁链1层（机制未采集）"],
    source: "游戏内实测（新版 n2-n4 = 2026-09-25/26 采集，lv 52/62/72；n1 = 2026-10-01 本期补采 lv41）",
    notes: "n1 已补采 672/26（2026-10-01，替换原 n2 占位）；「怨恨锁链」与「屏障」未建模"
  },
  {
    id: "enemy_ash_fused",
    name: "灰烬融蚀体",
    tier: "normal",
    hp: { normal: 931, hard: 3212, nightmare: 9024, insane: 24066, n5: 59515, n6: 146000, n7: 358000 },
    attack: { normal: 27, hard: 66, nightmare: 123, insane: 198, n5: 282, n6: 356, n7: 428 },
    actions: [
      { name: "流逝", type: "attack", value: { normal: 27, hard: 66, nightmare: 123, insane: 198, n5: 282, n6: 356, n7: 428 } },
      { name: "没入火烬", type: "special", note: "效果未采集" },
      { name: "再流逝", type: "attack", value: { normal: 14, hard: 56, nightmare: 54, insane: 143 }, times: 2 },
      { name: "无火之灰", type: "attack", value: { normal: 50, hard: 212, nightmare: 195 } }
    ],
    passives: ["「暗杀者」词缀（个体随机出现）：造成的伤害提高100%，失去生命后解除该状态，但获得50%最大生命的护盾（词条定案 2026-10-01 深夜）"],
    source: "游戏内实测（n1 = 2026-10-01 凌晨 lv38；n2-n7 = 同日第二波 lv 54/64/74/84/92/97，与冷蛛群同场）",
    notes: "n2-n7 直录（2026-10-01 第二波，替换 9/26 lv52 旧值 2137/112——**旧观测 notes 并记**：n2 2137、n3 6343 流逝107/再流逝54/无火之灰195、n4 16046；两批差 ~50% 疑 lv 个体差 52 vs 54）；同日白天场另有 lv41 个体 hp1000（流逝66/再流逝34×2/无火之灰120，战斗#5）——lv 个体差系列（38→41→52/54 全部并记）；深夜场：无lv个体 hp1881（暗杀者在身→伤害含+100%，流逝47/再流逝24×2/无火之灰85）+ **融合你我召唤体** lv50 hp1318/1757（11×2/39/21、24/12×2，均待召唤+暗杀者）；伤害序列 66/123/198/282/356/428 与冷蛛群 46/86/139/198/249/300 **相邻比完全同构**（1.86/1.61/1.42/1.26/1.20）——伤害系统性偏低系数表 5~10% 为普遍现象实锤；n6/n7 HP=K 显示±千位；别名「灰烬溶蚀体」（采集错别字）；本批意图起手=再流逝（表序=流逝起手，起手变体并记）"
  },

  /* ===== 融灾新怪（用户采集 2026-09-26，n1-n4 全采，战斗#3/#4/#7/#8/#9/#10）=====
   * 系数验证：本批 7 只怪 n1-n4 比值一致（HP 1/3.196/8.96/23.88、伤害 1/2.03/3.82/6.17），
   * 与 9/25 批（3.163/9.39/23.75）微差——各怪间有 ±1% 设计浮动，直录值仍为准、系数仅估算用 */
  {
    id: "enemy_blood_sprout", name: "渴血之芽", tier: "normal",
    hp: { normal: 1140, hard: 3642, nightmare: 10210, insane: 27208 },
    attack: { normal: 32, hard: 65, nightmare: 122, insane: 198 },
    actions: [
      { name: "冰盾打击", type: "attack", value: { normal: 32, hard: 65, nightmare: 122, insane: 198 }, note: "获得 { normal: 600, hard: 1926, nightmare: 5412, insane: 14430 } 点霜盾（按难度）" },
      { name: "毒素", type: "attack", value: { normal: 48, hard: 98, nightmare: 183, insane: 296 }, note: "施加 { normal: 32, hard: 65, nightmare: 122, insane: 198 } 层中毒" },
      { name: "？（未采集名）", type: "attack", value: { normal: 72, hard: 146, nightmare: 275, insane: 444 }, debuff: { buffId: "debuff_weak", stacks: 1, duration: 1 } }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n4 = lv 41/54/64/74，战斗#3）",
    notes: "霜盾（受主动伤给随机手牌挂迟缓，破盾即除）未建模"
  },
  {
    id: "enemy_coop_fused", name: "协作型融蚀体", tier: "normal",
    hp: { normal: 1027, hard: 3281, nightmare: 9196, insane: 24508 },
    attack: { normal: 32, hard: 64, nightmare: 120, insane: 194 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 32, hard: 64, nightmare: 120, insane: 194 }, times: 2 },
      { name: "？（未采集名）", type: "special", note: "全体获得 { normal: 50, hard: 161, nightmare: 451, insane: 1203 } 点护盾，自身获得 { normal: 8, hard: 16, nightmare: 30, insane: 49 } 点力量（按难度）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 32, hard: 64, nightmare: 120, insane: 194 }, times: 2 },
      { name: "？（未采集名）", type: "attack", value: { normal: 39, hard: 80, nightmare: 150, insane: 242 }, note: "降低 { normal: 6, hard: 6, nightmare: 23, insane: 37 } 点临时力量" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n4 = lv 41/54/64/74，战斗#3）",
    notes: "第4招的降力为临时力量（未建模）；第1/3招同数值疑为等价或循环复用（原样并记）"
  },
  {
    id: "enemy_lantern", name: "提灯", tier: "normal",
    hp: { normal: 1381, hard: 4415, nightmare: 12376, insane: 32981 },
    attack: { normal: 42, hard: 84, nightmare: 157, insane: 255 },
    actions: [
      { name: "惊厥", type: "attack", value: { normal: 42, hard: 84, nightmare: 157, insane: 255 }, note: "将1张「惊厥」洗入对方抽牌堆（未建模）" },
      { name: "出血", type: "attack", value: { normal: 55, hard: 111, nightmare: 209, insane: 339 }, note: "施加 { normal: 55, hard: 111, nightmare: 209, insane: 339 } 层出血（等量层，出血引擎已接）" },
      { name: "？（未采集名）", type: "buff", buffId: "buff_reinforce", stacks: 1, target: "self", note: "获得 { normal: 200, hard: 642, nightmare: 1804, insane: 4810 } 护盾 + { normal: 11, hard: 23, nightmare: 42, insane: 68 } 力量（护盾部分未建模）" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n4 = lv 41/54/64/74，战斗#3）",
    notes: "惊厥症状卡：无法打出、弃掉时移除（2026-09-26 词条）"
  },
  {
    id: "enemy_interfere_fused", name: "干涉型融蚀体", tier: "normal",
    hp: { normal: 1712, hard: 5471, nightmare: 15337, insane: 40872 },
    attack: { normal: 128, hard: 260, nightmare: 488, insane: 789 },
    actions: [
      { name: "？（未采集名）", type: "special", note: "获得 { normal: 150, hard: 482, nightmare: 1353, insane: 3608 } 点护盾，将1张「惊厥」洗入抽牌堆（未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 128, hard: 260, nightmare: 488, insane: 789 }, note: "获得 { normal: 16, hard: 33, nightmare: 61, insane: 99 } 力量（按难度，未建模）" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n4 = lv 41/54/64/74，战斗#4）",
    notes: "两招均为复合（护盾+力量未建模）；2026-10-01 本期复采 lv38 个体 hp1318（n1，战斗#3；9/26 为 lv41 个体 1712），意图 103伤+13力 / 101盾+惊厥洗牌——同上 lv 个体差并记"
  },
  {
    id: "enemy_fused_humanoid", name: "融蚀人型", tier: "normal",
    hp: { normal: 2554, hard: 9232, nightmare: 23626, insane: 56105, n5: 134000, n6: 296000, n7: 655000 },
    attack: { normal: 76, hard: 152, nightmare: 259, insane: 388, n5: 508, n6: 611, n7: 732 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 76 }, note: "获得206点护盾（深夜 lv50 版）；9/26 lv41 版第1招=89纯伤、第2招48+盾——**招式顺序个体差**" },
      { name: "？（未采集名）", type: "attack", value: { normal: 48, hard: 97, nightmare: 182, insane: 294 }, note: "获得 { normal: 150, hard: 482, nightmare: 1353, insane: 3608 } 点护盾" },
      { name: "？（未采集名）", type: "attack", value: { normal: 59, hard: 121, nightmare: 227, insane: 367 } }
    ],
    passives: [],
    source: "游戏内实测（9/26 n1-n4 = lv 41/54/64/74；波5 n1-n7 = 2026-10-01 全档 lv 50/60/70/80/90/95/100——**✅用户实测波5 就是融蚀人型**）",
    notes: "波5 七档（T22 收官，2026-10-01 用户直接观测确认归属）：hp 2554/9232/23626/56105/134k/296k/655k、attack 76/152/259/388/508/611/732（阶梯 ×3.6/2.6/2.4/2.4/2.2/2.2 自洽）；n1-n4 主值用波5 链（lv50-100），**9/26 链并记**：lv41/54/64/74 = 1827/5841/16375/43638、attack 89/182/341/551（同难度不同 lv 个体，两条链差 30~40%）；其他观测：lv38 1265/44/55/83、深夜 lv50 2554（76+206盾/94/141）；★归属方法论教训：**attack 首招会因招式顺序个体差倒挂**（lv41 首招 89 > lv50 首招 76——非同招），怪名归属应优先 HP+lv 锚（纯白鼠王曾误判，attack 76 巧合吻合、HP 差 10% 才是真相）；在波4 场亦出现（9/26 记录）；召唤体场（融合你我）不涉及本怪"
  },
  {
    id: "enemy_fused_ratking", name: "融蚀鼠王", tier: "normal",
    hp: { normal: 1878, hard: 6002, nightmare: 16826, insane: 44841 },
    attack: { normal: 95, hard: 191, nightmare: 359, insane: 581 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 95, hard: 191, nightmare: 359, insane: 581 } },
      { name: "？（未采集名）", type: "buff", buffId: "buff_strength", stacks: { normal: 13, hard: 26, nightmare: 48, insane: 78 }, per: 1, target: "self", note: "并获 { normal: 100, hard: 321, nightmare: 902, insane: 2405 } 护盾" },
      { name: "？（未采集名）", type: "attack", value: { normal: 51, hard: 102, nightmare: 192, insane: 310 }, times: 2 },
      { name: "？（未采集名）", type: "attack", value: { normal: 51, hard: 102, nightmare: 192, insane: 310 }, debuff: { buffId: "debuff_fragile", stacks: 1, duration: 1 } }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n4 = lv 41/54/64/74，战斗#4/#7）",
    notes: "战斗#7 采集顺序略异（力量护盾→2次→脆弱→201伤），原样并记本版（战斗#4顺序）"
  },
  {
    id: "enemy_tailor", name: "裁缝", tier: "normal",
    hp: { normal: 2448, hard: 7824, nightmare: 21935, insane: 58457 },
    attack: { normal: 52, hard: 105, nightmare: 197, insane: 319 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 52, hard: 105, nightmare: 197, insane: 319 }, times: 2 },
      { name: "？（未采集名）", type: "attack", value: { normal: 103, hard: 210, nightmare: 394, insane: 638 }, note: "获得1层疯狂（疯狂=主动伤害次数+1/层，未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 52, hard: 105, nightmare: 197, insane: 319 }, debuff: { buffId: "debuff_fragile", stacks: 1, duration: 1 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 31, hard: 63, nightmare: 119, insane: 119 }, times: 3 }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n4 = lv 41/54/64/74，战斗#9）",
    notes: "n3/n4 第4招同为119（采集原文），疑其中之一有误或 rounds 特殊——原样并记"
  },
  {
    id: "enemy_hysteric", name: "「歇斯底里患者」", tier: "normal",
    hp: { normal: 13389, insane: 318000 },
    attack: { normal: 54, hard: 104, nightmare: 181, insane: 294 },
    actions: [
      { name: "？（未采集名）", type: "buff", buffId: "buff_strength", stacks: { normal: 18, hard: 35, nightmare: 61, insane: 98 }, per: 1, target: "self", note: "并施加1回合脆弱" },
      { name: "？（未采集名）", type: "attack", value: { normal: 54, hard: 104, nightmare: 181, insane: 294 }, times: 3, note: "施加1回合虚弱；获得 { normal: 5400, hard: 10400, nightmare: 18100, insane: 29400 } 护盾（=伤害×100，未建模）" },
      { name: "创伤猛击", type: "attack", value: { normal: 267, hard: 516, nightmare: 905, insane: 1469 }, note: "施加1回合创伤（创伤：打出「打击」后抽牌堆顶加2张「伤口」——未建模）" }
    ],
    passives: ["充动的代价 { normal: 6, hard: 11, nightmare: 19, insane: 30 } 层（每次受到攻击后，失去X点临时力量）"],
    source: "游戏内实测（用户采集 2026-09-26，n1-n3 = lv 43/56/66；n4 lv76，战斗#9）",
    notes: "⚠ n1/n2/n3 原采集同值 18988 疑误——新一轮融灾（9/28 起）无怪可复核，按「不合理的舍弃」废弃（2026-09-28）；normal=13389 为 n4 318k ÷ 系数 23.75 的反推估算，hard/nightmare 走系数回落；创伤/伤口联动未建模"
  },
  {
    id: "enemy_fused_slurry", name: "融蚀浆", tier: "normal",
    hp: { normal: 11583, hard: 31665, nightmare: 83404 },
    attack: { normal: 140, hard: 268, nightmare: 493 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 140, hard: 268, nightmare: 493 }, note: "获得 { normal: 9, hard: 17, nightmare: 31 } 点力量（按难度）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 105, hard: 201, nightmare: 370 }, debuff: { buffId: "debuff_weak", stacks: 1, duration: 1 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 53, hard: 101, nightmare: 185 }, times: 3 },
      { name: "？（未采集名）", type: "attack", value: { normal: 70, hard: 134, nightmare: 247 }, times: 2, debuff: { buffId: "debuff_fragile", stacks: 1, duration: 1 } }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n3 = lv 42/55/65，战斗#10）",
    notes: "n4 未采集；n1 11583 显著高于同期他怪（血牛型）；系数字微差（2.734/2.634 vs 标准曲线）原样并记"
  },
  {
    id: "enemy_fused_hound", name: "融蚀野犬", tier: "normal",
    hp: { normal: 8141, hard: 22254, nightmare: 58616 },
    attack: { normal: 51, hard: 97, nightmare: 178 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 51, hard: 97, nightmare: 178 }, times: 3 },
      { name: "连续撕咬", type: "attack", value: { normal: 44, hard: 83, nightmare: 153 }, times: 2, note: "提升后续「连续撕咬」的攻击次数（成长机制未建模）" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1-n3 = lv 42/55/65，战斗#7）",
    notes: "n4 未采集；连续撕咬的次数成长未建模"
  },
  {
    id: "enemy_blackfeather", name: "圣子.黑羽", tier: "boss",
    hp: { normal: 37097, hard: 104000, nightmare: 262000 },
    attack: { normal: 145, hard: 282, nightmare: 510 },
    actions: [
      { name: "不屈的孤嚎鸟", type: "special", note: "获得 { normal: 3052, hard: 8608, nightmare: 21616 } 点护盾，获得3层黑羽" },
      { name: "黑羽", type: "attack", value: { normal: 241, hard: 470, nightmare: 849 }, note: "施加2回合致盲和虚弱，消耗1层黑羽；玩家释放钥令后意图立刻变为低伤害「打击」并+1黑羽（钥令联动未建模）" },
      { name: "打击", type: "attack", value: { normal: 145, hard: 282, nightmare: 510 }, note: "获得1层黑羽" },
      { name: "蔽日之羽", type: "special", note: "获得 { normal: 1145, hard: 3228, nightmare: 12970 } 护盾，每1层黑羽使防御提高15%，获得 { normal: 3, hard: 5, nightmare: 9 } 力量，+1黑羽（未建模）" },
      { name: "？（未采集名·免疫）", type: "buff", buffId: "buff_damage_immune", stacks: 1, duration: 2, target: "self", once: true, note: "获得一层免疫伤害（免疫非穿刺伤害，回合结束移除——词条 2026-09-26）✅已实装为自我增益行动（T34 补）：免疫机制未建模仅状态展示；duration=2=当回合末衰减1次后仍存续、至玩家行动后的回合末移除（对齐词条时序）" },
      { name: "翱翔夙愿", type: "special", note: "获得1层翱翔夙愿（未被击破护盾的50%保留至下回合，回合结束+1黑羽，未建模）" },
      { name: "穿行永夜", type: "attack", value: { normal: 135, hard: 264, nightmare: 510 }, times: 3, note: "每层黑羽使最终伤害+10%，清除一半黑羽" },
      { name: "双重黑羽", type: "attack", value: { normal: 169, hard: 329, nightmare: 595 }, times: 2, note: "施加2回合致盲和虚弱，消耗1层黑羽；钥令联动同「黑羽」（未建模）" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-09-26，n1/n2/n3 = lv 44/57/67，战斗#8；n4 未采）",
    notes: "⚠ 双管血（stages: 第2管@意图6）：采集中三档 stages.hp 都写了 65602（复制的占位，非实测值）——新一轮融灾该 Boss 未复现，占位废弃（2026-09-28），载入时按首管血量兜底；意图循环中「黑羽()」「不屈的孤嚎鸟()」「穿行永夜()」空数值为原样（重复进入标记）；黑羽机制（层强化、钥令联动）未建模"
  },

  /* ===== 融灾新怪（用户采集 2026-10-01 凌晨，n1，lv38/41，战斗#1-#4）=====
   * 本批新机制家族：畸变（卡牌算力-1/层，打出→随机畸变卡入手，跨战斗保留）、
   * 认知失调（卡牌算力随机浮动）、利爪（未被格挡伤害→1层脆弱）、
   * 谵妄樊笼（手牌算力本回合变3）、巢群共感-融合（死亡→友方临时疯狂） */
  {
    id: "enemy_primal_molted", name: "初变者", tier: "normal",
    hp: { normal: 2294 }, attack: { normal: 31 },
    actions: [
      { name: "失控追击", type: "attack", value: { normal: 31 }, times: 2, note: "获得1层疯狂（疯狂=主动伤害次数+1/层，未建模）" },
      { name: "咬噬", type: "attack", value: { normal: 19 }, times: 2, debuff: { buffId: "debuff_vul", stacks: 1, duration: 1 } },
      { name: "戳刺", type: "attack", value: { normal: 62 }, times: 2 }
    ],
    passives: [
      "巢群共感-融合1层：死亡后，其他友方获得1层临时疯狂",
      "旧日余烬115层（开局自带）：承受主动/触腕伤害后移除等量并失去300%移除量生命，其他伤害移除一半；每回合重置"
    ],
    source: "游戏内实测（用户采集 2026-10-01 凌晨，n1 lv38，战斗#1）",
    notes: "新怪；蜕化者同族，「巢群共感-融合」变体死亡给临时疯狂而非力量+余烬；n2+ 未采集走系数回落"
  },
  {
    id: "enemy_bee", name: "小蜜蜂", tier: "normal",
    hp: { normal: 650 }, attack: { normal: 99 },
    actions: [
      { name: "啼鸣", type: "special", note: "将牌堆中3张卡牌算力消耗变为3（时限未采集，未建模）" },
      { name: "振翅", type: "special", note: "施加1回合的虚弱、脆弱和重创（未建模）" },
      { name: "尾针！", type: "attack", value: { normal: 99 }, selfDestruct: true, note: "自身死亡，使4张卡牌产生畸变（畸变未建模）" }
    ],
    passives: [
      "谵妄樊笼：玩家回合开始时，随机使其一张手牌算力消耗在本回合中变化为3；死亡后该效果失效，并使击杀者所有卡牌算力消耗本回合降低1",
      "开局2层屏障（屏障=挡一次任意伤害，词条 2026-09-28）"
    ],
    source: "游戏内实测（用户采集 2026-10-01 凌晨，n1 lv38，战斗#1）",
    notes: "新怪；采集名带英文引号；畸变/谵妄樊笼/啼鸣 等变费机制全部未建模；2026-10-01 白天场复采 lv41 个体 hp788（尾针114，战斗#5）；深夜场 lv50 个体 hp1312（尾针168）——lv 个体差系列 38→41→50"
  },
  {
    id: "enemy_follower", name: "追随者", tier: "normal",
    hp: { normal: 1265 }, attack: { normal: 42 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 42 }, note: "获得101点护盾，并使抽牌堆随机1张牌附加认知失调（未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 50 }, note: "使抽牌堆随机1张牌附加认知失调（未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 75 }, note: "使抽牌堆随机1张牌附加认知失调（未建模）" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-10-01 凌晨，n1 lv38，战斗#2）",
    notes: "新怪；认知失调载体（卡牌算力随机±2，词条 2026-10-01）；n2+ 未采集走系数回落；深夜场 lv50 个体 hp2554（71+206盾+失调/85/127，战斗#2）——lv 个体差系列（38→50）"
  },
  {
    id: "enemy_abandoned", name: "离弃之人", tier: "normal",
    hp: { normal: 1380 }, attack: { normal: 52 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 52 } },
      { name: "？（未采集名）", type: "special", note: "获得18点力量、670点护盾（未建模）" },
      { name: "创伤重击", type: "attack", value: { normal: 130 }, note: "施加1回合创伤（创伤：打出「打击」后抽牌堆顶加2张「伤口」，未建模）" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-10-01 凌晨，n1，战斗#2；lv38/hp1380 = 同日 15 点补采）",
    notes: "新怪；lv/HP 已补采（⚠原漏采，1380@lv38）；深夜场 lv50 个体 hp2788（89/30力+1370盾/创伤重击193，战斗#2）——恰为 lv38 的 ~2.02 倍"
  },
  {
    id: "enemy_dimension_foot", name: "撕裂维度之足", tier: "boss",
    hp: { normal: 38509 }, attack: { normal: 63 },
    actions: [
      { name: "封印", type: "special", note: "封印四个唤醒体的狂气爆发1回合（debuff_seal），自身获得2层利爪（未建模）" },
      { name: "追猎", type: "attack", value: { normal: 63 }, times: 3, note: "每当造成未被格挡的伤害，就会造成1层脆弱（=利爪词条联动，未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 126 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 216 } }
    ],
    passives: [
      "利爪：造成未被格挡的伤害时，造成1层脆弱；回合结束-1层（词条 2026-10-01）"
    ],
    source: "游戏内实测（用户采集 2026-10-01 凌晨，n1 lv41，战斗#4 单怪）",
    notes: "新怪，精英/Boss 级（HP 与圣子.黑羽 n1 37097 同量级，战斗#4 为单怪场）；tier 暂标 boss，格类型以地图为准；利爪/封印爆发联动未建模；n2+ 未采集走系数回落"
  },

  /* ===== 融灾新怪（用户采集 2026-10-01 白天场，n1，lv41-44，战斗#5-#10）=====
   * 蛛群家族：召唤链澄清（用户 10-01 勘误）——第 1 个冷蛛群是量体师「束缚之网」召唤的，
   * 其他是冷蛛群死后由「集群效应」召唤的；召唤出的冷蛛群/渊狱蛛群「集群效应」层数从初始冷蛛群继承
   * （死亡后召唤的=原层数-1），量体师场的召唤体为强化版 HP 3499（野生 1113/928）——采集快照层数勿直接采信 */
  {
    id: "enemy_cold_spider", name: "冷蛛群", tier: "normal",
    hp: { normal: 1113, hard: 3577, nightmare: 10050, insane: 26800, n5: 66278, n6: 153000, n7: 347000 },
    attack: { normal: 23, hard: 46, nightmare: 86, insane: 139, n5: 198, n6: 249, n7: 300 },
    actions: [
      { name: "淬毒涎液", type: "attack", value: { normal: 23, hard: 46, nightmare: 86, insane: 139, n5: 198, n6: 249, n7: 300 }, times: 2, note: "施加10%伤害的中毒（未建模）" },
      { name: "幻毒侵蚀", type: "attack", value: { normal: 72 }, note: "将1张随机唤醒体附带消耗的「打击」洗入对方抽牌堆（未建模）；n2+ 缺档走系数回落" },
      { name: "暗影缠丝", type: "special", note: "施加1层虚弱，为3张卡牌附加1层迟缓；不给自身加旧日余烬（变体：渊狱蛛群版=获得47余烬）" }
    ],
    passives: [
      "律之丝1层：敌方打出指令卡后，所有友方获得5层临时加固；「旧日余烬」被击破后失效（变体「乱之丝」=打出非指令卡后全体1层力量）",
      "集群效应2层：死亡后立刻召唤一名随机的「渊狱蛛群」或「冷蛛群」，使其集群效应降低1层（召唤链见批注）",
      "旧日余烬167层（开局自带，承受主动/触腕伤害移除等量并失去300%移除量生命，其他伤害移除一半，每回合重置）"
    ],
    source: "游戏内实测（n1 = 2026-10-01 白天场 lv41，战斗#5/#6；n2-n7 = 同日第二波采集，lv 54/64/74/84/92/97）",
    notes: "新怪；n2-n7 HP/淬毒涎液直录（HP 比 n1=3.21/9.03/24.1/59.5/137/312 与系数表±3% 吻合；伤害比偏低系数表 5~10%——与灰烬融蚀体同构，普遍现象）；n6/n7 HP=K 显示±千位；n5-n7 怪物等级 84/92/97 为全库首录；量体师场召唤强化版——**召唤链 HP 逐次递增实测**（2026-10-01 战斗#2 二次确认）：量体师第1次召唤 hp3499（集群效应1层/525余烬）→第2次 4576（687余烬）→第3次 5653（848余烬），Δ≈1077/次；召唤体的**子代**（集群效应再召唤）hp 继承父代、意图变为「黑死之吻（24伤+洗随机症状）」、余烬 175/229、集群效应 0 层（无）——**集群效应 2→1→0 逐代递减实测确认**（初始野生 2 层）；死后野生召唤版=1113/928 值域；用户确认「冷蛛群记录无误」（n2-n7 七档见 hp/attack 字段）"
  },
  {
    id: "enemy_abyss_spider", name: "渊狱蛛群", tier: "normal",
    hp: { normal: 928 }, attack: { normal: 27 },
    actions: [
      { name: "暗影缠丝", type: "special", note: "获得47旧日余烬（冷蛛群版=1虚弱+3卡迟缓）" },
      { name: "淬毒涎液", type: "attack", value: { normal: 27 }, times: 2, note: "施加10%伤害的中毒（未建模）" },
      { name: "幻毒侵蚀", type: "attack", value: { normal: 85 }, note: "洗入附带消耗的「打击」（未建模）" }
    ],
    passives: [
      "律之丝1层（同冷蛛群）：敌方打出指令卡后，所有友方获得5层临时加固；余烬被击破后失效",
      "集群效应2层（同冷蛛群）：死亡后立刻召唤随机蛛群，使其集群效应降低1层"
    ],
    source: "游戏内实测（用户采集 2026-10-01 白天场，n1 lv41，战斗#5）",
    notes: "新怪；量体师场召唤强化版 HP 3499（战斗#7 #22，律之丝+175余烬）；意图循环与冷蛛群同三招、数值与附加不同"
  },
  {
    id: "enemy_pustule", name: "脓疱", tier: "normal",
    hp: { normal: 1586 }, attack: { normal: 44 },
    actions: [
      { name: "毒素", type: "attack", value: { normal: 44 }, note: "施加22层中毒（未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 66 }, note: "获得164点护盾（未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 66 }, debuff: { buffId: "debuff_weak", stacks: 1, duration: 1 } }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-10-01 白天场，n1 lv41，战斗#6）",
    notes: "新怪；n2+ 未采集走系数回落"
  },
  {
    id: "enemy_tailor_neo", name: "量体师", tier: "boss",
    hp: { normal: 26915 }, attack: { normal: 215 },
    actions: [
      { name: "束缚之网", type: "special", note: "施加2层虚弱，封印2张手中或抽牌堆顶的指令卡1回合；移动至前排，并在后方召唤1名冷蛛群（召唤链起始；封印/换位/召唤未建模）" },
      { name: "狂热凿击", type: "attack", value: { normal: 215 }, note: "和前列友方交换位置；若本回合击破了「旧日余烬」，获得50层临时加固并转化为115伤+4层临时狂热的「凿击」（条件变体未建模）" },
      { name: "衰朽", type: "attack", value: { normal: 43 }, times: 3, note: "每造成1次未被格挡的伤害就使目标失去8力量（未建模）" },
      { name: "狂热凿击", type: "special", note: "空数值为原样（循环重复进入标记）" }
    ],
    passives: [
      "宿命轮转1层：敌方打出指令卡后，自身获得1层临时狂热；击破「旧日余烬」后与后列友方交换位置",
      "旧日余烬1077层（开局自带）"
    ],
    source: "游戏内实测（用户采集 2026-10-01 白天场，n1 lv43，战斗#7 单核心+召唤链）",
    notes: "新怪，精英/Boss 级（26915 与石之眼/黑羽同量级）；临时狂热满10层→立刻行动机制见词条；开场召唤第1个冷蛛群（强化版 3499）；换位/召唤/狂热转化未建模"
  },
  {
    id: "enemy_declaring", name: "宣言者", tier: "normal",
    hp: { normal: 7329 }, attack: { normal: 60 },
    actions: [
      { name: "远古的呼唤", type: "special", note: "每回合获得5力量（=获得「愤怒」buff 实现：回合结束获等量层数力量，未建模）", once: true },
      { name: "？（未采集名）", type: "attack", value: { normal: 60 }, times: 2 },
      { name: "？（未采集名）", type: "attack", value: { normal: 100 } }
    ],
    passives: [
      "畏惧狂气1层：我方队伍释放狂气爆发后，自身当回合失去力量（一回合一次）"
    ],
    source: "游戏内实测（用户采集 2026-10-01 白天场，n1 lv42，战斗#8）",
    notes: "新怪；「远古的呼唤」为仅一次意图（once）"
  },
  {
    id: "enemy_combatant", name: "作战员", tier: "normal",
    hp: { normal: 7376 }, attack: { normal: 91 },
    actions: [
      { name: "破甲", type: "attack", value: { normal: 91 }, debuff: { buffId: "debuff_fragile", stacks: 2, duration: 1 } },
      { name: "出血", type: "attack", value: { normal: 113 }, note: "施加113层出血并获得651点护盾；该出血受力量提高加成（未建模）" },
      { name: "剑势", type: "buff", buffId: "buff_strength", stacks: 10, per: 1, target: "self", note: "并获10层临时反击（未建模）" },
      { name: "幻影剑", type: "attack", value: { normal: 17 }, times: 5, note: "每击附加等量出血（未建模）" }
    ],
    passives: [],
    source: "游戏内实测（用户采集 2026-10-01 白天场，n1 lv42，战斗#8）",
    notes: "新怪；出血/临时反击/等量出血未建模"
  },
  {
    id: "enemy_lantern_guardian", name: "提灯.卫道士", tier: "normal",
    hp: { normal: 8449 }, attack: { normal: 110 },
    actions: [
      { name: "污染", type: "attack", value: { normal: 110 }, debuff: { buffId: "debuff_fragile", stacks: 1, duration: 2 } },
      { name: "飞刃", type: "attack", value: { normal: 137 }, note: "施加137层出血（未建模）" },
      { name: "血红誓言", type: "special", note: "获得10层血誓，施加2回合重创（血誓未建模）" },
      { name: "降罪灯火", type: "attack", value: { normal: 55 }, times: 3, note: "每层血誓使伤害提高10点（未建模）" }
    ],
    passives: [
      "圣化5层：战斗开始和回合开始时获得5层加固，最大为50层",
      "重创加深50层：造成的重创效果变为降低50%生命回复（同食尸鬼卫队长）",
      "脆弱加深50层：造成的脆弱效果变为降低50%获得护盾"
    ],
    source: "游戏内实测（用户采集 2026-10-01 白天场，n1 lv42，战斗#9 单怪）",
    notes: "新怪（与「提灯」同族）；血誓=受击掉层+增幅敌人技能（词条 2026-10-01）；圣化/加深/血誓均未建模"
  },
  {
    id: "enemy_stone_eye", name: "石之眼", tier: "boss",
    hp: { normal: 26996 }, attack: { normal: 142 },
    actions: [
      { name: "凝滞诅咒", type: "attack", value: { normal: 142 }, note: "对抽牌堆顶的2张卡牌施加「迟缓」和「保留」（未建模）" },
      { name: "凝滞诅咒", type: "special", note: "空数值为原样（重复进入标记）" },
      { name: "小小心愿", type: "attack", value: { normal: 174 } },
      { name: "万古之眸", type: "special", note: "施加2层虚弱，抽牌堆和弃牌堆顶的3张卡牌施加「迟缓」和「保留」（未建模）" },
      { name: "觉醒", type: "special", note: "获得22点力量，每回合对手牌中剩余卡牌施加「迟缓」（第2形态起点，未建模）" },
      { name: "石化分解", type: "attack", value: { normal: 217 }, debuff: { buffId: "debuff_vul", stacks: 1, duration: 3 } },
      { name: "真.万古之眸", type: "special", note: "施加3层虚弱，对抽牌堆和弃牌堆的所有卡牌施加「迟缓」和「保留」（未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 217 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 217 } }
    ],
    phases: [{ hp: 40494, start: 4, buffs: [{ buffId: "buff_damage_immune", stacks: 1 }] }],
    passives: [
      "尚未觉醒1层：这位唤醒体还未觉醒...即将被击倒时会觉醒，回复生命并以真正的形态开始战斗",
      "阶段转换保护：1阶段（第1管血）死亡后，立即获得1层伤害免疫（免疫非穿刺伤害，词条 2026-09-26；用户补采 2026-10-01）——✅已由 phases.buffs 表达（转阶段自动挂载，T34）"
    ],
    source: "游戏内实测（用户采集 2026-10-01 白天场，n1 lv44，战斗#10 单怪 Boss）",
    notes: "新怪 Boss；⚠ 双管血：stages 第2管@意图5「觉醒」行(index 4)=40494（实测）——✅用户确认：一阶段死亡后直接进入二阶段（觉醒→真形态，无中间步骤）；迟缓/保留挂卡机制未建模；采集名带引号"
  },
  {
    id: "enemy_w3_fleshboss", name: "殼ヰ圣7ヒ肉ㄍk塊Q（波3首领）", tier: "boss",
    hp: { normal: 33553, hard: 108000, nightmare: 287000, insane: 750000, n5: 1864000, n6: 4326000, n7: 9818000 },
    attack: { normal: 59, hard: 122, nightmare: 224, insane: 356, n5: 500, n6: 621, n7: 747 },
    actions: [
      { name: "觅ド人良ヒ", type: "attack", value: { normal: 59 }, times: 2, note: "获得1层饥饿；每造成1次未被格挡的伤害额外获得1层饥饿（59=基础值；观测68=59+9力量✓）" },
      { name: "忘ㄍkQ", type: "special", note: "切换至该意图时，将自身的虚弱和易伤转移给敌人；若成功转移，回复10%已损失生命（观测回复1）并获得1层饥饿，否则造成118点伤害（基础）并获得2层饥饿（观测136=118+18力量✓）" },
      { name: "扌京食い", type: "attack", value: { normal: 168 }, note: "造成伤害并施加等量出血；自身最大生命提高5%，吞噬玩家手中随机1张「技能」将其消耗（观测177=168基础+9力量）" }
    ],
    passives: [
      "拟态1层：打出指令卡后，对所属唤醒体在各处的卡牌施加10层适应，其他唤醒体的卡牌移除5层适应；每层适应使卡牌造成的伤害、力量、触腕伤害、固定中毒、固定反击、护盾、生命回复、力量降低的最终效果降低1%，最高50层",
      "饥饿：达到5层时，回合结束后消耗所有饥饿，将意图切换为强力攻击并获得9点力量（本场战斗有效；实测两次消耗=力量9→18）",
      "旧日余烬1007层（开局自带）：承受主动/触腕伤害后移除等量并失去300%移除量生命，承受其它伤害时移除一半；每回合重置"
    ],
    source: "游戏内实测（波3 n1 = 用户截图 2026-10-01 18:31-18:38 lv47 单首领场；n2-n7 = 同日波3 全档采集 lv 59/69/79/89/96/101）",
    notes: "波3 n1 即单首领波（用户确认「没有其他怪」）——波3 七档数据（T22 波次曲线批）全部归属本怪；游戏内名字即乱码演出（拆字+假名/注音混入：觅ド人良ヒ≈觅食、扌京食い≈掠食），标签 主宰/血肉/人型——「主宰」为首领级新标签；HP 局内浮动：33553（先录）/35231（截图 +5.0%）；★意图显示值含当前力量（59+9=68、118+18=136 两组精确互证）——引擎 board 意图显示未加力量，待对齐；★T34：饥饿>=5→「强力攻击」条件边缺目标行未接线（强力攻击数值未采集，passives 有机制全文），回落固定循环——补采后接线；拟态/适应/饥饿/转移/吞噬技能 全部未建模"
  },

  /* ===== 融灾新怪（用户采集 2026-10-01 晚场，n1 lv49-50，战斗#1-#3）=====
   * 波4 曲线数据（T22）归属「探险者领队」（n1 14181/45/49 精确吻合）；白雪仙女=波4 首领（不在曲线列） */
  {
    id: "enemy_explorer_leader", name: "探险者领队", tier: "normal",
    hp: { normal: 14181, hard: 50980, nightmare: 140000, insane: 345000, n5: 823000, n6: 1850000, n7: 4225000 },
    attack: { normal: 45, hard: 98, nightmare: 180, insane: 280, n5: 382, n6: 464, n7: 558 },
    actions: [
      { name: "风雪挥击", type: "attack", value: { normal: 45, hard: 98, nightmare: 180, insane: 280, n5: 382, n6: 464, n7: 558 }, times: 4, note: "每造成一次未被格挡的伤害，随机冻结牌库中1张未被冻结的指令卡（冻结未建模）" },
      { name: "警戒", type: "special", note: "获得855点霜盾，将1张「警觉」置入我方手中（警觉卡已入库 cards.js；霜盾未建模）" },
      { name: "碎冰猛凿", type: "attack", value: { normal: 215 }, note: "消耗所有手牌中被冻结的卡牌（冻结联动未建模）" },
      { name: "刺骨挥击", type: "attack", value: { normal: 90 }, times: 2, note: "施加2层迟缓（迟缓未建模）" }
    ],
    passives: [
      "冰之锋刃2层：回合结束时，根据剩余手牌数获得力量，每张获得2点"
    ],
    source: "游戏内实测（2026-10-01 晚场 n1 lv49 战斗#1；n2-n7 = 同日波4 全档采集 lv 60/70/80/90/96/101）",
    notes: "新怪；**波4 曲线数据（T22）归属本怪**（n1 14181/45/49 精确吻合）；冻结/警觉/碎冰/迟缓 未建模"
  },
  {
    id: "enemy_snow_cluster", name: "亡雪者集群", tier: "normal",
    hp: { normal: 4750 }, attack: { normal: 65 },
    actions: [
      { name: "割喉", type: "attack", value: { normal: 65 }, debuff: { buffId: "debuff_crush", stacks: 1 }, note: "若未被格挡则移除20%死亡抵抗（未建模）" },
      { name: "永冬意志", type: "special", note: "获得6层力量；拥有护盾时施加6层刺骨，否则失去10%当前生命并获得125%霜盾（未建模）" },
      { name: "冰刺", type: "attack", value: { normal: 33 }, times: 3, note: "施加15%伤害的刺骨；若自身拥有护盾，施加的刺骨翻倍（刺骨未建模）" },
      { name: "吸血噬咬", type: "attack", value: { normal: 65 }, note: "回复10%已损失生命（未建模）" }
    ],
    passives: [
      "雪幕隐踪1层：回合结束时护盾不会消失；拥有护盾时受到狂气爆发伤害提高50%、受到指令卡伤害降低50%",
      "霜盾转化1层：出场失去25%最大生命的血量，转化为125%失去值的「霜盾」",
      "集群效应2层：死亡后立刻召唤1名「亡雪者集群」或「噬灯者集群」，使其集群效应降低1层（召唤未建模）",
      "霜盾1层；旧日余烬713层（承受主动/触腕伤害移除等量并失去300%移除量生命，其他伤害移除一半，每回合重置）"
    ],
    source: "游戏内实测（2026-10-01 晚场，n1 lv49，战斗#2 两只）",
    notes: "新怪；「噬灯者集群」**刷了十几次未观测到**（用户 2026-10-01 深夜：召唤池疑实际只有亡雪者集群自身，词条文字暂存疑）——暂不建卡；意图链两变体（冰刺起手/割喉起手）原样并记；刺骨/雪幕隐踪/霜盾转化/召唤 未建模"
  },
  {
    id: "enemy_snow_fairy", name: "「白雪仙女」", tier: "boss",
    hp: { normal: 45115 }, attack: { normal: 94 },
    actions: [
      { name: "叮咚·仙女驾到（供奉钥能）", type: "attack", value: { normal: 94 }, times: 3, cond: "饱餐>=1", goto: 3, note: "切换至该意图时随机向敌人索取1种供奉（供奉算力/狂气/钥能/卡牌——词条 2026-10-01）；成功供奉→生命上限提高5%、获得1层饱餐；否则其获得27点力量；★T34条件边：饱餐≥1时下一意图跳「奇迹赐福」（=切至粉雪魔咒时消耗1层饱餐变奇迹赐福，行为等价；饱餐buff未建模，挂上即生效）" },
      { name: "粉雪魔咒", type: "attack", value: { normal: 321 }, debuff: { buffId: "debuff_weak", stacks: 2 }, note: "并对牌库中3张指令卡施加1层迟缓（未建模）" },
      { name: "奇迹赐福", type: "special", note: "获得5363的霜盾，造成2次暗藏杀机效果（暗藏杀机未采集）；发现2组附带礼物和代价的、带1层迟缓的「赐福」，每组2张，选择1组置入手中（发现/赐福未建模）" },
      { name: "打击", type: "attack", value: { normal: 161 }, note: "将1张具有1层迟缓的随机「赐福」洗入牌库（第二循环为2层迟缓赐福，原样并记）" },
      { name: "诱人蜜果", type: "special", once: true, note: "切换至该意图时获得「银芯固化」（免疫一切伤害且无法失去生命；释放觉醒后，回合结束时移除）；释放「童话天衣无缝」后下2个意图均为「粉雪魔咒」；每回合将1张具有2层迟缓的随机「赐福」洗入牌库" },
      { name: "童话天衣无缝（供奉银钥、卡牌）", type: "attack", value: { normal: 94 }, times: 3, cond: "饱餐>=1", goto: 8, note: "切换至该意图时随机向敌人索取2种供奉；成功供奉→生命上限提高5%、获得1层饱餐；否则获得27点力量（第二循环起点）；★T34条件边：饱餐≥1时下一意图跳「奇迹赐福」第二循环（同第1意图）" },
      { name: "粉雪魔咒", type: "attack", value: { normal: 321 }, debuff: { buffId: "debuff_weak", stacks: 2 }, note: "第二循环（同第2意图）" },
      { name: "奇迹赐福", type: "special", note: "第二循环（同第3意图）" },
      { name: "打击", type: "attack", value: { normal: 161 }, note: "第二循环（2层迟缓赐福洗入牌库）" }
    ],
    passives: [
      "尚未觉醒1层：即将被击倒时会觉醒，回复生命并以真正的形态开始战斗（双管血）",
      "供奉钥能1层：若回合结束前敌方拥有至少1000点银钥能量，吞噬1000银钥能量（供奉词条 2026-10-01）"
    ],
    source: "游戏内实测（2026-10-01 晚场，n1 lv50，战斗#3 单怪 Boss；波4 首领）",
    notes: "新怪 Boss；双管血：stages 第2管@意图5（诱人蜜果，once 行）=67673（实测）；饱餐=意图切至「粉雪魔咒」时消耗1层→变「奇迹赐福」；**索取供奉时获得对应 buff**（用户备注）；★T34条件边已接线（供奉行 饱餐>=1→跳奇迹赐福，两循环各一条；饱餐 buff 未建模=现回落固定循环，建模后自动生效）；暗藏杀机/赐福/发现/银芯固化/吞噬/饱餐 全部未建模；采集名带引号"
  },

  /* ===== 融灾新怪（用户采集 2026-10-01 深夜场，n1 lv50-53，战斗#1-#6）===== */
  {
    id: "enemy_white_ratking", name: "纯白鼠王", tier: "normal",
    hp: { normal: 2296 }, attack: { normal: 76 },
    actions: [
      { name: "寒气打击", type: "attack", value: { normal: 76 }, note: "对抽牌堆顶部的2张卡牌施加1层迟缓（迟缓=算力消耗提高，词条 2026-10-01）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 141 } },
      { name: "？（未采集名）", type: "buff", buffId: "buff_strength", stacks: 19, per: 1, target: "self", note: "并获137点护盾" },
      { name: "？（未采集名）", type: "attack", value: { normal: 76 }, times: 2 }
    ],
    passives: [],
    source: "游戏内实测（2026-10-01 深夜场，n1 lv50，战斗#1）",
    notes: "新怪（融蚀鼠王同族的白色变体）；n2+ 未采集走系数回落；⚠曾按推断归属波5 七档——**用户实测波5 实为融蚀人型，已撤销**（推断教训：attack 首招会因招式顺序个体差倒挂，HP+lv 才是可靠锚）"
  },
  {
    id: "enemy_fused_unity", name: "融合你我", tier: "boss",
    hp: { normal: 21957 }, attack: { normal: 109 },
    actions: [
      { name: "银芯交融", type: "special", note: "所有敌人在本场战斗中获得11点力量（无论它们在哪），召唤1名「灰烬融蚀体」（召唤已录#8/#9 待召唤体）" },
      { name: "双螺旋", type: "attack", value: { normal: 109 }, times: 2, debuff: { buffId: "debuff_vul", stacks: 1, duration: 3 } },
      { name: "异体排斥", type: "attack", value: { normal: 174 }, note: "后排召唤1名「灰烬融蚀体」（召唤未建模）" },
      { name: "溶蚀赘生", type: "attack", value: { normal: 131 }, note: "所有敌人在本场战斗中回合结束时获得174点护盾（无论它们在哪，未建模）" }
    ],
    passives: [
      "「连结者」1层：死亡时，保留1点生命并免疫所有伤害，将意图转化为「连结解除」（连结解除效果未采集——击败需二段）"
    ],
    source: "游戏内实测（2026-10-01 深夜场，n1 lv52，战斗#3 单核心+召唤灰烬）",
    notes: "新怪 Boss；全场+力/全场回合末护盾/召唤/连结者二段 全部未建模；「连结解除」意图待下次补采"
  },
  {
    id: "enemy_twin_pustule", name: "双生脓疱", tier: "normal",
    hp: { normal: 9794 }, attack: { normal: 151 },
    actions: [
      { name: "毒素", type: "attack", value: { normal: 151 }, note: "为对方添加19层中毒（未建模）" },
      { name: "捶打", type: "attack", value: { normal: 245 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 132 }, note: "获得2432护盾，**回合结束时剩余护盾转换为2倍生命值**（「不灭之花」词条实战载体，未建模）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 113 }, note: "获得608点护盾" }
    ],
    passives: [],
    source: "游戏内实测（2026-10-01 深夜场，n1 lv51，战斗#4 单怪）",
    notes: "新怪（脓疱强化版/双生体）；护盾转生命=不灭之花机制（词条 2026-10-01）；n2+ 未采集走系数回落"
  },
  {
    id: "enemy_dimension_beast", name: "维度异兽", tier: "normal",
    hp: { normal: 12004 }, attack: { normal: 240 },
    actions: [
      { name: "封印", type: "special", note: "向随机唤醒体施加1层临时封印，重复2次（debuff_seal；临时封印=1回合？未确认）" },
      { name: "？（未采集名）", type: "attack", value: { normal: 240 } },
      { name: "？（未采集名）", type: "attack", value: { normal: 200 }, note: "获得608点护盾" },
      { name: "？（未采集名）", type: "attack", value: { normal: 240 } }
    ],
    passives: [],
    source: "游戏内实测（2026-10-01 深夜场，n1 lv51，战斗#5）",
    notes: "新怪（撕裂维度之足同族）；n2+ 未采集走系数回落"
  },
  {
    id: "enemy_dimension_shard", name: "维度碎片", tier: "normal",
    hp: { normal: 1867 }, attack: { normal: 78 },
    actions: [
      { name: "？（未采集名）", type: "attack", value: { normal: 78 }, note: "获得137点护盾" }
    ],
    passives: [],
    source: "游戏内实测（2026-10-01 深夜场，n1 lv50，战斗#5）",
    notes: "新怪（维度异兽伴生小怪）；单意图采集"
  },
  {
    id: "enemy_gate_key", name: "「门之钥」", tier: "boss",
    hp: { normal: 56082 }, attack: { normal: 150 },
    actions: [
      { name: "纵贯时序之翼", type: "special", note: "获得8点力量；封印下个打出指令卡的唤醒体2回合（★被动词条：打出指令卡后，封印对应唤醒体的狂气爆发和所有指令卡2回合——强惩罚）" },
      { name: "双翼初张", type: "attack", value: { normal: 150 }, times: 2, debuff: { buffId: "debuff_fragile", stacks: 2 }, wait: true, cond: "出牌>=4", goto: 3, note: "★意图链：再打出4张指令卡后切换为「四翼渐生」（双翼初张词条：初始4层，打1张牌减1层）；★T34条件边：等待态——我方累计出牌<4时保持本意图，≥4跳「四翼渐生」" },
      { name: "四翼渐生", type: "attack", value: { normal: 113 }, times: 4, note: "施加2层脆弱和虚弱；打出4张指令卡后切换为「六翼满开」（113×6+2脆弱虚弱易伤，未直接观测）；★T34：六翼满开未采集=条件边缺目标行，未接线（现线性推进=回落固定循环，采集到六翼满开后补 goto）" },
      { name: "万物归一", type: "special", note: "获得3909点护盾、12点力量；从抽牌堆和弃牌堆中发现5张指令卡，选择3张将其消耗（发现/消耗未建模）" }
    ],
    passives: [
      "尚未觉醒1层：即将被击倒时会觉醒，回复生命并以真正的形态开始战斗（第2管血数值未采集）",
      "「不存在的存在」14021层：单回合内受到层数点伤害后，获得70临时加固和1层怨恨锁链（高吸收盾机制；怨恨锁链=异维学子被动词条）",
      "纵贯时序之翼（被动）：打出指令卡后，封印对应唤醒体的狂气爆发和所有指令卡2回合"
    ],
    source: "游戏内实测（2026-10-01 深夜场，n1 lv53，战斗#6 单怪 Boss）",
    notes: "新怪 Boss；★玩家交互型意图链（双翼初张→四翼渐生→六翼满开 按我方出牌数切换）——★T34条件边部分接线：双翼初张=等待态（出牌>=4→跳四翼渐生）已实装；四翼渐生→六翼满开缺目标行未接线；14021 层吸收盾+纵贯封印 全部未建模；采集名带引号"
  }
];
