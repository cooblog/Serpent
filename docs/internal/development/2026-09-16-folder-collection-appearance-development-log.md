# 文件夹与合集外观（第一批目录）

日期：2026-09-16  
工单：`Serpent-df3049` / `Serpent-9d24c0` / `Serpent-d130b5`

## 本次增量

按已拍板规格落地第一批外观：emoji 200、装饰图标 124、色板 8。

- schema v55 只给 `managed_folders` / `linked_folders` / `collections` / `smart_collections` 增加可空外观列。
- Worker 新增 `appearance.set`：只写库内元数据，不触发磁盘重命名或移动。未知目录值打开时按默认外观显示，写入时拒绝。
- 右键「图标与颜色」打开选取器；侧栏行、工作区标签页、合集选取列表共用同一份外观。链接文件夹根可自定义图形，并叠加链接/离线徽章。画布文件夹卡片不改。

## 验证记录

命令与结果在本机工作副本执行；测试产物使用系统临时目录，结束后清理。系统 Node ABI 与 Electron runner 不一致，Worker 测试走 `scripts/run-vitest-with-electron.mjs`。

```text
npx tsc --noEmit
通过（退出码 0）。

npx vitest run tests/unit/entity-appearance.test.ts tests/unit/workspace-tab-presentation.test.ts tests/unit/protocol.test.ts
通过：3 个文件，125 passed。覆盖目录数量、sanitize/写入校验、协议 `appearance.set`、标签页外观与链接徽章。

node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/entity-appearance.test.ts tests/worker/migration-checksum-snapshot.test.ts
通过：2 个文件，4 passed。含托管/合集/智能合集/链接根写入、虚拟子目录拒绝、改外观不改磁盘路径、v55 checksum。

npm run test:library-availability
通过：9 个文件，227 passed。ensure-native 报告 better-sqlite3 与 Electron ABI 匹配且 FTS5 可用。v55 用 `ensureEntityAppearanceSchema` 避免回退历史后再迁移时重复 ADD COLUMN。
```

未跑完整 `npm run test` / `test:e2e` / `verify:mainline`，未跑真实 Electron 点选旅程，未跑 packaged / Windows / Computer Use。

2026-09-16：用户确认 APPEAR-001 / APPEAR-002 / APPEAR-003 人类验收通过。同步外观另开 P0 `Serpent-d94310`。

## 边界

链接树里没有稳定 ID 的虚拟子目录不写外观。本轮不写入 WebDAV sidecar。Automation / MCP 尚未暴露 `appearance.set`。
