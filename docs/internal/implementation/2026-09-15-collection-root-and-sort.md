# 合集根级操作与侧栏排序实施规格

## 目标

让普通合集的侧栏操作与文件夹保持一致，同时复用已有实现：

1. 「合集」分节的新增入口固定创建根级合集。
2. 嵌套合集拖到合集列表空白区域时移动到资源库根级；根级合集拖到同一位置不产生写入。
3. 合集树复用文件夹的名称、资产数排序字段及升/降序，并持久化独立偏好；合集不提供创建时间排序，因为合集摘要不记录该信息。

## 不变的边界

- 合集行上的资产投放、同层合集重排和右键子合集创建保持原有语义。
- 合集仍是虚拟组织关系，不改变资产磁盘位置。
- Renderer 不直接访问数据库；移动根级只通过既有 `updateCollection` typed API 传递 `parentId: null`。
- 不为合集复制一套排序控件、比较器或偏好校验器。

## 实现映射

| 需求 | 实现 |
| --- | --- |
| 根级新增 | `NavigationSidebar` 的合集分节 action 传入 `null` |
| 根级移动 | `NavigationSidebar` 复用文件夹空白目标判定与高亮；`App` 调用 `updateCollection` |
| 协议透传 | `src/preload/index.ts`、`src/main/index.ts`、既有 collection update protocol |
| 排序共享 | `folder-sort-preferences.ts`、`unified-directory-nav.ts`、`SidebarSortTrigger` |
| 数据返回 | `CollectionSummary` 不增加时间字段；Worker 保持现有合集摘要边界 |

## 验收证据

自动化证据记录在[开发日志](../development/2026-09-15-collection-root-and-sort-development-log.md)和[人类验收清单](../qa/human-acceptance-checklist.md)中。UI 的人类验收不由自动化或 agent 代替；未执行的 Computer Use、packaged 和 Windows 项目必须保持未验证状态。
