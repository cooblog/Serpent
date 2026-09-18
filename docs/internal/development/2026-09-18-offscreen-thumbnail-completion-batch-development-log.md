# 2026-09-18 离屏缩略图完成事件批量与卡片投影

## 范围

`Serpent-df0ec0`。设计见 [后台媒体吞吐与视口优先级](../implementation/2026-09-18-background-media-throughput-and-viewport-priority.md) §7.4、§10 第 1 步。

本增量只改变完成事件如何到达 Renderer，不提高解码并发。

## 原因

后台主预览完成与 Renderer 私有内存增长同时出现。Worker 此前为每一项单独发送 `asset.thumbnail.ready`，Renderer 即使资产不在当前浏览范围也会做卡片 patch 与任务活动记录。

## 行为

- 当前视口、文件夹封面、以及显式 `media.generate-thumbnail` 仍逐项立即送达。
- 其余完成项在 75 ms 窗口内合并为 `asset.thumbnail.batch-ready`，每条最多 100 项；队列空闲时立即 flush。
- Renderer 只把当前已加载浏览摘要、视口、选中项、查看器与文件夹封面投影到卡片状态。范围外的完成留在数据库，等下一次 browse 页。
- 一批完成只记一次任务活动。旧 library 的待发批次在关闭/切换时丢弃。

## 未做

- 未跑 Electron CDP heap snapshot，因此不能把 Renderer 内存平台写成已验证。
- 未改 `serpent://` 缓存大小，也未做 5,000 离屏项的真实 Electron E2E。
- 视口 band / 10 秒门闩 / FFmpeg 双进程仍走 `Serpent-926e2f` 与 `Serpent-7ac453`。

## 测试

```
npx vitest run tests/unit/thumbnail-completion-fanout.test.ts tests/unit/thumbnail-completion-projection.test.ts
```

## 验收

清单 `MEDIA-MEM-001` / `Serpent-df0ec0` 待人类验收。heap 与 5,000 项隔离 fixture 仍待补。
