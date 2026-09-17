# 2026-09-17 应用窗口全屏快捷键

工单：`Serpent-692279`

## 需求

Windows 按 F11 将 **Serpent 窗口**设为系统全屏。macOS 应对齐平台习惯。

## 键位

| 平台 | 快捷键 | 理由 |
| --- | --- | --- |
| Windows | `F11` | 浏览器、VS Code、Electron `togglefullscreen` 默认键。Windows 无原生菜单栏，此前 F11 无加速键。 |
| macOS | `⌃⌘F`（Control+Command+F） | Safari、Chrome、VS Code、Apple HIG / Electron 角色默认。**不要用 F11**：系统默认是「显示桌面」。 |
| Linux | 原生 View 菜单已有 `togglefullscreen`（F11） | 未改 |

这是 `BrowserWindow.setFullScreen`，不是查看器 `element.requestFullscreen()`。

## 实现

- Windows 隐藏加速键菜单始终带 `role: togglefullscreen` + `F11`（`acceleratorWorksWhenHidden`），与 F2/Delete 同路，避免再设 `Menu.setApplicationMenu(null)` 丢掉加速键。
- Windows 应用内「窗口 → 切换全屏」走 `windowControl("fullscreen-toggle")`。
- macOS 继续用 View 菜单的 Electron `togglefullscreen`（⌃⌘F），Renderer 不再发一次 IPC，避免连按两次等于没切。

## 测试

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/window-fullscreen-shortcut.test.ts tests/unit/window-controls.test.ts tests/unit/main-menu-items.test.ts tests/unit/platform-shortcut-table.test.ts tests/unit/application-menu.test.ts` | 5 files / 33 passed |

未执行：真实 Electron 按键、packaged、Computer Use。请用 SHELL-FS-001 验收。
