# 2026-09-19 手动创建序列图、Inspector 播放、全选范围与两位补零识别

> 用户反馈三件事，随后补充 P0：固定两位补零在 `09` 之后被拆成另一套序列。
> 工作树内交付，未经用户许可不提交、不推送。

## 1. 手动创建序列图与导入确认窗同一套界面

此前手动「创建序列图」只有帧率输入；导入确认窗已有帧范围、双滑块、帧率和循环预览。没有产品理由分成两套。

手动创建改为：用所选资产生成与导入后成组相同的 offer，打开同一套 `ImageSequenceImportDialog`。标题和主按钮仍是「创建序列图」；「导入单独文件」在创建路径上改为「取消」。检测失败时仍回退到原来的仅帧率窗。

## 2. 单选序列帧时 Inspector 按序列播放

单选序列卡时，右侧大图原先取首/中/末三帧做层叠，和多选普通资产同一套外观。卡片和查看页已经在用 `SequenceFrameCanvas` 循环播放。Inspector 单选序列改为同一套画布播放；多选仍是层叠。

## 3. 全选超过首页加载数时不再报「不在当前范围」

全选会按当前浏览范围拉取全部资产 ID（例如 151），摘要页仍大约 100 条。菜单跳过报告把摘要里找不到的 ID 一律算作 unresolved，脚注写成「将处理 100 / 跳过 51（不在当前范围）」，批量移动/回收站的 process 集合也被截断。

现在以虚拟浏览布局里的 ID 为「当前范围」。还没加载摘要、但属于当前范围的 ID 按可处理项进入移动/回收站集合。只有范围索引里确实没有的 ID 才算 unresolved。索引尚未铺满时，缺摘要的选中项同样按范围内处理，避免刚全选就误跳过。

## 4. 固定两位补零在 09 之后仍是一套（P0）

`parseImageSequenceFileName` 只在数字串带前导 0 时记下 pad 宽度：`01`–`09` 是宽度 2，`10` 没有前导 0 被记成宽度 0。检测按宽度分组，于是 `01`–`09` 和 `10`–`12` 拆开。五位补零在跨过 `00009` 时仍带前导 0（`00010`），所以不容易踩到；到 `10000` 同样会拆。

检测改为先按目录/前缀/扩展名/编号样式归组，再按补零约定拆桶：某一明确 pad 宽度 W 的组，收进「带前导 0 且宽度为 W」的帧，以及「无前导 0 但写出位数恰好为 W」的后续帧（两位的 `10`–`99`，五位的 `10000`–`99999`）。未补零的 `0`–`35` 仍共用宽度 0。`_01` 与 `_001` 仍不混并。

## 5. 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测 | `npx vitest run tests/unit/image-sequence.test.ts tests/unit/menu-skip-report.test.ts tests/unit/image-sequence-import-dialog.test.ts tests/unit/inspector-hero-preview.test.ts tests/unit/post-import-image-sequences.test.ts tests/unit/image-sequence-import.test.ts tests/unit/dialog-escape-stack.test.ts` | 7 files / 62 passed |
| Worker 序列 | `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/image-sequence.test.ts` | 1 file / 19 passed |
| Electron E2E | `node scripts/run-e2e-isolated.mjs tests/e2e/image-sequence-viewer.test.ts` | 1 passed（约 9 s） |

资源库打开/schema 未改，未跑 `test:library-availability`。packaged / Computer Use 未执行。

## 6. 全选后「创建序列图」仍灰（BROWSE-SELECT-SCOPE-001 复验）

跳过报告修好之后，菜单计数看起来像选了 151 项，但「创建序列图」仍要求 `targetAssets.length === targetAssetIds.length`。`targetAssets` 来自已加载摘要（约 100 条），所以全选一个尚未滚完的序列帧文件夹时该项保持灰色，滚完加载才可点。

菜单门禁改为：选中不少于 3 项，且**已经加载**的选中摘要全部是可用、未成组的图片；未加载 ID 不禁用。点击后走 `asset.list` 按 ID 拉取缺少的摘要（Renderer/Worker 上限从 200 提到 10_000，与创建序列帧上限对齐），再生成确认窗 offer。这样确认范围覆盖全部选中帧，而不是只处理首页 100 张。

IMAGESEQ-CREATE-001 / SEQ-INSPECTOR-001 / IMAGESEQ-PAD-001 已由用户本人记为通过。序列帧识别规则另派检查，不阻塞本条修复。

### 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测 | `npx vitest run tests/unit/image-sequence-selection.test.ts tests/unit/protocol.test.ts` | 2 files / 122 passed |

## 7. 序列帧识别规则检查（composer-2.5）

对照 `partitionImageSequenceNumbering`、分组键与调用方：`01`–`12` / `00001`–`10000` 跨 09/10 续跑、未补零 `0`–`35`、`_01` 与 `_001` 分桶，与 §4 及既有单测一致。**没有**与该设计相悖的确定性缺陷。调用方都走 `detectImageSequences` 的 partition 宽度，没有再按单帧 `numericWidth` 分组。

残留（产品歧义 / 展示，不改算法）：

- 同一补零宽度桶里，帧号缺口仍拆成多条连续 run（`01`–`03` 与 `15`–`17` 是两套，不是一套缺帧序列）。
- 已入库展示名从首帧路径重解析 pad；正常序列首帧带前导 0，与检测宽度一致。
- `file099` / `file100` 这种末尾数字启发式仍可能被当成序列。

补了边界单测：`a_10` 归属宽度 2、同前缀补零与未补零共存、仅 `09`–`11`、补零桶内缺口拆段。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 识别边界单测 | `npx vitest run tests/unit/image-sequence.test.ts` | 1 file / 17 passed |
