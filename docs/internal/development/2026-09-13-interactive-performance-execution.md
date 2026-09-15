# 2026-09-13 交互性能：设计、工单与 agent 执行安排

## 当前状态

- 用户 2026-09-13 要求在性能分支上开始实施。PERF2-01 已在本分支落地协议与基线入口（见 [PERF2-01 开发日志](2026-09-13-perf2-01-catalog-protocol-development-log.md)）；未实现读隔离或 UI 优化。
- 设计基线 dev `b2ece599`，0.2.1；性能分支 `codex/performance-20260913`。
- [顶层设计](../implementation/2026-09-13-interactive-performance-design.md) / [ADR-0033](../adr/0033-isolated-catalog-reads.md)。
- PERF2-NAV / NAS / MEDIA / MUT / REFRESH 的完整产品能力仍未完成，不进入人类验收队列。
- 设计阶段指定 Luna Extra High 实现；本轮 PERF2-01 由当前会话在性能分支直接实施。后续工单仍按索引串行，JSONL 只经 `node scripts/ticket.mjs` 更新。

## 工单索引

<!-- PERF2_TICKETS_START -->
总工单：`Serpent-e9a66b`「交互性能第二阶段：文件夹切换、NAS缓存、资源加载与刷新反馈」。

| 编号 / 工单 | 交付边界 | 技术前置 | 模型 / 状态 |
| --- | --- | --- | --- |
| PERF2-01 / `Serpent-41426d` | 端到端性能基线与读版本/提交回执协议 | 无 | 协议与基线已交付；见 PERF2-01 开发日志。读隔离未做 |
| PERF2-02 / `Serpent-6dc70b` | 提取共享纯读目录服务，分离隐藏物化写入 | PERF2-01 | Luna Extra High；实现与独立双轴复审通过；整体性能 / 产品验收未完成，工单保持 in_progress |
| PERF2-03 / `Serpent-0ecab5` | 只读UtilityProcess直达路由与真正的导航抢占 | PERF2-02 | Luna Extra High；未开始 |
| PERF2-04 / `Serpent-078a15` | 首屏优先的两阶段BrowseSession与稳定顺序 | PERF2-03 | Luna Extra High；未开始 |
| PERF2-05 / `Serpent-f60a3f` | NAS快照持久命中、版本发布与写后可见 | PERF2-03、PERF2-04 | Luna Extra High；未开始 |
| PERF2-06 / `Serpent-f6df4d` | 文件夹操作及时反馈与提交后局部投影 | PERF2-01 | Luna Extra High；未开始 |
| PERF2-07 / `Serpent-777a14` | 按影响范围刷新与全库对账最终收敛 | PERF2-05、PERF2-06 | 部分实现：链接根/已知文件定向刷新；完整收敛与 profile 验收未完成 |
| PERF2-08 / `Serpent-aea5b9` | 媒体描述符授权与本地预览缓存直达 | PERF2-05 | Luna Extra High；未开始 |
| PERF2-09 / `Serpent-312c29` | 元数据队列有界入队与维护写事务预算 | PERF2-05、PERF2-07 | 部分实现：RAW metadata backfill 有界准入；事务预算和全量验收未完成 |
| PERF2-10 / `Serpent-6db419` | 最终独立双轴审查与本地/SMB性能验收 | PERF2-04、PERF2-05、PERF2-06、PERF2-07、PERF2-08、PERF2-09 | Luna Extra High；未开始 |
<!-- PERF2_TICKETS_END -->

2026-09-14 两轮当前实例诊断补充了七个窄边界，详见[文件夹切换与资源加载性能优化方向](../implementation/2026-09-14-folder-switch-and-resource-loading-optimization.md)。2026-09-15 实现与实测进度见[开发与 profile 记录](2026-09-15-performance-implementation-profile-log.md)：

| 工单 | 交付边界 | 关系 / 状态 |
| --- | --- | --- |
| `Serpent-26f22b` | 打开对账消除逐文件探针放大并补齐阶段指标 | 部分实现；开库仍约 8 秒全量枚举 |
| `Serpent-e97c00` | 任务状态事件化与有界 single-flight 轮询 | 部分实现：`JobStatusCoordinator` 已 single-flight/降频；维护期状态查询已获有界准入；Worker 事件作为唯一新鲜度来源及任务面板验收仍未完成 |
| `Serpent-1de919` | ready artifact 与冗余派生任务队列收敛 | PERF2-09 前置；未开始 |
| `Serpent-be29a9` | 对账时间片归还后台许可，消除预览路径优先级反转 | 部分实现：维护批次安全点 yield、维护时可见前台准入及最多 3 个只读状态快照并行；可恢复 continuation 与大量目录扫描 profile 未完成 |
| `Serpent-8ee170` | thumbnail 完成后的 drag-cache 预热有界合并 | 独立小边界；未开始 |
| `Serpent-217028` | 2,000 后台任务下 navigation span 与对照回放 | 已实测最多约 4,050 队列忙碌导航及当前 50 queued 导航；当前环境队列远低于目标，运行/暂停同 scope A/B、navigationId 与主进程后处理 span 尚缺 |
| `Serpent-288cd9` | RAW metadata 空结果扫描游标化 | 已加有界准入/限频；exhausted cursor 与失效边界尚未实现 |
| `Serpent-7ac453` | foreground epoch 与后台媒体自适应降载 | 依赖 `Serpent-217028`；未开始 |

这些工单只细化已实测的瓶颈，不取代 PERF2-02/03/04/08 的读隔离、首屏和媒体缓存直达范围。此前约 4,000 个 queued task 的 profile 中，文件夹目标内容 p95 约 304 ms、可见图片全解码 p95 约 2.09 秒；本轮真实库队列只有 0–50 queued，四次切换内容 p95 301 ms、可见图全解码 p95 138 ms，不是 2,000 项验收。维护期只读 status snapshot 的 scheduler wait p95 已从约 12.4–12.6 秒降到 0.13–0.24 ms，navigation summary wait 从 12.39 秒降到 44 ms；两组队列状态和扫描阶段不同，不得用于推导后台吞吐变化。既有 2,000–2,600 项/分钟观测不是严格 A/B；用户报告的约 9,000 项吞吐及运行/暂停同 scope 对照仍由 `Serpent-217028` 补齐。

## 模型、所有权与串行规则

代码、测试脚本、集成、审查和QA agent 全部使用 `gpt-5.6-luna` / `xhigh`；只有资料整理可用 `high`。本轮已获用户授权，不再逐次询问；额度不足不擅自换模型或兑换额度。

只有协调者通过 `node scripts/ticket.mjs` 写 JSONL，实现 agent 返回需记录的交付评论；禁止旧 bd/Dolt。各 agent 有独立开发日志，QA清单与project-status由集成者统一更新。

PERF2-01先交付协议和基准；随后02与06可并行。shared protocol、LibraryService、App、Main/Worker入口和迁移尾部必须分配文件时段，不允许多人同时修改。两条代码轨道使用独立worktree，Luna集成者串行合流；其它用户任务不得覆盖。

Native重编译、依赖安装、E2E与最终合流检查由Luna集成者集中串行安排，测试后台且使用隔离userData，结束清理本次产物。

依赖表示技术前置未交付。前置代码和测试证据已经交付、但工单仍待用户验收时，协调者可向下游评论提交号/证据并解除该实现依赖；不可为得到ready结果伪造关闭。历史用户问题保持原验收要求。

## 每个开发任务的交付合同

1. 读AGENTS、设计、对应工单及既有实现/测试；先建立可运行基线，不把静态推断写成实测。
2. 只修改分配范围；新增逻辑抽模块，复用主题、协议、缓存、恢复和job机制。
3. 代码和受影响测试同交付；资源库相关完整跑availability，跨进程/媒体跑真实Electron。
4. 返回提交号、实际命令/结果、四列证据、遗留问题及供下游使用的接口。未跑只写未验证。
5. 不自签accepted，不关闭人类UI问题。可操作增量、相关自动化绿且无已知阻断后才提议加入人类验收。
6. 设计不可行时提交证据与替代建议，由协调者安排决策，禁止弱化目标或删除测试交差。

## 集成与最终验收

PERF2-10由未实现主要功能的**一个Luna Extra High agent**进行独立Standards+Spec审查与集中QA；主设计agent不审代码。有缺陷交回对应Luna实现者，由同一审查者复核。

Luna集成者运行最终 `verify:mainline` 和串行E2E。真实SMB/Windows无环境就记未执行；前台Computer Use先取得用户同意，不抢窗口。packaged必须当前提交新构建且只在dev，按发布规范恢复native；本轮未授权发布。不得用旧包证明新HEAD。

## 额度恢复后的调度

查询 `performance-v2` 标签与依赖，读此索引和交付评论，核对分支状态。从第一个未交付的技术前置安排单个有界Luna xhigh任务。派发须包含工单、设计章节、可写范围、共享文件时段、测试边界和交付合同。

额度不足时保存失败事实与待派任务，不循环重试、不改变模型、不让主设计模型代写。恢复后继续现有工单，不重做设计或重复开单。

## 首轮派发记录

设计提交 `8fd09dbc` 已推送性能分支。PERF2-01 已由 Luna Extra High 确认读取工作树/工单/设计并开始执行，未遇额度错误；其余任务等待技术前置。此前Luna High资料任务的额度错误不代表Luna Extra High开发不可用。

## 2026-09-15 主程受控 profile 后续

`Serpent-217028` 的同 scope 运行/暂停 profile 已在隔离 20,000 资产 mixed fixture 上补测：2,315 queued/1 running 与 2,521 paused 两轮各切换四个相同非空 scope；内容变化 p95 为 332/242 ms，可见图全部解码 p95 为 1,969/1,883 ms，无 timeout、解码覆盖率 100%。暂停仅快约 90 ms，不能解释真实实例报告的分钟级差异，也没有覆盖 9,000 项或真实混合任务类型。两轮 95 秒观察均约 500 项/分钟且任务全为缩略图。完整解释仍需真实队列构成、Main/custom-protocol/native decoder 进程级 profile 与 NAS 冷态读取证据。

补充的恢复命令修复把同 fixture 2,521 个任务的 `media.resume-jobs` 从旧实现约 9.8 秒降至 14 ms round-trip；恢复后队列只保留暂停项、导航生成项及有界 pump 续填。该实现和断言记录在 2026-09-15 profile 日志，尚不意味着 PERF2-09/217028 或整个 PERF2 计划验收完成。fixture mtime 失真也已修正并升版；旧 fixture 首次开库 153.6 秒指纹数据不再作为生产结论。

缓存基准澄清：导航 profile helper 原先默认强制打开 preview cache，因此上述运行/暂停 p95 不是“缓存关闭”。现已接受显式 `SERPENT_PREVIEW_CACHE_FORCE=0/1` 并输出实际开关；就绪预览在 cache-off/on 回访的 100% 解码覆盖下 p95 为 16/11 ms，但首屏可能预热且各 n=4，不构成冷 NAS 的缓存性能承诺。首轮约 1.9 秒全图解码须继续定位到产物就绪、协议传输和 Renderer 阶段。
