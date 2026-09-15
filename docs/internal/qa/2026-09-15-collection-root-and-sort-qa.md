# 合集根级操作与侧栏排序 QA

> 日期：2026-09-15
> 分支：`dev`
> 基线：`b69df982b9fe302962248d4e0395f4d58886183f`
> 范围：`Serpent-01cff7`

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| 改动源码与测试文件定向 ESLint | 通过 |
| `git diff --check` | 通过 |
| 侧栏排序/合集导航单测 | 3 files / 49 tests passed |
| `tests/worker/organization.test.ts` | 67 tests passed |
| `npm run test:library-availability` | 9 files / 214 passed / 1 skipped |
| 合集根级定向 Electron E2E | 1 passed；覆盖根级新增、拖回根级和合集排序字段检查，并确认不提供创建时间选项 |
| 完整 `collection-folder-hierarchy-regressions.test.ts` | 3 passed / 1 failed |

完整 E2E 的失败项为「重命名父文件夹并保持子文件夹」中的磁盘路径断言。合集相关的父子创建、合集重命名、根级新增/拖回/排序和资产投放用例通过；该文件夹磁盘路径失败未归因于本次合集变更，不能将完整文件记为全绿。

## 四列追溯

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 合集分节新增固定根级 | `src/renderer/NavigationSidebar.tsx` 合集 section action | `tests/unit/navigation-sidebar.test.ts`；合集定向 Electron E2E | Computer Use、Windows、packaged 未执行；待人类验收 |
| 嵌套合集空白区拖回根级 | `src/renderer/NavigationSidebar.tsx`、`src/renderer/App.tsx`、`src/preload/index.ts`、`src/main/index.ts` | `tests/unit/navigation-sidebar.test.ts`（含缩进槽投放）、`tests/worker/organization.test.ts`；合集定向 Electron E2E | 2026-09-15 第一轮用户验收不通过后已修包装层截获；同日用户确认 `DND-COLLECTION-ROOT-001` 通过 |
| 拖到另一合集成为子合集 | `src/renderer/NavigationSidebar.tsx` `onNestCollection`、`src/renderer/App.tsx` `nestCollectionUnder`；行高亮 `is-drop-target` | `tests/unit/navigation-sidebar.test.ts`、`tests/worker/organization.test.ts` | Computer Use、Windows、packaged 未执行；待人类验收 `DND-COLLECTION-NEST-001`。用户反馈合集行没有文件夹那种投放高亮后已对齐。 |
| 合集树复用文件夹排序 | `src/renderer/folder-sort-preferences.ts`、`src/renderer/unified-directory-nav.ts`、`src/renderer/NavigationSidebar.tsx` | `tests/unit/folder-sort-preferences.test.ts`、`tests/unit/unified-directory-nav.test.ts`；合集定向 Electron E2E | 合集提供名称、资产数量排序，不提供创建时间排序；完整重启后的偏好恢复未自动化验证；用户已确认 `COLLECTION-SORT-001` 通过 |

## 未执行与风险

- 无 Computer Use 能力，未完成截图、亮/暗主题和窗口尺寸视觉检查。
- 未执行 packaged、Windows 发布态和完整应用退出重启验收。
- 现有完整合集 E2E 文件保留 1 个文件夹磁盘路径失败；该结果按套件级失败保留，未用重跑规避。
- 合集排序偏好独立存储键已由单测覆盖，但跨完整应用重启的人工验收仍待执行。
