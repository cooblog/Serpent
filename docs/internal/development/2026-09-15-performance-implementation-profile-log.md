# 2026-09-15 性能实现与 profile 复核

## 结论

本轮在前序 RAW admission / linked watcher 增量基础上，增加了维护期间只读状态快照的有界并行准入。真实 Worker profile 证实旧调度下任务状态快照在 reconciliation 期间会等待约 12.4–12.6 秒；实现后同类状态命令的 scheduler wait p95 降至 0.13–0.24 ms，维护期间没有 scheduler stall。真实导航 profile 在约 50 个待处理任务下，四次切换内容 p95 301 ms、全部可见图片解码 p95 138 ms，100% 解码覆盖。

这不是所有 PERF2 计划的完成声明。当前真实库的任务状态是 0–50 个 queued、约 1,691 个 paused，远低于用户报告的约 9,000 项；因此本轮不能据此证明 9,000 项稳态吞吐，也没有形成运行/暂停同 scope A/B。目录/新文件增量刷新、冷/热预览缓存和 SMB/packaged 验收仍未完成。

## 本轮代码增量

- 全局 RAW metadata admission 先扣除 queued/running/paused 的同类任务余量，并对昂贵的全目录候选探测按库限频；明确资产 ID 的可见/变更路径不受此全局 admission 限制。`RawMetadataBackfillAdmissionGate` 有独立单测。
- 链接 watcher 事件继续按 folder ID 合并；对 `change`、安全相对文件名、已有目录册资产的事件，仅 stat 并复核该资产。rename、新资产、目录事件、路径缺失/不明确、ignore 规则歧义或超过有界路径数时，回退到完整链接根扫描。
- 为开库对账补充条目数、范围和逐源根耗时，仅在 `SERPENT_REFRESH_STAGE_LOG=1` 时记录；不记录路径或文件名。
- `refreshManagedAssets` 复用新鲜 discovery 快照，避免对未变化路径重复 stat。相关实现与 watcher 变更集中在 `src/worker/library-service.ts`、`src/worker/index.ts` 与 `src/worker/raw-metadata-backfill-gate.ts`。
- `InteractiveScheduler` 在单个 maintenance owner 活动时，最多额外准入 3 个白名单只读状态快照（导航摘要、媒体/AI/插件/历史/同步状态）。队列分析与派生任务仍不能与 maintenance 抢占同一后台预算；前台交互和 mutation 保持既有优先级。

## Profile 证据

| 场景 | 实测 | 含义 / 限制 |
| --- | --- | --- |
| 当前实例 idle 60 秒，开库对账阶段 | 扫描 1 个链接根 14,966 项约 3.25 秒，托管根 28,972 项约 4.78 秒；发现阶段合计约 8.10 秒 | 开库仍是全量发现；本轮没有尝试跳过完整一致性扫描 |
| 当前实例同轮链接 watcher | 范围已限到 1 个链接根、14,966 项，但仍耗时约 10.32 秒 | 证明“按根限域”仍不足以消除大根扫描；促成已知文件的增量快路径 |
| 四次文件夹切换，开始时约 4,050 个待处理任务 | 45.7 秒内完成 1,578 项（约 2,073/min）；任务种类混合。内容变化 p50 148 ms / p95 304 ms；可见图片全部解码 p50 1.81 s / p95 2.09 s，解码覆盖率 100% | 在队列运行中，首屏内容变化符合约 500 ms 目标；全部可见预览仍明显慢于内容提交，不能用“内容已换”代替“图片已解码” |
| 后续 idle 60 秒队列 profile | 2,522 queued → 0；观察到 2,572 成功、8 失败（约 2,577 个终态/min；终态种类为 2,522 palette、58 thumbnail） | 这是当前吞吐观测，不是和用户所述“暂停后”的同范围 A/B；任务种类/设备负载可能不同，不能归因成单个优化的净收益 |
| watcher 增量代码后的真实库 idle profile | 完成 2,580 项；本轮未出现链接 watcher 事件，开库扫描仍在约 8 秒量级 | 没有真实触发单文件 watcher 快路径；该路径的覆盖证据来自 Worker 回归测试，真实触发 profile 待补 |
| watcher 代码后的四次真实库导航 smoke | 内容变化 p50 146 ms / p95 442 ms；图片全解码 p50 1.77 s / p95 2.11 s，覆盖率 100% | 无待处理后台任务时的导航回归；不能代表忙碌/暂停 A/B |
| 状态准入修改前后，同一真实库、各 20 秒 idle profile | 修改前状态读取 scheduler wait p95：`history.status` 12.60 s、`plugin.jobs.list` 12.59 s、`ai.status` 12.54 s、`media.list-jobs` 12.42 s、`library.navigation-summary` 12.39 s；修改后分别为 0.13 ms、0.18 ms、0.22 ms、0.24 ms、44 ms；修改后 scheduler stall 为 0 | 修改前后队列状态不同（queued 24 vs 0，paused 均 1,691），不是吞吐 A/B；直接证明 maintenance 下只读状态等待根因被消除。navigation-summary 自身执行约 320 ms，属于实际 Worker 占用而非排队 |
| 修改后同一真实库 20 秒状态 profile | 50 个 thumbnail 完成事件；profile 总体约 150 项/min。另一导航 profile 中 4.68 秒内观察到 104 个终态事件，初始 queued 50、结束 queued 5，且同期有新任务入队 | 任务类型与新生成量变化明显，两个窗口不可比较净吞吐；未复现 9,000 queued，不能声称后台吞吐达到目标 |
| 状态准入修改后，3 秒 idle + 四次真实库文件夹切换 | 内容变化 p50 169 ms / p95 301 ms；全部可见图片解码 p50 129 ms / p95 138 ms；四次覆盖率 100%，无 timeout；profile 中 queued 50 → 5 | 在当前小队列与缓存顺序下未见导航退化，并满足本次样本的首屏目标；不是 2,000/9,000 项压力验收 |
| 增量 watcher 当前实例触发 | `linked-file-changes` 阶段 4 ms；同一 profile 的全量 `discovery-walk` 两次合计 14.06 s、单次 max 10.91 s | 已实测单文件快路径；全量开库/回退扫描仍是主热点，且跨轮次扫描时间有显著波动 |
| 20,000 资产混合 fixture 性能门禁 | 3/3 passed；all browse 12.6 ms、文件夹切换 0.6 ms、合集递归 layout 85.4 ms、reconciliation 3.78 s；缓存浏览 0 SQL、cached hit | 合成 fixture 是防回归基线，不外推为真实 SMB/NAS 性能 |

CPU profile 的 Worker 自耗时间不再由一条 RAW 候选 `all()` 查询主导；当前可见高耗时段集中在源目录枚举、文件 I/O 和媒体任务。状态准入修改前，状态快照约 12.4–12.6 秒延迟主要来自 scheduler wait，而不是执行（约 0.5–379 ms）；修改后它们可在 maintenance 期间有界执行。四次真实库导航中 `browse.session.open` scheduler wait p95 为 0.89 ms、执行 p95 为 101 ms。全量 discovery 与冷态预览解码仍是独立问题。

## 验证

- `npm run typecheck`：通过。
- 定向 linked watcher 用例：3/3 通过；完整 `tests/worker/library-watcher.test.ts`：17/17 通过。
- `npm run test:library-availability`：9 个文件通过，214 passed / 1 skipped。
- `npx vitest run --config vitest.config.ts tests/unit/interactive-scheduler.test.ts tests/unit/interactive-scheduler-admission-yield.test.ts`：2 个文件通过，29 tests passed。
- `node scripts/run-large-library-performance.mjs <隔离的 20,000 资产 fixture>`：3/3 通过。
- `node scripts/run-e2e.mjs tests/e2e/navigation-profile.test.ts`：真实库隐藏窗口运行；状态读取前/后各 20 秒 profile、修改后四次导航 profile 均无 timeout；增量 watcher 单文件快路径已在真实 profile 观测到 4 ms。导航 profile 的队列规模最高仅 50 queued，9,000 项压力与暂停 A/B 仍未验证。

## 后续计划与验收边界

1. 将递归 `fs.watch` 的可靠变更路径扩展到有界目录子树；对新增/删除/rename 保持 inode、ignore、missing、离线根和移动资产语义，并在大量目录上 profile。未做到之前这些事件继续全根回退，正确性优先。
2. 追踪并切分开库 8 秒全量 discovery 的安全时间片；仅“让出 JS turn”不算归还 scheduler admission。状态读取需与首屏导航读分离，禁止为了状态新鲜度反复扫全任务表。
3. 补齐同一 scope、同一缓存顺序、约 2,000 queued tasks 的运行/暂停交错 A/B，报告 click→active→Renderer commit→首图/90%/100% decode、status polling、主进程后处理与 Worker 各阶段；timeout 不得进入耗时分位数。
4. cache-enabled 冷 userData profile 中 visible thumbnail p95 仍约 1.9 秒；已生成缩略图的 cache-on/off 回访均约 10–16 ms。下一步应区分预览产物生成/缺失、artifact 文件读取、Main/custom protocol、Renderer 调度和解码；不能仅提高 worker 并发。
5. PERF2-02/03/04/05/06/08/09/10 的读隔离、首屏渐进查询、缓存发布/授权、安全文件夹提交和独立最终审查均不因本轮局部数据被视为完成。SMB/NAS、packaged 与独立人类验收未执行。

没有把本轮加入人类验收或关闭相关工单；当前增量只说明对应自动化/profile 证据，不替代用户验收。

## 2026-09-15 受控队列 A/B 与 profile 纠偏补充

使用隔离生成的 20,000 资产 mixed fixture、隔离 userData 与隐藏 Electron 窗口；同一 fixture seed 分别重置后运行 90 秒队列积压，再对四个各含 133 项的非空 scope 做导航。每轮 `navigation-profile.test.ts` 均通过、无 timeout、可见图解码覆盖率 100%。

| 指标 | 队列运行 | 导航前暂停队列 | 判断 |
| --- | ---: | ---: | --- |
| 导航前队列 | 2,315 queued / 1 running | 2,521 paused / 0 running | 两轮均超过 2,000 项，但不是用户真实 9,000 项队列 |
| click → 内容变化 | p50 239 ms / p95 332 ms | p50 231 ms / p95 242 ms | 暂停轮 p95 快约 90 ms；未复现“约一分钟 vs <500 ms”的落差 |
| 全部可见图解码 | p50 700 ms / p95 1,969 ms | p50 592 ms / p95 1,883 ms | 队列活动期间有轻微差异；图片完整解码仍比内容提交慢约 1.6 秒 |
| 观察期队列吞吐 | 805 项 / 95 秒，约 507 项/分钟 | 816 项 / 95 秒，约 516 项/分钟 | 任务全部为 `generate_thumbnail`；不能代表用户真实混合任务或 NAS 吞吐 |
| 事件循环 / scheduler stall | 0 / 0 | 2 次 event-loop drift，0 次 scheduler stall | 没有发现长时间 JS owner 占用；两次 drift 的 activity 是开库对账 |

因此，当前合成库上队列活动对导航的可见影响约百毫秒，后台吞吐约 500 张缩略图/分钟；它无法解释用户报告的 9,000 项低于 100 项/分钟。CPU profile 中 Worker 大部分时间 idle，少数最高 native 边界为 `run` / `spawn` / `lstat`；V8 profile 看不到 Sharp/外部解码进程的 CPU、磁盘等待与操作系统调度，不能据此增大并发。后续必须采集真实任务类型分布，并增加 Main/custom-protocol 与 native helper 的进程级 I/O/CPU span。

受控 profile 还发现此前 fixture 的 revision `modified_at` 固定为历史时间，而写入/复制的源文件保留自身 mtime，导致首次开库把几乎所有条目判为候选并计算内容指纹。fixture 现按文件 stat 写入 mtime，并将版本升至 4；修正后 20,000 项 `prepare-fingerprints` 为 14.8 ms，`discovery-walk` 为 6.1 s，批量应用为 0.6 s。旧样本的 153.6 s 指纹阶段是失真 fixture 的结果，不应外推为正常生产库热点；生产库遇到真实 mtime 变化仍需要正确性指纹校验。

回看 harness 后发现 `benchmarkLogEnv` 默认将 preview cache 强制打开；此前运行/暂停 profile 均为独立 userData 下的“缓存启用”测量，并非缓存关闭。为允许显式关闭，helper 现尊重 `SERPENT_PREVIEW_CACHE_FORCE=0/1`，profile 报告也记录实际开关。对已生成可见缩略图的同一 fixture 做独立 userData 回访：cache-off 的首轮/重访解码 p95 均 16 ms，cache-on 为 11/10 ms；内容变化 p95 分别为 495/270 ms 与 557/242 ms。各 n=4 且首屏可能已预热，差异不稳定，不能归因于缓存本身；只说明就绪预览在本机回访时两条路径都很快。此前运行/暂停两轮的全图解码 p95 约 1.9 秒，发生在 cache enabled 状态下的冷 userData 与不同资产就绪阶段，必须继续拆分预览产物是否就绪、协议读、Renderer 调度/解码，不能归为“关闭缓存”。

暂停/恢复专用 profile 中恢复 2,521 个持久任务的 Worker `runMs` 约 12 ms、round-trip 14 ms；旧实现的 20,000 资产 profile 同规模恢复约 9.8 s。恢复后队列仅从导航残留的 80 queued 与 2,521 paused 收敛到 2,599 queued（另有 2 running），未同步填充全目录。

### 本轮新增实现与验证

- `media.resume-jobs` / `media.retry-jobs` 不再在请求返回前执行无界目录入队；只恢复已有持久任务，继续由媒体 pump 在有进展后按最多 500 项有界续填。profile 断言恢复命令低于 2 秒，并限制恢复后队列增长，避免只验证响应时间却漏掉全库突增。
- 20,000 资产 fixture revision mtime 与真实 fixture 文件 stat 对齐，版本升至 4，防止基准构造本身引入全库指纹哈希。
- `npm run test:library-availability`：9 个文件通过，214 passed / 1 skipped。
- `npm run test:unit`：474 个文件通过，3,499 passed / 5 skipped。
- `npm run test:worker`：92 个文件通过，1,385 passed / 17 skipped；测试计数中另有 24 个按条件跳过。
- `npm run typecheck` 与针对改动文件的 ESLint：通过。
- `npm run lint`：无错误，1 个既有 React Hook 依赖 warning（`use-virtual-browse-session.ts:220`）。
- 受控 `navigation-profile.test.ts`：旧 fixture 修复后的暂停轮通过；相同版本的运行轮通过；强制缓存的热态回访轮通过。

### 未完成与决策

这只完成了恢复命令避免同步全库扫描、以及 profile fixture 校正；**不代表 PERF2 全部计划已完成**。合成 2,000 项 A/B 没有复现用户的 9,000 项慢任务，也未完成真实任务类型分布、NAS 冷/热缓存、进程级媒体解码、navigationId 贯穿、Main 后处理分段或 PERF2-10 独立审查。继续优化并发前必须先拿到上述 profile，否则可能以更多磁盘争用换取更低浏览性能。
