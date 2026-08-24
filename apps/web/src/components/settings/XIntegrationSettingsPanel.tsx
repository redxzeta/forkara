import type { XConnectionStatus } from "@forkara/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { toastManager } from "~/components/ui/toast";
import { ExternalLinkIcon } from "~/lib/icons";
import { xConnectionStatusQueryOptions, xPostQueryKeys } from "~/lib/xPostReactQuery";
import { ensureNativeApi } from "~/nativeApi";
import { SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";

function formatAuthorizationExpiry(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleTimeString() : value;
}

export function XConnectionStatusContent(props: {
  readonly status: XConnectionStatus;
  readonly authorizationUrl: string | null;
  readonly busy: boolean;
  readonly onConnect: () => void;
  readonly onOpenAuthorization: () => void;
  readonly onDisconnect: () => void;
}) {
  const { status } = props;
  if (status.state === "unconfigured") {
    return (
      <SettingsRow
        title="X"
        description="Connect an X account to publish only posts you explicitly review and submit."
        status={
          <span className="space-y-1">
            <span className="block text-amber-700 dark:text-amber-300">{status.message}</span>
            {status.redirectUri ? (
              <span className="block">
                Register this callback URI in the X developer app:{" "}
                <code className="select-all break-all">{status.redirectUri}</code>
              </span>
            ) : null}
          </span>
        }
        control={
          <Button size="sm" disabled>
            Connect X account
          </Button>
        }
      />
    );
  }

  if (status.state === "connecting") {
    return (
      <SettingsRow
        title="X"
        description="Finish the user-driven authorization in X. Forkara cannot complete it for you."
        status={
          "Authorization expires at " +
          formatAuthorizationExpiry(status.authorizationExpiresAt) +
          "."
        }
        control={
          <>
            {props.authorizationUrl ? (
              <Button
                size="sm"
                variant="outline"
                disabled={props.busy}
                onClick={props.onOpenAuthorization}
              >
                <ExternalLinkIcon className="size-3.5" />
                Open X
              </Button>
            ) : null}
            <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onDisconnect}>
              Cancel
            </Button>
          </>
        }
      />
    );
  }

  if (status.state === "connected") {
    return (
      <SettingsRow
        title="X"
        description="Available to the reviewed composer. Forkara never posts automatically."
        status={status.handle ? "Connected as @" + status.handle : "Connected"}
        control={
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onDisconnect}>
            Disconnect
          </Button>
        }
      />
    );
  }

  const needsAuth = status.state === "needs-auth";
  const retrying = status.state === "error";
  return (
    <SettingsRow
      title="X"
      description={
        status.state === "disconnected"
          ? "Connect an X account to publish only posts you explicitly review and submit."
          : status.message
      }
      status={needsAuth && status.handle ? "Reconnect @" + status.handle : undefined}
      control={
        <>
          <Button size="sm" disabled={props.busy} onClick={props.onConnect}>
            {props.busy
              ? "Connecting..."
              : needsAuth
                ? "Reconnect"
                : retrying
                  ? "Retry"
                  : "Connect X account"}
          </Button>
          {needsAuth ? (
            <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onDisconnect}>
              Disconnect
            </Button>
          ) : null}
        </>
      }
    />
  );
}

export function XIntegrationSettingsPanel({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const statusQuery = useQuery(xConnectionStatusQueryOptions(active));

  const openAuthorization = (url: string) => {
    void ensureNativeApi()
      .shell.openExternal(url)
      .catch((error: unknown) =>
        toastManager.add({
          type: "error",
          title: "Could not open X",
          description: error instanceof Error ? error.message : "Open the authorization again.",
        }),
      );
  };

  const beginMutation = useMutation({
    mutationFn: () => ensureNativeApi().x.beginConnect(),
    onSuccess: (result) => {
      setAuthorizationUrl(result.authorizationUrl);
      queryClient.setQueryData(xPostQueryKeys.connectionStatus, result.status);
      openAuthorization(result.authorizationUrl);
    },
    onError: (error: unknown) =>
      toastManager.add({
        type: "error",
        title: "Could not connect X",
        description: error instanceof Error ? error.message : "X connection could not start.",
      }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => ensureNativeApi().x.disconnect(),
    onSuccess: (status) => {
      setAuthorizationUrl(null);
      queryClient.setQueryData(xPostQueryKeys.connectionStatus, status);
      toastManager.add({
        type: "success",
        title: status.state === "disconnected" ? "X account disconnected" : "X connection reset",
      });
    },
    onError: (error: unknown) =>
      toastManager.add({
        type: "error",
        title: "Could not disconnect X",
        description:
          error instanceof Error ? error.message : "The local credential was not removed.",
      }),
  });

  if (!active) return null;
  const busy = beginMutation.isPending || disconnectMutation.isPending;

  return (
    <div className="space-y-6">
      <SettingsSection title="Social accounts">
        {statusQuery.isPending ? (
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        ) : statusQuery.isError ? (
          <SettingsRow
            title="X"
            description="Forkara could not load the local X connection state."
            status={
              statusQuery.error instanceof Error
                ? statusQuery.error.message
                : "Connection unavailable"
            }
            control={
              <Button size="sm" variant="outline" onClick={() => void statusQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : statusQuery.data ? (
          <XConnectionStatusContent
            status={statusQuery.data}
            authorizationUrl={authorizationUrl}
            busy={busy}
            onConnect={() => beginMutation.mutate()}
            onOpenAuthorization={() => authorizationUrl && openAuthorization(authorizationUrl)}
            onDisconnect={() => disconnectMutation.mutate()}
          />
        ) : null}
      </SettingsSection>
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        OAuth tokens stay in Forkara’s private local secret store, separate from ordinary settings.
        Posting is server-owned and requires a visible, explicit final action in the composer.
      </p>
    </div>
  );
}
