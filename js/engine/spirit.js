/* =========================================================
 * 引擎 · 灵塑适性专属效果（T41，2026-10-03 夜间批）
 * ---------------------------------------------------------
 * 数据源：data/wiki.js characters[name].spiritAdapt.levels（1~10 级文本）。
 * 通用部分（三维 +3%/级）在 state.js collectStatMods；本模块只结算「专属逐级表」。
 * 规格表数组 = L1~L10 逐级文本手工提取；ally.spiritAdaptLv = 当前灵塑等级（0=未投入无效果）。
 *
 * E6 实测口径：成员「触腕伤害提高X%」词条**不进回合末自动触腕**——本模块把该词条
 *   实现为「仅该成员触发的触腕攻击」（怒涛追击把来源单位传入 strike；自动触腕 src=null 不吃）。
 *
 * 已实现族：
 *   开战获得力量/戒备（艾瑞卡，点数=ceil(面板×X%)）；开战银钥能量（环行·拉蒙娜，银充×X%）；
 *   基础伤害提高→②.5 basePlain 组同组加算（戈利亚/「24」/萝坦/熔毁·朵尔[团队]）；
 *   打击基础伤害提高→②.5 strike 组（茉夏，团队）；缚身锁链基础伤害+力量点数×X%（血链·希洛，③区附加）；
 *   打击最终伤害提高→⑥.5（莉莉，首领战翻倍）；力量获取效果提高→正力量层数×(1+X%)
 *     （杜勒赛因[团队]/雷娅[自身]，cards.js 力量结点消费）；
 *   触腕伤害提高（希莱斯特/弥利亚姆）→成员触发的触腕攻击 ×(1+X%)。
 *
 * 未实现（登记 docs/DATA-TODO.md 灵塑行）：利莫里亚条件族（戈利亚/弥利亚姆/墨菲/图鲁/法洛思/
 *   庞托斯的队友数条件分支）、阵营克制（主宰/雕塑家协会/雪原/提灯教会/欢愉眷属/亡灵/野兽…）、
 *   中毒/反击提高（宁菲亚/熔毁·朵尔——反击未建模+中毒跳数无来源归属）、卡牌衍生/洗牌/置入族
 *   （莱克/凯蒂古拉/波吕克斯/沙耶/莉兹/卡茜亚/哈姆林/汀克特/皮克曼/温柯尔/阿格里帕/奥瑞塔/泰旖丝/索蕾尔/莫丝/菲茵特/雷娅打卡获力/阿拉克涅/旺达/奥尔拉/尤乌哈希前10张/詹金攻90%语义待定）、
 *   探索层（萨尔瓦多感应/达芙黛尔遗迹折扣）、朵尔狂气治疗、珊盾转触伤（需护盾钩子，随建模补）。
 * ========================================================= */
"use strict";

const Spirit = {

  /* ---- 规格表：数组=L1~L10（wiki 逐级提取） ---- */
  SPECS: {
    "艾瑞卡": {
      battleStart: {
        strPctAtk: [5, 6, 7, 8, 9, 10, 11, 12, 13, 15],
        guardPctDef: [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 3]
      }
    },
    "戈利亚": { basePlain: [20, 23, 26, 29, 32, 35, 38, 41, 44, 50] },
    "「24」": { basePlain: [20, 23, 26, 29, 32, 35, 38, 41, 44, 50] },
    "萝坦": { basePlain: [50, 55, 60, 65, 70, 75, 80, 85, 90, 100] },   // 滚动增伤（每造成1次伤害+5%至多50%）未实现，登记
    "血链·希洛": { cardStrFlat: { card: "缚身锁链", pct: [20, 28, 36, 44, 52, 60, 68, 76, 84, 100] } },
    "茉夏": { strikeTeam: [15, 17, 19, 21, 23, 25, 27, 29, 31, 35] },
    "莉莉": { strikeFinal: [15, 17, 19, 21, 23, 25, 27, 29, 31, 35] },
    "环行·拉蒙娜": { battleStartSilverPct: [50, 70, 90, 110, 130, 150, 170, 190, 210, 250] },   // 银充等级+15% 的面板部分未实现（state 层），登记
    "杜勒赛因": { strGainTeam: [5, 6, 7, 8, 9, 10, 11, 12, 13, 15] },
    "雷娅": { strGainSelf: [5, 6, 7, 8, 9, 10, 11, 12, 13, 15] },   // 打卡获力（损生命加成/每回合3次）未实现，登记
    "希莱斯特": { tentacleSrc: [20, 23, 26, 29, 32, 35, 38, 41, 44, 50] },
    "弥利亚姆": { tentacleSrc: [10, 11, 12, 13, 14, 15, 16, 17, 18, 20] },
    "熔毁·朵尔": { teamBasePlain: [5, 6, 7, 8, 9, 10, 11, 12, 13, 15] },   // 中毒/反击部分未实现（反击未建模），登记
  },

  lv(unit) { return (unit && unit.spiritAdaptLv) || 0; },

  /* 逐级取值：lv 钳到表长；lv=0 → 0 */
  _v(arr, l) { return l > 0 ? (arr[Math.min(l, arr.length) - 1] || 0) : 0; },

  /* ---- ②.5 命轮乘区并入：同措辞组内加算（damage.js 在 Wheels 组装后调用） ----
   * basePlain=「基础伤害提高」（自身/团队）；strikeTeam=「打击基础伤害提高」（团队，仅打击卡）；
   * cardBasePlain=卡名绑定的基础伤害提高（血链·希洛缚身锁链） */
  mergeCombat(source, card, groups) {
    const b = State.battle;
    if (!b || !b.allies || !groups) return;
    const name = (card && card.name) || "";
    const isStrike = /^(基础)?打击$/.test(name);
    for (const a of b.allies) {
      const sp = a.def && this.SPECS[a.def.name];
      const l = this.lv(a);
      if (!sp || l <= 0) continue;
      if (sp.basePlain && a === source) groups.basePlain.pct += this._v(sp.basePlain, l);
      if (sp.teamBasePlain) groups.basePlain.pct += this._v(sp.teamBasePlain, l);
      if (sp.strikeTeam && isStrike) groups.strike.pct += this._v(sp.strikeTeam, l);
      if (sp.cardBasePlain && a === source && sp.cardBasePlain.card === name) groups.basePlain.pct += this._v(sp.cardBasePlain.pct, l);
    }
  },

  /* ---- ⑥.5 最终伤害区追加（莉莉：「打击」最终伤害提高，首领战翻倍） ---- */
  finalAdd(source, card, target) {
    if (!source || !card) return 0;
    const sp = source.def && this.SPECS[source.def.name];
    const l = this.lv(source);
    if (!sp || !sp.strikeFinal || l <= 0) return 0;
    if (!/^(基础)?打击$/.test(card.name || "")) return 0;
    let v = this._v(sp.strikeFinal, l);
    if (target && target.def && target.def.tier === "boss") v *= 2;
    return v;
  },

  /* ---- ③ 力量区附加（血链·希洛：缚身锁链额外享受 X% 力量点数加成） ---- */
  strFlatBonus(source, card, strFlat) {
    if (!source || !card || !(strFlat > 0)) return 0;
    const sp = source.def && this.SPECS[source.def.name];
    const l = this.lv(source);
    if (!sp || !sp.cardStrFlat || l <= 0) return 0;
    if (sp.cardStrFlat.card !== (card.name || "")) return 0;
    return Math.ceil(strFlat * this._v(sp.cardStrFlat.pct, l) / 100);
  },

  /* ---- 力量获取乘区：获得正力量时层数 ×(1+Σ队伍team+自身self)%（杜勒赛因/雷娅） ---- */
  strGainMult(gainer) {
    const b = State.battle;
    if (!b || !b.allies || !gainer) return 1;
    let pct = 0;
    for (const a of b.allies) {
      const sp = a.def && this.SPECS[a.def.name];
      const l = this.lv(a);
      if (!sp || l <= 0) continue;
      if (sp.strGainTeam) pct += this._v(sp.strGainTeam, l);
      if (sp.strGainSelf && a === gainer) pct += this._v(sp.strGainSelf, l);
    }
    return 1 + pct / 100;
  },

  /* ---- 触腕成员词条：仅 src（触发该次触腕攻击的成员）自己的规格生效；自动触腕 src=null → 1 ---- */
  tentacleSrcMult(src) {
    if (!src || !src.def) return 1;
    const sp = this.SPECS[src.def.name];
    const l = this.lv(src);
    if (!sp || !sp.tentacleSrc || l <= 0) return 1;
    return 1 + this._v(sp.tentacleSrc, l) / 100;
  },

  /* ---- 开战（turn.js startBattle 在 RealmSys.onBattleStart 后调用） ---- */
  onBattleStart(b) {
    for (const a of b.allies) {
      const sp = a.def && this.SPECS[a.def.name];
      const l = this.lv(a);
      if (!sp || l <= 0 || !a.stats) continue;
      if (sp.battleStart && sp.battleStart.strPctAtk) {
        const n = Math.ceil((a.stats.attack || 0) * this._v(sp.battleStart.strPctAtk, l) / 100);
        if (n > 0) {
          Buffs.add(a, "buff_strength", n, null, `灵塑·${a.def.name}开战`);
          Log.add(`🧬 灵塑：${a.def.name} 战斗开始获得 ${n} 点力量（攻击力×${this._v(sp.battleStart.strPctAtk, l)}%，灵塑 Lv${l}）`, "sys");
        }
      }
      if (sp.battleStart && sp.battleStart.guardPctDef) {
        const g = Math.ceil((a.stats.defense || 0) * this._v(sp.battleStart.guardPctDef, l) / 100);
        if (g > 0) {
          Buffs.add(a, "buff_guard", g, null, `灵塑·${a.def.name}开战`);
          Log.add(`🧬 灵塑：${a.def.name} 战斗开始获得 ${g} 点戒备（防御力×${this._v(sp.battleStart.guardPctDef, l)}%）`, "sys");
        }
      }
      if (sp.battleStartSilverPct) {
        const charge = (a.stats && a.stats.silverKeyCharge) || 0;
        const n = Math.floor(charge * this._v(sp.battleStartSilverPct, l) / 100);
        if (n > 0) {
          b.silver += n;
          Log.add(`🧬 灵塑：${a.def.name} 战斗开始获得 ${n} 点银钥能量（银充 ${charge}×${this._v(sp.battleStartSilverPct, l)}%）`, "sys");
        }
      }
    }
  }
};

window.Spirit = Spirit;
