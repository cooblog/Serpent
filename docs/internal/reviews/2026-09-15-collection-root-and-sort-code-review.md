# 合集根级操作与侧栏排序双轴代码审查

> 日期：2026-09-15
> 分支：`dev`
> 审查基点：`b69df982b9fe302962248d4e0395f4d58886183f`
> 审查模型：Composer 2.5
> 范围：当前工作树未提交改动

## 首轮发现与处理

1. E2E 合集创建辅助函数曾在通过 API 建立子合集后继续执行根级 UI 输入流程，导致自动化证据不可靠。已恢复为单一用户路径：父合集右键「新建子合集」→ 输入 → Enter；根级创建才点击分节「+」。
2. Worker 变更初始缺少资源库可用性门禁证据。已执行 `npm run test:library-availability`，结果为 9 files / 214 passed / 1 skipped；`updateCollection` 的 `created_at` 读取同时改为按列存在性选择，并将空值映射为可选字段。

## Standards

- Electron Renderer / Preload / Main / Worker 仍通过 typed API 传递 `parentId: null`，Renderer 未获得路径、SQL 或数据库能力。
- 合集排序控件、比较器、偏好校验和主题样式复用文件夹实现；合集使用独立偏好键。
- 合集摘要不依赖 `created_at`；Worker 的合集列表和更新返回不再读取该字段，资源库可用性门禁通过。
- 测试临时目录由隔离 Electron E2E 生命周期清理；仓库文档未写入本机绝对路径或用户数据。

结论：未发现仍阻断合流的 Standards 问题。

## Spec

- 合集分节「+」固定传入根级 `null`。
- 合集列表空白区只接受嵌套合集，调用既有 `updateCollection` 将 `parentId` 设为 `null`；行上同层重排和资产投放保持原语义。
- 合集按名称、资产数和方向排序，且每个父级层次都排序；合集不提供创建时间排序。
- 定向 Electron 用例已覆盖根级新增、拖回根级和排序；完整回归文件为 3 passed / 1 failed，失败属于文件夹磁盘路径断言，未归因于本次合集需求。

结论：未发现仍阻断合流的 Spec 问题。

## 后续规格调整

用户确认合集当前没有可用的时间信息，因此移除合集的「按时间」选项及
`CollectionSummary.createdAt` 返回。文件夹的创建时间排序保持不变；旧的合集时间排序偏好加载时归一为名称排序。定向单测 50 passed、资源库可用性
9 files / 214 passed / 1 skipped，合集定向 Electron 用例 1 passed。

## 复审结论

首轮发现已修复并复审通过。仍待用户完成人类 UI 验收，以及 packaged、Windows 和完整退出重启证据；这些是验收条件，不由本审查替代。
