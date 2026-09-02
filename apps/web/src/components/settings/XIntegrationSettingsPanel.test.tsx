import type { XConnectionStatus } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { XConnectionStatusContent } from "./XIntegrationSettingsPanel";

function renderStatus(status: XConnectionStatus, busy = false): string {
  return renderToStaticMarkup(
    <XConnectionStatusContent
      status={status}
      authorizationUrl={status.state === "connecting" ? "https://x.com/authorize" : null}
      busy={busy}
      onConnect={vi.fn()}
      onOpenAuthorization={vi.fn()}
      onDisconnect={vi.fn()}
    />,
  );
}

describe("X connection Settings states", () => {
  it("explains unconfigured operation without inventing a callback URI", () => {
    const markup = renderStatus({
      state: "unconfigured",
      redirectUri: null,
      message: "Set FORKARA_X_CLIENT_ID.",
    });

    expect(markup).toContain("Set FORKARA_X_CLIENT_ID.");
    expect(markup).not.toContain("Register this callback URI");
    expect(markup).toContain("Connect X account");
    expect(markup).toContain("disabled");
  });

  it("renders disconnected, connecting, connected, reconnect, and retry actions truthfully", () => {
    expect(
      renderStatus({
        state: "disconnected",
        redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
      }),
    ).toContain("Connect X account");

    const connecting = renderStatus({
      state: "connecting",
      redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
      authorizationExpiresAt: "2026-08-23T12:10:00.000Z",
    });
    expect(connecting).toContain("Open X");
    expect(connecting).toContain("Cancel");
    expect(connecting).toContain("user-driven authorization");

    const connected = renderStatus({
      state: "connected",
      redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
      handle: "octocat",
    });
    expect(connected).toContain("Connected as @octocat");
    expect(connected).toContain("Forkara never posts automatically");
    expect(connected).toContain("Disconnect");

    expect(
      renderStatus({
        state: "needs-auth",
        redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
        handle: "octocat",
        message: "Reconnect the account.",
      }),
    ).toContain("Reconnect");

    expect(
      renderStatus({
        state: "error",
        redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
        message: "Connection failed safely.",
      }),
    ).toContain("Retry");
  });

  it("disables connection actions while a request is pending", () => {
    const markup = renderStatus(
      {
        state: "disconnected",
        redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
      },
      true,
    );
    expect(markup).toContain("Connecting...");
    expect(markup).toContain("disabled");
  });
});
