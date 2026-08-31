// FILE: EditedFileActions.tsx
// Purpose: Compact preview and secondary filesystem actions for an edited-file row.
// Layer: Chat changed-files UI

import {
  isLocalAbsolutePath,
  isWorkspaceRelativePathSafe,
  joinWorkspaceRelativePath,
  workspaceRelativePathOf,
} from "@forkara/shared/path";

import { useCopyPathToClipboard } from "~/hooks/useCopyToClipboard";
import { openInPreferredEditor } from "~/editorPreferences";
import { EllipsisIcon, FileIcon } from "~/lib/icons";
import { readNativeApi } from "~/nativeApi";
import { basenameOfPath } from "~/file-icons";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import { Menu, MenuItem, MenuTrigger } from "../ui/menu";
import { ComposerPickerMenuPopup } from "./ComposerPickerMenuPopup";
import { useWorkspaceFileOpener } from "~/lib/workspaceFileOpener";
import { getRevealInFolderLabel } from "~/lib/fileReferenceContextMenu";
import { getNavigatorPlatform } from "~/lib/utils";

export function resolveEditedFilePaths(
  filePath: string,
  workspaceRoot: string | undefined,
): {
  relativePath: string | null;
  absolutePath: string | null;
} {
  if (isLocalAbsolutePath(filePath)) {
    return {
      relativePath: workspaceRoot ? workspaceRelativePathOf(filePath, workspaceRoot) : null,
      absolutePath: filePath,
    };
  }
  if (!workspaceRoot || !isWorkspaceRelativePathSafe(filePath)) {
    return { relativePath: null, absolutePath: null };
  }
  return {
    relativePath: filePath,
    absolutePath: joinWorkspaceRelativePath(workspaceRoot, filePath),
  };
}

export function EditedFileActions(props: { filePath: string; workspaceRoot: string | undefined }) {
  const { filePath, workspaceRoot } = props;
  const opener = useWorkspaceFileOpener();
  const copyPath = useCopyPathToClipboard();
  const { relativePath, absolutePath } = resolveEditedFilePaths(filePath, workspaceRoot);
  const fileName = basenameOfPath(filePath);
  const canReveal =
    absolutePath !== null && typeof window !== "undefined" && Boolean(window.desktopBridge);

  const openFilePreview = () => {
    if (!opener?.openFile(filePath)) {
      toastManager.add({
        type: "error",
        title: "Unable to open file preview",
        description: filePath,
      });
    }
  };
  const openExternalEditor = async () => {
    const api = readNativeApi();
    if (!api || !absolutePath) return;
    try {
      await openInPreferredEditor(api, absolutePath);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Unable to open file in editor",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    }
  };
  const revealInFileManager = async () => {
    const api = readNativeApi();
    if (!api || !absolutePath) return;
    try {
      await api.shell.showInFolder(absolutePath);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Unable to reveal file",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    }
  };

  const actionButtonClassName = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70",
    "transition-[background-color,color,opacity] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
  );

  return (
    <div
      className="group/file-actions flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:pointer-events-none md:opacity-0 md:group-hover/changed-file-row:pointer-events-auto md:group-hover/changed-file-row:opacity-100 md:group-focus-within/changed-file-row:pointer-events-auto md:group-focus-within/changed-file-row:opacity-100"
      data-edited-file-actions="true"
    >
      <button
        type="button"
        className={actionButtonClassName}
        aria-label={`Open ${fileName} in file preview`}
        title="Open file"
        disabled={!opener}
        onPointerEnter={() => opener?.prefetchFile?.(filePath)}
        onFocus={() => opener?.prefetchFile?.(filePath)}
        onClick={openFilePreview}
      >
        <FileIcon aria-hidden="true" className="size-3.5" />
      </button>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              className={actionButtonClassName}
              aria-label={`More actions for ${fileName}`}
            />
          }
        >
          <EllipsisIcon aria-hidden="true" className="size-3.5" />
        </MenuTrigger>
        <ComposerPickerMenuPopup align="end" side="bottom" className="w-56 min-w-56">
          <MenuItem disabled={!absolutePath} onClick={() => void openExternalEditor()}>
            Open in configured editor
          </MenuItem>
          <MenuItem disabled={!canReveal} onClick={() => void revealInFileManager()}>
            {getRevealInFolderLabel(getNavigatorPlatform())}
          </MenuItem>
          <MenuItem disabled={!relativePath} onClick={() => relativePath && copyPath(relativePath)}>
            Copy relative path
          </MenuItem>
          <MenuItem disabled={!absolutePath} onClick={() => absolutePath && copyPath(absolutePath)}>
            Copy absolute path
          </MenuItem>
        </ComposerPickerMenuPopup>
      </Menu>
    </div>
  );
}
