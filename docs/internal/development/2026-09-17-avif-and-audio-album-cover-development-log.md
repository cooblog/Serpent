# 2026-09-17 AVIF 图像与音频专辑封面缩略图

工单：`Serpent-c93c75`（AVIF，接替已关闭的 `Serpent-b906b1`）、`Serpent-690060`（音频封面）

## 需求

1. `.avif` 成为产品支持的图像：导入识别、卡片缩略图、查看器、格式过滤同一注册表。
2. 已注册音频（MP3/M4A/FLAC 等）若内嵌专辑封面（ffprobe `attached_pic`），网格缩略图用该封面；没有封面仍用波形。查看器宽条保持波形。

## 实现

- `SHARP_IMAGE_EXTENSIONS` 增加 `.avif`；`image/avif` 同时作为产品 MIME 与 Chromium 源文件直出。
- 有界卡片可走 `preview-policy` 源图直出（与 PNG/JPEG/WebP/GIF 同类）。
- 动画 AVIF：卡片取 Sharp 首帧；查看器走 `image/avif` 源文件。不是视频 proxy。
- 音频：`probeVideoAsset` 解析 `attached_pic`。命中则 ffmpeg 抽出第一路图，再按图像卡 512 内侧缩放写成 `thumbnail`；否则沿用 4:3 波形 PNG。`video_poster` 仍是波形条。
- generator tag `waveform-cover6` → `audio-cover7`，打开库时旧音频封面会重新入队。

## 测试

命令与结果在本机工作副本执行；产物用系统临时目录，结束后清理。

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `npx vitest run --config vitest.config.ts tests/unit/media-formats.test.ts tests/unit/format-filter-presets.test.ts tests/unit/preview-policy.test.ts tests/unit/audio-media.test.ts tests/unit/image-color-space.test.ts` | 5 files / 40 passed |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts tests/worker/video-exr.test.ts` | 2 files / 145 passed |
| `npm run test:library-availability` | 9 files / 226 passed / 1 skipped |

未执行：真实 Electron 查看器、packaged、Computer Use、真实动画 AVIF。请用 FMT-AVIF-001 / AUDIO-COVER-001 验收。
