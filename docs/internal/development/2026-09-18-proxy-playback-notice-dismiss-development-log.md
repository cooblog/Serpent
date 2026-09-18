# 2026-09-18 代理播放提示隐藏后不再出现

## 范围

查看器在源视频无法解码、改播代理时，会显示「原视频无法播放，当前播放的是代理视频」。本次只改这条提示的隐藏语义。

## 原因

1. `<video>` 带 `loop`。循环或重新 `canplay` 时会再次调用 `onReady`，原先无条件把提示设为可见，所以隐藏后会被拉回来。
2. 隐藏后仍渲染「显示代理提示」恢复按钮。

## 行为

- 「隐藏提示」后，当前这条资产在本次查看中不再显示该提示。
- 循环、重播、再次 `canplay` 不会把它拉回来。
- 不再提供重新显示入口。
- 换到另一条资产时，若仍走代理，提示可以再出现一次。

## 实现

- `shouldShowProxyPlaybackNotice`：仅在 `playbackMode === "proxy"` 且尚未隐藏时显示。
- `AssetPreviewModal` 用 ref 记住本次隐藏；资产切换时清掉。
- 去掉恢复按钮、对应文案和样式。

## 测试

定向单测：`tests/unit/proxy-playback-notice.test.ts`。

Electron 视频 E2E（`tests/e2e/media-video-playback.test.ts`）已改成：隐藏后没有恢复按钮，再派发 `canplay` 后提示仍不出现。本机未跑该 E2E。Computer Use、packaged 未执行。

## 验收

`docs/internal/qa/human-acceptance-checklist.md` VIEWER-PROXY-001 / `Serpent-0d6421`：2026-09-18 用户本人验收通过（用户原话「SHELL-FOCUS-001、VIEWER-PROXY-001通过」）。
