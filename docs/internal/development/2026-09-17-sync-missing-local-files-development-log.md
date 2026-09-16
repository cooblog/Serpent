# 2026-09-17 换本地库路径后同步误删

工单 `Serpent-9e2a34`（P0）。用户反馈：换了本地资源库路径后再同步，大量已同步照片被自动放进回收站；再同步也拉不回来。本机文件夹空了，云端还能看见文件，但下载不下来。日志过大无法附上。

## 复现（隔离临时目录）

命令：

```bash
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/sync-missing-local-files.test.ts
```

修复前 2 failed：已同步后删掉本地文件再 `syncOnce`，规划 `remoteDeletes=1`；把 `.serpent` 拷到 Assets 为空的新位置再同步，同样规划远端删除。

## 根因

`syncSnapshot` 只收录磁盘上还在的可用资产。换路径或 Assets 没带上时，库内行还在、文件不在，快照为空，但 `sync_manifest_cache` 仍有上次同步点。

`planSyncActions` 把「快照没有、缓存有」当成用户删除，规划 `delete-remote` + `tombstone-upload`。墓碑写上之后：

- 下载要求远端没有墓碑，所以云端即使还留着文件也拉不下来。
- 若另一份还带着文件的库再同步，会按墓碑走 `delete-local`，照片进回收站。
- 即使用户从回收站恢复，旧逻辑仍会因墓碑再送回去。

用户真正把照片放进回收站时，快照不含这些行，这条路径仍然正确。

## 产品口径（2026-09-17 确认）

只有在 Serpent 里把资产放进回收站或永久删除，才同步为云端删除。换本地库路径、数据库和 Assets 没在一起、磁盘文件暂时找不到、在资源管理器里直接删或挪走，都不是删除：同步从云端补回；补不回则保持缺失。若以后要「外面删了也同步到云端」，必须另做明确入口。

规格：`docs/internal/superpowers/specs/2026-08-15-webdav-library-sync-design.md` §2.6 / §6.3 / §6.6；领域模型 Asset 不变量。

## 修复

- 快照增加 `missingAssets`：未进回收站、但文件不在的 syncId + 库内相对路径。
- 规划：这类条目从远端下载，禁止写墓碑；清单条目已被摘掉时按库内路径试拉；若有残留墓碑则清掉。
- 对端真删除：上次同步点还在且远端有墓碑 → 本地进回收站（双设备用例保持）。
- 从回收站恢复后缓存条目已不在：清墓碑，不再立即丢回回收站。

## 验证

- `tests/worker/sync-missing-local-files.test.ts` 3 passed
- `sync-plan` / `sync-engine` / `sync-library-integration` / `sync-two-device` / `sync-runner` 共 64 passed
- `npm run test:library-availability` 9 files / 227 passed
- 改动文件 ESLint 无新报错；针对同步相关文件的 typecheck 无新报错

packaged / Windows / Computer Use / 真实 WebDAV 用户库未执行。清单 `SYNC-MISSING-001` 待人点验。不要把真实库路径写入仓库。
