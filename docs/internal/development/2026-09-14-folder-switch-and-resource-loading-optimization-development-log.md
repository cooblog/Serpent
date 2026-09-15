# 2026-09-14 文件夹切换与资源加载性能优化（真实 4.3 万资产库基准 → 优化 → 对比）

> 触发：用户 2026-09-14 要求「按 `docs/internal/implementation/2026-09-14-folder-switch-and-resource-loading-optimization.md` 与对应工单完成性能优化；先用真实资源库做覆盖各操作面的插桩基准、找出热区，再优化并对比」。
> 规格：本日志对应的规格文档同上；工单 `Serpent-217028`（观测与回放基准）、`Serpent-e97c00`（状态轮询有界）、`Serpent-8ee170`（拖拽预热合并）、`Serpent-be29a9`（对账归还后台许可）、`Serpent-26f22b`（对账探针去放大）。
> 隐私：真实资源库路径、库名与资产名只通过运行时环境变量传入，**仓库内不保存任何真实路径**；本日志只写类别与数字。

## 1. 交付物

| 交付物 | 位置 | 说明 |
| --- | --- | --- |
| 导航性能基准 | `tests/e2e/navigation-perf-benchmark.test.ts` | 真 Electron + 隔离 userData；覆盖打开、库切换、文件夹切换、合集切换、随机跳转、连续滚轮、查看器打开；破坏性操作（文件夹创建、合集创建、资产移入回收站、文件夹删除）只在显式确认的一次性副本上执行 |
| 基准运行器 | `scripts/run-navigation-benchmark.mjs` + `npm run test:perf:navigation -- <库> [第二个库]` | 复用 `scripts/run-e2e.mjs` 的构建管线；报告写在仓库外（`SERPENT_NAV_BENCH_OUT`） |
| 插桩与日志解析 | `tests/e2e/perf-bench-helpers.ts` | 渲染端探针（long task、帧间隔、卡片挂载/`src` 重写、`serpent:e2e-browse-*` 事件）＋ Worker/Main 结构日志（`worker.cmd`、`performance.span`、`worker.eventLoop.lag`、`worker.scheduler.stall`、`worker.media-queue`、`open.reconciliation.stage`、`refresh.managed-assets.stage`、`preview-cache`） |
| 冷/热回放 | `SERPENT_NAV_BENCH_USER_DATA` | 固定 profile 目录即可在同一夹具上做冷/热重复回放 |

基准刻意不建第二套缓存、不改产品行为：所有额外细节都来自既有 `SERPENT_*_LOG` 门控与注入式探针。

## 2. 基线（真实 4.3 万资产库，冷 profile，200 秒内多次导航）

命令（路径由 env 传入）：

```powershell
. <仓库外环境脚本>            # SERPENT_NAV_BENCH_LIBRARY / _B / _WRITE_LIBRARY / _WRITE_CONFIRM / _OUT / _USER_DATA
npm run test:perf:navigation -- <真实库> <第二个库>
```

渲染端可见结果（p50 / max，毫秒）：

| 操作 | p50 | max | 结论 |
| --- | ---: | ---: | --- |
| 打开资源库 → 首卡 | 2,160 | 2,160 | 打开反馈本身够快 |
| **切文件夹（安静期）** | **20,077** | **39,410** | 复现用户「约半分钟」 |
| **切文件夹（对账运行中）** | **20,045** | 20,079 | 与安静期同量级 → 不是渲染问题 |
| **切合集** | **20,048** | 20,078 | 同上 |
| 随机滚动跳转 | 20 | 69 | 快 |
| 查看器打开 | 258 | 327 | 快 |
| 库切换 → 首卡 | 6,386 | 6,386 | 偏慢 |

Worker/Main 侧热点账本（同一次运行，8.4 分钟）：

| 命令 | 次数 | run 合计 | 排队合计 | 最大排队 |
| --- | ---: | ---: | ---: | ---: |
| `media.list-jobs` | 503 | 66.1 s | 603.8 s | 29.2 s |
| `ai.status` | 503 | 19.3 s | 653.2 s | 29.4 s |
| `plugin.jobs.list` | 503 | 5.1 s | 666.7 s | 29.5 s |
| `browse.session.open` | 15 | 0.32 s | 32.7 s | **28.3 s** |
| `folder.browse-entries` | 7 | 1.8 s | 28.8 s | **28.3 s** |
| `asset.search` | 12 | 7.8 s | 29.6 s | **28.5 s** |
| `media.get-asset-drag-infos` | 535 | 2.5 s | 6.8 s | 2.4 s（Main 侧往返 p95 95 s） |
| `media.get-artifact-paths` | 30 | 1.5 s | 1.5 s | 0.33 s |

对账（`open.reconciliation.stage`，3 次开库）：

| 阶段 | 累计 | 单次最长 |
| --- | ---: | ---: |
| `asset-reconciliation` | 85.2 s | **83.3 s** |
| `artifact-orphan-cleanup` | 18.0 s | 17.2 s |
| `network-metadata-cache` | 6.3 s | 2.3 s |

调度器 stall 证据（`worker.scheduler.stall`，6 次）：5 次的占用者都是同一个 `reconciliation`（maintenance），`runningMs` 一路 3.3 s → 7.3 s → 15.3 s → 21.8 s → **25.8 s**，队列里排着 `media.list-jobs` 等状态查询。

`refresh.managed-assets.stage` 共 2,061 次（同一个库），按分钟分布为 687/687/687 —— 即**每次开库对账按 ~64 资产/批串行 687 批**，其中 `precompute-fingerprints` 累计 53.4 s，是这批批次的固有开销。

### 2.1 热区结论

1. **不是渲染，是 Worker 排队**：导航命令自身只跑 0.3–1.8 s，却排了 28 s 队。
2. **排队的主要填充物是状态轮询**：三类各 503 次、合计排队 1,924 s（占整段运行 8.4 分钟里的大部分排队时间），且没有任何 single-flight。
3. **每个缩略图完成都发一次拖拽预热请求**：535 次，Main 侧往返 p95 达 95 s。
4. **对账作为一个 maintenance 任务连续占用后台许可最长 25.8 s**，而调度器同时只允许 1 个后台任务 → 预览路径（`media.get-artifact-paths`，background-primary）与导航被优先级反转堵住。
5. `artifact-orphan-cleanup` 每次开库 17.2 s：**先对每个 artifact 做 `lstat`、再查数据库引用**，而该库 8 万+ artifact 几乎全部仍被引用。

## 3. 已实施优化

| 工单 | 改动 | 位置 | 单测 |
| --- | --- | --- | --- |
| `Serpent-e97c00` | 用一个 `JobStatusCoordinator` 取代「常驻每秒轮询 + 面板再开一组」：每类查询 single-flight，飞行中的请求把后续请求折叠成一次跟进；库/代次变化或 stop 后的迟到结果直接丢弃；面板打开才用 1 s 快节奏，空闲退避到 10 s；窗口隐藏停止轮询，恢复时只做一次合并刷新；任务事件（`asset.thumbnail.*`/`asset.derived.ready`、AI 进度/完成/清空、插件命令完成）立即触发一次该类刷新 | `src/renderer/job-status-coordinator.ts`（新）、`src/renderer/App.tsx` | `tests/unit/job-status-coordinator.test.ts`（6） |
| `Serpent-8ee170` | 缩略图 ready/failed 事件不再各自发一条 `media.get-asset-drag-infos`，改为进入 Main 的合并队列：按库去重、in-flight id 不重复入队、500 id/批、批间 25 ms 让出、每库 pending 上限 20,000、切库/关窗丢弃旧代次 | `src/main/native-asset-drag-prime.ts`、`src/main/index.ts` | `tests/unit/native-asset-drag-prime-scheduler.test.ts`（6） |
| `Serpent-be29a9` | `InteractiveScheduler` 新增安全点让出：后台任务调用 `yieldAdmission(requestId)` 时，若队列里有交互请求或 mutation 在等，就把自己移出 active 集合（释放唯一后台许可）并等待重新准入；交互/mutation 优先于让出者，其他后台工作让位于让出者（保证对账有限推进）；让出期间取消路径（`cancelActiveBackgroundForLibrary`/`cancelActiveBackgroundOwners`）仍能到达该任务；无事可等时立即返回，零开销。`yieldReconciliation` 在每个批次安全点调用它 | `src/worker/interactive-scheduler.ts`、`src/worker/library-service.ts`、`src/worker/index.ts` | `tests/unit/interactive-scheduler-admission-yield.test.ts`（5）+ 既有 23 |
| `Serpent-26f22b` | 孤儿 artifact 扫描改为**先查引用集合再探针**：8 万+ 已引用 artifact 不再 `lstat`；并输出枚举数/探针数/被引用跳过数/候选数/耗时指标 | `src/worker/library-service.ts` `reconcileOrphanArtifactFiles` | `tests/worker/derived-artifact-repair.test.ts` 等定向 17 passed |

## 4. 优化后对比

两次运行都是同一条旅程、同一批操作、真实 4.3 万资产库；after 使用全新冷 profile。崩溃会落盘部分报告（本轮 after 一次运行曾出现 Worker 以 `0xFFFFFFFF` 退出并拖崩整棵进程树，重跑未复现；已如实记录，未与本轮改动建立因果）。

### 4.1 度量口径修正（重要）

基线与 after 的渲染端「切文件夹 p50 20.0 s」其实**不是导航耗时**：`min 20,029 / max 20,083` 只差 30 ms，是 `coverage≥0.8` 的 **20 s 预算超时**被当成了操作耗时（该库大量资产没有 ready 缩略图，覆盖率长期达不到 80%）。已把 `ms` 改为「页面到达」、覆盖率单独出列。因此**可比对的导航延迟证据用 Worker 侧准入等待**（两次运行口径完全一致，且与渲染端页面到达同源）。

### 4.2 Worker 侧准入等待（同一命令，基线 → after）

| 命令 | 次数 基线→after | 最大排队 基线→after | after p95 |
| --- | --- | --- | --- |
| `browse.session.open` | 15 → 30 | **28,325 ms → 1,374 ms** | 1,205 ms |
| `folder.browse-entries` | 7 → 14 | **28,327 ms → 1,167 ms** | 1,167 ms |
| `asset.search` | 12 → 26 | **28,451 ms → 2,443 ms** | 2,193 ms |
| `media.list-jobs` | 503 → 464 | **29,215 ms → 2,063 ms** | **222 ms** |
| `ai.status` | 503 → 466 | **29,400 ms → 约 2,000 ms** | **约 0.13 ms** |
| `plugin.jobs.list` | 503 → 462 | **29,453 ms → 约 2,000 ms** | **约 0.12 ms** |
| `media.get-asset-drag-infos` | **535 → 44** | 2,361 ms → 2,135 ms | 274 ms（Main 往返 p95 95 s → 41.7 s） |
| `media.get-artifact-paths` | 30 → 38 | 329 ms → 2,408 ms | 2,118 ms |

读法：

- **导航不再是「排 28 秒队」**：`browse.session.open` / `folder.browse-entries` / `asset.search` 的最大等待都从 ~28.3 s 降到 1.2–2.4 s（`Serpent-be29a9` 让出许可生效）。
- **状态轮询不再堆积**：三类查询的 p95 等待约 0.1–0.2 ms（基线 queue 合计 1,924 s），调用次数仍约 1/s（队列为空时按 1 s / 空闲 10 s 的退避策略，面板关闭且任务活跃时仍取快节奏）——这是刻意的：次数不是问题，堆积才是。
  - 进一步把「面板关闭 + 有活动」降到 2 s 可以把调用数再减半，但会与本轮已测数字不同口径，留作后续（`Serpent-e97c00` 的未完成项）。
- **拖拽预热请求从 535 降到 44**（12×），Main 侧往返 p95 从 95 s 降到 41.7 s。
- `media.get-artifact-paths` 最大等待反而从 329 ms 升到 2,408 ms：基线里这 30 次请求几乎都发生在对账开始前，样本不可比；after 的 2.4 s 仍然说明「预览路径仍可能排在一个批次/阶段之后」，与规格要求的「不超过一个对账时间片」还有距离（当前让出粒度是**批次边界**，批次内部仍是同步段）。
- 对账自身总成本基本不变（`apply-discovered-batches` 累计 99 s / 单次最长 35 s，`discovery-walk` 63.8 s）——这符合预期：`be29a9` 改变的是「谁在等」，不是总工作量；降低总量属于 `26f22b`（孤儿探针已修）与 PERF2-07。

### 4.3 其余观察

- 打开首卡 1,960 ms（基线 2,160 ms），首屏 80% 覆盖 131 ms，随机跳转 p50 20 ms，查看器 241 ms，库切换首卡 4,954 ms（基线 6,386 ms）。
- `performance.span`、`worker.eventLoop.lag`、`worker.scheduler.stall`、`worker.media-queue`、`open.reconciliation.stage` 全部已在报告里结构化输出；stall 事件的 `active[].label/runningMs` 是这次能直接指认优先级反转的关键证据。

## 5. 未完成与未验证
- `Serpent-1de919`（ready artifact 与冗余派生任务收敛）与 `Serpent-7ac453`（交互期前台资源预算）**本次未实施**：都需要 20k 夹具上的「运行中 / 暂停」对照，属同一目标的后续步骤；本轮已完成的三项是它们的前置。
- `Serpent-26f22b` 只改了孤儿扫描（先查引用再探针 + 阶段指标）；`reconcileMissingArtifactFiles`、目录快照复用与按影响范围刷新（PERF2-07）未动。
- `Serpent-be29a9` 当前是「批次边界让出许可」，尚未把整段对账切成可恢复 continuation；`media.get-artifact-paths` 仍可能等 2.4 s。
- 基准口径：渲染端导航延迟已改为页面到达，但**基线那次没有单独记录页面到达**，故 4.2 的对比以 Worker 侧等待为准；运行中/暂停对照只做了运行中；`navigationId` 未贯穿协议层。
- 未验证：Windows、SMB/NAS、packaged、真实 2 万夹具端到端、Computer Use 真机交互观感；Electron E2E（任务面板开关/窗口隐藏/切库）本次未跑；一次 after 运行出现 Worker `0xFFFFFFFF` 退出（未复现，无 JS 报错，未定位）。

## 6. 门禁与验证（当次命令与结果）

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 error |
| `npm run lint` / `npx eslint <改动文件>` | 0 error（仅既有 1 个 hook-deps warning） |
| `npm run test:library-availability` | **9 files / 214 passed / 1 skipped** |
| `npx vitest run tests/unit/{job-status-coordinator,interactive-scheduler-admission-yield,interactive-scheduler,native-asset-drag-prime-scheduler,native-asset-drag-prime,native-asset-drag}.test.ts` | **49 passed** |
| `node scripts/run-vitest-with-electron.mjs run tests/worker/{derived-artifact-repair,palette-artifact}.test.ts` | 17 passed |
| `npm run test:perf:navigation -- <真实库> <第二库>`（基线 / after） | 各 1 passed（8.4 min / 7.8 min），报告 `baseline-cold.json` / `after.json`（仓库外） |

## 7. 变更清单与提交状态

**尚未提交、未推送**（用户明确要求：未经允许不得提交或推送）。工作树内改动：

- 新增：`tests/e2e/navigation-perf-benchmark.test.ts`、`tests/e2e/perf-bench-helpers.ts`、`scripts/run-navigation-benchmark.mjs`、`src/renderer/job-status-coordinator.ts`、`tests/unit/job-status-coordinator.test.ts`、`tests/unit/interactive-scheduler-admission-yield.test.ts`、`tests/unit/native-asset-drag-prime-scheduler.test.ts`
- 修改：`src/renderer/App.tsx`、`src/main/index.ts`、`src/main/native-asset-drag-prime.ts`、`src/worker/index.ts`、`src/worker/interactive-scheduler.ts`、`src/worker/library-service.ts`、`package.json`（新增 `test:perf:navigation`）、`docs/internal/qa/human-acceptance-checklist.md`（NAV-PERF-001）、`.beads/issues.jsonl`（本轮工单评论）

## 8. 【更正，2026-09-14 晚】§4 的对比结论不成立；真实 profiler 结果如下

用户反馈「随机跳转/滑动变慢、切文件夹慢到令人发指」后重新做了**有效度量**，结论推翻本文 §4：

### 8.1 度量缺陷（已确认）

- `serpent:e2e-browse-request/-result/-page` 三个事件受 `browseDiagnosticsEnabled` 门控，**在 production-like 的 E2E 构建里根本不触发**（两次运行的探针计数都是 0）。因此 §2/§4 里「切文件夹 p50 20.0 s」是「等一个永不发生的事件」的超时值，**不是切换延迟**，§4 的前后对比据此作废。
- 保留有效的只有 Worker 侧命令准入等待（§4.2 表），它说明**排队**改善，但不等于用户可见延迟改善。

### 8.2 新度量（真实 4.3 万资产库，当前工作树）

判据改为用户真正等待的东西：点击 → 可见卡片集合真的变了 → 可见图片全部解码。新增 `tests/e2e/navigation-profile.test.ts`（渲染端 CDP CPU profile + Worker V8 inspector CPU profile）。

| 指标 | 结果（4 次切文件夹 / 3 次跳转 / 8 s 滚轮） |
| --- | --- |
| 切文件夹：内容真正变化 | min **37 ms**，p50 **60,000 ms（=超时上限）**，4 次里 3 次 60 s 内没换内容 |
| 切文件夹：总耗时 | p50 60,084 ms，max 90,088 ms |
| 随机跳转：内容变化 | **3/3 都是 30 s 超时未变化** |
| 滚轮 8 s | frameP95 **7.8 ms**、frameMax 29.5 ms、long task 0、`serpent://` src 写入 10 次 |
| 渲染端 CPU | `(idle)` 约 72%，无渲染侧热点 |

### 8.3 Worker CPU profile（同一旅程，热点答案）

| 自耗时间 top | 归属 |
| --- | --- |
| `all` 204.7 s + `all` 22.6 s | better-sqlite3 `Statement#all()` |
| `run` 21.2 s + `run` 2.3 s | better-sqlite3 `Statement#run()` |
| `get` 2.7 s + `get` 1.8 s | better-sqlite3 `Statement#get()` |
| `lstat` 7.2 s + 5.6 s + 1.9 s ≈ **14.7 s** | 文件系统探针 |
| `(idle)` 14.4 s | — |

结论：**Worker 侧 CPU 几乎全部花在 SQLite 语句执行上（合计约 250 s），外加约 14.7 s 的 `lstat`**；渲染端不是瓶颈。下一轮优化必须针对具体 SQL 语句（哪条 `all()`、为什么没有走索引/为什么跑 687 批），而不是继续在调度层做文章。

### 8.4 状态

截至本文更新时：§3 的四项改动**尚未经有效度量证明为正向**，因此**不得视为完成**；在拿到 A/B（当前改动 vs HEAD，同一库、同一旅程、同一判据）的严格正向结果之前，不提交、不推送、不宣称优化完成。

## 9. 【第三次更正，2026-09-14 晚】SQL 热点成立，但“一分钟不换内容”的直接原因是 Main 后处理优先级反转

主程重新读取完整 Worker profile 调用树、逐条去重 `worker.cmd`/`worker.cmd.roundtrip`，并对真实库执行只读 SQL 计时与临时副本索引 A/B。临时副本与诊断脚本已清理，用户库未修改。

### 9.1 精确归因

- 344 秒内 `media.list-jobs` 实际 933 次（2.71 次/秒），Worker 执行累计 206.4 秒、平均 221 ms；约 204.7 秒的 `all()` 全部归属 `listMediaJobs`。原因是每个媒体完成事件仍立即触发一次完整任务状态/最近列表查询，single-flight 只防止同时在飞，没有限制成功查询频率。
- 真实库约 7.45 万条媒体任务。状态计数中位约 142.2 ms，最近 500 条约 166.6 ms；增加排序匹配索引后最近列表约 1.0 ms，但状态计数仍约 133.1 ms。因此列表需要索引，计数必须改为增量摘要/事务内维护，不能只补索引。
- RAW metadata admission 的 `all()` 累计约 22.6 秒；当前单次空候选约 94 ms。它被 secondary pump 重复调用，需 cursor/exhausted，而不是每轮从头扫描。
- 纯浏览 profile 中仍有 304 次 drag-info 请求，说明“535 → 44”的旧样本没有代表当前真实旅程，也不能证明预热算法正确。

### 9.2 分钟级关键路径

一次 `browse.session.open` Worker 往返约 1.206 秒后，Main 在向 Renderer 返回数据前仍 `await nativeAssetDragPrimer.primeImmediately(...)`。同一时段 reconciliation 作为 maintenance owner 连续运行至少 66.3 秒；两个 background-primary drag-info 请求等待约 65 秒，记录的 scheduler wait 约 67.8–68.0 秒。浏览 SQL 已完成，但结果被辅助拖拽预热扣在 Main，正好解释“命令变快、内容仍一分钟不换”，并说明把 drag-info 降级为后台反而在同步关键路径上制造了优先级反转。

### 9.3 当前实现结论

- `Serpent-8ee170` 的“首屏 64 项同步、其余分批”方案证伪：必须从 browse 响应关键路径移除第二次 Worker 请求，并取消全结果预热。
- `Serpent-e97c00` 的“事件触发 single-flight 全量刷新”方案证伪：必须拆分增量摘要与按需分页列表，面板关闭时完整列表请求为零。
- `Serpent-be29a9` 的批次让出仍是未完成增量；但应在上述两条自制造负载清除后再评估 continuation 收益。
- §8 的 3/4 文件夹与 3/3 跳转 timeout 仍不能整体作耗时分布：测试未限定非空/不同 scope，空文件夹永远无法通过，跳转也可能发生在不可滚动 scope；不过上述 68 秒 Main 后处理链由独立日志直接证明，至少一个分钟级卡顿不是假阳性。

重新规划与验收顺序已写入实施方向文档 §2.2–4；新增 `Serpent-288cd9` 收口 RAW 空结果重扫。本轮只更新分析、文档与工单，未改生产代码、未运行产品测试、未提交或推送。

## 9. 【第三轮纠偏后的实施与实测】关键路径移除拖拽预热（已用数据证明正向）

主程第三轮文档（§2.2/§3.3/§3.4/§3.9）指认：浏览 SQL 已在约 1.206 秒返回，但 Main 在交给 Renderer 前同步 `await` 首屏 64 项 `media.get-asset-drag-infos`，而该命令在 background-primary，排在 maintenance 后等待约 68 秒——这才是"命令很快、内容一分钟不换"的直接原因。据此只保留一处最小改动并用真 profiler 验证：

**改动**（`src/main/index.ts`）：
1. 浏览响应对拖拽预热不再 `await`（`void nativeAssetDragPrimer.primeImmediately(...)`），Renderer 立即拿到结果；
2. **删除「结果剩余全部后台预热」**（原 `nativeAssetDragPrimer.enqueue(rest)`）；
3. **删除缩略图 ready/failed 触发的拖拽路径重解析**（完成事件不改变源路径）。

**判据修正**（`tests/e2e/navigation-profile.test.ts`）：空文件夹也算内容变化（原实现要求新卡片数 > 0，会把"正确切到空文件夹"记成超时）；跳转前先回到库级 scope（第一行），避免在小/空范围上测跳转。

**同一 harness、同一真实 4.3 万资产库、同一旅程的 A/B**：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 切文件夹：内容真正变化 | min 37 ms；p50 **60,000 ms（超时）**；4 次中 3 次超时 | min **10 ms**；p50 **31 ms**；4 次中 1 次超时 |
| 切文件夹：总耗时 | p50 60,084 ms / max 90,088 ms | p50 30,114 ms / max 90,070 ms |
| 随机跳转：内容变化 | **3/3 全部 30 s 超时** | **16 / 102 / 930 ms，3/3 达标** |
| 滚轮 8 s | frameP95 7.8 ms、long task 0 | frameP95 7.5 ms、long task 0 |
| Worker CPU：`all()` 合计 | 227.3 s（profile 5.8 min） | 41.8 s（profile 3.3 min，约 3× 更少的 SQL CPU/分钟） |
| Worker CPU：`lstat` 合计 | 14.7 s | 12.3 s |

结论：**这一处改动严格正向**（跳转从"全部超时"变为 16–930 ms；切换内容变化从 p50 超时变为 31 ms；SQL CPU 明显下降；滚动帧率不变）。

**仍未做（不得视为完成）**：`e97c00` 需按 §3.3 重做为"摘要/列表拆分 + 事件增量 + 面板按需分页 + 最近列表索引"（本轮 profile 里 `all()` 仍是第一热点）；§3.9 RAW metadata 游标；`be29a9` 真正 continuation；`217028` 判据仍需完成"确认 active scope / 目标非空 / 不把超时常量写进 timing / Main 后处理三段 span"。**未提交、未推送。**

## 10. 第二轮实施：关闭面板不再触发全表重查（已用数据证明正向）

按主程 §3.3 的最小可行部分（不做新协议命令，先去掉自制造负载）：

- `JobStatusCoordinator`：面板关闭时**完成事件不再触发任何状态查询**（`setEventDrivenQueries(false)`），兜底轮询从"活跃 1 s"改为**15 s**；面板打开才恢复"事件即查 + 1 s"。App.tsx 在面板开关 effect 里同步这两个状态。
- 单测：`tests/unit/job-status-coordinator.test.ts` 7/7（新增「面板关闭忽略完成事件」与「面板打开时事件触发查询」两例）。

**Worker CPU profile 三连对比（同一 harness/库/旅程）**：

| 自耗时间 | 修复关键路径前 | 关键路径修复后 | +关闭面板退避后 |
| --- | ---: | ---: | ---: |
| `all()`（`listMediaJobs` 的 SQL） | **227.3 s** | 41.8 s | **3.0 s** |
| `lstat` | 14.7 s | 12.3 s | 11.3 s |
| `readdir` | — | — | 1.7 s |
| `(idle)` | 14.4 s | 118.7 s | **138.0 s** |

**用户可见延迟**：

| 指标 | 最初 | 关键路径修复后 | 本轮之后 |
| --- | --- | --- | --- |
| 随机跳转：内容变化 | 3/3 全部 30 s 超时 | 16 / 102 / 930 ms | **9 / 24 / 911 ms** |
| 切文件夹：内容变化 | p50 60,000 ms（超时） | min 10 / p50 31 ms | min 10 / **p50 34 ms**（4 次中 1 次仍 60 s） |
| 滚轮 8 s | frameP95 7.8 / long task 0 | 7.5 / 0 | **7.0 / 0**（`serpent://` src 写入 4 次） |

结论：这两处改动均**严格正向**且可复现（跳转与切换的内容变化从"超时"变成 10–34 ms 量级，`all()` SQL 从 227 s 降到 3 s，Worker 空闲率从 4% 升到 70%，滚动帧率不变）。

**新的第一热点（下一轮目标）**：`library_worker.js` 的压缩函数 `mf` 自耗 12.7 s，连同 `lstat` 11.3 s、`readdir` 1.7 s —— 即开库对账里的指纹计算与文件探针（§3.1 / §3.9），而不是 SQL。剩余待办：§3.9 RAW admission 游标、`e97c00` 的摘要/列表拆分与最近列表索引（本轮只是把面板关闭时的查询降到 0，面板打开仍是全量列表查询）、`be29a9` continuation、`217028` 判据收尾、以及"4 次切文件夹里那 1 次 60 s"的定位。**仍未提交、未推送。**

## 11. 第三轮实施：让 foreground 后台任务与维护并行（用户复现路径上 37× 正向）

### 11.1 定位（用户给的复现路径：「所有资产」→「Media > Images > 绘画」）

在 `SERPENT_PROFILE_NAV_TARGET=绘画` 复现下，日志时间线把 30–45 秒钉死在一个点上：

```
15:29:42.813 folder.browse-entries            run = 3,905 ms      ← 用户点击
15:29:44.010 LAG drift = 4,407 ms  activity = secondary-media:…
15:29:46 → 15:30:14  STALL ×4  active = reconciliation(maintenance)  runningMs 3,816 → 31,847 ms
15:30:19.101 media.get-artifact-paths         schedulerWaitMs = 34,897 ms   ← 预览路径解析等 35 秒
15:30:19.371 media.get-artifact-paths         schedulerWaitMs = 35,037 ms
15:30:20.052 history.status                   schedulerWaitMs = 33,790 ms
preview-cache: 281 miss / 281 store，其中 15:29:37 → 15:30:19 有 42 秒完全无事件
```

对照 Worker 侧作业耗时：57 个缩略图 job 合计仅 **2,786 ms**（avg 49 ms）→ **慢的不是解码，是准入**。`asset-reconciliation` 本次 33,434 ms，而调度器「同时只允许一个后台任务」使 background-primary 的缩略图泵与 artifact 路径解析全程进不来。

### 11.2 改动

`src/worker/interactive-scheduler.ts` 的 background 准入：

```
- activeBackground < 1 && !hasQueuedMutation
+ !hasQueuedMutation && (activeBackground < 1
+   || (lane === 'background-primary' && onlyMaintenanceActive))
```

其中 `onlyMaintenanceActive` 表示当前唯一后台占用者是 maintenance。即：**维护任务运行时，允许恰好一个服务可见内容的 background-primary 并行**；`background-secondary`（状态轮询）与第二个 background-primary 仍被挡住，避免把并发重新变成风暴。

### 11.3 实测（用户判据：点击 → 当前页 15 张可见缩略图全部 decode；同一 harness、同一真实库）

| 指标 | 改前 | 改后（两次） |
| --- | ---: | ---: |
| 所有资产 → 绘画 总耗时 | 39,791 ms | **6,456 / 6,424 ms** |
| 15 张缩略图全部 ready | 34,589 ms | **933 / 967 ms** |
| 内容变化（浏览查询段） | 5,094 ms | 5,429 / 5,321 ms |

**门禁**：`npm run test:library-availability` 9 files / **214 passed / 1 skipped**；调度器/协调器/拖拽调度单测 **41 passed**。

### 11.4 试过但实测无效、已回退的两刀（留档，避免重复走）

1. 把可见卡 artifact 路径解析从 `background-primary` 挪到 `visible-media`：39,791 → 39,460 ms（噪声内）。
2. 让对账在安全点也让出给 foreground 媒体标签：39,791 → 40,973 ms（噪声内）。

两刀的失败说明瓶颈是**维护任务期间 background 完全不能上车**，而不是车道标签或让出时机。

### 11.5 剩余（下一步目标）

- **内容变化那 5.3–5.4 秒**：`folder.browse-entries` run 3,905 ms + `browse.session.open` queue 5,145 ms，属于浏览查询/SQL 段，现在是这条路径的最大剩余项。
- 对账自身 33 s（`lstat` 14 s + `all()` 5 s + `mf`）：现在不再堵住缩略图，但仍是开库后台负载。
- §3.9 RAW admission 游标、§3.3 摘要/列表拆分与最近列表索引、`be29a9` continuation、`217028` 判据收尾。
- 仍未提交、未推送。

## 12. 当前状态（用户确认性能已明显改善后的收口记录）

### 12.1 用户判据下的最终数字（真实 4.3 万资产库，`SERPENT_PROFILE_NAV_TARGET` 复现）

| 指标 | 会话开始时 | 现在 |
| --- | ---: | ---: |
| 「所有资产」→「Media > Images > 绘画」总耗时 | 39,791 ms | **6,336–6,456 ms** |
| 其中：15 张可见缩略图全部 decode | 34,589 ms | **933–970 ms** |
| 其中：内容变化（浏览查询段） | 5,094 ms | 5,252–5,429 ms（下一个目标） |
| 随机跳转：内容变化 | 3/3 全部 30 s 超时 | 9–151 ms |
| 滚轮 8 s 帧率 | frameP95 7.8 / long task 0 | frameP95 7.0–8.3 / long task 0 |
| Worker `all()`（listMediaJobs）自耗 | 227 s / 5.8 min | 3 s / 3.3 min |
| Worker 空闲占比 | 4% | 70% |

### 12.2 保留的改动与其证据

1. `src/worker/interactive-scheduler.ts`：维护任务占用时允许**一个**服务可见内容的 `background-primary` 并行（`onlyMaintenanceActive`）→ §11 的 37× 结果。
2. `src/main/index.ts`：浏览结果不再 `await` 拖拽预热；删除"结果剩余全部预热"；缩略图完成事件不再重解析拖拽路径。
3. `src/renderer/job-status-coordinator.ts` + `App.tsx`：面板关闭时完成事件不再触发状态查询，兜底 15 s；面板打开才恢复事件即查 + 1 s。
4. `src/main/worker-client.ts`：门控 `SERPENT_WORKER_INSPECT`（仅 profile 用，生产不设即无影响）。
5. 基准与插桩：`tests/e2e/navigation-perf-benchmark.test.ts`、`tests/e2e/navigation-profile.test.ts`、`tests/e2e/perf-bench-helpers.ts`、`scripts/run-navigation-benchmark.mjs`、`src/worker/interactive-scheduler.ts` 的 `yieldAdmission`。

### 12.3 试过、实测中性、已回退（留档避免重走）

- 可见卡 artifact 路径解析改到 `visible-media` 车道：39,791 → 39,460 ms。
- 对账额外让出给前台媒体标签：39,791 → 40,973 ms。
- 形状（width/height）修正窗口合并 150 ms：6,456/933 → 6,336/970 ms。

三次中性实验共同说明：瓶颈是「维护期间 background 完全不能上车」，不是车道标签、让出时机或渲染端批量。

### 12.4 未完成（仍需跟进的工单）

- `Serpent-e97c00`：只做了"面板关闭时查询归零"；**摘要/列表拆分 + 最近列表索引（166.6 → 1.0 ms 已由主程在临时副本证明）未做**。
- `Serpent-be29a9`：仍需要把对账切成可恢复 continuation（当前是准入并行 + 批次边界让出）。
- `Serpent-26f22b`：孤儿扫描已修；**发现遍历的逐文件 `lstat`（12.7 + 11.3 + 3.4 ≈ 27 s/5.4 min）未修**。
- `Serpent-217028`：基准已交付；随机 scope 判据仍有假阴性（新卡片数为 0 时等满预算），`navigationId` 未贯穿协议层。
- 待开新单：**形状随浏览页下发**（`revisions.source_width/height` 为空时才逐条 `asset.dimensions.ready` 修正，导致整页几何反复重算）。
- 未验证：Windows、SMB/NAS、packaged、真实 2 万夹具、Computer Use；四次 profile 运行中有一次出现 Worker `0xFFFFFFFF` 退出（未复现，无 JS 报错）。

## 13. 第四轮实施：导航不再被长预览挡住交互槽（用户实例日志驱动）

### 13.1 证据（用户当前实例日志 `%APPDATA%\Serpent\logs`，2026-09-14 23:57–00:02）

```
15:58:38 STALL waited=2009  active=reconciliation(maintenance, run=55,781ms)  queued=45（~40 条 sync.poll-remote）
16:00:53 STALL waited=2007  active=media.get-preview-artifact(viewer-upgrade, run=12,539ms)  queued=15: browse.session.open, asset.thumbnail.visible-window, …
16:01:23 STALL waited=2010  active=media.get-preview-artifact(viewer-upgrade, run=11,231ms)  queued=8: browse.session.open, folder.browse-entries, …
16:01:43 STALL waited=2005  active=media.get-preview-artifact(viewer-upgrade, run=15,707ms)  queued=5
15:59:11 STALL active=ai.test-connection(background-secondary, run=3,665ms)
```

`media.get-preview-artifact` 是 viewer-upgrade（冷预览/RAW/OIIO 解码、插件），单次 5.6–15.7 秒，却占着**唯一**交互槽，导航与可见缩略图只能排在后面 → 用户体感「切一个 30+ 文件的文件夹卡 20 秒」。

### 13.2 改动

`src/worker/interactive-scheduler.ts`：interactive-control（导航）在 **viewer-upgrade 正在跑时**可另开一个槽；明确**不允许**与 `visible-media` 并行，保住「变更需要完全空闲」的既有保证。首次放宽过头（导航可与 visible-media 并行）被既有测试 `does not starve a library transition behind the interactive backlog` 抓住，收窄后 28 个调度器测试全绿。

### 13.3 实测

| 场景 | 结果 |
| --- | --- |
| 预览在解码时切文件夹（`SERPENT_PROFILE_CONTENDED=1`，19 张可见卡） | **45 / 126 ms** |
| 对照：改前实例日志 | 预览 run 5.6–15.7 s，`browse.session.open`/`folder.browse-entries` 排队 2 s+（队列 5–15 条） |
| 滚轮 8 s | frameP95 6.8 ms、frameMax 11.7 ms、long task 0 |

判据修正：目标 scope 无可见图片卡（空文件夹/非图片）时不再空等到 60/90 秒，连续两次采样确认后即返回。

### 13.4 本窗口 Worker 热点与剩余阻塞

- `mf`（指纹计算）**10.4 s** 成为第一自耗，`lstat` 11.6 s、`readdir` 1.3 s、`all()` ≈ 2.5 s（对应 §3.1/§3.9 与 `Serpent-26f22b`）。
- 用户实例日志里仍可见：`sync.poll-remote` 把维护队列堆到 45 条；`ai.test-connection` 反复占用后台槽 2–3 秒。两者都需要 single-flight/合并/退避。

## 14. v0.2.3 发布期间的全量门禁证据有效性（2026-09-15）

### 14.1 现象：一次「4 failed」的运行整体不可用

发布分支上跑 `npm run verify:mainline`：wall time 从 00:47:59 到 11:36:59（≈10.8 小时），
结果 `4 failed | 4843 passed | 29 skipped (578 files)`。四项失败都很可疑：

| 失败项 | 该次运行中的表现 |
| --- | --- |
| `large-batch-import-reliability` | 报 `Test timed out in 900000ms`，同一行却记录 `38934769ms` |
| `reconciliation-performance`（事件循环 p95） | `expected 121.95169999999962 to be less than 75` |
| `import-planning` / `library-zip` | `afterEach` 清理临时目录时 `ENOTEMPTY` |
| 其余 | 大量 `[vitest-pool]: Timeout terminating forks worker` |

同一份代码在发布前的全量运行里这四项是绿的，且这四项都不是本次改动新增的用例。

### 14.2 根因：宿主在运行中途进入睡眠，vitest 定时器被冻结

系统日志给出了直接证据（时区为宿主本地时间）：

- `Kernel-Power 42`（00:53:14 进入睡眠）→ `107`（00:53:18 短暂恢复）
- `Kernel-Power 130/131`（11:34:03 固件 S4 转换）→ `Power-Troubleshooter 1`（11:34:06 从低功耗状态恢复）

也就是 00:53–11:34 这段宿主不执行桌面任务：wall clock 继续走，定时器不走。于是
900 秒的超时回调在约 10.8 小时后才触发（记录值 38,934,769 ms），恢复瞬间的调度抖动把
事件循环 p95 抬到 122 ms，句柄/杀毒在恢复后短暂占用导致临时目录删不掉。

### 14.3 逐项复现（宿主清醒，单文件跑 Electron runner）

命令：`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts <file>`；宿主 CPU 7–18%。

| 用例 | 结果 |
| --- | --- |
| `reconciliation-performance` | 7 passed；`elapsedMs 1276.5`、`eventLoopLagP95Ms 41.6`、`eventLoopLagMaxMs 61.5`（门槛 75 / 1000） |
| `import-planning` | 57 passed / 1 skipped |
| `library-zip` | 29 passed |
| `large-batch-import-reliability`（5 万小文件） | 1 passed，466 s（< 900 s 超时） |

结论：四项失败全部是宿主睡眠/恢复造成的假红，不是回归。

### 14.4 判读规则（下次照此执行）

1. 全量门禁的 wall time 明显超过历史水平（本套件正常在几十分钟量级）时，**先查宿主电源事件**
   （`Kernel-Power` 42/107/130/131、`Power-Troubleshooter` 1）再判定回归。
2. 超时类与 event-loop lag 类断言在睡眠/恢复之后**不能作为证据**；必须在清醒宿主上单跑复现。
3. 跑长门禁时用 `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` 挡住空闲睡眠
   （不改持久电源设置，进程退出即释放）；人为睡眠/合盖仍会打断，跑完必须核对起止时间。
4. 单文件复现不要用裸 `npx vitest`：`npm run test` 走
   `scripts/run-vitest-with-electron.mjs`（Electron ABI），系统 Node 加载 `better_sqlite3.node`
   会报 `NODE_MODULE_VERSION 148 / 137` 不匹配，把「环境错」误读成「测试失败」。

### 14.5 顺带修掉的确定性红灯：迁移黄金快照落后一个版本

`tests/worker/migration-checksum-snapshot.test.ts` 的 `GOLDEN_CHECKSUMS` 停在 v48，
而 `MIGRATIONS` 已有 v49（`LINKED_FOLDER_PARENT_SCHEMA_SQL`，链接文件夹父级，2026-09-12 落地时未同步）。
逐项核对 v1–48 的 checksum 与快照完全一致（说明已发布迁移的 SQL 没有被改动），只追加 v49 一项；
`migration-checksum-snapshot` + `migration-discipline` 共 9 passed。迁移本身未改动。

### 14.6 第二次作废：并行轨道执行 `npm start` 杀掉了整轮门禁

加上防睡眠后重跑（11:46:17 起），`lint` / `typecheck` / `extension:verify` / `test:library-availability`
全部通过，`test` 段也在持续通过（日志里成片 `✓`），但整轮在 11:54:46 以 `exit=-1`（Windows 进程被强杀）
终止，`test` 段的通过证据随之作废。

时间线对得上：另一条并行轨道 11:54:21 执行 `npm start` → `scripts/dev-start.mjs` 调
`killStaleSerpentDevProcesses()`，其 Windows 分支是 `Get-Process -Name electron | Stop-Process -Force`；
对方 electron 于 11:54:43 启动，本轮的 vitest 主进程/worker 随即被一起杀掉（11:54:46），
日志留下成批 `[vitest-pool]: Timeout terminating forks worker`。

根因：本项目 `npm run test` 走 `scripts/run-vitest-with-electron.mjs`，**测试运行本身就是 electron.exe**，
而清理函数按进程名全机匹配。已开 `Serpent-9e21f8`（P1）要求 Windows 分支改为按本仓库可执行文件路径匹配。

同时记住：共享工作树里另有轨道在改 `src/`，全量门禁跑的是**含他人未提交改动的工作树**，
不是单一提交；报结论时必须写明这一点，必要时只作定向复现。

本轮已取得的定向证据（均在清醒宿主上单跑，见 §14.3）仍然有效，因为它们不受该强杀影响。

## 15. P0A 实施：端到端导航观测（`Serpent-217028`）

计划 §4 顺序的第一项是「先修正 profile 判据并加入 Renderer → Main → Worker → Main 后处理 →
Renderer commit 的相关 span」。Main 一侧的四段 `performance.navigation` 阶段（`main-enter`、
`worker-returned`、`main-response-ready`、`main-return`）与 preload 的 `navigationId` 已由并行轨道加入，
但 **benchmark 从未解析它们**：报告里没有任何 Main 后处理数据，点击与导航只能靠时间窗猜。本轮补齐两侧的接缝。

### 15.1 改动

| 文件 | 改动 |
| --- | --- |
| `src/worker/index.ts` | `worker.cmd` 诊断行携带命令上的 `navigationId`（仅 `SERPENT_WORKER_CMD_LOG=1` 时输出，不进入生产日志） |
| `tests/e2e/perf-bench-helpers.ts` | 新增 `summarizeNavigations()`：按 `navigationId` 把 Main 四阶段与 Worker 命令 span 组装成一条链；`BenchLogSummary` 增加 `navigations.{count,stages,aggregates}`。**报告只出现匿名标签 `nav-1…`**，原始 id / requestId 一律不落盘 |
| `tests/e2e/navigation-profile.test.ts` | ① 每次切换记录真实 DOM 点击时刻，运行后与导航记录缝合，产出 `rendererDispatchMs`/`mainReceiveMs`/`mainWorkerMs`/`workerRoundTripMs`/`workerSchedulerWaitMs`/`workerRunMs`/`mainPostProcessMs`/`mainToIpcReturnMs`/`mainReturnToCommitMs`；② 可见缩略图新增 `firstThumbnailMs`、`thumbnails90Ms`（原来只有 100% 一个数）；③ 跳转判据改成显式五选一结论；④ 新增断言：每个被测切换都必须能对上一条 Main/Worker 导航 span |
| `tests/unit/perf-bench-helpers.test.ts` | 新增 2 例：阶段组装与聚合（缺失阶段不得当成 0 ms）、隐私（序列化结果不含原始 navigationId） |

### 15.2 实测（真实 4.3 万资产库，4 次切换 + 6 s 滚轮 + 3 次跳转）

`chainMatched 4 / misses 0`——每次切换都按 id 对上了 Main 与 Worker 的 span。四段拆解（p50，ms）：

| 段 | p50 | 读法 |
| --- | ---: | --- |
| `rendererDispatchMs` | 16.2 | DOM 点击 → 渲染端发出浏览请求 |
| `mainReceiveMs` | 0 | preload → Main 接收 |
| `workerSchedulerWaitMs` | 0.11 | Worker 准入等待（本轮已不再排队） |
| `workerRunMs` | 3.33 | Worker 执行（p95 7.77） |
| `mainPostProcessMs` | 0.46 | **此前完全缺失**：Main 从 Worker 返回到响应就绪 |
| `mainToIpcReturnMs` | 0.61 | Worker 返回 → IPC 返回 |
| `mainReturnToCommitMs` | 77 | Main 返回 → 渲染端内容提交 |

用户可见侧：内容变化 p50 138.1 ms、首张缩略图 p50 1,841 ms、90% 解码 p50 1,841 ms、100% 解码 p50 1,841 ms
（4 次全部 100% 覆盖，无 timeout；本例 11 张可见图几乎是同时解码，所以 90% 与 100% 重合）。
跳转（滚轮驱动）：3 次真实样本 3,000 / 3,676 / 4,009 ms，另有 1 次 `no-scroll` skip。

结论：这条路径上 **Main 后处理不是瓶颈**（<1 ms），波动来自 Worker 执行与页面查询（`mainWorkerMs` p95 216 ms），
而渲染端从收到响应到内容提交稳定在 55–116 ms 量级；首图到全解码之间还差约 100 ms。有了这条链，
后续任何改动都能直接看「变慢的是哪一段」，不再靠 p50 总分位猜。

### 15.3 判据修正：跳转必须给出明确结论

原判据把「跳转后可见集合 30 s 没变」一律记为 timeout。实测第一跳：滚动位移 318,883 px、
scope 未变、可见卡数 20→20，而同轮另两次跳转 270 ms / 1,105 ms 正常——位移确实发生、基线也不含占位卡，
所以这个 timeout 既不是「滚动没生效」也不是「基线是脏的」。继续定位发现更深一层：
**`element.scrollTop = …` 直接赋值不是用户手势**，应用的滚动恢复把它当作无需保留的位置而在约 1 s 内放回原位
（三次尝试全部 `restored`）。这本身是符合产品的行为，却让「跳转延迟」永远测不到。

现在的 `measureScrollJump()` 改为**用真实滚轮输入驱动**（指针移到画布中心后 `mouse.wheel(±Δ)`，Δ 交替方向），
并在位移稳定后给出五个结论之一：

- `changed`：内容提交，计入延迟样本；
- `restored`：位移发生过但视口被应用放回原位——没有导航请求，记 skip；
- `no-scroll`：滚轮完全没推动（位移 < 8 px），记 skip，并用下一个 Δ 重试（首次输入常落在应用仍在收敛的窗口里）；
- `unsettled`：基线一直含占位卡，记 skip；
- `no-commit`：位移稳定保持、内容在整个预算内始终没到——**唯一记 timeout 的分支**。

并新增断言：只要库级 scope 可滚动，跳转必须至少产出 1 个真实样本——「全部 skip」不能算绿。
注意口径变化：滚轮驱动的跳转包含平滑滚动动画，因此 `jump.changedMs` 与旧的直接赋值样本（270–1,105 ms）
不可直接比较，它不是「变慢了」，而是测量对象从「赋值到重绘」变成「用户滚动输入到新卡片提交」。

### 15.4 环境事实（本轮测量口径）

本轮 profile 在**仓库外的隔离工作副本**上完成，原因是主工作树当时的两个状态都无法测量，两者都只存在于未提交状态，
不是产品缺陷：

1. 已提交的 `acb03678` 在 `src/worker/library-service.ts` 里缺少一处 `import {`，该提交本身不可解析（构建直接报错）；
2. 主工作树的 preload 在 **sandbox preload** 里 `import { randomUUID } from 'node:crypto'`，
   沙箱 preload 不提供该模块 → `Unable to load preload script` → 渲染端没有 `serpent` 桥 → 界面停在
   「没有活动资源库」且全部控件 disabled。库其实是打开成功的（同一份日志里 `recent-library.restored`）。

第 2 条已作为评论记录在 `Serpent-217028` 上（含修法建议：preload 用 Web Crypto、或把 id 生成放到 Renderer/Main）。
隔离副本 = 该提交 + 上述两处就地修复（仅存在于副本内，未进仓库）+ 本轮改动；这样基线可复现，
也不会再被并行轨道的中间状态打断。**本节的数字只对这条隔离基线成立**，主工作树修好后需原样复跑一次确认。

### 15.5 验证

- `npx tsc --noEmit`：0 error；`npx eslint`（改动文件）：0 error；
- `npx vitest run tests/unit/perf-bench-helpers.test.ts`：6 passed；
- 真实库 profile（最终一轮）：`1 passed (46.8s)`、`timeouts {}`、`chainMatched 4 / misses 0`、
  `jumpMeasured 3`（另 1 次 `no-scroll` skip），切换与跳转均无 `no-commit`（见 §15.2）。

## 16. P0C 实施：媒体任务状态摘要的 O(1) 读（`Serpent-e97c00`）

计划 §3.3 指认的第一热点是任务状态读取：`GROUP BY status` 要遍历整个媒体任务历史
（真实 4.3 万资产库、约 8.9 万条历史任务，中位约 110 ms），而任务面板与常驻状态栏会反复读它。
并行轨道已提交该查询的排序索引（v50 `jobs_library_created_desc`，计划里已证明列表页 166.6 → 1.0 ms），
但**计数仍是每次全表扫描**：读路径上 20 次读取要花 2.1 秒 Worker 时间。

### 16.1 做法：零钩子、按既有序列失效

摘要缓存不去每个任务写路径挂钩子，而是复用既有触发器维护的两个持久序号：

- `jobs` 的 insert/update/delete → `library_change_on_jobs_*` → bump `library_change_sequence`；
- 忽略规则变化 → `browse_change_on_*_ignored_paths_*` → bump `browse_change_sequence`
  （计数带可见性过滤，忽略规则必须能让摘要失效）。

两者组成有效性 token，各读一行，并且**从读连接直读、不抛错**：`listMediaJobs` 是读路径，
不能因为序号表缺失或异常把面板读取变成 `LIBRARY_CORRUPT`（取不到 token 就本次不进缓存，退化为原行为）。

新增 `src/worker/media-job-status-summary.ts`（`read` / `store` / `invalidate` / `stats`），
陈旧窗口 3 s——**必须大于面板约 1 Hz 的轮询间隔**，否则繁忙队列下每次读取都会过期重算，缓存等于没有。
诊断行 `media.job-summary` 输出 rebuild / hit / stale-hit 与覆盖任务数，进入 benchmark 报告；
`SERPENT_JOB_SUMMARY_CACHE=0` 可回到旧行为，用于同树 A/B。

### 16.2 同树 A/B（真实 4.3 万资产库，仅开关不同）

各 20 次 `listMediaJobs({summaryOnly:true})`，200 ms 间隔模拟面板轮询；两轮都无 timeout：

| 指标 | 关缓存 | 开缓存 |
| --- | ---: | ---: |
| 读取 p50 | 98.2 ms | **3.1 ms** |
| mean / p95 / max | 103.9 / 122.3 / 152.7 ms | **9.3 / 4.2 / 124.5 ms** |
| 20 次读取 Worker 总耗时 | 2,078.3 ms | **186 ms（−91%）** |
| 摘要重算次数 | 25 | **2（命中 23）** |
| 正确性 oracle | 相等 | 相等 |

正确性 oracle：同一次运行里再读一次**强制走 SQL 的完整路径**，两者六个计数必须一致；但队列活跃时
两次读取之间计数本就会变，所以只在「两次读取之间队列状态未变」（用队列快照比对判定）时才断言——
第一版无条件断言把关缓存的一轮判成了 false，属于判据问题，已修正留档。

### 16.3 测试

- `tests/unit/media-job-status-summary.test.ts`（4）：命中/有界陈旧/过期重算、按库隔离与显式失效、
  分组行折算与未知状态不混入。
- `tests/worker/media-job-summary-cache.test.ts`（2）：重复读取与 SQL 路径一致；写入一个任务后摘要
  在陈旧窗口内收敛（证明序列失效真的生效，而不是靠钩子）。

### 16.4 未完成边界（不得视为 §3.3 全部完成）

- 仍是「序号校验 + 有界陈旧（≤3 s）」，不是事务内 O(1) 增量；
- 最近列表未做 cursor 分页（面板打开仍取 500 行，只是已有排序索引）；
- 忽略规则变化后的批量修正未做（当前靠 token 变化触发下一次重算）；
- 面板**打开**场景的独立 profile 未跑（本轮用 bridge 直读 20 次模拟）；
- 主工作树未复跑：本节的 A/B 在主工作树完成，但改动尚未提交（见 §16.5）。

### 16.5 提交阻塞（repo 状态事故）

本轨改动必须落在 `src/worker/library-service.ts`，而该文件在 dev HEAD 上被截断：HEAD blob
46,538 行 / 1,848,590 字节 / **662 处语法错误**，工作树同名文件 46,757 行 / 1,903,421 字节 / **0 处**——
少约 55 KB（约 219 行），不是两行笔误。同时该文件在工作树里还带着**另一条轨道的未提交改动**
（334 增 / 119 删、93 个 hunk）。已开 `Serpent-74aaed`（P1）。在作者轨道提交完好版本之前，
本轨先落地与之无关的部分（新模块、测试、harness、本日志），接线随后补。

## 17. P0D 实施：RAW metadata 回填的「扫完即停」游标（`Serpent-288cd9`）

计划 §3.9 的第二个 `all()` 热区来自 RAW metadata 准入：旧实现只有一个 **2 秒节流**
（`RawMetadataBackfillAdmissionGate`），即使全库 RAW 都已有任务/产物，secondary pump 每 2 秒仍会
重跑一次昂贵候选探测（真实库单次约 94 ms，profile 里累计约 22.6 秒）。

### 17.1 关键区分：节流 ≠ 扫完

旧门控无法区分两件事，而修复的关键是让服务把**候选探测的真实结果**回报出来：

- **节流**：两次探测之间至少间隔 2 秒（保留）；
- **扫完（exhausted）**：探测没有用满准入预算 → 当前没有待处理的 RAW 资产；
- **上限截断**：已有 queued/running/paused 的 `extract_metadata` 占满预算时也会返回 0 结果，
  这**不算扫完**（否则会在还有 RAW 待处理时停止重扫）。

因此 `enqueueRawImageMetadataJobs` / `enqueueRawImageMetadataBackfill` 现在返回
`{ admitted, probed, budgetCapped }`：`probed` 是候选查询返回行数，`budgetCapped` 在「用满预算」
或「全局上限已满」或「定向（显式 assetIds）探测」时为真——定向探测永不参与扫完判定。

### 17.2 精确失效：复用两个持久序号

门控的 `exhausted` 状态带一个有效性 token = 库变更序号 + 忽略规则序号（`getChangeSequence` /
`getBrowseChangeSequence`）。四类失效天然覆盖：新增 RAW、revision 变化、retry 都会 bump
`library_change_sequence`；忽略规则变化 bump `browse_change_sequence`。取不到 token（老库缺表等）
时退化为纯节流，不阻塞 pump。

诊断行 `raw-metadata.admission`（`SERPENT_WORKER_CMD_LOG=1`）输出 admitted/probed/budgetCapped/
exhaustedSkips，并进入 benchmark 报告；`SERPENT_RAW_METADATA_EXHAUSTION=0` 可回到旧行为用于 A/B。

### 17.3 验证

- `tests/unit/raw-metadata-backfill-gate.test.ts`（6 passed）：节流窗口、按库隔离与关闭清理、
  **「扫完后连续 100 个 turn 不再探测」**（工单验收条目）、token 变化精确重新武装、
  上限截断不得判为扫完、无 token 时退化为节流。
- `tests/worker/raw-metadata-admission.test.ts`（2 passed）：排空的库回报
  `{admitted:0, probed:0, budgetCapped:false}` 且重复探测保持该信号；用 64 个 queued
  `extract_metadata` 占满预算时回报 `budgetCapped:true`（不会误判为扫完）。
- `npm run test:library-availability`：9 files / 216 passed / 1 skipped（本轮改了 `library-service.ts`，强制）。
- 真实库 40 秒 idle profile：开启游标后**只发生 1 次探测**并判定 drained
  （`probes 1 / drainedProbes 1 / cappedProbes 0`），无 timeout。

### 17.4 未取得有效 A/B，如实记录

同一对 idle profile 没能构成对照：先跑的那一轮库里仍有大积压（40 秒完成 1,768 个缩略图任务），
secondary pump 每轮都在处理积压、**从未走到 RAW 探测分支**（`probes 0`）；后一轮队列已排空
（87 个任务）才走到 1 次探测。两轮起点不同、pump 是否到达探测分支也不同，所以
「探测次数 / 累计探测耗时」的前后差**不能归因于本次改动**。旧实现累计 22.6 秒的证据来自
忙库 profile，要复现对照需要在「pump 持续有活可干且 RAW 已排空」的同一状态下交错测量。

### 17.5 未完成边界

- 游标只在进程内（Worker 重启后从「未扫完」开始，会重扫一次再判定），未持久化；
- 未落地「持久化规范化扩展名/媒体分类 + 候选索引」，因此候选查询仍是 9 个 `LIKE` 后缀 +
  多组反连接（计划 §3.9 要求以 `EXPLAIN QUERY PLAN` 和 20k/真实库扫描行数证明索引命中，
  本轮未做，也没有把简单 RAW-id 临时表方案照搬——计划已指出它会退化到约 250 ms）；
- 每片「条数 + 连续毫秒」双预算尚未实现（当前仍是准入预算 + 2 秒节流）。

## 18. 链接文件夹「移入回收站」事故与语义修订（`Serpent-7edf6e`）

### 18.1 用户现场

用户在开发实例里把一个约 1.5 万文件的链接文件夹「移入回收站」：界面长时间无响应、没有任何进度。
日志给出确切现场——`worker.scheduler.stall` 每 30 秒报一次同一个 owner：

```
active=[{label:"linked-folder.delete-subtree", lane:"mutation", runningMs: 60259 → 511290}]
waitedMs: 60016 → 511047        期间 4 次 main.library-request 以 WORKER_REQUEST_TIMEOUT 结束
```

即：**一个 mutation 命令独占调度器 8 分钟以上**，缩略图/浏览/状态查询全部被饿死，渲染端连
「进行到哪了」都问不到；前段还有 40 次 `linked-folder.sync.asset-missing` + `assets.sync.reconciled`
（删除期间链接 watcher 在反复对账）。

### 18.2 根因（实测）

`deleteLinkedFolderSubtree(deleteFromDisk:false)` 每 20 个资产一批调用 `deleteLinkedAssets`，
而后者对**每个文件** spawn 一次系统回收站 helper：

| 测量 | 结果 |
| --- | --- |
| 单文件 `windows-trash.exe` | **126 ms**（8 个文件 1010 ms） |
| 1.5 万文件外推 | **约 31 分钟** |
| 对照：整目录一次回收 2000 文件 | 629 ms（约快 400 倍） |
| 多路径一次传参 | 有效（可批量化，但仍是系统回收站语义） |

引入该实现的提交是 `a6bbe982`（2026-07-19，澄清 #7），代码注释写明当时的前提：
「linked bytes are not library-owned, so they cannot enter the app trash」——即把「应用回收站」
等同于「把字节搬进 `.serpent/trash`」。该前提写在 `0007` / `scope-decisions` 里，且当时就标了
「需确认：链接资产是否也应有 Serpent 级回收站？」，一直没有答案。

### 18.3 用户裁决与语义修订

- **链接文件夹**：没有「移入回收站」。动作收敛为「移除链接文件夹…」（只删链接记录，源文件一律不动）
  与「强制从硬盘删除…」（永久删除，**不再使用系统回收站**）。
- **链接文件夹内的文件**：只有「强制从硬盘删除…」，没有「移入回收站」。
- 「移除」与「强制删除」都必须有进度条。
- 「转换为普通文件夹」（复制进库成为托管）另立 `Serpent-8e47de`（P2，暂不实现）。

### 18.4 改动

| 文件 | 改动 |
| --- | --- |
| `src/worker/library-service.ts` | 链接源文件删除改为**永久删除**（`rmAsync`，可注入 `removeLinkedSourceFile` 覆盖错误路径）；恢复日志从「每文件两次写」降到「每 25 个文件一次 + 失败/收尾」；`delete.progress`（`kind:'disk'`）覆盖整个删除；`removeLinkedFolder` 改为异步分批删除（500/批）+ 批间让出 + `delete.progress`（`kind:'linked-remove'`，可静默）；`deleteLinkedFolderSubtree` 子树一次交给统一例程（内部分批 20，单一进度流），`deleteFromDisk:false` 变成「只删链接记录」；`deleteAssetsFromDiskAsync` 接受链接资产并分流；删除 `trash` helper 与 `execFile` 依赖 |
| `src/renderer/commands/*` | 链接文件夹不再提供「移入回收站」（`visible` 仅托管 + `run` 防御）；「从库中移除」改为「移除链接文件夹…」；「从硬盘中删除…」对链接显示为「强制从硬盘删除…」；链接资产同样只保留强制删除（含多选计数与标题） |
| `src/renderer/{App.tsx,AssetContextMenu.tsx,use-folder-delete-actions.ts,use-browse-command-keyboard.ts}` | 拆掉所有直达旧路径的接线：键盘 Delete 对链接资产不再触发回收站、多选回收站不再含链接分支、`trashLinkedFolderSubtree` 动作整体移除 |
| `forge.config.ts` / `scripts/verify-package.mjs` / `package.json` | 移除 `trash` 依赖与 asar 解包规则、移除包校验里的系统回收站 helper 断言（`npm uninstall trash` 掉了 31 个包） |
| i18n / 文档 | 新增「移除链接文件夹…」「强制从硬盘删除…」中英文案；删除已无引用的 `linkedSubtreeTrashed`/`removeFromLibrary*`；修订 `0007:43`、`scope-decisions:22`；验收清单更新 `FOLDER-014` 并新增 `LINKED-REMOVE-001` |

### 18.5 实测（2000 个链接文件的临时基准，仓库外运行）

| 指标 | 旧实现（逐文件系统回收站，按 126 ms/文件推算） | 新实现 |
| --- | ---: | ---: |
| 2,000 文件删除耗时 | 约 252 s | **4,011 ms**（2.01 ms/文件） |
| 进度事件 | 0（完全没有） | **219 个**（0→2000，终态 2000/2000） |
| 失败数 / 残留索引 | — | 0 / 0 |
| 源目录 | 进系统回收站 | 永久删除（源目录已移除） |

外推到用户的 1.5 万文件：约 31 分钟 → **约 30 秒**，并且全程有进度。
剩余的单文件成本主要来自「每批最多 20 个 id」的公开契约造成的批次开销（每批一次日志行 + 让出），
若将来仍觉慢，可在公开契约之外为文件夹子树放宽批量。

### 18.6 验证

- `npm run test:unit`：**475 files / 3513 passed / 5 skipped**；
- `npm run test:library-availability`：9 files / 216 passed / 1 skipped（改了 `library-service.ts`，强制）；
- 受影响 worker 测试（trash-relink / folder-delete / linked-folders / media-job-summary-cache / raw-metadata-admission）：全部通过；其中 trash-relink 的 6 个用例按新语义改写（注入缝 `trashItem` → `removeLinkedSourceFile`，「落到系统回收站」断言 → 「源文件永久消失」），覆盖未减；
- `npx tsc --noEmit` 与改动文件 eslint：0 error；
- 打包链路：`npm run package` 首次因连 github.com 超时失败（`ETIMEDOUT 20.205.243.166:443`，与本次改动无关）；
  带 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 重试后 **`package` exit 0**、
  **`verify:package` exit 0**（移除 `trash` 依赖与解包规则后，包校验仍通过），随后 `rebuild:native` FTS5 probe OK；
- 临时基准脚本（2000 文件）用完即删，测量数字记在本节 §18.5。

### 18.7 用户实测后的两处修正（同日）

用户在真机点「移除链接文件夹」时看到两件事：

1. **弹窗标题错成「正在清空回收站」**。原因不是文案，而是进度事件语义：`deleteOverlayTitleKey()`
   把 `kind:'permanent'` 映射为 `progress.purgingTrash`（`permanent` 属于「清空回收站/永久删除」语义），
   而我为「移除链接记录」复用了这个 kind。修正：协议 `delete.progress.kind` 新增 **`'linked-remove'`**，
   `removeLinkedFolder` 与子树「只删链接记录」分支改用它，渲染端新增
   `progress.removingLinkedFolder`（中英：「正在移除链接文件夹」/「Removing linked folder」），
   单测补上该映射。回收站清空的 7 处 `permanent` 保持不变（替换时曾误伤，已逐一核对回改）。
2. **菜单顺序**：用户要求「移除链接文件夹」排在「强制从硬盘删除」**之前**（移除只删链接记录、可再次导入，
   比永久删除安全）。已调整 `AssetContextMenu.tsx` 的删除组顺序；托管分支不受影响（该位置本就没有
   移除项）。
3. E2E `tests/e2e/linked-folders.test.ts` 的三处断言仍按旧菜单点击「移入回收站」，已按新语义改写：
   链接资产菜单**不再有**「移入回收站」、只有「强制从硬盘删除…」，对已缺失源文件的条目同样生效。

### 18.8 链接资产「强制从硬盘删除」走通到端（同日）

§18.7 改写后的 E2E 仍然红：`expect(getByText('delete-me.png')).toHaveCount(0)` 收到 1。**这不是删除逻辑没生效，
而是测试漏了一步**——「强制从硬盘删除」在 Main 进程由危险操作确认窗把关
（`criticalRendererRequest` 含 `asset.delete-from-disk.request`，每次都必须确认、不能记住、不能被 MCP 权限绕过），
测试点完菜单项就直接断言，确认窗一直挂着，请求根本没发出去。按 `organization-search-trash.test.ts` 的既有写法
（`application.windows()` 等确认窗 → 点确认）补上 `confirmAssetDiskDelete()`。

顺带修正一处用户可见的语义不一致：链接资产的确认窗原本沿用托管资产的通用文案
（「从磁盘删除这些资产？」+「选定的 N 项资产将被永久删除」），而同一操作的**文件夹**版本
（`linked-folder.delete-subtree.request`，`deleteFromDisk: true`）早就写明「从磁盘删除链接文件夹内容？/ 源文件将被永久删除」。
链接资产同样是**永久删除源文件、不进系统回收站**，文案必须点明：

| 项 | 改动 |
| --- | --- |
| `src/shared/protocol/requests.ts` | `asset.delete-from-disk.request` 增加**可选** `locationKind: 'managed' \| 'linked' \| 'mixed'`，注释写明它只是文案提示，不参与删除决策 |
| `src/main/index.ts` | 把 40 余行的嵌套三元拆成 `criticalRendererOperation()` + `criticalRendererCopy()`；新增 `linked-asset` 操作分支：标题「从磁盘删除这些链接资产的源文件？」、正文「选定 N 个链接资产的源文件将被永久删除，库内的链接记录也会一并移除。」、细节补「不会进入系统回收站」。`'mixed'` 沿用通用文案（通用说法对混合选择同样成立） |
| `src/renderer/App.tsx` | 新增 `assetSelectionLocationKind()`：按当前列表的 `locationKind` 推导提示并随请求下发（渲染层知道、Main 无数据库访问、Worker 仍按 `assets.location_kind` 自行分流）；`requestAssetDiskDelete` / `deleteManagedAssetsFromDisk*` / `executeSelectionDiskDelete` 透传 |
| `src/renderer/useBatchActions.ts` | 删除早已无人调用的 `trashLinkedAssets()`（旧「逐文件进系统回收站」实现）与 `LINKED_DELETE_CHUNK`；`deleteManagedAssetsFromDisk()` 增加可选 `locationKind` |
| i18n | 删除随之成为死文案的 `toast.deleteLinkedPartial` / `deleteLinkedWithTrash` / `deleteLinkedFailed`（其中 `deleteLinkedWithTrash` 仍在描述「源文件已移入系统回收站」的旧行为） |
| `src/worker/library-service.ts` | `deleteLinkedFolderSubtree` 的文档注释仍在描述「OS trash / 空目录回收」，按现行语义重写（无行为改动） |

验证（本轮同树，最终一轮）：

- `npx vitest run tests/unit`：475 files / **3514 passed** / 5 skipped（新增 1 例协议断言）；
- `npm run test:library-availability`：9 files / **216 passed** / 1 skipped（改了 `library-service.ts`，强制跑完）；
- `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/trash-relink.test.ts tests/worker/folder-delete.test.ts`：2 files / **105 passed** / 2 skipped；
- `node scripts/run-e2e.mjs tests/e2e/linked-folders.test.ts`：**4 passed / 1 failed（1.1 min）**——新增的链接文件夹动作用例（本轮重写后连续 3 次绿）通过，
  唯一失败是既有的移动身份用例，踩的正是下面 §18.8.1 的预存在 P1（`Expected 3, Received 4`，轮询 20 s 超时）；
- `npm run typecheck`、`npm run lint`：0 error（lint 仅 1 条既有 warning，在本次未触碰的文件）；
- 顺带跑的 `tests/e2e/critical-confirmation.test.ts` + `tests/e2e/organization-search-trash.test.ts`：前者全绿；后者部分用例在**导入步骤**失败
  （页面快照是「导入失败 / A library transition is already in progress.」），与本次改动无关——这是已存在的 P1 `Serpent-283094`
  （新建资源库后立刻导入必然踩到 transition 锁，工单里已记录「`git stash` 干净 HEAD 复跑同样失败」）。本次没有把该失败算作自己的绿，
  也没有顺手改（属另一条轨道，需先定方案），已在工单下补记本轮复现。

用例本身的两次返工（都记在这里，避免后来者重踩）：

1. **第一版**用「移除链接文件夹 → 重新导入 → 强制从硬盘删除」覆盖两个动作，重导入这一步在本机不稳（菜单点击会被上一操作的 UI 刷新吃掉），
   改为：先对链接根下的**子文件夹**执行「强制从硬盘删除…」（子树源文件永久消失、链接根保留），再对根执行「移除链接文件夹…」——
   既不依赖重导入，又顺带覆盖了子目录子树删除这条路径；磁盘进度的总数相应是子树里的 1 个文件，移除进度是根下剩余的 3 个。
2. 菜单顺序断言后必须 `Escape` 关掉右键菜单：菜单 backdrop 会拦截后续行上的点击（否则表现为 `locator.click` 30 s 超时）。

#### 18.8.1 顺带定位到的预存在 P1：链接文件夹外部移动的身份归并会永久分叉（`Serpent-463571`）

`linked-folders.test.ts` 的「外部移动保持资产身份」断言本轮间歇性红（本机 5 次 2 次红）。用**不含任何删除操作**的最小临时 E2E
（导入链接文件夹 → `renameSync` 移动一个文件 → 点「刷新磁盘变化」→ 轮询 `listAssets`）定位：

| 树 | 运行 | 结果 |
| --- | --- | --- |
| 干净 HEAD `13115e09`（`git worktree` 独立检出，无未提交改动） | 2 次 | **2/2 失败**：`b.png` 停在 missing + `moved-b.png` 变成新资产，24 秒 12 次轮询都不收敛 |
| 当前工作树 | 2 次 | 1 次不收敛、1 次立即收敛 |

根因：手动刷新走 `refreshManagedAssets()` → `reconcileMovedLinkedAssets()`（按 `source_device + source_inode` 认领新路径，正确），
而 watcher 增量路径 `refreshLinkedWatcherFileChanges()` 在构造 discovery 时**预设** `movedLinkedAssetsReconciled: true`，
从不做移动归并却照常落库（旧路径 missing + 新路径新资产）；一旦它先跑，后续全量刷新再也认领不回那条新记录
（归并只处理 `entry.assetId === undefined` 的路径），分叉永久保留。**与本次链接文件夹删除改动无关**
（该路径不在本次 diff 内，且不涉及任何删除的脚本即可复现），已按 P1 开单并给出限定作用域的修复方向，
是否本轮修由用户决定；测试里的断言按设计意图保留（不为了让套件变绿而放宽），只把轮询上限写成 20 秒并在注释里指向工单。

> **方法作废（2026-09-15 用户要求）**：上面的「`git worktree` 独立检出」只是当时的做法，本项目现已**禁止使用 `git worktree`**
> （见 `AGENTS.md` §磁盘与工作区洁净纪律 第 5 条、`docs/internal/development-process.md`，「`Serpent-9b1af8`」记录了这次
> junction 反噬事故）。后续要做「干净 HEAD vs 当前改动」对照，改用 `git stash`（跑完 `git stash pop`）或把对照产物复制到
> 仓库外目录；那条独立检出也应在交接时清理掉，不要在其上继续开发。
