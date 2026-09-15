# 合集根级操作与侧栏排序开发记录

> 状态：automated-verification
> 日期：2026-09-15
> 分支：`dev`
> 基线：`b69df982b9fe302962248d4e0395f4d58886183f`
> 工单：`Serpent-01cff7`

配套文档：[实施规格](../implementation/2026-09-15-collection-root-and-sort.md) ·
[代码审查](../reviews/2026-09-15-collection-root-and-sort-code-review.md) ·
[QA 报告](../qa/2026-09-15-collection-root-and-sort-qa.md) ·
[人类验收清单](../qa/human-acceptance-checklist.md)

## 范围

本次需求将文件夹侧栏已有的根级创建、空白区拖放回根级和排序体验扩展到普通合集：

- 合集分节的新增入口始终以 `parentId: null` 创建；
- 嵌套合集拖到合集列表空白区域时移动到资源库根级，已经在根级的合集不接受该投放；
- 合集树复用文件夹的排序字段、升降序方向、比较规则和偏好编解码，但使用独立的本地存储键，避免两类导航互相覆盖。

## 实现决定

1. `folder-sort-preferences.ts` 保留文件夹公开函数，并抽出共享的偏好加载、保存和字段合并逻辑；合集只增加类型别名、独立键和薄包装。
2. `unified-directory-nav.ts` 抽出通用侧栏条目比较器。文件夹继续按既有 `directAssetCount` 排序，合集按 `assetCount` 排序；合集不暴露创建时间排序；树的父子映射和折叠语义不改变。
3. `NavigationSidebar` 复用同一个 `SidebarSortTrigger`，合集列表复用文件夹空白区的目标判定和高亮样式。行上的拖放仍保留原有的同层重排与资产投放分流。
4. Renderer 只通过既有 `updateCollection` API 请求 `parentId: null`；Preload、Main、Worker 透传并持久化该字段，合集摘要不新增时间字段。

## 测试同步

- `tests/unit/folder-sort-preferences.test.ts`：验证合集排序偏好使用独立键，并将旧的时间排序偏好归一到名称排序。
- `tests/unit/unified-directory-nav.test.ts`：验证合集树各层级复用名称和数量排序语义。
- `tests/unit/navigation-sidebar.test.ts`：验证合集新增入口传入根级，以及空白区拖放调用根级移动回调。
- `tests/worker/organization.test.ts`：验证嵌套合集以 `parentId: null` 更新后成为根级兄弟。
- 本次后续调整移除合集创建时间排序及 `CollectionSummary.createdAt` 返回；旧的合集时间排序偏好加载时归一为名称排序，文件夹时间排序保持不变。
- 资源库可用性门禁、真实 Electron 定向 E2E 与双轴代码审查在本记录更新时分别记录实际结果；未执行或失败项目不会标记为通过。

## 已执行命令

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts tests/unit/folder-sort-preferences.test.ts tests/unit/unified-directory-nav.test.ts tests/unit/navigation-sidebar.test.ts` | 3 files / 49 tests 通过 |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/organization.test.ts` | 1 file / 67 tests 通过 |
| `npm run test:library-availability` | 9 files / 214 tests passed / 1 skipped |
| `node scripts/run-e2e-isolated.mjs tests/e2e/collection-folder-hierarchy-regressions.test.ts --grep "creates collections at the root"` | 1 test passed；覆盖根级新增、根级拖回和合集排序 |
| `node scripts/run-e2e-isolated.mjs tests/e2e/collection-folder-hierarchy-regressions.test.ts` | 4 tests 中 3 passed / 1 failed；失败为既有「重命名父文件夹后子文件夹磁盘路径」断言，不属于本次合集范围，不能记为该文件全绿 |
| `npm run typecheck` | 通过 |
| `npx eslint`（本次修改的源码与测试文件） | 通过 |
| `git diff --check` | 通过 |
| 后续调整定向单测 / 类型检查 / ESLint | 3 files / 49 tests 通过；`npm run typecheck` 通过；定向 ESLint 通过 |
| 后续调整合集根级 Electron E2E | 1 test passed；确认合集排序面板没有「按时间」，名称与资产数量选项可用 |

## 当前限制

- 真实桌面 Computer Use 不可用；人类视觉验收和 Windows/打包态仍未验证。
- 合集移动到根级使用的是现有 `updateCollection` 能力；本次未新增另一套集合移动协议。
- 完整合集回归文件仍包含一个超出本次范围的文件夹磁盘路径失败；已按套件级和需求级拆分记录，未把它写成全套通过。
- 双轴复审（Composer 2.5）确认上次 E2E 辅助函数与资源库可用性证据两个阻断均已关闭，当前未发现新的 Standards / Spec 实现阻断；实现者不替代独立审查和用户验收。

## 后续

1. 处理或单独跟踪合集回归文件中的既有文件夹磁盘路径失败，不将其归因于本次合集实现。
2. 由用户完成人类 UI 验收；Computer Use、packaged 和 Windows 证据仍待补。
3. 用户完成验收后再关闭工单 `Serpent-01cff7`。
