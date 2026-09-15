# 递归文件夹卡片与导入延迟进度开发记录

> 状态：automated-verification
> 日期：2026-09-15
> 分支：`dev`
> 工单：`Serpent-4e9caa`、`Serpent-409cff`

配套：[人类验收清单](../qa/human-acceptance-checklist.md)

## 范围

1. 打开「递归显示子文件夹内容」后，画布开头仍显示当前文件夹的直系子文件夹卡片；设置里可关闭（关闭后只显示文件）。默认开启。
2. 导入本地资源和导入链接文件夹：Worker 开始工作后若持续超过约 3 秒，才显示进度遮罩。短导入不闪遮罩。链接文件夹导入补齐 `import.progress` 事件。

## 实现决定

1. `shouldShowFolderBrowseCards` 增加 `showCardsWhenRecursive`；默认 true。设置开关放在设置 → 浏览，复用 `SettingsToggleRow`，偏好模块对齐任务完成提示音的 localStorage + zod 写法。
2. 导入遮罩仍只在收到非终止 `import.progress` 后才算「有工作」；Renderer 再用资源库打开同一套 `useDelayedVisibility`（3 秒）。系统文件选择器期间没有 progress 事件，不计入等待。
3. `importFolderAsLinked` 在扫描与登记阶段发出不可取消的 validate/copy/complete（或 failed）进度；不把链接导入改成可取消，避免在同步事务路径上半套取消语义。
4. 复制导入的进度遮罩提供「停止导入」和「取消导入」。停止：已处理文件写入资源库，其余跳过。取消：这次导入整批撤销。复制循环每个文件 `transferCheckpoint()`，以便主进程取消命令能进来。

## 测试同步

- `tests/unit/folder-browse-canvas.test.ts`：默认递归仍显示卡片；设置关闭后隐藏。
- `tests/unit/folder-browse-card-preferences.test.ts`：偏好读写与损坏回退。
- `tests/unit/import-progress-copy.test.ts`：无 progress 仍不盖工作区；链接 validate 事件算 overlay-ready。
- `tests/worker/asset-import-progress.test.ts`：链接导入发出 validate/copy/complete，且 `cancelable === false`；`stop` 保留已处理文件并跳过其余；默认取消仍整批 `CANCELLED`。
- `tests/unit/import-progress-overlay.test.tsx`：复制导入遮罩同时有「停止导入」和「取消导入」，以及 hover 提示文案。

## 已执行命令

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts tests/unit/folder-browse-canvas.test.ts tests/unit/folder-browse-card-preferences.test.ts tests/unit/import-progress-copy.test.ts` | 与侧栏单测一并 4 files / 48 passed |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/asset-import-progress.test.ts` | 1 file / 2 passed |
| `npm run test:library-availability` | 9 files / 214 passed / 1 skipped |
| `npm run typecheck` | 通过 |
| `npx eslint`（本次修改的源码与测试文件） | 通过 |
| `git diff --check` | 通过 |
| 2026-09-15 停止/取消与浏览设置 | 定向单测 5 files / 154 passed；Worker 2 files / 71 passed（含 stop 保留已处理文件）；`npm run typecheck` 通过；改动文件 ESLint 通过；`npm run test:library-availability` 9 files / 216 passed / 1 skipped |
| 2026-09-15 取消抢占与提示堆叠 | 定向单测 `tracked-library-api` / `import-progress-overlay` / `navigation-sidebar` 3 files / 39 passed；Worker `asset-import-progress` 1 file / 3 passed；`npm run typecheck` 通过；改动文件 ESLint 通过；`npm run test:library-availability` 9 files / 216 passed / 1 skipped |

未执行 Computer Use、packaged、Windows 发布态；不得写成通过。

## 2026-09-15 用户复验

- `FOLDER-CARDS-001` 通过。开关从设置 → 常规挪到设置 → 浏览，复用同一 `SettingsToggleRow`。
- `IMPORT-UI-007` 不通过：复制导入时取消没有效果。根因是复制循环让出事件循环过稀，且取消一律按整批 `CANCELLED` 回滚，界面也只有一个按钮。已改为每个文件 `transferCheckpoint()`；`cancelImport` 增加 `mode: stop | abandon`。「停止导入」提交已处理文件并跳过其余；「取消导入」整批撤销。按钮使用 `data-hover-tip`。链接导入仍不可取消。

## 当前限制

- 链接导入进度不可取消。
- 扫描阶段在未知总数时为不定进度；登记阶段按文件计数。
- `IMPORT-UI-007` 待用户复验停止/取消；Computer Use、packaged 未执行。

## 2026-09-15 停止/取消未生效与提示堆叠

用户复验：复制导入过程中多次点「停止导入」和「取消导入」当时没有效果；导入结束后一次性弹出大量「正在停止导入… / 正在取消导入并清理本次导入内容…」。按钮是可点的，点击被排进了导入同一把 Renderer 写入 FIFO（`createTrackedLibraryApi` 的 `runWrite`），取消 IPC 要等 `importFiles`/`importFolder` 的 Promise 结束后才发出，然后按点击次数补发 toast。

处理：

1. `cancelLibraryImport` 以及同类 `cancel*` 不再走 Renderer 写入 FIFO，导入进行中即可发往 Worker。
2. `transferCheckpoint` 改为 `setTimeout(0)`，与导航检查点同一理由：`setImmediate` 可能饿死 UtilityProcess 的消息轮询。
3. Worker `parentPort` 消息改为 fire-and-forget，取消命令不必等当前导入 handler 返回。
4. 第一次点击立刻出一条提示并把按钮设为不可用；导入结束后不再按点击次数补发。

定向单测覆盖：取消不排在导入写入之后；遮罩按钮可禁用；合集嵌套行高亮与文件夹一致。资源库相关改动须跑 `test:library-availability`。Computer Use、packaged 未执行。清单 `IMPORT-UI-007` 保持待人类验收，不得标通过。
