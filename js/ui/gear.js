/* =========================================================
 * UI · 养成与装备系统
 * ---------------------------------------------------------
 * - UIGear.open(uid)          唤醒体配置面板
 *     等级 / 人格深化(启灵随1/2/3解锁, +4解锁超限爆发) /
 *     灵塑适性Lv / 内在灵格Lv / 疯狂预兆Lv / 命轮×2 / 密契槽×6
 * - UIGear.pickFatewheel / pickPact  选择界面（从仓库/图鉴）
 * - UIGear.renderRelicBar / manageRelics  顶部造物栏
 * - UIGear.openTeamStats      队伍属性面板
 * ========================================================= */
"use strict";

const UIGear = {

  /* ================= 唤醒体配置面板 ================= */
  open(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    const def = u.def;

    let html = `<div class="m-row dim">属性由 等级基础 + 命轮/密契套装/灵塑适性/内在灵格 自动计算：</div>
      <table class="mech-table"><tr><th>体质</th><th>攻击</th><th>防御</th><th>会心率</th><th>会心伤害</th><th>界域精通</th><th>伤害强效</th><th>黑印</th><th>死亡抵抗</th><th>狂气回充</th><th>银钥充能</th></tr>
      <tr>${["constitution", "attack", "defense", "critRate", "critDmg", "realmMastery", "damageBoost", "blackImprint", "deathResist", "gukuRecharge", "silverKeyCharge"]
        .map(k => `<td>${u.stats[k]}</td>`).join("")}</tr></table>`;

    /* 等级 */
    const cap = State.levelCap(u);
    html += `<div class="m-row"><b>等级</b>（上限 ${cap}${cap > 80 ? `：基础80${(u.personaLv || 0) >= 8 ? "+人格深化8再加5" : ""}${(u.personaLv || 0) >= 12 ? "+人格深化12再加5" : ""}` : ""}）：
      <button class="mini-btn" onclick="UIGear.setLevel('${uid}',-1)">-1</button>
      <b>${u.level}</b>
      <button class="mini-btn" onclick="UIGear.setLevel('${uid}',1)">+1</button>
      <button class="mini-btn" onclick="UIGear.setLevel('${uid}',-10)">-10</button>
      <button class="mini-btn" onclick="UIGear.setLevel('${uid}',10)">+10</button>
      <span class="dim">（成长公式待确认：当前按线性占位）</span></div>`;

    /* 人格深化（启灵） */
    const enlightenTxts = (def.passive || "").split(/(?=启灵[①②③])/).filter(s => s.trim());
    const finalLaw = (u.personaLv || 0) >= 12;
    html += `<div class="m-row"><b>人格深化</b>（0~12，获取重复角色提升）：
      <button class="mini-btn" onclick="UIGear.setPersona('${uid}',-1)">-1</button>
      <b>+${u.personaLv || 0}</b>
      <button class="mini-btn" onclick="UIGear.setPersona('${uid}',1)">+1</button>
      <span class="${(u.personaLv || 0) >= 4 ? "" : "dim"}">${(u.personaLv || 0) >= 4 ? "✔ 允许狂气上限200/100（在「调」面板切换）" : "+4 解锁狂气上限200/100切换"}</span>
      <span class="${(u.personaLv || 0) >= 8 ? "" : "dim"}">${(u.personaLv || 0) >= 8 ? "✔ 等级上限+5" : "+8 等级上限+5"}</span>
      <span class="${finalLaw ? "" : "dim"}" title="最终法则：效果待录入">${finalLaw ? "✔ 最终法则已开启（效果待录入）" : "+12 再+5 并开启最终法则"}</span></div>`;
    if (enlightenTxts.length) {
      enlightenTxts.forEach((txt, i) => {
        const unlocked = (u.personaLv || 0) >= i + 1;
        const on = u.enlightenOn[i];
        html += `<div class="m-row" style="font-size:12px;color:${unlocked && on ? "var(--text)" : "var(--text-dim)"}">
          ${!unlocked ? "🔒" : on ? "✔" : "✕"}
          ${txt}
          ${unlocked ? `<button class="mini-btn" style="margin-left:6px;${on ? "color:var(--green);border-color:var(--green)" : ""}"
            onclick="UIGear.toggleEnlighten('${uid}',${i})">${on ? "开" : "关"}</button>` : "（人格深化未达）"}
          </div>`;
      });
    }
    html += `<div class="m-row dim">启灵被动数值结算待逐条实现；开关用于对比测试启灵有无的差距。</div>`;
    if (def.overdrive) html += `<div class="m-row" style="font-size:12px"><span style="color:var(--yellow)">⚡</span> ${def.overdrive}</div>`;
    if (def.finalLaw) html += `<div class="m-row" style="font-size:12px"><span style="color:var(--gold)">▣</span> ${def.finalLaw}</div>`;
    if (def.talent) html += `<div class="m-row" style="font-size:12px"><span class="dim">◈</span> <span class="dim">${def.talent}</span></div>`;

    /* 灵塑适性 / 内在灵格 / 疯狂预兆（等级制） */
    html += `<div class="m-row"><b>灵塑适性</b>（星辰天赋 0~${DBF.spiritAdaptMaxLv}，每级+3%三维，高等级附特殊效果待录入）：
      <button class="mini-btn" onclick="UIGear.setLv('${uid}','spiritAdaptLv',-1)">-</button>
      <b>Lv${u.spiritAdaptLv || 0}</b>
      <button class="mini-btn" onclick="UIGear.setLv('${uid}','spiritAdaptLv',1)">+</button></div>`;
    html += `<div class="m-row"><b>内在灵格</b>（0~${DBF.innerGridMaxLv}，每级等效 <b>+2 等级</b>的基础属性成长）：
      <button class="mini-btn" onclick="UIGear.setLv('${uid}','innerGridLv',-1)">-</button>
      <b>Lv${u.innerGridLv || 0}</b>
      <button class="mini-btn" onclick="UIGear.setLv('${uid}','innerGridLv',1)">+</button>
      <span class="dim">当前等效等级 ${u.level + (u.innerGridLv || 0) * 2}</span></div>`;
    html += `<div class="m-row"><b>疯狂预兆</b>（0~${DBF.omenMaxLv}，全角色通用）：
      <button class="mini-btn" onclick="UIGear.setLv('${uid}','omenLv',-1)">-</button>
      <b>Lv${u.omenLv || 0}</b>
      <button class="mini-btn" onclick="UIGear.setLv('${uid}','omenLv',1)">+</button>
      <span class="dim">${DBF.omenNote}</span></div>`;

    /* 狂气上限切换 */
    html += `<div class="m-row"><b>狂气上限</b>：
      <button class="btn ${u.gukuMax === 100 ? "primary" : ""}" onclick="UIGear.setGukuMaxUI('${uid}',100)">100</button>
      <button class="btn ${u.gukuMax === 200 ? "primary" : ""}" onclick="UIGear.setGukuMaxUI('${uid}',200)">200</button>
      <span class="dim">（人格深化+4 后可切 200；满200释放=超限爆发，也可直接点战场上的「⚡爆发」按钮）</span></div>`;

    /* 卡牌等级 */
    html += `<div class="m-row"><b>卡牌等级</b>（1/6~6/6，基础牌倍率每级+2%）：
      <button class="mini-btn" onclick="UIGear.setCardLv('${uid}',-1)">-</button>
      <b>${u.cardLv || 1}/6</b>
      <button class="mini-btn" onclick="UIGear.setCardLv('${uid}',1)">+</button>
      <span class="dim">打击/防 ×${10 + 2 * ((u.cardLv || 1) - 1)}%、狂气 ${5 + ((u.cardLv || 1) - 1)}</span></div>`;

    /* 命轮 ×2（含叠位调节） */
    html += `<div class="m-row"><b>命轮（最多2个；叠位0~12，属性=基础×(1+叠位/12)）</b></div>`;
    for (let i = 0; i < 2; i++) {
      const fw = u.fatewheels[i] ? State.getFw(u.fatewheels[i]) : null;
      if (!fw) {
        html += `<div class="m-row"><button class="btn" onclick="UIGear.pickFatewheel('${uid}',${i})">（空槽${i + 1}）</button></div>`;
        continue;
      }
      const stacks = (u.fwStacks && u.fwStacks[i]) || 0;
      const statTxt = Object.entries(fw.statMods || {})
        .map(([k, v]) => `${(DBF.statNames || {})[k] || k} ${v}→${Math.round(v * (1 + stacks / 12) * 100) / 100}`)
        .join("，");
      html += `<div class="m-row" style="font-size:12px">
        <button class="btn" style="border-color:var(--purple)" onclick="UIGear.pickFatewheel('${uid}',${i})">◈ ${fw.name}</button>
        <button class="mini-btn" onclick="UIGear.unsetFatewheel('${uid}',${i})">卸下</button>
        叠位 <button class="mini-btn" onclick="UIGear.setFwStacks('${uid}',${i},-1)">-</button>
        <b>${stacks}</b>
        <button class="mini-btn" onclick="UIGear.setFwStacks('${uid}',${i},1)">+</button>
        ${statTxt ? `<span class="dim">${statTxt}</span>` : '<span class="dim">无属性词条</span>'}
        </div>`;
    }

    /* 密契槽 ×6（套装制）+ 套装结合 */
    const counts = State.pactSetCounts(u);
    html += `<div class="m-row"><b>密契（6部位，同一套装凑3/6件激发效果）</b></div><div class="m-row" style="display:flex;flex-wrap:wrap;gap:4px">`;
    for (let i = 0; i < 6; i++) {
      const p = u.pacts[i] ? State.getPact(u.pacts[i]) : null;
      html += `<button class="btn" style="font-size:11px;${p ? "border-color:var(--gold)" : ""}"
        onclick="UIGear.pickPact('${uid}',${i})">${p ? p.name : `空${i + 1}`}</button>`;
    }
    html += `</div>`;
    const actives = State.activePactBonuses(u);
    if (actives.length) {
      html += `<div class="m-row" style="font-size:12px">`;
      for (const a of actives) {
        const isBound = !!(u.pactSetBound && u.pactSetBound[a.set]);
        html += `<div>✔ <b>${a.set}</b>（${a.tier}，${a.pieces}件）：${a.text}
          <button class="mini-btn" style="${isBound ? "color:var(--green);border-color:var(--green)" : ""}"
            onclick="UIGear.toggleSetBound('${uid}','${a.set}')">${isBound ? "✔ 结合" : "结合(+50%)"}</button></div>`;
      }
      html += `</div>`;
    }
    html += `<div class="m-row dim">当前件数：${Object.entries(counts).map(([id, n]) => `${(State.getPact(id) || {}).name || id}×${n}`).join("、") || "无"}</div>`;
    /* 套装方案：一键装备/卸下 */
    const presets = JSON.parse(localStorage.getItem("morimens_pact_presets") || "{}");
    html += `<div class="m-row"><b>套装方案</b>：
      <input id="col-preset-name" class="col-in" style="flex:0 0 110px" placeholder="方案名">
      <button class="mini-btn" onclick="UIGear.savePactPreset('${uid}')">存为方案</button></div>
      <div class="m-row" style="font-size:11px">`;
    for (const [pname, slots] of Object.entries(presets)) {
      html += `<button class="btn" style="font-size:11px" onclick="UIGear.applyPactPreset('${uid}','${pname}')">▣ ${pname}</button>
        <button class="mini-btn" onclick="UIGear.unequipPactPreset('${uid}','${pname}')">卸下</button>
        <button class="mini-btn" onclick="UIGear.delPactPreset('${pname}')">删方案</button> `;
    }
    html += `</div>`;

    Modal.open(`养成配置 · ${def.name}`, html);
  },

  setLevel(uid, d) {
    const u = State.findUnit(uid);
    if (!u) return;
    const cap = State.levelCap(u);
    u.level = Math.max(1, Math.min(cap, u.level + d));
    State.refreshAlly(u);
    Log.add(`${u.def.name} 等级调整为 ${u.level}（HP ${u.maxHp} / 攻击 ${u.stats.attack}）`, "sys");
    this.open(uid);
  },

  toggleEnlighten(uid, i) {
    const u = State.findUnit(uid);
    if (!u) return;
    if ((u.personaLv || 0) < i + 1) { Log.add(`${u.def.name} 人格深化未达 +${i + 1}，启灵${["一", "二", "三"][i] || i + 1}未解锁`, "sys"); return; }
    u.enlightenOn[i] = !u.enlightenOn[i];
    Log.add(`${u.def.name} 启灵${["①", "②", "③"][i] || i + 1} ${u.enlightenOn[i] ? "启用" : "停用"}（数值结算待逐条实现）`, "sys");
    this.open(uid);
  },

  setPersona(uid, d) {
    const u = State.findUnit(uid);
    if (!u) return;
    u.personaLv = Math.max(0, Math.min(12, (u.personaLv || 0) + d));
    State.refreshAlly(u);
    this.open(uid);
  },

  setGukuMaxUI(uid, max) {
    const u = State.findUnit(uid);
    if (!u) return;
    State.setGukuMax(u, max);
    this.open(uid);   // 立即刷新配置面板
  },

  setCardLv(uid, d) {
    const u = State.findUnit(uid);
    if (!u) return;
    u.cardLv = Math.max(1, Math.min(6, (u.cardLv || 1) + d));
    State.refreshAlly(u);
    this.open(uid);
  },

  setLv(uid, field, d) {
    const u = State.findUnit(uid);
    if (!u) return;
    const maxes = { spiritAdaptLv: DBF.spiritAdaptMaxLv || 8, innerGridLv: DBF.innerGridMaxLv || 10, omenLv: DBF.omenMaxLv || 3 };
    u[field] = Math.max(0, Math.min(maxes[field], (u[field] || 0) + d));
    State.refreshAlly(u);
    this.open(uid);
  },

  /* ================= 命轮选择（按主属性筛选） ================= */
  fwFilter: "all",   // 当前筛选的主属性种类

  pickFatewheel(uid, slot) {
    const u = State.findUnit(uid);
    if (!u) return;
    const statLabel = (k) => (DBF.statNames || {})[k] || k;
    let html = `<div class="m-row"><b>按主属性筛选</b>：
      <select onchange="UIGear.fwFilter=this.value;UIGear.pickFatewheel('${uid}',${slot})">
        <option value="all" ${this.fwFilter === "all" ? "selected" : ""}>全部</option>
        ${Object.keys(DBF.subStatMax || {}).map(k => `<option value="${k}" ${this.fwFilter === k ? "selected" : ""}>${statLabel(k)}</option>`).join("")}
        <option value="none" ${this.fwFilter === "none" ? "selected" : ""}>无属性词条</option>
      </select>
      <span class="dim">叠位在「⚙配置」面板的命轮槽上调（属性=基础×(1+叠位/12)）</span></div>`;
    html += `<div class="m-row dim">为 <b>${u.def.name}</b> 的命轮槽${slot + 1} 选择（战斗效果待逐条实现）：</div>`;
    const statKeys = Object.keys(DBF.subStatMax || {});
    for (const fw of DBF.fatewheels) {
      const mainStat = statKeys.find(k => fw.statMods && fw.statMods[k]);
      if (this.fwFilter === "none" && mainStat) continue;
      if (this.fwFilter !== "all" && this.fwFilter !== "none" && mainStat !== this.fwFilter) continue;
      const statTxt = Object.entries(fw.statMods || {}).map(([k, v]) => `${statLabel(k)}+${v}`).join("，");
      html += `<div class="m-row">
        <button class="btn" onclick="UIGear.setFatewheel('${uid}',${slot},'${fw.id}')">◈ ${fw.name}</button>
        <span class="si-tag r-${fw.rarity}">${fw.rarity}</span>
        ${mainStat ? `<span class="tag mul">${statLabel(mainStat)}</span>` : '<span class="tag no">无主属性</span>'}
        <div class="dim" style="font-size:11px">${statTxt ? `词条：${statTxt}<br>` : ""}${fw.effect}</div></div>`;
    }
    Modal.open(`选择命轮 · ${u.def.name}`, html);
  },

  /* 命轮叠位调节（0~12） */
  setFwStacks(uid, slot, d) {
    const u = State.findUnit(uid);
    if (!u) return;
    if (!u.fwStacks) u.fwStacks = [0, 0];
    u.fwStacks[slot] = Math.max(0, Math.min(12, (u.fwStacks[slot] || 0) + d));
    State.refreshAlly(u);
    this.open(uid);
  },

  setFatewheel(uid, slot, fwId) {
    const u = State.findUnit(uid);
    if (!u) return;
    const fw = State.getFw(fwId);
    if (!fw) return;
    /* 装备规则（2026-10-01 用户实测确认，10-02 重申）：①队伍唯一——同队不能装相同命轮
     * （**每种 SSR 最多 1 个，不论效果有无「队伍唯一」词条**——「队伍唯一」是效果语义非装备例外）；
     * ②每唤醒体只能装 1 个 SSR，除非已有 SSR 叠位=12（超限因果，+12） */
    const b = State.battle;
    if (b) {
      const dup = b.allies.find(a => a !== u && (a.fatewheels || []).includes(fwId));
      if (dup) { alert(`「${fw.name}」为队伍唯一命轮，${dup.def.name} 已装备`); return; }
    }
    const isSSR = fw.rarity === "SSR";
    if (isSSR) {
      const otherSSR = (u.fatewheels || []).find((id, i) => i !== slot && id && (State.getFw(id) || {}).rarity === "SSR");
      if (otherSSR) {
        const otherIdx = u.fatewheels.indexOf(otherSSR);
        const otherStacks = (u.fwStacks && u.fwStacks[otherIdx]) || 0;
        if (otherStacks < 12) { alert(`「${(State.getFw(otherSSR)).name}」未叠满 12（现 ${otherStacks}）——已有 SSR 需 +12 才能装第二个 SSR`); return; }
      }
    }
    const elsewhere = u.fatewheels.indexOf(fwId);
    if (elsewhere >= 0 && elsewhere !== slot) u.fatewheels.splice(elsewhere, 1);
    u.fatewheels[slot] = fwId;
    u.fatewheels = u.fatewheels.filter(Boolean).slice(0, 2);
    while (u.fatewheels.length < Math.min(2, slot + 1)) u.fatewheels.push(null);
    Log.add(`${u.def.name} 装备命轮「${fw.name}」`, "sys");
    State.refreshAlly(u);
    this.open(uid);
  },

  unsetFatewheel(uid, slot) {
    const u = State.findUnit(uid);
    if (!u) return;
    const fw = State.getFw(u.fatewheels[slot]);
    u.fatewheels.splice(slot, 1);
    State.refreshAlly(u);
    if (fw) Log.add(`${u.def.name} 卸下命轮「${fw.name}」`, "sys");
    this.open(uid);
  },

  /* ================= 密契部位配置（套装 + 主属性 + 强化等级 + 3词条） ================= */
  pickPact(uid, slot) {
    const u = State.findUnit(uid);
    if (!u) return;
    const part = slot + 1;
    const inv = (DBF.pactInventory || {})[part] || [];
    const cur = (u.pactDetails || [])[slot] || {};
    const curSet = u.pacts[slot];

    /* 套装选择 */
    let html = `<div class="m-row"><b>套装</b>（部位${part}仓库）：
      <select onchange="UIGear.setPactSet('${uid}',${slot},this.value)">
        <option value="">（未选）</option>
        ${inv.map(pid => { const p = State.getPact(pid); return p ? `<option value="${pid}" ${curSet === pid ? "selected" : ""}>${p.name}</option>` : ""; }).join("")}
      </select></div>`;
    const curP = curSet ? State.getPact(curSet) : null;
    if (curP) html += `<div class="m-row dim" style="font-size:11px">3件：${curP.bonus3 ? curP.bonus3.text : "—"}<br>6件：${curP.bonus6 ? curP.bonus6.text : "—"}</div>`;

    /* 主属性（部位4选1）+ 强化等级 0-12 */
    const mainOpts = (DBF.mainStatByPart || {})[part] || [];
    html += `<div class="m-row"><b>主属性</b>（部位${part}限定，最大值=词条×2.5）：
      <select onchange="UIGear.setPactDetail('${uid}',${slot},'mainStat',this.value)">
        <option value="">（未选）</option>
        ${mainOpts.map(k => `<option value="${k}" ${cur.mainStat === k ? "selected" : ""}>${(DBF.statNames || {})[k] || k}</option>`).join("")}
      </select>
      强化
      <button class="mini-btn" onclick="UIGear.bumpPactEnhance('${uid}',${slot},-1)">-</button>
      <b>+${cur.enhanceLv || 0}</b>
      <button class="mini-btn" onclick="UIGear.bumpPactEnhance('${uid}',${slot},1)">+</button>
      结合(+50%主属性) <input type="checkbox" ${cur.bound ? "checked" : ""} onchange="UIGear.setPactBound('${uid}',${slot},this.checked)">
      <span class="dim">${cur.mainStat ? `当前值 ${(() => { const sm = (DBF.subStatMax||{})[cur.mainStat]||0; const v = sm*(1+1.5*(cur.enhanceLv||0)/12); return Math.round((cur.bound?v*1.5:v)*100)/100; })()}（初始=满词条，满级=2.5倍）` : ""}</span></div>`;

    /* 词条 1-3（种类任意 + 档位 1-8） */
    const statKeys = Object.keys(DBF.subStatMax || {});
    html += `<div class="m-row"><b>词条 ×3</b>（种类不限，档位 1~8）：</div>`;
    for (let i = 0; i < 3; i++) {
      const sub = (cur.subs || [])[i] || {};
      html += `<div class="m-row" style="font-size:12px">词条${i + 1}：
        <select onchange="UIGear.setPactSub('${uid}',${slot},${i},'stat',this.value)">
          <option value="">（无）</option>
          ${statKeys.map(k => `<option value="${k}" ${sub.stat === k ? "selected" : ""}>${(DBF.statNames || {})[k] || k}</option>`).join("")}
        </select>
        档位
        <button class="mini-btn" onclick="UIGear.bumpPactSub('${uid}',${slot},${i},-1)">-</button>
        <b>${sub.lv || 0}</b>
        <button class="mini-btn" onclick="UIGear.bumpPactSub('${uid}',${slot},${i},1)">+</button>
        <span class="dim">${sub.stat && sub.lv ? `+${((DBF.subStatMax||{})[sub.stat]||0) * sub.lv / (DBF.subStatMaxLv||8)}` : ""}</span></div>`;
    }
    html += `<div class="m-row dim">主属性步长=最大值/12（强化0~12）；词条步长=最大值/8（档位1~8）。数据来源：社区实测。</div>
      <div class="m-row"><button class="btn primary" onclick="UIGear.open('${uid}')">✓ 完成，返回配置</button></div>`;
    Modal.open(`密契部位${part} · ${u.def.name}`, html);
  },

  /* 保存 pactDetails 并刷新 */
  _saveDetail(uid, slot, mut) {
    const u = State.findUnit(uid);
    if (!u) return;
    if (!u.pactDetails) u.pactDetails = [null, null, null, null, null, null];
    const cur = u.pactDetails[slot] || { set: null, mainStat: null, enhanceLv: 0, subs: [null, null, null] };
    if (!cur.subs) cur.subs = [null, null, null];
    mut(cur);
    u.pactDetails[slot] = cur;
    State.refreshAlly(u);
    this.pickPact(uid, slot);
  },

  setPactSet(uid, slot, pactId) {
    this._saveDetail(uid, slot, cur => { cur.set = pactId || null; });
    const u = State.findUnit(uid);
    u.pacts[slot] = pactId || null;
    const p = pactId ? State.getPact(pactId) : null;
    Log.add(`${u.def.name} 密契部位${slot + 1} 套装${p ? `切换为「${p.name}」` : "清空"}`, "sys");
    State.refreshAlly(u);
  },

  setPactDetail(uid, slot, field, value) {
    this._saveDetail(uid, slot, cur => {
      cur.mainStat = field === "mainStat" ? (value || null) : cur.mainStat;
      if (field === "mainStat" && cur.enhanceLv == null) cur.enhanceLv = 0;
    });
  },

  bumpPactEnhance(uid, slot, d) {
    this._saveDetail(uid, slot, cur => {
      cur.enhanceLv = Math.max(0, Math.min(DBF.mainStatMaxLv || 12, (cur.enhanceLv || 0) + d));
      if (cur.enhanceLv > 0 && !cur.mainStat) cur.mainStat = ((DBF.mainStatByPart || {})[slot + 1] || [])[0] || null;
    });
  },

  setPactSub(uid, slot, idx, _field, value) {
    this._saveDetail(uid, slot, cur => {
      cur.subs[idx] = value ? { stat: value, lv: Math.max(1, (cur.subs[idx] || {}).lv || 1) } : null;
    });
  },

  bumpPactSub(uid, slot, idx, d) {
    this._saveDetail(uid, slot, cur => {
      const sub = cur.subs[idx];
      if (!sub || !sub.stat) { Log.add("请先选择词条种类", "sys"); return; }
      sub.lv = Math.max(1, Math.min(DBF.subStatMaxLv || 8, sub.lv + d));
    });
  },

  setPact(uid, slot, pactId) {
    const u = State.findUnit(uid);
    if (!u) return;
    u.pacts[slot] = pactId;
    u.pacts = u.pacts.map(x => x || null);
    const p = State.getPact(pactId);
    Log.add(`${u.def.name} 密契部位${slot + 1} 配置「${p.name}」（当前 ${State.pactSetCounts(u)[pactId] || 0} 件）`, "sys");
    State.refreshAlly(u);
    this.open(uid);
  },

  clearPacts(uid) {
    const u = State.findUnit(uid);
    if (!u) return;
    u.pacts = [];
    Log.add(`${u.def.name} 清空密契`, "sys");
    State.refreshAlly(u);
    this.open(uid);
  },

  setPactBound(uid, slot, on) {
    const u = State.findUnit(uid);
    if (!u) return;
    if (!u.pactDetails) u.pactDetails = [null, null, null, null, null, null];
    if (u.pactDetails[slot]) u.pactDetails[slot].bound = !!on;
    State.refreshAlly(u);
    this.pickPact(uid, slot);
  },

  toggleSetBound(uid, setName) {
    const u = State.findUnit(uid);
    if (!u) return;
    u.pactSetBound = u.pactSetBound || {};
    u.pactSetBound[setName] = !u.pactSetBound[setName];
    Log.add(`${u.def.name} 套装「${setName}」结合 ${u.pactSetBound[setName] ? "开启(效果×1.5)" : "关闭"}`, "sys");
    State.refreshAlly(u);
    this.open(uid);
  },

  /* 套装方案：保存当前6槽 / 一键装备 / 卸下（从槽位移除该方案套装）/ 删除方案 */
  savePactPreset(uid) {
    const u = State.findUnit(uid);
    const input = document.getElementById("col-preset-name");
    const pname = (input && input.value || "").trim();
    if (!pname) { alert("请输入方案名"); return; }
    const presets = JSON.parse(localStorage.getItem("morimens_pact_presets") || "{}");
    presets[pname] = [...(u.pacts || [])];
    localStorage.setItem("morimens_pact_presets", JSON.stringify(presets));
    Log.add(`密契方案「${pname}」已保存`, "sys");
    this.open(uid);
  },

  applyPactPreset(uid, pname) {
    const u = State.findUnit(uid);
    const presets = JSON.parse(localStorage.getItem("morimens_pact_presets") || "{}");
    const slots = presets[pname];
    if (!u || !slots) return;
    u.pacts = [...slots];
    Log.add(`${u.def.name} 一键装备密契方案「${pname}」`, "sys");
    State.refreshAlly(u);
    this.open(uid);
  },

  unequipPactPreset(uid, pname) {
    const u = State.findUnit(uid);
    const presets = JSON.parse(localStorage.getItem("morimens_pact_presets") || "{}");
    const slots = presets[pname] || [];
    u.pacts = u.pacts.map(pid => slots.includes(pid) ? null : pid);
    Log.add(`${u.def.name} 卸下方案「${pname}」的密契`, "sys");
    State.refreshAlly(u);
    this.open(uid);
  },

  delPactPreset(pname) {
    const presets = JSON.parse(localStorage.getItem("morimens_pact_presets") || "{}");
    delete presets[pname];
    localStorage.setItem("morimens_pact_presets", JSON.stringify(presets));
    State.notify();
  },

  /* ================= 顶部造物栏 ================= */
  renderRelicBar() {
    const slots = document.getElementById("relic-slots");
    if (!slots) return;
    slots.innerHTML = "";
    for (const rid of (DBF.relicDeck || [])) {
      const r = State.getRelic(rid);
      if (!r) continue;
      const el = document.createElement("span");
      el.className = "relic-chip";
      el.title = r.effect;
      el.textContent = r.name;
      el.onclick = () => UIGear.manageRelics();
      slots.appendChild(el);
    }
    if (!(DBF.relicDeck || []).length) slots.innerHTML = `<span class="dim">（无造物）</span>`;
  },

  manageRelics() {
    const depths = State.researchDepths();
    let html = `<div class="m-row dim">造物为队伍级装备（幻梦深潜等 roguelike 探索内获得）。
      <b>造物的数值效果与禁忌学识等级挂钩</b>（物象/灵识研究深度决定其力量、护盾、回复、固定伤害类强度，缩放公式待确认）。
      当前禁忌学识等级：<b>${State.tabooLevel()}</b></div>`;
    html += `<div class="m-row">`;
    for (const rid of (DBF.relicDeck || [])) {
      const r = State.getRelic(rid);
      if (r) html += `<button class="btn primary" onclick="UIGear.toggleRelic('${r.id}');">${r.name} ✕</button> `;
    }
    html += `</div><div class="m-row dim">—— 造物库 ——</div>`;
    for (const r of (DBF.relics || [])) {
      const on = (DBF.relicDeck || []).includes(r.id);
      html += `<div class="m-row">
        <button class="btn ${on ? "primary" : ""}" onclick="UIGear.toggleRelic('${r.id}')">${on ? "✔ 已携带" : "+ 携带"}</button>
        <b>${r.name}</b>
        <div class="dim" style="font-size:11px">${r.effect}</div></div>`;
    }
    Modal.open("管理造物", html);
  },

  toggleRelic(id) {
    DBF.relicDeck = DBF.relicDeck || [];
    const i = DBF.relicDeck.indexOf(id);
    if (i >= 0) { DBF.relicDeck.splice(i, 1); Log.add(`卸下造物「${State.getRelic(id).name}」`, "sys"); }
    else { DBF.relicDeck.push(id); Log.add(`携带造物「${State.getRelic(id).name}」`, "sys"); }
    this.renderRelicBar();
    State.notify();
    this.manageRelics();
  },

  /* ================= 队伍属性面板 ================= */
  openTeamStats() {
    const s = State.teamStats();
    const depths = State.researchDepths();
    let html = `<div class="m-row dim">队伍属性：界域精通=各角色之和（攻略口径）；伤害强效/黑印/死抗=均值+造物（口径待确认）：</div>
      <table class="mech-table"><tr><th>界域精通</th><th>伤害强效</th><th>黑印掉落</th><th>死亡抵抗</th><th>禁忌学识等级</th></tr>
      <tr><td>${s.realmMastery}</td><td>${s.damageBoost}%</td><td>${s.blackImprint}%</td><td>${s.deathResist}%</td><td>${s.tabooKnowledge}</td></tr></table>
      <div class="m-row dim">银钥能量：${State.battle ? State.battle.silver : 0}/1000（满1000释放钥令）</div>
      <div class="m-row"><b>守密人等级</b>：<b>${State.keeperLv}</b>（顶栏可调，本地保存）</div>
      <div class="m-row dim">禁忌学识规则（官方）：与守密人等级一致；若编队唤醒体的平均等级 ≥ 守密人等级，则取编队平均等级和守密人等级的均值。</div>
      <div class="m-row"><b>三种研究深度</b>（决定对应效果强度；数值公式待确认，当前显示禁忌学识等级占位）：</div>
      <table class="mech-table"><tr><th>深度</th><th>数值（可调）</th><th>作用</th></tr>
      <tr><td>活体研究深度</td><td>
        <button class="mini-btn" onclick="UIGear.setDepth('live',-10)">-10</button>
        <button class="mini-btn" onclick="UIGear.setDepth('live',-1)">-1</button>
        <b>${depths.live}</b>
        <button class="mini-btn" onclick="UIGear.setDepth('live',1)">+1</button>
        <button class="mini-btn" onclick="UIGear.setDepth('live',10)">+10</button></td>
        <td class="dim">队伍生命 = Σ体质 × 此深度 ÷ 100（向上取整），已生效</td></tr>
      <tr><td>物象研究深度</td><td>
        <button class="mini-btn" onclick="UIGear.setDepth('physical',-10)">-10</button>
        <button class="mini-btn" onclick="UIGear.setDepth('physical',-1)">-1</button>
        <b>${depths.physical}</b>
        <button class="mini-btn" onclick="UIGear.setDepth('physical',1)">+1</button>
        <button class="mini-btn" onclick="UIGear.setDepth('physical',10)">+10</button></td>
        <td class="dim">造物/刻印/钥令造成的力量、触腕伤害、护盾、回复生命、力量降低类效果强度（结算待实现）</td></tr>
      <tr><td>灵识研究深度</td><td>
        <button class="mini-btn" onclick="UIGear.setDepth('spirit',-10)">-10</button>
        <button class="mini-btn" onclick="UIGear.setDepth('spirit',-1)">-1</button>
        <b>${depths.spirit}</b>
        <button class="mini-btn" onclick="UIGear.setDepth('spirit',1)">+1</button>
        <button class="mini-btn" onclick="UIGear.setDepth('spirit',10)">+10</button></td>
        <td class="dim">造物/刻印/钥令造成的固定中毒、固定反击、固定伤害、固定出血类效果强度（结算待实现）</td></tr></table>
      <div class="m-row dim">各角色明细：</div>
      <table class="mech-table"><tr><th>角色</th><th>界域精通</th><th>伤害强效</th><th>黑印</th><th>死亡抵抗</th><th>狂气回充</th><th>银钥充能</th><th>人格深化</th><th>卡牌等级</th></tr>`;
    for (const a of (State.battle ? State.battle.allies : [])) {
      html += `<tr><td>${a.def.name}</td><td>${a.stats.realmMastery}</td><td>${a.stats.damageBoost}%</td><td>${a.stats.blackImprint}%</td><td>${a.stats.deathResist}%</td><td>${a.stats.gukuRecharge}</td><td>${a.stats.silverKeyCharge}</td><td>+${a.personaLv}</td><td>${a.cardLv || 1}/6</td></tr>`;
    }
    html += `</table>
      <div class="m-row dim">死亡抵抗机制：免死保留1点生命并获狂气充能，每触发一次概率减半（队伍共享计数，未实现判定）。</div>`;
    Modal.open("队伍属性", html);
  },

  /* 调整研究深度（持久化；活体深度即时影响队伍生命上限） */
  setDepth(kind, d) {
    const limits = { live: [1, 9999], physical: [1, 99999], spirit: [1, 99999] };
    const [lo, hi] = limits[kind];
    State.depths[kind] = Math.max(lo, Math.min(hi, (State.depths[kind] || 0) + d));
    State.persist();
    if (State.battle) State.syncTeamHp();
    State.notify();
    this.openTeamStats();
  }
};

window.UIGear = UIGear;
