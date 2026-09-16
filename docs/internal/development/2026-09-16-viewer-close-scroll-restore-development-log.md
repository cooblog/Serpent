# 2026-09-16 退出查看器后画布跳回顶部

工单：`Serpent-bd481f`（VIEWER-001 / REQ-VIEW-008 回归）

## 用户现象

从浏览画布较深的位置双击打开资产查看器，退出后画布停在最顶部，而不是打开查看器之前的位置。

## 根因

关闭查看器时，`closeAssetPreview` 只等两帧就把捕获的 `scrollTop` 钳制到「当时」的可滚动范围。虚拟浏览在宿主从查看态绝对定位回到 flex 的那几帧里，内容高度可能暂时折叠（`scrollHeight ≈ clientHeight`，最大滚动为 0）。钳制结果变成 0，并被当成最终位置。之后高度恢复，滚动仍停在顶部。

工作区切文件夹已经用 `restoreWorkspaceNavViewport` 等到范围稳定；查看器关闭没有走同一套重试。隐藏画布上的虚拟窗口读取还会把切片重挂到第一行，放大这个问题。

## 修复

- 新增 `browseRestoreExtentIsReady`：当前范围还放不下捕获偏移时，恢复未完成。
- 新增 `scheduleBrowseViewRestore`：按帧重试，直到范围能放下原偏移并稳定两帧（最多 120 帧），再结束并显示画布。外部取消（换范围、再打开）不触发完成回调，避免把旧位置写进新视图。
- 恢复期间宿主继续 `is-viewing` 绝对定位，避免 Chromium 在折叠高度上把 `scrollTop` 夹掉。
- 画布不可测或处于查看/恢复 class 时，不更新虚拟窗口、不跑虚拟滚动锚点补偿。
- 查看/恢复期间不应用标签页遗留的 `pendingViewportRestoreRef`（其中常是 `scrollTop: 0`）。

## 测试

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/browse-reload-viewport.test.ts tests/unit/workspace-scroll-position.test.ts` | 2 files / 12 passed（含 4 条 silent-reload 契约） |
| `npx tsc --noEmit` | 通过 |
| `node scripts/run-e2e-isolated.mjs tests/e2e/viewer-close-scroll-restore.test.ts` | 1 passed (20.4s)。第一次红在建库/导入竞态（过渡未完成就点导入）；对齐分页 E2E 的建库流程后，Esc 与后退各等 1.6s，深滚动未被写成 0。 |

未执行：Electron E2E、packaged、Computer Use。本项需用户从深滚动位置双击查看再退出后确认。

## 2026-09-16 第二轮（延迟约 0.5s 再跳顶）

会话日志只有打开查看器的源文件请求，没有滚动写入。用户反馈：退出查看界面后画面先回来，约 0.5 秒以上再跳到顶部。这更像关闭后的重排/虚拟锚点/焦点滚动在恢复完成之后把位置改掉。

本轮：

- 给画布滚动写入打 `[DEBUG-bd481f]` 探针（`console.warn`，会进诊断日志）。
- 关闭查看器后 1.5s 内拦住宽度重排、虚拟锚点补偿，并拒绝把焦点滚动从深位置拉到顶部。
- 关闭时取消残留的工作区滚动恢复。

请再复现一次后看诊断日志里的 `[DEBUG-bd481f]`。

## 2026-09-16 第三轮（会话日志：真正写入者是 `pendingViewportRestore`）

同一次会话日志里，两次打开查看器都只有 `openAssetPreview.capture`，**没有** `closeAssetPreview.restore`。打开后约 0.5–1 秒出现成组的 `pendingViewportRestore`，并与 `scrollTop=` 同一时刻把画布写回去。开库首屏也会打同一条日志。

结论：文件夹/开库留下的 `pendingViewportRestoreRef`（常见目标是顶部 `scrollTop: 0`）在后续 React 提交里一直没清掉。查看器打开引发重渲染时，布局 effect 把已经滚过的画布又写成 0。画布在查看态就被拉到顶，退出后看到的就是顶部；关闭路径的恢复日志因此根本不会成为这条跳转的写入者。

本轮：

- `pendingWorkspaceViewportAction`：查看器占用画布、或导航已结束且用户已离开顶部时，丢掉这条残留恢复；范围已经对得上目标时也清掉，避免每个 render 都写一次。
- 打开查看器时同步写下 `previewAssetRef` 并立刻清掉 pending。
- 诊断日志改成一条字符串里带 JSON，避免会话日志只剩 `[object Object]`。

## 2026-09-16 第四轮（自动化复现：silent `runSearch` 把滚动写成 0）

用户再次复现后的会话日志（JSON 已可读）把写入栈钉死了：

1. `openAssetPreview.capture` 时 `scrollTop` 约 4922（画布底部）。
2. 约 0.4s 后 `replayWorkspaceHistoryStep` → `finishWorkspaceNavigation` 仍写 4922。
3. 约 1s 后 `runSearch` → `executeSearchDefinition` → `finishWorkspaceNavigation(request)` **省略 viewport**，默认 `{ scrollTop: 0 }`，把当时 4805 写成 0。
4. 全程没有 `closeAssetPreview.restore`，因为 `runSearch` 会 `closeAssetPreview(false)`。

这不是猜：`finishWorkspaceNavigation` 的默认参数就是顶部；静默搜索重载不是切文件夹，却走了同一条「回到顶部」收尾。

本轮自动化：

- 单测 `tests/unit/browse-reload-viewport.test.ts`：用日志里的 4922/4805 断言「默认顶部会跳顶、必须用现场捕获」；并锁 `executeSearchDefinition` 必须把 `reloadViewport` 传给 `finishWorkspaceNavigation`。
- Electron E2E `tests/e2e/viewer-close-scroll-restore.test.ts`：导入足够多的文本资产、打开格式过滤以触发 200ms 静默搜索、滚到约 85%、双击查看、Esc 与后退各等 1.6s，断言 `scrollTop` 不得掉到捕获值的一半以下。

## 2026-09-16 第五轮（第二次恢复会吞掉用户滚动）

关闭查看器时第一次恢复是对的。约 1 秒后静默 `runSearch` 又跑 `finishWorkspaceNavigation`，等于再恢复一次，中间用户滑动会被按帧写回去。

本轮：静默搜索不再当作工作区导航（不挂 pending、不 `finishWorkspaceNavigation`）。关闭后只保留那一次恢复。E2E 在退出后立刻改 `scrollTop`，再等 1.6s，断言不被第二次恢复拉回去。
