# 2026-09-16 Ready Artifact 队列收敛开发记录

## 范围

本轮只完成 `Serpent-1de919` 的一个 claim-prune 正确性增量。工单仍为 `in_progress`，尚未验收或关闭。

这不是性能改善 A/B：本轮没有量化队列规模、claim 数、事务数或吞吐的前后差异，不能据此声称性能提升。

`processThumbnailQueue` 现在先读取 queued primary jobs，并同时核对资产当前 revision、ready 且未失效的 artifact、job 对应的 artifact kind 和当前 generator family。artifact kind 由现有 `artifactKindForJob` 按 `LibraryService.detectMediaType` 推导，因此视频 `generate_thumbnail` 对应 `video_poster`，图片仍对应 `thumbnail`。Generator 判断复用 `primaryArtifactGeneratorIsCurrent`。只取消仍处于 queued 且已有当前合法产物的任务；导入缩略图 normalization marker、failed 与 running 状态继续保留原有处理路径。

实现位置：[`library-service.ts`](../../../src/worker/library-service.ts#L30267)。回归覆盖位于 [`thumbnails.test.ts`](../../../tests/worker/thumbnails.test.ts#L1136)：当前缩略图收敛、过期 generator 重新生成、视频海报收敛，以及视频 artifact revision 不匹配、artifact 已失效、failed/running job 与 failed artifact 的保留语义。视频 ready fixture 在隔离测试库的 artifacts 目录实际写入 JPEG 文件。

## 验证

- 首轮回归按预期失败：新增的视频 ready-poster 用例期望只处理 2 个未满足任务，旧 prune 实际处理 3 个；说明 `generate_thumbnail` 被错误地与 `thumbnail` artifact 对齐。
- 定向测试：`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts -t "prunes legacy source-direct|regenerates an obsolete current thumbnail|prunes ready current video posters"` — **3 passed，69 skipped**。
- 完整缩略图 Worker 文件的首次运行：`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts` — **71 passed，1 failed**。失败为 `lists and controls media jobs without touching AI jobs`：pause/resume/cancel 的返回计数断言通过，但取消后读取汇总时 `cancelled` 仍为 0（断言位置 `tests/worker/thumbnails.test.ts:1512`，期望 1）。隔离复跑相同用例也复现，确认是摘要缓存陈旧窗口问题，不在 claim-prune 调用路径。
- 该回归随后由 `Serpent-e97c00` 的手动控制摘要失效增量修复：pause/resume/cancel/retry 在实际更新行数大于零时立即失效对应库摘要。修改后定向控制用例 **1 passed，71 skipped**，完整文件复跑 **72 passed**；详见[任务控制摘要开发记录](2026-09-16-media-job-control-summary-refresh-development-log.md)。
- `npm run typecheck` — **通过**（主 TypeScript 与 extension 配置）。
- `npx eslint src/worker/library-service.ts tests/worker/thumbnails.test.ts` — **通过**；ESLint 仅输出超大 `library-service.ts` 的 Babel deoptimization 提示。
- `npm run test:library-availability` — **9 files passed，216 passed，1 skipped**。
- Native runtime：系统 Node 为 **v24.14.0 / ABI 137**；Electron runner 实测为 **v24.18.0 / ABI 148**。`better-sqlite3` 在 Electron ABI 下的 FTS5 probe 通过，`ensure-native` 报告模块已匹配；本轮没有重建 native modules。

## 复审后的队列边界收敛

后续只读复审发现，若 reconciliation exact IDs 在普通长队列运行期间到达，仅在 queue cleanup 才 drain 仍可能让缺失预览等待整个后台队列。最终实现把检查前移到每个 bounded wave：普通队列释放 ownership 后，先按最多 100 个 ID 启动 reconciliation-only pump，再通过保存的 resume 回调恢复原队列。可见波次抢占 exact batch 时标记 `superseded`，批次 idle 会把该批完整 ID 回放到 per-library pending Set，避免只剩 priority-50 durable job 而再次排在长队列之后。

真实 `src/worker/index.ts` 调度路径回归：

```text
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-scheduler.test.ts
通过：1 个文件，1 passed（脱敏 fixture 覆盖普通 wave 等待期间 reconciliation 回调到达、exact scope 插入及原队列恢复）。

node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts
通过：1 个文件，77 passed。
```

这项回归证明普通活动队列的调度交接、可见波次抢占后的 superseded 回放，以及 direct exact idle 后普通 enqueue 恢复代码路径；cover 专用入口尚无独立的 `src/worker/index.ts` 集成断言。以上不等于真实 9k 队列吞吐或导航端到端性能改善；仍需独立大负载 profile 和完整重启/E2E 证据。

## Viewer 交互窗口门控（2026-09-16）

复审发现 viewer upgrade 会中止正在等待收尾的 reconciliation exact queue；若 idle 回调立即重启，后台 decoder 可能在交互窗口内重新 claim。现已复用 `secondaryMediaIdleUntil` 的 2 秒窗口：exact/普通队列在 idle 回调只登记一个 per-library retry timer，窗口结束后才恢复 exact pending Set 或被暂停的普通队列。close/cancel 清理 pending IDs、resume callback 与 timer；高优先级 visible/cover ownership 仍优先于 exact。

新增真实 Worker scheduler harness 的实际结果：

```text
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-scheduler.test.ts
通过：1 个文件，1 passed；断言 viewer 交互窗口内 exact claim 次数不增加，窗口结束后 exact 与 ordinary queue 均恢复。
```

该回归使用脱敏 fake parent port 回送 `native-fallback` provider 响应，覆盖真实 `src/worker/index.ts` 的 admission、queue idle 和 resume 路径；没有构造独立的 cover/folder-card 入口，因此 cover 仍是自动化证据缺口。此增量仍不是性能改善 A/B，也不代表 `Serpent-1de919` 已关闭。

## 尚未验收

该增量不等于 `Serpent-1de919` 完成，不能关闭工单。尚未覆盖缺失 artifact 文件时的恢复、完整应用退出与重启后的队列收敛、重复开库与运行中产物发布、失败重试、任务总数/claim 数/事务数/吞吐的 20,000 资产混合负载测量，以及 packaged、真实界面和 Windows 发布行为。视频用例使用已有文件的 ready artifact；它没有验证数据库仍标 ready 但磁盘文件缺失的情况。合并 `Serpent-e97c00` 缓存修复后，完整 thumbnails 文件已为 77/77；这只是测试正确性收敛，并非吞吐或导航性能 A/B。
