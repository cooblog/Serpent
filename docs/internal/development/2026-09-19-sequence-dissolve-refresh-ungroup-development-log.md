# 2026-09-19 序列帧只在显式导入时自动检测

> 用户反馈：文件夹内容一更新，序列帧会重新自动组织；解散之后只要再有更新还会重新组织。
> 第一轮曾用解散退出表挡住「再编同一组」，用户否定：后续组织只能手动多选创建，检测只允许发生在显式导入。

## 根因

`refreshManagedAssets` 在发现新文件或新修订后，会对触发目录里全部未成组图片调用 `createDetectedImageSequences`。链接文件夹监视器、托管 `Assets` 里后来出现的文件、恢复回收站都会走这条路。显式解散只删序列行，所以下一次对账会把刚拆开的帧再编回去；即使不解散，后来丢进文件夹的连续编号图也会被自动编组。

## 处理

- `refreshManagedAssets` 不再检测序列。磁盘对账只登记文件。
- 恢复回收站不再检测。若回收站里仍是一套序列，关系本身会一起回来。
- 文件/文件夹/Eagle 导入仍按 `createImageSequence` 检测（既有导入确认/自动成组）。
- 链接文件夹：**导入当时已经在磁盘上的文件**算显式导入，在 `importFolderAsLinked` 提交目录后检测一次。之后监视器/refresh 发现的新文件保持单张，只能手动「创建序列图」。

未引入 schema 迁移。此前未提交的 v57 退出表已撤回。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| Worker 序列 | `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/image-sequence.test.ts` | 1 file / 25 passed（约 14 s） |
| 资源库可用性 | `npm run test:library-availability` | 9 files / 228 passed / 1 skipped（约 117 s） |

packaged / Computer Use 未执行。IMAGESEQ-UNGROUP-001 待人类验收。
