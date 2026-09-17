# 2026-09-17 查看器左右切换视频后自动播放

工单：`Serpent-fd402d`

## 用户现象

打开视频查看器后，用方向键或边缘按钮切到下一段/上一段视频，新视频停在第一帧，需要再按播放。直接双击打开的第一段会自动播。

## 根因

查看器导航会同时挂当前表面和预加载表面（`AssetPreviewModal`）。预加载表面 `preloadOnly`，把 `autoPlay` 设成 `false`，避免隐藏层出声。提升后同一 `VideoPlayerControls` 实例只把 `autoPlay` 改成 `true`。HTML 的 `autoPlay` 属性不会让**已经加载完**的 media 开始播放。序列帧播放器已经用 `isPlaying = !preloadOnly && playing` 处理了同一条路径，视频/音频没有。

## 修复

- `applyMediaAutoplayIntent`：`autoPlay` 为真且暂停则 `play()`，为假则 `pause()`。
- 提升或换源时调用；`canplay` / 音频 `loadedmetadata` 再补一次，避免源还没就绪时 `play()` 被拒。
- 用户点暂停或视频逐帧（D/F）后不再自动开播。

## 测试

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/video-player-controls.test.ts tests/unit/video-player-autoplay.test.tsx tests/unit/audio-player-controls.test.ts` | 3 files / 40 passed |

未执行：真实 Electron 视频切换、packaged、Computer Use。

## 验收

2026-09-17 用户本人验收通过（原话「可以」）。清单 VIEWER-VIDEO-AUTO-001 记为人类验收通过。
