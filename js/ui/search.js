/* =========================================================
 * UI · 左侧搜索面板（唤醒体/卡牌/怪物/Buff 四类）
 * ========================================================= */
"use strict";

const UISearch = {
  tab: "characters",
  keyword: "",

  init() {
    document.querySelectorAll("#search-tabs .tab").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll("#search-tabs .tab").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        this.tab = btn.dataset.tab;
        this.render();
      };
    });
    document.getElementById("search-input").oninput = (e) => {
      this.keyword = e.target.value.trim().toLowerCase();
      this.render();
    };
    this.render();
  },

  _match(...fields) {
    if (!this.keyword) return true;
    return fields.some(f => (f || "").toString().toLowerCase().includes(this.keyword));
  },

  render() {
    const box = document.getElementById("search-results");
    box.innerHTML = "";
    const items = this._collect();
    if (!items.length) {
      box.innerHTML = `<div class="search-empty">无匹配结果</div>`;
      return;
    }
    for (const it of items) box.insertAdjacentHTML("beforeend", it);
  },

  _collect() {
    const out = [];
    if (this.tab === "characters") {
      for (const c of DBF.characters) {
        if (!this._match(c.name, c.realm, c.role, c.rarity)) continue;
        out.push(`<div class="search-item">
          <span class="add-btn" onclick="State.addAlly('${c.id}')">+ 添加</span>
          <div class="si-name">${c.name}</div>
          <div class="si-meta">
            <span class="realm-chip realm-${State.realmGroup(c.realm)}">${c.realm}</span>
            · ${c.role}
          </div>
        </div>`);
      }
    } else if (this.tab === "cards") {
      /* 只列 状态牌等非唤醒体牌（通用牌）；唤醒体的专属卡在其角色卡「卡」按钮中生成 */
      for (const c of DBF.cards.filter(x => x.owner === "shared")) {
        if (!this._match(c.name, c.type)) continue;
        const ownerName = c.owner === "shared" ? "通用" : (State.getChar(c.owner) || {}).name || c.owner;
        out.push(`<div class="search-item">
          <span class="add-btn" onclick="Cards.generate('${c.id}')">+ 生成</span>
          <div class="si-name">[${c.cost}] ${c.name}</div>
          <div class="si-meta"><span class="si-tag">${c.type}</span>${ownerName !== "通用" ? `<span class="si-tag">${ownerName}</span>` : ""}</div>
          <div class="si-meta">${c.text}</div>
        </div>`);
      }
    } else if (this.tab === "enemies") {
      for (const e of DBF.enemies) {
        if (!this._match(e.name)) continue;
        const diff = State.battle ? State.battle.difficulty : "normal";
        out.push(`<div class="search-item">
          <span class="add-btn" onclick="State.addEnemy('${e.id}')">+ 添加</span>
          <div class="si-name">${e.name}</div>
          <div class="si-meta">HP ${e.hp[diff]} · 攻击 ${e.attack[diff]}（${diff === "hard" ? "困难" : "普通"}）</div>
          ${e.actions ? `<div class="si-meta dim">行动：${e.actions.map(a => a.name).join("→")}</div>` : ""}
        </div>`);
      }
    }
    return out;
  }
};
