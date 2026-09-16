# 资产卡片标题区按实际行数计高（瀑布流逐卡自适应、平铺逐行取最大）

日期：2026-09-17
工单：`Serpent-b1b0f2`

## 问题

用户开启卡片显示字段（文件名 / 大小 / 日期 / 分辨率）后报告：本来就没有某类信息的资产
（例如未解码出尺寸的 avif），卡片仍按最多行数预留标题区，多出一条空行把卡片撑高；
平铺视图里整行资产都没有分辨率时，一行的高度也不该保留那一行。

根因：标题区高度是**视图级固定常量**，与卡片实际渲染的行数无关。

- 瀑布流：`App.tsx` 按「分辨率开关是否打开」在 `MASONRY_CAPTION_BAND_PX`(42) 与
  `MASONRY_DIMENSIONS_CAPTION_BAND_PX`(56) 之间二选一，同一视图内所有卡片共用。
- 平铺：`JustifiedAssetRows` 直接写死 `{dimensions:true,name:true,secondary:true}`，
  每一行永远预留三行；虚拟路径用 `buildJustifiedGeometry` 的单一 `captionBand`。
- 判定口径也分散：卡片渲染用 `shouldShowGridDimensions`（要求像素媒体 + 已知宽高 + 开关），
  几何层只有常量，两边无法一致。

## 本次增量

1. 新增 `src/renderer/asset-caption-band.ts`：把「这张卡会渲染几行」这件事收敛成一个模块。
   - `resolveCardCaptionLines(fields, asset, {snippetLine})` 复用卡片渲染同一条判定
     （`shouldShowGridDimensions`），搜索片段替换大小/日期行时仍按一行计。
   - `resolveMasonryCaptionBandPx` 用瀑布流 CSS 的度量（15px 上下内边距、14/14/12 行高）：
     两行正好等于 42，三行正好等于 56，单元测试锁死这两个常量，避免度量与常量漂移。
   - `resolveAssetCaptionBandPx` / `createCaptionBandResolver` 给两种视图各返回一个逐资产函数。
2. 瀑布流（masonry）：`estimateMasonryCardBodyPx`、`layoutMasonryAssetRects`、
   `MasonryColumns`、`VirtualMasonryColumns` 全部改为接受**逐资产**的高度来源
   （`CaptionBandSource = number | (asset) => number`，数字仍兼容旧调用）。每张卡按自己
   的行数计高，缺分辨率的卡片真实变矮。
3. 平铺（justified）：`layoutJustifiedAssetRects`、`buildJustifiedGeometry`、
   `buildChunkedJustifiedGeometry` 按**本行**取所需最大标题高度，行内统一；
   `JustifiedRowGeometry` 带上 `captionBand`，`virtualJustifiedRowStyle` 把
   `--justified-caption-band` 下发到每一行（原先挂在容器上），整行资产都缺分辨率时该行变矮。
4. 虚拟索引 `geometryEntries` 现在保留 `mediaType`（`mergeLayoutEntries` / 淘汰路径），
   并把它算进几何身份：否则几何层不知道「这是图片」，会少算一行而被卡片内容裁掉，
   或漏掉媒体类型修正导致的回流。
5. `App.tsx` 不再自己算标题区常量，改为把 `canvasPrefs.fields` 与
   `snippetLine={searchSnippets.size > 0}` 交给两个视图，移除
   `MASONRY_DIMENSIONS_CAPTION_BAND_PX` 在该处的用法。
6. 两个视图在没有服务端布局索引时的本地兜底条目（由 `AssetSummary` 合成）补上
   `mediaType`，否则它们会被逐资产判定当成未解析占位而多留一行。

## 验证记录

命令与结果在本机工作副本执行；测试产物用系统临时目录，结束后清理。

```text
npx tsc --noEmit
通过（退出码 0）。

npx eslint src/renderer/asset-caption-band.ts src/renderer/canvas-asset-layout.ts \
  src/renderer/masonry-columns.tsx src/renderer/justified-asset-rows.tsx \
  src/renderer/browse/virtual-browse-canvas.tsx src/renderer/browse/virtual-browse-layout.ts \
  src/renderer/App.tsx tests/unit/asset-caption-band.test.ts \
  tests/unit/canvas-asset-layout.test.ts tests/unit/virtual-browse-canvas.test.ts
无 error/warning（仅有 babel 对 App.tsx 体积的提示）。

npx vitest run tests/unit/asset-caption-band.test.ts tests/unit/canvas-asset-layout.test.ts \
  tests/unit/virtual-browse-canvas.test.ts tests/unit/justified-caption-band.test.ts \
  tests/unit/masonry-slot-style.test.ts tests/unit/justified-slot-style.test.ts
通过：6 个文件，40 passed。

npm run test:unit
478 个文件通过 / 2 失败 / 1 跳过（481 个文件；3577 passed / 2 failed / 3 skipped）。
失败的两个都与本改动无关：`tests/unit/import-source-failure.test.ts`（既有 macOS
platform 差异，已记 Serpent-ee725a），以及 `tests/unit/plugin-standard-host.test.ts`
（全量并发下偶发，单独重跑 8 passed，记「疑似 flaky，未关闭」）。

npm run test:worker
92 个文件通过 / 6 失败 / 16 跳过（114 个文件；1414 passed / 8 failed）。失败集中在
folder-rename / managed-folders / organization / sync-metadata / sync-library-integration /
linked-import-thumbnail-admission，均与本改动无关；其中 organization 的失败可直接看到是
工作树里**另一批未提交的外观改动**给合集摘要加了 `appearance` 字段而测试未同步。
与本改动直接相关的 `tests/worker/catalog-read.test.ts`（9 passed）与
`tests/worker/search.test.ts` 的 long_edge 用例（2 passed，真实 SQLite）都通过。

node scripts/run-e2e.mjs tests/e2e/browsing-preferences.test.ts
通过：4 passed（28.7s），真实 Electron；覆盖卡片字段开关与重启恢复、瀑布流卡片几何、
卡片宽度与列边界。收紧 3D 模型判定后复跑 4 passed（27.8s）；把判定抽成共享谓词、
Inspector 与筛选跟进后最终复跑 4 passed（33.9s）。
```

新增/更新的覆盖点：

- `tests/unit/asset-caption-band.test.ts`（新）：行数判定（无尺寸图片不给分辨率行、
  文档即使有宽高也不给、搜索片段算一行、几何占位保留分辨率行）、瀑布流两行/三行常量
  一致性、瀑布流与平铺两种视图的逐资产高度。
- `tests/unit/canvas-asset-layout.test.ts`：瀑布流逐卡按自身行数计高；平铺行取本行最大；
  整行都没有分辨率时行高变小且行内等高。
- `tests/unit/virtual-browse-canvas.test.ts`：虚拟瀑布流逐卡高度；虚拟平铺行取本行最大；
  `virtualJustifiedRowStyle` 下发逐行 `--justified-caption-band`。
- 真实 Electron：`node scripts/run-e2e.mjs tests/e2e/browsing-preferences.test.ts`
  → 4 passed（28.7s），含瀑布流卡片几何、卡片字段开关与重启恢复。

未跑 / 未验证：packaged、Windows、Computer Use 视觉验收。

验收结果：**2026-09-17 用户本人验收通过**（原话「验收通过」；此前卡片高度复验反馈「感觉没问题」）。
工单 `Serpent-b1b0f2` 已关闭，清单 `CARD-META-001` 记为人类验收通过。用户同时确认两点保留：
反向排除分辨率档位时模型仍出现；「按长边排序」不排除模型。

## 追加：3D 模型不算分辨率（用户澄清，同日）

用户复验本增量后确认交互没问题，并明确口径：**只有图像、视频、GIF 这类像素媒体才有
分辨率**；3D 模型虽然也带宽高（包围盒），卡片上不需要显示「宽 × 高」。用户同时确认另外
两处也要跟进：Inspector 顶部信息行的「宽 × 高」，以及「分辨率」筛选。

统一判定：新增 `mediaTypeHasPixelResolution(mediaType)`（`src/shared/media-formats.ts`），
`image` / `video`（GIF 属于 image）为真，`model` / `document` / `audio` / `text` / `other` 为假。

- **卡片**：`shouldShowGridDimensions` 改用该判定（原为 `image | video | model`），扩展名兜底
  去掉 `isSupportedModelExtension`。卡片渲染、`BrowseLayoutPreview` 占位卡、标题区几何三处
  共用同一个函数，模型卡片标题区自动回到两行（少 14px）。
- **Inspector 顶部信息行**（`InspectorPanel.tsx` compact info）：宽高片段加同一判定，
  模型不再显示 `宽 × 高`（大小、时长、日期照旧）。
- **分辨率筛选**（`buildCatalogFilterWhere` 的 `long_edge` 分支）：媒体类型由扩展名派生、
  库里没有 `media_type` 列，所以用图像/视频扩展名的 `LOWER(a.relative_file_path) LIKE ?`
  清单做门禁，作为**独立条件**加在范围条件之前（不能写成包住列表达式的 `CASE`：范围表达式
  每个 bound 会内联一次，带占位符的表达式会重复绑定）。语义与既有的 NULL 规则一致：
  正向匹配时模型不进入任何桶；反向排除时模型与「尺寸未测到」的资产一样保留。
- 单测/集成测试：
  - `tests/unit/media-formats.test.ts`：谓词逐类型断言。
  - `tests/unit/canvas-preferences.test.ts`：卡片判定新增 `model` / `.fbx` / `.obj` 用例。
  - `tests/worker/catalog-read.test.ts`：`long_edge` 生成 SQL 含像素媒体门禁、参数与占位符
    一一对应（`?` 个数 == params 长度），且 `width` 等其它数值筛选不受影响。
  - `tests/worker/search.test.ts`（真实 SQLite 集成）：插入一个带 1920 长边 `extracted_metadata`
    的 `.fbx` 模型，`min 1900` 的 1K 桶不再包含它；反向排除时它与「无尺寸」资产一起保留。
- Inspector 的渲染分支本身没有单独的 render 测试（该组件既无渲染测试基线），覆盖到共享谓词
  `mediaTypeHasPixelResolution` 与卡片判定为止。
- 清单 `CANVAS-039` 的预期同步去掉 3D。

## 边界

- 逐资产高度依赖索引里的 `mediaType` 与宽高。宽高稍后补上（视频 ffprobe、图片头探测）
  时该卡片会多出一行并回流，这与宽高到达本身导致的回流是同一路径（锚点补偿不变）。
- 几何占位（索引里还没有该位置的条目、连 `mediaType` 都没有）**保留**分辨率行，不做
  「先变矮、加载完再长高」：大库尾部若逐页长高，100k 位置的滚动条几何会一路漂移
  （CANVAS-038）。真实条目一旦带上 `mediaType`，就按真实宽高精确算，缺尺寸的卡片立即变矮。
- 两个视图在没有服务端布局索引时的本地兜底条目（从 `AssetSummary` 合成）现在补上
  `mediaType`，避免它被当成未解析占位而多留一行。
- 分辨率筛选的门禁按**扩展名**判定（库里 `assets` 没有 `media_type` 列，媒体类型是
  `detectMediaType` 从路径派生）。这需要 30 条约 `LIKE '%.ext'` 条件，只在用户实际启用
  分辨率筛选时进入查询；`width` / `height` / `aspect_ratio` / `duration` 筛选不受影响。
- 「按长边排序」（`sort.field = 'long_edge'`）未加媒体门禁：那是排序不是筛选，模型仍按
  自己的长边参与排序；如需同样排除请另开口径。
- 卡片/几何改动只涉及 Renderer 布局计算，Worker 侧只改了筛选 SQL 的生成，未触及 schema /
  打开关闭 / 迁移 / 损坏恢复，因此未跑 `test:library-availability`；Worker 全量测试已跑。
