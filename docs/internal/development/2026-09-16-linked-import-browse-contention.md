# 2026-09-16 链接文件夹导入与浏览争用

日期：2026-09-16

用户用「导入链接文件夹」链入约 8 万文件的目录，导入过程中浏览仍慢。本次没有对正在进行的 Electron 会话做 CPU profile（导入是独占 mutation，重启会中断当前登记）。结论来自当前代码路径与既有 PERF2 证据。

## 当前遮罩（约 2.6 万 / 8.4 万）

进度条上的「复制中」对应 `importFolderAsLinked` 的登记阶段，不是把文件拷进资源库。该阶段：

- 命令 `asset.import-linked` 走 **mutation** lane，与浏览共用同一个 Library Worker。
- 约 8 万条资产在**同一条 SQLite 事务**里 INSERT，循环内只节流发进度，**没有** `yieldAdmission`。
- 事务结束前，`browse.session.open` 等交互命令不能开始。这不是缩略图队列抢占，而是导入命令本身占住 owner。

因此：导入遮罩还在时切文件夹变慢，是这条 mutation 独占 Worker，不是后台任务面板里那些 job。

## 导入命令返回之后

命令在事务之后还会同步：

1. `persistLinkedFolderImageDimensions`（有界，最多 64 条）
2. `reconcileLinkedWatchers`
3. （改前）`listAssets({ folderId, recursive: true })` 把整棵链接树摘要载入内存，再交给 `scheduleThumbnailScene(..., maxIds: 50)`
4. （改前）`withMediaSchedulingSuspended` 结束后无界 `scheduleThumbnailQueue()`：无 limit 的 `enqueueThumbnailJobs` 会为缺缩略图的资产一次 SELECT/INSERT，并跑 GIF/ICO/音频全库失效扫描，仍发生在 mutation 返回之前

第 3 步对约 8 万资产没有收益：场景最多用 50 个 id。已改为直接 `scheduleThumbnailScene(libraryId, 'linked')`。第 4 步对链接导入改为 `resumeScheduling: false`，避免登记刚结束就把整库缩略图任务一次塞进队列。可见浏览仍会按当前窗口入队；空闲波次仍可能每轮补 500 条（priority 50）。`linked-folder.relink` 同样不再整树 `listAssets`。

可见窗口仍走 priority 更高的 visible 波；其余缩略图/元数据泵与浏览共用 Worker。`Serpent-7ac453` 的前台预算尚未落地。用户此前对照（约 2000 个任务运行 vs 全部暂停）仍然适用：导入结束后若泵在跑，切文件夹会慢。

## 未做

- 把约 8 万行登记事务切成可让出的 continuation（`Serpent-be29a9` 同类问题）
- 对这次真实链接导入做 `SERPENT_WORKER_CMD_LOG` / Worker CPU profile（需等当前导入结束并完全退出后再开；重启会中断正在进行的登记）
- packaged / 20k A/B / 前台预算（`Serpent-7ac453`）
- Worker / `test:library-availability`：当前 better-sqlite3 为 Electron ABI（NODE_MODULE_VERSION 148），vitest 需要 Node 24（137）。导入仍在进行，未执行 `rebuild:native`。

定向单测：`import-progress-copy` / `import-progress-overlay` / `protocol` 3 files / 121 passed。ESLint 改过 `no-unsafe-finally` 后待复跑。
