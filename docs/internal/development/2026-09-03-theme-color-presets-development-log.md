# 主题预设快速配色与高级颜色配置开发日志

工单：`Serpent-0c2f64`  
分支：`codex/theme-color-presets`  
基线：`dev`（`1b9c8669`）

## 需求对齐

- 保留 Serpent、VS Code、柔和三种主题；主题预设负责整套表面、文字和状态语义色。
- 在主题预设卡片下增加一排纯色圆形快捷主题色，快捷色只改 action accent，可与任一主题组合。
- 现有“主题色设置”入口改名为“高级颜色配置”；其中的完整语义色编辑仍保留，不与快捷色合并。
- 颜色层级为：主题预设 → 快捷主题色 → 高级颜色配置。快捷色按钮会清除高级配置中的 action accent 字段，以保证点击后立即生效，但不会清除高级配置中的其他颜色。

## 实现计划与记录

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 快捷色偏好独立存储、校验和回退 | 已实现 | `src/renderer/theme/theme-accent-preferences.ts`；`tests/unit/theme-accent-preferences.test.ts` |
| 主题组合与高级颜色配置的优先级 | 已实现 | `src/renderer/theme/theme-composition.ts`；`tests/unit/theme-profiles.test.ts` |
| 外观设置圆形快捷色与双语文案 | 已实现 | `ThemeAppearanceControls.tsx`、i18n catalogs、`styles.css` |
| Computer Use 真实 Electron 外观检查 | 已执行，待用户复验 | 首次检查未覆盖主界面过滤/侧栏；拒收后已重新检查 VS Code + 紫色的真实控件 |
| 独立代码审查 | 待执行 | 按仓库门禁在实现稳定后执行 |
| Windows / packaged / 真实 DPI | 未验证 | 当前环境无 Windows；待对应平台 QA |

## 2026-09-03

已从干净 `dev` 切出专用分支；确认旧的 `serpent.accent-prefs.v1` 是历史迁移入口，不能继续作为新功能存储。新快捷色使用独立 `serpent.theme-accent.v1`，避免把快捷搭配和高级语义色配置混成一个持久化层。

## Computer Use 视觉检查（首次检查，覆盖不足）

2026-09-03 首次使用当前分支启动真实 macOS Electron 开发态应用，仅通过设置 → 外观完成以下检查。该次检查没有打开主界面的过滤面板，也没有检查侧栏控件；因此不能覆盖“所有 action surface 同步换色”的规格，且结论已被用户后续反馈拒收：

- 亮色 + Serpent：主题卡、快捷色圆点、四档字体滑块和“高级颜色配置”入口在同一张设置卡内，圆点尺寸与颜色过滤器一致，未出现裁切或横向溢出。
- 亮色 + VS Code + 紫色：点击 VS Code 主题卡和紫色圆点后，主题卡选中描边与全局 action accent 同步，紫色圆点出现选中环；设置侧栏和控件的对比度保持清晰。
- 暗色 + VS Code + 紫色：亮暗表面、侧栏、主题预览和快捷色选中环均同步切换，未发现白底残留、蓝色冻结或文本不可读。
- 关闭并重新打开设置后，VS Code、暗色和紫色快捷色仍保持选中，证明本次窗口生命周期内的持久化读取路径正常。

截图在本次 Computer Use 检查过程中逐张复核；Windows、packaged 和真实 DPI 分辨率仍未执行，不能据此宣称跨平台验收通过。

## 用户拒收后的复现、根因与修复（2026-09-03）

用户反馈“VS Code + 紫色”下过滤“修改时间”按钮和侧栏按钮仍然是蓝色，并拒收标签过滤界面。根据诊断流程重新在真实 macOS Electron 开发态复现后确认：

- 快捷主题色只写入了 `--ui-action-accent`；主题 profile 自带的 `--ui-action-accent-soft`、`--ui-content-accent`、`--ui-border-focus` 等派生 token 仍保留静态蓝色。
- 过滤排序按钮和侧栏按压态使用这些派生 token，所以只检查根 `--accent` 或设置页选中环会漏掉回归。
- 标签过滤仍从旧的 `top/common` 语义渲染，且建议区域与底部操作区共用布局滚动，不能同时满足“最近筛选 + 所有标签”、只滚动所有标签和底部提示完整可见。

本轮修复：

- 主题组合在存在快捷色或高级 accent 时重新计算完整的 accent 派生 token，并补齐 `--ui-action-selected`；高级颜色配置仍有最终覆盖权。
- 标签默认数据改为完整 `all` 集合 + 最多六项的 `recent` 快速区；搜索结果默认不截断。
- 标签面板改为固定搜索/排序、最近筛选最多两排、所有标签独立滚动最多六排、底部“排除/按住 Shift 可多选”固定可见，并删除“常用标签”文案。

修复后的 Computer Use 复核：真实 macOS Electron 中切到 VS Code + 紫色，主界面“修改时间”按钮、侧栏折叠按钮和过滤面板排序按钮均显示紫色；标签面板同时显示“最近筛选”和“所有标签”，滚动所有标签到末尾再返回顶部时，底部两行仍完整可见。随后用户确认主题色通过；该证据只代表当前 macOS 开发态，Windows、packaged、窄屏/DPI 未验证。

## 自动化结果（2026-09-03）

- `npx vitest run --config vitest.config.ts tests/unit/theme-accent-preferences.test.ts tests/unit/theme-profiles.test.ts`：2 个文件、18 个测试通过。
- `node scripts/run-e2e.mjs tests/e2e/shell-navigation.test.ts`：1 个 Electron E2E 通过（约 10 秒）。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test`：507 个文件通过、15 个跳过；4,385 个测试通过、25 个跳过；`tests/worker/reconciliation-performance.test.ts` 的事件循环 P95 为 76.6ms，阈值 75ms，单项失败。该性能用例不触及本次 Renderer 主题代码，因此不能把本次全量测试记为全绿。

补充回归（当前 HEAD，2026-09-03）：用户确认主题色通过后，标签选中态继续完成实现；`npm run test` 为 508 个文件 / 4388 个测试通过，15 个文件 / 25 个测试跳过。此前失败的性能阈值记录保留为历史结果，不代表当前 HEAD。
