# 2026-09-18 视口 band 与内存优先级 overlay

## 范围

`Serpent-926e2f`。设计见 [后台媒体吞吐与视口优先级](../implementation/2026-09-18-background-media-throughput-and-viewport-priority.md) §4、§10 第 2 步。

本增量不提高解码并发，不改持久 `jobs.priority`，也不打开 10 秒静默门闩。

## 原因

可见窗口协议原先只传一个 `assetIds` 集合，且在 Renderer 侧排序后丢失屏幕顺序。Worker 只能按「可见 / 不可见」两档领取和中断；邻近预取与滚动方向无法进入下一次 claim。

## 行为

- Renderer 按虚拟布局计算 `focused / visible / nearForward / nearBackward / scopeWarm`，并保留可见卡片的视觉顺序。band 拼装在 `viewport-priority-report.ts`。
- 新快照以 `(consumerId, viewportGeneration)` 替换内存 overlay；迟到 generation 直接丢弃。
- 下一次 claim 按 overlay 名次做有界 `IN (...)`，SQL `CASE asset_id` 跟随该顺序，而不是滚动时批量改库。
- 可见波仍只入队当前可见项；邻近项只在已有 queued job 时提前被领取。
- 中断 running 任务需同时满足：重叠低于旧阈值、P0/P1 等待、视口稳定约 100 ms、同一 decoder 500 ms 冷却，且没有空闲前台 Sharp 槽。可见集合未变的 P2 邻近变化把 `lookaheadOnly` 设为真，不中断 running。

## 未做

- 未跑真实 Electron 滚动命中率 / 浪费率，也未做 packaged 与 Computer Use。
- FFmpeg 双槽与 10 秒静默门闩仍走 `Serpent-7ac453`（仍被 `Serpent-217028` 与本工单挡住）。
- Renderer 内存平台仍以 `Serpent-df0ec0` 的 heap 证据为准，本增量不得写成已验证。

## 测试

```
npx vitest run tests/unit/viewport-priority.test.ts tests/unit/viewport-priority-protocol.test.ts tests/unit/visible-window.test.ts tests/unit/visible-window-policy.test.ts tests/unit/thumbnail-completion-fanout.test.ts tests/unit/thumbnail-completion-projection.test.ts
```

6 files / 32 passed。

```
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-throughput.test.ts
```

1 file / 8 passed（含 overlay 名次 claim 与既有 interactive 图片优先）。Electron E2E / packaged / Computer Use 未执行。

## 验收

清单 `VIEWPORT-BAND-001` 于 2026-09-19 人类验收通过（用户原话「可以，通过」）。工单 `Serpent-926e2f` 的滚动命中率、双窗口与 packaged 证据仍未齐，保持 in_progress。
