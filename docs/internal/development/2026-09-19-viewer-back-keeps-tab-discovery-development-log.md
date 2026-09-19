# 2026-09-19 查看器后退清空格式过滤

> 用户从文本查看界面返回后，格式过滤消失，并要求按导航模型处理，而不是再打一处补丁。
> 工作树内交付，未经用户许可不提交、不推送。

## 原因

Discovery（搜索、格式/颜色/标签等过滤）属于当前标签，不属于历史栈里的单条
location。查看器是浏览的附属层（REQ-VIEW-004）：X/Esc 走 `closeAssetPreview`，
不改 chips。工具栏/鼠标 Back 却先 `history.back()`，再 `applyWorkspaceLocation`
→ `chooseFolder`，且 replay 请求不带 `browseState`。

`chooseFolder` 把「没有 browseState」当成空快照：Worker 查询只带 sort，提交时
`clearDiscoveryControls()`。所以从 txt 查看器返回等于无过滤重载当前文件夹。

## 规则

写在 `workspace-discovery-navigation.ts` 与算法 §7，避免各入口各自猜测：

1. 同标签 Back 若离开的是 preview、到达的是该 preview 之下的浏览条目：只关查看器
   并恢复视口，不重新 `chooseFolder`。
2. 同标签 `push` / `replay` 未带 `browseState`：沿用 live discovery，不得清空。
3. 切标签 / 恢复（`historyMode: "none"`）：有快照则 apply；无快照才用空
   discovery（新标签不能继承上一标签的过滤）。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测 | `npx vitest run tests/unit/workspace-discovery-navigation.test.ts tests/unit/workspace-mouse-navigation.test.ts tests/unit/workspace-nav-history.test.ts` | 3 files / 42 passed |
