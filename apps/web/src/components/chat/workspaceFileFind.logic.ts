// FILE: workspaceFileFind.logic.ts
// Purpose: Platform-specific shortcut ownership for active file-preview find.
// Layer: Editor presentation logic

import { isMacPlatform } from "~/lib/utils";

export function isWorkspaceFileFindShortcut(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  platform: string,
): boolean {
  if (event.key.toLowerCase() !== "f" || event.altKey || event.shiftKey) {
    return false;
  }
  return isMacPlatform(platform)
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}
