# 2026-09-17 浏览卡片 hover 按光标位置跳转后再开播

工单：`Serpent-608b79`

## 用户要求

1. 视频/音频卡片 hover 播放进度跟随光标在媒体区的水平位置（宽度 75% → 进度 75%）。
2. 跳转后 0.5 秒内光标没有明显移动，则从该位置开始播放，并隐藏时间轴。
3. 音频同样。

## 实现

- 纯函数：`asset-card-hover-scrub.ts`（比例、500ms 静止、暂停 seek / 开播）。
- 底部 10px 圆胶囊进度条：亮色 25%/50% 白，暗色 35%/70% 白。
- 去掉卡片 `title` 避免原生 tooltip；E2E 用 `data-asset-name`。
- 浏览卡片光标为点击手指（`pointer`），不再用 grab。

## 测试

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/asset-card-hover-scrub.test.ts tests/unit/asset-card-media-layout.test.ts tests/unit/asset-card-hover-preview.test.ts` | 3 files / 35 passed |

未执行：packaged、Computer Use。

## 验收

2026-09-17 用户本人验收通过（原话「就这样吧」）。清单 CANVAS-HOVER-SCRUB-001。
