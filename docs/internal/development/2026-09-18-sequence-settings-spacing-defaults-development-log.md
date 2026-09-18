# 2026-09-18 序列帧设置行距与出厂默认

## 范围

设置 → 资产里「启用序列帧检测」和「导入时自动检测序列帧」。

## 原因

1. 同一张卡片里两行 `SettingsToggleRow` 没有纵向间距，说明文字和下一项标题贴在一起。
2. 出厂默认曾把自动检测也打开。产品要求：检测开、自动检测关（导入后弹确认窗）。

## 行为

- 同一卡片里相邻开关行之间使用 `--ui-space-5`。
- 未保存过该设置时：检测开，自动检测关。已经保存过的开关不改写。

## 实现

- `styles.css`：`.app-settings-card > .app-settings-toggle-row + .app-settings-toggle-row`
- `DEFAULT_IMAGE_SEQUENCE_PREFERENCES.autoDetectOnImport = false`

## 测试

`npx vitest run tests/unit/image-sequence-preferences.test.ts`

## 验收

`SEQ-DETECT-002` / `Serpent-be0c52`：2026-09-18 用户本人验收通过（用户原话「通过。先这样吧」）。`NAV-FOLDER-001` 已由用户记为通过。
