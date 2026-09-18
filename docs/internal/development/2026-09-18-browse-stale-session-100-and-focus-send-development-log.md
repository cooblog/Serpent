# 2026-09-18 所有资产停在 100 项，以及焦点 IPC 打崩主进程

## 范围

「所有资产」和其它 COUNT 大于 100 的浏览范围，首页只画出约 100 张卡片，继续滚动不再加载。随后主进程在窗口焦点变化时退出，错误为 `Render frame was disposed before WebFrameMain could be accessed`，栈在 `BrowserWindow.publishWindowFocus`。

## 原因

1. 首页 `createBrowseSession` 只带 100 条摘要，`declaredTotal` 仍是 COUNT。后台写入（AI 内容、序列帧、忽略路径）抬高 `browse_change_sequence` 后，后续 `browse.session.page` 返回 `browse.session.stale`。Renderer 把这条当成列表结束：`setHasMorePages(false)`，哨兵和窗口请求都停。
2. 虚拟画布发布布局时，未加载槽的 `idAt` 为空，滚动可见范围只能映射已加载的前 100 个真实 id。紧凑 `browseLayout` 下标也不是会话序号。
3. Renderer 已经销毁（开发态热更新、页面崩溃、关窗过程）后，`focus` / `blur` 仍对 `webContents.send` 调用。Electron 抛出未捕获异常，主进程退出。这不是浏览分页本身的逻辑错误，但是同一旅程里会一起出现。

## 行为

- 会话快照过期后，同一浏览范围的后续页改走当前查询的 live search，不再把列表截成首页 100 项。
- 未加载槽发布稳定占位 id；滚动可见范围按会话序号取页。
- 窗口焦点、触控板滑动、最大化状态，以及 WindowRouter 向窗口发事件，在 frame 已销毁时不再把异常送到主进程。

## 实现

- `use-browse-pagination.ts`：`browseWindowQueryMode` / `isBrowseSessionPageUnusable`；`fetchPageAt` 遇到 stale 清掉 `sessionId` 再请求 live 页。
- `virtual-browse-layout.ts`：`virtualLayoutPublishedId` / `geometryPlaceholderIndex`。
- `virtual-browse-canvas.tsx`：masonry / justified 的 `idAt` 使用占位 id。
- `browse-window-slots.ts` + `App.tsx`：`browseRankFromPublishedId`；虚拟范围用 `indexByAssetId`，不用紧凑数组下标。
- `web-contents-send.ts`：`sendToLiveWebContents`。
- `main/index.ts`、`window-controls.ts`、`window-router.ts`：焦点/滑动/最大化/路由发布走销毁守卫。

## 测试

定向单测（本机）：

```
npx vitest run tests/unit/browse-window-slots.test.ts tests/unit/browse-pagination.test.ts tests/unit/virtual-browse-session.test.ts tests/unit/web-contents-send.test.ts tests/unit/window-router.test.ts
```

5 files / 47 passed。

未跑：`test:e2e`、`test:library-availability`（本增量未改打开/关闭/schema）、Computer Use、packaged。

## 验收

`docs/internal/qa/human-acceptance-checklist.md`：

- BROWSE-100 / `Serpent-5fddea`
- SHELL-FOCUS-001 / `Serpent-30c8f9`
