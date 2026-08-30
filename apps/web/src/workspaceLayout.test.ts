import { describe, expect, it } from "vitest";

import {
  WORKSPACE_DOCK_MIN_WIDTH_PX,
  WORKSPACE_MAIN_MIN_WIDTH_PX,
  clampRightDockWidth,
  resolveRightDockMaxWidth,
  resolveWorkspaceLayout,
} from "./workspaceLayout";

describe("workspace layout contract", () => {
  it("keeps the preferred sidebar at 1440px while bounding the dock", () => {
    expect(
      resolveWorkspaceLayout({
        shellWidthPx: 1_440,
        sidebarWidthPx: 256,
        userSidebarOpen: true,
        dockOpen: true,
      }),
    ).toEqual({
      sidebarTemporarilySuppressed: false,
      effectiveSidebarWidthPx: 256,
      dockMaxWidthPx: 608,
    });
  });

  it("temporarily suppresses and restores the preferred sidebar at 1024px", () => {
    const constrained = resolveWorkspaceLayout({
      shellWidthPx: 1_024,
      sidebarWidthPx: 256,
      userSidebarOpen: true,
      dockOpen: true,
    });
    expect(constrained.sidebarTemporarilySuppressed).toBe(true);
    expect(constrained.dockMaxWidthPx).toBe(448);

    const restored = resolveWorkspaceLayout({
      shellWidthPx: 1_024,
      sidebarWidthPx: 256,
      userSidebarOpen: true,
      dockOpen: false,
    });
    expect(restored.sidebarTemporarilySuppressed).toBe(false);
    expect(restored.effectiveSidebarWidthPx).toBe(256);
  });

  it("never restores a sidebar the user chose to close", () => {
    const resolution = resolveWorkspaceLayout({
      shellWidthPx: 1_440,
      sidebarWidthPx: 256,
      userSidebarOpen: false,
      dockOpen: true,
    });
    expect(resolution.sidebarTemporarilySuppressed).toBe(false);
    expect(resolution.effectiveSidebarWidthPx).toBe(0);
  });

  it("clamps the dock while preserving the 36rem main conversation", () => {
    expect(resolveRightDockMaxWidth(1_024)).toBe(448);
    expect(clampRightDockWidth({ requestedWidthPx: 591, hostWidthPx: 1_024 })).toBe(448);
    expect(1_024 - 448).toBe(WORKSPACE_MAIN_MIN_WIDTH_PX);
    expect(448).toBeGreaterThanOrEqual(WORKSPACE_DOCK_MIN_WIDTH_PX);
  });

  it("leaves below-range off-canvas geometry alone", () => {
    expect(resolveRightDockMaxWidth(900)).toBeNull();
    expect(clampRightDockWidth({ requestedWidthPx: 591, hostWidthPx: 900 })).toBe(591);
  });
});
