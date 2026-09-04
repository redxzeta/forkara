import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/** Warms code-split route chunks once the browser is idle.
 *
 *  Settings and thread routes are reached through programmatic `navigate()`
 *  calls (sidebar gear, keyboard shortcut, the "New thread" button), so the
 *  router's intent-based preloading never fires for them — without this, the
 *  first open pays the chunk download/parse cost. For a brand-new thread that
 *  cost lands right on the draft-landing paint, so warming the thread chunk is
 *  the largest single lever for new-chat startup time.
 */
export function usePreloadRouteChunks() {
  const router = useRouter();

  useEffect(() => {
    // New-task navigation is a primary startup action. Warm that route as soon
    // as the root commits so an immediate click never waits for the browser's
    // idle callback (which can be delayed for several seconds during hydration).
    const threadRoute = router.routesByPath["/$threadId"];
    if (threadRoute) {
      router.loadRouteChunk(threadRoute)?.catch(() => {
        // Preloading is best-effort; navigation falls back to loading on demand.
      });
    }

    const preloadSettings = () => {
      const settingsRoute = router.routesByPath["/settings"];
      if (settingsRoute) {
        router.loadRouteChunk(settingsRoute)?.catch(() => {
          // Preloading is best-effort; navigation falls back to loading on demand.
        });
      }
    };

    if (typeof requestIdleCallback === "function") {
      const idleCallbackId = requestIdleCallback(preloadSettings, { timeout: 5000 });
      return () => cancelIdleCallback(idleCallbackId);
    }
    const timeoutId = setTimeout(preloadSettings, 1500);
    return () => clearTimeout(timeoutId);
  }, [router]);
}
