# 2026-09-18 Ctrl+B 出现「无法读取资产」

## 范围

`NAV-FOLDER-001` / `Serpent-6c0aac`。从「所有资产」用 Ctrl+B 跳到所在文件夹。

## 原因

`showAssetInContainingFolder` 调用 `chooseFolder(..., { blockingNavigation: true })`。从「所有资产」切到具体文件夹时，`refreshSidebar` 为 false（侧栏摘要故意不挡浏览页）。`blockingLibraryLoad` 仍等待这份摘要，得到 `undefined` 后抛出「无法读取资产」。

同一判断也会影响导入完成后跳文件夹。

## 行为

- 从「所有资产」Ctrl+B / 右键应进入该资产所在库内文件夹，选中并尽量居中。不再出现「无法读取资产」。
- 菜单文案为「在所在文件夹中显示」。系统资源管理器仍是「在文件浏览器中显示」/ Ctrl+Shift+S。

## 实现

- `missingNavigationSummaryIsFailure`：只有真正请求了侧栏摘要却没回来，才算失败。
- Ctrl+B 走与点侧栏文件夹相同的 `chooseFolder` 路径，不再套 library-switch 的 blocking 等待。

## 测试

`npx vitest run tests/unit/blocking-navigation-summary.test.ts tests/unit/asset-commands.test.ts tests/unit/browse-command-keyboard.test.ts`

## 验收

清单 NAV-FOLDER-001 回到待人类验收。格式筛选 / 序列帧 / 100 项浏览已由用户记为通过。
