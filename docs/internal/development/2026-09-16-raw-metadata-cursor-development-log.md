# 2026-09-16 RAW metadata admission cursor 开发记录

## 范围

本轮只完成 `Serpent-288cd9` 的一个持久化 admission slice，工单保持
`in_progress`，不代表 PERF2 或整个工单完成。当前 secondary RAW metadata
backfill 仍由既有 per-library gate 节流；本次把库级 token、`asset_id` keyset
cursor 和 exhausted 状态写入 `raw_metadata_backfill_state`，Worker 启动或开库后
会恢复 gate 的 exhausted 判定。候选查询在非定向 backfill 中按 `asset_id > cursor`
并按 `asset_id` 排序；定向 asset admission 不使用该游标。

状态 token 收窄为已有 `browse_change_sequence`：资产新增、revision 改变和忽略
规则变化会令 token 变化并清空旧 cursor；jobs/artifacts 的后台写入不会制造无关
失效。failed RAW retry 不再依赖 catalog gate：Worker 仅在 secondary 队列本轮
`processed === 0` 的 idle 分支（或已有 retry timer 到期后进入该分支）调用独立、
有界的 retry-only requeue，使用现有 retry 延迟和 partial index，不执行候选全扫，
因此 exhausted gate 不会饿死 retry，也不会在大 backlog 的每轮开头重复查询。保留
候选查询的 active/terminal/failed-artifact 排除和 `admitArtifactJob` 最终竞态
校验；运行中的 job 不会被取消。probe 前后 browse token 只接受稳定值，任何额外
catalog mutation 都记录新 token 的 `exhausted = false, cursor = NULL`，避免漏掉
新 RAW 或忽略规则变化。

新增兼容末尾迁移 v51（持久化 state）和 v52（failed RAW retry partial index）及
checksum snapshots；state 读取/写入要求 token、cursor、exhausted、updated_at
四列齐全，否则安全退化。没有临时表、无界候选读取或 native 模块重建。

## 回归与验证

以下命令均在本地工作副本执行，测试输出目录为系统临时目录，测试结束后已清理。

```text
npm run typecheck
通过（退出码 0；主 TypeScript 与 extension TypeScript）。

npm exec vitest run tests/unit/raw-metadata-backfill-gate.test.ts
通过：1 个文件，7 passed。

node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/raw-metadata-admission.test.ts
通过：1 个文件，4 passed。除空库 exhausted、耗尽后的 100 次调用保持 durable state
不变、关闭/重开后的
持久化状态、token 变化重新探测和 keyset 查询 EXPLAIN 证据外，新增真实 failed
`extract_metadata` retryRows requeue 路径；jobs retry 写入不改变 browse token，也
不会错误清空既有 cursor。另验证 retry-only service path 的 admitted/probed 结果。

npx eslint src/worker/library-service.ts tests/worker/raw-metadata-admission.test.ts
通过（仅有 library-service.ts 超过 Babel 500KB 优化阈值提示）。

npm run test:library-availability
通过：9 个文件，220 passed，1 skipped；Electron runner 的 ensure-native 报告
better-sqlite3 与 ABI 148 匹配且 FTS5 可用。该结果对应本轮已执行的 availability
命令；若后续代码再变化，需由协调者在最终树重新复跑。
```

系统 Node 为 ABI 137，而 Electron 测试 runner 为 ABI 148；前者直接加载
better-sqlite3 会 ABI 不匹配，因此没有用系统 Node 跑 Worker，也没有重建 native
模块。曾启动的宽 `npm run test:worker` 还包含既有 `library-zip`/`video-exr`
失败，随后停止并改用上述定向命令；这些失败不作为本 slice 的通过证据。

## 尚未覆盖（cursor 增量）

本轮没有实现持久化 normalized media/extension classification 与对应索引，也没有
实现独立的 dual time budget；没有运行真实 20,000 资产混合负载 A/B、完整应用退出
后的 UtilityProcess 重启旅程、packaged/Windows 或人眼 QA。当前测试用空库验证重开
和 token rearm，尚未以 20k fixture 量化 cursor 相对全扫描的 wall-clock、rows 或
事务预算。`Serpent-288cd9` 仍需独立验收和协调者更新工单状态。

## 2026-09-16 可索引分类增量

按计划 §3.9，在 cursor/exhaustion 之后补上规范化扩展名列，避免每轮
`LOWER(relative_file_path) LIKE '%后缀'` 扫全库：

- schema v54 增加 `assets.normalized_extension`，由 insert / `relative_file_path`
  更新触发器在同一事务写入（SQL 取最后一个 `.` 后缀并小写，例如
  `folder.with.dot/shot.CR2` → `.cr2`）。
- 部分索引 `assets_normalized_extension_asset (normalized_extension, asset_id)`，
  条件为 available、有 current revision、未删除。
- RAW metadata 候选、retry 与旧 RAW 缩略图修复查询改为
  `normalized_extension IN (.raw,.dng,…)`；列缺失时仍回退 LIKE。
- 没有引入第二套 job 表，也没有 RAW id 临时表。
- `tests/worker/video-exr.test.ts` 中 RAW 准入断言改为对象结果；到期失败改走 `requeueRawImageMetadataBackfillRetries`（与 exhausted cursor 分离）。定向复跑 2 passed。

### 验证

```text
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/migration-checksum-snapshot.test.ts tests/worker/raw-metadata-admission.test.ts
通过：2 个文件，6 passed。含 v54 checksum、触发器写入 `.cr2`，以及候选
EXPLAIN 命中 `assets_normalized_extension_asset`。

npx eslint src/worker/library-service.ts tests/worker/raw-metadata-admission.test.ts tests/worker/migration-checksum-snapshot.test.ts
通过（library-service.ts 超过 Babel 500KB 优化阈值提示）。

npm run test:library-availability
通过：9 个文件，224 passed，1 skipped。
```

### 仍未覆盖

独立 dual time budget、20k / 真实库 A/B（扫描行数与 wall-clock）、完整应用退出后的
UtilityProcess 重启旅程、packaged/Windows。工单保持 `in_progress`。
