# 2026-09-17 快速切换后再次查看停在预览图

工单：`Serpent-a19c01`

## 用户现象

图像 A / B / C 在查看器里快速按 ABCBA 切换时，第二次回到 A 会长时间停在缩略图/预览图，不升到清晰原图。基本 100% 复现。第一次看 A 正常。

## 根因

查看器双层 `<img>`：预览图一直可见，原图 `load` 且 `decode()` 完成后才把 `decodedSource` 锁到原图 URL。切换源时会作废进行中的 decode token，防止旧图的异步升级写到新图上。

第二次看 A 时原图已在 Chromium 缓存里。React commit 阶段一写 `src` 就会**同步**触发 `load`，`promoteDecodedImage` 带着 token N 开始等 `decode()` / rAF。随后 `useEffect` 因为 `src` 变了把 token 加一并清空 `decodedSource`。N 的 continuation 发现 token 过期就返回。缓存命中不会再发第二次 `load`，清晰层的 ref 在升级前还绑在预览图上，于是一直停在预览图。

第一次看 A 是缓存未命中：`load` 发生在作废 effect **之后**，升级能完成。ABCBA 里第二次出现的图都会走到缓存命中这条路径。

## 修复

- `shouldRecoverCachedFullImage`：原图已经 `complete && naturalWidth > 0`、但 latch 还不是当前源时，需要再 promote 一次。
- 作废 decode token 改到 `useLayoutEffect`（commit 里的缓存 `load` 之后、绘制之前）。
- 增加稳定的 `fullImageRef`。layout 作废之后若原图已经解码，立刻再 `promoteDecodedImage`。

## 测试

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/zoomable-preview-image-cached-load.test.tsx tests/unit/viewer-mip-upgrade.test.ts tests/unit/zoomable-preview-image-fallback.test.ts` | 3 files / 6 passed |
| 去掉 layout 恢复后再跑 cached-load | 失败：`data-viewer-layer` 停在 `placeholder` |

未执行：packaged、Computer Use。

## 验收

2026-09-17 用户本人验收通过（原话「可以，验收通过」）。清单 VIEWER-MIP-001 记为人类验收通过。
