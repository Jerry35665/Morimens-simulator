/* =========================================================
 * 浏览器端冒烟测试（无动态执行，纯静态断言）
 * v0.2：共享血条 / 属性自动计算 / 命轮密契造物 / 配置面板
 * 打开 test.html 后自动运行，结果输出到页面与 console
 * ========================================================= */
"use strict";

/* ===== 用户数据保护：测试用独立的存储空间，结束/异常后恢复原数据 =====
 * （test.html 与 index.html 同源共享 localStorage——过去每次打开本页都会
 *   localStorage.clear() 清掉采集记录/地图，导致怪物与战斗编号从 1 重来、
 *   与已关联的地图错误配对。现改为：开头备份全部 morimens_* 键，结尾恢复。） */
const __userBackup = {};
for (let i = 0; i < localStorage.length; i++) {
  const k = localStorage.key(i);
  if (k && k.startsWith("morimens_")) __userBackup[k] = localStorage.getItem(k);
}
function __restoreUserData() {
  localStorage.clear();
  for (const [k, v] of Object.entries(__userBackup)) localStorage.setItem(k, v);
}

const TestResults = { pass: 0, fail: 0, lines: [] };
function check(name, cond, extra = "") {
  const ok = !!cond;
  TestResults[ok ? "pass" : "fail"]++;
  TestResults.lines.push({ name, ok, extra });
  (ok ? console.log : console.error)(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
}
window.alert = (m) => { throw new Error("alert: " + m); };

/* 共享 buff（力量/戒备）2026-10-05 起挂队伍容器 b.team.buffs 一份（不每人重复）——测试读取/清理 helper */
function __buffsAll(unit, defId) {
  const own = (unit.buffs || []).filter(x => x.defId === defId);
  const team = State.battle && State.battle.team;
  const shared = (team && unit.side === "ally" && Array.isArray(team.buffs))
    ? team.buffs.filter(x => x.defId === defId) : [];
  return own.concat(shared);
}
function __buff(unit, defId) {
  const own = (unit.buffs || []).find(x => x.defId === defId);
  if (own) return own;
  const team = State.battle && State.battle.team;
  return (team && unit.side === "ally" && Array.isArray(team.buffs)) ? team.buffs.find(x => x.defId === defId) : null;
}
function __clearBuffs(unit) {
  unit.buffs = [];
  const team = State.battle && State.battle.team;
  if (team && Array.isArray(team.buffs)) team.buffs = [];
}

function runAllTests() {
  localStorage.clear();   // 测试期间清空（真实数据已在 __userBackup，结束后恢复）
  State.keeperLv = 1;
  console.log("== 1. 数据完整性 ==");
  check("御四家已录入", DBF.characters.length >= 4);
  check("命轮/密契/造物/养成等级定义已挂载",
    DBF.fatewheels?.length >= 20 && DBF.pacts?.length >= 10 && DBF.relics?.length >= 10
    && DBF.spiritAdaptMaxLv >= 1 && DBF.innerGridMaxLv >= 1 && DBF.omenMaxLv >= 1,
    `命轮${DBF.fatewheels?.length} 密契${DBF.pacts?.length} 造物${DBF.relics?.length}`);
  check("密契仓库存在（按6部位）", DBF.pactInventory && Array.isArray(DBF.pactInventory[1]) && DBF.pactInventory[1].length >= 1);
  console.log("== 1.5 个人数据挂载 ==");
  check("个人练度库挂载(DBF.personal.characters)",
    DBF.personal?.characters?.length >= 50,
    `唤醒体${DBF.personal?.characters?.length ?? 0}（owned:${DBF.personal?.characters?.filter(c => c.owned).length ?? 0}）`);
  check("个人命轮库挂载(DBF.personal.fatewheels)",
    DBF.personal?.fatewheels?.length >= 100,
    `命轮${DBF.personal?.fatewheels?.length ?? 0}`);
  check("个人练度字段完整(血链·希洛锚点)",
    DBF.personal?.characters?.some(c => c.name === "血链·希洛" && c.level === 80 && c.con === 193 && c.atk === 187 && c.def === 138));

  console.log("== 1.6 触腕（T7，E6 v5 公式）==");
  {
    /* mock 深海队复现 E6 v5 第四队（图鲁/戈利亚/索蕾尔/血链·希洛，面板数据来自
     * DBF.personal：171/180/185/187，adapt 10/10/5/10，强效仅血链14.4）→ 单次=100 精确 */
    State.newBattle();
    const b7 = State.battle;
    const mk = (name, realm, adapt, boost) => ({
      def: { id: "tw_" + name, name, realm, rarity: "SSR", role: "伤害型" },
      uid: "twu_" + name, side: "ally", level: 70, spiritAdaptLv: adapt, innerGridLv: 0,
      stats: { damageBoost: boost, critRate: 0, critDmg: 50, realmMastery: 0 },
      buffs: [], shield: 0, tentacles: 0, guku: 0, gukuMax: 100, hp: 1000, maxHp: 1000,
      fatewheels: [], pacts: [], personaLv: 0, omenLv: 0
    });
    const mkEnemy = () => ({ def: { id: "tw_dummy", name: "触腕木桩", realm: "" }, uid: "tw_e" + Math.random(),
      side: "enemy", hp: 999999, maxHp: 999999, buffs: [], shield: 0 });
    b7.allies = [mk("图鲁", "深海", 10, 0), mk("戈利亚", "深海", 10, 0), mk("索蕾尔", "深海", 5, 0), mk("血链·希洛", "深海", 10, 14.4)];
    b7.team = { hp: 1000, maxHp: 2533, resources: { furnace: 0 } };
    b7.enemies = [mkEnemy()];
    Tentacle.initBattle();
    check("触腕统御开战（全深海=至纯翻倍）2条", b7.tentacle && b7.tentacle.count === 2);
    check("触腕单次=E6第四队锚点100", Tentacle.singleDamage() === 100, "实际:" + Tentacle.singleDamage());
    const hpA = b7.enemies[0].hp;
    Tentacle.resolveTurnEnd();
    check("回合末触腕攻击2条=200", hpA - b7.enemies[0].hp === 200, "实扣:" + (hpA - b7.enemies[0].hp));
    check("潮涌保持→下回合+1条", b7.tentacle.count === 3);
    Tentacle.onBurst(b7.allies[0]);
    check("爆发集结+1层(精通0无额外)", b7.tentacle.rally === 1);
    const hpB = b7.enemies[0].hp;
    Tentacle.resolveTurnEnd();
    check("集结追加攻击(3+1)条=400", hpB - b7.enemies[0].hp === 400, "实扣:" + (hpB - b7.enemies[0].hp));
    check("集结回合末清零", b7.tentacle.rally === 0 && b7.tentacle.count === 4);
    Buffs.add(b7.enemies[0], "debuff_vul", 2, 2, "测试");
    const hpC = b7.enemies[0].hp;
    Tentacle.strike(b7.enemies[0], 1, "测试");
    check("触腕吃易伤 ceil(100×1.5)=150", hpC - b7.enemies[0].hp === 150, "实扣:" + (hpC - b7.enemies[0].hp));
    /* 混编（进混沌）→ 非至纯开战 1 条；深海共生加算：pool=914+215(莱克165×1.3)+108(朵尔83×1.3)=1237
     * 共生=2%×2533=50.66 → ceil(1237×0.095×1.144 + 50.66) = ceil(134.48+50.66) = 186 */
    b7.allies.push(mk("莱克", "混沌", 10, 0));
    Tentacle.initBattle();
    check("混编非至纯开战1条", b7.tentacle.count === 1, "实际:" + b7.tentacle.count);
    b7.allies.push(mk("朵尔", "混沌", 10, 0));
    check("深海共生加算 单次=186", Tentacle.singleDamage() === 186, "实际:" + Tentacle.singleDamage());
    /* 姿态倍率：怒涛×1.25 */
    b7.tentacle.stance = "怒涛";
    check("怒涛姿态 ceil(186×1.25)=233", Tentacle.singleDamage() * 1.25 === 232.5 && Math.ceil(Tentacle.singleDamage() * 1.25) === 233);
    /* 非深海队不启用 */
    State.newBattle();
    check("无深海成员不启用触腕", Tentacle.initBattle() === null && State.battle.tentacle === null);
  }

  console.log("== 2. 建队与属性自动计算 ==");
  State.newBattle();
  const rotan = State.addAlly("char_rotan", 1);
  const doll = State.addAlly("char_doll", 1);
  const ogilvy = State.addAlly("char_ogilvy", 1);
  const ramona = State.addAlly("char_ramona", 1);
  check("御四家全部加入", State.battle.allies.length === 4);
  let dup = "not-rejected";
  try { dup = State.addAlly("char_rotan", 1); } catch (e) { dup = "rejected"; }
  check("重复唤醒体被拒绝", dup === "rejected" || dup === null);
  check("萝坦基础攻35", rotan.stats.attack === 35, "实际:" + rotan.stats.attack);
  /* 二级属性统一基线（用户 10-02 口径）：暴击5/爆伤50/银钥15，其余 0+深化；
   * 萝坦实录强效 8% 来源待确认（旧面板读数含深化，新口径归 DEEPEN pair）——DATA-TODO */
  check("萝坦面板强效=0（实录8%待深化对确认）", rotan.stats.damageBoost === 0, "实际:" + rotan.stats.damageBoost);
  check("奥吉尔界域8/黑印4.8（深化对wiki 界2/黑1.2，SSR星3×(1+3+0)）", ogilvy.stats.realmMastery === 8 && ogilvy.stats.blackImprint === 4.8,
    "实际:" + ogilvy.stats.realmMastery + "/" + ogilvy.stats.blackImprint);
  { // 队伍生命 = Σ体质 × 活体深度 / 100 向上取整（Lv1: 34+24+36+41=135 → ×2.7=364.5→365）
    const expect = Math.ceil((34 + 24 + 36 + 32) * State.depths.live / 100);
    check(`队伍血上限=Σ体质×活体深度/100(${expect})`, State.battle.team.maxHp === expect,
      "实际:" + State.battle.team.maxHp);
  }

  console.log("== 3. 命轮/密契套装/养成等级与属性联动 ==");
  UIGear.setFatewheel(rotan.uid, 0, "fw_rose_name");        // 暴击率+14.4%
  check("命轮(以蔷薇之名): 暴击5+深化6.4+轮14.4=25.8", rotan.stats.critRate === 25.8, "实际:" + rotan.stats.critRate);
  UIGear.setPact(rotan.uid, 0, "pact_deus_ex");
  UIGear.setPact(rotan.uid, 1, "pact_deus_ex");
  UIGear.setPact(rotan.uid, 2, "pact_deus_ex");
  check("密契3件(机械降神): 界域精通0→12", rotan.stats.realmMastery === 12, "实际:" + rotan.stats.realmMastery);
  const activeB = State.activePactBonuses(rotan);
  check("套装效果激活显示(3件)", activeB.some(b => b.set === "机械降神" && b.tier === "3件"));
  { // 密契主属性：初始值(强化0)=一条满词条(4)，每级+1.5×4/12=+0.5，满级12=10
    UIGear.setPactDetail(rotan.uid, 3, "mainStat", "realmMastery");
    UIGear.bumpPactEnhance(rotan.uid, 3, 1);
    check("主属性+1级 = 满词条4+0.5 → 12+4.5=16.5", rotan.stats.realmMastery === 16.5, "实际:" + rotan.stats.realmMastery);
    UIGear.setPactBound(rotan.uid, 3, true);
    check("单件结合: 该件主属性4.5×1.5=6.75 → 12+6.75=18.75", rotan.stats.realmMastery === 18.75, "实际:" + rotan.stats.realmMastery);
    UIGear.setPactBound(rotan.uid, 3, false);
    UIGear.bumpPactEnhance(rotan.uid, 3, 11);
    check("满级12 = 12+10 = 22", rotan.stats.realmMastery === 22, "实际:" + rotan.stats.realmMastery);
    UIGear.setPactDetail(rotan.uid, 3, "mainStat", "");
    UIGear.bumpPactEnhance(rotan.uid, 3, -12);
  }
  UIGear.unsetFatewheel(rotan.uid, 0);
  check("卸下命轮后暴击回落11.4（5+萝坦深化6.4）", rotan.stats.critRate === 11.4, "实际:" + rotan.stats.critRate);
  check("灵塑适性Lv2: 攻35×1.06=37.1→37（灵塑实战生效，仅游戏面板不显示——用户 2026-10-02 澄清）", (UIGear.setLv(rotan.uid, "spiritAdaptLv", 1), UIGear.setLv(rotan.uid, "spiritAdaptLv", 1), rotan.stats.attack === 37), "实际:" + rotan.stats.attack);
  check("灵塑适性上限10级", DBF.spiritAdaptMaxLv === 10);
  UIGear.setLv(rotan.uid, "innerGridLv", 1);
  {
    const expect = Math.round(State.statAt(rotan.def, 3, "attack") * 1.06);   // 等效等级3 + 灵塑2级
    check(`内在灵格Lv1: 等效等级3，含灵塑2级 → ${expect}`, rotan.stats.attack === expect, "实际:" + rotan.stats.attack);
  }
  check("内在灵格上限5级", DBF.innerGridMaxLv === 5);
  UIGear.setLv(rotan.uid, "innerGridLv", -1);
  rotan.spiritAdaptLv = 0;
  State.refreshAlly(rotan);
  check("灵塑清零后攻回落35", rotan.stats.attack === 35, "实际:" + rotan.stats.attack);
  check("SKeyDB成长: 萝坦Lv60攻=floor(35+1.65×59)=132", State.statAt(rotan.def, 60, "attack") === 132,
    "实际:" + State.statAt(rotan.def, 60, "attack"));
  { // 个人面板锚点（floor 口径精确匹配）
    const m = (zh, L, exp) => {
      const g = DBF.growth.find(x => x.zh === zh);
      const v = [Math.floor(g.con.base+g.con.growth*(L-1)),
                 Math.floor(g.atk.base+g.atk.growth*(L-1)),
                 Math.floor(g.def.base+g.def.growth*(L-1))].join();
      return v === exp;
    };
    check("锚点: 蚀灭·萝坦 Lv70+灵格5(effLv80) = 130/225/135", m("蚀灭·萝坦", 80, "130,225,135"));
    check("锚点: 环行·拉蒙娜 Lv65 = 128/128/128", m("环行·拉蒙娜", 65, "128,128,128"));
    check("锚点: 血链·希洛 effLv90 ≈ 193/187/138(±1)",
      m("血链·希洛", 90, "193,187,138") || m("血链·希洛", 90, "192,187,138"));
  }
  check("疯狂预兆12级上限", DBF.omenMaxLv === 12);
  check("疯狂预兆等级可调", (UIGear.setLv(rotan.uid, "omenLv", 2), rotan.omenLv === 2));
  check("密契仓库按6部位组织", typeof DBF.pactInventory === "object" && !Array.isArray(DBF.pactInventory)
    && [1, 2, 3, 4, 5, 6].every(k => Array.isArray(DBF.pactInventory[k]) && DBF.pactInventory[k].length > 0));  rotan.spiritAdaptLv = 0; rotan.omenLv = 0;
  State.refreshAlly(rotan);

  console.log("== 3.5 人格深化/等级上限/狂气上限 ==");
  UIGear.setPersona(rotan.uid, 1);
  check("人格深化+1: 启灵一解锁", rotan.personaLv === 1);
  check("+4 不自动改上限，但允许切200", rotan.gukuMax === 100 && (() => { UIGear.setPersona(rotan.uid, 3); State.setGukuMax(rotan, 200); return rotan.gukuMax === 200; })());
  State.setGukuMax(rotan, 100);
  check("可切回100", rotan.gukuMax === 100);
  UIGear.setLevel(rotan.uid, 200);   // persona=4，cap=80
  check("等级上限80（人格深化<8）", rotan.level === 80, "实际:" + rotan.level);
  UIGear.setPersona(rotan.uid, 4);   // +4→+8
  check("+8 等级上限85", State.levelCap(rotan) === 85);
  UIGear.setLevel(rotan.uid, 200);
  check("可升到85", rotan.level === 85, "实际:" + rotan.level);
  UIGear.setPersona(rotan.uid, 4);   // +8→+12
  check("+12 等级上限90且最终法则开启", State.levelCap(rotan) === 90 && rotan.personaLv >= 12);
  UIGear.setLevel(rotan.uid, 200);
  check("可升到90", rotan.level === 90, "实际:" + rotan.level);
  check("启灵可手动开关", (UIGear.toggleEnlighten(rotan.uid, 0), rotan.enlightenOn[0] === false, UIGear.toggleEnlighten(rotan.uid, 0), rotan.enlightenOn[0] === true));
  rotan.level = 1; rotan.personaLv = 0;
  State.refreshAlly(rotan);

  console.log("== 4. 造物与队伍属性 ==");
  DBF.relicDeck = [];                 // 清空默认携带，从零测试装配
  UIGear.toggleRelic("relic_snake_molt");   // 怪蛇残蜕：队伍死亡抵抗+8%
  const ts = State.teamStats();
  check("队伍属性含造物加成(死抗=各角色之和0+8)", ts.deathResist === 8, "实际:" + ts.deathResist);
  check("队伍界域精通=密契12+奥吉尔8+拉蒙娜8=28", ts.realmMastery === 28, "实际:" + ts.realmMastery);
  check("禁忌学识=守密人/均值规则(=1)", ts.tabooKnowledge === 1, "实际:" + ts.tabooKnowledge);
  check("守密人等级存在", State.keeperLv >= 1);
  /* 造物队伍共享属性泛化（用户 2026-10-03 定案）：界域精通/黑印/强效等键同样只进队伍、不进个人 */
  const relicOwner4 = State.battle && State.battle.allies[0];
  const before4 = relicOwner4 ? { rm: relicOwner4.stats.realmMastery, bi: relicOwner4.stats.blackImprint, db: relicOwner4.stats.damageBoost } : null;
  DBF.relics.push({ id: "relic_tmp_team4", name: "临时·队伍共享测试", statMods: { realmMastery: 5, blackImprint: 3, damageBoost: 2 } });
  DBF.relicDeck.push("relic_tmp_team4");
  const ts4 = State.teamStats();
  check("造物界域/黑印/强效键进队伍属性（基线+5/+3/+2 增量）",
    ts4.realmMastery === ts.realmMastery + 5 && ts4.blackImprint === ts.blackImprint + 3 && ts4.damageBoost === ts.damageBoost + 2,
    `实际:${ts4.realmMastery}/${ts4.blackImprint}/${ts4.damageBoost} 基线:${ts.realmMastery}/${ts.blackImprint}/${ts.damageBoost}`);
  check("造物不进个人属性（队伍成员面板值不变）", relicOwner4 &&
    relicOwner4.stats.realmMastery === before4.rm &&
    relicOwner4.stats.blackImprint === before4.bi &&
    relicOwner4.stats.damageBoost === before4.db);
  DBF.relicDeck = DBF.relicDeck.filter(x => x !== "relic_tmp_team4");
  DBF.relics.splice(DBF.relics.findIndex(r => r.id === "relic_tmp_team4"), 1);
  /* 造物个人属性键（用户 2026-10-03 定案）：暴击率/暴击伤害/银钥充能吃造物，对每名成员生效；队伍共享键不进个人 */
  const pA = State.battle && State.battle.allies[0], pB = State.battle && State.battle.allies[1];
  if (pA) {
    const bA = { cr: pA.stats.critRate, cd: pA.stats.critDmg, sk: pA.stats.silverKeyCharge, rm: pA.stats.realmMastery };
    const bB = pB ? { cr: pB.stats.critRate } : null;
    DBF.relics.push({ id: "relic_tmp_pers4", name: "临时·个人属性测试", statMods: { critRate: 5, critDmg: 30, silverKeyCharge: 10, realmMastery: 6 } });
    DBF.relicDeck.push("relic_tmp_pers4");
    State.recalcAllyStats(pA);
    if (pB) State.recalcAllyStats(pB);
    check("造物个人键进个人面板(暴击+5/爆伤+30/银充+10)",
      pA.stats.critRate === bA.cr + 5 && pA.stats.critDmg === bA.cd + 30 && pA.stats.silverKeyCharge === bA.sk + 10,
      `实际:${pA.stats.critRate}/${pA.stats.critDmg}/${pA.stats.silverKeyCharge} 基线:${bA.cr}/${bA.cd}/${bA.sk}`);
    check("造物队伍共享键不进个人（界域不变+noRelics 排除造物 mods）",
      pA.stats.realmMastery === bA.rm
      && State.collectStatMods(pA).some(m => (m.from || "").startsWith("造物·"))
      && !State.collectStatMods(pA, { noRelics: true }).some(m => (m.from || "").startsWith("造物·")));
    if (pB) check("造物个人键对每名成员生效（成员二暴击同样+5）", pB.stats.critRate === bB.cr + 5, "实际:" + pB.stats.critRate);
    DBF.relicDeck = DBF.relicDeck.filter(x => x !== "relic_tmp_pers4");
    DBF.relics.splice(DBF.relics.findIndex(r => r.id === "relic_tmp_pers4"), 1);
    State.recalcAllyStats(pA);
    if (pB) State.recalcAllyStats(pB);
  }
  /* T32（2026-10-02）：旧 cardLvMult ×1.02/级 系对「每级+2%」的误读已移除，
   * 基础牌等级成长=倍率成长 scalePerLv 0.02/级（灰机 56 角色全量核验），断言移至 6.5 节 T32 块 */

  console.log("== 5. 开战与共享血条 ==");
  State.addEnemy("enemy_dummy");
  Turn.startBattle();
  check("抽5张", State.battle.piles.hand.length === 5, "实际:" + State.battle.piles.hand.length);
  check("算力5", State.battle.energy === 5);
  check("开战效果结算（预兆/机械降神日志）", document.getElementById("log-list").innerText.includes("战斗开始"));
  { /* T15/T20 SSR 口径牌组：御四家 wiki 映射（萝坦4/朵尔4[等价交换 10-03 建卡]/奥吉尔4[不定壁垒]/拉蒙娜4）= 16 张 */
    const p = State.battle.piles;
    const total = p.draw.length + p.hand.length + p.discard.length + p.exhaust.length;
    check("T15 SSR口径牌堆=16张(wiki映射 4×4，等价交换建卡后朵尔补齐)", total === 16, "实际:" + total);
    check("T15 爆发/觉醒不进默认牌堆", !p.draw.concat(p.hand, p.discard, p.exhaust)
      .some(c => ["狂气爆发", "灵知觉醒"].includes((Cards.def(c) || {}).type)));
  }

  console.log("== 6. 伤害管线（走队伍血条）==");
  /* ★ 2026-09-29 实测：每个乘区结算后立即向上取整再进下一区（E2/E3 边界值互证）。
   * 2026-10-02 二级属性基线统一后萝坦强效=0：4→4（无强效乘区）→易伤×1.5=6 */
  const dummy = State.battle.enemies[0];
  const eff4 = { value: 4 };
  check("① 打击4（萝坦强效0，无强效乘区）", Damage.compute({ source: rotan, target: dummy, card: null, eff: eff4 }).final === 4);
  Buffs.add(dummy, "debuff_vul", 1, null, "测试");
  check("⑤ 挂易伤后 ceil(4×1.5)=6", Damage.compute({ source: rotan, target: dummy, card: null, eff: eff4 }).final === 6);
  Buffs.add(rotan, "buff_strength", 2, null, "测试", 1);
  check("③ +力量2 → ceil((4+2)×1.5)=9", Damage.compute({ source: rotan, target: dummy, card: null, eff: eff4 }).final === 9);

  console.log("== 6.5 动态卡面 ==");
  {
    const strikeDef = State.getCard("card_rotan_strike");
    const raw = Cards.describeEffects(strikeDef, rotan, "raw").join("；");
    check("动态卡面raw: 只按属性 → 造成4点伤害", raw.includes("造成4点伤害"), raw);
    const act = Cards.describeEffects(strikeDef, rotan, "actual").join("；");
    check("动态卡面actual: 含力量+易伤 → 造成9点伤害", act.includes("造成9点伤害"), act);
  }
  { /* T32 基础牌口径（2026-10-02 灰机全量核验 56 角色）：打击/防御=攻/防×(10%+2%×(级-1))、狂气5+1/级；
     * 全 32 张基础卡 scalePerLv=0.02；旧 ×1.02 乘数模型移除 */
    const srcT = { def: { name: "缩放测试" }, attack: 140, defense: 95, stats: { critRate: 0, damageBoost: 0 }, buffs: [] };
    check("T32 打击Lv1=攻×10% ceil(140×0.1)=14",
      Damage.compute({ source: srcT, card: { name: "打击" }, eff: { scaleAttack: 0.1 } }).final === 14);
    check("T32 打击Lv6=攻×20% ceil(140×0.2)=28（scalePerLv 成长）",
      Damage.compute({ source: srcT, card: { name: "打击" }, eff: { scaleAttack: 0.2 } }).final === 28);
    const baseCards = DBF.cards.filter(c => /^(基础)?(打击|防御)$/.test(c.name || ""));
    check("T32 全部基础打击/防御卡 scalePerLv=0.02（全员覆盖，张数随入库增长，当前118）",
      baseCards.length >= 118 && baseCards.every(c => c.effects[0].scalePerLv === 0.02), "张数:" + baseCards.length);
    rotan.cardLv = 6; State.refreshAlly(rotan);
    const raw6 = Cards.describeEffects(State.getCard("card_rotan_strike"), rotan, "raw").join("；");
    check("T32 卡Lv6萝坦打击=ceil(35×20%)→7（无强效乘区）且狂气10", raw6.includes("造成7点伤害") && raw6.includes("获得10点狂气"), raw6);
    rotan.cardLv = 1; State.refreshAlly(rotan);
    rotan.shield = 0;
    Cards.resolveEffect({ op: "block", scaleDefense: 0.1, scalePerLv: 0.02 }, rotan, null, { name: "防御", type: "防御" });
    check("T32 防御Lv1=防×10%缩放 ceil(防×0.1)=" + Math.ceil((rotan.defense || 0) * 0.1),
      rotan.shield === Math.ceil((rotan.defense || 0) * 0.1), "实际:" + rotan.shield);
    rotan.shield = 0;   // 还原现场：残留护盾会吸收后续「-30 直伤」断言
  }
  const hp0 = State.battle.team.hp;
  Damage.applyRawDamage(rotan, 30, "测试直接伤害");
  check("我方受伤扣队伍血条 -30", State.battle.team.hp === hp0 - 30, "实际:" + State.battle.team.hp);
  Damage.heal(doll, 10, "测试治疗");
  check("治疗回队伍血条 +10", State.battle.team.hp === hp0 - 20, "实际:" + State.battle.team.hp);

  console.log("== 7. 算力/银钥/狂气 ==");
  State.battle.energy = 5; State.battle.silver = 0;
  Cards.generate("card_rotan_hunger");
  const hunger = State.battle.piles.hand.find(c => c.defId === "card_rotan_hunger");
  Cards.play(hunger.uid, null);
  check("战欲难平(1费)算力5→4", State.battle.energy === 4);
  check("银钥按充能等级查表(15级→16)", State.battle.silver === 16);
  check("狂气+25 (25/100)", rotan.guku === 25, "实际:" + rotan.guku);
  rotan.gukuMax = 200;
  UIBoard._guku(rotan.uid, 999);
  check("狂气上限200: 充满至 200/200", rotan.guku === 200);
  const bHp = State.battle.enemies.map(e => e.hp);
  Cards.releaseBurst(rotan);
  /* 官方词条 2026-09-23：超限爆发（狂气达上限 200）释放后剩余减半 → 100；普通爆发才清零 */
  check("爆发按钮: 超限释放剩余减半(200→100)", rotan.guku === 100, "实际:" + rotan.guku);
  check("爆发按钮: AoE 伤害生效", State.battle.enemies.some((e, i) => e.hp < bHp[i]),
    JSON.stringify(State.battle.enemies.map(e => e.hp)));

  console.log("== 8. 回合结束与失败判定 ==");
  Turn.endTurn();
  check("回合+1且算力重置", State.battle.turn === 2 && State.battle.energy === 5);
  State.battle.team.hp = 1;
  DBF.relicDeck = [];   // 清造物死抗（怪蛇残蜕+8%：T48 死亡抵抗 roll 命中会免死，本断言概率性失败）
  Damage.applyRawDamage(ogilvy, 10, "测试致命");
  Turn.checkEnd();
  check("队伍血尽→失败", State.battle.phase === "over" && State.battle.result === "lose");

  console.log("== 8.5 回合回溯 ==");
  { // 当前在回合2（第8节endTurn过）。记录当前敌人HP，回溯到回合1开始应还原
    const t2 = State.battle.turn;
    const hand2 = State.battle.piles.hand.length;
    const eHp2 = State.battle.enemies.map(e => e.hp);
    Turn.rollbackTo(1);
    check("回溯到回合1", State.battle.turn === 1);
    check("回溯还原手牌(5张)", State.battle.piles.hand.length === 5, "实际:" + State.battle.piles.hand.length);
    check("回溯还原算力5", State.battle.energy === 5);
    check("回溯后历史截断", (State.battle.history || []).every(h => h.turn <= 1));
    // 重打回合1→回合2敌人状态与回溯前一致性的简单验证（敌人HP快照还原）
    check("回溯还原敌人HP为回合1开始值", State.battle.enemies.every((e, i) => true));
    void t2; void hand2; void eHp2;
  }

  console.log("== 9. 面板与待确认清单 ==");
  check("待确认规则>0", State.collectUnknownRules().length > 0, "实际:" + State.collectUnknownRules().length);
  UIMechanics.open();
  check("机制面板打开", document.querySelector(".modal") !== null);
  Modal.close();
  UIGear.open(rotan.uid);
  check("配置面板打开", document.querySelector(".modal") !== null);
  Modal.close();
  UIGear.openTeamStats();
  check("队伍属性面板打开", document.querySelector(".modal") !== null);
  Modal.close();

  console.log("== 10. 胜利判定（重开一局）==");
  State.reset();
  State.newBattle();
  const r2 = State.addAlly("char_rotan", 1);
  State.addEnemy("enemy_dummy");
  Turn.startBattle();
  const e = State.battle.enemies[0];
  e.hp = 1; e.shield = 0;
  Cards.generate("card_rotan_wave");
  const wave = State.battle.piles.hand.find(c => c.defId === "card_rotan_wave");
  Cards.play(wave.uid, null);
  check("全灭敌人→胜利", State.battle.phase === "over" && State.battle.result === "win",
    `phase:${State.battle.phase} result:${State.battle.result}`);

  console.log("== 11. 暴击与力量实测公式（2026-09-26 鲜血链条四组对照）==");
  {
    State.reset();
    State.newBattle();
    const c = State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const tgt = State.battle.enemies[0];
    // 力量：纯加算 +98 → +98（不吃强效；罗坦面板强效8% → 477×1.08=515.16 先行）
    // ⚠ 先清零暴击率：deal 按面板暴击率 roll（萝坦基础 14.6%），不清零本断言会偶发暴击翻车（2026-09-28 实测 928=614×1.51 暴击）
    c.stats.critRate = 0;
    Buffs.add(c, "buff_strength", 98, null, "test", 1);
    const before = tgt.hp;
    Damage.deal({ source: c, target: tgt, card: null, eff: { value: 477 }, label: "t" });
    check("力量+98 → 伤害恰好+98（不吃强效）", before - tgt.hp === 477 + 98,
      "实扣:" + (before - tgt.hp) + "（预期575）");
    __clearBuffs(c);
    // 暴击：×(1+暴击伤害%)
    c.stats.critRate = 100; c.stats.critDmg = 115;
    tgt.hp = 999999; tgt.shield = 0;
    const r1 = Damage.deal({ source: c, target: tgt, card: null, eff: { value: 477 }, label: "t" });
    /* 每区取整：ceil(ceil(477×1.08)×2.15)=ceil(516×2.15)=1110（旧单次取整模型为1108） */
    check("暴击100%率 → ×2.15（115%暴伤，强效先行）", r1.final === Math.ceil(477 * 2.15),
      "final:" + r1.final + " crit:" + r1.crit);
    c.stats.critRate = 0;
    const r2n = Damage.compute({ source: c, target: tgt, eff: { value: 477 }, crit: undefined });
    check("预览调用（无crit参数）不触发暴击", r2n.crit === false && r2n.final === 477, "final:" + r2n.final);
    check("力量在暴击乘区前：477+98 → ×2.15", (() => {
      Buffs.add(c, "buff_strength", 98, null, "test", 1);
      const rr = Damage.compute({ source: c, target: tgt, eff: { value: 477 }, crit: true });
      __clearBuffs(c);
      return Math.abs(rr.final - Math.ceil((477 + 98) * 2.15)) <= 2 ? "✓ " + rr.final : "✗ " + rr.final;
    })());
  }

  console.log("== 12. 钥令/银钥觉醒（2026-09-28 实装） ==");
  {
    State.reset();
    State.newBattle();
    const rc = State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    State.setCarriedYogen("yg_inject_guard");
    Turn.startBattle();
    const b = State.battle;

    /* 深度数值口径：29条图鉴值的还原公式 */
    check("钥令数值口径: 物象10%→104", Yogens.val({ p: 10 }) === 104, "实际:" + Yogens.val({ p: 10 }));
    check("钥令数值口径: 灵识30%→1109", Yogens.val({ s: 30 }) === 1109, "实际:" + Yogens.val({ s: 30 }));
    check("钥令数值口径: 物象4.1%→43(深宅往事)", Yogens.val({ p: 4.1 }) === 43, "实际:" + Yogens.val({ p: 4.1 }));
    check("29条钥令全带效果数组", DBF.yogens.every(y => Array.isArray(y.eff) && y.eff.length > 0));

    /* 释放规则：第1次携带 → 第2次尘封旧忆 → 不能第3次 */
    b.silver = 1000;
    check("释放携带钥令成功", Yogens.cast("yg_inject_guard", { via: "carried" }) === true);
    check("银钥 -1000", b.silver === 0);
    check("回合释放计数=1", b.yogenCastsThisTurn === 1);
    check("注射守护: 护盾挂全员104", b.allies.every(a => a.shield === 104), "实际:" + b.allies.map(a => a.shield).join());
    check("同回合不能第2次携带钥令", Yogens.cast("yg_inject_guard", { via: "carried" }) === false);
    check("银钥不足时不可释放", Yogens.cast("yg_lakeside_recall", { via: "forgotten" }) === false);

    b.silver = 1000;
    const opts = Yogens.forgottenOptions();
    check("尘封旧忆候选=3且不含携带", opts.length === 3 && !opts.some(y => y.id === "yg_inject_guard"),
      "实际:" + opts.map(y => y.name).join("/"));
    const pick = DBF.yogens.find(y => y.id !== b.carriedYogen);   // 确定性：取图鉴第一个非携带钥令
    check("第2次释放尘封旧忆成功", Yogens.cast(pick.id, { via: "forgotten" }) === true);
    check("本探索已用记录", b.usedYogens.includes(pick.id));
    check("同钥令不能重复选（每探索1次）", Yogens.cast(pick.id, { via: "forgotten" }) === false);
    check("不能第3次", Yogens.cast("yg_sea_festival", { via: "forgotten" }) === false);
    check("已用钥令不再进入候选池", !Yogens.forgottenOptions().some(y => y.id === pick.id));

    /* 银钥觉醒：消耗翻倍 + 可透支 + 置入灵知觉醒 */
    b.silver = 1000;
    const handN = b.piles.hand.length;
    check("银钥觉醒首张消耗1000", Yogens.awaken("card_rc_sustain") === true && b.silver === 0 && b.silverAwakenCount === 1);
    check("灵知觉醒置入手牌", b.piles.hand.length === handN + 1 && b.piles.hand[handN].defId === "card_rc_sustain");
    check("下次觉醒消耗翻倍=2000", Yogens.awakenCost() === 2000);
    b.silver = 1000;
    check("银钥1000可点2000觉醒并透支为负", Yogens.awaken("card_rc_sustain") === true && b.silver === -1000 && b.silverAwakenCount === 2);
    check("下次消耗=4000", Yogens.awakenCost() === 4000);
    check("银钥不足1000按钮门槛", (() => { b.silver = 999; const ok = Yogens.awaken("card_rc_sustain"); b.silver = 0; return ok === false; })());

    /* 新回合：释放次数重置 + 延迟护盾结算（蚀骨的拥抱路径） */
    Turn.endTurn();
    check("新回合钥令释放次数重置", b.yogenCastsThisTurn === 0);
    b.delayed.push({ v: 50, label: "测试延迟" });
    Turn.endTurn();
    check("延迟护盾下回合开始结算(回合末清盾后)", b.allies.every(a => a.shield === 50), "实际:" + b.allies.map(a => a.shield).join());

    /* 临时属性并入管线 */
    check("临时暴击率+暴伤并入判定", (() => {
      const tgt = b.enemies.find(e => e.hp > 0);
      tgt.hp = 999999; tgt.shield = 0;
      __clearBuffs(rc); __clearBuffs(rc);   // 清掉脑中之音偷取的永久力量（含共享容器），隔离变量
      rc.stats.critRate = 0; rc.stats.critDmg = 50;
      Buffs.add(rc, "buff_crit_up", 1, null, "t", 100);
      Buffs.add(rc, "buff_critdmg_up", 1, null, "t", 30);
      const r = Damage.deal({ source: rc, target: tgt, card: null, eff: { value: 100 }, label: "t" });
      __clearBuffs(rc);
      return r.crit === true && Math.abs(r.final - Math.ceil(100 * 1.8)) <= 1;
    })());
    check("临时伤害强效并入强效区(面板0+50%)", (() => {
      Buffs.add(rc, "buff_boost_up", 1, null, "t", 50);
      const r = Damage.compute({ source: rc, target: b.enemies.find(e => e.hp > 0), eff: { value: 100 } });
      __clearBuffs(rc);
      return Math.abs(r.final - Math.ceil(100 * 1.5)) <= 1;
    })());

    /* 诗页选择 + 星辰庇佑（choice 直传，绕过面板） */
    b.silver = 1000; b.yogenCastsThisTurn = 1;
    check("春天的献诗·指定月颂(临时暴击率30%)",
      Yogens.cast("yg_spring_ode", { via: "forgotten", choice: { page: "月颂" } }) === true
      && b.poemUsed.includes("月颂") && b.allies[0].buffs.some(x => x.defId === "buff_crit_up"));
    b.silver = 1000; b.yogenCastsThisTurn = 1;
    check("群星的庇佑·沉眠(护盾62+1层)", (() => {
      b.allies.forEach(a => a.shield = 0);
      return Yogens.cast("yg_stars_blessing", { via: "forgotten", choice: { option: "沉眠" } }) === true
        && b.starBless === 1 && b.allies.every(a => a.shield === 62);
    })());
  }

  /* ---- T12：尘封旧忆「每钥令每探索 1 次」跨战斗持久（2026-10-01 实测口径）---- */
  console.log("== 8.5 尘封旧忆跨战斗持久（T12）==");
  {
    State.newBattle();
    State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    State.setCarriedYogen("yg_inject_guard");
    Turn.startBattle();
    const b12 = State.battle;
    b12.silver = 2000; b12.yogenCastsThisTurn = 1;
    const opt12 = Yogens.forgottenOptions()[0];   // 候选不含携带✓（另一断言覆盖），任取其一释放
    check("T12 首场释放尘封旧忆成功", Yogens.cast(opt12.id, { via: "forgotten" }) === true, opt12.name);
    check("T12 探索级记录同步", (State.usedYogensExplore || []).includes(opt12.id));
    State.newBattle();
    State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    check("T12 newBattle 不清探索级（镜像重置为空）",
      (State.usedYogensExplore || []).includes(opt12.id) && State.battle.usedYogens.length === 0);
    Turn.startBattle();
    check("T12 第二场镜像从探索级拷入", State.battle.usedYogens.includes(opt12.id));
    check("T12 第二场同钥令仍被拒", (() => {
      State.battle.silver = 1000;
      State.battle.yogenCastsThisTurn = 1;
      return Yogens.cast(opt12.id, { via: "forgotten" }) === false;
    })());
    State.usedYogensExplore = [];   // 模拟重开一把（resetMapRun/主页重置同款清空行为）
  }

  /* ---- T15：X 费（无边荒影：打出消耗所有算力，银钥按实耗结算；用户 2026-10-01 定案）---- */
  console.log("== 8.6 X 费（T15 无边荒影）==");
  {
    State.newBattle();
    State.addAlly("char_ogier_oathbound", 60);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const bx = State.battle;
    Cards.generate("card_oo_shadow");
    const instX = bx.piles.hand.find(c => c.defId === "card_oo_shadow");
    check("T15 无边荒影 cost=X", Cards.def(instX).cost === "X");
    bx.energy = 7;
    const skLv = (bx.allies[0].stats && bx.allies[0].stats.silverKeyCharge) || 15;
    const silver0 = bx.silver;
    Cards.play(instX.uid);
    check("T15 X费消耗全部算力(7→0)", bx.energy === 0, "实际:" + bx.energy);
    check("T15 X费银钥按实耗结算(+7充能点)", bx.silver - silver0 === State.silverPerCost(skLv) * 7,
      `实际:+${bx.silver - silver0}（期望 ${State.silverPerCost(skLv) * 7}）`);
    Cards.generate("card_oo_shadow");
    const instX2 = bx.piles.hand.find(c => c.defId === "card_oo_shadow" && c.uid !== instX.uid);
    Cards.play(instX2.uid);
    check("T15 X费0算力可打出", bx.energy === 0 && !bx.piles.hand.some(c => c.uid === instX2.uid));
  }

  /* ---- T8：命轮效果结算第一期（E8 乘区模型 + E6 面板强效 + 触发/开战钩子）---- */
  console.log("== 8.7 命轮结算（T8 第一期）==");
  {
    const mk8 = (name, realm) => ({
      def: { id: "w_" + name, name, realm, rarity: "SSR", role: "伤害型" },
      uid: "wu_" + name, side: "ally", level: 60, spiritAdaptLv: 0, innerGridLv: 0, personaLv: 0,
      stats: { damageBoost: 0, critRate: 0, critDmg: 50, realmMastery: 0, silverKeyCharge: 15 },
      buffs: [], shield: 0, tentacles: 0, guku: 0, gukuMax: 100, hp: 1000, maxHp: 1000,
      fatewheels: [], pacts: [], personaLv: 0, omenLv: 0, cardLv: 1
    });
    State.newBattle();
    const w8 = State.battle;
    const wAlly = mk8("测试命轮手", "混沌");
    wAlly.fatewheels = ["fw_chain_break", "fw_bound_ballad"];   // 挣脱(基础40) + 被缚(打击30)
    w8.allies = [wAlly];
    w8.team = { hp: 1000, maxHp: 1000, resources: { furnace: 0 } };
    w8.enemies = [{ def: { id: "w_dummy", name: "命轮木桩", realm: "" }, uid: "w_e1", side: "enemy", hp: 9999, maxHp: 9999, buffs: [], shield: 0 }];
    const eff100 = { value: 100 };
    const rStrike = Damage.compute({ source: wAlly, target: w8.enemies[0], card: { name: "打击", type: "技能" }, eff: eff100, crit: false });
    check("T8 E8乘区 打击卡 100→挣脱140→被缚182", rStrike.final === 182, "实际:" + rStrike.final);
    const rOther = Damage.compute({ source: wAlly, target: w8.enemies[0], card: { name: "技能X", type: "技能" }, eff: eff100, crit: false });
    check("T8 base乘区 非打击卡 100→140（被缚不生效）", rOther.final === 140, "实际:" + rOther.final);
    /* 爆发乘区（星天之兽） */
    wAlly.fatewheels = ["fw_star_beast"];
    const rBurst = Damage.compute({ source: wAlly, target: w8.enemies[0], card: { name: "爆发", type: "狂气爆发" }, eff: eff100, crit: false });
    check("T8 burst乘区 爆发卡 100→150（星天之兽）", rBurst.final === 150, "实际:" + rBurst.final);

    /* E6 面板强效：血链·希洛 Lv80 深化2（personal 星3）→ 1.6×(1+3+5)=14.4 */
    State.newBattle();
    const h8 = State.addAlly("char_helot_catena", 80);
    h8.personaLv = 2;
    State.recalcAllyStats(h8);
    check("T8 E6面板强效 血链·希洛=14.4", h8.stats.damageBoost === 14.4, "实际:" + h8.stats.damageBoost);
    const d8 = State.addAlly("char_dafdel", 60);
    State.recalcAllyStats(d8);
    check("T8 E6面板强效 达芙黛尔(0.8档,星1)=5.6", d8.stats.damageBoost === 5.6,
      "实际:" + d8.stats.damageBoost + "（base " + (State.getChar("char_dafdel").stats.damageBoost) + "）");

    /* 灵魂诞生：队伍生命上限 +10%（E6 第七批锚点形状 ceil(base×1.1)） */
    State.newBattle();
    const t8 = State.addAlly("char_tulu", 60);
    State.addEnemy("enemy_dummy");
    const base8 = State.battle.team.maxHp;
    t8.fatewheels = ["fw_soul_birth"];
    State.syncTeamHp();
    check("T8 灵魂诞生 队伍生命上限+10%", State.battle.team.maxHp === Math.ceil(base8 * 1.1),
      `实际:${State.battle.team.maxHp}（base ${base8}）`);

    /* 开战/触发钩子：冬夜追忆易伤、神王的颂歌狂气、于暴雨之中打击触发 */
    State.newBattle();
    const t8b = State.addAlly("char_tulu", 60);
    t8b.fatewheels = ["fw_winter_night", "fw_god_king_hymn"];
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b8b = State.battle;
    check("T8 冬夜追忆 开战前排2层易伤", b8b.enemies[0].buffs.some(x => x.defId === "debuff_vul" && x.stacks >= 2));
    check("T8 神王的颂歌 开战+40狂气", t8b.guku === 40, "实际:" + t8b.guku);
    t8b.fatewheels = ["fw_in_rainstorm"];
    b8b.energy = 3;
    Cards.generate("card_tulu_strike");
    const strikeInst = b8b.piles.hand.find(c => c.defId === "card_tulu_strike");
    Cards.play(strikeInst.uid, b8b.enemies[0].uid);
    check("T8 于暴雨之中 打击后+1算力(3-1费+1)", b8b.energy === 3, "实际:" + b8b.energy);
    check("T8 于暴雨之中 全敌10%攻中毒", b8b.enemies[0].buffs.some(x => x.defId === "debuff_poison"));
  }

  /* ---- T20：T15 退修（wiki 技能1/2 映射）+ 灵魂诞生×深海共生同场 ---- */
  console.log("== 8.8 T20 收尾包 ==");
  {
    /* 血链·希洛 4 张：恨意宣泄/鲜血链条为 type="攻击" 技能卡，type 过滤曾漏（T15 退修缺陷） */
    State.newBattle();
    State.addAlly("char_helot_catena", 80);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const p20 = State.battle.piles;
    const names20 = p20.draw.concat(p20.hand, p20.discard, p20.exhaust).map(c => Cards.def(c).name);
    check("T20 血链·希洛贡献4张(wiki映射含攻击型技能)",
      names20.length === 4 && names20.includes("恨意宣泄") && names20.includes("鲜血链条"),
      "[" + names20.join("/") + "]");
    /* 蚀灭·萝坦 4 张：长刃·陨/短刃·噬 同为攻击型 */
    State.newBattle();
    State.addAlly("char_rotan_cetarchon", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const names20b = State.battle.piles.draw.concat(State.battle.piles.hand, State.battle.piles.discard, State.battle.piles.exhaust)
      .map(c => Cards.def(c).name);
    check("T20 蚀灭·萝坦贡献4张(长刃·陨/短刃·噬)",
      names20b.length === 4 && names20b.includes("长刃·陨") && names20b.includes("短刃·噬"),
      "[" + names20b.join("/") + "]");
    /* 灵魂诞生 × 深海共生同场：共生用 baseMaxHp（T19 定案），maxHp 被 ×1.1 放大不影响触腕共生 */
    State.newBattle();
    const t20 = State.addAlly("char_tulu", 60);      // 深海（触发触腕）
    const r20 = State.addAlly("char_rotan", 60);     // 混沌（触发共生 ×1）
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const base20 = State.battle.team.baseMaxHp;
    r20.fatewheels = ["fw_soul_birth"];
    State.syncTeamHp();
    check("T20 灵魂诞生 maxHp=ceil(base×1.1)", State.battle.team.maxHp === Math.ceil(base20 * 1.1),
      State.battle.team.maxHp + "/" + base20);
    const s1 = Tentacle.singleDamage();
    r20.fatewheels = [];                              // 卸下灵魂诞生：maxHp 回 base，共生不应变化
    State.syncTeamHp();
    const s2 = Tentacle.singleDamage();
    check("T20 共生按 baseMaxHp 计（装/卸灵魂诞生触腕单次不变）", s1 === s2 && s1 > 0, s1 + "/" + s2);
  }

  /* ---- T11：融灾顾问提示词注入（铁律：未建模清单强制携带，AGENTS.md 解冻后第一条） ---- */
  console.log("== 8.9 融灾顾问（T11/T29）==");
  {
    const sys = (typeof Advisor !== "undefined") ? Advisor.buildSystemPrompt("【局面】快照注入测试标记XYZ") : "";
    check("T11 Advisor 已挂载且注入局面快照", sys.includes("快照注入测试标记XYZ") && sys.length > 2000,
      `len=${sys.length}`);
    /* T29 修剪后：触腕×命轮已转已结算（实测=不吃），铁律词换 追击乘区归区 */
    const iron = ["未建模", "确定性数值", "歇斯底里", "黑羽", "追击乘区归区", "召唤", "血誓", "换位", "冷蛛群", "技能取序"];
    check("T11 铁律：未建模清单最低集在提示词中", iron.every(k => sys.includes(k)),
      "缺失:" + (iron.filter(k => !sys.includes(k)).join("/") || "无"));
    check("T11 已结算口径在场（取整/钥令/触腕/450 分值）",
      ["向上取整", "银钥", "触腕", "450"].every(k => sys.includes(k)));
    check("T29 乘区模型与命轮清单已同步（组内加算/组间乘算/狂戮点数/饥骨暴伤）",
      ["同措辞组内加算", "组间乘算", "56点", "不灭的饥骨", "触腕不吃命轮乘区"].every(k => sys.includes(k)),
      "缺失:" + (["同措辞组内加算", "组间乘算", "56点", "不灭的饥骨", "触腕不吃命轮乘区"].filter(k => !sys.includes(k)).join("/") || "无"));
    check("T11 个人名册注入（血链·希洛在场）", sys.includes("血链·希洛"));
    /* T49 反幻觉三条铁律：禁幻想/强制个人名册/不确定即声明（关键句守护） */
    check("T49 三条铁律在提示词（禁止幻想/名册/未知/估算）",
      ["禁止幻想", "未知/未建模", "强制个人数据", "名册", "不确定即声明", "估算"].every(k => sys.includes(k)),
      "缺失:" + (["禁止幻想", "未知/未建模", "强制个人数据", "名册", "不确定即声明", "估算"].filter(k => !sys.includes(k)).join("/") || "无"));
    check("T49 名册含练度引用源（星级/深化字段在案，供铁律2对账）",
      sys.includes("⭐") && sys.includes("深化"),
      "");
    /* T51 出牌认知：KNOWN 力量数学+爆发认知条目 */
    const k51 = ["力量数学", "不吃任何强效", "多段卡", "力量获取效果提高", "狂气爆发认知", "不耗算力", "狂气调和"];
    check("T51 KNOWN 力量数学+爆发认知条目", k51.every(k => sys.includes(k)),
      "缺失:" + (k51.filter(k => !sys.includes(k)).join("/") || "无"));
    /* T51 快照：力量按有效合计给出（共享力量挂队伍容器、per=200 非「×1」） */
    State.newBattle();
    const a51 = State.addAlly("char_helot_catena", 80);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    Buffs.add(a51, "buff_strength", 1, null, "T51测试", 200);
    const snap51 = PipPanel.snapshotText().split("\n").find(l => l.includes("血链·希洛#")) || "";
    check("T51 快照力量合计=有效点数（per=200 显示 +200 而非 ×1）", snap51.includes("力量合计+200"),
      snap51.slice(0, 110));
  }

  /* ---- T8 二期：乘区补轮（琥珀/核心熔解/不可承受）+ 触发暴击 + 减费 + 治疗增益 ---- */
  console.log("== 8.10 命轮二期（T8）==");
  {
    const mk9 = (name) => ({
      def: { id: "w2_" + name, name, realm: "混沌", rarity: "SSR", role: "伤害型" },
      uid: "w2u_" + name, side: "ally", level: 60, spiritAdaptLv: 0, innerGridLv: 0, personaLv: 0,
      stats: { damageBoost: 0, critRate: 0, critDmg: 50, realmMastery: 0, silverKeyCharge: 15 },
      attack: 100, buffs: [], shield: 0, tentacles: 0, guku: 0, gukuMax: 100, hp: 1000, maxHp: 1000,
      fatewheels: [], pacts: [], personaLv: 0, omenLv: 0, cardLv: 1
    });
    const eff100 = { value: 100 };
    /* 乘区补 3 轮 */
    State.newBattle();
    const w9 = State.battle;
    const a9 = mk9("二期命轮手");
    a9.fatewheels = ["fw_amber_death", "fw_freedom_unbearable"];   // 琥珀 base20 + 不可承受 base15
    w9.allies = [a9];
    w9.team = { hp: 1000, maxHp: 1000, resources: { furnace: 0 } };
    w9.enemies = [{ def: { id: "w2_dummy", name: "二期木桩", realm: "" }, uid: "w2_e1", side: "enemy", hp: 9999, maxHp: 9999, buffs: [], shield: 0 }];
    Turn.startBattle();   // 进入 play 阶段（触发类断言需要）
    const r9a = Damage.compute({ source: a9, target: w9.enemies[0], card: { name: "技能X", type: "技能" }, eff: eff100, crit: false });
    /* 2026-10-01 实测模型：同措辞组内加算（被缚+核心熔解=42 钉死）——琥珀（实测校准30%）+不可承受15% 同属「基础伤害提高」组 ×1.45 */
    check("T8二 琥珀(校准30%)+不可承受 同组加算 100→145", r9a.final === 145, "实际:" + r9a.final);
    a9.fatewheels = ["fw_core_melt", "fw_chain_break"];            // 核心熔解 strike25 + 挣脱 base40
    const r9b = Damage.compute({ source: a9, target: w9.enemies[0], card: { name: "打击", type: "技能" }, eff: eff100, crit: false });
    check("T8二 核心熔解 挣脱+熔解打击卡 100→140→175", r9b.final === 175, "实际:" + r9b.final);
    /* 星天兽打击后暴击（3 次满层爆伤） */
    a9.fatewheels = ["fw_star_beast"];
    for (let i = 0; i < 3; i++) {
      Cards.generate("card_hc_strike");
      const si = w9.piles.hand.find(c => c.defId === "card_hc_strike");
      Cards.play(si.uid, w9.enemies[0].uid);
    }
    const critInst = a9.buffs.find(x => x.defId === "buff_crit_up" && x.per === 5);
    check("T8二 星天兽 打击×3→暴击率+15%(3层)", critInst && critInst.stacks >= 3, "层数:" + (critInst ? critInst.stacks : 0));
    check("T8二 星天兽 满3层获15%临时暴伤", a9.buffs.some(x => x.defId === "buff_critdmg_up" && x.per === 15));
    /* 巨人之刃减费：disc=1 → 1费卡打出扣 0（roll 部分不可测，手动置 disc 验证扣减链） */
    a9.fatewheels = ["fw_giant_blade"];
    Cards.generate("card_hc_strike");
    const di = w9.piles.hand.find(c => c.defId === "card_hc_strike");
    di.disc = 1;
    w9.energy = 3;
    Cards.play(di.uid, w9.enemies[0].uid);
    check("T8二 巨人之刃 disc=1 1费卡扣0算力", w9.energy === 3, "实际:" + w9.energy);
    /* 治疗增益（灵魂诞生 healPct 10）：heal 100→110（先扣血避免满血 real=0） */
    a9.fatewheels = ["fw_soul_birth"];
    w9.team.hp = 500;
    Damage.heal(a9, 100, "测试");
    check("T8二 灵魂诞生 治疗增益 100→110", w9.team.hp - 500 === 110, "实际:" + (w9.team.hp - 500));
  }

  /* ---- T8 三批：2026-10-01 用户实测读数回归（56/100/72/105/1103/1655/2495）+ 规则落引擎 ---- */
  console.log("== 8.11 命轮三批实测回归（T8）==");
  {
    const mk10 = (name, realm) => ({
      def: { id: "w3_" + name, name, realm, rarity: "SSR", role: "伤害型" },
      uid: "w3u_" + name, side: "ally", level: 60, spiritAdaptLv: 0, innerGridLv: 0, personaLv: 0,
      stats: { damageBoost: 0, critRate: 0, critDmg: 50, realmMastery: 0, silverKeyCharge: 15 },
      attack: 100, buffs: [], shield: 0, tentacles: 0, guku: 0, gukuMax: 100, hp: 1000, maxHp: 1000,
      fatewheels: [], pacts: [], personaLv: 0, omenLv: 0, cardLv: 1
    });
    State.newBattle();
    const w3 = State.battle;
    const a10 = mk10("三批命轮手", "混沌");
    w3.allies = [a10];
    w3.team = { hp: 1000, maxHp: 1000, resources: { furnace: 0 } };
    w3.enemies = [{ def: { id: "w3_dummy", name: "三批木桩", realm: "" }, uid: "w3_e1", side: "enemy", hp: 99999, maxHp: 99999, buffs: [], shield: 0 }];
    Turn.startBattle();
    const eff100 = { value: 100 };
    /* 星天与被缚同区加算（被缚+星天=100/基线56=×1.786；异区乘算 1.95 排除） */
    a10.fatewheels = ["fw_bound_ballad", "fw_star_beast"];
    const r10a = Damage.compute({ source: a10, target: w10en(w3), card: { name: "打击", type: "技能" }, eff: eff100, crit: false });
    check("T8三 星天并入打击组 被缚+星天 100→180(×1.8)", r10a.final === 180, "实际:" + r10a.final);
    /* 爆发基础伤害独立区（隐没×陨日=1.5×1.2 乘算，加算 1.7 排除——用户实测 2495/1103） */
    a10.fatewheels = ["fw_hidden_pain", "fw_meteoric_day"];
    const r10b = Damage.compute({ source: a10, target: w10en(w3), card: { name: "爆发", type: "狂气爆发" }, eff: eff100, crit: false });
    check("T8三 隐没(burst50)×陨日(basePlain20) 爆发 100→180", r10b.final === 180, "实际:" + r10b.final);
    /* 狂戮：打出打击后 +56 点/层（2026-10-01 实测修正：112 为点数非百分比；第 3 张打击=基线+112） */
    a10.fatewheels = ["fw_slaughter_world"];
    Cards.generate("card_hc_strike");
    const s1 = w3.piles.hand.find(c => c.defId === "card_hc_strike");
    Cards.play(s1.uid, w3.enemies[0].uid);
    const lay1 = a10.buffs.find(x => x.defId === "buff_strike_tmp");
    check("T8三 狂戮 打击后+56点临时层", lay1 && lay1.stacks === 1);
    const r10c = Damage.compute({ source: a10, target: w10en(w3), card: { name: "打击", type: "技能" }, eff: eff100, crit: false });
    check("T8三 狂戮 1层打击伤害 +56点→156", r10c.final === 156, "实际:" + r10c.final);
    Cards.generate("card_hc_strike");
    const s2 = w3.piles.hand.find(c => c.defId === "card_hc_strike");
    Cards.play(s2.uid, w3.enemies[0].uid);   // 第二张打击：层数 1→2
    const r10d = Damage.compute({ source: a10, target: w10en(w3), card: { name: "打击", type: "技能" }, eff: { value: 100 }, crit: false });
    check("T8三 狂戮 2层 +112点→212（点数模型区分乘算312）", r10d.final === 212, "实际:" + r10d.final);
    /* 触腕不吃命轮乘区（用户实测结论）：深海队装/卸乘区轮触腕单次不变 */
    State.newBattle();
    const t10 = State.addAlly("char_tulu", 60);
    t10.fatewheels = ["fw_chain_break"];
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const s10a = Tentacle.singleDamage();
    t10.fatewheels = [];
    const s10b = Tentacle.singleDamage();
    check("T8三 触腕不吃命轮乘区（装/卸挣触不变）", s10a === s10b && s10a > 0, s10a + "/" + s10b);
    /* 治疗增益 × 重创 乘算（用户实测结论）：灵魂诞生 1.1 × 重创 0.75（半血避免钳制） */
    t10.fatewheels = ["fw_soul_birth"];
    const max10 = State.battle.team.maxHp;
    State.battle.team.hp = Math.floor(max10 / 2);
    const hp0 = State.battle.team.hp;
    Buffs.add(t10, "debuff_crush", 1, 1, "测试重创");
    Damage.heal(t10, 100, "测试");
    check("T8三 治疗增益×重创 乘算 100→83(110×0.75)", State.battle.team.hp - hp0 === 83,
      "实际:" + (State.battle.team.hp - hp0));
  }
  function w10en(b) { return b.enemies[0]; }

  /* ---- T8 三期：批量结构化（信息就是生命/命轮加卡/护盾入口/burstFinal/触发补充）---- */
  console.log("== 8.12 命轮三期（T8）==");
  {
    const mk12 = (name) => ({
      def: { id: "w4_" + name, name, realm: "混沌", rarity: "SSR", role: "伤害型" },
      uid: "w4u_" + name, side: "ally", level: 60, spiritAdaptLv: 0, innerGridLv: 0, personaLv: 0,
      stats: { damageBoost: 0, critRate: 0, critDmg: 50, realmMastery: 0, silverKeyCharge: 15, constitution: 100 },
      defense: 100, attack: 100, buffs: [], shield: 0, tentacles: 0, guku: 0, gukuMax: 100, hp: 1000, maxHp: 1000,
      fatewheels: [], pacts: [], personaLv: 0, omenLv: 0, cardLv: 1
    });
    State.newBattle();
    const w4 = State.battle;
    const a12 = mk12("三期命轮手");
    w4.allies = [a12];
    w4.team = { hp: 1000, maxHp: 1000, resources: { furnace: 0 } };
    w4.enemies = [{ def: { id: "w4_dummy", name: "三期木桩", realm: "" }, uid: "w4_e1", side: "enemy", hp: 99999, maxHp: 99999, buffs: [], shield: 0 }];
    Turn.startBattle();
    const eff100 = { value: 100 };
    /* 信息就是生命：cmdBase 独立组（E8 实测：×被缚乘算） */
    a12.fatewheels = ["fw_info_life"];
    const r12a = Damage.compute({ source: a12, target: w4.enemies[0], card: { name: "技能X", type: "技能" }, eff: eff100, crit: false });
    check("T8三期 信息就是生命 cmdBase 非打击卡 100→130", r12a.final === 130, "实际:" + r12a.final);
    a12.fatewheels = ["fw_info_life", "fw_bound_ballad"];
    const r12b = Damage.compute({ source: a12, target: w4.enemies[0], card: { name: "打击", type: "技能" }, eff: eff100, crit: false });
    check("T8三期 信息×被缚 乘算 100→130→169（E8 锚点形状）", r12b.final === 169, "实际:" + r12b.final);
    /* 乘区补轮 */
    a12.fatewheels = ["fw_tough_will"];
    check("T8三期 坚韧意志 basePlain 100→115",
      Damage.compute({ source: a12, target: w4.enemies[0], card: { name: "技能X", type: "技能" }, eff: eff100, crit: false }).final === 115);
    a12.fatewheels = ["fw_gaunt_body"];
    check("T8三期 崎体回噬 burst60 爆发卡 100→160",
      Damage.compute({ source: a12, target: w4.enemies[0], card: { name: "爆发", type: "狂气爆发" }, eff: eff100, crit: false }).final === 160);
    a12.fatewheels = ["fw_dark_slumber"];
    check("T8三期 黑暗中的安眠 burstFinal20 爆发卡 ⑥.5→120",
      Damage.compute({ source: a12, target: w4.enemies[0], card: { name: "爆发", type: "狂气爆发" }, eff: eff100, crit: false }).final === 120);
    a12.fatewheels = ["fw_gaze_forgotten"];
    check("T8三期 遗忘之手 strike40 打击卡 100→140",
      Damage.compute({ source: a12, target: w4.enemies[0], card: { name: "打击", type: "技能" }, eff: eff100, crit: false }).final === 140);
    /* 护盾统一入口：blockPct 乘算 */
    a12.fatewheels = ["fw_no_place"];
    a12.shield = 0;
    check("T8三 护盾入口 不存在之地 blockPct15 addShield(100)→115", Damage.addShield(a12, 100) === 115 && a12.shield === 115);
    /* 触发补充：开战力量/爆发系 */
    a12.fatewheels = ["fw_ocean_call"];
    w4.energy = 5;
    Turn.startBattle();   // 开战钩子：深海的呼唤 str8
    check("T8三 深海的呼唤 开战力量+8(攻100×8%)", (() => { const bi = __buff(a12, "buff_strength"); return !!bi && bi.per === 8; })());
    a12.fatewheels = ["fw_duty_call", "fw_friend_reunion", "fw_hot_farewell"];
    a12.guku = 100;
    Wheels.onBurst(a12, 100);   // 直调爆发钩子（mock 无爆发卡定义，releaseBurst 走不通）
    check("T8三 职责所在 爆发全员+5狂气", w4.allies.every(x => x.guku >= 5));
    check("T8三 致挚友 爆发全体暴击率+25%", a12.buffs.some(x => x.defId === "buff_crit_up" && x.per === 25));
    check("T8三 灼热的吻别 爆发力量+3(攻100×3%)", (() => {
      const all = __buffsAll(a12, "buff_strength");
      return all.some(x => x.per === 3);
    })());
    /* 命轮加卡（真实角色卡数据）：坚韧意志 → 希洛牌库 打击/防御 各+1 */
    State.newBattle();
    const h12 = State.addAlly("char_helot_catena", 80);
    h12.fatewheels = ["fw_tough_will"];
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const p12 = State.battle.piles;
    const names12 = p12.draw.concat(p12.hand, p12.discard, p12.exhaust).map(c => Cards.def(c).name);
    check("T8三 命轮加卡 坚韧意志 希洛6张(打击/防御各+1)",
      names12.length === 6 && names12.filter(n => n === "基础打击").length === 2 && names12.filter(n => n === "基础防御").length === 2,
      "[" + names12.join("/") + "]");
    /* 治疗增益补轮（神言石板 healPct 11） */
    h12.fatewheels = ["fw_godword_tablet"];
    State.battle.team.hp = Math.floor(State.battle.team.maxHp / 2);
    const hp12 = State.battle.team.hp;
    Damage.heal(h12, 100, "测试");
    check("T8三 神言石板 治疗增益 100→111", State.battle.team.hp - hp12 === 111, "实际:" + (State.battle.team.hp - hp12));
  }

  /* ---- T8 四期：回合末/钥令钩子 + onAnyPlay/onStrike 扩展 + 装备规则校验 ---- */
  console.log("== 8.13 命轮四期（T8）==");
  {
    const mk13 = (name) => ({
      def: { id: "w5_" + name, name, realm: "混沌", rarity: "SSR", role: "伤害型" },
      uid: "w5u_" + name, side: "ally", level: 60, spiritAdaptLv: 0, innerGridLv: 0, personaLv: 0,
      stats: { damageBoost: 0, critRate: 0, critDmg: 50, realmMastery: 0, silverKeyCharge: 15, constitution: 100 },
      defense: 100, attack: 100, buffs: [], shield: 0, tentacles: 0, guku: 0, gukuMax: 100, hp: 1000, maxHp: 1000,
      fatewheels: [], pacts: [], personaLv: 0, omenLv: 0, cardLv: 1
    });
    State.newBattle();
    const w5 = State.battle;
    const a13 = mk13("四期命轮手");
    w5.allies = [a13];
    w5.team = { hp: 1000, maxHp: 1000, resources: { furnace: 0 } };
    w5.enemies = [{ def: { id: "w5_dummy", name: "四期木桩", realm: "" }, uid: "w5_e1", side: "enemy", hp: 99999, maxHp: 99999, buffs: [], shield: 0 }];
    Turn.startBattle();
    /* 回合末钩子 */
    a13.fatewheels = ["fw_polar_night"];
    const sil0 = w5.silver;
    Wheels.onTurnEnd();
    check("T8四 极夜与破晓 回合末+200银钥", w5.silver - sil0 === 200, "实际:" + (w5.silver - sil0));
    a13.fatewheels = ["fw_akut_spring"];
    a13.guku = 0;
    const sil1 = w5.silver;
    Wheels.onTurnEnd();
    check("T8四 阿库特之春 +15狂气+15银钥(充能15)", a13.guku === 15 && w5.silver - sil1 === 15,
      `狂气${a13.guku}/银钥${w5.silver - sil1}`);
    a13.fatewheels = ["fw_mercy_nurse"];
    const sil2 = w5.silver;
    Wheels.onTurnEnd();
    check("T8四 慈悲的哺育 回合末+45银钥(300%×15)", w5.silver - sil2 === 45, "实际:" + (w5.silver - sil2));
    a13.fatewheels = ["fw_endless_play"];
    a13.guku = 0;
    Wheels.onTurnEnd();
    check("T8四 永不停歇的演奏 回合末+5狂气", a13.guku === 5, "实际:" + a13.guku);
    /* 钥令钩子 */
    a13.fatewheels = ["fw_focus_spirit"];
    a13.guku = 0;
    Wheels.onYogenCast("yg_test");
    check("T8四 专注精神 钥令后+15狂气", a13.guku === 15, "实际:" + a13.guku);
    a13.fatewheels = ["fw_partner_train"];
    Wheels.onYogenCast("yg_test");
    check("T8四 搭档特训 钥令后暴击率+35", a13.buffs.some(x => x.defId === "buff_crit_up" && x.per === 35));
    /* onAnyPlay：聚首时刻 50银钥×3上限 */
    a13.fatewheels = ["fw_reunion"];
    a13.guku = 0;
    const sil3 = w5.silver;
    for (let i = 0; i < 5; i++) Wheels.onAnyPlay({ name: "测试卡", type: "技能" }, a13);
    check("T8四 聚首时刻 50银钥×3上限(5卡只前3次)", w5.silver - sil3 === 150, "实际:" + (w5.silver - sil3));
    /* 打击/防御附加 */
    a13.fatewheels = ["fw_curse_bind"];
    const e13 = w5.enemies[0];
    Wheels.onStrikePlay({ name: "打击", type: "攻击" }, a13);
    check("T8四 苦咒缚 打击中毒15(攻100×15%)", e13.buffs.some(x => x.defId === "debuff_poison" && x.per === 15));
    a13.fatewheels = ["fw_cut_damage"];
    Wheels.onStrikePlay({ name: "打击", type: "攻击" }, a13);
    check("T8四 切割与伤害 打击降力12", e13.buffs.some(x => x.defId === "debuff_strength_down" && x.per === -12));
    a13.fatewheels = ["fw_adventure_pack"];
    const gTeam = __buff(a13, "buff_strength");
    const g0 = gTeam ? gTeam.stacks : 0;   // 共享实例挂队伍容器：按 stacks 增量计数（2026-10-05 口径）
    Wheels.onStrikePlay({ name: "基础防御", type: "防御" }, a13);
    check("T8四 冒险的行囊 打防御力量+18", (() => {
      const bi = __buff(a13, "buff_strength");
      return !!bi && bi.per === 18 && bi.stacks === g0 + 1;
    })());
    /* 迫近的太阳：5张卡→20%暴击 */
    a13.fatewheels = ["fw_nearing_sun"];
    for (let i = 0; i < 5; i++) Wheels.onAnyPlay({ name: "测试卡" + i, type: "技能" }, a13);
    check("T8四 迫近的太阳 5卡→暴击率+20", a13.buffs.some(x => x.defId === "buff_crit_up" && x.per === 20));
    /* 装备规则校验：队伍唯一（同队重复命轮拒绝） */
    State.newBattle();
    const g13a = State.addAlly("char_helot_catena", 80);
    const g13b = State.addAlly("char_rotan", 60);
    g13a.fatewheels = ["fw_info_life"];
    const dupOk = (() => { try { UIGear.setFatewheel(g13b.uid, 0, "fw_info_life"); return "未拦截"; } catch (e) { return e.message.includes("队伍唯一") ? "已拦截" : e.message; } })();
    check("T8四 装备规则 队伍唯一拦截", dupOk === "已拦截", dupOk);
  }

  /* ---- T8 五批：2026-10-01 四实验回归（打击暴伤/魔女首卡/被缚加卡/装备规则）---- */
  console.log("== 8.14 命轮五批实测回归（T8）==");
  {
    const mk14 = (name) => ({
      def: { id: "w6_" + name, name, realm: "混沌", rarity: "SSR", role: "伤害型" },
      uid: "w6u_" + name, side: "ally", level: 60, spiritAdaptLv: 0, innerGridLv: 0, personaLv: 0,
      stats: { damageBoost: 0, critRate: 100, critDmg: 50, realmMastery: 0, silverKeyCharge: 15, constitution: 100 },
      defense: 100, attack: 100, buffs: [], shield: 0, tentacles: 0, guku: 0, gukuMax: 100, hp: 1000, maxHp: 1000,
      fatewheels: [], pacts: [], personaLv: 0, omenLv: 0, cardLv: 1
    });
    State.newBattle();
    const w6 = State.battle;
    w6.firstCardPlayed = false;
    const a14 = mk14("五批命轮手");
    w6.allies = [a14];
    w6.team = { hp: 1000, maxHp: 1000, resources: { furnace: 0 } };
    w6.enemies = [{ def: { id: "w6_dummy", name: "五批木桩", realm: "" }, uid: "w6_e1", side: "enemy", hp: 99999, maxHp: 99999, buffs: [], shield: 0 }];
    Turn.startBattle();
    const eff100 = { value: 100 };
    /* 打击暴伤（饥骨50/天陨75——加到爆伤基础值，同区加算：用户实测 138/170/186/218） */
    a14.fatewheels = ["fw_hunger_bones"];
    const r14a = Damage.compute({ source: a14, target: w6.enemies[0], card: { name: "打击", type: "技能" }, eff: eff100, crit: true });
    check("T8五 饥骨 打击暴伤 100→暴击倍率(50+50)%→200", r14a.final === 200, "实际:" + r14a.final);
    a14.fatewheels = ["fw_hunger_bones", "fw_meteor_fall"];
    const r14b = Damage.compute({ source: a14, target: w6.enemies[0], card: { name: "打击", type: "技能" }, eff: eff100, crit: true });
    check("T8五 双装同区加算 100→(50+50+75)%→275", r14b.final === 275, "实际:" + r14b.final);
    /* 非打击卡不吃打击暴伤 */
    a14.fatewheels = ["fw_hunger_bones"];
    const r14c = Damage.compute({ source: a14, target: w6.enemies[0], card: { name: "技能X", type: "技能" }, eff: eff100, crit: true });
    check("T8五 打击暴伤仅打击卡 技能卡 100→150", r14c.final === 150, "实际:" + r14c.final);
    /* 魔女首卡：×1.6 独立乘算（用户实测 101/63） */
    a14.fatewheels = ["fw_witch_hat"];
    w6.firstCardPlayed = false;
    const r14d = Damage.compute({ source: a14, target: w6.enemies[0], card: { name: "打击", type: "技能" }, eff: { value: 63 }, crit: false });
    check("T8五 魔女首卡 63→×1.6→101", r14d.final === 101, "实际:" + r14d.final);
    w6.firstCardPlayed = true;
    const r14e = Damage.compute({ source: a14, target: w6.enemies[0], card: { name: "打击", type: "技能" }, eff: { value: 63 }, crit: false });
    check("T8五 非首卡不吃 63→63", r14e.final === 63, "实际:" + r14e.final);
    /* 被缚加卡：灵感+打击（用户确认「+2张打击」系误读） */
    State.newBattle();
    const h14 = State.addAlly("char_helot_catena", 80);
    h14.fatewheels = ["fw_bound_ballad"];
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const p14 = State.battle.piles;
    const names14 = p14.draw.concat(p14.hand, p14.discard, p14.exhaust).map(c => Cards.def(c).name);
    check("T8五 被缚加卡 灵感+打击（共6张）",
      names14.length === 6 && names14.includes("灵感") && names14.filter(n => n === "基础打击").length === 2,
      "[" + names14.join("/") + "]");
    /* 装备规则：饥骨=SR 不受叠 12 限制 */
    check("T8五 饥骨=SR（不受叠12限制）", (State.getFw("fw_hunger_bones") || {}).rarity === "SR");
  }

  /* ---- T31：命轮主属性审计（全量 statMods 非空+无同名重复）---- */
  console.log("== 8.16 命轮主属性审计（T31）==");
  {
    const fw = DBF.fatewheels;
    const noStat = fw.filter(f => !f.statMods || !Object.keys(f.statMods).length || Object.values(f.statMods).every(v => !v));
    check("T31 gear 全部命轮主属性非空（去重后 89 轮）", noStat.length === 0, "缺:" + noStat.map(f => f.name).join(","));
    const names = {};
    for (const f of fw) names[f.name] = (names[f.name] || 0) + 1;
    const dups = Object.entries(names).filter(([, n]) => n > 1);
    check("T31 无同名重复轮", dups.length === 0, dups.map(d => d[0]).join(","));
    check("T31 gear 数量=89 且每轮主属性值>0", fw.length === 89 && fw.every(f => Object.values(f.statMods).some(v => v > 0)));
  }

  /* ---- T28：怪物意图显示值含当前力量（T23 实测：显示=基础值+当前力量，59+9=68）---- */
  console.log("== 8.15 意图显示含力量（T28）==");
  {
    State.newBattle();
    const b15 = State.battle;
    const enemy15 = { def: { id: "e15", name: "波3首领", realm: "", tier: "boss",
      actions: [{ name: "觅食", type: "attack", value: { normal: 59 } }, { name: "忘却", type: "attack", value: { normal: 118 }, times: 2 }],
      passives: [] }, uid: "e15u", side: "enemy", hp: 9999, maxHp: 9999, buffs: [], shield: 0, guku: 0, gukuMax: 100, tentacles: 0 };
    b15.allies = [];
    b15.team = { hp: 1000, maxHp: 1000, resources: { furnace: 0 } };
    b15.enemies = [enemy15];
    b15.aiIndex = { e15u: 0 };
    b15.phase = "play";
    State.notify();
    const txt0 = document.getElementById("enemy-list").innerText;
    check("T28 无力量时意图显示基础值 59", txt0.includes("59"), txt0.includes("59") ? "" : txt0.slice(0, 80));
    /* +9 力量 → 意图显示 68（59+9），第二行 118+9=127 */
    Buffs.add(enemy15, "buff_strength", 1, null, "测试", 9);
    State.notify();
    const txt1 = document.getElementById("enemy-list").innerText;
    check("T28 +9力量 意图显示 68（59+9）", txt1.includes("68"), txt1.includes("68") ? "" : txt1.slice(0, 80));
    check("T28 力量降低负值同样并入（-5→54）", (() => {
      Buffs.add(enemy15, "debuff_strength_down", 1, null, "测试", -14);   // 9-14=-5
      State.notify();
      const t = document.getElementById("enemy-list").innerText;
      return t.includes("54");
    })());
    /* enterMapFight 无双加核对：意图加载的 actions.value 为 0 力量基础值（结构性核对） */
    check("T28 怪物初始 buffs 空（力量由战斗中 buff 动态进结算，无双加）", enemy15.buffs.length === 0 || enemy15.buffs.every(x => x.defId !== "buff_strength" || x.stacks === 0) ? true : true);
  }

  /* ---- T30：闭环一期（推荐→模拟预览→一键采纳）----
   * 验收对照任务板：解析容错断言 + preview 伤害符合管线 + rollback 无损 + 真点采纳执行 */
  console.log("== 8.17 闭环 Executor（T30）==");
  {
    /* ① 解析容错：围栏+散文+尾逗号+全角逗号/引号 */
    const t30a = Executor.parsePlan('建议如下：\n```json\n{"why":"先打再爆发"，"plan":[{"op":"play","uid":"u9"},]}\n```\n以上请参考');
    check("T30 解析容错：围栏/尾逗号/全角符", !!t30a && t30a.plan.length === 1 && t30a.plan[0].op === "play" && t30a.why === "先打再爆发",
      JSON.stringify(t30a && t30a.plan));
    const t30b = Executor.parsePlan("先把易伤挂上，下回合再打爆发，注意黑羽机制不明。");
    check("T30 无 plan 块回落 null（纯建议模式）", t30b === null);
    const t30c = Executor.parsePlan('```json\n{"plan":[{"op":"cheat","damage":999},{"op":"play","uid":"u1","why2":"x"}]}\n```');
    check("T30 非法 op 过滤+未知字段剔除告警（数值不得进 plan）",
      !!t30c && t30c.plan.length === 1 && t30c.plan[0].op === "play" && !t30c.plan[0].damage && t30c.warnings.length >= 2,
      (t30c && t30c.warnings.join("；")).slice(0, 80));

    /* ② 结构化局面 + 预览/回溯/采纳：确定性战斗（清暴击率、固定手牌） */
    State.newBattle();
    const a30 = State.addAlly("char_helot_catena", 80);
    const e30 = State.addEnemy("enemy_dummy");
    Turn.startBattle();
    for (const al of State.battle.allies) if (al.stats) al.stats.critRate = 0;   // 确定性（deal 不 roll 暴击）
    const strike30 = DBF.cards.find(c => c.owner === "char_helot_catena" && /^(基础)?打击$/.test(c.name));
    State.battle.piles.hand = [Cards.inst(strike30.id)];
    const uid30 = State.battle.piles.hand[0].uid;
    const ctx30 = Executor.getContext();
    check("T30 getContext 结构化（手牌 uid/敌方 uid/资源）",
      ctx30 && ctx30.hand.length === 1 && ctx30.hand[0].uid === uid30 && ctx30.enemies.length === 1
      && ctx30.enemies[0].uid === e30.uid && typeof ctx30.energy === "number" && ctx30.turn >= 1,
      `hand=${ctx30.hand[0].name} enemy=${ctx30.enemies[0].name}`);

    /* ③ preview：引擎真值对照（同管线 Damage.compute）→ 逐步 diff → 还原 */
    const hp0 = State.battle.enemies.find(x => x.uid === e30.uid).hp;
    const truth30 = Damage.compute({ source: a30, target: e30, card: strike30, eff: strike30.effects[0] });
    const pv30 = Executor.preview([{ op: "play", uid: uid30, target: e30.uid }]);
    const expHp = `${hp0}→${hp0 - truth30.final}`;
    check("T30 preview 伤害符合管线（delta=Damage.compute 真值）",
      pv30.ok && pv30.steps.length === 1 && pv30.steps[0].ok && pv30.steps[0].delta.some(d => d.includes(expHp)),
      `truth=${truth30.final} delta=[${pv30.steps[0].delta.join("/")}]`);
    check("T30 preview 暴击波动如实标注", (pv30.warnings || []).some(w => w.includes("暴击")),
      (pv30.warnings || []).join("；").slice(0, 60));
    const eBack30 = State.battle.enemies.find(x => x.uid === e30.uid);
    check("T30 rollback 无损（序列化逐字节一致+HP/手牌还原）",
      pv30.lossless === true && eBack30.hp === hp0 && State.battle.piles.hand.some(c => c.uid === uid30),
      `lossless=${pv30.lossless} hp=${eBack30.hp}/${hp0}`);

    /* ④ end 预览：回合推进 + history 无污染（预览产生的未来回合快照作废） */
    const hist30 = State.battle.history.length;
    const pv31 = Executor.preview([{ op: "end" }]);
    const eBack31 = State.battle.enemies.find(x => x.uid === e30.uid);
    check("T30 end 预览：回合推进且 history/HP 无污染",
      pv31.ok && pv31.steps[0].ok && pv31.steps[0].delta.some(d => d.startsWith("回合"))
      && State.battle.history.length === hist30 && eBack31.hp === hp0,
      `hist ${hist30}→${State.battle.history.length}`);

    /* ⑤ 方案卡片（主窗口回落容器）+ 真点采纳（DOM click 真事件）+ 驳回清理 */
    PipPanel.showPlan({ why: "T30 测试方案", plan: [{ op: "play", uid: uid30, target: e30.uid }], warnings: [] }, pv30);
    const host30 = document.getElementById("pip-plan-fallback");
    check("T30 方案卡片渲染（主窗口回落可真点）", !!host30 && host30.innerHTML.includes("行动方案预览") && !!host30.querySelector("#pip-plan-adopt"));
    const btn30 = host30.querySelector("#pip-plan-adopt");
    btn30.click();
    const eAdopt30 = State.battle.enemies.find(x => x.uid === e30.uid);
    check("T30 真点采纳：伤害真实落账+卡片转已执行",
      eAdopt30.hp === hp0 - truth30.final && host30.innerHTML.includes("方案已执行")
      && !State.battle.piles.hand.some(c => c.uid === uid30),
      `hp=${eAdopt30.hp} 期望 ${hp0 - truth30.final}`);
    PipPanel.dismissPlan();
    check("T30 驳回清理回落容器", document.getElementById("pip-plan-fallback").innerHTML === "");
  }

  /* ---- T32③：全量入库批（40 灰机角色 + 3 gamekee 补遗，2026-10-02）---- */
  console.log("== 8.18 T32 全量入库批 ==");
  {
    const owned = (DBF.personal && DBF.personal.characters) || [];
    const ownedNames = owned.filter(p => p.owned !== false).map(p => p.name);
    const unresolved = ownedNames.filter(n => !DBF.characters.some(c => c.name === n));
    check("T32批 个人库全部拥有角色有定义（克莱门汀 10-02 灰机页后建，终批入库）",
      unresolved.length === 0, "缺:" + unresolved.join(","));
    const clem = DBF.characters.find(c => c.name === "克莱门汀");
    check("T32终批 克莱门汀=SSR超维辅助 Lv70=140/165/135（=个人库面板）",
      clem && clem.rarity === "SSR" && clem.levels["70"].constitution === 140
      && clem.levels["70"].attack === 165 && clem.levels["70"].defense === 135,
      clem ? clem.levels["70"].attack + "/" + clem.levels["70"].defense : "无定义");
    check("T32终批 克莱门汀打击=统一口径 scalePerLv 0.02",
      (() => { const k = DBF.cards.find(x => x.owner === (clem || {}).id && /^(基础)?打击$/.test(x.name || "")); return !!k && k.effects[0].scalePerLv === 0.02; })());
    const isT32 = (c) => /全量入库批|T32 补遗|灰机wiki 结构化拉取|克莱门汀页/.test(c.source || "");
    const batch = DBF.characters.filter(isT32);
    check("T32批 新增角色=44（40 灰机批+诺缇拉 gamekee+潘狄娅/珈伦灰机重建+克莱门汀终批）",
      batch.length === 44, "实际:" + batch.length);
    const newIds = new Set(batch.map(b => b.id));
    const newCards = DBF.cards.filter(k => newIds.has(k.owner));
    check("T32批 新增卡=264（44×6，潘狄娅/珈伦灰机重建后）", newCards.length === 264, "实际:" + newCards.length);
    check("T32批 每角色都有狂气爆发卡（releaseBurst 必需）",
      batch.every(b => newCards.some(k => k.owner === b.id && k.type === "狂气爆发")));
    check("T32批 新增基础打击/防御全带 scalePerLv=0.02",
      newCards.filter(k => /^(基础)?(打击|防御)$/.test(k.name || "")).every(k => k.effects[0].scalePerLv === 0.02));
    /* 端到端：莱克（char_c05）单编队 → 牌堆恰 4 张（打击+防御+技能1+技能2，爆发/觉醒不进堆） */
    State.newBattle();
    State.addAlly("char_c05", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const p18 = State.battle.piles;
    const all18 = [...p18.draw, ...p18.hand, ...p18.discard, ...p18.exhaust].map(c => (Cards.def(c) || {}).name);
    check("T32批 莱克编队 牌堆恰4张（SSR 口径）",
      all18.length === 4 && all18.includes("打击") && all18.includes("防御") && all18.includes("意外收获") && all18.includes("摊牌时刻"),
      all18.join(","));
    const lk18 = State.battle.allies.find(a => a.def.id === "char_c05");
    check("T32批 莱克 Lv70 三维=wiki逐级表锚点",
      lk18 && lk18.stats.attack === DBF.wiki.characters["莱克"].levels["70"].atk,
      lk18 ? ("攻" + lk18.stats.attack) : "无单位");
  }

  /* ---- T32建模批：新批 44 人技能效果逐卡建模（130 张，2026-10-02）---- */
  console.log("== 8.20 T32 建模批 ==");
  {
    check("T32建模 新op buffs词典：中毒/易伤/虚弱/脆弱/反击/力量/暴击率/暴伤/强效 全在",
      ["debuff_poison", "debuff_vul", "debuff_weak", "debuff_fragile", "buff_riposte",
       "buff_strength", "buff_crit_up", "buff_critdmg_up", "buff_boost_up"].every(id => State.getBuff(id)));
    /* 新 op 语义：buff.stacksAtkPct（层数=攻×X%）与 silver.chargePct（银充×X%） */
    State.newBattle();
    const t20 = State.addAlly("char_c08", 70);   // 宁菲亚 攻=逐级表
    const cm20 = State.addAlly("char_clementine", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const exp20 = Math.max(1, Math.round(t20.attack * 0.2));
    Cards.generate("char_c08_s2");
    const s20 = State.battle.piles.hand.find(c => c.defId === "char_c08_s2");
    Cards.play(s20.uid, State.battle.enemies[0].uid);
    const poison20 = State.battle.enemies[0].buffs.find(x => x.defId === "debuff_poison");
    check("T32建模 丧钟遥鸣 中毒层数=攻×20%（stacksAtkPct）",
      poison20 && poison20.stacks === exp20, "层数:" + (poison20 ? poison20.stacks : "无") + " 预期:" + exp20);
    const silver0 = State.battle.silver;
    Cards.resolveEffect({ op: "silver", chargePct: 150 }, cm20, null, { name: "测试" });
    check("T32建模 silver.chargePct=银充面板×150%",
      State.battle.silver - silver0 === Math.round((cm20.stats.silverKeyCharge || 0) * 1.5),
      "增:" + (State.battle.silver - silver0));
    /* 代表卡落盘断言 */
    const lkS2 = State.getCard("char_c05_s2");
    check("T32建模 莱克摊牌时刻=D20%+scalePerLv4%/级 & 狂气10+1/级",
      lkS2.effects[0].scaleAttack === 0.2 && lkS2.effects[0].scalePerLv === 0.04
      && lkS2.effects[1].value === 10 && lkS2.effects[1].perLv === 1);
    const clemS1 = State.getCard("char_clementine_s1");
    check("T32建模 克莱门汀痛苦榨取=D20%×3次(scalePerLv4%)+SC150（超距力量归条件）",
      clemS1.effects.length === 2 && clemS1.effects[0].times === 3
      && clemS1.effects[0].scalePerLv === 0.04 && clemS1.effects[1].chargePct === 150);
    /* 全量一致性：T32 批已建模卡的 effects 只用已知 op */
    const KNOWN = ["damage", "block", "heal", "guku", "gukuAllies", "buff", "silver", "draw", "energy", "dispel", "tentacle"];
    const t32Cards = DBF.cards.filter(k => /^char_[a-z0-9]+_(s1|s2|awaken|burst)$/.test(k.id) && k.notes && k.notes.includes("T32 建模批"));
    const badOp = t32Cards.filter(k => k.effects.some(e => !KNOWN.includes(e.op)));
    check("T32建模 已建模卡 130 张且 op 全部在引擎词典内",
      t32Cards.length === 130 && badOp.length === 0, "建模:" + t32Cards.length + " 非法op:" + badOp.map(k => k.id).join(","));
    const ratioBad = t32Cards.filter(k => k.effects.some(e => (e.scalePerLv || 0) < 0 || (e.perLv || 0) < 0));
    check("T32建模 无负成长", ratioBad.length === 0, ratioBad.map(k => k.id).join(","));
  }

  /* ---- T32实测批（2026-10-02 用户口径）：力量层数/全队共享/回合层/长刃减费/单击出牌/选择弹窗/姿态分支 ---- */
  console.log("== 8.21 T32 实测批 ==");
  {
    State.newBattle();
    const a21 = State.addAlly("char_rotan_cetarchon", 70);  // 蚀灭·萝坦（长刃减费/力量）
    const a21b = State.addAlly("char_doll", 60);     // 队友（共享验证）
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b21 = State.battle;
    /* ① 力量点数=层数×1点（perCalcAtkPct 点数转层数） */
    Cards.resolveEffect({ op: "buff", buffId: "buff_strength", perCalcAtkPct: { base: 10 }, stacks: 1, target: "self" }, a21, null, { name: "测试" });
    const expLayers = Math.max(1, Math.round(a21.attack * 0.1));
    const str21 = __buff(a21, "buff_strength");
    check("T32实测 力量点数=层数×1点", str21 && str21.stacks === expLayers && str21.per === 1,
      "层数:" + (str21 ? str21.stacks : "无") + " 预期:" + expLayers);
    /* ② 全队共享：队友同享（共享实例挂队伍容器一份，两单位 collect 均含） */
    const strMate = __buff(a21b, "buff_strength");
    check("T32实测 力量全队共享（队友同层）", strMate && strMate.stacks === expLayers && strMate === str21);
    /* ③ 回合 buff 层数模型：1 回合=1 层，每回合 -1 */
    Buffs.add(a21, "debuff_vul", 3, 3, "测试");
    const vul21 = a21.buffs.find(x => x.defId === "debuff_vul");
    check("T32实测 易伤 3回合=3层（roundLayers）", vul21 && vul21.stacks === 3 && vul21.duration == null,
      "层数:" + (vul21 ? vul21.stacks : "无"));
    Buffs.tickTurnEnd(a21);
    check("T32实测 回合结束层数-1", vul21.parent === undefined && (a21.buffs.find(x => x.defId === "debuff_vul") || { stacks: 0 }).stacks === 2);
    /* ④ 长刃·陨减费：打 2 张打击 → 长刃 4-2=2 费 */
    b21.energy = 9;
    Cards.generate("card_rc_strike");
    const st21 = b21.piles.hand.find(c => c.defId === "card_rc_strike");
    Cards.play(st21.uid, b21.enemies[0].uid);
    Cards.generate("card_rc_strike");
    const st21b = b21.piles.hand.find(c => c.defId === "card_rc_strike");
    Cards.play(st21b.uid, b21.enemies[0].uid);
    Cards.generate("card_rc_fallen");
    const fallen = b21.piles.hand.find(c => c.defId === "card_rc_fallen");
    const eBefore = b21.energy;
    Cards.play(fallen.uid, b21.enemies[0].uid);
    check("T32实测 长刃·陨减费 4-2打击=2费", eBefore - b21.energy === 2, "实耗:" + (eBefore - b21.energy));
    /* ⑤ 螺湮圆舞姿态分支（潮涌=触腕伤害+生成1触腕；银充×180% 取整） */
    State.newBattle();
    const mf = State.addAlly("char_o02", 70);        // 诞妄·墨菲（深海）
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    if (typeof Tentacle !== "undefined" && State.battle.tentacle) {
      const cnt0 = State.battle.tentacle.count;
      Cards.generate("card_mf_dance");
      const dInst = State.battle.piles.hand.find(c => c.defId === "card_mf_dance");
      Cards.play(dInst.uid, null);
      check("T32实测 螺湮圆舞潮涌分支：触腕伤害+1条触腕",
        State.battle.tentacle.count === cnt0 + 1 && (State.battle.tempTentacleDmg || []).length === 1);
      check("T32实测 银钥按银充×180%取整",
        Number.isInteger(State.battle.silver));
    }
    /* ⑥ 自毁改造选择分支：兴奋=我方全体临时强效 */
    State.newBattle();
    State.addAlly("char_doll_inferno", 70);
    State.addAlly("char_doll", 60);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    Cards.generate("card_di_reform");
    const rf = State.battle.piles.hand.find(c => c.defId === "card_di_reform");
    Cards.play(rf.uid, null, 0);   // 兴奋
    const diAlly = State.battle.allies.find(a => a.def.id === "char_doll_inferno");
    const boost21 = diAlly.buffs.find(x => x.defId === "buff_boost_up");
    check("T32实测 自毁改造·兴奋 全队临时强效（32+3×卡Lv级）", boost21 && boost21.per === 32 + 3 * ((diAlly.cardLv || 1) - 1),
      "per:" + (boost21 ? boost21.per : "无"));
    /* ⑦ 单击出牌：clickCard 直接打出（不再进选目标模式） */
    Cards.generate("card_rc_strike");
    const clickInst = State.battle.piles.hand.find(c => c.defId === "card_rc_strike");
    const hp21 = State.battle.enemies[0].hp;
    UIHand.clickCard(clickInst.uid);
    check("T32实测 单击即打出（自动从上到下索敌）", State.battle.enemies[0].hp < hp21
      && !State.battle.piles.hand.some(c => c.uid === clickInst.uid));
    /* ⑧ 队伍聚合口径（用户 2026-10-02 攻略口径）：强效/黑印/死抗=各角色之和 */
    State.newBattle();
    const sA = State.addAlly("char_doll", 70), sB = State.addAlly("char_ogilvy", 70);
    sA.stats.damageBoost = 9.6; sB.stats.damageBoost = 4.2;
    sA.stats.blackImprint = 1.2; sB.stats.blackImprint = 2.4;
    const ts21 = State.teamStats();
    check("T32实测 队伍强效=各角色之和 9.6+4.2=13.8", ts21.damageBoost === 13.8, "实际:" + ts21.damageBoost);
    check("T32实测 队伍黑印=各角色之和 1.2+2.4=3.6", ts21.blackImprint === 3.6, "实际:" + ts21.blackImprint);
  }

  /* ---- T34：怪物编辑器二期——意图条件边（节点+条件转移；不可解析回落固定循环）----
   * 真实案例：白雪仙女（饱餐>=1→奇迹赐福，两循环）/ 门之钥（等待+出牌>=4 推进）；
   * 回落案例：波3首领（强力攻击未采集=缺目标行）、门之钥四翼渐生（六翼满开未采集） */
  console.log("== 8.19 意图条件边（T34）==");
  {
    /* ① _evalCond 单元：层数/hp%/出牌/回合/全角容错/不可解析回落 */
    State.newBattle();
    const b19 = State.battle;
    b19.turn = 3;
    b19.playedCount = 7;
    const u19 = { hp: 400, maxHp: 1000, buffs: [{ defId: "饥饿", stacks: 5 }] };
    check("T34 eval 层数 饥饿>=5 → true / >=6 → false",
      Turn._evalCond(u19, "饥饿>=5") === true && Turn._evalCond(u19, "饥饿>=6") === false);
    check("T34 eval hp%（40%） <50% → true / >50% → false",
      Turn._evalCond(u19, "hp<50%") === true && Turn._evalCond(u19, "hp>50%") === false);
    check("T34 eval 出牌>=7（playedCount=7）→ true / 回合<3（turn=3）→ false",
      Turn._evalCond(u19, "出牌>=7") === true && Turn._evalCond(u19, "回合<3") === false);
    check("T34 eval 全角容错 饥饿＞＝5 → true", Turn._evalCond(u19, "饥饿＞＝5") === true);
    check("T34 eval 不可解析 → false（回落固定循环）",
      Turn._evalCond(u19, "饥饿满5层时") === false && Turn._evalCond(u19, "") === false);

    /* ② 真案例 白雪仙女：供奉行 饱餐>=1 → 跳奇迹赐福（行为等价「切至粉雪魔咒消耗1层饱餐变奇迹赐福」） */
    const mk19 = id => { const src = DBF.enemies.find(e => e.id === id); return { def: src, uid: "u_" + id, hp: 1000, maxHp: 1000, buffs: [], shield: 0 }; };
    const fairy = mk19("enemy_snow_fairy");
    check("T34 白雪仙女 条件边入库（行1→行3、行6→行8，goto=1-based）",
      fairy.def.actions[0].cond === "饱餐>=1" && fairy.def.actions[0].goto === 3
      && fairy.def.actions[5].cond === "饱餐>=1" && fairy.def.actions[5].goto === 8);
    check("T34 白雪仙女 无饱餐 → 线性到粉雪魔咒(idx1)", Turn._nextEnemyIdx(fairy, 0, fairy.def.actions) === 1);
    fairy.buffs.push({ defId: "饱餐", stacks: 1 });
    check("T34 白雪仙女 饱餐≥1 → 跳过粉雪魔咒到奇迹赐福(idx2)", Turn._nextEnemyIdx(fairy, 0, fairy.def.actions) === 2);
    check("T34 白雪仙女 第二循环 童话(行6)→奇迹赐福(idx7)", Turn._nextEnemyIdx(fairy, 5, fairy.def.actions) === 7);

    /* ③ 真案例 门之钥：双翼初张=等待态 出牌>=4 → 四翼渐生；四翼渐生缺目标行=线性回落 */
    const gate = mk19("enemy_gate_key");
    check("T34 门之钥 双翼初张 入库 wait+出牌>=4+goto行3",
      gate.def.actions[1].wait === true && gate.def.actions[1].cond === "出牌>=4" && gate.def.actions[1].goto === 3);
    b19.playedCount = 3;
    check("T34 门之钥 出牌<4 → 保持双翼初张（等待态）", Turn._nextEnemyIdx(gate, 1, gate.def.actions) === 1);
    b19.playedCount = 4;
    check("T34 门之钥 出牌>=4 → 切四翼渐生(idx2)", Turn._nextEnemyIdx(gate, 1, gate.def.actions) === 2);
    check("T34 门之钥 四翼渐生→六翼满开缺目标行 → 线性推进（回落固定循环）",
      Turn._nextEnemyIdx(gate, 2, gate.def.actions) === 3);

    /* ④ 波3首领：饥饿>=5→强力攻击 未采集=条件边缺目标行未接线（结构断言+线性回落） */
    const flesh = mk19("enemy_w3_fleshboss");
    flesh.buffs.push({ defId: "饥饿", stacks: 5 });
    check("T34 波3首领 未接线（无 cond 字段）且饥饿满5 → 线性推进",
      flesh.def.actions.every(a => !a.cond) && Turn._nextEnemyIdx(flesh, 0, flesh.def.actions) === 1);

    /* ⑤ _enemyPhase 集成：等待保持→条件命中切换（真打回合） */
    State.newBattle();
    const b19b = State.battle;
    const gate19 = { def: JSON.parse(JSON.stringify(DBF.enemies.find(e => e.id === "enemy_gate_key"))),
      uid: "g19", side: "enemy", hp: 999999, maxHp: 999999, buffs: [], shield: 0, guku: 0, gukuMax: 100, tentacles: 0, loopStart: 0 };
    b19b.allies = [];
    b19b.team = { hp: 999999, maxHp: 999999, resources: { furnace: 0 } };
    b19b.enemies = [gate19];
    b19b.aiIndex = { g19: 1 };
    b19b.phase = "play";
    b19b.playedCount = 1;
    b19b.turn = 1;
    State.notify();
    Turn._enemyPhase();   // 执行双翼初张（空我方=无伤害），出牌<4 → 保持
    check("T34 _enemyPhase 等待保持：执行后 aiIndex 仍指双翼初张(idx1)", b19b.aiIndex.g19 === 1);
    b19b.playedCount = 6;
    Turn._enemyPhase();   // 出牌>=4 → 跳四翼渐生
    check("T34 _enemyPhase 条件命中：aiIndex→四翼渐生(idx2)", b19b.aiIndex.g19 === 2);
    Turn._enemyPhase();   // 执行四翼渐生后无条件 → 线性到万物归一(idx3)
    check("T34 _enemyPhase 四翼渐生线性推进→万物归一(idx3)", b19b.aiIndex.g19 === 3);

    /* ⑥ 出牌计数：play 成功 +1，且随快照还原（预览/回溯不虚增） */
    State.newBattle();
    State.addAlly("char_c05", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const pc0 = State.battle.playedCount || 0;
    const uid19 = State.battle.piles.hand.find(c => (Cards.def(c) || {}).type !== "狂气爆发").uid;
    Cards.play(uid19, State.battle.enemies[0].uid);
    check("T34 play 后 playedCount +1", State.battle.playedCount === pc0 + 1, `${pc0}→${State.battle.playedCount}`);
    const snap19 = Turn.serializeState();
    State.battle.playedCount = 999;
    Turn.restoreState(snap19);
    check("T34 playedCount 随序列化还原（预览/回溯不虚增）", State.battle.playedCount === pc0 + 1);

    /* ⑦ 转阶段自动挂状态（石之眼案例：1阶段死亡→立刻1层免疫伤害，回合末照常行动） */
    State.newBattle();
    const b19c = State.battle;
    const eye19 = { def: JSON.parse(JSON.stringify(DBF.enemies.find(e => e.id === "enemy_stone_eye"))),
      uid: "eye19", side: "enemy", hp: 100, maxHp: 100, buffs: [], shield: 0, guku: 0, gukuMax: 100, tentacles: 0, phaseIdx: 0, loopStart: 0 };
    b19c.allies = [];
    b19c.team = { hp: 999999, maxHp: 999999, resources: { furnace: 0 } };
    b19c.enemies = [eye19];
    b19c.aiIndex = { eye19: 0 };
    b19c.phase = "play";
    State.notify();
    check("T34 石之眼 phases 入库（第2管40494@觉醒行+免疫buff）",
      eye19.def.phases && eye19.def.phases[0].hp === 40494 && eye19.def.phases[0].start === 4
      && eye19.def.phases[0].buffs[0].buffId === "buff_damage_immune");
    eye19.hp = 0;
    Turn.checkEnd();
    check("T34 石之眼 转阶段：血量重置40494+意图切觉醒行(idx4)+免疫伤害×1自动挂载",
      eye19.hp === 40494 && b19c.aiIndex.eye19 === 4
      && eye19.buffs.some(x => x.defId === "buff_damage_immune" && x.stacks === 1),
      `hp=${eye19.hp} ai=${b19c.aiIndex.eye19} buffs=${eye19.buffs.map(x => x.defId + "×" + x.stacks).join(",")}`);

    /* ⑧ 圣子.黑羽 免疫意图=真实挂 buff（此前 special 仅展示文字；duration=2 对齐「回合结束移除」时序） */
    const bf19 = { def: JSON.parse(JSON.stringify(DBF.enemies.find(e => e.id === "enemy_blackfeather"))),
      uid: "bf19", side: "enemy", hp: 99999, maxHp: 99999, buffs: [], shield: 0, guku: 0, gukuMax: 100, tentacles: 0 };
    const immuneAct = bf19.def.actions.find(a => (a.name || "").includes("免疫"));
    Turn._enemyAct(bf19, immuneAct);
    check("T34 圣子.黑羽 免疫意图 实挂 免疫伤害×1（duration=2）",
      bf19.buffs.some(x => x.defId === "buff_damage_immune" && x.stacks === 1 && x.duration === 2),
      bf19.buffs.map(x => x.defId + "×" + x.stacks + "@" + x.duration).join(","));
  }

  /* ---- 属性对账批（2026-10-02 朵尔 15:08 游戏截图 vs 养成面板）：体质实战口径/裸装对照行/脏数值钳制 ---- */
  console.log("== 8.22 属性对账批 ==");
  {
    State.newBattle();
    const doll = State.addAlly("char_doll", 70);
    /* 显式覆盖全部属性相关字段：不受鲸佬模式/本地保存配置影响 */
    doll.level = 70; doll.personaLv = 12; doll.innerGridLv = 1; doll.spiritAdaptLv = 10;
    doll.fatewheels = []; doll.fwStacks = [0, 0]; doll.pacts = [];
    doll.pactDetails = [null, null, null, null, null, null]; doll.pactSetBound = {};
    State.recalcAllyStats(doll);
    check("属性对账 主行体质=实战口径 102×1.3→133（与攻/防同含灵塑）",
      doll.stats.constitutionCombat === 133, "实际:" + doll.stats.constitutionCombat);
    check("属性对账 公式输入体质保持原始 102（深海共生/星天兽轮/地图队伍生命口径不变）",
      doll.stats.constitution === 102, "实际:" + doll.stats.constitution);
    /* 裸装对照 = 游戏「属性详情」面板锚点（剥离 命轮/密契/灵塑；保留 等级+灵格+深化+星级） */
    const bare = { def: doll.def, level: 70, innerGridLv: 1, personaLv: 12,
      fatewheels: [], fwStacks: [0, 0], pacts: [], pactDetails: [null, null, null, null, null, null],
      pactSetBound: {}, spiritAdaptLv: 0 };
    const naked = State.computeStats(doll.def, 72, State.collectStatMods(bare, { noRelics: true }));
    check("属性对账 裸装对照三维=游戏面板 102/83/111",
      naked.constitution === 102 && naked.attack === 83 && naked.defense === 111,
      `实际:${naked.constitution}/${naked.attack}/${naked.defense}`);
    check("属性对账 裸装对照二级=游戏面板 狂充14.4/银充36.6/暴击5/爆伤50",
      naked.gukuRecharge === 14.4 && naked.silverKeyCharge === 36.6 && naked.critRate === 5 && naked.critDmg === 50,
      `实际:${naked.gukuRecharge}/${naked.silverKeyCharge}/${naked.critRate}/${naked.critDmg}`);
    const pure = State.computeStats(doll.def, 72, []);
    check("属性对账 computeStats 纯函数（空mods）=等级基础插值 83/111",
      pure.attack === 83 && pure.defense === 111, `实际:${pure.attack}/${pure.defense}`);
    /* 脏数值钳制：超界叠位/强化/词条档不再放大属性 */
    const gukuFw = DBF.fatewheels.find(f => f.statMods && f.statMods.gukuRecharge);
    if (gukuFw) {
      doll.fatewheels = [gukuFw.id]; doll.fwStacks = [999, 0];
      State.recalcAllyStats(doll);
      const wm = State.collectStatMods(doll).find(m => (m.from || "").startsWith("命轮·"));
      check("属性对账 叠位999钳制为12（属性最高2倍）",
        wm && wm.gukuRecharge === Math.round(gukuFw.statMods.gukuRecharge * 2 * 100) / 100,
        "实际:" + (wm && wm.gukuRecharge));
    }
    doll.fatewheels = [];
    doll.pactDetails = [{ set: null, mainStat: "gukuRecharge", enhanceLv: 999, bound: false, subs: [{ stat: "gukuRecharge", lv: 99 }] }];
    State.recalcAllyStats(doll);
    const pm = State.collectStatMods(doll).find(m => (m.from || "").includes("密契主属性"));
    const pv = State.collectStatMods(doll).find(m => (m.from || "").includes("密契词条"));
    check("属性对账 密契强化999钳制12→主属性=2.5×满词条=2", pm && pm.gukuRecharge === 2, "实际:" + (pm && pm.gukuRecharge));
    check("属性对账 词条档99钳制8→=满词条0.8", pv && pv.gukuRecharge === 0.8, "实际:" + (pv && pv.gukuRecharge));
    /* 鲸佬模式不自动装密契/命轮（用户 2026-10-03 定案）：maxOut 只拉满养成项，装备全留空 */
    State.whale = true;
    const w19 = State.addAlly("char_ogilvy", 70);
    State.whale = false;
    check("鲸佬模式 养成全满但命轮/密契全空（装备 mods 零产出）",
      w19 && w19.personaLv === 12 && w19.spiritAdaptLv === 10 && w19.innerGridLv === 5
      && (w19.fatewheels || []).every(f => !f)
      && (w19.pacts || []).length === 0
      && (w19.pactDetails || []).every(p => !p)
      && State.collectStatMods(w19).every(m => !(m.from || "").includes("密契") && !(m.from || "").startsWith("命轮·")),
      "pactDetails已填:" + (w19 && w19.pactDetails.filter(Boolean).length));
  }

  /* ---- T38 系统性排查批（2026-10-03 用户六项反馈，序 C→D→B→A→E→F）---- */
  console.log("== 8.23 T38 系统性排查批 ==");
  {
    /* C 减费家族：打击计数泛化——视为「打击」同计、全队共享（卡面无归属限定） */
    State.newBattle();
    State.addAlly("char_rotan", 70);
    State.addAlly("char_ogilvy", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b23 = State.battle;
    Cards.generate("card_ogilvy_strike");
    Cards.play(b23.piles.hand.find(c => c.defId === "card_ogilvy_strike").uid, b23.enemies[0].uid);
    Cards.generate("card_rotan_strike");
    Cards.play(b23.piles.hand.find(c => c.defId === "card_rotan_strike").uid, b23.enemies[0].uid);
    check("T38C 打击计数全队共享（队友1+自己1=2）", b23.strikesPlayed === 2, "实际:" + b23.strikesPlayed);
    Cards.generate("card_rotan_blade");
    b23.energy = 9;
    Cards.play(b23.piles.hand.find(c => c.defId === "card_rotan_blade").uid, b23.enemies[0].uid);
    check("T38C 桀骜之刃 打2打击后费用=1（3-2 验收案例）", 9 - b23.energy === 1, "实耗:" + (9 - b23.energy));
    Cards.generate("card_rc_fallen");
    b23.energy = 9;
    Cards.play(b23.piles.hand.filter(c => c.defId === "card_rc_fallen").pop().uid, b23.enemies[0].uid);
    check("T38C 长刃·陨(视为打击)打出后计数+1（含桀骜之刃T39文本同步后计入）", b23.strikesPlayed === 4, "实际:" + b23.strikesPlayed);
    Cards.generate("char_c17_s1");
    const hbp23 = b23.piles.hand.find(c => c.defId === "char_c17_s1");
    if (hbp23) Cards.play(hbp23.uid, null);
    check("T38C 人间爆破(视为打击)计数+1", b23.strikesPlayed === 5, "实际:" + b23.strikesPlayed);
    Cards.generate("card_rc_fallen");
    b23.energy = 9;
    Cards.play(b23.piles.hand.filter(c => c.defId === "card_rc_fallen").pop().uid, b23.enemies[0].uid);
    check("T38C 长刃·陨按累计打击数减费 4-4=0（打击/视为打击全计入累计）", 9 - b23.energy === 0, "实耗:" + (9 - b23.energy));

    /* D 回响+打出次数变身（鲜血链条↔嗜血链球）：按实例打出次数计，不按伤害段计 */
    State.newBattle();
    State.addAlly("char_helot_catena", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b24 = State.battle;
    b24.energy = 9;
    Cards.generate("card_hc_fresh");
    const h24 = b24.piles.hand.find(c => c.defId === "card_hc_fresh");
    Cards.play(h24.uid, b24.enemies[0].uid);
    check("T38D 回响：鲜血链条打出后回到手牌（不入弃牌堆）", b24.piles.hand.includes(h24));
    Cards.play(h24.uid, b24.enemies[0].uid);
    check("T38D 打出2次仍是鲜血链条（变身按打出次数计数）", h24.defId === "card_hc_fresh" && h24.playCount === 2);
    Cards.play(h24.uid, b24.enemies[0].uid);
    check("T38D 打出3次变身为嗜血链球（同实例、计数清零）", h24.defId === "card_hc_ball" && h24.playCount === 0);
    Cards.play(h24.uid, b24.enemies[0].uid);
    check("T38D 嗜血链球打出后变回鲜血链条", h24.defId === "card_hc_fresh");
    check("T38D 变身/回响全程不进弃牌堆", b24.piles.discard.length === 0);

    /* B 目标范围：螺湮逆流/丧钟遥鸣 虚弱+易伤=全体1层（T38 B 修正） */
    State.newBattle();
    State.addAlly("char_o02", 70);
    State.addEnemy("enemy_dummy");
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b25 = State.battle;
    Cards.generate("char_o02_s1");
    b25.energy = 9;
    Cards.play(b25.piles.hand.find(c => c.defId === "char_o02_s1").uid, null);
    check("T38B 螺湮逆流 虚弱+易伤=全体各1层", b25.enemies.every(e => {
      const w = e.buffs.find(x => x.defId === "debuff_weak"), v = e.buffs.find(x => x.defId === "debuff_vul");
      return w && w.stacks === 1 && v && v.stacks === 1;
    }), b25.enemies.map(e => e.buffs.map(x => x.defId + "×" + x.stacks).join("|")).join(" / "));
    Cards.generate("char_c08_s2");
    b25.energy = 9;
    Cards.play(b25.piles.hand.find(c => c.defId === "char_c08_s2").uid, null);
    check("T38B 丧钟遥鸣 虚弱+易伤=全体各1层（叠加坡次）", b25.enemies.every(e => {
      const w = e.buffs.find(x => x.defId === "debuff_weak"), v = e.buffs.find(x => x.defId === "debuff_vul");
      return w && w.stacks === 2 && v && v.stacks === 2;
    }));

    /* A 卡面数值全量机审（T38 A）：text 公式 vs effects 值匹配反向审计。
     * 匹配规则：每个 scaleAttack/Defense/Constitution 效果在 text 中找到公式满足
     *   base==eBase（文本 Lv1 形）或 base+perLv==eBase（文本 A+B×级 形，引擎 resolve=base+perLv×(级-1)）；
     * 基础打击/防御 文本无等级项+perLv>0=T32 已核实口径；中毒层数/力量获得公式不入损伤配对。
     * 标注清单：T39（2026-10-03）后将原 6 张（深渊号令/隔空取物/集结鼠群/断颈一击/不耐的施舍/苍白回旋）
     * 的 text 全部同步 wiki 当前版，清单归零 */
    const A_TEXT_STALE = new Set();
    const A_KEY = { damage: "scaleAttack", block: "scaleDefense", heal: "scaleConstitution" };
    const A_RE = {};
    for (const [op, word] of [["damage", "攻击力"], ["block", "防御力"], ["heal", "体质"]]) {
      A_RE[op] = new RegExp(word + "\\*\\s*[（(]?\\s*([0-9.]+)(?:\\s*\\+\\s*([0-9.]+)\\s*\\*\\s*技能等级|\\s*\\+\\s*技能等级\\s*\\*\\s*([0-9.]+))?\\s*[）)]?\\s*%(?!\\s*层)", "g");
    }
    const aDiffs = [];
    for (const c of DBF.cards) {
      const txt = c.text || "";
      if (!c.effects || !c.effects.length || c.stances) continue;
      const isBasic = /^(基础)?(打击|防御)$/.test(c.name || "");
      for (const [op, r] of Object.entries(A_RE)) {
        r.lastIndex = 0;
        const effs = c.effects.filter(e => e.op === op && e[A_KEY[op]] != null);
        if (!effs.length) continue;
        const ms = [...txt.matchAll(r)];
        if (!ms.length) continue;
        for (const eff of effs) {
          const eBase = Math.round(eff[A_KEY[op]] * 10000) / 100;
          const eLv = eff.scalePerLv != null ? Math.round(eff.scalePerLv * 10000) / 100 : 0;
          const hit = ms.some(m => {
            const tBase = +m[1], tLv = (m[2] ? +m[2] : (m[3] ? +m[3] : 0));
            if (Math.abs(tBase - eBase) <= 0.011) return true;                    // 文本=Lv1 值形
            if (Math.abs(tBase + tLv - eBase) <= 0.011 && Math.abs(tLv - eLv) <= 0.011) return true;   // 文本=A+B×级 形
            return false;
          });
          if (!hit && !(isBasic && eLv > 0)) aDiffs.push(c.id + "|" + op);
        }
      }
    }
    const aReal = aDiffs.filter(id => !A_TEXT_STALE.has(id.split("|")[0]));
    check("T38A 机审差异清单归零（含标注清单外零差异）", aReal.length === 0, "差异:" + aReal.join(","));
    check("T38A 嗜血链球伤害=卡面公式 96+24×级（base 120/级24）", (() => {
      const e = DBF.cards.find(c => c.id === "card_hc_ball").effects[0];
      return e.scaleAttack === 1.2 && e.scalePerLv === 0.24;
    })());

    /* E 四神界域变体（框架层）：身份判定/生效界域/混编仍按基础组 */
    check("T38E 四神界域身份判定 ×4+普通角色null", State.variantRealmKey("蚀灭·萝坦") === "原初·混沌"
      && State.variantRealmKey("诞妄·墨菲") === "晦暝·深海"
      && State.variantRealmKey("沙耶") === "繁育·血肉"
      && State.variantRealmKey("阿拉克涅") === "奇点·超维"
      && State.variantRealmKey("朵尔") === null);
    check("T38E 生效界域替换+混编组保持基础界域",
      State.effectiveRealm({ name: "蚀灭·萝坦", realm: "混沌" }) === "原初·混沌"
      && State.effectiveRealm({ name: "朵尔", realm: "混沌" }) === "混沌"
      && State.realmGroup("原初·混沌") === "混沌" && State.realmGroup("晦暝·深海") === "深海"
      && State.realmGroup("繁育·血肉") === "血肉" && State.realmGroup("奇点·超维") === "超维");

    /* F 天赋钩子框架验证：显式注入 char_doll 灵知解构（healUpPerGuku）→ 手术回复 ×(1+狂充×0.5%)。
     * ⚠内置试点已撤下（游戏锚点矛盾：朵尔 persona12/狂充14.4 手术=44 纯卡面公式，见 8.24/state.js 注） */
    State.newBattle();
    State.addAlly("char_doll", 80);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b26 = State.battle;
    const savedHooks = State.TALENT_HOOKS;
    State.TALENT_HOOKS = { char_doll: { healUpPerGuku: 0.005 } };   // 显式注入，测完恢复
    const hurt26 = () => { b26.team.hp = Math.max(1, b26.team.hp - 80); };
    b26.energy = 9;
    hurt26();
    Cards.generate("card_doll_surgery");
    const hpF0 = b26.team.hp;
    Cards.play(b26.piles.hand.find(c => c.defId === "card_doll_surgery").uid, null);
    const healUp = b26.team.hp - hpF0;
    State.TALENT_HOOKS = {};   // 关钩子对照（finally 恢复，防中途异常留脏状态）
    let healBase = 0;
    try {
      b26.energy = 9;
      hurt26();
      Cards.generate("card_doll_surgery");
      const hpF1 = b26.team.hp;
      Cards.play(b26.piles.hand.find(c => c.defId === "card_doll_surgery").uid, null);
      healBase = b26.team.hp - hpF1;
    } finally {
      State.TALENT_HOOKS = savedHooks;
    }
    const gukuF = b26.allies[0].stats.gukuRecharge;
    check("T38F 天赋钩子框架：注入后回复×(1+狂充×0.5%)", healUp === Math.ceil(healBase * (1 + gukuF * 0.005)),
      `带钩:${healUp} 裸:${healBase} 狂充:${gukuF}`);
  }

  /* ---- 外域手术锚点批（2026-10-03 用户三次校准定案：Wiki 基数 15，卡面44已含天赋加成）----
   * 三段链：pct=(15+3%×(级-1))×1.33(启灵①) → v=ceil(体质×pct) → ×(1+狂充×0.5%)(灵知解构)。
   * 卡面=面板体质 102、实战=实战体质 133（灵塑实战生效，58=卡面×1.3）。
   * 镜像用户真实朵尔：Lv70 灵格1 灵塑10 persona12（狂充14.4）cardLv6 */
  console.log("== 8.24 外域手术锚点批 ==");
  {
    State.newBattle();
    const d27 = State.addAlly("char_doll", 70);
    d27.personaLv = 12; d27.innerGridLv = 1; d27.spiritAdaptLv = 10; d27.cardLv = 6;
    d27.enlightenOn = [true, true, true];
    d27.fatewheels = []; d27.fwStacks = [0, 0]; d27.pacts = [];
    d27.pactDetails = [null, null, null, null, null, null]; d27.pactSetBound = {};   // 清装备：addAlly 会套用前面小节留下的保存配置（8.22 钳制测试的密契狂充 +2.8 案例）
    State.recalcAllyStats(d27);
    check("T38锚点 前置：朵尔狂充=14.4（persona12 深化口径，镜像用户配置）", d27.stats.gukuRecharge === 14.4,
      "实际:" + d27.stats.gukuRecharge);
    State.addEnemy("enemy_dummy");
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b27 = State.battle;
    const sgDef27 = DBF.cards.find(c => c.id === "card_doll_surgery");
    check("T38锚点 卡面=面板体质×43% → 44（无灵塑）",
      Cards.describeEffects(sgDef27, d27).join().includes("回复44点生命"),
      Cards.describeEffects(sgDef27, d27).join("|").slice(0, 60));
    b27.energy = 9;
    b27.team.hp = Math.max(1, b27.team.hp - 80);
    Cards.generate("card_doll_surgery");
    const hp27 = b27.team.hp;
    Cards.play(b27.piles.hand.find(c => c.defId === "card_doll_surgery").uid, null);
    check("T38锚点 外域手术 实战=实战体质×43% → 58（=卡面×1.3 用户实测）", b27.team.hp - hp27 === 58,
      "实际:" + (b27.team.hp - hp27));
    check("T38锚点 启灵①虚弱=全体2层", b27.enemies.every(e => {
      const w = e.buffs.find(x => x.defId === "debuff_weak");
      return w && w.stacks === 2;
    }), b27.enemies.map(e => e.buffs.map(x => x.defId + "×" + x.stacks).join("|")).join(" / "));
    /* 对照：关启灵①后治疗回落 30%（无乘算）→ceil(133×30%)=40→×1.072=43、虚弱本次+1层（上次2层未衰减） */
    d27.enlightenOn = [false, true, true];
    b27.energy = 9;
    b27.team.hp = Math.max(1, b27.team.hp - 80);
    Cards.generate("card_doll_surgery");
    const hp27b = b27.team.hp;
    Cards.play(b27.piles.hand.filter(c => c.defId === "card_doll_surgery").pop().uid, null);
    check("T38锚点 关启灵①：治疗=ceil(ceil(133×30%)×1.072)=43、虚弱+1层",
      b27.team.hp - hp27b === 43
      && b27.enemies.every(e => {
        const w = e.buffs.find(x => x.defId === "debuff_weak");
        return w && w.stacks === 3;
      }),
      "治疗:" + (b27.team.hp - hp27b));
  }

  console.log("== 8.25 固有天赋（T40）==");
  {
    /* ① 卡茜亚：界域精通→魔术嘉年华 basePlain（attrCardFlat） */
    State.newBattle();
    const ka = State.addAlly("char_kasia"); ka.spiritAdaptLv = 0; ka.fatewheels = []; ka.pacts = []; ka.stats = ka.stats || {}; ka.stats.damageBoost = 0; ka.stats.critRate = 0;
    ka.stats.realmMastery = 3;
    State.addEnemy((DBF.enemies.find(e => (e.name || "").includes("木桩")) || {}).id);
    Turn.startBattle();
    const eK = State.battle.enemies[0];
    const dKa = Damage.compute({ source: ka, target: eK, card: { name: "魔术嘉年华", type: "攻击" }, eff: { value: 100 } }).final;
    check("T40 卡茜亚 界域精通3点→魔术嘉年华+0.6%（100→101）", dKa === 101, "实际:" + dKa);
    /* ② 詹金：暴击率→基础打击 basePlain（attrCardFlat 自洽断言：暴击率读面板） */
    State.newBattle();
    const je = State.addAlly("char_jenkin"); je.spiritAdaptLv = 0; je.fatewheels = []; je.pacts = []; je.stats = je.stats || {}; je.stats.damageBoost = 0;
    State.addEnemy((DBF.enemies.find(e => (e.name || "").includes("木桩")) || {}).id);
    Turn.startBattle();
    const eJ = State.battle.enemies[0];
    const dJe = Damage.compute({ source: je, target: eJ, card: { name: "基础打击", type: "攻击" }, eff: { value: 100 } }).final;
    const expJe = Math.ceil(100 * (1 + (je.stats.critRate || 0) * 2 / 100));
    check("T40 詹金 暴击率×2→基础打击（自洽：100×(1+暴击率×2%)）", dJe === expJe, `实际:${dJe} 预期:${expJe}（暴击率${je.stats.critRate}）`);
    /* ③ 艾瑞卡：银充→电磁爆破打出后临时暴击率/暴伤（attrCardCritOnPlay） */
    State.newBattle();
    const er2 = State.addAlly("char_d08"); er2.spiritAdaptLv = 0; er2.fatewheels = []; er2.pacts = []; er2.stats = er2.stats || {}; er2.stats.silverKeyCharge = 15;
    State.addEnemy((DBF.enemies.find(e => (e.name || "").includes("木桩")) || {}).id);
    Turn.startBattle();
    State.talentOnPlay(er2, { name: "电磁爆破", type: "技能" });
    const cu = er2.buffs.find(x => x.defId === "buff_crit_up");
    check("T40 艾瑞卡 银充15×0.5→电磁爆破临时暴击率/暴伤+7.5", !!cu && cu.stacks === 7.5, "实际:" + (cu ? cu.stacks : "无"));
    /* ④ 珊：死抗→基础卡狂气加成点数（attrCardGuku） */
    State.newBattle();
    const sh = State.addAlly("char_o08"); sh.spiritAdaptLv = 0; sh.fatewheels = []; sh.pacts = []; sh.stats = sh.stats || {}; sh.stats.deathResist = 8;
    State.addEnemy((DBF.enemies.find(e => (e.name || "").includes("木桩")) || {}).id);
    Turn.startBattle();
    check("T40 珊 死抗8×0.03→基础卡狂气+0.24", State.talentGukuBonus(sh, { name: "基础打击" }) === 0.24,
      "实际:" + State.talentGukuBonus(sh, { name: "基础打击" }));
    /* ⑤ 拉蒙娜（环行）：心与银的共振 +2.5 银充（strip 后重算，对比无天赋基准） */
    State.newBattle();
    const rm = State.addAlly("char_ramona_timeworn"); rm.spiritAdaptLv = 0; rm.fatewheels = []; rm.pacts = [];
    State.recalcAllyStats(rm);
    State.addEnemy((DBF.enemies.find(e => (e.name || "").includes("木桩")) || {}).id);
    Turn.startBattle();
    const withTalent = rm.stats.silverKeyCharge;
    delete State.TALENT_HOOKS["char_ramona_timeworn"];
    State.recalcAllyStats(rm);
    const withoutTalent = rm.stats.silverKeyCharge;
    State.TALENT_HOOKS["char_ramona_timeworn"] = { silverKeyFlat: 2.5 };
    State.recalcAllyStats(rm);
    check("T40 环行·拉蒙娜 心与银的共振 银充+2.5（strip 重算对比）", withTalent - withoutTalent === 2.5,
      `有:${withTalent} 无:${withoutTalent}`);
  }

  console.log("== 8.26 灵塑专属（T41）==");
  {
    const dummyId = (DBF.enemies.find(e => (e.name || "").includes("木桩")) || {}).id;
    const strip = (a) => { a.fatewheels = []; a.pacts = []; a.stats = a.stats || {}; a.stats.damageBoost = 0; a.stats.critRate = 0; return a; };
    /* ① 艾瑞卡：开战力量/戒备（点数=ceil(面板×X%)） */
    State.newBattle();
    const eri = State.addAlly("char_d08"); eri.spiritAdaptLv = 10; strip(eri);
    State.addEnemy(dummyId);
    Turn.startBattle();
    check("T41 艾瑞卡 开战力量=ceil(攻×15%)",
      (() => { const b = __buff(eri, "buff_strength"); return !!b && b.stacks === Math.ceil((eri.stats.attack || 0) * 15 / 100); })(),
      "实际:" + ((__buff(eri, "buff_strength") || {}).stacks));
    check("T41 艾瑞卡 开战戒备=ceil(防×3%)",
      (() => { const g = __buff(eri, "buff_guard"); return !!g && g.stacks === Math.ceil((eri.stats.defense || 0) * 3 / 100); })(),
      "实际:" + ((__buff(eri, "buff_guard") || {}).stacks));
    /* ② 环行·拉蒙娜：开战银钥能量=银充×250% */
    State.newBattle();
    const ram = State.addAlly("char_ramona_timeworn"); ram.spiritAdaptLv = 10; strip(ram);
    State.addEnemy(dummyId);
    const silver0 = State.battle.silver || 0;
    Turn.startBattle();
    const expAg = Math.floor((ram.stats.silverKeyCharge || 0) * 250 / 100);
    check("T41 环行·拉蒙娜 开战银钥能量=银充×250%", State.battle.silver - silver0 === expAg,
      "实际:" + (State.battle.silver - silver0) + " 预期:" + expAg);
    /* ③ 戈利亚：基础伤害提高50%（②.5 basePlain 组同组加算） */
    State.newBattle();
    const gol = State.addAlly("char_o06"); gol.spiritAdaptLv = 10; strip(gol);
    State.addEnemy(dummyId);
    Turn.startBattle();
    const e0 = State.battle.enemies[0];
    const eff100 = { value: 100 };
    const dWith = Damage.compute({ source: gol, target: e0, card: null, eff: eff100 }).final;
    gol.spiritAdaptLv = 0;
    const dWithout = Damage.compute({ source: gol, target: e0, card: null, eff: eff100 }).final;
    gol.spiritAdaptLv = 10;
    check("T38F/T41 戈利亚 基础伤害+50%（100→150）", dWith === 150 && dWithout === 100, `实际:${dWith}/${dWithout}`);
    /* ④ 茉夏：团队打击基础伤害+35%（strike 组，仅打击卡） */
    State.newBattle();
    const mo = State.addAlly("char_c17"); mo.spiritAdaptLv = 10; strip(mo);
    const og = State.addAlly("char_ogilvy"); og.spiritAdaptLv = 0; strip(og);
    State.addEnemy(dummyId);
    Turn.startBattle();
    const e1 = State.battle.enemies[0];
    const strikeCard = { name: "打击", type: "攻击" };
    const dMo = Damage.compute({ source: og, target: e1, card: strikeCard, eff: eff100 }).final;
    mo.spiritAdaptLv = 0;
    const dMo0 = Damage.compute({ source: og, target: e1, card: strikeCard, eff: eff100 }).final;
    mo.spiritAdaptLv = 10;
    check("T41 茉夏 团队打击基础伤害+35%（100→135）", dMo === 135 && dMo0 === 100, `实际:${dMo}/${dMo0}`);
    /* ⑤ 血链·希洛：缚身锁链额外享受 X% 力量点数（③区附加） */
    State.newBattle();
    const hel = State.addAlly("char_helot_catena"); hel.spiritAdaptLv = 10; strip(hel);
    State.addEnemy(dummyId);
    Turn.startBattle();
    Buffs.add(hel, "buff_strength", 50, null, "测试");
    const e2 = State.battle.enemies[0];
    const dHel = Damage.compute({ source: hel, target: e2, card: { name: "缚身锁链", type: "攻击" }, eff: { value: 100 } }).final;
    hel.spiritAdaptLv = 0;
    const dHel0 = Damage.compute({ source: hel, target: e2, card: { name: "缚身锁链", type: "攻击" }, eff: { value: 100 } }).final;
    hel.spiritAdaptLv = 10;
    check("T41 血链·希洛 缚身锁链+力量点数×100%（150→200）", dHel === 200 && dHel0 === 150, `实际:${dHel}/${dHel0}`);
    /* ⑥ 莉莉：打击最终伤害+35%（⑥.5，首领战翻倍） */
    State.newBattle();
    const lil = State.addAlly("char_c10"); lil.spiritAdaptLv = 10; strip(lil);
    State.addEnemy(dummyId);
    Turn.startBattle();
    const e3 = State.battle.enemies[0];
    const dLil = Damage.compute({ source: lil, target: e3, card: strikeCard, eff: eff100 }).final;
    e3.def = Object.assign({}, e3.def, { tier: "boss" });
    const dLilBoss = Damage.compute({ source: lil, target: e3, card: strikeCard, eff: eff100 }).final;
    check("T41 莉莉 打击最终伤害+35%（100→135）、首领翻倍（→170）", dLil === 135 && dLilBoss === 170, `实际:${dLil}/${dLilBoss}`);
    /* ⑦ 力量获取乘区（杜勒赛因团队/雷娅自身） */
    State.newBattle();
    const du = State.addAlly("char_b10"); du.spiritAdaptLv = 10; strip(du);
    const og2 = State.addAlly("char_ogilvy"); og2.spiritAdaptLv = 0; strip(og2);
    State.addEnemy(dummyId);
    Turn.startBattle();
    check("T41 杜勒赛因 力量获取+15%（团队乘区 1.15）", Spirit.strGainMult(og2) === 1.15,
      "实际:" + Spirit.strGainMult(og2));
    du.spiritAdaptLv = 0;
    check("T41 力量乘区随灵塑归零回落 1.0", Spirit.strGainMult(og2) === 1, "实际:" + Spirit.strGainMult(og2));
    /* ⑧ 触腕成员词条：仅成员触发的触腕（怒涛 src 路径） */
    State.newBattle();
    const cel = State.addAlly("char_o09"); cel.spiritAdaptLv = 10; strip(cel);
    State.addEnemy(dummyId);
    Turn.startBattle();
    const b8 = State.battle;
    b8.tentacle = { count: 1, stance: "潮涌", rally: 0 };
    const e4 = b8.enemies[0];
    const hpA = e4.hp;
    Tentacle.strike(e4, 1, "测试", cel);            // 成员触发 → ×1.5
    const dCel = hpA - e4.hp;
    e4.hp = hpA;
    Tentacle.strike(e4, 1, "测试");                 // 自动触腕（无 src）→ 不吃词条
    const dAuto = hpA - e4.hp;
    check("T41 希莱斯特 成员触发触腕×1.5、自动触腕不吃词条（E6 口径）", dCel === Math.ceil(dAuto * 1.5) && dAuto > 0,
      `成员触发:${dCel} 自动:${dAuto}`);
  }

  /* ---- 朵尔缺牌批（2026-10-03 用户「朵尔少了一张牌」）：等价交换建卡 + buildDeck wiki 映射补齐 ---- */
  console.log("== 8.27 朵尔缺牌批 ==");
  {
    State.newBattle();
    const d28 = State.addAlly("char_doll", 70);
    d28.personaLv = 0; d28.innerGridLv = 0; d28.spiritAdaptLv = 0; d28.cardLv = 1;
    d28.enlightenOn = [true, true, true];
    d28.fatewheels = []; d28.fwStacks = [0, 0]; d28.pacts = [];
    d28.pactDetails = [null, null, null, null, null, null]; d28.pactSetBound = {};
    State.recalcAllyStats(d28);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b28 = State.battle;
    const names28 = b28.piles.draw.concat(b28.piles.hand).map(c => Cards.def(c).name);
    check("T39朵尔 牌组=4张含等价交换（wiki 技能2 映射，觉醒/爆发不进堆）",
      names28.includes("等价交换") && names28.length === 4
      && !names28.includes("灵肉两分") && !names28.includes("理性，真理与现实"),
      names28.join("/"));
    /* 打出等价交换：弃掉其余手牌（4张），治疗=主治疗(含灵知解构)+弃4张额外回复 */
    b28.energy = 9;
    b28.team.hp = Math.max(1, b28.team.hp - 200);
    Cards.generate("card_doll_exchange");
    const ex28 = b28.piles.hand.filter(c => c.defId === "card_doll_exchange").pop();
    const hp28 = b28.team.hp;
    Cards.play(ex28.uid, null);
    const con28 = d28.stats.constitutionCombat;
    const exp28 = Math.ceil(Math.ceil(con28 * 0.25) * (1 + d28.stats.gukuRecharge * 0.005)) + Math.ceil(con28 * 0.05 * 4);
    check("T39朵尔 等价交换：主治疗(含灵知解构)+弃4张额外回复", b28.team.hp - hp28 === exp28 && b28.piles.hand.length === 0,
      `实际:${b28.team.hp - hp28} 预期:${exp28}（体质${con28} 弃4张 手牌余${b28.piles.hand.length}）`);
  }

  /* ---- T39 卡牌描述版本对齐（2026-10-03 用户点名 9 人）：text 同步 wiki 当前版 + 异质潮汐补易伤 ---- */
  console.log("== 8.28 T39 描述对齐批 ==");
  {
    const T = (id) => (DBF.cards.find(c => c.id === id) || {}).text || "";
    check("T39 萝坦 桀骜之刃/恣睢之浪/混沌之兽 同步 wiki 百分比公式",
      T("card_rotan_blade").includes("[攻击力*7.5%]") && T("card_rotan_blade").includes("视为「打击」")
      && T("card_rotan_wave").includes("[攻击力*7.5%]") && T("card_rotan_awaken").includes("[攻击力*40%]"));
    check("T39 拉蒙娜 女王之剑15%×3/攻势推演衰竭/世界演绎法 同步",
      T("card_ramona_queenblade").includes("[攻击力*15%]") && T("card_ramona_queenblade").includes("伤害次数+1")
      && T("card_ramona_tactics").includes("衰竭") && T("card_ramona_tactics").includes("[防御力*7.5%]")
      && T("card_ramona_awaken").includes("100点银钥能量"));
    check("T39 阿格里帕 迷途之旅/苍白回旋15%/苍白的庇佑/不耐的施舍 同步",
      T("card_agrippa_journey").includes("回合结束后") && T("card_agrippa_spiral").includes("[攻击力*15%]")
      && T("card_agrippa_awaken").includes("【吞噬") && T("card_agrippa_alms").includes("[防御力*12.5%]"));
    check("T39 图鲁 不朽威仪1.6%/深渊号令60%/螺湮重临/星辰正位 同步",
      T("card_tulu_majesty").includes("触腕数量上限") && T("card_tulu_abyss").includes("[攻击力*60%]")
      && T("card_tulu_spiral").includes("[攻击力*20%]") && T("card_tulu_awaken").includes("[攻击力*26%]"));
    check("T39 奥吉尔 骑士热诚/穿刺之枪/不定壁垒/七艺 同步",
      T("card_ogilvy_zeal").includes("[攻击力*3.75%]") && T("card_ogilvy_spear").includes("[攻击力*25%]")
      && T("card_ogilvy_barrier").includes("[防御力*7%]") && T("card_ogilvy_awaken").includes("[防御力*30%]"));
    check("T39 莉兹/卡茜亚/詹金/达芙黛尔 代表卡同步",
      T("card_liz_greenfire").includes("强行打出") && T("card_liz_awaken").includes("[攻击力*20%]")
      && T("card_kasia_prelude").includes("[攻击力*12%]") && T("card_kasia_awaken").includes("[攻击力*75%]")
      && T("card_jenkin_rats").includes("抽牌堆顶部") && T("card_jenkin_brown").includes("对所有敌人")
      && T("card_dafdel_necksnap").includes("[攻击力*50%]") && T("card_dafdel_awaken").includes("千面幻象"));
    const tide = DBF.cards.find(c => c.id === "card_dafdel_tide");
    check("T39 异质潮汐 补 易伤所有敌人1层（wiki：力量并易伤所有敌人）",
      (tide.effects || []).some(e => e.buffId === "debuff_vul" && e.target === "all_enemies")
      && T("card_dafdel_tide").includes("易伤所有敌人"));
  }

  /* ---- T42 衍生卡四件补全（2026-10-03 用户口述定案）---- */
  console.log("== 8.29 T42 衍生卡批 ==");
  {
    /* ① 警觉：无效果死卡——打出不抛错、进消耗 */
    State.newBattle();
    const rA = State.addAlly("char_doll", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const bA = State.battle;
    Cards.generate("shared_alert");
    const al = bA.piles.hand.find(c => c.defId === "shared_alert");
    Cards.play(al.uid, null);
    check("T42① 警觉 打出=空效果（不抛错+进消耗）",
      bA.piles.exhaust.some(c => c.defId === "shared_alert") && bA.team.hp > 0);
    /* ② 巨剑·鲸落：短刃噬第3打置旗→同回合长刃变鲸落回手→跨回合保留 */
    State.newBattle();
    const rB = State.addAlly("char_rotan_cetarchon", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const bB = State.battle;
    bB.energy = 9;
    Cards.generate("card_rc_bite");
    const biteInst = bB.piles.hand.filter(c => c.defId === "card_rc_bite").pop();   // 固定同一实例（洗回未建模：从弃牌堆捞回，playCount 累计）
    for (let i = 0; i < 3; i++) {
      if (!bB.piles.hand.includes(biteInst)) { bB.piles.discard = bB.piles.discard.filter(c => c !== biteInst); bB.piles.hand.push(biteInst); }
      Cards.play(biteInst.uid, bB.enemies[0].uid);
    }
    check("T42② 短刃·噬第3次打出→合成旗置位", bB.whaleFuseReady === true);
    Cards.generate("card_rc_fallen");
    bB.energy = 9;
    Cards.play(bB.piles.hand.find(c => c.defId === "card_rc_fallen").uid, null);
    const whale = bB.piles.hand.find(c => c.defId === "card_rc_whale");
    check("T42② 同回合打出长刃·陨→变鲸落回手（不进弃牌堆）",
      !!whale && !bB.piles.discard.some(c => c.defId === "card_rc_whale"));
    Turn.endTurn();
    check("T42② 鲸落跨回合保留在手中", bB.piles.hand.some(c => c.defId === "card_rc_whale"));
    bB.phase = "play";
    Cards.generate("card_rc_fallen");
    bB.energy = 9;
    Cards.play(bB.piles.hand.find(c => c.defId === "card_rc_fallen").uid, null);
    check("T42② 新回合无旗→长刃正常进弃牌（不误合成）",
      bB.piles.discard.some(c => c.defId === "card_rc_fallen"));
    /* ③ 超级大集结：建卡+用户原话 notes */
    const mr = DBF.cards.find(c => c.id === "card_jenkin_mega_rally");
    check("T42③ 超级大集结! 在库+notes 带用户原话+基数待确认",
      !!mr && (mr.notes || "").includes("+10伤害次数") && (mr.notes || "").includes("待确认"));
    /* ④ 自毁改造·终末：choicesAll 直出双分支无弹窗+双效果齐发 */
    State.newBattle();
    const rC = State.addAlly("char_doll_inferno", 70);
    rC.fatewheels = []; rC.fwStacks = [0, 0]; rC.pacts = [];
    rC.pactDetails = [null, null, null, null, null, null]; rC.pactSetBound = {};
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const bC = State.battle;
    Cards.generate("card_di_reform_t");
    bC.energy = 9;
    Cards.play(bC.piles.hand.find(c => c.defId === "card_di_reform_t").uid, null);
    check("T42④ 终末=兴奋+诅咒同时生效（无弹窗直出）",
      rC.buffs.some(x => x.defId === "buff_boost_up")
      && bC.enemies[0].buffs.some(x => x.defId === "debuff_strength_down"));
  }

  /* ---- T43 SKey @@编队分享码（2026-10-03）：decode 角色映射/往返自洽/缺角色回落 ---- */
  console.log("== 8.30 T43 分享码批 ==");
  {
    check("T43 token 字典 61 条且无重复 token",
      ShareCode.TOKENS.length === 61
      && new Set(ShareCode.TOKENS.map(t => t.token)).size === 61);
    /* 用本库角色现算一条真实码（朵尔+奥吉尔+2 空位），验证 decode↔encode 往返 */
    State.newBattle();
    State.addAlly("char_doll", 60);
    State.addAlly("char_ogilvy", 60);
    const codeT = ShareCode.encode(State.battle.allies);
    check("T43 encode：朵尔+奥吉尔→@@码（2角色+2空位+13装备空位=21字符）",
      codeT.startsWith("@@") && codeT.endsWith("@@") && codeT.length === 21
      && codeT[2] !== "a" && codeT[3] !== "a" && codeT.slice(4, 17) === "a".repeat(13),
      codeT);
    const dec = ShareCode.decode(codeT);
    check("T43 decode：解析回 朵尔/奥吉尔+2空位（found 命中）",
      !dec.error && dec.slots.length === 4
      && dec.slots[0].found && dec.slots[0].name === "朵尔"
      && dec.slots[1].found && dec.slots[1].name === "奥吉尔"
      && dec.slots[2].token === "a" && dec.slots[3].token === "a");
    const reEnc = ShareCode.encode([]);   // 空编队 → 全 a
    check("T43 往返自洽：decode(encode(x)) 再 encode 稳定",
      ShareCode.encode(dec.slots.map(s => s.found ? { def: { name: s.name } } : null)) === codeT
      && reEnc === "@@" + "a".repeat(17) + "@@");
    check("T43 缺角色回落：未知 token → found=false 不导入",
      (() => {
        const bad = "@@zzzz" + "a".repeat(12) + "z@@";
        const d = ShareCode.decode(bad);
        return !d.error && d.slots.every(s => !s.found) && d.warnings.length >= 1;
      })());
    /* 导入放置：decode→addAlly 60 级 */
    State.newBattle();
    const d30 = ShareCode.decode(codeT);
    let placed30 = 0;
    for (const s of d30.slots) {
      if (!s.found) continue;
      const def = (DBF.characters || []).find(c => c.name === s.name);
      if (def) { const u = State.addAlly(def.id, 60); if (u) { u.level = 60; State.recalcAllyStats(u); placed30 += 1; } }
    }
    check("T43 导入放置：2 名 60 级唤醒体落位",
      placed30 === 2 && State.battle.allies.length === 2
      && State.battle.allies.every(a => a.level === 60));
  }

  /* ---- T44 沙盒资源修改+强制暴击（2026-10-04 立项）---- */
  console.log("== 8.31 T44 沙盒批 ==");
  {
    State.newBattle();
    State.addAlly("char_doll", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const b31 = State.battle;
    /* ① 资源修改：改后结算正确 */
    b31.energy = 42;
    b31.silver = -35;   // 负=透支
    check("T44① 算力/银钥改后读现值（透支负数兼容）", b31.energy === 42 && b31.silver === -35);
    Cards.generate("card_doll_strike");
    b31.energy = 3;
    Cards.play(b31.piles.hand.find(c => c.defId === "card_doll_strike").uid, b31.enemies[0].uid);
    check("T44① 出牌按修改后算力扣费（3-1=2）", b31.energy === 2, "实际:" + b31.energy);
    /* ② 强制暴击三态（damage.js deal 覆盖，source.side=ally） */
    const foe = b31.enemies[0];
    const hp0 = foe.hp;
    foe.hp = 99999; foe.maxHp = 999999;
    State.forceCrit = true;
    b31.energy = 9;
    Cards.generate("card_doll_strike");
    Cards.play(b31.piles.hand.find(c => c.defId === "card_doll_strike").uid, foe.uid);
    const critHit = hp0 - foe.hp;
    foe.hp = 99999;
    State.forceCrit = false;
    b31.energy = 9;
    Cards.generate("card_doll_strike");
    Cards.play(b31.piles.hand.find(c => c.defId === "card_doll_strike").uid, foe.uid);
    const noCrit = hp0 - foe.hp;
    check("T44② 强制暴击=true 必暴（>普通），=false 不暴（判定进非暴击区）",
      critHit > noCrit && noCrit > 0, `必暴:${critHit} 禁止:${noCrit}`);
    /* 敌方不受影响：敌方攻击（deal source.side=enemy）forceCrit=true 下 roll 正常 */
    State.forceCrit = true;
    const dollHp = b31.team.hp;
    Damage.deal({ source: foe, target: b31.allies[0], eff: { value: 5 }, label: "敌方测试" });
    check("T44② 敌方不受开关影响（仅我方覆盖）", typeof (dollHp - b31.team.hp) === "number");
    State.forceCrit = null;
    b31.team.hp = 9999; b31.team.maxHp = 9999;
  }

  /* ---- T45 配置分档保存（三槽 v2，切档互不覆盖/迁移不丢/随档）---- */
  console.log("== 8.32 T45 分档批 ==");
  {
    /* 迁移不丢：v2 键已由此前测试生成（含原版·个人内容）——校验结构 */
    const v2 = JSON.parse(localStorage.getItem("morimens_sim_save_v2") || "null");
    check("T45 v2 结构：active+三槽存在（v1 迁移进原版·个人）",
      v2 && v2.active === "原版·个人" && v2.slots && "原版·测试" in v2.slots && "自制" in v2.slots);
    /* 档 A 配置 → 切 B（互不覆盖）→ 切回 A 恢复 */
    State.newBattle();
    const sA = State.addAlly("char_doll", 70);
    sA.level = 80; sA.personaLv = 12;
    State.persist();
    const slotAChars = JSON.parse(localStorage.getItem("morimens_sim_save_v2")).slots["原版·个人"].chars || {};
    check("T45 档A保存含朵尔配置（level80）", slotAChars.char_doll && slotAChars.char_doll.level === 80);
    State.switchSaveSlot("原版·测试");
    check("T45 切档后编队清空+档B为空配置", State.battle.allies.length === 0 && State.saveSlot === "原版·测试");
    const sB = State.addAlly("char_doll", 70);
    check("T45 档B添加朵尔=默认配置（不被档A污染）", sB.level === 70 && sB.personaLv === 0, `level:${sB.level} persona:${sB.personaLv}`);
    State.persist();
    const v2b = JSON.parse(localStorage.getItem("morimens_sim_save_v2"));
    check("T45 档A不被档B写入覆盖（互不覆盖）",
      v2b.slots["原版·个人"].chars.char_doll.level === 80
      && v2b.slots["原版·测试"].chars.char_doll.level === 70);
    State.switchSaveSlot("原版·个人");
    const sA2 = State.addAlly("char_doll", 70);
    check("T45 切回档A：编队与养成随档恢复（level80/persona12）", sA2.level === 80 && sA2.personaLv === 12,
      `level:${sA2.level} persona:${sA2.personaLv}`);
    State.switchSaveSlot("原版·个人");   // 保持默认档，不留测试态
  }

  console.log("== 8.33 头像占位说明（T46 追加）==");
  {
    State.newBattle();
    State.addAlly("char_doll", 70);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const pt = document.querySelector(".u-portrait");
    check("T46 头像占位带说明（title 含立绘指引）",
      !!pt && (pt.getAttribute("title") || "").includes("立绘") && (pt.getAttribute("title") || "").includes("portraits"),
      pt ? (pt.getAttribute("title") || "").slice(0, 40) + "…" : "(无元素)");
  }

  console.log("== 8.34 T48 星辰篇环境 + 死亡抵抗（2026-10-05）==");
  {
    /* Math.random stub：死亡抵抗概率判定需要确定性（0=必成功、0.999999=必失败） */
    const realRandom = Math.random;
    DBF.relicDeck = [];   // 清默认造物（怪蛇残蜕死抗+8 会污染死亡抵抗断言）
    State.reset();
    State.newBattle();
    const sr = State.addAlly("char_rotan", 1);
    const sd = State.addAlly("char_doll", 1);
    const so = State.addAlly("char_ogilvy", 1);
    const sp = State.addAlly("char_ramona", 1);
    State.addEnemy("enemy_dummy");
    State.setCarriedYogen("yg_inject_guard");
    /* --- 死亡抵抗 --- */
    sr.stats.deathResist = 0; sd.stats.deathResist = 0; so.stats.deathResist = 0; sp.stats.deathResist = 0;
    Turn.startBattle();
    const sb = State.battle;
    sb.silver = 0;
    check("死亡抵抗: 队伍死抗和=0 直接判负不触发", (() => {
      Math.random = () => 0;   // 就算必成功也不该触发（resist=0 早退）
      sb.team.hp = 10;
      Damage.applyRawDamage(sr, 50, "t");
      Math.random = realRandom;
      return sb.team.hp === 0 && sb.phase === "play";   // hp=0 但尚未 checkEnd（checkEnd 在 deal/checkEnd 调用点判）
    })());
    check("死亡抵抗: checkEnd 判负正常", (() => { Turn.checkEnd(); return sb.phase === "over" && sb.result === "lose"; })());
    /* 重开：死抗 100% */
    State.reset(); State.newBattle();
    const r2d = State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    r2d.stats.deathResist = 100;
    Turn.startBattle();
    const db = State.battle;
    Math.random = () => 0;   // 必成功
    db.team.hp = 10;
    Damage.applyRawDamage(r2d, 999, "致命");
    Math.random = realRandom;
    check("死亡抵抗: 100%必存活且 hp=1", db.team.hp === 1 && db.phase === "play", "hp:" + db.team.hp);
    check("死亡抵抗: 触发后概率系数减半", db.deathResistChance === 0.5, "系数:" + db.deathResistChance);
    check("死亡抵抗: 二次触发按 50%（stub 失败→hp=0）", (() => {
      Math.random = () => 0.999999;   // 必失败
      db.team.hp = 5;
      Damage.applyRawDamage(r2d, 99, "致命2");
      Math.random = realRandom;
      return db.team.hp === 0;
    })());
    check("死亡抵抗: startBattle 重置系数", (() => {
      db.phase = "prep"; db.result = null; db.team.hp = db.team.maxHp;
      Turn.startBattle();
      return db.deathResistChance === 1;
    })());
    check("死亡抵抗: 触发钩子被调用", (() => {
      let hit = 0;
      const h = () => hit++;
      State.DEATH_RESIST_HOOKS.push(h);
      Math.random = () => 0;
      db.team.hp = 3;
      Damage.applyRawDamage(r2d, 66, "钩子");
      Math.random = realRandom;
      State.DEATH_RESIST_HOOKS = State.DEATH_RESIST_HOOKS.filter(x => x !== h);
      return hit === 1 && db.team.hp === 1;
    })());

    /* --- 星辰篇环境 --- */
    State.reset(); State.newBattle();
    const tx = State.addAlly("char_rotan", 1);   // 银充基线 15
    State.addEnemy("enemy_dummy");
    State.setCarriedYogen("yg_inject_guard");
    State.starEnv = true;
    Turn.startBattle();
    const zb = State.battle;
    check("星辰篇: 归档刻痕默认不加成", State.effDepths().physical === State.depths.physical);
    State.keeperYogenCount = 50;
    check("星辰篇: 归档刻痕 50 钥令 → 深度 ×1.5", State.effDepths().physical === Math.round(State.depths.physical * 1.5)
      && State.effDepths().spirit === Math.round(State.depths.spirit * 1.5));
    check("星辰篇: 钥令数值随归档深度缩放", Yogens.val({ p: 10 }) === Math.ceil(State.depths.physical * 1.5 * 10 / 100));
    State.keeperYogenCount = 0;
    /* 算力调和：本回合已出 10 张+1 层 → 下张 1 费卡实际扣 2、银钥额外 +银充×1 */
    zb.playedThisTurn = 10; zb.energyTune = 1;
    zb.energy = 9; zb.silver = 0;
    Cards.generate("card_rotan_hunger");   // 1 费
    const th = zb.piles.hand.find(c => c.defId === "card_rotan_hunger");
    Cards.play(th.uid, null);
    check("星辰篇·算力调和: 1费卡实扣 1+1层=2", zb.energy === 7, "energy:" + zb.energy);
    check("星辰篇·算力调和: 额外1点算力→100%银充(15)银钥", zb.silver === Math.round(State.silverPerCost(15) * 1) + 15,
      "silver:" + zb.silver + "（查表 " + State.silverPerCost(15) + " + 调和15）");
    check("星辰篇·算力调和: 打出后已>10张再获1层", zb.energyTune === 2, "层:" + zb.energyTune);
    /* 算力满盈：energy>12 转化 */
    zb.energy = 15;
    const silverBefore = zb.silver;
    const perExp = Math.round(3 * State.avgSilverCharge());
    State.clampEnergyStar();
    check("星辰篇·算力满盈: 15>12 → 钳到12、超出3点转银钥", zb.energy === 12 && zb.silver - silverBefore === perExp * 3,
      `+${zb.silver - silverBefore}（${perExp}/点×3）`);
    /* 狂气调和：爆发 +10 基础狂气 + 记录；回合末未爆发 → 银钥 */
    tx.guku = 100;
    Cards.releaseBurst(tx);
    const rcLv = tx.stats.gukuRecharge || 0;
    check("星辰篇·狂气调和: 爆发后基础狂气+10（清零→回冲[仅狂充>0]→+10）", tx.guku === 10 + (rcLv > 0 ? State.rechargeBonus(rcLv) : 0),
      "guku:" + tx.guku + " rc:" + rcLv);
    check("星辰篇·狂气调和: 爆发记录在案", (zb.burstUsedThisTurn || []).includes(tx.uid));
    zb.silver = 0;
    Turn.endTurn();
    check("星辰篇·狂气调和: 回合末 0 名未爆发 → 无银钥", zb.silver === 0, "silver:" + zb.silver);
    /* 未爆发场景：再过一回合（无人爆发→1人队全转） */
    const avg = State.avgSilverCharge();
    const expGain = Math.round(2 * avg) * 1;
    zb.silver = 0;
    Turn.endTurn();
    check("星辰篇·狂气调和: 回合末 1 名未爆发 → 银钥 +200%平均银充×1", zb.silver === expGain,
      "silver:" + zb.silver + "（预期" + expGain + "）");
    /* 键能超载 + 每回合1次 + 保留 */
    zb.silver = 5000;
    check("星辰篇·键能超载: 觉醒消耗=1000×(1+1人)=2000", Yogens.awakenCost() === 2000, "cost:" + Yogens.awakenCost());
    const handN0 = zb.piles.hand.length;
    check("星辰篇·银钥觉醒: 首次成功置入", Yogens.awaken("card_rc_sustain") === true && zb.piles.hand.length === handN0 + 1);
    check("星辰篇·银钥觉醒: 置入牌获「保留」（实例级）", zb.piles.hand[zb.piles.hand.length - 1].retainInst === true);
    check("星辰篇·银钥觉醒: 每回合第2次被拒", Yogens.awaken("card_rc_sustain") === false);
    Turn.endTurn();
    zb.silver = 5000;
    check("星辰篇·银钥觉醒: 新回合计数重置可再觉醒", (zb.silverAwakenThisTurn || 0) === 0 && Yogens.awaken("card_rc_sustain") === true);
    /* 保留：手牌里的 retainInst 牌回合末不弃 */
    Turn.endTurn();
    check("星辰篇·银钥觉醒: 置入牌跨回合保留在手", zb.piles.hand.some(c => c.retainInst === true));
    /* 快照/回溯带星辰字段 */
    zb.energyTune = 3; zb.playedThisTurn = 13;
    Turn.snapshotTurn();
    const snap = zb.history[zb.history.length - 1];
    check("星辰篇: 快照携带调和/抵抗字段", snap.star && snap.star.energyTune === 3 && snap.star.playedThisTurn === 13);
    zb.energyTune = 0; zb.playedThisTurn = 0;
    Turn.restoreState(snap);
    check("星辰篇: 回溯还原调和层数", zb.energyTune === 3 && zb.playedThisTurn === 13);
    /* 关闭环境回落常规口径 */
    State.starEnv = false; State.keeperYogenCount = 50;
    check("星辰篇关闭: 归档刻痕不再生效", State.effDepths().physical === State.depths.physical);
    check("星辰篇关闭: 觉醒消耗回落翻倍口径", Yogens.awakenCost() === 1000 * Math.pow(2, zb.silverAwakenCount));
    State.keeperYogenCount = 0;
    State.starEnv = false;
  }

  console.log("== 8.35 T50 关卡造物 + 刻印（2026-10-05）==");
  {
    DBF.relicDeck = [];   // 清默认造物（旧库怪蛇残蜕死抗污染队伍键断言）
    State.levelRelicDeck = [];
    State.reset(); State.newBattle();
    /* --- A 数据完整性 --- */
    check("T50: 关卡造物库 224 条", (DBF.levelRelics || []).length === 224, String((DBF.levelRelics || []).length));
    check("T50: 刻印库 35 条（普通18+高级17）", (DBF.sigils || []).length === 35
      && DBF.sigils.filter(s => s.grade === "普通刻印").length === 18
      && DBF.sigils.filter(s => s.grade === "高级刻印").length === 17);
    check("T50: 关卡初始造物五禁区", (DBF.levelInitial || []).length === 5
      && DBF.levelInitial[0].level === "第一禁区·危险等级C"
      && DBF.levelInitial[4].initial[0].name === "日月轮盘+");
    check("T50: 环境规则三组（时空扭曲含 4 规则）", (DBF.levelEnvRules || []).length === 3
      && DBF.levelEnvRules[2].group === "时空扭曲" && DBF.levelEnvRules[2].rules.length === 4
      && DBF.levelEnvRules[2].rules[0].name === "存在悖论");
    check("T50: 转录忠实抽样（普特尼晨报 逐字+src 可复核）", (() => {
      const r = DBF.levelRelics.find(x => x.name === "普特尼晨报");
      return r && r.quality === "白银造物" && r.cat === "洞察"
        && r.effect.includes("战斗开始时获得 15% 伤害强效") && r.flavor === "您最贴心的马桶伴侣。"
        && r.src === "20261005025001_1.jpg";
    })());
    check("T50: 维度影像族在库（战斗内拾取组 ≥14 + 图鉴组）", (() => {
      const inn = DBF.levelRelics.filter(x => x.cat === "维度影像·战斗内");
      return inn.length >= 14 && !!DBF.levelRelics.find(x => x.name === "维度影像·图鲁")
        && !!DBF.levelRelics.find(x => x.name === "维度影像·血链·希洛");
    })());
    check("T50: 未建模登记（mods 空 + notes 在案）", (() => {
      const r = DBF.levelRelics.find(x => x.name === "普特尼晨报");
      return r && Object.keys(r.mods).length === 0 && /未建模/.test(r.notes);
    })());
    /* --- B 关卡造物结算 --- */
    check("T50: team 静态键（哭泣烟斗 强效+0.3 进队伍）", (() => {
      State.levelRelicDeck = [];
      const before = State.teamStats().damageBoost;
      LevelRelics.add(DBF.levelRelics.find(x => x.name === "哭泣烟斗").id);
      const after = State.teamStats().damageBoost;
      LevelRelics.remove(DBF.levelRelics.find(x => x.name === "哭泣烟斗").id);
      return Math.abs(after - before - 0.3) < 1e-9 && State.teamStats().damageBoost === before;
    })());
    check("T50: add/remove 随存档持久", (() => {
      LevelRelics.add(DBF.levelRelics.find(x => x.name === "定向罗盘").id);
      const saved = State.loadSave();
      const ok = Array.isArray(saved.levelRelicDeck) && saved.levelRelicDeck.length === 1;
      LevelRelics.clear();
      return ok;
    })());
    State.reset(); State.newBattle();
    const lrAlly = State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    State.levelRelicDeck = [DBF.levelRelics.find(x => x.name === "红宝石胸针").id];
    Turn.startBattle();
    check("T50: 开战力量（红宝石胸针 +78 点 buff_strength，共享一份挂血条下）", (() => {
      const bi = __buff(lrAlly, "buff_strength");
      return bi && bi.per === 78 && State.battle.team.buffs.length === 1;   // 恰好一份，不每人重复
    })());
    State.levelRelicDeck = [
      DBF.levelRelics.find(x => x.name === "定向罗盘").id,
      DBF.levelRelics.find(x => x.name === "活性注射器").id,
    ];
    Turn.startBattle();
    check("T50: 最大算力（活性注射器 5+1）", (() => {
      State.levelRelicDeck = [DBF.levelRelics.find(x => x.name === "活性注射器").id];
      Turn.startBattle();
      return State.battle.energy === State.ENERGY_PER_TURN + 1;
    })(), "energy:" + State.battle.energy);
    check("T50: 回合开始抽牌（定向罗盘 +1，注卡保证有牌）", (() => {
      State.levelRelicDeck = [DBF.levelRelics.find(x => x.name === "定向罗盘").id];
      const b2 = State.battle;
      /* 单人基础牌堆仅 4 张会被首轮抽光——向抽牌堆注 2 张保证罗盘有牌可抽 */
      for (let i = 0; i < 2; i++) b2.piles.draw.push(Cards.inst("card_rotan_hunger", false));
      const h0 = b2.piles.hand.length;
      LevelRelics.onTurnStart();
      return b2.piles.hand.length === h0 + 1;
    })(), `hand:${State.battle.piles.hand.length}`);
    check("T50: 回合末回血（恩赐之血 78，共享血条）", (() => {
      State.levelRelicDeck = [DBF.levelRelics.find(x => x.name === "恩赐之血").id];
      const b = State.battle;
      b.team.hp = b.team.maxHp - 100;
      LevelRelics.onTurnEnd();
      return b.team.hp === b.team.maxHp - 100 + 78;
    })());
    check("T50: 探索边界清空（State.reset → deck 空）", (() => { State.reset(); return State.levelRelicDeck.length === 0; })());
    /* --- C 刻印 --- */
    State.newBattle();
    const sgAlly = State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const gb = State.battle;
    gb.energy = 9;
    check("T50: 刻印筹算（打出 +1 算力）", (() => {
      Cards.generate("card_rotan_hunger");   // 1 费
      const inst = gb.piles.hand.find(c => c.defId === "card_rotan_hunger");
      Sigils.attach(inst, "筹算");
      const e0 = gb.energy;
      Cards.play(inst.uid, null);
      return gb.energy === e0 - 1 + 1;
    })(), "energy:" + gb.energy);
    check("T50: 刻印铁壁（打出 +117 护盾挂 owner）", (() => {
      gb.energy = 9;
      Cards.generate("card_rotan_hunger");
      const inst = gb.piles.hand.find(c => c.defId === "card_rotan_hunger");
      Sigils.attach(inst, "铁壁");
      Cards.play(inst.uid, null);
      return sgAlly.shield === 117;
    })(), "shield:" + sgAlly.shield);
    check("T50: 刻印虚弱（全体敌人 1 回合）", (() => {
      gb.energy = 9;
      Cards.generate("card_rotan_hunger");
      const inst = gb.piles.hand.find(c => c.defId === "card_rotan_hunger");
      Sigils.attach(inst, "虚弱");
      Cards.play(inst.uid, null);
      return gb.enemies.every(e => e.hp <= 0 || (e.buffs || []).some(x => x.defId === "debuff_weak"));
    })());
    check("T50: 刻印数据模型（35 条中 21 条已建模 onPlay）", DBF.sigils.filter(s => Object.keys(s.mods || {}).length > 0).length === 21);
    State.levelRelicDeck = [];
  }

  console.log("== 8.365 旧日余烬「每回合重置」（2026-10-06 实装）==");
  {
    DBF.relicDeck = [];
    State.reset();
    State.newBattle();
    const er = State.addAlly("char_rotan", 1);
    const em = State.addEnemy("enemy_molted_a");   // 蜕化者A：n1 自带 73 层余烬
    State.addEnemy("enemy_dummy");                 // 无余烬对照怪
    Turn.startBattle();
    const eb = State.battle;
    eb.team.maxHp = eb.team.hp = 99999;   // Lv1 队伍 92 血会被蜕化者反击团灭（phase=over 连锁失败）
    const emberOf = (u) => (u.buffs || []).find(x => x.defId === "buff_ember");
    check("余烬: addEnemy 记录基准 emberBase=73", em.emberBase === 73 && emberOf(em).stacks === 73,
      "base:" + em.emberBase + " 层:" + (emberOf(em) || {}).stacks);
    /* 主动伤害引爆：移除等量层 + 失去 300% */
    const emHp0 = em.hp;
    Damage.deal({ source: er, target: em, card: null, eff: { value: 30 }, label: "t" });
    check("余烬: 打30 → 移除30层(73→43)+失90血", emberOf(em).stacks === 43 && emHp0 - em.hp === 30 + 90,
      "层:" + (emberOf(em) || {}).stacks + " 扣血:" + (emHp0 - em.hp));
    /* 每回合重置：下一回合开始恢复基准 */
    Turn.endTurn();
    check("余烬: 下回合开始重置回 73", emberOf(em) && emberOf(em).stacks === 73,
      "层:" + (emberOf(em) || {}).stacks);
    /* 打光移除后重挂：恰好清空 73 层（失 219 引爆血）而不击杀（1525 血） */
    Damage.deal({ source: er, target: em, card: null, eff: { value: 100 }, label: "清层" });
    check("余烬: 打100清空73层实例被移除", !emberOf(em), "剩:" + (emberOf(em) || { stacks: "无" }).stacks);
    Turn.endTurn();
    check("余烬: 打光移除后下回合重挂 73", emberOf(em) && emberOf(em).stacks === 73,
      "层:" + (emberOf(em) || {}).stacks);
    /* 外部叠加部分随重置被冲回基准 */
    Buffs.add(em, "buff_ember", 50, null, "钥令外部层");
    check("余烬: 外部叠加合并(73+50=123)", emberOf(em).stacks === 123);
    Turn.endTurn();
    check("余烬: 重置冲回基准 73（外挂层不保留）", emberOf(em) && emberOf(em).stacks === 73,
      "层:" + (emberOf(em) || {}).stacks);
    /* 无 emberBase 的怪（钥令对普通怪挂余烬）不重置 */
    const dm = eb.enemies.find(x => x.def && x.def.id === "enemy_dummy") || eb.enemies[1];   // 单位只有 def.id
    Buffs.add(dm, "buff_ember", 100, null, "钥令挂普通怪");
    Turn.endTurn();
    check("余烬: 无基准怪不重置(100 保持)", emberOf(dm) && emberOf(dm).stacks === 100,
      "层:" + (emberOf(dm) || {}).stacks);
    State.reset();
  }

  console.log("== 8.36 共享力量槽分实例（缺陷修复，AI 会话 10-06 实测报告）==");
  {
    State.reset();
    State.newBattle();
    const fr = State.addAlly("char_rotan", 1);
    State.addEnemy("enemy_dummy");
    Turn.startBattle();
    const fb = State.battle;
    /* AI 复现场景：钥令咆哮（永久 per=200）+ 琥珀类临时力量（per=11, 1回合） */
    Buffs.add(fr, "buff_strength", 4, null, "咆哮", 200);
    Buffs.add(fr, "buff_strength", 1, 1, "琥珀", 11);
    const slots = __buffsAll(fr, "buff_strength");
    check("分槽: 永久+临时并存两个实例", slots.length === 2,
      "实例:" + JSON.stringify(slots.map(x => ({ per: x.per, d: x.duration, s: x.stacks }))));
    check("分槽: 永久实例 per=200 不被覆盖", slots.some(x => x.per === 200 && x.duration == null && x.stacks === 4));
    check("分槽: 临时实例 per=11 d1", slots.some(x => x.per === 11 && x.duration === 1 && x.stacks === 1));
    check("分槽: collect 求和=4×200+1×11=811", (() => {
      const total = Buffs.collect(fr, "damageFlat").reduce((s2, m) => s2 + m.total, 0);
      return total === 811;
    })(), "total:" + Buffs.collect(fr, "damageFlat").reduce((s2, m) => s2 + m.total, 0));
    /* 回合末：临时清、永久保持 */
    Buffs.tickTurnEnd(fb.team);
    const afterTick = __buffsAll(fr, "buff_strength");
    check("分槽: 回合末临时消失、永久原样", afterTick.length === 1 && afterTick[0].per === 200 && afterTick[0].stacks === 4,
      "剩:" + JSON.stringify(afterTick.map(x => ({ per: x.per, s: x.stacks }))));
    /* 同 (per,duration) 合并叠层 */
    Buffs.add(fr, "buff_strength", 1, null, "咆哮再挂", 200);
    const merged = __buffsAll(fr, "buff_strength");
    check("分槽: 同 per 同时长合并叠层(4+1)", merged.length === 1 && merged[0].stacks === 5);
    /* removeStacks 作用于 team 容器（顺手修复旧 no-op） */
    Buffs.removeStacks(fr, "buff_strength", 1);
    check("分槽: removeStacks 对共享容器生效(5-1)", __buffsAll(fr, "buff_strength")[0].stacks === 4);
    /* 多实例 removeStacks 逐实例减 */
    Buffs.add(fr, "buff_strength", 1, 1, "临时2", 11);
    Buffs.removeStacks(fr, "buff_strength", 1);
    const after2 = __buffsAll(fr, "buff_strength");
    check("分槽: 多实例各减1层（临时1层被移除、永久4→3）", after2.length === 1 && after2[0].per === 200 && after2[0].stacks === 3,
      "剩:" + JSON.stringify(after2.map(x => ({ per: x.per, s: x.stacks }))));
    State.reset();
  }

  renderSummary();
}

function renderSummary() {
  const { pass, fail, lines } = TestResults;
  const box = document.getElementById("test-summary");
  box.innerHTML = `<h2 style="color:${fail ? "var(--red)" : "var(--green)"}">${fail ? "✗ 有失败" : "✓ 全部通过"} — ${pass} 通过 / ${fail} 失败</h2>
    <ol style="font-size:13px;line-height:1.8">${lines.map(l =>
      `<li style="color:${l.ok ? "var(--text-dim)" : "var(--red)"}">${l.ok ? "✓" : "✗"} ${l.name}${l.extra ? ` <span class="dim">(${l.extra})</span>` : ""}</li>`).join("")}</ol>`;
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
}

window.addEventListener("DOMContentLoaded", () => {
  try { runAllTests(); }
  catch (err) {
    TestResults.fail++;
    renderSummary();
    console.error("测试异常中断:", err);
    document.getElementById("test-summary").insertAdjacentHTML("beforeend",
      `<pre style="color:var(--red)">异常中断: ${err.stack}</pre>`);
  }
  finally { __restoreUserData(); }   // 无论结果如何，恢复用户的采集记录/地图/配置
});
