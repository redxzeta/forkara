import { queryOptions } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

export const xPostQueryKeys = {
  all: ["x-post"] as const,
  connectionStatus: ["x-post", "connection-status"] as const,
};

export function xConnectionStatusQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: xPostQueryKeys.connectionStatus,
    queryFn: () => ensureNativeApi().x.getConnectionStatus(),
    enabled,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.state === "connecting" ? 2_000 : false),
  });
}
