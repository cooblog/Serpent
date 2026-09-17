# 撤回 `.blend` 支持

> 状态：withdrawn
> 日期：2026-09-18
> 工单：`Serpent-60ff4e`

配套：[人类验收清单](../qa/human-acceptance-checklist.md) `FMT-BLEND-001` / `FMT-BLEND-002`（已撤回）  
依据：[调研](../research/2026-09-18-blend-preview-without-blender.md)

## 原因

1. 没有与 FBX 的 ufbx→GLB 同级的公开网格解析器覆盖 Blender 3–4.x。现成 DNA 读头不求值修改器、几何节点和节点材质。
2. Assimp 已停更 `.blend` 导入。
3. 捆绑 Blender 体积为数百 MB 级，且 GPL 与当前 MIT Desktop 分发不合。
4. 依赖本机安装 Blender 作为查看器前置，产品不接受。

因此不把 `.blend` 登记为模型：可入库，`detectMediaType` 为 `other`，通用图标，不进 3D 查看器，格式过滤 3D 组无 blend。需要预览时从 Blender 导出 glTF 或 FBX。Maya / 3ds Max / Cinema 4D 仍为研究项。

## 清理范围

删除 `blend-preview` / `blend-convert` 模块与协议 `model.convert-blend`；`MODEL_EXTENSIONS` 恢复为 FBX/OBJ/glTF/GLB/STL。已导入文件的 `media_type` 列不改写；重新分类后走 `detectMediaType`。

## 自动化

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts`（media-formats / summary-media-type / thumbnail-support / 3d-viewer-error-messages / protocol / worker-client / model-thumbnail-protocol） | 7 files / 160 passed |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-throughput.test.ts tests/worker/derived-artifact-repair.test.ts` | 2 files / 13 passed |
| `npm run test:library-availability` | 9 files / 226 passed / 1 skipped |

packaged / Computer Use 未执行。`npx tsc --noEmit` 当前工作区另有 `import-progress-session.ts` 既有报错，与本撤回无关。