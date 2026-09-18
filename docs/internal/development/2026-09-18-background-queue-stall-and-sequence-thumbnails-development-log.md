# 2026-09-18 后台任务卡住与序列帧缩略图入队

## 范围

`Serpent-926e2f` 回归：视口 overlay 把后台 claim 锁在当前 band。另：序列隐藏帧仍单独入队 `generate_thumbnail`。交叉审查后按规格补两段式 claim、卡住回归测试、30 帧导入入队断言，以及 P2 不中断 running。

## 原因

1. 第一次 visible-window 之后 overlay 一直有快照。后台波也把 `claimAssetIdsRef` 收成最多 250 个视口 ID。这些 ID 已经没有 queued job 时，claim 返回空，队列结束；下一轮后台波重复同一范围，全库其余任务一直停在 queued。只「后台波不套 IN」与规格 §4.1 不等价：前台 band 抽空后，同一波仍应回到持久队列。
2. 浏览只显示序列主帧，入队 SQL 没有跳过 `asset_sequence_frames.position > 0`。组成序列前已入队的隐藏帧任务也会留在面板里。3 帧手动成组测不到「导入 30 帧不应出现 30 条缩略图任务」。

## 行为

- claim 两段式：先按 overlay 名次做有界 `IN (...)`；仅当该列表没有 queued 工作、且当前泵不是 interactive / 没有显式 `assetIds` 时，才回到持久队列。可见波与 in-flight narrowing 仍保持硬限制，不把可见上报变成全库 fill。
- 仅邻居 band 变化（可见集合未变）时 `lookaheadOnly` 为真，不中断 running。
- 隐藏序列帧不再入队主预览/色卡；组成序列时取消其已有 queued/running 任务；任务面板不把 `SEQUENCE_MEMBER` 当作可操作项。主帧仍可有一张缩略图。导入 30 帧自动成组后，即使按全部帧 ID 入队，也只应留下主帧缩略图任务。
- Renderer 视口上报的 band 拼装从 `App.tsx` 抽到 `viewport-priority-report.ts`。

## 测试

```
npx vitest run tests/unit/viewport-priority.test.ts tests/unit/viewport-priority-protocol.test.ts tests/unit/viewport-priority-report.test.ts tests/unit/visible-window.test.ts
```

4 files / 23 passed（含两段式回落策略与视口上报拼装）。

```
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-throughput.test.ts tests/worker/image-sequence.test.ts
```

2 files / 28 passed。新增：overlay 抽空后领取库外任务；导入 30 帧序列后 `generate_thumbnail` 行数 ≤ 1。既有「可见窗口收窄后 outside 保持 queued」仍绿。

```
npm run test:library-availability
```

9 files / 226 passed / 1 skipped。Electron E2E / packaged / Computer Use 未执行。

## 验收

`VIEWPORT-BAND-001` 与 `SEQ-THUMB-001` 于 2026-09-19 人类验收通过（用户原话「可以，通过」）。工单 `Serpent-926e2f` 因滚动命中率 / 双窗口 / packaged 未齐，保持 in_progress。
