/* =========================================================
 * UI · 弹窗工具 + 机制面板（词条叠加规则总表 + 待确认清单）
 * ========================================================= */
"use strict";

const Modal = {
  open(title, html) {
    const root = document.getElementById("modal-root");
    /* 同标题弹窗重渲染时保持滚动位置（配置面板加号/开关、管理造物携带等不再跳顶） */
    const prevBody = root.querySelector(".modal .m-body");
    const prevHead = root.querySelector(".m-head");
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    const prevTitle = prevHead ? (prevHead.childNodes[0] ? prevHead.childNodes[0].textContent : "") : "";
    const same = prevTitle === title;
    root.innerHTML = `<div class="modal-mask" onclick="if(event.target===this)Modal.close()">
      <div class="modal">
        <div class="m-head">${title}<button class="m-close" onclick="Modal.close()">✕</button></div>
        <div class="m-body">${html}</div>
      </div></div>`;
    if (same) {
      const body = root.querySelector(".modal .m-body");
      if (body) body.scrollTop = prevScroll;
    }
  },
  close() { document.getElementById("modal-root").innerHTML = ""; }
};

const UIMechanics = {

  open() {
    const unknown = State.collectUnknownRules();
    let html = "";

    /* 伤害管线说明 */
    html += `<div class="m-row"><b style="color:var(--gold)">伤害计算管线（依据社区研究线索搭建，逐区待实测验证）</b>
      <div class="dim">(卡牌基础伤害 × 伤害强效 + 力量) × 增伤状态 × 易伤 × 爆伤<br>
      ①基础值（卡面实测值）→ ②伤害强效区（面板%，独立乘区）→ ③力量区（点数加算）→ ④增伤状态区（强化/虚弱，叠法未知按乘算预估）→ ⑤易伤区（目标侧）→ ⑦取整。<br>
      <span class="tag unknown">unknown</span> 按乘算预估并标黄。逐区对比游戏实测值即可反推公式（用「木桩」怪）。</div></div>`;

    /* 词条表 */
    html += `<div class="m-row"><b style="color:var(--gold)">词条</b></div>
      <table class="mech-table"><tr><th>名称</th><th>范围</th><th>叠加</th><th>推测公式</th><th>确认</th><th>验证方法</th></tr>`;
    for (const t of DBF.terms) {
      html += `<tr><td>${t.name}</td><td>${t.appliesTo}</td>
        <td><span class="tag ${t.stack === "unknown" ? "unknown" : t.stack}">${t.stack}</span></td>
        <td class="dim">${t.formula || ""}</td>
        <td>${t.confirmed ? '<span class="tag add">已确认</span>' : '<span class="tag no">待确认</span>'}</td>
        <td class="dim">${t.howToTest || ""}</td></tr>`;
    }
    html += `</table>`;

    /* buff 表 */
    html += `<div class="m-row"><b style="color:var(--gold)">Buff / Debuff</b></div>
      <table class="mech-table"><tr><th>名称</th><th>类型</th><th>叠加</th><th>效果</th><th>确认</th></tr>`;
    for (const d of DBF.buffs) {
      html += `<tr><td>${d.icon} ${d.name}</td><td>${d.kind === "buff" ? "增益" : "减益"}</td>
        <td><span class="tag ${d.stack === "unknown" ? "unknown" : d.stack}">${d.stack}</span></td>
        <td class="dim">${d.desc}</td>
        <td>${d.confirmed ? '<span class="tag add">已确认</span>' : '<span class="tag no">待确认</span>'}</td></tr>`;
    }
    html += `</table>`;

    /* 待确认清单 */
    html += `<div class="m-row"><b style="color:var(--yellow)">待确认清单（${unknown.length} 条）——实测后在 docs/MECHANICS.md 记录并回填 data/</b></div>
      <ol style="font-size:12px;color:var(--text-dim)">`;
    for (const u of unknown) {
      html += `<li><b>${u.name}</b>（${u.kind}，叠加=${u.stack}）${u.howToTest ? ` —— 验证：${u.howToTest}` : ""}</li>`;
    }
    html += `</ol>`;

    /* 全局机制 */
    html += `<div class="m-row"><b style="color:var(--gold)">全局机制（标注来源者已按 wiki 转录实现）</b></div>
      <table class="mech-table"><tr><th>机制</th><th>框架当前实现</th><th>状态</th></tr>
      <tr><td>每回合算力</td><td>初始 5 点，出牌消耗，上限 10；狂气爆发不耗算力</td><td><span class="tag add">gamekee已转录</span></td></tr>
      <tr><td>每回合抽牌</td><td>4 张</td><td><span class="tag add">gamekee已转录</span></td></tr>
      <tr><td>手牌上限</td><td>10 张</td><td><span class="tag add">gamekee已转录</span></td></tr>
      <tr><td>编队人数</td><td>最多 4 名唤醒体；非混沌只能与同界域+混沌混编</td><td><span class="tag add">已实现</span></td></tr>
      <tr><td>护盾</td><td>回合结束时自动移除；受脆弱影响；有护盾上限（上限值待确认）</td><td><span class="tag no">上限待确认</span></td></tr>
      <tr><td>狂气</td><td>指令牌+5/觉醒牌+25（卡牌 effects 显式给出），满100打爆发并清空（超限减半）；释放后按狂气回充等级查表回冲（RECHARGE_CURVE，2026-09-28 实测）</td><td><span class="tag add">已实现</span></td></tr>
      <tr><td>银钥能量</td><td>打出指令卡每耗1算力获得 X 银钥（按银钥充能等级查表 SILVER_CURVE）；满1000可释放钥令（引擎已实装：携带钥令/尘封旧忆/银钥觉醒，见「钥令」按钮=底部银钥条）</td><td><span class="tag add">已实现</span></td></tr>
      <tr><td>钥令释放规则</td><td>每回合第1次只能释放携带钥令、第2次只能释放尘封旧忆（随机3选1，每钥令每探索限1次、不含携带），不能第3次；1次消耗1000银钥。银钥觉醒置入1张「灵知觉醒」，每获得1张消耗翻倍，银钥可透支为负（2026-09-28 实测）</td><td><span class="tag add">已实现</span></td></tr>
      <tr><td>钥令数值口径</td><td>护盾/生命/力量类 = 物象研究深度×比例、中毒/反击/旧日余烬类 = 灵识研究深度×比例，向上取整（29条图鉴值全部吻合，2026-09-28 破解）；深度在队伍属性面板可调</td><td><span class="tag add">已实现</span></td></tr>
      <tr><td>牌组构成</td><td>每角色 4 指令牌 + 1 灵之觉醒牌，全队共享一个牌堆</td><td><span class="tag no">共享模式待确认</span></td></tr>
      <tr><td>弃牌堆</td><td>回合结束弃手牌；牌堆抽空后洗回（游戏内"回合结束才洗回"的细节待确认）</td><td><span class="tag no">待确认</span></td></tr>
      <tr><td>怪物AI</td><td>按 actions 顺序循环；实际为意图系统（怪物头示下回合行动）</td><td><span class="tag no">简化</span></td></tr>
      <tr><td>怪物数值</td><td>wiki 不收录，需游戏内实测录入 data/enemies.js</td><td><span class="tag no">占位</span></td></tr>
      <tr><td>等级成长公式</td><td>线性：基础 + 成长×(L-1)；有实测 levels 数据则优先</td><td><span class="tag no">待确认</span></td></tr>
      <tr><td>体质→HP换算</td><td>框架按 体质×10 占位；回复类按 体质X%（卡面实测值优先）</td><td><span class="tag no">待确认</span></td></tr>
      </table>`;

    Modal.open("机制面板 · 词条规则与待确认清单", html);
  }
};
