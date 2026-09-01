// FILE: workspaceFileFind.logic.test.ts
// Purpose: Verifies platform-specific active-preview find shortcut ownership.

import { describe, expect, it } from "vitest";

import { isWorkspaceFileFindShortcut } from "./workspaceFileFind.logic";

function keyEvent(
  overrides: Partial<Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>,
) {
  return {
    key: "f",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("isWorkspaceFileFindShortcut", () => {
  it("owns Cmd+F on macOS and Ctrl+F elsewhere", () => {
    expect(isWorkspaceFileFindShortcut(keyEvent({ metaKey: true }), "MacIntel")).toBe(true);
    expect(isWorkspaceFileFindShortcut(keyEvent({ ctrlKey: true }), "MacIntel")).toBe(false);
    expect(isWorkspaceFileFindShortcut(keyEvent({ ctrlKey: true }), "Linux x86_64")).toBe(true);
    expect(isWorkspaceFileFindShortcut(keyEvent({ metaKey: true }), "Win32")).toBe(false);
  });

  it("leaves modified and unrelated shortcuts to their owning surfaces", () => {
    expect(
      isWorkspaceFileFindShortcut(keyEvent({ ctrlKey: true, shiftKey: true }), "Linux x86_64"),
    ).toBe(false);
    expect(
      isWorkspaceFileFindShortcut(keyEvent({ ctrlKey: true, altKey: true }), "Linux x86_64"),
    ).toBe(false);
    expect(isWorkspaceFileFindShortcut(keyEvent({ key: "g", ctrlKey: true }), "Linux x86_64")).toBe(
      false,
    );
  });
});
