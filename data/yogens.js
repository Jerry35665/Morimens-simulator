/* =========================================================
 * 忘却前夜战斗模拟器 · 钥令定义（用户个人实测转录）
 * ---------------------------------------------------------
 * 钥令 = 银钥满 1000 后可释放的队伍级技能（引擎实装见 js/engine/yogen.js）
 * ---------------------------------------------------------
 * 【数值口径 2026-09-28 破解】图鉴显示值 = 研究深度 × 百分比 向上取整：
 *   护盾/生命/力量类   × 物象研究深度（State.depths.physical，参考值 1032）
 *   中毒/反击/旧日余烬 × 灵识研究深度（State.depths.spirit，参考值 3694）
 *   29 条图鉴值全部吻合（如 104=10%物象、413=40%、155=15%、518=14%灵识、
 *   1109=30%灵识、222=6%灵识、43≈4.1%物象反推）。引擎按当前深度实时计算。
 * 【eff 结构】效果结算数组（resolve 解释器见 engine/yogen.js）：
 *   {op, p:物象%, s:灵识%, v:固定值} + op 专属字段；
 *   未建模的界域条件/角色联动用 {op:"note", text} 记录原义（日志标黄不结算）。
 * 来源：游戏内钥令图鉴截图转录（2026-09-28 共 29 个 + 2026-10-05 补录批 24 个 = 53 个）+ 释放机制实测
 * 【2026-10-05 补录批】钥令图鉴全部翻录一遍：24 条新增 + 4 条旧钥令重复截图复核一致
 *   （脑中之音/最后的誓言/奥瑞塔的宝藏/春天的献诗诗页浮窗 124/37/10/30 全对）；
 *   随批衍生卡说明 2 张入库 data/cards.js（莉雅的硬币=建模 / 闪耀偏方骰=占位）。
 *   新批多为「发现/选牌/衍生卡/角色联动」类复杂机制——可建模子集已接引擎
 *   （drawOwner/discardHandDraw/cardGen 置入指定牌堆/gukuOthers 四个新 op），
 *   其余 {op:"note"} 记录原义；新批钥令无数值类深度缩放项（狂气/算力/抽牌为主）。
 * ========================================================= */

window.DBF = window.DBF || {};
window.DBF.yogens = [

  { id: "yg_brain_voice", name: "脑中之音",
    effect: "对所有敌人造成1回合虚弱和易伤，偷取所有敌人11点力量。",
    eff: [
      { op: "debuff", buffId: "debuff_weak", stacks: 1, duration: 1 },
      { op: "debuff", buffId: "debuff_vul", stacks: 1, duration: 1 },
      { op: "strDown", p: 1, tag: "偷取" },
      { op: "str", p: 1, tag: "偷取" }
    ] },

  { id: "yg_inject_guard", name: "注射守护",
    effect: "获得104点护盾，当前生命若低于25%，回复104点生命。",
    eff: [
      { op: "block", p: 10 },
      { op: "healIfLow", p: 10 }
    ] },

  { id: "yg_eternal_obsession", name: "永世执念",
    effect: "获得31点力量，额外获得等同于永久力量25%的临时力量。",
    eff: [
      { op: "str", p: 3 },
      { op: "note", text: "额外获得等同永久力量25%的临时力量（动态公式未结算）" }
    ] },

  { id: "yg_last_vow", name: "最后的誓言",
    effect: "获得25%临时暴击率和21点临时力量。若在首领战中且本回合尚未打出过任何牌，则尝试触发1次死亡抵抗，若成功则获得413点护盾，此效果只能触发1次。",
    eff: [
      { op: "crit", v: 25 },
      { op: "str", p: 2, temp: true },
      { op: "note", text: "首领战且本回合未打出过牌：尝试1次死亡抵抗，成功则护盾413（=物象40%）（条件与判定未结算）" }
    ] },

  { id: "yg_aurita_treasure", name: "奥瑞塔的宝藏",
    effect: "从抽牌堆中抽3张算力消耗最低的卡牌。若当前界域为「深海」，则额外使触腕伤害提高11点。",
    eff: [
      { op: "drawLowCost", v: 3 },
      { op: "note", text: "界域「深海」：触腕伤害+11（=物象1%）（界域条件未自动判定）" }
    ] },

  { id: "yg_roar_blood_sand", name: "咆哮的血与沙",
    effect: "选择1名唤醒体使其获得20点狂气，获得21点力量，若当前界域为「血肉」，额外使胚胎融合+20，但失去10%当前生命。",
    eff: [
      { op: "guku", v: 20, pick: true },
      { op: "str", p: 2 },
      { op: "note", text: "界域「血肉」：胚胎融合+20、失去10%当前生命（未结算）" }
    ] },

  { id: "yg_brief_eternity", name: "短暂的永恒",
    effect: "获得1点算力。选择1名唤醒体，将其1张「打击」与1张「防御」的原始复制置入手中，并使他们获得消耗、虚无。若当前界域为「超维」，则额外获得21点临时力量与6点临时戒备。",
    eff: [
      { op: "energy", v: 1 },
      { op: "copyBasics", pick: true },
      { op: "note", text: "复制牌已带「消耗」；「虚无」词条未建模；界域「超维」额外21临时力量+6临时戒备（未结算）" }
    ] },

  { id: "yg_rotten_feast", name: "腐烂盛筵",
    effect: "获得222点反击，临时降低所有敌人31点力量。若当前处于「超维回合」，不再降低临时力量，对所有敌人触发100%反击。",
    eff: [
      { op: "riposte", s: 6 },
      { op: "strDown", p: 3, temp: true },
      { op: "note", text: "超维回合：不降低力量、对所有敌人触发100%反击（条件未结算）" }
    ] },

  { id: "yg_bone_embrace", name: "蚀骨的拥抱",
    effect: "获得1点算力，下回合开始时获得104点护盾。若当前界域为「深海」且处于「潮涌」姿态，则效果变为生成1条触腕。",
    eff: [
      { op: "energy", v: 1 },
      { op: "delayedBlock", p: 10 },
      { op: "note", text: "界域「深海」且「潮涌」姿态：改为生成1条触腕（姿态未建模）" }
    ] },

  { id: "yg_lakeside_recall", name: "湖畔回阵",
    effect: "对生命最高敌人造成518点中毒，获得62点护盾。若本回合触发过「吞噬」，不再获得护盾，触发该敌人50%中毒。",
    eff: [
      { op: "poison", s: 14, target: "maxHp" },
      { op: "block", p: 6 },
      { op: "note", text: "本回合触发过「吞噬」：无护盾、改为该敌人50%中毒（未结算）" }
    ] },

  { id: "yg_gray_trueface", name: "灰雾真容",
    effect: "获得16点力量，将1张「灵感」置入手牌。若当前为超维回合，效果变更为将2张「灵感」置入手牌。",
    eff: [
      { op: "str", p: 1.5 },
      { op: "cardGen", cardId: "shared_inspire", v: 1 },
      { op: "note", text: "超维回合改为置入2张「灵感」" }
    ] },

  { id: "yg_rose_victory", name: "玫瑰的胜利",
    effect: "获得47点临时力量，抽2张牌。若当前界域为「血肉」，损失10%当前生命，额外获得16点临时力量，手中每有1张「胚胎」额外获得16点临时力量。",
    eff: [
      { op: "str", p: 4.5, temp: true },
      { op: "draw", v: 2 },
      { op: "note", text: "界域「血肉」：失去10%当前生命、额外16临时力量（物象1.5%）+手中每张「胚胎」再+16（未结算）" }
    ] },

  { id: "yg_miracle_descend", name: "神迹降临",
    effect: "获得21点力量。受到攻击伤害时，下回合开始时获得10%伤害的护盾。若当前界域为「血肉」，不再获得延迟护盾，而是积攒10%伤害的回复量到猩红熔炉。",
    eff: [
      { op: "str", p: 2 },
      { op: "note", text: "受攻击伤害后下回合开始获得10%伤害的护盾（延迟触发器未建模）；界域「血肉」改为积攒到猩红熔炉" }
    ] },

  { id: "yg_giant_domination", name: "巨人的霸道",
    effect: "获得1点算力和16点力量，选择一名唤醒体获得15点狂气。若当前界域为「深海」且处于「怒涛」姿态，效果改为获得15%临时暴击率和临时暴击伤害。",
    eff: [
      { op: "energy", v: 1 },
      { op: "str", p: 1.5 },
      { op: "guku", v: 15, pick: true },
      { op: "note", text: "界域「深海」且「怒涛」姿态：改为15%临时暴击率+临时暴击伤害（未结算）" }
    ] },

  { id: "yg_sea_festival", name: "海之祭",
    effect: "抽2张牌，获得2点算力，所有唤醒体失去5点狂气。若当前处于「静海」姿态，对所有敌人施加296层中毒，在首领战中发挥3倍效果。",
    eff: [
      { op: "draw", v: 2 },
      { op: "energy", v: 2 },
      { op: "gukuAll", v: -5 },
      { op: "poison", s: 8, target: "all" },
      { op: "note", text: "「静海」姿态才施加中毒，首领战3倍（姿态未建模，默认按非静海+已施加记录）" }
    ] },

  { id: "yg_spring_ode", name: "春天的献诗",
    effect: "从四种诗页中选择一项，并将其从选项中移除。所有诗页都被选择后，重置。（雨颂：回复124点生命；风颂：获得37点力量；花颂：所有唤醒体获得10点狂气；月颂：临时暴击率提高30%）",
    eff: [
      { op: "poem", pages: {
        "雨颂": { op: "heal", p: 12 },
        "风颂": { op: "str", p: 3.5 },
        "花颂": { op: "gukuAll", v: 10 },
        "月颂": { op: "crit", v: 30 }
      } }
    ] },

  { id: "yg_void_plague", name: "虚无瘟疫",
    effect: "选择一名唤醒体获得20点狂气，对所有敌人施加167层中毒，目标每损失1%生命额外触发1%中毒，至多触发50%中毒。",
    eff: [
      { op: "guku", v: 20, pick: true },
      { op: "poison", s: 4.5, target: "all" },
      { op: "note", text: "目标每损失1%生命额外触发1%中毒（至多50%）——动态触发未结算" }
    ] },

  { id: "yg_stars_blessing", name: "群星的庇佑",
    effect: "选择「沉眠」或「苏醒」。沉眠（0费）：获得62点护盾，获得1层「星辰庇佑」，最大积攒5层，战斗结束后不清除。苏醒（0费）：所有唤醒体获得8点狂气，消耗所有「星辰庇佑」并获得与消耗层数相同的算力，若当前界域为「深海」，额外生成与消耗层数相同的临时触腕。",
    eff: [
      { op: "starBless", p: 6 },
      { op: "note", text: "「深海」苏醒额外生成等量临时触腕（未结算）；星辰庇佑跨战斗保留待实现" }
    ] },

  { id: "yg_special_cure", name: "特殊治疗",
    effect: "回复73点生命，获得21点力量。若克莱门汀在队伍中，使她本回合下次打出的指令卡伤害、护盾、生命回复、获得狂气、获得银钥能量的效果次数提高1。",
    eff: [
      { op: "heal", p: 7 },
      { op: "str", p: 2 },
      { op: "note", text: "克莱门汀在队：其本回合下次指令卡效果次数+1（角色未入库，未结算）" }
    ] },

  { id: "yg_undying_lightning", name: "不灭的雷光",
    effect: "获得62点护盾，抽2张牌。若克珀珊特在队伍中，还会将1张「领航」置入手牌。",
    eff: [
      { op: "block", p: 6 },
      { op: "draw", v: 2 },
      { op: "note", text: "克珀珊特在队：额外置入1张「领航」（角色/卡未入库）" }
    ] },

  { id: "yg_cruel_greeting", name: "残忍的致意",
    effect: "偷取所有敌人42点力量。若杜勒赛因在队伍中，获得1个残骸。",
    eff: [
      { op: "strDown", p: 4, tag: "偷取" },
      { op: "str", p: 4, tag: "偷取" },
      { op: "note", text: "杜勒赛因在队：获得1个残骸（资源未建模）" }
    ] },

  { id: "yg_dream_moment", name: "美梦一刹",
    effect: "获得155点护盾和等同于当前护盾10%的临时力量。",
    eff: [
      { op: "block", p: 15 },
      { op: "strFromShield", pct: 10 }
    ] },

  { id: "yg_mansion_past", name: "深宅往事",
    effect: "获得1点算力并临时降低所有敌人43点力量。若「徐」在队伍中，对所有敌人施加1层痴醉。",
    eff: [
      { op: "energy", v: 1 },
      { op: "strDown", p: 4.1, temp: true },
      { op: "note", text: "「徐」在队：所有敌人1层痴醉（角色未入库）；43点≈物象4.1%（图鉴值反推）" }
    ] },

  { id: "yg_year_end_fireworks", name: "岁末花火",
    effect: "临时暴击率+15%，获得1点算力。本场战斗首次释放时对所有敌人造成1109点旧日余烬。",
    eff: [
      { op: "crit", v: 15 },
      { op: "energy", v: 1 },
      { op: "ember", s: 30, firstOnly: true }
    ] },

  { id: "yg_net_rotation", name: "罗网轮转",
    effect: "获得83点护盾和50%临时伤害强效。若「阿拉克涅」在队伍中，抽1张「永恒织造」并使其算力消耗-1。",
    eff: [
      { op: "block", p: 8 },
      { op: "boost", v: 50 },
      { op: "note", text: "阿拉克涅在队：抽「永恒织造」且其算力-1（角色未入库）" }
    ] },

  { id: "yg_new_world", name: "献给新世界",
    effect: "获得62点护盾，抽2张「技能」并赋予认知错乱。若沙耶在队伍中，获得1层羽种。",
    eff: [
      { op: "block", p: 6 },
      { op: "drawType", v: 2, cardType: "技能" },
      { op: "note", text: "「认知错乱」词条未建模；沙耶在队获得1层羽种（未结算）" }
    ] },

  { id: "yg_hollow_man", name: "空心人",
    effect: "临时暴击伤害+30%，临时降低所有敌人47点力量。若庞托斯在队伍中，获得1层围猎。",
    eff: [
      { op: "crit", v: 30, dmg: true },
      { op: "strDown", p: 4.5, temp: true },
      { op: "note", text: "庞托斯在队：获得1层围猎（未结算）" }
    ] },

  { id: "yg_eternal_new_chapter", name: "永续新篇",
    effect: "获得88点护盾，获得21点力量。若负誓·奥吉尔在队伍中，负誓·奥吉尔获得20点狂气，获得1层暗涌。",
    eff: [
      { op: "block", p: 8.5 },
      { op: "str", p: 2 },
      { op: "note", text: "负誓·奥吉尔在队：其获得20狂气+1层暗涌（暗涌未建模）" }
    ] },

  { id: "yg_whale_storm", name: "噬鲸的风暴",
    effect: "获得31点力量，选择1名唤醒体偷取其他唤醒体至多10点狂气。若蚀灭·萝坦在队伍中，下1张蚀灭·萝坦的「打击」额外生效1次。",
    eff: [
      { op: "str", p: 3 },
      { op: "gukuSteal", v: 10, pick: true },
      { op: "note", text: "蚀灭·萝坦在队：其下1张「打击」额外生效1次（未结算）" }
    ] },

  /* ===== 2026-10-05 补录批（钥令图鉴翻录，24 条新增）===== */

  { id: "yg_mountain_awake", name: "群山的觉悟",
    effect: "选择一名唤醒体，抽 2 张该唤醒体的指令卡。",
    eff: [
      { op: "drawOwner", v: 2, pick: true }
    ] },

  { id: "yg_tiny_wish", name: "小小心愿",
    effect: "选择 1 名唤醒体使其获得 35 点狂气。",
    eff: [
      { op: "guku", v: 35, pick: true }
    ] },

  { id: "yg_mouse_wisdom", name: "鼠鼠的智慧",
    effect: "获得 3 点算力。",
    eff: [
      { op: "energy", v: 3 }
    ] },

  { id: "yg_white_first", name: "纯白初遇",
    effect: "弃掉所有手牌，抽取弃掉数量 +2 的牌。",
    eff: [
      { op: "discardHandDraw" }
    ] },

  { id: "yg_undying_rite", name: "不朽的葬仪",
    effect: "所有唤醒体获得 15 点狂气，下回合开始时，获得 5% 最大生命 血献祭。",
    eff: [
      { op: "gukuAll", v: 15 },
      { op: "note", text: "下回合开始时获得 5% 最大生命的「血献祭」（词条未建模）" }
    ] },

  { id: "yg_fourth_movement", name: "第四乐章",
    effect: "本回合下一张打出的卡牌若算力消耗大于等于 3，获得 2 点算力，否则抽 2 张牌。若为本场战斗中第 4 次生效，改为直接获得 4 张「灵感」。",
    eff: [
      { op: "note", text: "下一张卡触发器（≥3费→+2算力，否则抽2；本场第4次生效改为置入4张「灵感」）未建模" }
    ] },

  { id: "yg_gunshot", name: "一声枪响",
    effect: "将 1 枚 闪耀偏方骰 置入手中，获得 15% 临时暴击率。",
    eff: [
      { op: "cardGen", cardId: "shared_dice", v: 1 },
      { op: "crit", v: 15 }
    ] },

  { id: "yg_midsummer_dream", name: "仲夏之梦",
    effect: "抽 1 张牌，如果抽到指令卡或灵知觉醒，将其算力消耗变为 0，并使其拥有者获得 20 点狂气。否则将这张牌弃掉并重复此条效果。",
    eff: [
      { op: "note", text: "循环抽卡直至指令卡/灵知觉醒→其费用变0+拥有者20狂气（循环/改费未建模）" }
    ] },

  { id: "yg_all_of_her", name: "全部的她",
    effect: "界域精通提高 24。选择 1 名唤醒体使其获得 24 点狂气。",
    eff: [
      { op: "guku", v: 24, pick: true },
      { op: "note", text: "界域精通+24（未建模）" }
    ] },

  { id: "yg_only_seed", name: "唯一的种子",
    effect: "选择 1 张手中的非衍生指令卡，获得一张附加 消耗 的原始复制，并使指令卡的所有者获得 15 点狂气。",
    eff: [
      { op: "note", text: "选手中非衍生指令卡→附加「消耗」的原始复制置手+其所有者15狂气（选牌复制未建模）" }
    ] },

  { id: "yg_retro_door", name: "跨越回溯之扉",
    effect: "从抽牌堆中选择 1 张牌加入手中，并使其算力消耗降低 1。",
    eff: [
      { op: "note", text: "从抽牌堆选牌置手+其费用-1（选牌机制未建模）" }
    ] },

  { id: "yg_door_answer", name: "门扉的答案",
    effect: "发现 3 个随机的钥令，选择其中 1 个触发其效果并获得 200 点银钥能量。",
    eff: [
      { op: "note", text: "发现3个随机钥令选1触发其效果+200银钥能量（发现机制未建模）" }
    ] },

  { id: "yg_black_swan", name: "黑天鹅的舞步",
    effect: "选择一名唤醒体，使其指令卡暴击率和暴击伤害临时提高 15% 并获得 15 点狂气。若莉兹在队伍中，还会将 1 张附加「消耗」的「腐化绿炎」置入手中。",
    eff: [
      { op: "crit", v: 15 },
      { op: "crit", v: 15, dmg: true },
      { op: "guku", v: 15, pick: true },
      { op: "note", text: "莉兹在队：1张附加「消耗」的「腐化绿炎」置入手牌（卡在库 card_liz_corrupt_fire，附加消耗置入未建模）；引擎 crit op 按全体临时近似（游戏内为选定唤醒体单体）" }
    ] },

  { id: "yg_tavern_door", name: "酒馆之门",
    effect: "将 1 张「莉雅的硬币」置入弃牌堆。",
    eff: [
      { op: "cardGen", cardId: "shared_leya_coin", v: 1, target: "discard" }
    ] },

  { id: "yg_hunt_resolve", name: "猎食决心",
    effect: "从出战唤醒体的技能卡中发现 3 张，选择 1 张将其临时复制置入手中，并使其算力消耗降低 1。若当前界域为「血肉」，可以选择「一扫而光！」。",
    eff: [
      { op: "note", text: "发现3张出战技能卡选1临时复制置手+费-1（发现机制未建模）；界域「血肉」可选「一扫而光！」" }
    ] },

  { id: "yg_undying_sun", name: "不落的太阳",
    effect: "获得 1 点算力和 30% 临时强效。若凯蒂古拉在队伍中，抽 1 张其「指令卡」并赋予 1 层「活焰」。",
    eff: [
      { op: "energy", v: 1 },
      { op: "boost", v: 30 },
      { op: "note", text: "凯蒂古拉在队：抽1张其指令卡+赋予1层「活焰」（词条未建模）" }
    ] },

  { id: "yg_displaced_fate", name: "错位命运",
    effect: "选择一名唤醒体使其获得 15 点狂气，从抽牌堆中抽 2 张算力消耗最低的卡牌。若卡斯托尔在队伍中，使其伤害强效临时提高 30%。",
    eff: [
      { op: "guku", v: 15, pick: true },
      { op: "drawLowCost", v: 2 },
      { op: "note", text: "卡斯托尔在队：其伤害强效临时+30%（单体boost未建模）" }
    ] },

  { id: "yg_midsummer_memento", name: "定格的仲夏留念",
    effect: "选择 1 名唤醒体，将 1 张算力消耗为 0 的临时「打击」置入手中。每第 3 次释放，改为将 1 张「美丽瞬间」置入手中，并使所有唤醒体临时暴击率提高 20%。",
    eff: [
      { op: "note", text: "0费临时「打击」置入手牌；每第3次释放改为「美丽瞬间」置手+全体临时暴击率20%（释放计数/衍生卡未建模）" }
    ] },

  { id: "yg_reunion_wish", name: "重逢心愿",
    effect: "从弃牌堆中选择 1 张指令卡移回手中。若「拉蒙娜」在队伍中，使其本回合打出的下一张指令卡生效 2 次。",
    eff: [
      { op: "note", text: "弃牌堆选指令卡回手；拉蒙娜在队：其本回合下一张指令卡生效2次（选牌/双发未建模）" }
    ] },

  { id: "yg_falseworld_color", name: "虚世之彩",
    effect: "选择一名唤醒体获得 20 点狂气，将 1 张「灵感」洗入抽牌堆。若皮克曼在队伍中，使其获得 1 层「创意」。",
    eff: [
      { op: "guku", v: 20, pick: true },
      { op: "cardGen", cardId: "shared_inspire", v: 1, target: "draw" },
      { op: "note", text: "皮克曼在队：其+1层「创意」（词条未建模）" }
    ] },

  { id: "yg_bleeding_heart", name: "泣血的圣心",
    effect: "抽 1 张牌并使其算力消耗-1，若抽到指令卡则使其拥有者获得 25% 临时暴击伤害。若波吕克斯在队伍中，获得 5 层罪印。",
    eff: [
      { op: "note", text: "抽1张牌其费-1+若为指令卡其拥有者25%临时暴伤；波吕克斯在队：+5层罪印（改费/条件触发/罪印未建模）" }
    ] },

  { id: "yg_off_course", name: "偏航船",
    effect: "获得 1 点算力，对所有敌人施加 5 层「降生仪式」。若「诞妄·墨菲」在队伍中，抽 1 张「螺湮圆舞」。",
    eff: [
      { op: "energy", v: 1 },
      { op: "note", text: "全体敌人5层「降生仪式」（词条在册未建模）；「诞妄·墨菲」在队：抽1张「螺湮圆舞」（卡在库 card_mf_dance，条件抽卡未建模）" }
    ] },

  { id: "yg_from_mist", name: "来自雾境",
    effect: "抽 2 张「打击」。若「茉夏」在队伍中，使它们算力消耗 -1。",
    eff: [
      { op: "drawType", v: 2, cardType: "打击" },
      { op: "note", text: "茉夏在队：抽到的「打击」算力消耗-1（改费未建模）" }
    ] },

  { id: "yg_drowned_purity", name: "溺亡的纯真",
    effect: "选择一名唤醒体获得 15 点狂气，其他唤醒体获得 5 点狂气。若「莫丝」在队伍中，立刻释放「涡！流！弹！」进行追击。",
    eff: [
      { op: "guku", v: 15, pick: true },
      { op: "gukuOthers", v: 5 },
      { op: "note", text: "莫丝在队：立刻释放「涡！流！弹！」追击（未建模）" }
    ] }
];
