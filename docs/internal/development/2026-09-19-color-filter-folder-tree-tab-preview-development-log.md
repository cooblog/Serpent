# 2026-09-19 颜色过滤、文件夹树展开/收起、标签页查看器恢复

日期：2026-09-19

## 范围

1. 颜色过滤支持自定义颜色和相似度；匹配同时使用色相、饱和度、亮度。
2. 文件夹右键「收起所有 / 展开所有」，作用于当前节点及递归子文件夹，资源库根目录同样提供。
3. 标签页 A 打开查看器后切到标签页 B 再回来，应回到 A 的查看器而不是 B 的文件夹。

## 颜色过滤

先前只按 `dominant_hue` 分桶。无彩度图的色相常被写成 0，因此「红」会命中灰图/黑白图。

- schema v56 增加 `revision_artifacts.dominant_saturation`（只加列）。
- 打开可写库时从已有色卡 JSON 回填饱和度。
- 新提取写入 HSL 三元组。
- 过滤改为以目标色为中心的 HSL 盒子：有彩度目标要求最低饱和度；黑/白按亮度和低饱和度。
- 色卡旁可添加自定义 hex；相似度直接显示（默认 30，越高越严），不提供标准色编辑。
- 点「+」立刻打开应用内拾色面板（饱和度/明度平面、色相条、RGB）；确认在右、取消在左。拖动时上方色盘显示草稿色，浏览按该色实时过滤；确认才写入自定义色，取消恢复进入拾色前的颜色过滤。
- 第一排十个标准色单行不折行；排除在相似度下面；相似度标签与短滑块同一行。

## 文件夹树

侧栏命令 `folder.expand-all` / `folder.collapse-all` 写入 `collapsedFolderIds`。根 sentinel 表示整棵统一目录树。

## 标签页查看器

共享历史在切到 B 时会把 B 的文件夹压在 A 的 preview 上面。恢复 A 时若用 `peek(-1)`，会把 B 的文件夹当成 A 的浏览范围。改为按同一 `tabId` 往回找到非 preview 条目。

## 测试

定向单测：`color-filter-presets`、`color-filter-preferences`、`color-filter-popover`、`color-hsl`、`palette-extractor`、`sidebar-commands`、`unified-directory-nav`、`workspace-nav-history`、`workspace-tabs`、`dimension-filter-bar`。

`npm run test:library-availability`：9 files / 228 passed / 1 skipped，约 112s。
