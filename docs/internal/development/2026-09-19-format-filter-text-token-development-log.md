# 2026-09-19 格式过滤「文本」触发未分类内部错误

> 用户勾选格式过滤里的「文本」后出现 INTERNAL_ERROR 兜底句。
> 工作树内交付，未经用户许可不提交、不推送。

## 原因

会话日志 `main.library-request` 为 Zod `filters[0].values` `too_big`，上限 32。

格式芯片「文本」是一个 `text` 令牌，Worker 的 `expandFormatFilterTokens` 会把它展开成全部文本扩展名（超过 32 个）。Renderer 在组搜索请求时也展开了一次，协议先拦住，映射成未分类内部错误。

勾选全部格式分类时，未展开的扩展名列表也会超过 32。

## 处理

Renderer 只发送压缩令牌（`text`、`unknown`、具体扩展名）。Worker 仍负责展开。格式字段 `values` 上限提到 256；标签等分类字段仍是 32。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测 | `npx vitest run tests/unit/text-media.test.ts tests/unit/filter-clause.test.ts` | 2 files / 10 passed |
