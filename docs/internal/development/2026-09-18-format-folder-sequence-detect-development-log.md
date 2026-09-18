# 2026-09-18 格式杂项、所在文件夹与序列帧检测

## 范围

1. 格式过滤原「其他」组（html / hdf / htm / 文本）改名为「杂项」；新增「其他」勾选，筛 `detectMediaType === other` 的未识别扩展名。
2. 浏览中跳到资产所在库内文件夹：命令 `asset.show-in-library-folder`，Windows `Ctrl+B` / macOS `⌘B`。跳转后选中并尽量居中。与系统资源管理器显示（`Ctrl+Shift+S`）分开。
3. 「启用序列帧检测」总开关 + 既有「导入时自动检测序列帧」：
   - 总开关关：导入不检测、不弹窗、不自动成组。
   - 总开关开、自动关：文件先按普通资产导入，进度结束后弹出序列帧窗口。
   - 两个都开：疑似序列直接做成序列，不再先弹窗。

## 实现要点

- 未识别格式 token 为 `unknown`。SQL 为「相对路径不匹配任一已知产品扩展名」，已知集合与 `detectMediaType` 注册表对齐（图像/视频/模型/文档/音频/文本）。hdf 仍在杂项 chip 里，同时也命中「其他」。
- 所在文件夹用 `browseScopeForAsset`，即使当前是「所有资产」也要切到具体文件夹；已在该文件夹且不在合集/回收站时只选中并 `scrollIntoView({ block: "center" })`。
- 预导入 `probe-sequences` 对普通选文件/拖入不再拦截。自动检测走 Worker `createDetectedImageSequences`；非自动走导入完成后的 `postImportSequencePlanFromAssets` + 既有序列帧对话框。粘贴仍强制 `createImageSequence: false`（PASTE-001）。

## 验证

定向单测：`format-filter-presets` / `text-media` / `catalog-read` / `asset-commands` / `browse-command-keyboard` / `pending-asset-reveal` / `image-sequence-preferences` / `post-import-image-sequences` 通过。

`npm run test:library-availability`：9 files / 226 passed / 1 skipped。

packaged / Computer Use 未执行。
