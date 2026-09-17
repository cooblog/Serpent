# `.blend` 不安装 Blender 的网格预览方案

> 日期：2026-09-18  
> 问题：双击 `.blend` 要可旋转 3D，是否存在不启动、不捆绑 Blender 的现成解析/转换器。  
> 结论：没有与 ufbx→GLB 同级的现成方案。能离线读网格的库都是 DNA 解析器，覆盖版本窄、不求值修改器、不还原节点材质。Assimp 已停更 `.blend`。  
> **产品决定（同日）**：不支持 `.blend`。从格式注册表、3D 查看器与路线图研究项中撤回。可入库为 `other`。依据见下文。

## 仓库内既有判断

2026-08-05 竞品调研把 BLEND 标为「无可靠公开解析 / 不做」，建议提示导出 glTF/FBX。[3D 预览竞品调研](2026-08-05-3d-preview-competitive-analysis.md)  
路线图已把 `.blend` 从研究项改为「不做」。[mvp-roadmap](../implementation/mvp-roadmap.md)

曾落地过：卡片读文件内嵌 `TEST` 静帧；查看器走本机 `blender --background` 导出 GLB。2026-09-18 产品撤回这两条路径，相关代码已删除。

## 不启动 Blender 的现成路径

| 方案 | 许可 | 能做什么 | 对当前产品的缺口 |
| --- | --- | --- | --- |
| 内嵌 `TEST` 静帧（已落地） | 自研读块 | 卡片图，与资源管理器缩略图同源 | 不是网格，不能轨道旋转 |
| [jsblender](https://github.com/verekia/jsblender) | MIT，TS，Node/浏览器 | 解 zstd、读 SDNA、`extractMeshes` / `extractMaterials` / 贴图块 | 文档写明只验证 **Blender 5+**；修改器、节点树、动画不解析。Blender 4.x 工程不在范围内 |
| [JS.BLEND](https://github.com/acweathersby/js.blend) + [threepipe blend-importer](https://threepipe.org/package/plugin-blend-importer.html) | MIT / 插件 WIP | 把 DNA 结构变成 JS 对象，three 场景里已有 Mesh / BufferGeometry / 基础点光 | 官方标注 WIP；PBR 材质未做；2017 年起的 DNA 布局跟不上 3.x/4.x |
| [tinyblend](https://github.com/gabdube/tinyblend)、[blend crate](https://github.com/lukebitts/blend)、[Kaitai blender_blend](https://formats.kaitai.io/blender_blend/python.html) | 开源 DNA 读头 | 读结构、按名字取 datablock | 多不支持压缩；测试停在 2.7x–2.80；没有现成 glTF 导出 |
| [Assimp](https://github.com/assimp/assimp/issues/5104) / assimpjs / 浏览器 WASM 转换页 | BSD-3（Assimp） | 历史上能读部分 2.8 左右文件 | 维护者 2023-11 关闭导入：不再支持 Blender。3.x 常见失败。官方文档写 deprecated，建议从 Blender 导出 glTF |
| Eagle 3D Format Extension | 闭源插件 | glb/fbx/obj/stl 等约 20 种 | 格式表无 `.blend`；Eagle 另有「无法预览 Blender」说明 |

## 为什么没有「第二个 ufbx」

`.blend` 是 Blender 进程内存的 DNA 转储：网格可能仍带修改器栈，材质是节点树，几何布局在 3.0 / 4.0 / 5.0 换过（`MVert` → `AttributeStorage`）。离线解析器只能读**已经写进文件的求值前数据**。官方可交付网格路径仍是 [glTF-Blender-IO](https://github.com/KhronosGroup/glTF-Blender-IO)，它跑在 Blender 里。

捆绑 Blender 二进制会引入体积（数百 MB 级）和 GPL 分发约束，与当前 MIT Desktop 分发模型不合。在线转换则把用户工程送出本机。

## 产品决定

不走 DNA 灰模，也不再依赖本机 Blender 导出。`.blend` 退出格式表与 3D 查看器。
