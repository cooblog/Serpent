# 文件夹与合集外观（图标 / emoji / 色板）

日期：2026-09-16  
状态：第一批已落地；APPEAR-001 / APPEAR-002 / APPEAR-003 人类验收通过。同步见 `Serpent-d94310`。  
工单：见文末

## 1. 产品决定

用户可为下列实体选择**一份外观**：

- 资源库文件夹（ManagedFolder）
- 链接文件夹（LinkedFolder 根）
- 合集（Collection）
- 智能合集（SmartCollection）

外观由两部分组成，均可清空恢复默认：

1. **图形**：从产品**预先挑选**的 emoji 集合，或预先挑选的装饰图标集合中选一个。不是系统 emoji 全盘、也不是现有功能图标全集（禁止把 `trash` / `settings` / `close` 等操作图标当作家装）。
2. **颜色**：从产品**色板**中选一个色标。色标是命名 token，必须在亮色/暗色主题下都可读；禁止把任意 `#rrggbb` 写进界面样式当硬编码 fallback。

工作区**标签页**必须沿用该实体当前外观（与侧栏同一数据，不另存一份）。

**不做**：画布上的文件夹卡片（FolderBrowseEntry 封面口袋那张卡）不显示自定义图标或颜色。

## 2. 呈现范围

必须沿用外观：

- 侧栏「文件夹 / 合集 / 智能合集」行
- 工作区标签页
- 已经用类型图标表示同一实体的选择/移动/快捷访问列表（避免侧栏是自定义、菜单里又变回默认）

链接文件夹在自定义图形之后仍须表达「这是链接」：保留断链/离线态，在线链接用徽章或叠加，不得用自定义图形单独顶掉 REQ-NAV-004 的链接可识别性。

链接树里**没有独立稳定 ID** 的虚拟子目录不写外观，继续用默认文件夹图标。

## 3. 数据

外观是库内用户元数据，不是磁盘目录属性。改外观不得触发文件夹重命名或移动。

建议字段（迁移只加不改，可空即默认）：

- `appearance_glyph_kind`：`emoji` | `icon` | NULL
- `appearance_glyph_value`：单个 emoji 或装饰图标 id（必须落在允许清单内）
- `appearance_color_id`：色板 id 或 NULL

未知或非法值按默认外观显示，不得让资源库打不开。

本轮**不**把此外观写入 WebDAV sidecar。合集成员工同步本来就未覆盖；外观同步见 P0 `Serpent-d94310`。

## 4. 交互

右键菜单增加「图标与颜色…」（或同等短文案），打开与现有 `MenuSurface` / 主题 token 一致的面板：色板点选 + emoji 网格 + 装饰图标网格 + 清除。不要自造 tooltip，不要硬编码颜色 fallback。

选取清单在实现时固化为一份共享目录（emoji 字面量 + 装饰 `IconName` 子集 + 色板 id）。清单变更视为产品改动，需同步测试。

## 5. 验收口径

- 资源库相关改动必须完整跑 `npm run test:library-availability`。
- 旧库打开自动迁移；空外观的旧数据看起来与现在一致。
- 标签页与侧栏图形、颜色一致；改完立即反映，重启后仍在。
- 画布文件夹卡片外观与改前一致。
- 链接文件夹仍能从图标识别链接/离线。
- packaged / Windows 无证据则写未验证。
- 清单条目在实现提交时再写入 `human-acceptance-checklist.md`，本文件只定规格。

## 6. 工单

- `Serpent-df3049`：总单
- `Serpent-9d24c0`：外观存储与协议（可立即开始）
- `Serpent-d130b5`：选取器与导航呈现（含标签页、链接徽章、智能合集）；被 `Serpent-9d24c0` 阻塞
- `Serpent-d94310`：P0 同步外观（sidecar 目前只有资产级元数据）

## 7. 预选图形清单（产品固化）

选取器只展示下列两份清单。实现时落成共享目录（emoji 字面量 + 装饰图标 id），未知值按默认外观。清单变更视为产品改动。

挑选口径：面向游戏美术 / 影视后期 / 平面 UI / 品牌设计的**资产分类**；小尺寸侧栏可读；跨 Windows/macOS 常见字形；**不含**旗帜、肤色变体、以及 `trash` / `settings` / `close` / `search` / `plus` 等操作图标。

Emoji 是系统字形、不进安装包，清单可以更宽，约 200 个常用项（含表情）。装饰图标每条都是描边 path，仍保持精选；另含一组抽象符号（心、星、几何形等）。

### 7.1 Emoji（200）

按分类排列，选取器可按此分组，不必再排序。

**表情**
😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤓 😎 🥳 🤔 😐 🙄 😏 😴 😪 🥺 😢 😭 😤 😡 🤬 🤯 😈 💀 💩 🤡 👻 👽 😺

**手势**
👋 🤚 ✋ 👌 ✌️ 🤞 🤟 🤘 🤙 👍 👎 ✊ 👊 👏 🙌 🤝 🙏 💪 🫶 👀

**心情**
❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💖 💗 💘 💝 ❣️ 💞 💓 ✨ 🌟 💫 💯 💢 💤

**符号**
✅ ❌ ❓ ❗ ⭕ 🚫 ⚠️ 💬 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪

**媒介与创作**
🎨 🖼️ 🎬 🎥 📷 📹 🎞️ 📺 🎵 🎶 🎧 🎤 🎹 🎸 🥁 📻 📡 🔦 💡 🕯️

**设计工具**
✏️ 🖊️ 🖌️ 📐 📏 ✂️ 📎 📌 📍 🔑 🔒 💎

**技术与游戏**
💻 🖥️ 📱 ⌨️ 🎮 🕹️ 🎲 🧩 🎯 🏆 ⚔️ 🛡️ 🚀 🤖 👾 💾

**自然**
🌲 🌸 🌻 🍀 🍁 🌙 ☀️ ⭐ 🌈 🔥 💧 ❄️ 🌊 ⛰️ 🏝️ 🌍

**动物**
🐶 🐱 🦊 🐻 🐼 🐯 🦁 🐸 🐧 🦋 🐝 🐙

**场所与物件**
🏠 🏢 🏭 🏰 🚗 ✈️ 🚢 🚂 ⛺ 🎒 💼 🎁 👑 📦 🛒 🏷️

**角色**
👤 👥 🧙 🧚 🦸 🥷 👷 👶

字面量数组（实现用，顺序与上表一致）：

```
😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤓 😎 🥳 🤔 😐 🙄 😏 😴 😪 🥺 😢 😭 😤 😡 🤬 🤯 😈 💀 💩 🤡 👻 👽 😺
👋 🤚 ✋ 👌 ✌️ 🤞 🤟 🤘 🤙 👍 👎 ✊ 👊 👏 🙌 🤝 🙏 💪 🫶 👀
❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💖 💗 💘 💝 ❣️ 💞 💓 ✨ 🌟 💫 💯 💢 💤
✅ ❌ ❓ ❗ ⭕ 🚫 ⚠️ 💬 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪
🎨 🖼️ 🎬 🎥 📷 📹 🎞️ 📺 🎵 🎶 🎧 🎤 🎹 🎸 🥁 📻 📡 🔦 💡 🕯️
✏️ 🖊️ 🖌️ 📐 📏 ✂️ 📎 📌 📍 🔑 🔒 💎
💻 🖥️ 📱 ⌨️ 🎮 🕹️ 🎲 🧩 🎯 🏆 ⚔️ 🛡️ 🚀 🤖 👾 💾
🌲 🌸 🌻 🍀 🍁 🌙 ☀️ ⭐ 🌈 🔥 💧 ❄️ 🌊 ⛰️ 🏝️ 🌍
🐶 🐱 🦊 🐻 🐼 🐯 🦁 🐸 🐧 🦋 🐝 🐙
🏠 🏢 🏭 🏰 🚗 ✈️ 🚢 🚂 ⛺ 🎒 💼 🎁 👑 📦 🛒 🏷️
👤 👥 🧙 🧚 🦸 🥷 👷 👶
```

### 7.2 装饰图标（124）

id 对齐 Lucide 命名，描边几何与现有 `Icons.tsx` 一致；**单独成装饰目录**，不把功能图标全集开放给选取器。下列名称若已在 `Icons.tsx`（如 `palette` / `star` / `globe` / `heart`），实现时复用同一 path，不要另画一份。

**抽象**
`heart` `star` `sparkle` `smile` `frown` `meh` `thumbs-up` `thumbs-down` `circle` `square` `triangle` `hexagon` `diamond` `infinity` `asterisk` `hash` `award` `medal` `flag` `bell` `orbit` `atom` `clover` `rainbow`

**媒介**
`image` `images` `camera` `video` `film` `clapperboard` `aperture` `music` `headphones` `mic` `radio` `speaker` `book-open` `newspaper` `file-image` `file-video`

**设计**
`palette` `brush` `pen-tool` `pencil` `type` `pipette` `blend` `layers` `component` `layout-grid` `crop` `frame` `swatch-book`

**游戏与 3D**
`gamepad-2` `dice-5` `puzzle` `target` `trophy` `sword` `shield` `rocket` `bot` `ghost` `skull` `wand-2`

**自然**
`mountain` `trees` `tree-pine` `flower-2` `sun` `moon` `cloud` `snowflake` `flame` `droplet` `waves` `wind` `leaf` `sparkles`

**动物**
`paw-print` `cat` `dog` `bird` `fish` `bug` `rabbit`

**场所**
`home` `building-2` `landmark` `factory` `tent` `map` `map-pin` `compass` `globe`

**交通**
`car` `plane` `ship` `train-front` `bike`

**设备**
`laptop` `monitor` `smartphone` `cpu` `hard-drive` `database`

**物件**
`lightbulb` `zap` `wrench` `hammer` `scissors` `ruler` `gem` `crown` `key` `lock`

**人物与收纳**
`users` `user` `shopping-bag` `briefcase` `backpack` `gift` `calendar` `bookmark`

实现用 id 数组（顺序与上表一致）：

```
heart, star, sparkle, smile, frown, meh, thumbs-up, thumbs-down, circle, square, triangle, hexagon, diamond, infinity, asterisk, hash, award, medal, flag, bell, orbit, atom, clover, rainbow,
image, images, camera, video, film, clapperboard, aperture, music, headphones, mic, radio, speaker, book-open, newspaper, file-image, file-video,
palette, brush, pen-tool, pencil, type, pipette, blend, layers, component, layout-grid, crop, frame, swatch-book,
gamepad-2, dice-5, puzzle, target, trophy, sword, shield, rocket, bot, ghost, skull, wand-2,
mountain, trees, tree-pine, flower-2, sun, moon, cloud, snowflake, flame, droplet, waves, wind, leaf, sparkles,
paw-print, cat, dog, bird, fish, bug, rabbit,
home, building-2, landmark, factory, tent, map, map-pin, compass, globe,
car, plane, ship, train-front, bike,
laptop, monitor, smartphone, cpu, hard-drive, database,
lightbulb, zap, wrench, hammer, scissors, ruler, gem, crown, key, lock,
users, user, shopping-bag, briefcase, backpack, gift, calendar, bookmark
```

