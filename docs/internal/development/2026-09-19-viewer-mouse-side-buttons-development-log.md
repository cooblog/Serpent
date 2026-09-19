# 2026-09-19 查看器鼠标侧键被吞

> 用户在文本查看界面按鼠标前进/后退侧键无效，并要求核对其余界面。
> 工作树内交付，未经用户许可不提交、不推送。

## 原因

REQ-NAV-007 规定搜索框、Inspector 可编辑字段和模态对话框里不抢侧键。实现把**所有** `input` / `textarea` / `select` 都当成该例外。文本查看器的 textarea 会 `autoFocus`，侧键的 `pointerdown` 目标落在它上面，窗口监听直接 return。

同类缺口：

- 字体查看器预览文字框、字号滑块
- 图片/视频查看器缩放滑块、色彩空间 `<select>`
- 3D 查看器显示模式与灯光滑块
- HTML 预览在 iframe 里，侧键事件不到宿主 window（已把侧键从同源 iframe 再派发到 window）

搜索框、Inspector 描述、设置对话框仍跳过侧键导航。

插件查看器 overlay iframe 是 `sandbox="allow-scripts"`、无 `allow-same-origin`，读不到 `contentDocument`，侧键在 overlay 正上方仍到不了宿主；未放宽该沙箱。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测 | `npx vitest run tests/unit/workspace-mouse-navigation.test.ts` | 1 file / 7 passed |
