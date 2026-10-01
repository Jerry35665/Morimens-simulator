# 数据收集指南

目标：把 `data/` 里的数据补充完整。所有数据文件是纯 JS（为绕开 file:// 协议的 CORS 限制，不用 JSON），用文本编辑器直接改，刷新页面即生效。

## 数据来源（可靠度从高到低）

| 来源 | 内容 | 备注 |
|---|---|---|
| gamekee wiki `morimens.gamekee.com` | 角色面板/卡牌文本/新手指南/官方公告 | 本框架现有数据的主来源；页面数据来自其后端 API `https://www.gamekee.com/v1/content/detail/{id}`（header `game-id: 50247`） |
| 灰机wiki `morimens.huijiwiki.com` | 怪物图鉴（出招机制）、版本公告、状态说明 | 有反爬（403），用浏览器正常访问 |
| 游戏内截图/抄录 | **一切数值的最终裁判** | wiki 不收录怪物数值；角色高等级数值也建议实测 |
| NGA / 巴哈姆特 / B站攻略 | 机制研究线索 | 属于社区结论，标记待实测 |

原则：**宁可留空 + 注明"待确认"，不要编造数值**。每条数据的 `source` 字段务必填来源。

## 各文件的填写方法

### `data/characters.js` — 唤醒体

```js
{
  id: "char_xxx",            // 唯一ID，建议 char_拼音或英文名
  name: "名字",
  rarity: "SSR",             // R | SR | SSR
  realm: "深海",             // 混沌 | 深海 | 血肉 | 超维
  role: "伤害型",            // 伤害型 | 防御型 | 辅助型
  stats: {                   // 等级1面板（游戏内 角色→详情）
    constitution: 0,         // 体质
    attack: 0, defense: 0,
    critRate: 5, critDmg: 50,// 暴击率% / 暴击伤害%
    gukuRecharge: 0,         // 狂气回充等级
    silverKeyCharge: 0,      // 银钥充能等级
    damageBoost: 0,          // 伤害强效%
    hp: 0                    // 实测HP；没实测就填 体质×10 占位并在 notes 标注
  },
  growth: { hp: 0, attack: 0 },  // 每级成长（成长公式待确认，框架按线性占位）
  levels: null,                  // 有多等级实测值就填 { 1:{hp,attack}, 60:{...} }
  passive: "启灵/被动原文",
  defaultDeck: ["card_xxx_1", ...],  // 4指令牌+1觉醒牌（可按实际配队改）
  source: "gamekee 角色页(id) / 游戏内截图",
  notes: ""
}
```

### `data/cards.js` — 卡牌

照 gamekee 角色页的卡面文字转录，`text` 抄原文，`effects` 按下面操作符翻译成结构：

| effect | 含义 | 示例 |
|---|---|---|
| `{op:"damage", value:N}` | 固定伤害（卡面实际值） | `{op:"damage", value:8}` |
| `{op:"damage", times:N}` | 连击 N 次 | 女王之剑 7×2 |
| `{op:"damage", allEnemies:true}` | 全体敌人 | 恣睢之浪 |
| `{op:"block", value:N}` | 获得护盾（受脆弱影响，回合结束移除） | |
| `{op:"buff", buffId, stacks, per?, duration?, target}` | 挂状态；`per`=点数型每层值（力量N点）；target: self/enemy/ally/all_enemies | 骑士热诚：per:1 |
| `{op:"guku", value:N}` | 获得狂气 | 打击+5 / 觉醒牌+25 |
| `{op:"gukuAllies", value:N}` | 其他我方获得狂气 | 朵尔爆发 |
| `{op:"silver", value:N}` | 获得银钥能量 | 拉蒙娜爆发 |
| `{op:"draw", value:N}` | 抽牌 | |
| `{op:"heal", value:N, target}` | 回复 | |
| `{op:"dispel", kind:"debuff", target:"self"}` | 驱散 | |
| `{op:"tentacle", value:N}` | 触腕（深海界域） | |

注意：`type:"狂气爆发"` 的卡 `cost` 填 0（不耗算力，需狂气 100）。随机目标/变费/次数成长等未实现机制写进 `notes`。

### `data/enemies.js` — 怪物

灰机wiki 只记录机制不记数值 → **HP/攻击需要你游戏内实测后填入**：

```js
{ id:"enemy_xxx", name:"怪物名", tier:"boss"|"normal",
  hp:  { normal: 实测值, hard: 实测值 },
  attack: { normal: 实测值, hard: 实测值 },
  actions: [ {name:"招式名", type:"attack", value:实测伤害, times:1},   // 攻击
             {name:"招式名", type:"buff", buffId, stacks, target} ],   // 强化/给玩家挂debuff
  passives: ["被动原文"], source:"灰机wiki怪物页+游戏内实测", notes:"" }
```

没有实测数值前用「木桩」enemy_dummy 测自己的输出即可。

### `data/buffs.js` / `data/terms.js`

新增 buff 时务必填 `stack`（加算 add / 乘算 mul / 未确认 unknown）和 `confirmed`；新增词条知识在 terms.js 里记录社区结论与验证方法。回填实测结论时：改 `stack`/`confirmed`/`formula`，并在 `docs/MECHANICS.md` 记录实验过程。

## 收集工作流建议

1. 浏览器开 gamekee 角色页 → 抄面板与卡面文字 → 填入 characters.js / cards.js。
2. 刷新 `index.html`，在搜索面板检查新角色显示是否正常、能否进战斗。
3. 遇到 wiki 缺失的字段：先填 `0`/`null` + notes 标注「待确认」，游戏内截图补齐。
4. 每批数据填完跑一遍 `test.html`，确认没有因缺字段导致的报错。
