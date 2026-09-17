# .blend 内嵌预览图

> 状态：withdrawn
> 日期：2026-09-17
> 工单：`Serpent-60ff4e`

2026-09-18 产品撤回 `.blend` 支持，本增量代码已删除。原因见 [2026-09-18 调研](../research/2026-09-18-blend-preview-without-blender.md) 与 [撤回日志](2026-09-18-blend-support-withdrawn-development-log.md)。下文保留当时实现记录。

配套：[人类验收清单](../qa/human-acceptance-checklist.md) `FMT-BLEND-001`（已撤回）

## 范围

`.blend` 作为模型入库。卡片和查看器使用 Blender 写进文件的 `TEST` 预览图。不解析网格，不捆绑 Blender，查看器不是可交互 3D。

## 实现

- `MODEL_EXTENSIONS` 增加 `.blend`；MIME `model/x-blender`。格式过滤 3D 组随之出现。
- Worker 按 blender-thumbnailer 读文件头、跳过 `REND`、提取 `TEST` 的宽高与自下而上 RGBA，gzip / zstd 只解压到该块。行序在写入 PNG 前翻成自上而下。
- 预览写入标准 `thumbnail` PNG，`generator_version` 为 `blend-preview1`。最长边内侧不超过 512。
- 查看器：有现成 PNG 时走静帧（与图片同一套缩放），不把 `.blend` 交给 three.js。
- 没有 `TEST` 块：`BLEND_PREVIEW_MISSING`，卡片保持通用 3D 图标；该失败码不参与派生修复重试。
- `.blend` 提取在 Worker 内完成，可见卡片快速波次会处理它；FBX/OBJ/glTF/GLB/STL 仍排除在该波次之外。

## 测试

命令在本机工作副本执行；夹具为内存构造的最小 blend，不含用户文件。

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts tests/unit/blend-preview.test.ts tests/unit/media-formats.test.ts tests/unit/summary-media-type.test.ts tests/unit/thumbnail-support.test.ts tests/unit/format-filter-presets.test.ts tests/unit/model-thumbnail-protocol.test.ts` | 6 files / 39 passed |
| `npx vitest run --config vitest.config.ts tests/unit/blend-preview.test.ts tests/unit/media-formats.test.ts`（补 flip helper 后） | 2 files / 15 passed |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/blend-preview.test.ts tests/worker/thumbnail-throughput.test.ts tests/worker/derived-artifact-repair.test.ts` | 3 files / 15 passed |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/blend-preview.test.ts`（PNG 签名断言后） | 1 file / 2 passed |
| `npx tsc --noEmit` 与 `npx tsc --noEmit -p tsconfig.extension.json` | 通过 |
| `npx eslint`（blend 相关 Worker / 共享 / 查看器 / 测试文件） | 通过 |
| `npm run test:library-availability` | 9 files / 226 passed / 1 skipped |

未执行：Computer Use、packaged、真实 Blender 工程文件（需用户点验）。
