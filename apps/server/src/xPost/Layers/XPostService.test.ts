import type { OutboundHttpRequest, OutboundHttpResponse } from "@forkara/shared/outboundHttp";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { ServerSecretStoreShape } from "../../auth/Services/ServerSecretStore";
import {
  makeXPostService,
  resolveXOAuthRedirectUri,
  X_API_ME_URL,
  X_API_POST_URL,
  X_OAUTH_AUTHORIZE_URL,
  X_OAUTH_TOKEN_URL,
} from "./XPostService";

function jsonResponse(status: number, body: unknown): OutboundHttpResponse {
  return {
    status,
    headers: new Headers({ "content-type": "application/json" }),
    body: new TextEncoder().encode(JSON.stringify(body)),
    url: X_OAUTH_TOKEN_URL,
  };
}

function makeSecretStore(storage = new Map<string, Uint8Array>()): {
  readonly storage: Map<string, Uint8Array>;
  readonly service: Pick<ServerSecretStoreShape, "get" | "set" | "remove">;
} {
  return {
    storage,
    service: {
      get: (name) => Effect.sync(() => storage.get(name) ?? null),
      set: (name, value) =>
        Effect.sync(() => {
          storage.set(name, Uint8Array.from(value));
        }),
      remove: (name) =>
        Effect.sync(() => {
          storage.delete(name);
        }),
    },
  };
}

function config() {
  return {
    host: "127.0.0.1",
    port: 3773,
    publicUrl: undefined,
    xClientId: "public-client-id",
  } as const;
}

async function completeConnection(input: {
  readonly service: ReturnType<typeof makeXPostService>;
  readonly code?: string;
}) {
  const started = await Effect.runPromise(input.service.beginConnect);
  const state = new URL(started.authorizationUrl).searchParams.get("state");
  expect(state).toBeTruthy();
  return await Effect.runPromise(
    input.service.completeConnect({ state, code: input.code ?? "authorization-code", error: null }),
  );
}

describe("XPostService", () => {
  it("resolves only owned loopback or HTTPS-public callback origins", () => {
    expect(resolveXOAuthRedirectUri(config())).toBe("http://127.0.0.1:3773/oauth/x/callback");
    expect(
      resolveXOAuthRedirectUri({
        host: "0.0.0.0",
        port: 48123,
        publicUrl: undefined,
      }),
    ).toBe("http://127.0.0.1:48123/oauth/x/callback");
    expect(
      resolveXOAuthRedirectUri({
        host: "0.0.0.0",
        port: 3773,
        publicUrl: new URL("https://forkara.example/"),
      }),
    ).toBe("https://forkara.example/oauth/x/callback");
    expect(
      resolveXOAuthRedirectUri({ host: "192.168.1.4", port: 3773, publicUrl: undefined }),
    ).toBeNull();
  });

  it("builds a bounded S256 PKCE authorization with the minimum persisted scopes", async () => {
    const secretStore = makeSecretStore();
    let randomCall = 0;
    const service = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      now: () => Date.parse("2026-08-23T12:00:00.000Z"),
      randomBytes: (length) => new Uint8Array(length).fill(++randomCall),
    });

    const result = await Effect.runPromise(service.beginConnect);
    const url = new URL(result.authorizationUrl);
    expect(url.origin + url.pathname).toBe(X_OAUTH_AUTHORIZE_URL);
    expect(url.searchParams.get("client_id")).toBe("public-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3773/oauth/x/callback");
    expect(url.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toHaveLength(43);
    expect(result.authorizationUrl).not.toContain("code_verifier");
    expect(result.status).toMatchObject({ state: "connecting" });
  });

  it("rejects mismatched OAuth state without contacting X", async () => {
    const secretStore = makeSecretStore();
    const request = vi.fn<(input: OutboundHttpRequest) => Promise<OutboundHttpResponse>>();
    const service = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
    });
    await Effect.runPromise(service.beginConnect);

    const error = await Effect.runPromise(
      service
        .completeConnect({ state: "wrong-state", code: "authorization-code", error: null })
        .pipe(Effect.flip),
    );
    expect(error.reason).toBe("oauth-state");
    expect(request).not.toHaveBeenCalled();
  });

  it("expires pending PKCE state and requires a new connection after server restart", async () => {
    const secretStore = makeSecretStore();
    const request = vi.fn<(input: OutboundHttpRequest) => Promise<OutboundHttpResponse>>();
    let now = Date.parse("2026-08-23T12:00:00.000Z");
    const first = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
      now: () => now,
    });
    const started = await Effect.runPromise(first.beginConnect);
    const state = new URL(started.authorizationUrl).searchParams.get("state");
    expect(secretStore.storage.size).toBe(0);

    now += 10 * 60_000 + 1;
    await expect(Effect.runPromise(first.getConnectionStatus)).resolves.toMatchObject({
      state: "error",
      message: expect.stringContaining("expired"),
    });
    const expired = await Effect.runPromise(
      first.completeConnect({ state, code: "late-code", error: null }).pipe(Effect.flip),
    );
    expect(expired.reason).toBe("oauth-state");

    const restarted = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
      now: () => now,
    });
    const afterRestart = await Effect.runPromise(
      restarted.completeConnect({ state, code: "replayed-code", error: null }).pipe(Effect.flip),
    );
    expect(afterRestart.reason).toBe("oauth-state");
    expect(request).not.toHaveBeenCalled();
  });

  it("persists a connected account across service restarts and disconnect removes it", async () => {
    const secretStore = makeSecretStore();
    const request = vi.fn(async (input: OutboundHttpRequest) => {
      const url = String(input.url);
      if (url === X_OAUTH_TOKEN_URL) {
        return jsonResponse(200, {
          access_token: "real-access-secret",
          refresh_token: "real-refresh-secret",
          expires_in: 7200,
        });
      }
      if (url === X_API_ME_URL) {
        return jsonResponse(200, { data: { id: "42", username: "octocat" } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const first = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
    });

    await expect(completeConnection({ service: first })).resolves.toMatchObject({
      state: "connected",
      handle: "octocat",
    });
    expect(secretStore.storage.size).toBe(1);

    const restarted = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
    });
    await expect(Effect.runPromise(restarted.getConnectionStatus)).resolves.toMatchObject({
      state: "connected",
      handle: "octocat",
    });
    await expect(Effect.runPromise(restarted.disconnect)).resolves.toMatchObject({
      state: "disconnected",
    });
    expect(secretStore.storage.size).toBe(0);
  });

  it("creates a basic text post with the stored user token", async () => {
    const secretStore = makeSecretStore();
    const requests: OutboundHttpRequest[] = [];
    const request = vi.fn(async (input: OutboundHttpRequest) => {
      requests.push(input);
      const url = String(input.url);
      if (url === X_OAUTH_TOKEN_URL) {
        return jsonResponse(200, {
          access_token: "post-access-secret",
          refresh_token: "post-refresh-secret",
          expires_in: 7200,
        });
      }
      if (url === X_API_ME_URL) {
        return jsonResponse(200, { data: { id: "42", username: "octocat" } });
      }
      if (url === X_API_POST_URL) {
        return jsonResponse(201, { data: { id: "123456", text: "User-reviewed draft" } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const service = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
    });
    await completeConnection({ service });

    await expect(
      Effect.runPromise(service.createPost({ text: "User-reviewed draft" })),
    ).resolves.toEqual({
      id: "123456",
      text: "User-reviewed draft",
      url: "https://x.com/octocat/status/123456",
    });
    const postRequest = requests.find((entry) => String(entry.url) === X_API_POST_URL);
    expect(postRequest?.method).toBe("POST");
    expect(postRequest?.body).toBe(JSON.stringify({ text: "User-reviewed draft" }));
    expect(new Headers(postRequest?.headers).get("authorization")).toBe(
      "Bearer post-access-secret",
    );
    expect(String(postRequest?.url)).not.toContain("post-access-secret");
    expect(postRequest?.body).not.toContain("post-access-secret");
  });

  it("refreshes an expiring session and persists refresh-token rotation before posting", async () => {
    const secretStore = makeSecretStore();
    const requests: OutboundHttpRequest[] = [];
    let now = Date.parse("2026-08-23T12:00:00.000Z");
    let tokenRequestCount = 0;
    const request = vi.fn(async (input: OutboundHttpRequest) => {
      requests.push(input);
      const url = String(input.url);
      if (url === X_OAUTH_TOKEN_URL) {
        tokenRequestCount += 1;
        return tokenRequestCount === 1
          ? jsonResponse(200, {
              access_token: "access-v1",
              refresh_token: "refresh-v1",
              expires_in: 60,
            })
          : jsonResponse(200, {
              access_token: "access-v2",
              refresh_token: "refresh-v2",
              expires_in: 7200,
            });
      }
      if (url === X_API_ME_URL) {
        return jsonResponse(200, { data: { id: "42", username: "octocat" } });
      }
      if (url === X_API_POST_URL) {
        return jsonResponse(201, { data: { id: "rotated", text: "Rotated draft" } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const service = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
      now: () => now,
    });
    await completeConnection({ service });

    now += 61_000;
    await expect(
      Effect.runPromise(service.createPost({ text: "Rotated draft" })),
    ).resolves.toMatchObject({ id: "rotated", text: "Rotated draft" });

    const tokenRequests = requests.filter((entry) => String(entry.url) === X_OAUTH_TOKEN_URL);
    expect(tokenRequests).toHaveLength(2);
    expect(tokenRequests[1]?.body).toContain("grant_type=refresh_token");
    expect(tokenRequests[1]?.body).toContain("refresh_token=refresh-v1");
    const postRequest = requests.find((entry) => String(entry.url) === X_API_POST_URL);
    expect(new Headers(postRequest?.headers).get("authorization")).toBe("Bearer access-v2");

    const stored = secretStore.storage.values().next().value;
    expect(stored).toBeDefined();
    const persisted = new TextDecoder().decode(stored);
    expect(persisted).toContain("refresh-v2");
    expect(persisted).not.toContain("refresh-v1");
  });

  it("keeps OAuth response secrets out of typed errors", async () => {
    const leakedAccessToken = "must-not-appear-access-token";
    const leakedRefreshToken = "must-not-appear-refresh-token";
    const secretStore = makeSecretStore();
    const request = vi.fn(async () =>
      jsonResponse(400, {
        error: "invalid_grant",
        access_token: leakedAccessToken,
        refresh_token: leakedRefreshToken,
      }),
    );
    const service = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
    });
    const started = await Effect.runPromise(service.beginConnect);
    const state = new URL(started.authorizationUrl).searchParams.get("state");
    const error = await Effect.runPromise(
      service.completeConnect({ state, code: "authorization-code", error: null }).pipe(Effect.flip),
    );

    const serialized = JSON.stringify(error);
    expect(error.reason).toBe("auth");
    expect(serialized).not.toContain(leakedAccessToken);
    expect(serialized).not.toContain(leakedRefreshToken);
    expect(secretStore.storage.size).toBe(0);
  });

  it("rejects empty posts locally and represents X auth failures without changing input", async () => {
    const secretStore = makeSecretStore();
    let posting = false;
    const request = vi.fn(async (input: OutboundHttpRequest) => {
      const url = String(input.url);
      if (url === X_OAUTH_TOKEN_URL) {
        return jsonResponse(200, { access_token: "short-session", expires_in: 7200 });
      }
      if (url === X_API_ME_URL) return jsonResponse(503, { error: "profile unavailable" });
      if (url === X_API_POST_URL) {
        posting = true;
        return jsonResponse(401, { detail: "authorization bearer short-session" });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const service = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
    });
    await completeConnection({ service });

    const emptyError = await Effect.runPromise(
      service.createPost({ text: "   " }).pipe(Effect.flip),
    );
    expect(emptyError.reason).toBe("invalid-input");
    expect(posting).toBe(false);

    const draft = "Keep this exact draft";
    const authError = await Effect.runPromise(
      service.createPost({ text: draft }).pipe(Effect.flip),
    );
    expect(authError.reason).toBe("auth");
    expect(JSON.stringify(authError)).not.toContain("short-session");
    expect(draft).toBe("Keep this exact draft");
  });

  it("maps rate-limit and API failures to safe typed errors without mutating the draft", async () => {
    const secretStore = makeSecretStore();
    let postStatus = 429;
    const leakedDetail = "provider-body-must-not-leak";
    const request = vi.fn(async (input: OutboundHttpRequest) => {
      const url = String(input.url);
      if (url === X_OAUTH_TOKEN_URL) {
        return jsonResponse(200, { access_token: "safe-session", expires_in: 7200 });
      }
      if (url === X_API_ME_URL) return jsonResponse(503, {});
      if (url === X_API_POST_URL) return jsonResponse(postStatus, { detail: leakedDetail });
      throw new Error(`Unexpected URL ${url}`);
    });
    const service = makeXPostService({
      config: config(),
      secretStore: secretStore.service,
      request,
    });
    await completeConnection({ service });
    const draft = "Preserve me across retries";

    const rateLimit = await Effect.runPromise(
      service.createPost({ text: draft }).pipe(Effect.flip),
    );
    expect(rateLimit).toMatchObject({ reason: "rate-limit", retryable: true });
    expect(JSON.stringify(rateLimit)).not.toContain(leakedDetail);

    postStatus = 500;
    const api = await Effect.runPromise(service.createPost({ text: draft }).pipe(Effect.flip));
    expect(api).toMatchObject({ reason: "api", retryable: true });
    expect(JSON.stringify(api)).not.toContain(leakedDetail);
    expect(draft).toBe("Preserve me across retries");
  });
});
