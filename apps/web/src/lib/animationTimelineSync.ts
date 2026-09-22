// FILE: animationTimelineSync.ts
// Purpose: Pin always-on CSS animations to the document timeline origin so every instance
//          steps in the same frame.
// Layer: Web UI animation utility

import { useLayoutEffect, type RefObject } from "react";

/** Align animations without changing their period or cadence. */
export function syncAnimationsToTimelineOrigin(element: Element | null): void {
  if (!element || typeof element.getAnimations !== "function") {
    return;
  }
  for (const animation of element.getAnimations()) {
    try {
      animation.startTime = 0;
    } catch {
      // Detached or completed animations may reject re-timing; leave them alone.
    }
  }
}

export function useTimelineSynchronizedAnimations(ref: RefObject<Element | null>): void {
  useLayoutEffect(() => {
    syncAnimationsToTimelineOrigin(ref.current);
  }, [ref]);
}
