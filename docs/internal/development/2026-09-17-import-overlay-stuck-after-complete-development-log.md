# 2026-09-17 导入完成后进度遮罩卡住（GitHub #45）

> 工单：`Serpent-d8ac96`  
> 关联：GitHub issue 45  
> 状态：实现完成，待人类验收 IMPORT-UI-008

## 现象

用户报告：导入看起来已经完成（文件已在库里），全屏仍显示「正在导入」，其它操作进不去。附件日志来自之后一次打开同一类同步盘资源库的会话，不含 import 命令本身。日志不得写入真实资源库路径。

日志里能对上的 Worker 行为：

- 开库后磁盘对账连续应用「1 条变更 + 1 条缺失」，maintenance 独占数分钟。
- `history.status` / `media.list-jobs` / `ai.status` / `plugin.jobs.list` / `library.navigation-summary` 排在对账后面。
- 缩略图失败把 Sharp「Input file is missing」记成 `LIBRARY_NOT_WRITABLE`。
- 用户随后尝试从磁盘删除资源库；次日渲染进程有一次 `e.trim is not a function`（已对非字符串 codec 做防护，不能证明就是遮罩根因）。

## 原因

遮罩原先由进度事件拥有。Worker 命令已经返回、目录已经提交之后，滞后的 `copy` 事件、丢失的 `complete`、以及导入 mutation 里同步打开源文件，都会让「正在导入」继续盖住界面。

具体路径：

1. Renderer 在收到 `complete` 后把 `importProgress` 清掉。同一 `importId` 的滞后 `copy` 事件仍会写回去，全屏遮罩没有下一次终态可关。拖放/粘贴导入的 `finally` 原先不清遮罩，只靠进度事件。
2. 链接文件夹导入在目录登记事务提交之后，还会给最多 64 个文件做同步头探测。同步盘占位文件的 `open` 会把 mutation 拖住，遮罩一直停在「处理中」计数满格。
3. 调度器允许一对账（maintenance）与一轮缩略图（background-primary）并行，但这会让「对账期间可放行的状态快照」条件失效，撤销/任务列表请求一直排队。
4. Sharp 缺失输入没有 errno，`serviceError(..., LIBRARY_NOT_WRITABLE)` 把读不到的源文件说成资源库只读；失败路径还会再 `readImageDimensions` 打开同一路径。
5. 不可取消的链接导入遮罩上 Esc 被吞掉，用户没有出口。

## 契约（避免同类问题）

导入遮罩的生命周期等于 Renderer 发出的那一次 Worker 导入命令：

- 命令开始时打开会话，命令返回时关闭会话（不含随后的浏览/揭示）。
- 进度事件只在会话内更新数字；会话关闭后，同一 `importId` 的非终态事件不能再打开遮罩。
- Worker 为每个 `importId` 盖单调 `sequence`，序号不前进的事件丢弃。
- 目录提交之后的源文件头探测不在导入 mutation 里做，改走浏览可见窗口 / 后台补尺寸。
- 不可取消的遮罩可以用 Esc 或「隐藏」收起界面，Worker 继续跑。

## 改动

- `import-progress-session.ts`：会话规则与 `runImportRpc`。App / 拖放 / 粘贴 / 文件夹粘贴把 Worker 导入命令包进该门。
- `shouldApplyImportProgressEvent`：已结束的 `importId`（含终态）不能改写下一次导入；进行中的会话只接受自己的 `importId`。
- 链接导入：目录登记提交后立刻 `complete`；Worker RPC 返回后再 `fs.watch`；不再在 mutation 里 `open` 源文件头。
- 调度器：maintenance + 至多一个 background-primary 时仍放行最多 3 条状态快照。
- Sharp「Input file is missing」→ `ASSET_NOT_FOUND` / `SOURCE_NOT_FOUND`；缺失时不再二次打开源文件。
- 直播放：codec 不是字符串时不当作 `.trim()` 目标。
- 不可取消遮罩：Esc /「隐藏」只收起界面。

## 验证

- `npx vitest run tests/unit/import-progress-session.test.ts tests/unit/import-progress-copy.test.ts tests/unit/import-progress-overlay.test.tsx tests/unit/dialog-escape-stack.test.ts tests/unit/protocol.test.ts`：5 files / 149 passed。
- `node scripts/run-vitest-with-electron.mjs tests/worker/asset-import-progress.test.ts tests/worker/linked-folders.test.ts`：2 files / 41 passed。
- `npm run test:library-availability`：9 files / 226 passed / 1 skipped。
- packaged / Computer Use / 同步盘真机：未执行。

## 未覆盖

可见窗口与后台补尺寸仍可能在同步盘占位文件上同步 `open`；那是浏览/维护路径，不再挡住导入遮罩。缺失文件对账批次本身仍可能很慢；状态读不再被缩略图波次误伤。「隐藏」只收视觉层，进行中的导入仍会挡住切库。
