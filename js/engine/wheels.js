/* =========================================================
 * 引擎 · 命轮战斗效果结算（T8 第一期，2026-10-01）
 * ---------------------------------------------------------
 * 模型（E8 实测定案）：每个「伤害提高」类词条 = 独立乘算区，
 * 在 damage.js ②.5 位（强效区后、力量区前）逐词条乘算+取整。
 *   - base：基础伤害提高（全卡适用）——挣脱/陨日（E3 实测锚点）
 *   - strike：打击伤害提高（仅「打击」卡）——被缚（E8 实测锚点）
 *   - burst：狂气爆发基础伤害提高（仅爆发卡）——星天之兽
 * 数值口径：个人库实测满阶值（E3/E8 验证用同一口径）；gamekee 文本为未突破低阶值。
 *
 * 第一期覆盖（用户常用+乘区测试工具轮）：
 *   挣脱锁链之日 / 被缚的歌谣 / 于暴雨之中 / 陨日 / 星天之兽 /
 *   灵魂诞生 / 冬夜追忆 / 巨人之刃 / 神王的颂歌
 * 未建模（二期，见 DEFS 内 notes）：触发暴击类、治疗护盾增益、随机类、
 *   命轮加卡（萝坦+2打击）、触腕吃命轮乘区（E6 未测，保守不进）
 * ========================================================= */
"use strict";

const Wheels = {

  DEFS: {
    fw_chain_break:  { name: "挣脱锁链之日", baseCard: 40, note: "回合开始15%生成随机卡（消耗）未建模；措辞=「卡牌基础伤害提高」（E3 与陨日乘算）" },
    fw_bound_ballad: { name: "被缚的歌谣", strike: 30, onStrike: "draw1", extraCards: ["打击", "灵感"], note: "✅2026-10-01 用户确认：「+2张打击」系误读，实为洗入灵感+打击各1张（extraCards 已接）；✅与核心熔解同区加算实测 42" },
    fw_witch_hat:      { name: "魔女宽檐帽", firstCard: 60, note: "✅首卡归区实测（2026-10-01）：R1/R2=101/63=×1.603 独立乘算（每回合第一张指令卡）；进超维空间获8狂气 未建模" },
    fw_hunger_bones:   { name: "不灭的饥骨", strikeCritDmg: 50, note: "✅打击暴伤实测：170/138=×1.2326≈2.65/2.15 加到爆伤基础值（SR 轮，无需叠12）" },
    fw_meteor_fall:    { name: "天之陨", strikeCritDmg: 75, note: "✅实测 186/138=×1.349≈2.90/2.15；双装 218=×1.581≈3.40/2.15 同区加算钉死；回合末叠层未建模" },
    fw_in_rainstorm: { name: "于暴雨之中", onStrike: "energy1_poison10", bonusTentacle: true, note: "深海时回合末触腕攻击+1（经 Tentacle 生效）" },
    fw_meteoric_day: { name: "陨日", basePlain: 20, note: "中毒/反击+20%/暴率暴伤+20% 未建模（无中毒反击来源）；措辞=「基础伤害提高」" },
    fw_star_beast:   { name: "星天之兽", strike: 50, burstStar: 50, onStrike: "crit5x3", note: "✅与被缚同区加算实测（被缚+星天=100/基线56=×1.786）；打击卡走 strike 组、爆发卡走 burstStar 组（随 burst 区乘算）" },
    fw_soul_birth:   { name: "灵魂诞生", teamHpPct: 10, healPct: 10, onStrike: "heal6lost", note: "治疗+10% 经 Damage.heal 生效（二期）；护盾+10% 未接入（护盾无统一结算入口）" },
    fw_winter_night: { name: "冬夜追忆", onBattleStart: "vuln2front", note: "易伤敌人每回合失12%攻力量 未建模" },
    fw_giant_blade:  { name: "巨人之刃", onBurst: "critDmg60_handDisc", note: "爆伤+60% + 装备者手牌逐张35%本回合算力-1（roll）；gamekee 版为爆伤+30%（用户实测满阶=60%）" },
    fw_god_king_hymn:{ name: "神王的颂歌", onBattleStart: "guku40", onBurstOthers: "guku6", note: "深海触腕伤害 未建模" },
    fw_amber_death:  { name: "琥珀色的死亡", basePlain: 30, onAnyPlay: "str11", note: "★乘区值实测校准（2026-10-01）：单装 72/56=×1.286、+陨日 ×1.4937 双点吻合 30%（个人库原记 20% 偏低）；力量获取+6% 未建模" },
    fw_core_melt:    { name: "核心熔解", strike: 25, onStrike: "str15", note: "防御护盾+25% 未接入（护盾无统一入口）；✅与被缚同区加算实测 42" },
    fw_freedom_unbearable: { name: "不可承受的自由", basePlain: 15, note: "护盾+15%/手牌上限+2/超维回合80狂气 未建模（乘区已实装）" },
    fw_slaughter_world: { name: "狂戮至世界尽头", burst: 60, onStrike: "slaughter56", note: "爆发60% 归 burst 组（按隐没先例）；打出任意打击后+56点/层临时打击伤害（2026-10-01 实测修正：点数非百分比，经 buff_strike_tmp ③.5 加算）；追击基础伤害+60% 未建模（等追击角色）" },
    fw_hidden_pain: { name: "隐没的痛楚", burst: 50, note: "✅爆发归区实测：单装 ×1.5004 精确、+陨日 ×1.802=1.5×1.2 乘算（加算排除）——「爆发基础伤害」独立乘算区；银钥充能+30%/超维狂气 未建模" },
    /* ---------- 三期（2026-10-01 批量结构化，数值=个人库口径）---------- */
    fw_tough_will:     { name: "坚韧意志", basePlain: 15, extraCards: ["打击", "防御"], note: "✅命轮加卡首例（探索开始将打击和防御加入牌库，经 buildPiles extraCards）" },
    fw_gaze_forgotten: { name: "遗忘之手", strike: 40, extraCards: ["打击"], note: "「打击伤害提高」同组加算（与被缚/核心熔解）；探索开始加打击" },
    fw_no_place:       { name: "不存在之地", blockPct: 15, extraCards: ["防御"], note: "探索开始加防御；护盾+15%（gamekee 权威，此前 40 为笔误）经 Damage.addShield" },
    fw_snow_melt:      { name: "待到雪山消融", basePlain: 15, note: "战斗开始获25层冰雪 未建模" },
    fw_delicacy:       { name: "珍馐", basePlain: 15, note: "血肉猩红熔炉积攒 未建模" },
    fw_rest_kiss:      { name: "安息之吻", basePlain: 10, note: "击杀后本次探索暴击率+2%/爆发基础伤害+2% 未建模" },
    fw_gaunt_body:     { name: "崎体回噬", burst: 60, note: "学者人格切换 未建模" },
    fw_lord_cane:      { name: "勋爵手杖", burst: 30, healPct: 15, note: "「护盾和生命回复提高15%」heal 半边已接（三期）；护盾半边待统一入口铺开" },
    fw_info_life:      { name: "信息就是生命", cmdBase: 30, healPct: 15, note: "✅E8 主角轮：「指令卡基础伤害提高」独立组（与被缚 30×30 乘算实测 118→153）；heal 半边已接" },
    fw_dark_slumber:   { name: "黑暗中的安眠", burstFinal: 0.2, blockPct: 20, note: "爆发最终伤害 20%（E4 独立区，三期接入，小数语义与 finalBoostPct buff 一致）；手牌上限/银钥充能 未建模" },
    fw_blue_ring:      { name: "蓝环毒素", burstFinal: 0.08, blockPct: 8, note: "爆发最终伤害/护盾+8%（三期接入）；银钥充能 未建模" },
    fw_godword_tablet: { name: "神言石板", healPct: 11, note: "奇偶回合末暴击/爆伤+4% 未建模；护盾+11% 待统一入口铺开" },    fw_helm_sail:      { name: "引舵之帆", healPct: 10, note: "爆发后下回合开始回复10%已损失生命 未建模" },
    fw_gluttony_fable: { name: "饕餮寓言", healPct: 13, note: "回合开始获上回合损失生命13%力量护盾 未建模" },
    fw_ocean_call:     { name: "深海的呼唤", onBattleStart: "str8", note: "深海另+8%触腕伤害 未建模" },
    fw_duty_call:      { name: "职责所在", onBurstOthers: "guku5all", note: "「所有友方」按全员含爆发者实现" },
    fw_friend_reunion: { name: "致挚友", onBurst: "crit25all", note: "爆发后全体友方本回合暴击率+25%" },
    fw_hot_farewell:   { name: "灼热的吻别", onBurst: "str3", note: "爆发后获攻击力3%的力量" },
    fw_heart_bulwark:  { name: "心之壁垒", onBurst: "block25def", note: "爆发后获防御力25%护盾（走 Damage.addShield）" },
    fw_dream_ocean:    { name: "海之梦", onAnyPlay: "guku1", onBattleStart: "str9", note: "深海额外触腕伤害 未建模" },
    fw_flower_poem:    { name: "往昔的花与诗", onBattleStart: "draw1disc1", note: "战斗开始抽1张且该卡本回合算力-1（实测 100% 触发）" },
    fw_silent_feast:   { name: "无声欢宴", onBurst: "heal20con", note: "「每剩余1算力额外回复」的增量未采集，暂只做体质20%" },
    fw_void_doll:      { name: "坠入虚无的人偶", onBurst: "guku20ofcost", note: "狂气/中毒/生命回复+10% 未建模" },
    fw_flesh_feast:    { name: "血肉狂宴", onBurst: "str6con", note: "爆发暴击爆伤+15% 未建模" },
    fw_holy_fire:      { name: "圣火中的指引", onBurst: "critdmg11tentacle", note: "爆发护盾+15% 未接入；每触腕+1% 已并算" },
    /* ---------- 四期（2026-10-01，回合末/钥令钩子+onAnyPlay 扩展）---------- */
    fw_poem_tail:      { name: "诗笺的句尾", healPct: 11, note: "暴击爆伤/护盾/狂气/力量+11% 与超维湮灭 未建模（heal 半边已接）" },
    fw_spinner:        { name: "宿命纺轮", blockPct: 10, note: "追击时+15%临时强效 未建模（等追击角色）" },
    fw_tide_back:      { name: "溯洄时计", onAnyPlay: "recycle60x1", note: "60% 概率从弃牌堆重回手牌（每回合1次）" },
    fw_reunion:        { name: "聚首时刻", onAnyPlay: "silver50x3", note: "" },
    fw_polar_night:    { name: "极夜与破晓", onTurnEnd: "silver200", note: "触发死亡抵抗获1000银钥/应急灵知体 未建模" },
    fw_akut_spring:    { name: "阿库特之春", onTurnEnd: "guku15silver", note: "" },
    fw_mercy_nurse:    { name: "慈悲的哺育", onTurnEnd: "silver3charge", onYogen: "guku6all", note: "手牌上限+2 未建模" },
    fw_endless_play:   { name: "永不停歇的演奏", onTurnEnd: "guku5", note: "爆发后下一张卡四维提高20% 未建模" },
    fw_partner_train:  { name: "搭档特训", onYogen: "crit35self", note: "" },
    fw_lamp_reason:    { name: "理智明灯", onYogen: "drawStrike1st", note: "每回合首次钥令后抽1张打击" },
    fw_focus_spirit:   { name: "专注精神", onYogen: "guku15", note: "" },
    fw_curse_bind:     { name: "苦咒缚", onStrike: "poison15atk", note: "中毒提高12% 未建模（无中毒增益管线）" },
    fw_cut_damage:     { name: "切割与伤害", onStrike: "strdown12atk", note: "" },
    fw_adventure_pack: { name: "冒险的行囊", onDefend: "str18atk", note: "" },
    fw_nearing_sun:    { name: "迫近的太阳", basePlain: 15, onAnyPlay: "sun5crit", note: "打出5张卡后获20%临时暴击率（四期实装）" }
  },

  equipped(ally) {
    return (ally && ally.fatewheels || []).map(id => this.DEFS[id]).filter(Boolean);
  },

  /* 乘区汇总（2026-10-01 用户实测改模型：**同措辞组内加算、组间乘算**——
   * 被缚30%+核心熔解25% 打击=42=ceil(27×1.55) 加算钉死；E3 挣脱×陨日=乘算（措辞不同）。
   * 分组按词条措辞：
   *   baseCard  「卡牌基础伤害提高」挣脱40（E3 独立于组2）
   *   basePlain 「基础伤害提高」陨日20/琥珀20/不可承受15（组内叠法未测，按加算先例推定）
   *   strike    「打击伤害提高」被缚30/核心熔解25（✅实测组内加算）
   *   starBeast 「打击和狂气爆发基础伤害提高」星天50（独立组，限打击/爆发卡，待组合验证）
   *   burst     「狂气爆发基础伤害提高」崎体/狂戮/隐没（归区未测，暂独立组） */
  combatMods(ally) {
    const g = {
      baseCard: { names: [], pct: 0 },
      basePlain: { names: [], pct: 0 },
      cmdBase: { names: [], pct: 0 },     // 「指令卡基础伤害提高」信息就是生命30（E8：与 strike 乘算）
      strike: { names: [], pct: 0 },
      firstCard: { names: [], pct: 0 },   // 「每回合第一张指令卡伤害提高」魔女宽檐帽60（实测 ×1.603 独立乘算）
      burstStar: { names: [], pct: 0 },
      burst: { names: [], pct: 0 }
    };
    let healPct = 0, blockPct = 0, burstFinal = 0, strikeCritDmg = 0;
    for (const d of this.equipped(ally)) {
      for (const zone of ["baseCard", "basePlain", "cmdBase", "strike", "firstCard", "burstStar", "burst"]) {
        if (d[zone]) { g[zone].names.push(d.name); g[zone].pct += d[zone]; }
      }
      healPct += d.healPct || 0;
      blockPct += d.blockPct || 0;        // 护盾提高（三期，Damage.addShield 统一入口）
      burstFinal += d.burstFinal || 0;    // 爆发最终伤害（三期，E4 独立区，仅爆发卡）
      strikeCritDmg += d.strikeCritDmg || 0; // 打击暴伤（四期实测：加到爆伤基础值，仅打击卡暴击）
    }
    return { groups: g, healPct, blockPct, burstFinal, strikeCritDmg };
  },

  /* 命轮加卡（三期，坚韧意志/不存在之地/遗忘之手先例）：开战时置入牌堆的额外卡名 */
  extraCards(ally) {
    const out = [];
    for (const d of this.equipped(ally)) for (const nm of (d.extraCards || [])) out.push(nm);
    return out;
  },

  /* 每回合触发计数（四期：溯洄时计/迫近的太阳/理智明灯等「每回合N次」；
   * b.wheelTurn 不进回合快照——回溯到本回合开始时计数自然归零重记，语义正确 */
  turnCount(key, max = null) {
    const b = State.battle;
    if (!b) return { n: 0, full: false };
    b.wheelTurn = b.wheelTurn || {};
    let rec = b.wheelTurn[key];
    if (!rec || rec.turn !== b.turn) { rec = b.wheelTurn[key] = { turn: b.turn, n: 0 }; }
    return { n: rec.n, full: max != null && rec.n >= max };
  },
  bumpCount(key) {
    const b = State.battle;
    if (!b) return;
    b.wheelTurn = b.wheelTurn || {};
    const rec = b.wheelTurn[key];
    if (rec) rec.n += 1;
  },

  /* 队伍生命上限加成%（灵魂诞生，E6 第七批实测锚点 1933→2127） */
  teamHpPct() {
    const b = State.battle;
    if (!b) return 0;
    let pct = 0;
    for (const a of b.allies) for (const d of this.equipped(a)) pct += d.teamHpPct || 0;
    return pct;
  },

  /* 于暴雨之中：深海队回合末触腕攻击 +1 条（装备者在场且深海界域） */
  bonusTentacleStrikes() {
    const b = State.battle;
    if (!b || !b.tentacle) return 0;
    let n = 0;
    for (const a of b.allies) {
      if ((a.def.realm || "").includes("深海") && this.equipped(a).some(d => d.bonusTentacle)) n += 1;
    }
    return n > 0 ? 1 : 0;   // 队伍唯一语义：多装备不叠加
  },

  /* ---------- 战斗开始（turn.js startBattle 调用）---------- */
  onBattleStart() {
    const b = State.battle;
    if (!b) return;
    for (const a of b.allies) {
      for (const d of this.equipped(a)) {
        if (d.onBattleStart === "vuln2front") {
          const front = b.enemies.find(e => e.hp > 0);
          if (front) {
            Buffs.add(front, "debuff_vul", 2, null, `命轮·${d.name}`);
            Log.add(`💫 命轮「${d.name}」：对前排 ${front.def.name} 施加 2 层易伤`, "good");
          }
        } else if (d.onBattleStart === "guku40") {
          a.guku = Math.min(a.gukuMax || 100, a.guku + 40);
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 战斗开始获得 40 狂气（${a.guku}/${a.gukuMax}）`, "good");
        } else if (d.onBattleStart === "str8" || d.onBattleStart === "str9") {
          const pct = d.onBattleStart === "str8" ? 0.08 : 0.09;
          const sv = Math.ceil((a.attack || 0) * pct);
          if (sv > 0) {
            Buffs.add(a, "buff_strength", 1, null, `命轮·${d.name}`, sv);
            Log.add(`💫 命轮「${d.name}」：${a.def.name} 战斗开始获得攻击力${Math.round(pct * 100)}%力量 +${sv}`, "good");
          }
        } else if (d.onBattleStart === "draw1disc1") {
          if (b.piles.draw.length || b.piles.discard.length) {
            Cards.draw(1);
            const drawn = b.piles.hand[b.piles.hand.length - 1];
            if (drawn) { drawn.disc = (drawn.disc || 0) + 1; Log.add(`💫 命轮「${d.name}」：抽到的「${Cards.def(drawn).name}」本回合算力 -1`, "good"); }
          }
        }
      }
    }
  },

  /* ---------- 打出打击卡后（cards.js play 调用，仅打击卡）---------- */
  onStrikePlay(card, owner) {
    const b = State.battle;
    if (!b || !owner || !card) return;
    const isStrike = Cards.isStrikeCard(card);   // T38 C：视为「打击」卡同触发打击命轮
    const isDefend = /^(基础)?防御$/.test(card.name || "");
    if (!isStrike && !isDefend) return;   // 四期：放行打击+防御（苦咒缚/切割/行囊）
    for (const d of this.equipped(owner)) {
      if (d.onStrike === "draw1") {
        Cards.draw(1);
        Log.add(`💫 命轮「${d.name}」：打出打击后抽 1 张牌`, "good");
      } else if (d.onStrike === "energy1_poison10") {
        b.energy = Math.min(10, b.energy + 1);
        const per = Math.ceil((owner.attack || 0) * 0.1);
        for (const t of b.enemies.filter(x => x.hp > 0)) Buffs.add(t, "debuff_poison", 1, null, `命轮·${d.name}`, per);
        Log.add(`💫 命轮「${d.name}」：获得 1 算力（当前 ${b.energy}），全体敌人施加 ${per} 点中毒`, "good");
      } else if (d.onStrike === "heal6lost") {
        const lost = b.team.maxHp - b.team.hp;
        if (lost > 0) Damage.heal(owner, Math.ceil(lost * 0.06), `命轮·${d.name}（6%已损）`);
      } else if (d.onStrike === "str15") {
        const sv = Math.ceil((owner.attack || 0) * 0.15);
        if (sv > 0) {
          Buffs.add(owner, "buff_strength", 1, 1, `命轮·${d.name}`, sv);
          Log.add(`💫 命轮「${d.name}」：${owner.def.name} 获得攻击力15%临时力量 +${sv}（回合末消失）`, "good");
        }
      } else if (d.onStrike === "slaughter56") {
        /* 狂戮至世界尽头：打出任意打击后 +56 点打击伤害/层（2026-10-01 实测修正：112 为点数非百分比；回合末随 buff 消失） */
        Buffs.add(owner, "buff_strike_tmp", 1, 1, `命轮·${d.name}`, 56);
        const lay = owner.buffs.find(x => x.defId === "buff_strike_tmp");
        Log.add(`💫 命轮「${d.name}」：${owner.def.name} 打击伤害临时 +56 点（现 ${lay ? lay.stacks : 1} 层）`, "good");
      } else if (isStrike && d.onStrike === "poison15atk") {
        /* 苦咒缚（四期）：打击对目标施加攻击力15%中毒 */
        const tgt = b.enemies.find(x => x.hp > 0);
        const per = Math.ceil((owner.attack || 0) * 0.15);
        if (tgt && per > 0) {
          Buffs.add(tgt, "debuff_poison", 1, null, `命轮·${d.name}`, per);
          Log.add(`💫 命轮「${d.name}」：${tgt.def.name} 中毒 +${per}`, "good");
        }
      } else if (isStrike && d.onStrike === "strdown12atk") {
        /* 切割与伤害（四期）：打击使目标失去攻击力12%临时力量 */
        const tgt = b.enemies.find(x => x.hp > 0);
        const sv = Math.ceil((owner.attack || 0) * 0.12);
        if (tgt && sv > 0) {
          Buffs.add(tgt, "debuff_strength_down", 1, 1, `命轮·${d.name}`, -sv);
          Log.add(`💫 命轮「${d.name}」：${tgt.def.name} 力量降低 ${sv}`, "good");
        }
      } else if (isDefend && d.onDefend === "str18atk") {
        /* 冒险的行囊（四期）：打出防御后获攻击力18%临时力量 */
        const sv = Math.ceil((owner.attack || 0) * 0.18);
        if (sv > 0) {
          Buffs.add(owner, "buff_strength", 1, 1, `命轮·${d.name}`, sv);
          Log.add(`💫 命轮「${d.name}」：${owner.def.name} 获得攻击力18%临时力量 +${sv}（回合末消失）`, "good");
        }
      } else if (d.onStrike === "crit5x3") {
        /* 星天之兽：打出打击后获 5% 临时暴击率（每回合3次），满3次获 15% 临时暴伤（二期）
         * buff 实例不存 note（同 defId 合并 stacks，collect=per×stacks）——判重按 defId+per */
        Buffs.add(owner, "buff_crit_up", 1, 1, `命轮·${d.name}`, 5);
        const critInst = owner.buffs.find(x => x.defId === "buff_crit_up" && x.per === 5);
        const cnt = critInst ? critInst.stacks : 0;
        let extra = "";
        if (cnt >= 3 && !owner.buffs.some(x => x.defId === "buff_critdmg_up" && x.per === 15)) {
          Buffs.add(owner, "buff_critdmg_up", 1, 1, `命轮·${d.name}（满3层）`, 15);
          extra = `，满 3 层获 15% 临时暴伤`;
        }
        Log.add(`💫 命轮「${d.name}」：${owner.def.name} 获 5% 临时暴击率（本回合第 ${cnt} 次）${extra}`, "good");
      }
    }
  },

  /* ---------- 打出任意指令卡后（cards.js play 调用，二期）---------- */
  onAnyPlay(card, owner) {
    const b = State.battle;
    if (!b || !owner || !card || card.type === "狂气爆发") return;
    for (const d of this.equipped(owner)) {
      if (d.onAnyPlay === "str11") {
        const sv = Math.ceil((owner.attack || 0) * 0.11);
        if (sv > 0) {
          Buffs.add(owner, "buff_strength", 1, 1, `命轮·${d.name}`, sv);
          Log.add(`💫 命轮「${d.name}」：${owner.def.name} 获得攻击力11%临时力量 +${sv}（回合末消失）`, "good");
        }
      } else if (d.onAnyPlay === "guku1") {
        owner.guku = Math.min(owner.gukuMax || 100, owner.guku + 1);
        Log.add(`💫 命轮「${d.name}」：${owner.def.name} 获 1 狂气（${owner.guku}/${owner.gukuMax}）`, "good");
      } else if (d.onAnyPlay === "recycle60x1") {
        /* 溯洄时计：60% 概率从弃牌堆重回手牌（每回合1次，四期） */
        const key = "tide_" + d.name;
        if (!this.turnCount(key, 1).full && b.piles.discard.length && b.piles.hand.length < Cards.HAND_LIMIT
            && Math.random() * 100 < 60) {
          this.bumpCount(key);
          const [c] = b.piles.discard.splice(b.piles.discard.length - 1, 1);
          b.piles.hand.push(c);
          Log.add(`💫 命轮「${d.name}」：弃牌堆顶的「${Cards.def(c).name}」重回手牌`, "good");
        }
      } else if (d.onAnyPlay === "sun5crit") {
        /* 迫近的太阳：打出5张卡后获 20% 临时暴击率（四期） */
        const key = "sun_" + d.name;
        const cnt = this.turnCount(key).n + 1;
        this.bumpCount(key);
        if (cnt === 5) {
          Buffs.add(owner, "buff_crit_up", 1, 1, `命轮·${d.name}`, 20);
          Log.add(`💫 命轮「${d.name}」：本回合已打出 5 张卡，${owner.def.name} 获 20% 临时暴击率`, "good");
        }
      } else if (d.onAnyPlay === "silver50x3") {
        /* 聚首时刻：每打出1张卡获50银钥（每回合3次，四期） */
        const key = "reunion_" + d.name;
        if (!this.turnCount(key, 3).full) {
          this.bumpCount(key);
          b.silver += 50;
          Log.add(`💫 命轮「${d.name}」：获得 50 银钥（当前 ${b.silver}，本回合第 ${this.turnCount(key).n} 次）`, "good");
        }
      }
    }
  },

  /* ---------- 狂气爆发后（cards.js releaseBurst 调用，pre=本次消耗的狂气）---------- */
  onBurst(burstAlly, pre) {
    const b = State.battle;
    if (!b) return;
    const tentacles = b.tentacle ? b.tentacle.count : 0;
    for (const a of b.allies) {
      for (const d of this.equipped(a)) {
        if (d.onBurst === "critDmg60_handDisc" && a === burstAlly) {
          Buffs.add(a, "buff_critdmg_up", 1, 1, `命轮·${d.name}`, 60);
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 本回合暴击伤害 +60%`, "good");
          /* 手牌逐张 35% 本回合算力消耗 -1（装备者的卡，二期；roll 不可测，断言走手动 disc） */
          let hit = 0;
          for (const c of b.piles.hand) {
            if (Cards.def(c) && Cards.def(c).owner === a.def.id && Math.random() * 100 < 35) {
              c.disc = (c.disc || 0) + 1;
              hit += 1;
            }
          }
          if (hit > 0) Log.add(`💫 命轮「${d.name}」：${hit} 张手牌本回合算力消耗 -1`, "good");
        } else if (d.onBurst === "crit25all") {
          for (const f of b.allies) Buffs.add(f, "buff_crit_up", 1, 1, `命轮·${d.name}`, 25);
          Log.add(`💫 命轮「${d.name}」：全体友方本回合暴击率 +25%`, "good");
        } else if (d.onBurst === "str3" && a === burstAlly) {
          const sv = Math.ceil((a.attack || 0) * 0.03);
          if (sv > 0) { Buffs.add(a, "buff_strength", 1, null, `命轮·${d.name}`, sv); Log.add(`💫 命轮「${d.name}」：${a.def.name} 获得攻击力3%力量 +${sv}`, "good"); }
        } else if (d.onBurst === "str6con" && a === burstAlly) {
          const sv = Math.ceil((a.stats && a.stats.constitution || 0) * 0.06);
          if (sv > 0) { Buffs.add(a, "buff_strength", 1, null, `命轮·${d.name}`, sv); Log.add(`💫 命轮「${d.name}」：${a.def.name} 获得体质6%力量 +${sv}`, "good"); }
        } else if (d.onBurst === "heal20con" && a === burstAlly) {
          const hv = Math.ceil((a.stats && a.stats.constitution || 0) * 0.2);
          if (hv > 0) Damage.heal(a, hv, `命轮·${d.name}（体质20%）`);
        } else if (d.onBurst === "guku20ofcost" && a === burstAlly) {
          const gv = Math.ceil((pre || 0) * 0.2);
          if (gv > 0) { a.guku = Math.min(a.gukuMax || 100, a.guku + gv); Log.add(`💫 命轮「${d.name}」：${a.def.name} 获本次狂气消耗20%的狂气 +${gv}`, "good"); }
        } else if (d.onBurst === "block25def" && a === burstAlly) {
          const sv = Math.ceil((a.defense || 0) * 0.25);
          if (sv > 0 && typeof Damage !== "undefined") {
            const real = Damage.addShield(a, sv, `命轮·${d.name}`);
            Log.add(`💫 命轮「${d.name}」：${a.def.name} 获得防御力25%护盾 +${real}`, "good");
          }
        } else if (d.onBurst === "critdmg11tentacle") {
          const pct = 11 + tentacles;
          for (const f of b.allies) Buffs.add(f, "buff_critdmg_up", 1, 1, `命轮·${d.name}`, pct);
          Log.add(`💫 命轮「${d.name}」：全体友方临时暴伤 +${pct}%（11%+触腕${tentacles}）`, "good");
        } else if (d.onBurstOthers === "guku6" && a !== burstAlly) {
          a.guku = Math.min(a.gukuMax || 100, a.guku + 6);
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 因队友爆发获得 6 狂气（${a.guku}/${a.gukuMax}）`, "good");
        } else if (d.onBurstOthers === "guku5all") {
          a.guku = Math.min(a.gukuMax || 100, a.guku + 5);
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 因爆发获得 5 狂气（${a.guku}/${a.gukuMax}）`, "good");
        }
      }
    }
  },

  /* ---------- 回合结束（turn.js endTurn 调用，四期）---------- */
  onTurnEnd() {
    const b = State.battle;
    if (!b) return;
    for (const a of b.allies) {
      for (const d of this.equipped(a)) {
        if (d.onTurnEnd === "silver200") {
          b.silver += 200;
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 回合结束获得 200 银钥（当前 ${b.silver}）`, "good");
        } else if (d.onTurnEnd === "guku15silver") {
          a.guku = Math.min(a.gukuMax || 100, a.guku + 15);
          const sv = Math.ceil((a.stats && a.stats.silverKeyCharge) || 0);
          b.silver += sv;
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 获 15 狂气（${a.guku}/${a.gukuMax}）+ 银钥充能值的银钥 +${sv}（当前 ${b.silver}）`, "good");
        } else if (d.onTurnEnd === "silver3charge") {
          const sv = Math.ceil((a.stats && a.stats.silverKeyCharge) || 0) * 3;
          b.silver += sv;
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 获 300% 银钥充能的银钥 +${sv}（当前 ${b.silver}）`, "good");
        } else if (d.onTurnEnd === "guku5") {
          a.guku = Math.min(a.gukuMax || 100, a.guku + 5);
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 回合结束获 5 狂气（${a.guku}/${a.gukuMax}）`, "good");
        }
      }
    }
  },

  /* ---------- 钥令释放后（yogen.js cast 成功调用，四期；钥令为队伍级，装备者按各自轮生效）---------- */
  onYogenCast(yogenId) {
    const b = State.battle;
    if (!b) return;
    for (const a of b.allies) {
      for (const d of this.equipped(a)) {
        if (d.onYogen === "guku15") {
          a.guku = Math.min(a.gukuMax || 100, a.guku + 15);
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 钥令后获 15 狂气（${a.guku}/${a.gukuMax}）`, "good");
        } else if (d.onYogen === "guku6all") {
          for (const f of b.allies) f.guku = Math.min(f.gukuMax || 100, f.guku + 6);
          Log.add(`💫 命轮「${d.name}」：全体友方获 6 狂气`, "good");
        } else if (d.onYogen === "crit35self") {
          Buffs.add(a, "buff_crit_up", 1, 1, `命轮·${d.name}`, 35);
          Log.add(`💫 命轮「${d.name}」：${a.def.name} 暴击率临时 +35%（回合末消失）`, "good");
        } else if (d.onYogen === "drawStrike1st") {
          /* 理智明灯：每回合首次钥令后 100% 抽 1 张打击 */
          const key = "lamp_" + a.uid;
          if (!this.turnCount(key, 1).full) {
            this.bumpCount(key);
            const strike = DBF.cards.find(c => c.owner === a.def.id && /^(基础)?打击$/.test(c.name || ""));
            if (strike && b.piles.hand.length < Cards.HAND_LIMIT) {
              b.piles.hand.push(Cards.inst(strike.id, false));
              Log.add(`💫 命轮「${d.name}」：抽到 ${a.def.name} 的「${strike.name}」置入手牌`, "good");
            }
          }
        }
      }
    }
  }

};
