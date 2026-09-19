# 2026-09-19 文本预览自动识别编码

> 用户打开 Windows 中文说明类 `.txt` 时预览乱码。
> 工作树内交付，未经用户许可不提交、不推送。

## 原因

`readTextAsset` 把源文件字节一律 `toString('utf8')`。没有 BOM 的 GBK/GB18030 在 UTF-8 下是非法序列，界面出现替换字符。卡片预览、Inspector 和查看器都走这条读取。

第一版用自制双字节合法率 + CJK/Hangul 计数。GBK 与 EUC-KR 的 lead/trail 范围重叠，Big5 误解码也会得到大量 CJK 统一汉字，分数把 GBK 说明判成韩文或繁中。用户验收：「完全不通过。所有gb都识别为韩文了」。

## 处理

对齐 VS Code `files/encoding.ts` 的顺序：BOM → UTF-16/二进制 NUL → 合法 UTF-8 → 统计检测。VS Code 用 LGPL `jschardet`；本仓库用 MIT [`chardet`](https://github.com/runk/node-chardet)（ICU / Mozilla universalchardet）。GB2312/GBK/GB18030 映射到 `TextDecoder('gb18030')`。保存仍写 UTF-8。

ICU 在双字节很少时会给所有 MBCS 相同的低分，`chardet` 再按注册顺序把 Shift_JIS 排第一。并列最高分时优先 GB18030，避免短 GBK 标题被当成日文/韩文。段落级韩文/日文/Big5 仍由 `chardet` 以高分单独命中。

测试只用合成码页字节，不引用本机资源库路径。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测 | `npx vitest run tests/unit/text-encoding.test.ts` | 1 file / 9 passed |
| Worker | `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/text-encoding.test.ts` | 1 file / 1 passed |
| 人类验收 | TEXT-ENCODING-001 | 2026-09-19 用户本人验收通过（用户原话「验收通过」） |
