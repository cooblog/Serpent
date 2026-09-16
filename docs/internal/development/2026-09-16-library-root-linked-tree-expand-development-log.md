# 资源库根下的链接文件夹无法展开子目录

日期：2026-09-16  
清单：`LINKED-TREE-001` / `LINKED-SORT-001`

## 现象

用户在已有普通文件夹的资源库里，把一个含多层子目录的外部文件夹链到资源库根。左侧「文件夹」列表能看到该链接根，但点展开箭头后子目录不出现。

## 根因

`sortManagedTreeEntries`（Serpent-316493）对挂在**普通文件夹下面**的链接根会 `emitLinked`，把虚拟子目录跟在该根后面。挂在**资源库根**的链接根被放进 `rootLinked`，最后只是 `return [...sorted, ...rootLinked]`，没有再发出子目录。

侧栏用未排序的完整树计算「有子项」箭头，用排序后的列表渲染行。于是：箭头在，子行被丢掉，看起来就是没法展开。

## 引入提交

`0f2494f2`（2026-09-12，`feat(linked-folder): 文件夹右键导入链接文件夹到子级`，工单 `Serpent-316493`）。

在此之前，`98d047b0`（侧栏文件夹树排序）用 `return [...sorted, ...linked]` 把**全部**链接行（含虚拟子目录）接到普通文件夹树后面，根级链接能展开。

`0f2494f2` 为了让「挂在普通文件夹下的链接根」跟在该父级子树后面，把链接行拆成 `linkedByParent` 和 `rootLinked`，最后改成 `return [...sorted, ...rootLinked]`。资源库根下的链接根进了 `rootLinked`，它的虚拟子目录因为 `parentFolderId` 等于该根 id，进了 `linkedByParent`，两边都不再发出。注释写「无可见父级的链接行保持今天的行为」，但今天的行为是追加全部链接行，不是只追加根。

## 当时测试为什么没拦住

有测试，但只覆盖了这次要做的新路径：

- 排序单测加了「普通文件夹下的链接根 + 它的虚拟子目录」会跟在该父级后面；夹具里同时有一个库根链接 `l1`，**没有给 `l1` 配子目录**，期望列表以 `"l1"` 结尾。若当时给 `l1` 配一层 `lfv:l1/notes`，这条就会红。
- 更早的排序单测（`98d047b0`）里库根链接也是没有子目录的光杆根。
- 折叠单测用的是未排序的 `buildUnifiedDirectoryNavEntries` 输出，不经过 `sortManagedTreeEntries`。
- Worker / E2E 证明 `listLinkedFolders` 会返回虚拟子目录、以及右键嵌套导入，都不到侧栏排序这一层。

库里一个普通文件夹都没有时走 `managed.length === 0` 早退，也不会触发。用户库几乎都有普通文件夹，所以真机必现。

## 修复

第一版在 `rootLinked` 循环里补 `emitLinked`，行为对，但仍是两条路径。更好的改法是取消 leftover 列表：不可见父级与库根都归到 `parentId = null`，`visit` 在每一层普通子树走完后发出该层链接（含库根）。嵌套和库根走同一套递归，不会再只发出根。

补上当时缺的排序回归：库根链接带多层子目录、嵌套与库根同时有子目录、多个库根链接各带子女、无普通文件夹、父级不可见回落库根、排序后再折叠。

## 后续：排序必须作用于链接文件夹

用户复验展开时指出文件夹栏排序对链接文件夹不起作用。旧设计把链接行排除在同层比较之外（先排普通文件夹，链接永远接在后面，且 `managed.length === 0` 时完全不排）。

改为每一层兄弟节点共用同一套名称 / 数量 / 时间比较器：链接根与普通文件夹穿插，链接子目录也按同一控件重排。链接根带 `createdAt`（表里已有 `created_at`）；没有自己行的虚拟子目录按时间排时落到该层末尾。

## 验证

```text
npx vitest run tests/unit/unified-directory-nav.test.ts
通过：1 个文件，25 passed。

node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/linked-folders.test.ts
通过：1 个文件，38 passed。

npm run test:library-availability
通过：9 个文件，227 passed。
```

本机工作副本执行；未跑完整 `test` / `test:e2e` / packaged / Windows / Computer Use。证据不写真实资源库名或本机路径。

2026-09-17：用户确认 `LINKED-TREE-001`、`LINKED-SORT-001` 人类验收通过。未提交（工作区还有其他未相关改动）。
