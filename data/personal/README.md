# 个人数据（单独存放）

此目录存放**用户个人账号数据**，与 `data/` 下的通用游戏数据分开维护：

- `characters.js` — 唤醒体练度：账号拥有角色的等级/深化/卡牌等级/预兆/灵塑/灵格/三维/同调（来自游戏内截图整理，2026-09-30 62 张版）
- `fatewheels.js` — 命轮库存：账号拥有的命轮主属性/数值/叠层/效果摘要（来自游戏内截图整理）
- 原始截图：`D:\桌面\忘却前夜\唤醒体\`（61张）、`D:\桌面\忘却前夜\命轮\`（132张）

## 与通用数据的关系

- 通用数据（`data/characters.js` 等）= 游戏全量知识库，所有人通用
- 个人数据（本目录）= "我有什么、练到什么程度"，用于配队指导与资源规划
- 挂 `window.DBF.personal`（`personal.characters` / `personal.fatewheels`），已引入 index.html 与 test.html

## 更新方式

游戏内练度变化后重新截图，替换原截图后让助手重新整理，覆盖 `inventory.js`。

## 公开仓库说明（T36）

- `characters.js` / `fatewheels.js` / `roster-notes.md` 为**个人账号数据，已被 .gitignore 排除，公开仓库不含**
- 新用户：把 `characters.template.js` / `fatewheels.template.js` 复制为同名 `.js` 后按注释格式填入自己的账号数据即可；不放置时模拟器正常运行（个人练度/命轮相关功能为空）
