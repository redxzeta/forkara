// FILE: settingsSearchIndex.test.ts
// Purpose: Verifies discoverability of settings that participate in routed search.

import { describe, expect, it } from "vitest";

import { SETTINGS_SEARCH_ENTRIES } from "./settingsSearchIndex";

describe("SETTINGS_SEARCH_ENTRIES", () => {
  it("exposes No Forks Given Mode through Behavior search", () => {
    expect(SETTINGS_SEARCH_ENTRIES).toContainEqual({
      id: "behavior:focus-mode",
      section: "behavior",
      title: "No Forks Given Mode",
      keywords:
        "Focus mode replaces migrated popups with inline and docked surfaces. safeguards confirmations permissions safety no popup non-modal",
    });
  });
});
