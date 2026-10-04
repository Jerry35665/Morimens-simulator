/* =========================================================
 * 忘却前夜战斗模拟器 · SKey @@编队分享码（T43）
 * ---------------------------------------------------------
 * 格式规范来源：dansa/SKeyDB（github.com/dansa/SKeyDB，MIT）src/domain/ingame-codec.ts
 *   @@<4×唤醒体token><8×命轮token><4×密契token><1×posse token>@@，空位='a'，token=单字符（最长匹配）
 * 本实现只导入**唤醒体**（角色）：命轮/密契/posse 的 SKeyDB token 无法映射到本库自建 id，一律不硬塞（任务书口径）。
 * 等级：@@码不含等级（SKeyDB decode 同样硬编码 60）——导入后统一按 60 级放置，可再手调。
 * 桥接：SKeyDB ingameId ↔ data/growth.js ingameId（zh 中文名）↔ DBF.characters（name=zh 或 growth.name）。
 * 字典快照：.zcode/raw/skey_tokens.json（SKeyDB awakeners.json 61 条，token 无重复）。
 * ⚠纯文本解析，不碰游戏进程（合规边界不变）。
 * ========================================================= */
"use strict";

const ShareCode = {
  WRAPPER: "@@",

  /* SKeyDB 唤醒体 token 字典（61 条，快照 2026-10-03） */
  TOKENS: [
    { ingameId: "C06", token: "S", name: "\"24\"" },
    { ingameId: "B06", token: "R", name: "Agrippa" },
    { ingameId: "B03", token: "I", name: "Aigis" },
    { ingameId: "C11", token: "F", name: "Alva" },
    { ingameId: "O05", token: "n", name: "Aurita" },
    { ingameId: "O04", token: "L", name: "Caecus" },
    { ingameId: "D09", token: "m", name: "Casiah" },
    { ingameId: "D11", token: "6", name: "Castor" },
    { ingameId: "O09", token: "g", name: "Celeste" },
    { ingameId: "D13", token: "8", name: "Clementine" },
    { ingameId: "O10", token: "5", name: "Corposant" },
    { ingameId: "D02", token: "H", name: "Daffodil" },
    { ingameId: "C02", token: "k", name: "Doll" },
    { ingameId: "B10", token: "xg", name: "Doresain" },
    { ingameId: "D08", token: "U", name: "Erica" },
    { ingameId: "B09", token: "r", name: "Faint" },
    { ingameId: "O03", token: "p", name: "Faros" },
    { ingameId: "C02EX", token: "T", name: "Doll: Inferno" },
    { ingameId: "B05EX", token: "h", name: "Helot: Catena" },
    { ingameId: "C01EX", token: "i", name: "Ramona: Timeworn" },
    { ingameId: "O06", token: "e", name: "Goliath" },
    { ingameId: "D12", token: "X", name: "Hameln" },
    { ingameId: "B05", token: "E", name: "Helot" },
    { ingameId: "D06", token: "A", name: "Horla" },
    { ingameId: "D07", token: "K", name: "Jenkin" },
    { ingameId: "C12", token: "l", name: "Karen" },
    { ingameId: "C16", token: "Z", name: "Kathigu-Ra" },
    { ingameId: "B08", token: "O", name: "Leigh" },
    { ingameId: "C10", token: "v", name: "Lily" },
    { ingameId: "D01", token: "c", name: "Liz" },
    { ingameId: "C04", token: "j", name: "Lotan" },
    { ingameId: "O07", token: "w", name: "Miryam" },
    { ingameId: "C17", token: "xf", name: "Mouchette" },
    { ingameId: "O02", token: "q", name: "Murphy" },
    { ingameId: "O02EX", token: "G", name: "Murphy: Fauxborn" },
    { ingameId: "C07", token: "f", name: "Nautila" },
    { ingameId: "C08", token: "u", name: "Nymphaea" },
    { ingameId: "C03", token: "C", name: "Ogier" },
    { ingameId: "C09", token: "b", name: "Pandia" },
    { ingameId: "B12", token: "9", name: "Pickman" },
    { ingameId: "D14", token: "2", name: "Pollux" },
    { ingameId: "C01", token: "M", name: "Ramona" },
    { ingameId: "C05", token: "V", name: "Ryker" },
    { ingameId: "B02", token: "Q", name: "Salvador" },
    { ingameId: "O08", token: "J", name: "Sanga" },
    { ingameId: "B04", token: "B", name: "Sorel" },
    { ingameId: "C15", token: "W", name: "Tawil" },
    { ingameId: "B01", token: "N", name: "Thais" },
    { ingameId: "D03", token: "o", name: "Tinct" },
    { ingameId: "O01", token: "d", name: "Tulu" },
    { ingameId: "B07", token: "P", name: "Uvhash" },
    { ingameId: "D04", token: "D", name: "Wanda" },
    { ingameId: "D05", token: "t", name: "Winkle" },
    { ingameId: "B14", token: "xh", name: "Xu" },
    { ingameId: "O11", token: "xj", name: "Vortice" },
    { ingameId: "D10", token: "3", name: "Arachne" },
    { ingameId: "B15", token: "xi", name: "Saya" },
    { ingameId: "O13", token: "xo", name: "Pontos" },
    { ingameId: "C04EX", token: "xq", name: "Lotan: Cetarchon" },
    { ingameId: "B11", token: "4", name: "Caraboo" },
    { ingameId: "C03EX", token: "xs", name: "Ogier: Oathbound" }
  ],

  /* token → 本库角色名：ingameId 经 growth.js 桥接 zh；无 growth 条目回落 SKeyDB 英文名匹配 */
  _resolveName(entry) {
    const g = (window.DBF && DBF.growth || []).find(x => x.ingameId === entry.ingameId);
    const zh = g && g.zh;
    const chars = (window.DBF && DBF.characters) || [];
    if (zh) {
      const direct = chars.find(c => c.name === zh);
      if (direct) return { name: direct.name, found: true };
      /* 变体界域前缀（原初·混沌 等）：基础名已在库即视为命中（异格本体另行放置） */
      const loose = chars.find(c => c.name === zh || c.name.endsWith(zh) || zh.endsWith(c.name));
      if (loose) return { name: loose.name, found: true };
    }
    const byEn = chars.find(c => (g && g.name && c.name === g.name));
    if (byEn) return { name: byEn.name, found: true };
    return { name: zh || entry.name, found: false };
  },

  /* 解析 @@码 → { slots:[{token, name, found}×4], warnings:[], raw } */
  decode(code) {
    const raw = String(code || "").trim();
    if (!raw.startsWith(this.WRAPPER) || !raw.endsWith(this.WRAPPER) || raw.length < 6) {
      return { error: "格式无效：应以 @@ 开头并以 @@ 结尾" };
    }
    const payload = raw.slice(2, -2);
    if (payload.length < 17) {   // 最短=4角色a+8命轮a+4密契a+1posse a
      return { error: "payload 过短（" + payload.length + " < 17）" };
    }
    const charTokens = this.TOKENS.map(t => t.token).sort((a, b) => b.length - a.length);
    const slots = [], warnings = [];
    let cursor = 0;
    for (let i = 0; i < 4; i++) {
      const hit = charTokens.find(tk => payload.startsWith(tk, cursor));
      if (!hit) {
        if (payload[cursor] !== "a") warnings.push("槽位 " + (i + 1) + "：未知 token『" + payload[cursor] + "』");
        slots.push({ token: payload[cursor], name: payload[cursor] === "a" ? "（空位）" : "未知角色", found: false });
        cursor += 1;
        continue;
      }
      const entry = this.TOKENS.find(t => t.token === hit);
      const r = this._resolveName(entry);
      slots.push({ token: hit, name: r.name, found: r.found });
      cursor += hit.length;
    }
    /* 剩余段=命轮×8+密契×4+posse：本库不可映射，仅校验长度 */
    const rest = payload.slice(cursor);
    if (rest.length < 13) warnings.push("装备段长度异常（" + rest.length + " < 13），码可能被截断");
    return { slots, warnings, raw };
  },

  /* 场上编队 → @@码：只编码角色 token（命轮/密契/posse 一律 'a' 空位，不硬塞） */
  encode(allies) {
    const byName = (() => {
      const m = {};
      for (const c of ((window.DBF && DBF.characters) || [])) {
        const g = (DBF.growth || []).find(x => x.zh === c.name || x.name === c.name);
        const e = g && this.TOKENS.find(t => t.ingameId === g.ingameId);
        if (e) m[c.name] = e.token;
      }
      return m;
    })();
    const out = [], missing = [];
    for (let i = 0; i < 4; i++) {
      const a = allies[i];
      const tk = a && byName[a.def.name];
      if (a && !tk) missing.push(a.def.name);
      out.push(tk || "a");
    }
    if (missing.length && typeof Log !== "undefined") {
      Log.add(`⚠ 编队码：以下角色无 SKeyDB token，编码为空位——${missing.join("、")}`, "sys");
    }
    return this.WRAPPER + out.join("") + "a".repeat(13) + this.WRAPPER;   // 8命轮a+4密契a+1posse a
  }
};
