# 2026-09-17 移除查看器 PBR 通道滤镜

工单：`Serpent-511469`（撤回 `PBR-001` / `Serpent-3a6750`）

## 原因

查看器曾按文件名把 roughness / gloss / smoothness 等词当成 PBR 通道，给 `<img>` 套 `grayscale` 或 `invert`。普通照片文件名里的 Glossy 等词会被子串命中，双击查看变成黑白（光滑通道还会反相）。产品决定目前不需要这套能力。

## 删除范围

- `src/renderer/pbr-texture-channel.ts`
- 查看器 `pbrChannel` 属性、`data-pbr-channel`、CSS `filter`
- 中英文 `preview.pbr*` 文案
- `tests/unit/pbr-texture-channel.test.ts`
- `tests/e2e/pbr-texture-preview.test.ts`

查看器按源图像素显示，不再按文件名改色彩。

## 测试

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/zoomable-preview-image-cached-load.test.tsx tests/unit/zoomable-preview-image-fallback.test.ts tests/unit/viewer-mip-upgrade.test.ts tests/unit/i18n-translate.test.ts` | 4 files / 12 passed |

未执行 Electron E2E、packaged、Computer Use。验收项 VIEWER-PBR-OFF-001。
