# 2026-09-18 查看器中键拖移画面

> 工单：`Serpent-16cd1e`  
> 状态：人类验收通过  
> 分支：`dev`

## 需求

图片与视频查看器原先只能按住鼠标左键拖移画面。产品要求中键按住拖动也能平移，左键保持原样。这是从 Photoshop 沿用的操作习惯（中键当抓手），写入内部 UX（`docs/internal/ui/0003` §5.1）和用户指南，不写进界面文案。

## 实现

- 公共判定 `isViewerPanPointerButton`：`0`（左）与 `1`（中）可开始拖移，`2`（右）不进入拖移。
- 鼠标拖移改走视口 **capture `mousedown` + window `mousemove`/`mouseup`**。Chromium/Electron 对中键经常不发 `pointerdown`，或 `setPointerCapture` 失败，只拦 pointer 事件时中键看起来没反应；还会走默认自动滚动。
- 触控/手写笔仍用 pointer handlers（跳过 `pointerType === "mouse"`，避免和 mousedown 双计）。
- `mousedown`/`auxclick` 取消中键默认自动滚动。中键拖移时 `data-panning` 显示 grabbing 光标（`:active` 只跟左键）。

## 测试接缝

`isViewerPanPointerButton`（`tests/unit/viewer-pointer-pan.test.ts`）。拖移位移算法未改，仍走既有 `commitView`。

## 命令

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/viewer-pointer-pan.test.ts tests/unit/use-viewer-zoom-pan-middle-button.test.tsx` | 2 files / 5 passed |

未跑 `verify:mainline` / packaged / Computer Use。

## 验收

首版只接 `pointerdown` 时用户反馈中键无效果；改为 mouse 路径后再验。2026-09-18 用户本人验收通过（原话「ok」）。清单 VIEWER-PAN-MMB-001。工单 `Serpent-16cd1e` 已关闭。
