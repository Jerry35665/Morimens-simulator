/* =========================================================
 * 忘却前夜战斗模拟器 · 密契定义（套装制）+ 密契仓库
 * ---------------------------------------------------------
 * 系统规则（gamekee《密契系统介绍及简析》610894 官方文本转录）：
 *  - 守密人35级解锁；密契副本掉落 / 商店兑换
 *  - 每个唤醒体 6 个部位；同一套装凑 3 件 / 6 件激发套装效果
 *  - 主词条"321"结构（同词条最多3个部位）；强化满级主词条≈0级2.5倍
 *  - 框架建模：每个密契 = 一个套装；配置界面把套装填入 6 个部位槽，
 *    凑满 3/6 件时套装效果生效；3件套的 statMods 参与属性自动计算
 *    （逐件主词条暂不建模——见 docs/MECHANICS.md 待确认项）
 * ========================================================= */

window.DBF.pacts = [

  {
    id: "pact_deus_ex",
    name: "机械降神",
    rarity: "SSR",
    obtain: "掉落",
    bonus3: {
      text: "界域精通+12",
      statMods: { realmMastery: 12 }
    },
    bonus6: {
      text: "每场战斗首回合获1点额外算力（增强后：首领战每4回合再获1算力）",
      statMods: {}
    },
    confirmed: true,
    source: "gamekee(610895~610924)", notes: ""
  },
  {
    id: "pact_twins_white",
    name: "扭曲双子·白",
    rarity: "SSR",
    obtain: "掉落",
    bonus3: {
      text: "死亡抵抗+16.8%",
      statMods: { deathResist: 16.8 }
    },
    bonus6: {
      text: "偶数回合开始，将1张附加虚无和消耗的装备者[防御]加入手牌",
      statMods: {}
    },
    confirmed: true,
    source: "gamekee", notes: ""
  },
  {
    id: "pact_twins_black",
    name: "扭曲双子·黑",
    rarity: "SSR",
    obtain: "掉落",
    bonus3: {
      text: "暴击+4.8%",
      statMods: { critRate: 4.8 }
    },
    bonus6: {
      text: "奇数回合开始，将1张附加虚无和消耗的装备者[打击]加入手牌",
      statMods: {}
    },
    confirmed: true,
    source: "gamekee", notes: ""
  },
  {
    id: "pact_bone_whisper",
    name: "埋骨地的絮语",
    rarity: "SSR",
    obtain: "掉落",
    bonus3: {
      text: "死亡抵抗+16.8%",
      statMods: { deathResist: 16.8 }
    },
    bonus6: {
      text: "①关卡开始时死亡抵抗+25% ②触发死亡抵抗后装备者获50狂气",
      statMods: {}
    },
    confirmed: true,
    source: "gamekee", notes: "堆死抗流核心（社区：两套埋骨地≈多两三条命）"
  },
  {
    id: "pact_innocent_revelation",
    name: "无垢启示录",
    rarity: "SSR",
    obtain: "掉落",
    bonus3: {
      text: "银钥充能等级+4.8",
      statMods: { silverKeyCharge: 4.8 }
    },
    bonus6: {
      text: "释放钥令后回复装备者体质5%生命（增强后12%，随损失生命至多24%）；同类效果无法重复生效",
      statMods: {}
    },
    confirmed: true,
    source: "gamekee", notes: ""
  },
  {
    id: "pact_wolf_steppe",
    name: "荒原狼",
    rarity: "SSR",
    obtain: "金券商店",
    bonus3: {
      text: "伤害强效+4.8%",
      statMods: { damageBoost: 4.8 }
    },
    bonus6: {
      text: "装备者基础伤害+10%，伤害强效>20%再+10%（增强后同比例加成中毒与反击）",
      statMods: { damagePct: 10 }
    },
    confirmed: true,
    source: "gamekee", notes: "6件套的 damagePct 参与增伤状态区（是否与'基础伤害'同区待确认）"
  },
  {
    id: "pact_crimson_embrace",
    name: "猩红之拥",
    rarity: "SSR",
    obtain: "沉淀商店",
    bonus3: {
      text: "暴击+4.8%",
      statMods: { critRate: 4.8 }
    },
    bonus6: {
      text: "①造成伤害获20银钥能量×3/回合 ②造成暴击伤害获30银钥能量（增强后35/70）",
      statMods: {}
    },
    confirmed: true,
    source: "gamekee", notes: ""
  },
  {
    id: "pact_feast_afar",
    name: "远方的欢宴",
    rarity: "SSR",
    obtain: "无光商店",
    bonus3: {
      text: "黑印掉落+2.4%",
      statMods: { blackImprint: 2.4 }
    },
    bonus6: {
      text: "[防御]护盾+30%；黑印掉落>10%再+30%（增强后：探索开始获10黑印）",
      statMods: {}
    },
    confirmed: true,
    source: "gamekee", notes: ""
  },
  {
    id: "pact_curse_rabbit",
    name: "诅咒兔",
    rarity: "SR",
    obtain: "深潜商店",
    bonus3: {
      text: "界域精通+12",
      statMods: { realmMastery: 12 }
    },
    bonus6: {
      text: "护盾与生命回复+12%",
      statMods: {}
    },
    confirmed: false,
    source: "灰机wiki摘要", notes: "可信度中等"
  },
  {
    id: "pact_organic_form",
    name: "有机形态",
    rarity: "SSR",
    obtain: "待确认",
    bonus3: {
      text: "黑印掉落+3.6%",
      statMods: { blackImprint: 3.6 }
    },
    bonus6: {
      text: "探索开始扣除至多100%死亡抵抗，每扣1%强化装备者的狂气(爆发)效果（原文摘要截断，待确认）",
      statMods: {}
    },
    confirmed: false,
    source: "灰机wiki摘要", notes: "V2.x新增，全文待查"
  },
  {
    id: "pact_photosynthesis",
    name: "光合祭礼",
    rarity: "SSR",
    obtain: "待确认",
    bonus3: {
      text: "伤害强效+7.2%",
      statMods: { damageBoost: 7.2 }
    },
    bonus6: {
      text: "（待确认）",
      statMods: {}
    },
    confirmed: false,
    source: "灰机wiki摘要", notes: "V2.x新增"
  }
];

/* 密契仓库：按 6 个部位分开，与配置面板的密契槽 1-6 一一对应。
 * 每个部位列出该部位拥有的套装件（同一套装可在多个部位都有）。
 * 直接编辑维护：按实际拥有删减各部位的套装 id。 */
window.DBF.pactInventory = {
  1: ["pact_deus_ex", "pact_twins_white", "pact_twins_black", "pact_bone_whisper", "pact_innocent_revelation", "pact_wolf_steppe", "pact_crimson_embrace", "pact_feast_afar", "pact_curse_rabbit"],
  2: ["pact_deus_ex", "pact_twins_white", "pact_twins_black", "pact_bone_whisper", "pact_innocent_revelation", "pact_wolf_steppe", "pact_crimson_embrace", "pact_feast_afar", "pact_curse_rabbit"],
  3: ["pact_deus_ex", "pact_twins_white", "pact_twins_black", "pact_bone_whisper", "pact_innocent_revelation", "pact_wolf_steppe", "pact_crimson_embrace", "pact_feast_afar", "pact_organic_form"],
  4: ["pact_deus_ex", "pact_twins_white", "pact_twins_black", "pact_bone_whisper", "pact_innocent_revelation", "pact_wolf_steppe", "pact_crimson_embrace", "pact_feast_afar", "pact_organic_form"],
  5: ["pact_deus_ex", "pact_twins_white", "pact_twins_black", "pact_bone_whisper", "pact_innocent_revelation", "pact_wolf_steppe", "pact_crimson_embrace", "pact_feast_afar", "pact_photosynthesis"],
  6: ["pact_deus_ex", "pact_twins_white", "pact_twins_black", "pact_bone_whisper", "pact_innocent_revelation", "pact_wolf_steppe", "pact_crimson_embrace", "pact_feast_afar", "pact_photosynthesis"]
};

/* =========================================================
 * 密契词条系统（社区实测数据：Kuyo交流群，2026-09）
 * ---------------------------------------------------------
 *  - 一件密契 = 1 主属性 + 3 词条
 *  - 主属性最大值 = 对应词条最大值 × 2.5（如界域精通 4×2.5=10）
 *  - 主属性强化 0~12 级，步长 = 最大值的 1/12
 *  - 词条档位 1~8，步长 = 最大值的 1/8
 *  - 主属性种类受部位限制（每部位 4 选 1，见 mainStatByPart）；
 *    词条无部位限制
 * ========================================================= */

/* 词条最大值（按种类） */
window.DBF.subStatMax = {
  realmMastery: 4,      // 界域精通
  deathResist: 5.6,     // 死亡抵抗%
  damageBoost: 1.6,     // 伤害强效%
  critDmg: 2.4,         // 暴击伤害%
  critRate: 1.6,        // 暴击率%
  silverKeyCharge: 2.4, // 银钥充能
  blackImprint: 1.2,    // 黑印掉落%
  gukuRecharge: 0.8     // 狂气回充
};

window.DBF.mainStatMultiplier = 2.5;  // 主属性最大值 = 词条最大值 × 2.5
window.DBF.mainStatMaxLv = 12;        // 主属性强化等级（步长=最大值/12）
window.DBF.subStatMaxLv = 8;          // 词条档位（步长=最大值/8）

/* 各部位可选主属性（4 选 1） */
window.DBF.mainStatByPart = {
  1: ["critRate", "critDmg", "silverKeyCharge", "gukuRecharge"],
  2: ["critRate", "critDmg", "realmMastery", "blackImprint"],
  3: ["critRate", "critDmg", "damageBoost", "deathResist"],
  4: ["silverKeyCharge", "gukuRecharge", "realmMastery", "blackImprint"],
  5: ["silverKeyCharge", "gukuRecharge", "damageBoost", "deathResist"],
  6: ["realmMastery", "blackImprint", "damageBoost", "deathResist"]
};

/* 词条中文名（UI 用） */
window.DBF.statNames = {
  realmMastery: "界域精通",
  deathResist: "死亡抵抗%",
  damageBoost: "伤害强效%",
  critDmg: "暴击伤害%",
  critRate: "暴击率%",
  silverKeyCharge: "银钥充能",
  blackImprint: "黑印掉落%",
  gukuRecharge: "狂气回充"
};
