# .blend 可旋转 3D 预览

> 状态：withdrawn
> 日期：2026-09-17
> 工单：`Serpent-60ff4e`

2026-09-18 产品撤回 `.blend` 支持，本增量代码已删除。原因见 [2026-09-18 调研](../research/2026-09-18-blend-preview-without-blender.md) 与 [撤回日志](2026-09-18-blend-support-withdrawn-development-log.md)。下文保留当时实现记录。

配套：[人类验收清单](../qa/human-acceptance-checklist.md) `FMT-BLEND-002`（已撤回）

## 范围

卡片继续用 Blender 写进文件的 `TEST` 静帧。双击查看器不再显示该静帧，改为与 FBX 同一套轨道球：本机 Blender 把 `.blend` 导出为 GLB 缓存，Renderer 用 GLTFLoader 加载。不捆绑 Blender，也不用 three.js 直接读 `.blend`。

## 实现

- 协议 `model.convert-blend` / `.done`。产物 kind `model_glb`，`generator_version` 为 `blender-gltf-1`，与 FBX 的 `ufbx-wasm-1` 分开。
- Worker 查找顺序：`SERPENT_BLENDER_PATH`、`PATH`、Windows `Blender Foundation` 安装目录、Steam 常见路径、macOS `/Applications/Blender.app`。
- 调用 `blender --background --factory-startup --python-exit-code 1 <源> --python export.py -- <临时.glb>`，成功后写入派生制品并删除临时目录。
- 本机没有 Blender：`BLEND_BLENDER_UNAVAILABLE`，查看器提示安装后重试，不退回静帧。
- `.blend` 仍不进入离屏 WebGL 缩略图格式表；卡片只走 TEST PNG。

## 测试

命令在本机工作副本执行；夹具为内存构造的最小 blend 与伪造 GLB，不含用户文件。Blender 可执行文件用注入解析器，不依赖本机安装。

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` 与 `npx tsc --noEmit -p tsconfig.extension.json` | 通过 |
| `npx vitest run --config vitest.config.ts tests/unit/blend-convert.test.ts tests/unit/blend-preview.test.ts tests/unit/3d-viewer-error-messages.test.ts tests/unit/protocol.test.ts tests/unit/worker-client.test.ts tests/unit/media-formats.test.ts tests/unit/summary-media-type.test.ts` | 7 files / 162 passed |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/blend-convert.test.ts tests/worker/blend-preview.test.ts` | 2 files / 4 passed |
| `npx eslint`（转换管线、协议、查看器、相关测试） | 通过 |
| `npm run test:library-availability` | 9 files / 226 passed / 1 skipped |

未执行：Computer Use、packaged、真实 Blender 可执行文件导出。
