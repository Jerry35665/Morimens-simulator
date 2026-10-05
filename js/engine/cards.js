/* =========================================================
 * 引擎 · 卡牌生命周期与出牌结算
 * ---------------------------------------------------------
 * 牌堆模型：全队共享 牌堆/手牌/弃牌/消除 四区（杀戮尖塔式通用模型；
 * 忘却前夜实际是共享牌组还是角色独立牌组 待确认，见 MECHANICS.md）
 * ========================================================= */
"use strict";

const Cards = {

  HAND_LIMIT: 10,   // 手牌上限（占位，待确认）

  /* 开战：按 SSR 口径组建共享牌组（T15，图证实锤 2026-10-01）→ 洗牌
   * 每名唤醒体贡献 4 张：打击 + 防御 + 技能1 + 技能2（异格多为 1 张技能，有则凑入）；
   * 狂气爆发/灵知觉醒不进默认牌堆（爆发走按钮、觉醒靠银钥觉醒置入）；
   * 命轮加卡（蚀灭·萝坦 +2 打击）待 T8 框架 */
  buildPiles() {
    const b = State.battle;
    b.piles = { draw: [], hand: [], discard: [], exhaust: [] };
    /* 标点归一化（wiki「统统消失！」vs 卡名「统统消失!」等全半角差异） */
    const norm = (s) => (s || "").replace(/[！？：，]/g, (ch) => ({ "！": "!", "？": "?", "：": ":", "，": "," }[ch])).replace(/\s+/g, "");
    for (const ally of b.allies) {
      const own = DBF.cards.filter(c => c.owner === ally.def.id);
      const strike = own.find(c => /^(基础)?打击$/.test(c.name || ""));
      const defend = own.find(c => /^(基础)?防御$/.test(c.name || ""));
      /* 技能1（右）/技能2（左）：按 wiki.skills[].name 映射（T20 退修，用户指定口径）——
       * 异格技能卡大量 type="攻击"（恨意宣泄/长刃·陨等），type 过滤漏卡；
       * wiki 无该角色页/skills 未解析、或卡名未建卡时回落 type∈{技能,权柄}（老批口径） */
      const wikiChar = DBF.wiki && DBF.wiki.characters && DBF.wiki.characters[ally.def.name];
      const wikiSkills = ((wikiChar && wikiChar.skills) || []).map(s => s && s.name).filter(Boolean);
      let skills = wikiSkills.length
        ? wikiSkills.map(n => own.find(c => norm(c.name) === norm(n))).filter(Boolean).slice(0, 2)
        : [];
      if (!skills.length) skills = own.filter(c => c.type === "技能" || c.type === "权柄").slice(0, 2);
      const four = [strike, defend, ...skills].filter(Boolean);
      if (!four.length) {
        for (const cid of (ally.def.defaultDeck || [])) {
          if (State.getCard(cid)) b.piles.draw.push({ uid: State.nextUid("c"), defId: cid, upgraded: false, generated: false });
        }
        Log.add(`⚠ ${ally.def.name} 无 SSR 口径卡数据，回落 defaultDeck 模板`, "sys");
        continue;
      }
      for (const c of four) b.piles.draw.push({ uid: State.nextUid("c"), defId: c.id, upgraded: false, generated: false });
      Log.add(`${ally.def.name} 贡献 ${four.length} 张（打击+防御+技能×${skills.length}${wikiSkills.length ? ",wiki映射" : ",type回落"}）`, "sys");
      /* 命轮加卡（T8 三期：坚韧意志/不存在之地/遗忘之手——探索开始置入额外卡） */
      const extras = (typeof Wheels !== "undefined") ? Wheels.extraCards(ally) : [];
      for (const nm of extras) {
        const baseRe = new RegExp(`^(基础)?${nm}$`);
        const cd = own.find(c => norm(c.name || "") === norm(nm) || baseRe.test(c.name || ""))
          || DBF.cards.find(c => c.owner === "shared" && norm(c.name || "") === norm(nm));   // 灵感等 shared 卡（被缚的歌谣）
        if (cd) {
          b.piles.draw.push({ uid: State.nextUid("c"), defId: cd.id, upgraded: false, generated: false });
          Log.add(`💫 命轮加卡：${ally.def.name} 的「${cd.name}」置入牌库`, "good");
        }
      }
    }
    this.shuffle(b.piles.draw);
    Log.add(`牌组建成：共 ${b.piles.draw.length} 张（SSR 口径共享牌组，T15/T20）`, "sys");
  },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  inst(defId, upgraded = false) {
    return { uid: State.nextUid("c"), defId, upgraded, generated: true };
  },

  def(inst) { return State.getCard(inst.defId); },

  /* 抽牌 */
  draw(n) {
    const b = State.battle;
    for (let i = 0; i < n; i++) {
      if (b.piles.hand.length >= this.HAND_LIMIT) { Log.add("手牌已满，无法继续抽牌", "sys"); break; }
      if (!b.piles.draw.length) {
        if (!b.piles.discard.length) { Log.add("牌堆与弃牌堆均无牌可抽", "sys"); break; }
        b.piles.draw = b.piles.discard.splice(0);
        this.shuffle(b.piles.draw);
        Log.add("弃牌堆洗回牌堆", "sys");
      }
      const c = b.piles.draw.pop();
      b.piles.hand.push(c);
      Log.add(`抽到 <b>${this.def(c).name}</b>`, "sys");
    }
    State.notify();
  },

  /* 生成指定卡牌到手牌（沙盒干预/生成类卡） */
  generate(cardId, upgraded = false) {
    const b = State.battle;
    if (!b) { alert("请先开始战斗"); return; }
    if (!State.getCard(cardId)) { alert(`未知卡牌: ${cardId}`); return; }
    if (b.piles.hand.length >= this.HAND_LIMIT) { alert("手牌已满"); return; }
    b.piles.hand.push(this.inst(cardId, upgraded));
    Log.add(`生成卡牌 <b>${this.def(b.piles.hand[b.piles.hand.length - 1]).name}</b> 到手牌`, "sys");
    State.notify();
  },

  /* 把实例移到某区 */
  _move(uid, zone) {
    const b = State.battle;
    for (const key of ["hand", "draw", "discard", "exhaust"]) {
      const idx = b.piles[key].findIndex(c => c.uid === uid);
      if (idx >= 0) { const [c] = b.piles[key].splice(idx, 1); if (zone) b.piles[zone].push(c); return c; }
    }
    return null;
  },

  /* 消除（从手牌直接移出战斗） */
  exhaustFromHand(uid) {
    const c = this._move(uid, "exhaust");
    if (c) {
      Log.add(`消除手牌 <b>${this.def(c).name}</b>`, "sys");
      State.notify();
    }
  },

  /* 出牌主流程：算力检查 → 结算 effects → 进弃牌/消除 → 狂气爆发清空
   * T32 实测批（2026-10-02）：未传目标时攻击牌自动从上到下取首个存活敌人（单击即打出）；
   * choices 卡（自毁改造等）先弹选择；stances 卡（螺湮圆舞）按当前触腕姿态分支 */
  /* 打击判定（T38 C）：卡名「打击/基础打击」，或卡面 视为「打击」——减费计数与命轮打击触发共用 */
  isStrikeCard(card) {
    return /^(基础)?打击$/.test((card && card.name) || "") || /视为[「"]?打击/.test((card && card.text) || "");
  },

  play(uid, targetUid, choiceIdx = null) {
    const b = State.battle;
    if (!b || b.phase !== "play") { alert("当前不在出牌阶段"); return; }
    const inst = b.piles.hand.find(c => c.uid === uid);
    if (!inst) return;
    const card = this.def(inst);
    /* 选择分支：未带 choiceIdx 时交回 UI 弹窗，选择后重入（⚠ UIHand 是顶层 const，不在 window 上，必须用 typeof 探测）
     * choicesAll（T42④ 自毁改造·终末）：绕过弹窗直出全部分支 */
    if (card.choices && card.choices.length && choiceIdx == null) {
      if (card.choicesAll) {
        choiceIdx = -1;
      } else if (typeof UIHand !== "undefined" && UIHand.showChoices) { UIHand.showChoices(inst.uid, card); return; }
      else choiceIdx = 0;   // 无 UI 环境（测试/沙盒）取第一分支
    }
    const owner = b.allies.find(a => a.def.id === card.owner) || b.allies[0];
    if (!owner) { alert("场上没有我方单位"); return; }
    let target = targetUid ? State.findUnit(targetUid) : null;
    /* 自动索敌：攻击牌从上到下首个存活敌人；我方牌默认打出生效者 */
    if (!target) {
      if (card.target === "enemy") target = b.enemies.find(e => e.hp > 0) || null;
      else if (card.target === "ally") target = owner;
    }
    if (card.target === "enemy" && (!target || target.side !== "enemy")) { alert("请先选择一个敌方目标"); return; }
    if (card.target === "ally" && (!target || target.side !== "ally")) { alert("请选择一个我方目标"); return; }

    /* 算力检查（gamekee：每回合初始5点算力；狂气爆发不消耗算力）
     * X 费（无边荒影，用户 2026-10-01 定案）：cost="X"=打出消耗所有算力（0 算力也可打出）；银钥按实耗结算
     * 命轮减费（T8 二期，巨人之刃/往昔的花与诗）：inst.disc=本回合算力消耗-1（爆发时 roll，回合末清）
     * 打击减费（T32 实测批，T38 C 泛化）：本回合每打出 1 张「打击」，discPerStrike 卡算力 -1——
     * 计数全队共享（卡面无归属限定，队友打击同样减费）；视为「打击」卡（长刃·陨/人间爆破等）同计 */
    const isBurst = card.type === "狂气爆发";
    if (!isBurst) {
      const isX = card.cost === "X";
      let disc = inst.disc || 0;
      if (card.discPerStrike) {
        const n = b.strikesPlayed || 0;
        if (n > disc) {
          disc = n;
          Log.add(`<span class="dim">${card.name} 减费：本回合已打出 ${n} 张「打击」→ 算力 -${n}</span>`, "sys");
        }
      }
      /* 星辰篇·算力调和（T48）：单回合出牌达 10 张后每打出 1 张 +1 层，使本回合内每次打出指令卡
       * 算力消耗 +1（打出时结算已有层数，打出后获得新层——第 11 张触发首层、第 12 张起 +1 费）；
       * 消耗的每点额外算力 → 100% 打出者银充的银钥能量，可叠加。发动超维空间后重置（超维空间重置点未接，登记 DATA-TODO）。
       * X 费=消耗所有算力，不叠加调和加成（实耗口径，注记待实测） */
      const tune = (State.starEnv && !isX) ? (b.energyTune || 0) : 0;
      if (tune > 0) Log.add(`<span class="dim">⭐ 算力调和 ×${tune}：本张算力消耗 +${tune}</span>`, "sys");
      const spend = isX ? b.energy : Math.max(0, card.cost - disc + tune);
      if (!isX && b.energy < spend) { alert(`算力不足（当前 ${b.energy}，需要 ${card.cost}${disc ? `-${disc}(减费)` : ""}${tune ? `+${tune}(调和)` : ""}）`); return; }
      b.energy -= spend;
      b.xSpend = isX ? spend : 0;   // X 费实耗（不定壁垒 timesXSpend/perSpend 等引用，T32 追加批）
      delete inst.disc;   // 减费随打出消耗
      /* 银钥结算（2026-09-28 实测曲线）：每消耗1算力获得 X 点银钥，X 按打出者银钥充能等级查表衰减（取整，用户 2026-10-02）
       * 星辰篇·算力调和：额外算力部分不按查表，改按 100%×打出者银充/点（T48 截图口径） */
      const skLevel = (owner.stats && owner.stats.silverKeyCharge) || 15;
      const silverGain = Math.round(State.silverPerCost(skLevel) * (spend - tune)) + Math.round((owner.stats && owner.stats.silverKeyCharge) || 0) * tune;
      b.silver += silverGain;
      if (isX) Log.add(`<span class="dim">X 费：消耗全部算力 ${spend} 点（银钥按实耗 +${silverGain}）</span>`, "sys");
    } else {
      if (owner.guku < 100) Log.add(`<span class="warn-text">注意：狂气不足100仍打出了爆发卡（沙盒模式不阻止）</span>`, "sys");
      /* 官方词条（2026-09-23）：释放狂气爆发后剩余狂气减半（超限语境）；普通爆发仍清零 */
      const over = owner.gukuMax > 100 && owner.guku >= owner.gukuMax;
      owner.guku = over ? Math.floor(owner.guku / 2) : 0;
      Log.add(`${owner.def.name} 释放${over ? "【超限】" : ""}狂气爆发（不消耗算力），剩余狂气 ${owner.guku}`, "sys");
    }

    Log.add(`▶ 打出 <b>${card.name}</b>${inst.upgraded ? "(升)" : ""}${target ? ` → ${target.def.name}` : ""}（算力余 ${b.energy}）`, "sys");

    /* 魔女宽檐帽首卡判定（T8）：本回合第一张指令卡标记在结算后置位——结算中的 compute 读到 false 即首卡 */
    const wasFirstCard = b.firstCardPlayed === false;
    /* 选择分支（自毁改造等 choices 卡，choiceIdx 由弹窗回传）/ 姿态分支（螺湮圆舞按当前触腕姿态）——T32 实测批
     * choicesAll（T42④ 自毁改造·终末）：绕过弹窗同时触发全部分支 */
    let effList = (inst.upgraded && card.upgrade ? card.upgrade.effects : card.effects);
    if (card.choices && card.choices.length && choiceIdx != null) {
      if (choiceIdx === -1) {
        effList = card.choices.flatMap(c => c.effects || []);
        Log.add(`↪ 终末：同时触发「${card.choices.map(c => c.name).join("」「")}」`, "sys");
      } else if (card.choices[choiceIdx]) {
        effList = card.choices[choiceIdx].effects || [];
        Log.add(`↪ 选择「${card.choices[choiceIdx].name}」`, "sys");
      }
    }
    if (card.stances && typeof Tentacle !== "undefined" && b.tentacle) {
      const branch = card.stances[b.tentacle.stance] || [];
      effList = [...effList, ...branch];
      if (branch.length) Log.add(`↪ 触腕姿态「${b.tentacle.stance}」分支`, "sys");
    }
    for (const eff of effList) {
      this.resolveEffect(eff, owner, target, card, inst);
    }
    /* 维度穿梭（T36 界域系统）：每回合首次打出指令卡后，临时原始复制置入超维空间 */
    if (wasFirstCard && typeof RealmSys !== "undefined") RealmSys.onFirstCardPlayed(card);
    /* 打击计数（discPerStrike，T38 C 泛化）：isStrikeCard=卡名打击/基础打击 或 卡面视为「打击」；全队共享 */
    if (this.isStrikeCard(card)) {
      b.strikesPlayed = (b.strikesPlayed || 0) + 1;
    }
    if (wasFirstCard) b.firstCardPlayed = true;
    b.playedCount = (b.playedCount || 0) + 1;   // T34 条件边：「出牌>=N」计数（爆发卡走 releaseBurst 不计）
    /* 星辰篇·算力调和（T48）：本回合出牌计数；>10 张后每打出 1 张获得 1 层（第 11 张触发首层） */
    b.playedThisTurn = (b.playedThisTurn || 0) + 1;
    if (State.starEnv && !isBurst && b.playedThisTurn > 10) {
      b.energyTune = (b.energyTune || 0) + 1;
      Log.add(`⭐ 算力调和获得 1 层（当前 ${b.energyTune} 层，后续每张算力消耗 +1）`, "good");
    }
    /* 固有天赋（T40）：打出卡触发（attrCardCritOnPlay 族——艾瑞卡/汀克特） */
    if (typeof State.talentOnPlay === "function") State.talentOnPlay(owner, card);
    /* T55 启灵打出触发：onPlayCrit/CritDmg（临时暴击率/暴伤%）、onPlayStrPct（攻X%临时力量）、
     * onPlayTentaclePct（攻X%临时触腕伤害）——enlightenOn 门控 */
    if (typeof State.enlightenMods === "function") {
      for (const em of State.enlightenMods(owner, card.name)) {
        if (em.onPlayCrit || em.onPlayCritDmg) {
          if (em.onPlayCrit) Buffs.add(owner, "buff_crit_up", em.onPlayCrit, null, `启灵·${owner.def.name}`);
          if (em.onPlayCritDmg) Buffs.add(owner, "buff_critdmg_up", em.onPlayCritDmg, null, `启灵·${owner.def.name}`);
          Log.add(`🌟 启灵【${owner.def.name}】：打出「${card.name}」获得临时暴击率+${em.onPlayCrit || 0}%、暴伤+${em.onPlayCritDmg || 0}%`, "sys");
        }
        if (em.onPlayStrPct) {
          const sv = Math.ceil((owner.attack || 0) * em.onPlayStrPct / 100);
          if (sv > 0) { Buffs.add(owner, "buff_strength", 1, 1, `启灵·${owner.def.name}`, sv); Log.add(`🌟 启灵【${owner.def.name}】：打出「${card.name}」获得临时力量 +${sv}（攻${em.onPlayStrPct}%）`, "sys"); }
        }
        if (em.onPlayTentaclePct && typeof Tentacle !== "undefined") {
          Tentacle.addTempDmg(owner, em.onPlayTentaclePct / 100);
        }
        if (em.onPlayGuku) {
          owner.guku = Math.min(owner.gukuMax || 100, owner.guku + em.onPlayGuku);
          Log.add(`🌟 启灵【${owner.def.name}】：打出「${card.name}」狂气 +${em.onPlayGuku}（${owner.guku}/${owner.gukuMax}）`, "sys");
        }
      }
    }
    /* 刻印触发（T50 关卡刻印 Sigils）：附加在实例上的词缀，打出时结算 onPlay 子集。
     * ⚠与 T38「卡牌刻印（回响语境，未建模无数值影响）」同名不同物 */
    if (typeof Sigils !== "undefined" && inst.sigil) Sigils.onCardPlayed(inst, owner);
    /* 关卡造物打出钩子（T53）：小八音盒/魔术手套/伶牙俐齿/万花筒/哀嚎摇铃/失声唱机/面纱钩爪族 */
    if (typeof LevelRelics !== "undefined") LevelRelics.onCardPlayed(inst, owner, card);
    inst.playCount = (inst.playCount || 0) + 1;   // T38 D：实例打出次数（变身/每第N次类语义按打出计，不按伤害段计）
    /* 巨剑·鲸落合成旗（T42②）：短刃·噬每第 3 次打出 → 本回合下次「长刃·陨」合成鲸落（同回合语义，endTurn 清旗） */
    if (card.whaleFuse && inst.playCount % 3 === 0 && !b.whaleFuseReady) {
      b.whaleFuseReady = true;
      Log.add(`⚓ 短刃·噬 第 ${inst.playCount} 次打出：本回合下次打出「长刃·陨」时合成「巨剑·鲸落」`, "good");
    }
    /* 变身（T38 D）：transformAfter.plays 次后变为 into（鲜血链条3次→嗜血链球）；无 plays=打出即变回 */
    const tr = card.transformAfter;
    if (tr && (!tr.plays || inst.playCount >= tr.plays)) {
      inst.defId = tr.into;
      inst.playCount = 0;
      Log.add(`⇄ ${card.name} 变为「${this.def(inst).name}」${tr.plays ? `（已打出 ${tr.plays} 次）` : ""}`, "sys");
    }
    /* 巨剑·鲸落合成（T42②，用户定案）：短刃·噬第3次打出的同回合打出长刃·陨 → 长刃变鲸落回手，
     * 跨回合保留（card_rc_whale.retain）；鲸落持有机制（敌增伤25%/指令卡变蚀灭）仍未建模 */
    let synthWhale = false;
    if (b.whaleFuseReady && card.id === "card_rc_fallen") {
      inst.defId = "card_rc_whale";
      inst.playCount = 0;
      b.whaleFuseReady = false;
      synthWhale = true;
      Log.add(`⚓ 「长刃·陨」合成「巨剑·鲸落」！强制保留在手中`, "good");
    }
    /* 回响（T38 D，MECHANICS 术语行）：打出后回到手牌。「刻印失效」用户 2026-10-03 定案=按没有刻印
     * 实现、属性一致——模拟器未建模卡牌刻印，故无数值影响。
     * 变身对（鲜血链条↔嗜血链球）：打出形态或变后形态任一有回响即入手牌——链条3打变身成球仍回手、
     * 球打出变回链条随链条回响回手 */
    const afterTr = this.def(inst);
    if (synthWhale) {
      this._move(uid, "hand");
    } else if ((card.echo || afterTr.echo) && !inst.forceExhaust) {
      this._move(uid, "hand");
      Log.add(`↩ 回响：${afterTr.name} 回到手牌`, "sys");
    } else {
      this._move(uid, (inst.forceExhaust || card.exhaust) ? "exhaust" : "discard");   // forceExhaust：钥令生成的「消耗」复制牌
    }
    /* 命轮触发（T8）：打击类（被缚抽牌/于暴雨算力中毒/灵魂诞生回血/核心熔解力量/星天兽暴击）+ 任意卡类（琥珀力量） */
    if (typeof Wheels !== "undefined") { Wheels.onStrikePlay(card, owner); Wheels.onAnyPlay(card, owner); }
    Turn.checkEnd();
    State.notify();
  },

  /* 卡牌等级加成：打击/防御类卡每升一级 +2%（1/6~6/6） */
  /* =======================================================
   * 动态卡面：按效果结构生成带实时数值的描述
   * mode="raw"    只计算唤醒体属性（等级成长/面板强效/体质换算），不含战斗状态
   * mode="actual" 含当前战斗状态（力量/增伤/易伤/脆弱），与实际结算一致
   * ======================================================= */
  describeEffects(card, source, mode = "raw") {
    if (!source || !card.effects || !card.effects.length) return [];
    const lv = source.cardLv || 1;
    const buffName = (id) => { const b = State.getBuff(id); return b ? `${b.name}` : id; };
    const ignoreBuffs = mode !== "actual";
    const out = [];
    for (const eff of card.effects) {
      const grow = (eff.perLv || 0) * (lv - 1);
      switch (eff.op) {
        case "damage": {
          if (eff.pctTargetMaxHp) {
            const tgt = State.battle ? State.battle.enemies.find(e => e.hp > 0) : null;
            const v = tgt ? Math.max(1, Math.ceil(tgt.maxHp * eff.pctTargetMaxHp / 100)) : `目标最大生命×${eff.pctTargetMaxHp}%`;
            out.push(`造成${v}点伤害（对所有敌人）`);
            break;
          }
          let base = eff.value != null ? eff.value + grow : Math.ceil((source.attack || 0) * ((eff.scaleAttack || 0) + (eff.scalePerLv || 0) * (lv - 1)));
          const target = State.battle ? State.battle.enemies.find(e => e.hp > 0) : null;
          const r = Damage.compute({ source, target, card, eff: { value: base }, ignoreBuffs });
          let t = `造成${r.final}点伤害`;
          if (eff.times > 1) t += `×${eff.times}次`;
          if (eff.allEnemies) t += "（对所有敌人）";
          out.push(t);
          break;
        }
        case "block": {
          /* fpFix：消除 50×0.28=14.000…002 型浮点尾巴，避免 ceil 多 +1 */
          let v = eff.value != null ? eff.value + grow : Math.ceil(Math.round((source.defense || 0) * ((eff.scaleDefense || 1) + (eff.scalePerLv || 0) * (lv - 1)) * 1e6) / 1e6);
          if (!ignoreBuffs) {
            const frag = Buffs.collect(source, "shieldPct");
            if (frag.length) v = Math.round(v * Buffs.aggregate(frag).factor);
          }
          let t = `获得${v}点护盾`;
          if (eff.times > 1) t += `×${eff.times}次`;
          if (eff.timesXSpend) t += `×(当前算力+1)次`;
          out.push(t);
          break;
        }
        case "heal": {
          let v, suffix = "";
          if (eff.pctConstitution != null) {
            let pct = eff.pctConstitution + grow;
            /* 启灵①纯粹理性（外域手术）：治疗量提高33%（30×1.33=39.9）；卡面用**面板体质**（无灵塑），
             * 天赋灵知解构在 heal 取整后乘算：ceil(102×39.9%)=41 → ×1.072 → 44（2026-10-03 用户定案含天赋） */
            if (card && card.name === "外域手术" && source.enlightenOn && source.enlightenOn[0] === true) {
              pct = pct * 1.33;
            }
            v = Math.ceil((source.stats?.constitution || 0) * pct / 100);
            /* 灵知解构（卡面亦含天赋——用户 2026-10-03 定案「面板44已包含天赋加成」）：×(1+狂充×0.5%) */
            const tkd = State.TALENT_HOOKS && State.TALENT_HOOKS[source.def.id];
            if (tkd && tkd.healUpPerGuku && card && (card.name === "外域手术" || card.name === "等价交换") && v > 0) {
              v = Math.ceil(v * (1 + (source.stats?.gukuRecharge || 0) * tkd.healUpPerGuku));
            }
            suffix = `（体质${Math.round(pct * 10) / 10}%）`;
          } else {
            v = (eff.value || 0) + grow;
          }
          out.push(`回复${v}点生命${suffix}`);
          break;
        }
        case "discardHeal": {
          const pctEX = (eff.pctConstitution || 0) + (eff.perLv || 0) * (lv - 1);
          out.push(`弃掉所有手牌，每弃1张额外回复体质${pctEX}%点生命`);
          break;
        }
        case "guku": {
          const bonus = (card.type === "攻击" || card.type === "防御") ? lv - 1 : 0;
          if (eff.perSpend != null) {
            const charge = State.battle ? (State.battle.xSpend || 0) : 0;
            out.push(`获得${eff.perSpend * charge}点狂气（${eff.perSpend}/算力×${charge}）`);
            break;
          }
          out.push(`获得${eff.value + grow + bonus}点狂气`);
          break;
        }
        case "gukuAllies":
          out.push(`其他唤醒体各获${eff.value + grow}点狂气`);
          break;
        case "buff": {
          const verb = eff.target === "all_enemies" ? "对所有敌人施加"
            : eff.target === "all_allies" ? "对我方全体施加"
            : eff.target === "enemy" ? "对目标施加"
            : eff.target === "ally" ? "为目标施加" : "获得";
          let perTxt = eff.per ? `（每层${eff.per > 0 ? "+" : ""}${eff.per}）` : "";
          if (eff.perCalcAtkPct) {
            const pct = eff.perCalcAtkPct.base + (eff.perCalcAtkPct.perLv || 0) * (lv - 1);
            const v = Math.round((source.attack || 0) * pct / 100);
            perTxt = `（${v}，攻×${Math.round(pct * 10) / 10}%）`;
          } else if (eff.perCalcDefPct) {
            const pct = eff.perCalcDefPct.base + (eff.perCalcDefPct.perLv || 0) * (lv - 1);
            const v = Math.round((source.defense || 0) * pct / 100);
            perTxt = `（${v}，防×${Math.round(pct * 10) / 10}%）`;
          } else if (eff.perFlat) {
            const v = eff.perFlat.base + (eff.perFlat.perLv || 0) * (lv - 1);
            perTxt = `（${Math.round(v * 10) / 10}点）`;
          }
          /* 力量/力量降低：点数=层数×1点（用户 2026-10-02 口径） */
          const isStrength = eff.buffId === "buff_strength" || eff.buffId === "debuff_strength_down";
          let layerTxt = `${eff.stacks || 1}层`;
          if (eff.stacksAtkPct) {
            layerTxt = `${Math.max(1, Math.round((source.attack || 0) * eff.stacksAtkPct.base / 100))}层（攻×${eff.stacksAtkPct.base}%）`;
          } else if (isStrength && (eff.perCalcAtkPct || eff.perCalcDefPct || eff.perFlat || eff.per)) {
            const pts = eff.perCalcAtkPct ? Math.round((source.attack || 0) * (eff.perCalcAtkPct.base + (eff.perCalcAtkPct.perLv || 0) * (lv - 1)) / 100)
              : eff.perCalcDefPct ? Math.round((source.defense || 0) * (eff.perCalcDefPct.base + (eff.perCalcDefPct.perLv || 0) * (lv - 1)) / 100)
              : eff.perFlat ? Math.round(eff.perFlat.base + (eff.perFlat.perLv || 0) * (lv - 1))
              : eff.per;
            layerTxt = `${Math.max(1, Math.round(pts))}层`;
            perTxt = "（每层1点）";
          } else if (eff.stacksDefPct) {
            const pct = eff.stacksDefPct.base + (eff.stacksDefPct.perLv || 0) * (lv - 1);
            layerTxt = `${Math.max(1, Math.round((source.defense || 0) * pct / 100))}层（防×${pct}%）`;
          }
          if (isStrength && !eff.perCalcAtkPct && !eff.perCalcDefPct && !eff.perFlat && !eff.per) perTxt = "（每层1点）";
          out.push(`${verb}${layerTxt}${buffName(eff.buffId)}${perTxt}`);
          break;
        }
        case "draw": out.push(`抽${eff.value}张牌`); break;
        case "energy": out.push(`获得${eff.value}点算力`); break;
        case "silver": out.push(`获得${eff.chargePct != null ? Math.round((source.stats ? (source.stats.silverKeyCharge || 0) : 0) * eff.chargePct / 100) : eff.value}银钥能量`); break;
        case "tentacle": out.push(`获得${eff.value}条触腕`); break;
        case "dispel": out.push(`驱散${eff.target === "self" ? "自身" : "目标"}的${eff.kind === "debuff" ? "减益" : "增益"}`); break;
        default: break;
      }
    }
    return out;
  },

  /* 单个效果结算（inst=打出的卡实例，discardHeal 等需排除本卡的效果用） */
  resolveEffect(eff, source, target, card, inst) {
    switch (eff.op) {
      case "damage": {
        const times = eff.times || 1;
        /* 基础打击/防御的卡牌等级成长=倍率成长（scalePerLv=0.02/级，灰机 2026-10-02 全量核验：
         * 56角色 打击/防御均为 攻/防×(10%+2%×(级-1))）——不再有额外乘数（旧 cardLvMult ×1.02/级 系误读已移除） */
        const lvGrow = (eff.perLv || 0) * ((source.cardLv || 1) - 1);
        let grownEff = eff;
        if (lvGrow) grownEff = { ...grownEff, value: (grownEff.value != null ? grownEff.value : 0) + lvGrow };
        if (eff.scalePerLv) grownEff = { ...grownEff, scaleAttack: (eff.scaleAttack || 0) + eff.scalePerLv * ((source.cardLv || 1) - 1) };
        /* pctTargetMaxHp：按目标最大生命%的固定伤害（最低1，向上取整），如「虚无终结」 */
        if (grownEff.pctTargetMaxHp) {
          const pct = grownEff.pctTargetMaxHp;
          const tgts = grownEff.allEnemies ? State.battle.enemies.filter(e => e.hp > 0) : [target].filter(Boolean);
          for (const tgt of tgts) {
            if (tgt.hp <= 0) continue;
            const v = Math.max(1, Math.ceil(tgt.maxHp * pct / 100));
            Damage.deal({ source, target: tgt, card, eff: { value: v }, label: `${card.name}（目标最大生命${pct}%）` });
          }
          break;
        }
        /* T32 修复（2026-10-02）：缩放基础卡（scaleAttack 无 value）此前被注入 value:0，
         * 卡Lv>1 时 Damage.compute 视为平值 0 → 打击伤害清零 */
        const targets = grownEff.allEnemies
          ? State.battle.enemies.filter(e => e.hp > 0)
          : [target && target.hp > 0 ? target : State.battle.enemies.find(e => e.hp > 0)].filter(Boolean);
        for (const tgt of targets) {
          for (let i = 0; i < times; i++) {
            if (tgt.hp <= 0) break;
            Damage.deal({ source, target: tgt, card, eff: grownEff, label: `${card.name}${times > 1 ? `(${i + 1}/${times})` : ""}` });
          }
        }
        break;
      }
      case "block": {
        /* 护盾获得量受脆弱（shieldPct）影响
         * scalePerLv：护盾%随技能等级成长（如 未损的骑士心 防×(28+7×技能等级)%、基础防御 10%+2%/级）
         * timesXSpend（T32 追加批：不定壁垒）：生效次数 = X 费实耗算力 + 1（play() 已把实耗记入 b.xSpend） */
        const times = eff.timesXSpend ? (State.battle.xSpend || 0) + 1 : (eff.times || 1);
        let v = eff.value != null ? eff.value + (eff.perLv || 0) * ((source.cardLv || 1) - 1)
          : Math.ceil(Math.round((source.defense || 0) * ((eff.scaleDefense || 0) + (eff.scalePerLv || 0) * ((source.cardLv || 1) - 1)) * 1e6) / 1e6);
        /* T55 启灵卡牌修正：该卡护盾提高X%/+N 点 */
        if (typeof State.enlightenMods === "function") {
          for (const em of State.enlightenMods(source, card.name)) {
            if (em.blockPct) v = Math.round(v * (1 + em.blockPct / 100));
            if (em.blockFlat) v += em.blockFlat;
          }
        }
        const frag = Buffs.collect(source, "shieldPct");
        if (frag.length) {
          const agg = Buffs.aggregate(frag);
          v = Math.round(v * agg.factor);
          Log.add(`<span class="dim">护盾受 ${frag.map(m => m.name).join("、")} 影响 ×${agg.factor.toFixed(3)}${agg.hasUnknown ? " ⚠叠法未确认" : ""}</span>`);
        }
        /* 命轮「护盾提高X%」统一入口（T8 三期，blockPct 在 addShield 内乘算） */
        let gainedTotal = 0;
        for (let k = 0; k < times; k++) {
          gainedTotal += (typeof Damage !== "undefined") ? Damage.addShield(source, v) : (source.shield += v, v);
        }
        Log.add(`${source.def.name} 获得护盾 +${gainedTotal}${times > 1 ? `（${v}/次 ×${times}）` : ""}（当前 ${source.shield}，回合结束移除）`, "good");
        if (window.UIBoard) UIBoard.float(source.uid, `+${gainedTotal}🛡`, "shield");
        break;
      }
      case "buff": {
        /* T32 实测批（2026-10-02 用户口径）：
         * all_allies 目标=我方全体；力量/力量降低「点数=层数×1点」（perCalc 系与 perFlat 的点数转为层数，每层 1 点） */
        const ts = eff.target === "all_enemies"
          ? State.battle.enemies.filter(e => e.hp > 0)
          : eff.target === "all_allies"
            ? State.battle.allies.filter(a => a.hp == null || a.hp > 0)   // 我方单位 hp 在队伍共享血条上（undefined=存活）
            : [eff.target === "enemy" || eff.target === "ally" ? target : source].filter(Boolean);
        /* perCalcAtkPct：按攻击力百分比计算每层点数（如 超越之目 攻×(2.4+0.6×技能等级)% 力量）
         * perCalcDefPct：按防御力百分比计算每层点数（如 无边荒影 防×(3.2+0.8×技能等级)% 降力）
         * perFlat：每层固定点数随技能等级成长（如 未损的骑士心 (3.2+0.8×技能等级)点力量） */
        let per = eff.per || null;
        if (eff.perCalcAtkPct) {
          const lv = source.cardLv || 1;
          per = Math.round((source.attack || 0) * (eff.perCalcAtkPct.base + (eff.perCalcAtkPct.perLv || 0) * (lv - 1)) / 100);
        } else if (eff.perCalcDefPct) {
          const lv = source.cardLv || 1;
          per = Math.round((source.defense || 0) * (eff.perCalcDefPct.base + (eff.perCalcDefPct.perLv || 0) * (lv - 1)) / 100);
        } else if (eff.perFlat) {
          const lv = source.cardLv || 1;
          per = Math.round((eff.perFlat.base + (eff.perFlat.perLv || 0) * (lv - 1)) * 10) / 10;
        }
        /* stacksAtkPct（T32 建模批）：层数/点数=攻击力×X%（如 中毒层数、反击点数），最低 1
         * stacksDefPct（T32 实测批）：点数=防御力×X%（如 自毁改造·诅咒 失力） */
        let stacks = eff.stacks || 1;
        /* 启灵①钩子（用户 2026-10-03 锚点批）：朵尔 纯粹理性——「外域手术」虚弱回合数提高1（1→2层） */
        if (card && card.name === "外域手术" && eff.buffId === "debuff_weak" && source.enlightenOn && source.enlightenOn[0] === true) {
          stacks += 1;
        }
        if (eff.stacksAtkPct) {
          const pct = eff.stacksAtkPct.base + (eff.stacksAtkPct.perLv || 0) * ((source.cardLv || 1) - 1);
          stacks = Math.max(1, Math.round((source.attack || 0) * pct / 100));
        }
        if (eff.stacksDefPct) {
          const pct = eff.stacksDefPct.base + (eff.stacksDefPct.perLv || 0) * ((source.cardLv || 1) - 1);
          stacks = Math.max(1, Math.round((source.defense || 0) * pct / 100));
        }
        /* 力量/力量降低：点数=层数，每层 1 点（用户 2026-10-02 口径）——perCalc/perFlat 的点数转为层数 */
        const isStrength = eff.buffId === "buff_strength" || eff.buffId === "debuff_strength_down";
        if (isStrength && per != null) {
          stacks = Math.max(1, Math.round(per));
          per = 1;
        }
        /* 灵塑专属（T41）：力量获取效果提高（杜勒赛因[团队]/雷娅[自身]）——正力量层数 ×(1+X%)。
         * ⚠仅覆盖卡牌路径；钥令/命轮等其它力量来源的加成未覆盖（登记 DATA-TODO） */
        if (eff.buffId === "buff_strength" && typeof Spirit !== "undefined") {
          stacks = Math.max(1, Math.round(stacks * Spirit.strGainMult(source)));
        }
        for (const t of ts) Buffs.add(t, eff.buffId, stacks, eff.duration, card.name, per);
        break;
      }
      case "dispel": {
        const t = eff.target === "self" ? source : target;
        if (!t) break;
        const removed = t.buffs.filter(x => State.getBuff(x.defId)?.kind === eff.kind);
        for (const r of removed) Log.add(`${t.def.name} 的 ${State.getBuff(r.defId).name} 被驱散`, "sys");
        t.buffs = t.buffs.filter(x => State.getBuff(x.defId)?.kind !== eff.kind);
        break;
      }
      case "guku": {
        /* 打击/防御类卡：卡牌等级每升一级额外+1狂气；perLv=每级成长值
         * perSpend（T32 追加批：不定壁垒）：狂气 = perSpend × X 费实耗算力（b.xSpend） */
        const lvBonus = (card && /^(基础)?(打击|防御)$/.test(card.name || "")) ? (source.cardLv || 1) - 1 : 0;
        const lvGrow = (eff.perLv || 0) * (source.cardLv || 1) - (eff.perLv || 0);
        let gv = eff.perSpend != null ? eff.perSpend * (State.battle.xSpend || 0) : eff.value;
        /* 固有天赋（T40）：attrCardGuku 族——珊/索蕾尔「每 1 点 X 属性，基础卡狂气 +Y 点」 */
        if (typeof State.talentGukuBonus === "function") {
          gv += State.talentGukuBonus(source, card);
        }
        /* T55 启灵卡牌修正：该卡狂气 +N 点 / 提高 X% */
        if (typeof State.enlightenMods === "function") {
          for (const em of State.enlightenMods(source, card.name)) {
            if (em.guku) gv += em.guku;
            if (em.gukuPct) gv = Math.round(gv * (1 + em.gukuPct / 100));
          }
        }
        source.guku = Math.min(source.gukuMax || 100, source.guku + gv + lvBonus + lvGrow);
        break;
      }
      case "gukuAllies":
        for (const a of State.battle.allies) {
          if (a !== source) a.guku = Math.min(a.gukuMax || 100, a.guku + eff.value);
        }
        Log.add(`其他唤醒体各获得 ${eff.value} 点狂气`, "sys");
        break;
      case "silver": {
        /* chargePct（T32 建模批）：银钥能量=银钥充能面板×X%（超维角色通用） */
        const charge = source.stats ? (source.stats.silverKeyCharge || 0) : 0;
        const sv = eff.value != null ? eff.value : Math.round(charge * (eff.chargePct || 0) / 100);
        State.battle.silver += sv;
        Log.add(`获得银钥能量 ${sv}${eff.chargePct != null ? `（银充${charge}×${eff.chargePct}%）` : ""}（当前 ${State.battle.silver}/1000）`, "sys");
        break;
      }
      case "dice": {
        /* T56 闪耀偏方骰：掷 6 面骰 → 临时力量=点数×11（6点翻倍+1算力）；≥4 虚弱易伤全体 1 回合 */
        const roll = 1 + Math.floor(Math.random() * 6);
        let sv = roll * 11;
        if (roll >= 6) sv *= 2;
        Buffs.add(source, "buff_strength", 1, 1, "闪耀偏方骰", sv);
        Log.add(`🎲 偏方骰掷出 ${roll} 点 → 临时力量 +${sv}${roll >= 6 ? "（6点翻倍）+1 算力" : ""}`, "good");
        if (roll >= 6) State.battle.energy += 1;
        if (roll >= 4) {
          for (const e of State.battle.enemies) if (e.hp > 0) {
            Buffs.add(e, "debuff_weak", 1, null, "闪耀偏方骰");
            Buffs.add(e, "debuff_vul", 1, null, "闪耀偏方骰");
          }
        }
        break;
      }
      case "energy": {
        /* 星辰篇·算力满盈（T48）：算力可超 10，>12 的超出部分自动转 300% 队伍平均银充的银钥 */
        if (State.starEnv) {
          State.battle.energy += eff.value;
          State.clampEnergyStar();
          Log.add(`${source.def.name} 获得 ${eff.value} 点算力（当前 ${State.battle.energy}）`, "sys");
        } else {
          State.battle.energy = Math.min(10, State.battle.energy + eff.value);
          Log.add(`${source.def.name} 获得 ${eff.value} 点算力（当前 ${State.battle.energy}）`, "sys");
        }
        break;
      }
      case "draw":
        this.draw(eff.value);
        break;
      case "tentacle":
        source.tentacles += eff.value;
        Log.add(`${source.def.name} 获得触腕 ×${eff.value}（当前 ${source.tentacles} 条）`, "good");
        break;
      case "tentacleGain":
        /* 触腕池 +N（螺湮圆舞潮涌等：生成 1 条触腕）——T32 实测批 */
        if (typeof Tentacle !== "undefined" && State.battle && State.battle.tentacle) {
          State.battle.tentacle.count += eff.value;
          Log.add(`🐙 触腕 +${eff.value}（当前 ${State.battle.tentacle.count} 条）`, "good");
        }
        break;
      case "tentacleDmg":
        /* 临时触腕伤害：触腕伤害 +[攻×X%]（T32 实测批） */
        if (typeof Tentacle !== "undefined") Tentacle.addTempDmg(source, eff.pct);
        break;
      case "heal": {
        const t = eff.target === "ally" ? target : source;
        let v = (eff.value || 0) + (eff.perLv || 0) * ((source.cardLv || 1) - 1);
        /* pctConstitution：按施放者体质%回复——实战用**实战体质**（constitutionCombat，含灵塑），
         * 卡面（describeEffects raw）用面板体质。三段链（2026-10-03 用户三次校准定案，Wiki 基数 15）：
         * pct=30%×1.33(启灵①)=39.9% → v=ceil(体质×39.9%) → ×(1+狂充×0.5%)(灵知解构，面板44已含天赋)
         * 朵尔 Lv70灵格1灵塑10 persona12 cardLv6 → 卡面 ceil(41×1.072)=44、实战 ceil(54×1.072)=58 ✓ */
        if (eff.pctConstitution != null) {
          let pct = eff.pctConstitution + (eff.perLv || 0) * ((source.cardLv || 1) - 1);
          /* 启灵①纯粹理性：外域手术 治疗量提高33%（30×1.33=39.9，小数保留由 heal ceil 收口） */
          if (card && card.name === "外域手术" && source.enlightenOn && source.enlightenOn[0] === true) {
            pct = pct * 1.33;
          }
          v = Math.ceil((source.stats?.constitutionCombat || source.stats?.constitution || 0) * pct / 100);
        }
        /* 天赋钩子（T38 F，已由游戏锚点证实 2026-10-03：卡面44=41×1.072 含灵知解构）：朵尔 灵知解构——
         * 每1点狂气回充等级，「外域手术」「等价交换」回复+0.5%（乘在 heal 取整值上） */
        const tk = State.TALENT_HOOKS && State.TALENT_HOOKS[source.def.id];
        if (tk && tk.healUpPerGuku && card && (card.name === "外域手术" || card.name === "等价交换") && v > 0) {
          const before = v;
          v = Math.ceil(v * (1 + (source.stats?.gukuRecharge || 0) * tk.healUpPerGuku));
          if (v !== before) Log.add(`✦ 天赋「灵知解构」：狂气回充 ${source.stats?.gukuRecharge || 0} → 回复 ${before}→${v}`, "good");
        }
        /* T55 启灵卡牌修正：该卡回复效果提高X% */
        if (typeof State.enlightenMods === "function") {
          for (const em of State.enlightenMods(source, card.name)) {
            if (em.healPct) v = Math.ceil(v * (1 + em.healPct / 100));
          }
        }
        if (t && v > 0) Damage.heal(t, v, card.name);
        break;
      }
      case "discardHeal": {
        /* 等价交换（T39 朵尔缺牌批）：弃掉所有手牌（不含本卡），每弃 1 张额外回复 体质×X% 生命。
         * 粒度=合计后一次取整（逐张取整/聚合 ceil 无锚点区分，待实测） */
        const bEX = State.battle;
        if (!bEX) break;
        const others = bEX.piles.hand.filter(c => !inst || c.uid !== inst.uid);
        const conEX = source.stats?.constitutionCombat || source.stats?.constitution || 0;
        const pctEX = (eff.pctConstitution || 0) + (eff.perLv || 0) * ((source.cardLv || 1) - 1);
        const extra = Math.ceil(conEX * pctEX * others.length / 100);
        for (const c of others) this._move(c.uid, "discard");
        if (extra > 0) Damage.heal(source, extra, card.name);
        Log.add(`弃掉 ${others.length} 张手牌，额外回复 ${extra} 点生命${eff.perLv ? "" : ""}`, "sys");
        break;
      }
      default:
        Log.add(`⚠ 未实现的效果类型: ${eff.op}`, "sys");
    }
  },

  /* 狂气爆发按钮：不走卡牌直接释放该角色的狂气爆发效果
   * 狂气≥100 可释放；满上限（200）释放 = 超限爆发（专属强化待逐角色实现） */
  releaseBurst(ally) {
    const b = State.battle;
    if (!b || b.phase !== "play") { alert("当前不在出牌阶段"); return; }
    if (!ally || ally.guku < 100) { alert("狂气不足 100，无法释放狂气爆发"); return; }
    const burstDef = DBF.cards.find(c => c.owner === ally.def.id && c.type === "狂气爆发");
    if (!burstDef) { alert(`${ally.def.name} 没有狂气爆发卡定义`); return; }
    const isOverdrive = ally.gukuMax > 100 && ally.guku >= ally.gukuMax;
    const pre = ally.guku;
    Log.add(`<b>⚡ ${ally.def.name} 释放${isOverdrive ? "【超限爆发】" : "狂气爆发"}</b>（消耗狂气 ${pre}）`, "sys");
    for (const eff of burstDef.effects) this.resolveEffect(eff, ally, null, burstDef);
    /* 官方词条（2026-09-23）：释放狂气爆发后剩余狂气减半（超限，按释放时刻值）；普通爆发清零 */
    ally.guku = isOverdrive ? Math.floor(pre / 2) : 0;
    /* 狂气回冲（词条 2026-09-28）：每次释放狂气爆发后获得 X 点狂气（按面板狂气回充等级查表衰减） */
    const rcLevel = (ally.stats && ally.stats.gukuRecharge) || 0;
    if (rcLevel > 0) {
      const bonus = State.rechargeBonus(rcLevel);
      if (bonus > 0) {
        ally.guku = Math.min(ally.gukuMax || 100, ally.guku + bonus);
        Log.add(`⚡ 狂气回冲：${ally.def.name} 获得 ${bonus} 点狂气（回充等级 ${rcLevel}）`, "sys");
      }
    }
    Log.add(`${ally.def.name} 狂气剩余 ${ally.guku}${isOverdrive ? "（超限减半）" : ""}`, "sys");
    /* T57 超限爆发逐角色（docs/OVERDRIVE.md）：gukuMax=200 攒满释放触发专属效果——立即生效子集 */
    if (isOverdrive && State.OVERDRIVE_HOOKS && State.OVERDRIVE_HOOKS[ally.def.id] && typeof State.OVERDRIVE_HOOKS[ally.def.id].run === "function") {
      try { State.OVERDRIVE_HOOKS[ally.def.id].run(ally, b); } catch (e) { Log.add(`⚠ 超限效果异常: ${e.message}`, "sys"); }
    }
    /* 星辰篇·狂气调和（T48）：每次释放狂气爆发后基础狂气 +10；记录本回合已爆发（回合末未爆发者转银钥）。
     * 「狂气百分比提高效果减半」未建模——引擎现无「狂气获取提高X%」类词条，登记 DATA-TODO */
    if (State.starEnv) {
      b.burstUsedThisTurn = b.burstUsedThisTurn || [];
      if (!b.burstUsedThisTurn.includes(ally.uid)) b.burstUsedThisTurn.push(ally.uid);
      ally.guku = Math.min(ally.gukuMax || 100, ally.guku + 10);
      Log.add(`⭐ 狂气调和：${ally.def.name} 基础狂气 +10（当前 ${ally.guku}）`, "good");
    }
    /* 触腕集结（T7）：深海队爆发后 +1 层（回合末每层驱使 1 条触腕；深海精通概率额外层） */
    if (typeof Tentacle !== "undefined") Tentacle.onBurst(ally);
    /* 胚胎吞噬（血肉·猩红献祭）：血肉唤醒体爆发消耗手牌胚胎，触发护盾+力量 */
    if (typeof RealmSys !== "undefined") RealmSys.onBurst(ally);
    /* 命轮爆发钩子（T8）：巨人之刃爆伤+60%/神王的颂歌他人获6狂气/致挚友/心之壁垒/圣火等（pre=本次狂气消耗） */
    if (typeof Wheels !== "undefined") Wheels.onBurst(ally, pre);
    /* 关卡造物爆发钩子（T50）：美丽瞬间银钥/重锁临时力量 */
    if (typeof LevelRelics !== "undefined") LevelRelics.onBurst(ally);
    Turn.checkEnd();
    State.notify();
  }
};
