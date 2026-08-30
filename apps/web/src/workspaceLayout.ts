// FILE: workspaceLayout.ts
// Purpose: Shared responsive geometry contract for the workspace shell, thread sidebar,
//          primary conversation, right dock, and composer-adjacent Environment panel.
// Layer: Web layout policy

export const WORKSPACE_SUPPORTED_DESKTOP_MIN_WIDTH_PX = 64 * 16;
export const WORKSPACE_MAIN_MIN_WIDTH_PX = 36 * 16;
export const WORKSPACE_DOCK_MIN_WIDTH_PX = 26 * 16;
export const WORKSPACE_DEFAULT_SIDEBAR_WIDTH_PX = 16 * 16;

export interface WorkspaceLayoutResolution {
  readonly sidebarTemporarilySuppressed: boolean;
  readonly effectiveSidebarWidthPx: number;
  /** `null` preserves the existing off-canvas behavior below the supported desktop range. */
  readonly dockMaxWidthPx: number | null;
}

/**
 * Resolves the shell-wide contract. The user's sidebar preference remains authoritative;
 * suppression is temporary and disappears as soon as the dock closes or space returns.
 */
export function resolveWorkspaceLayout(input: {
  shellWidthPx: number;
  sidebarWidthPx: number;
  userSidebarOpen: boolean;
  dockOpen: boolean;
}): WorkspaceLayoutResolution {
  const shellWidthPx = Math.max(0, input.shellWidthPx);
  const sidebarWidthPx = Math.max(0, input.sidebarWidthPx);
  const supportedDesktop = shellWidthPx >= WORKSPACE_SUPPORTED_DESKTOP_MIN_WIDTH_PX;
  const sidebarTemporarilySuppressed =
    supportedDesktop &&
    input.userSidebarOpen &&
    input.dockOpen &&
    shellWidthPx <
      sidebarWidthPx + WORKSPACE_MAIN_MIN_WIDTH_PX + WORKSPACE_DOCK_MIN_WIDTH_PX;
  const effectiveSidebarWidthPx =
    input.userSidebarOpen && !sidebarTemporarilySuppressed ? sidebarWidthPx : 0;
  const mainAndDockWidthPx = Math.max(0, shellWidthPx - effectiveSidebarWidthPx);

  return {
    sidebarTemporarilySuppressed,
    effectiveSidebarWidthPx,
    dockMaxWidthPx:
      supportedDesktop && input.dockOpen
        ? Math.max(0, mainAndDockWidthPx - WORKSPACE_MAIN_MIN_WIDTH_PX)
        : null,
  };
}

/**
 * The dock host is measured after the left sidebar has taken (or yielded) its space. Only
 * enforce desktop bounds once the host can fit both contractual minima; narrower hosts keep
 * the established off-canvas behavior while the outer shell resolves sidebar suppression.
 */
export function resolveRightDockMaxWidth(hostWidthPx: number): number | null {
  const normalizedHostWidthPx = Math.max(0, hostWidthPx);
  if (
    normalizedHostWidthPx <
    WORKSPACE_MAIN_MIN_WIDTH_PX + WORKSPACE_DOCK_MIN_WIDTH_PX
  ) {
    return null;
  }
  return normalizedHostWidthPx - WORKSPACE_MAIN_MIN_WIDTH_PX;
}

export function clampRightDockWidth(input: {
  requestedWidthPx: number;
  hostWidthPx: number;
  minWidthPx?: number;
}): number {
  const minWidthPx = input.minWidthPx ?? WORKSPACE_DOCK_MIN_WIDTH_PX;
  const requestedWidthPx = Math.max(minWidthPx, input.requestedWidthPx);
  const maxWidthPx = resolveRightDockMaxWidth(input.hostWidthPx);
  return maxWidthPx === null ? requestedWidthPx : Math.min(requestedWidthPx, maxWidthPx);
}
