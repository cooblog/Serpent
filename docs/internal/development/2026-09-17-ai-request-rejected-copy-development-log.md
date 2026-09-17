# 2026-09-17 AI 请求被拒文案

工单：`Serpent-0a8f9a` / AI-ERR-001

## 问题

打包应用导入后自动分析失败，界面写「AI 供应商返回了无法解析的结果」。日志是 HTTP 400、`invalid_request_error`、`This response_format type is unavailable now`：供应商拒收结构化输出参数，并不是分析完成却读不懂正文。

降级识别只匹配 `not available`，匹配不到 `unavailable`，因此不会改用 `json_object` / 纯文本。

## 改动

- 新增公共原因 `AI_REQUEST_REJECTED`：HTTP 400/422 或明确的输出格式拒收。
- 真正解析失败仍用 `AI_INVALID_RESPONSE`，文案改为「没有给出可用的分析结果」。
- `unavailable` 视为格式不兼容，继续降级。
- 后台任务列表展示映射后的用户文案，不再把诊断串当作正文。

## 测试

`npx vitest run tests/unit/ai-protocol.test.ts tests/unit/ai-job-error-message.test.ts tests/unit/protocol.test.ts tests/unit/ai-connection-failure.test.ts` → 4 files / 198 passed.
