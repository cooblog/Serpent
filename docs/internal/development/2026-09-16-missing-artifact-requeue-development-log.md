# Serpent-1de919 — 启动时缺失主预览的重新入队

日期：2026-09-16

## 本次增量

启动后的首个可见浏览波次可能在后台文件对账前运行。若数据库仍保留 `status = 'ready'` 的主预览行、但对应 artifact 文件已经缺失，claim-time prune 会把已有的 queued 任务标记为 `ARTIFACT_READY`；随后原有 `reconcileMissingArtifactFiles` 只写入 `invalidated_at`，不会自动触发下一次主预览入队。

本次保持现有异步目录枚举、400 行批次和首屏门禁不变。对账每批在已有缺失文件判定和 invalidation 写入后，只收集该批中 `thumbnail`/`video_poster` 主 artifact 对应的当前 asset IDs（批内去重），通过可选回调通知 Worker。Worker 以跨批、跨活动 queue 的 per-library `Set` 去重，复用现有 `enqueueThumbnailJobs` 路径，以后台优先级 50、`skipStaleRepair` 和精确 asset IDs 持久化入队；因此超过 100 个 ID 也不会被静默截断。所有批次完成后，若首个可见门禁已释放，按最多 100 个 ID 一批启动 `scheduleThumbnailQueue`，每批使用精确 `assetIds`、`skipInitialEnqueue`、`skipStaleRepair`、`skipBackgroundRepair` 和 `suppressSecondaryQueue`，批次 idle 后才启动下一批。若 reconciliation 期间已有普通 primary queue，普通队列在每个 bounded wave 边界检查 pending exact IDs，释放当前 queue ownership 后立即 drain，再通过保存的 resume 回调恢复原队列；不必等待 9,000 项后台队列全部耗尽。活动 queue 不会让 scope 丢失，也不会先 handoff 到 secondary queue。若可见波次抢占 reconciliation exact batch，该批会标记为 superseded，未完成 ID 在 idle 回调中完整回放到 pending Set。专用 pump 不追加 catalogue repair、artifact repair 或 dimension-backfill，让当前可见波次保留更高优先级。首个可见门禁尚未释放时只写入 queued 行，不启动 decoder。

本轮审查还收紧了 claim-time 语义：source-direct/ready-artifact prune 仅在明确 `assetIds` scope 时运行；无 scope 的全库 wave 跳过 JOIN 预扫描，依赖每波最多 `maxJobs` 的 claim-time admission 逐项收敛。显式 scope 使用 `jobs_asset_kind_status` 索引，scope 上限为 100，排序的临时 B-tree 只作用于该有界候选集。定向 fixture 的 `EXPLAIN QUERY PLAN` 为：`SEARCH ready_asset USING INDEX sqlite_autoindex_assets_1`、`SEARCH jobs USING INDEX jobs_asset_kind_status (asset_id=? AND kind=? AND status=?)`、`SEARCH ready_artifact USING COVERING INDEX revision_artifacts_revision_kind_status`、`USE TEMP B-TREE FOR ORDER BY`；没有 `SCAN jobs`。最终 claim admission 对当前 revision 的 `thumbnail`/`video_poster` 再调用 `primaryArtifactGeneratorIsCurrent`，旧 generator 不会被错误 prune。`generate_thumbnail` 对视频仍按 artifact policy 映射为 `video_poster`；imported-thumbnail-normalization、failed/running 和旧 revision 保护保持不变。

没有增加逐候选同步 `lstat`、SMB 往返、首屏前完整 artifact 枚举或数据库迁移。

## 回归证据

修改前的定向 Worker 回归可稳定复现缺口：

```text
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts -t "re-enqueues a missing primary preview found after the startup queue prunes it"
失败：对账后通知的 asset ID 为空（期望 1 个），说明缺失文件 invalidation 没有触发重新入队路径。
```

修改后按要求串行执行：

```text
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts -t "regenerates an obsolete current thumbnail|bounds scoped ready-artifact pruning|re-enqueues a missing primary preview|re-enqueues a missing video poster|reports every missing primary asset"
通过：1 个文件，6 passed，71 skipped（77）。覆盖直接 claim-time 旧 generator 重生成、视频 poster 当前 revision/失效/failed/running 保护、有 scope prune 与无 scope 跳过预扫描、101 个缺失主预览 ID 的完整回调 scope，以及普通 queue 活动期间的 exact scope 保留/后续处理。

`EXPLAIN QUERY PLAN` 设计回归（同一测试 fixture）确认显式 scope 走 `jobs_asset_kind_status`，没有 `SCAN jobs`；`USE TEMP B-TREE FOR ORDER BY` 的输入只来自最多 100 个精确 asset IDs。无 scope 的回归只让 claim-time admission 消费 `maxJobs = 2`，剩余 rows 保持 queued。

真实 Worker 调度路径回归：

```text
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-scheduler.test.ts
通过：1 个文件，1 passed。脱敏 fixture 通过 `library.open` → `browse.session.open` → visible window 启动真实 `src/worker/index.ts`，模拟普通 wave 等待期间 reconciliation 回调到达；断言 exact asset 在下一 bounded 边界插入，随后原普通 visible wave 恢复；exact active 期间新的 visible wave 抢占后，未完成 exact 批次回放并再次处理；同时验证普通 enqueue 在 exact idle 后重新启动。`worker.shutdown` ACK 也等待异步资源清理完成。

node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts
通过：1 个文件，77 passed。
```

npm run typecheck
通过（退出码 0）：主 TypeScript 与 extension TypeScript 检查成功。

npx eslint src/worker/library-service.ts src/worker/index.ts tests/worker/thumbnails.test.ts tests/worker/thumbnail-scheduler.test.ts
通过（退出码 0）；仅输出 library-service.ts 超过 Babel 500 KB 优化阈值提示，无 lint 错误。

npm run test:library-availability
通过（退出码 0）：9 个文件，216 passed，1 skipped（217）；pretest 确认 better-sqlite3 匹配 Electron ABI 且 FTS5 可用。
```

环境 ABI：系统 Node.js 为 24.14（ABI 137）；Electron Worker 测试运行时为 ABI 148。本轮未重建 native 模块。

## 边界与剩余验收

此变更只证明缺失主预览在启动时序窗口内会在对账后重新入队并最终生成，且成功后不会重复循环；真实 Worker 回归覆盖 visible supersession 与普通 enqueue resume，但 cover 专用入口尚无独立集成断言。不构成吞吐性能 A/B，也没有运行或声称 20k/9k 基线结果。

Serpent-1de919 仍保持打开；真实 UtilityProcess 重启、完整桌面/E2E 首屏时序和跨平台文件系统证据未在本轮验收。视频 poster 的回调入队已由脱敏 DB/文件 fixture 覆盖，但真实视频 decoder 重生成未运行；本轮也没有把 20k/9k 负载或吞吐改善写成验收证据。更广泛的启动队列、分页、O(1) 摘要及其他工单仍按各自状态管理。本记录不代表工单关闭或完整规格验收通过。

## Viewer 交互窗口 follow-up（2026-09-16）

`src/worker/index.ts` 的 exact missing-primary queue 现在沿用 `secondaryMediaIdleUntil` 交互空闲窗口。viewer upgrade 中止 exact queue 后，idle callback 不会在 2 秒窗口内重新启动 exact 或普通 background claim；每库只登记一个可取消 timer，窗口结束后按 pending exact IDs 继续分批（每批最多 100），再恢复已登记的普通队列。close/cancel 同时清除 timer、resume callback、active batch 与 pending IDs。visible/cover 使用共享的高优先级 ownership 判定，不能被 exact 接管。

新增真实 Worker scheduler regression：

```text
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-scheduler.test.ts
通过：1 个文件，1 passed；viewer idle 窗口内 exact claim 次数保持不变，窗口结束后 exact replay 与 ordinary resume 均发生。
```

本轮没有独立构造 cover/folder-card 交互入口，故 cover 的自动化证据仍未覆盖；也没有执行真实 UtilityProcess 重启或 20k/9k 性能 A/B。`Serpent-1de919` 仍保持打开，以上结果不构成完整规格验收或关单。
