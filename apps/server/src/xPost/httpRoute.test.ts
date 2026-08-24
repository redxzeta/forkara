import http from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { XPostError } from "@forkara/contracts";
import { Effect, Exit, Layer, Scope } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { describe, expect, it, vi } from "vitest";

import { XPostService, type XPostServiceShape } from "./Services/XPostService";
import { xOAuthCallbackHtml, xPostRouteLayer } from "./httpRoute";

async function withCallbackServer(
  completeConnect: XPostServiceShape["completeConnect"],
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const scope = await Effect.runPromise(Scope.make("sequential"));
  let nodeServer: http.Server | null = null;
  try {
    const service = {
      setListeningPort: () => undefined,
      getConnectionStatus: Effect.die("not used"),
      beginConnect: Effect.die("not used"),
      completeConnect,
      disconnect: Effect.die("not used"),
      createPost: () => Effect.die("not used"),
    } satisfies XPostServiceShape;
    await Effect.runPromise(
      Scope.provide(
        Effect.gen(function* () {
          const httpServer = yield* NodeHttpServer.make(
            () => {
              nodeServer = http.createServer();
              return nodeServer;
            },
            { port: 0, host: "127.0.0.1" },
          );
          yield* httpServer.serve(yield* HttpRouter.toHttpEffect(xPostRouteLayer));
        }).pipe(
          Effect.provide(Layer.mergeAll(Layer.succeed(XPostService, service), NodeServices.layer)),
        ),
        scope,
      ),
    );
    const address = (nodeServer as http.Server | null)?.address();
    if (!address || typeof address !== "object") throw new Error("Missing callback test server");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
}

describe("X OAuth callback route", () => {
  it("forwards callback fields once and returns a restrictive generic success page", async () => {
    const completeConnect = vi.fn<XPostServiceShape["completeConnect"]>(() =>
      Effect.succeed({
        state: "connected",
        redirectUri: "http://127.0.0.1/oauth/x/callback",
        handle: "octocat",
      }),
    );
    await withCallbackServer(completeConnect, async (origin) => {
      const response = await fetch(`${origin}/oauth/x/callback?state=state-1&code=code-1`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(body).toContain("X account connected");
      expect(body).not.toContain("state-1");
      expect(body).not.toContain("code-1");
      expect(completeConnect).toHaveBeenCalledOnce();
      expect(completeConnect).toHaveBeenCalledWith({
        state: "state-1",
        code: "code-1",
        error: null,
      });
    });
  });

  it("keeps typed OAuth failures and provider details out of the browser response", async () => {
    const leakedDetail = "secret-provider-payload";
    await withCallbackServer(
      () =>
        Effect.fail(
          new XPostError({
            reason: "auth",
            message: `Authorization rejected: ${leakedDetail}`,
            retryable: false,
          }),
        ),
      async (origin) => {
        const response = await fetch(
          `${origin}/oauth/x/callback?state=bad-state&error=access_denied`,
        );
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("X connection failed");
        expect(body).not.toContain(leakedDetail);
        expect(body).not.toContain("access_denied");
      },
    );
  });

  it("renders static callback pages without interpolating external values", () => {
    expect(xOAuthCallbackHtml(true)).toContain("return to Forkara");
    expect(xOAuthCallbackHtml(false)).toContain("retry from Settings");
  });
});
