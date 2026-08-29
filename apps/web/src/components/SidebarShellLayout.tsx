// FILE: SidebarShellLayout.tsx
// Purpose: Orders the sidebar, optional in-layout creation dock, and route content.
// Layer: Web route shell
// Exports: SidebarShellLayout

import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

export function SidebarShellLayout(props: {
  readonly sidebar: ReactNode;
  readonly projectCreationSurface: ReactNode;
  readonly mainContent: ReactNode;
  readonly bottomRegion?: ReactNode;
  readonly hideMainContentOnNarrowScreens: boolean;
}) {
  return (
    <>
      {props.sidebar}
      {props.projectCreationSurface}
      <div
        className={cn(
          "relative flex h-svh min-h-0 min-w-0 flex-1 flex-col",
          props.hideMainContentOnNarrowScreens && "max-md:hidden",
        )}
        data-slot="chat-main-content"
      >
        <div className="relative flex min-h-0 min-w-0 flex-1">{props.mainContent}</div>
        {props.bottomRegion}
      </div>
    </>
  );
}
