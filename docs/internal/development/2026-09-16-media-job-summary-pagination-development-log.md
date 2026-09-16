# Serpent-e97c00 — 任务摘要 O(1) 计数表与列表游标分页

日期：2026-09-16

## 本次增量

按 [文件夹切换与资源加载性能优化方向](../implementation/2026-09-14-folder-switch-and-resource-loading-optimization.md) §3.3，把任务状态从「每次读都 GROUP BY 全历史 / 或 3 秒陈旧缓存」改成事务内计数：

- schema v53 新增 `media_job_status_counts`，由 jobs 的 insert/update/delete 触发器在同一事务里维护媒体任务六个状态的计数；`ASSET_IGNORED` 行不计入。
- 新增独立命令 `media.job-summary`。常驻状态与面板关闭时的兜底轮询只走这条命令，不再调用 `media.list-jobs`。
- `media.list-jobs` 改为 `created_at DESC, job_id DESC` 的 keyset 分页；Renderer 打开面板时取第一页，滚动区提供「加载更多」。摘要快照到达时只改计数，不丢已加载的列表页。
- 手动暂停/恢复/取消/重试仍然在写成功后失效内存摘要缓存；计数表由触发器更新，因此紧接着的摘要读取应立即与 SQL 一致。

忽略路径（不是 `ASSET_IGNORED` 错误码）的可见性修正仍未做成独立的 browse-sequence 批处理；列表页继续套用既有 ignore SQL，计数表按任务行本身维护。该边界记在工单未完成项里。

## 验证记录

命令与结果在本机工作副本执行；测试产物使用系统临时目录，结束后清理。系统 Node ABI 与 Electron runner 不一致，Worker 测试走 `scripts/run-vitest-with-electron.mjs`，未重建 native 模块。

```text
npx tsc --noEmit
通过（退出码 0）。

npx vitest run tests/unit/media-job-list.test.ts tests/unit/media-jobs-dialog.test.ts tests/unit/media-job-status-summary.test.ts tests/unit/interactive-scheduler.test.ts tests/unit/protocol.test.ts tests/unit/serpent-mcp-adapter.test.ts
通过：6 个文件，168 passed。覆盖分页切片、面板「加载更多」、协议 `media.job-summary` / listed 的 cursor 字段、MCP `media.jobs.list` 结果 schema。

node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/media-job-summary-cache.test.ts tests/worker/migration-checksum-snapshot.test.ts
通过：2 个文件，5 passed。含计数表查找、写入后收敛、created_at/job_id 游标分页，以及列表 `EXPLAIN QUERY PLAN` 命中 `jobs_library_created_desc`；v53 checksum 快照一致。

npx eslint src/renderer/App.tsx src/automation/command-registry.ts …（本增量改动文件）
通过。打开面板时的第一页列表改为 open handler 加载，不再从 effect 同步 setState。

npm run test:library-availability
通过：9 个文件，222 passed，1 skipped。ensure-native 报告 better-sqlite3 与 Electron ABI 匹配且 FTS5 可用。
```

未跑完整 `npm run test` / `test:e2e` / `verify:mainline`，未跑真实 Electron 面板开关旅程，未跑 packaged / Windows。

## 边界与未完成验收

`Serpent-e97c00` 保持 `in_progress`。本增量不关闭工单，也不把 PERF2 标成验收通过。尚未覆盖：忽略规则变化的批量计数修正、面板开关真实 Electron E2E、2000 完成事件的现场 `media.list-jobs=0` 回放、真实 9k 混合队列与 packaged/Windows。
