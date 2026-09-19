import { describe, expect, it } from "vitest";

import {
  readFocusedNavFolder,
  resolveFolderShortcutAction,
} from "../../src/renderer/folder-shortcut-dispatch";

const names = new Map([
  ["folder-a", "Alpha"],
  ["folder-b", "Beta"],
  ["linked-1", "Linked"],
]);

const resolveName = (id: string) => names.get(id);

describe("resolveFolderShortcutAction (Serpent-vf8x)", () => {
  it("create-subfolder uses focused managed nav folder", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.create-subfolder",
        focusedNav: { folderId: "folder-a", locationKind: "managed" },
        browseManagedFolderId: "folder-b",
        selectedFolderCardIds: [],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({ type: "create-subfolder", parentFolderId: "folder-a" });
  });

  it("create-subfolder falls back to browse scope, then library root", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.create-subfolder",
        focusedNav: null,
        browseManagedFolderId: "folder-b",
        selectedFolderCardIds: [],
        selectedAssetCount: 2,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({ type: "create-subfolder", parentFolderId: "folder-b" });

    expect(
      resolveFolderShortcutAction({
        commandId: "folder.create-subfolder",
        focusedNav: { folderId: "linked-1", locationKind: "linked" },
        browseManagedFolderId: null,
        selectedFolderCardIds: [],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({ type: "create-subfolder", parentFolderId: "linked-1" });
  });

  it("rename/trash defer to assets when any asset is selected", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.rename",
        focusedNav: { folderId: "folder-a", locationKind: "managed" },
        browseManagedFolderId: null,
        selectedFolderCardIds: [],
        selectedAssetCount: 1,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({ type: "none" });

    expect(
      resolveFolderShortcutAction({
        commandId: "folder.move-to-trash",
        focusedNav: { folderId: "folder-a", locationKind: "managed" },
        browseManagedFolderId: null,
        selectedFolderCardIds: [],
        selectedAssetCount: 1,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({ type: "none" });
  });

  it("rename/trash use focused managed nav over folder cards", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.rename",
        focusedNav: { folderId: "folder-a", locationKind: "managed" },
        browseManagedFolderId: null,
        selectedFolderCardIds: ["folder-b"],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({
      type: "rename",
      folderId: "folder-a",
      currentName: "Alpha",
    });

    expect(
      resolveFolderShortcutAction({
        commandId: "folder.move-to-trash",
        focusedNav: { folderId: "folder-a", locationKind: "managed" },
        browseManagedFolderId: null,
        selectedFolderCardIds: [],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({
      type: "move-to-trash",
      folderId: "folder-a",
      name: "Alpha",
    });
  });

  it("rename/trash fall back to managed folder cards", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.rename",
        focusedNav: null,
        browseManagedFolderId: null,
        selectedFolderCardIds: ["folder-b"],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({
      type: "rename",
      folderId: "folder-b",
      currentName: "Beta",
    });

    // 2026-09-19（Serpent-d7acfa）：多选文件夹卡片的回收站不再被忽略，
    // 而是返回批量目标（旧行为是 none）。
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.move-to-trash",
        focusedNav: null,
        browseManagedFolderId: null,
        selectedFolderCardIds: ["folder-a", "folder-b"],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({ type: "trash-folders", folderIds: ["folder-a", "folder-b"] });
  });

  it("rename falls back to the open browse folder when focus was stolen", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.rename",
        focusedNav: null,
        browseManagedFolderId: "folder-b",
        selectedFolderCardIds: [],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({
      type: "rename",
      folderId: "folder-b",
      currentName: "Beta",
    });
  });

  it("trash/disk-delete use a focused linked folder like a managed one", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.move-to-trash",
        focusedNav: { folderId: "linked-1", locationKind: "linked" },
        browseManagedFolderId: null,
        selectedFolderCardIds: [],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({
      type: "move-to-trash",
      folderId: "linked-1",
      name: "Linked",
    });
  });

  it("skips linked rename when canRenameFolder is false", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.rename",
        focusedNav: { folderId: "linked-1", locationKind: "linked" },
        browseManagedFolderId: null,
        selectedFolderCardIds: [],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
        canRenameFolder: () => false,
      }),
    ).toEqual({ type: "none" });
  });

  // Serpent-d7acfa：多选文件夹卡片时，回收站 / 硬盘删除对全部选中项生效；
  // 重命名仍然只对单个目标生效（不猜改哪个名字）。
  it("targets every selected folder card for trash and disk delete", () => {
    const base = {
      focusedNav: null,
      browseManagedFolderId: null,
      selectedFolderCardIds: ["folder-a", "folder-b"],
      selectedAssetCount: 0,
      resolveManagedFolderName: resolveName,
    } as const;
    expect(
      resolveFolderShortcutAction({ ...base, commandId: "folder.move-to-trash" }),
    ).toEqual({ type: "trash-folders", folderIds: ["folder-a", "folder-b"] });
    expect(
      resolveFolderShortcutAction({ ...base, commandId: "folder.delete-from-disk" }),
    ).toEqual({ type: "delete-folders", folderIds: ["folder-a", "folder-b"] });
    // 单目标时保持旧行为（确认窗/提示能显示名字）
    expect(
      resolveFolderShortcutAction({
        ...base,
        commandId: "folder.move-to-trash",
        selectedFolderCardIds: ["folder-a"],
      }),
    ).toEqual({ type: "move-to-trash", folderId: "folder-a", name: "Alpha" });
    // 多选重命名不猜目标
    expect(
      resolveFolderShortcutAction({ ...base, commandId: "folder.rename" }),
    ).toEqual({ type: "none" });
  });

  it("ignores unresolved folder card ids when batching", () => {
    expect(
      resolveFolderShortcutAction({
        commandId: "folder.move-to-trash",
        focusedNav: null,
        browseManagedFolderId: null,
        selectedFolderCardIds: ["folder-a", "ghost-folder"],
        selectedAssetCount: 0,
        resolveManagedFolderName: resolveName,
      }),
    ).toEqual({ type: "move-to-trash", folderId: "folder-a", name: "Alpha" });
  });
});

describe("readFocusedNavFolder", () => {
  it("reads data-nav-folder-* from the focused row host", () => {
    const row = {
      dataset: { navFolderId: "folder-a", navFolderKind: "managed" as const },
      closest(selector: string) {
        return selector === "[data-nav-folder-id]" ? this : null;
      },
    };
    expect(readFocusedNavFolder(row)).toEqual({
      folderId: "folder-a",
      locationKind: "managed",
    });
  });

  it("returns null for unrelated focus", () => {
    expect(readFocusedNavFolder(null)).toBeNull();
    expect(
      readFocusedNavFolder({
        closest: () => null,
      }),
    ).toBeNull();
  });
});
