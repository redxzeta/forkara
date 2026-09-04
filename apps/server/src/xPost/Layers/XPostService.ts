import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";

import { XPostError, type XConnectionStatus, type XCreatePostResult } from "@forkara/contracts";
import {
  decodeOutboundJson,
  outboundHttp,
  type OutboundHttpRequest,
  type OutboundHttpResponse,
} from "@forkara/shared/outboundHttp";
import { Effect, Layer, Schema } from "effect";

import {
  ServerSecretStore,
  type ServerSecretStoreShape,
} from "../../auth/Services/ServerSecretStore";
import { type ServerConfigShape, ServerConfig } from "../../config";
import { formatHostForUrl, isLoopbackHost, isWildcardHost } from "../../startupAccess";
import { XPostService, type XPostServiceShape } from "../Services/XPostService";

export const X_OAUTH_CALLBACK_PATH = "/oauth/x/callback";
export const X_OAUTH_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_OAUTH_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_API_ME_URL = "https://api.x.com/2/users/me";
export const X_API_POST_URL = "https://api.x.com/2/tweets";

const X_API_ORIGIN = "https://api.x.com";
const X_CREDENTIAL_SECRET_NAME = "x-oauth-credentials-v1";
const X_CONNECT_TTL_MS = 10 * 60_000;
const X_REFRESH_SKEW_MS = 30_000;
const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

const StoredXCredentials = Schema.Struct({
  version: Schema.Literal(1),
  accessToken: Schema.String.check(Schema.isNonEmpty()),
  refreshToken: Schema.NullOr(Schema.String.check(Schema.isNonEmpty())),
  accessExpiresAt: Schema.NullOr(Schema.Number),
  userId: Schema.NullOr(Schema.String.check(Schema.isNonEmpty())),
  handle: Schema.NullOr(Schema.String.check(Schema.isNonEmpty())),
});
type StoredXCredentials = typeof StoredXCredentials.Type;

interface PendingXConnection {
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly expiresAtMs: number;
}

export interface XPostDependencies {
  readonly config: Pick<ServerConfigShape, "host" | "port" | "publicUrl" | "xClientId">;
  readonly secretStore: Pick<ServerSecretStoreShape, "get" | "set" | "remove">;
  readonly request?: (input: OutboundHttpRequest) => Promise<OutboundHttpResponse>;
  readonly now?: () => number;
  readonly randomBytes?: (bytes: number) => Uint8Array;
}

function xError(reason: XPostError["reason"], message: string, retryable: boolean): XPostError {
  return new XPostError({ reason, message, retryable });
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function stateMatches(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function resolveXOAuthRedirectUri(
  config: Pick<ServerConfigShape, "host" | "port" | "publicUrl">,
  listeningPort = config.port,
): string | null {
  if (config.publicUrl) return new URL(X_OAUTH_CALLBACK_PATH, config.publicUrl).toString();
  const host = config.host;
  if (!isLoopbackHost(host) && !isWildcardHost(host)) return null;
  const callbackHost = !host || isWildcardHost(host) ? "127.0.0.1" : formatHostForUrl(host);
  return `http://${callbackHost}:${listeningPort}${X_OAUTH_CALLBACK_PATH}`;
}

function responseError(status: number): XPostError {
  if (status === 401 || status === 403) {
    return xError("auth", "X rejected the account authorization. Reconnect the account.", false);
  }
  if (status === 429) {
    return xError("rate-limit", "X is rate-limiting this request. Try again later.", true);
  }
  return xError("api", `X could not complete the request (HTTP ${status}).`, status >= 500);
}

function xRequestPolicy(service: string): OutboundHttpRequest["policy"] {
  return {
    service,
    allowedOrigins: [X_API_ORIGIN],
    timeoutMs: 15_000,
    maxRequestBytes: 64 * 1024,
    maxResponseBytes: 1024 * 1024,
    maxRedirects: 0,
    maxConcurrent: 2,
    maxQueued: 4,
    requirePublicAddress: true,
  };
}

function parseJson(response: OutboundHttpResponse): unknown {
  try {
    return decodeOutboundJson(response, { maxDepth: 16, maxNodes: 10_000 });
  } catch {
    return null;
  }
}

export function makeXPostService(dependencies: XPostDependencies): XPostServiceShape {
  const request = dependencies.request ?? outboundHttp.request;
  const now = dependencies.now ?? Date.now;
  const randomBytes = dependencies.randomBytes ?? ((bytes: number) => nodeRandomBytes(bytes));
  const clientId = dependencies.config.xClientId?.trim() || null;
  let listeningPort = dependencies.config.port;
  let pending: PendingXConnection | null = null;
  let lastConnectionError: string | null = null;

  const redirectUri = () => resolveXOAuthRedirectUri(dependencies.config, listeningPort);

  const readCredentials = Effect.gen(function* () {
    const encoded = yield* dependencies.secretStore
      .get(X_CREDENTIAL_SECRET_NAME)
      .pipe(Effect.mapError(() => xError("storage", "X credentials could not be read.", true)));
    if (!encoded) return null;
    const parsed = yield* Effect.try({
      try: () => JSON.parse(new TextDecoder().decode(encoded)) as unknown,
      catch: () => xError("storage", "Stored X credentials are invalid.", false),
    });
    return yield* Schema.decodeUnknownEffect(StoredXCredentials)(parsed).pipe(
      Effect.mapError(() => xError("storage", "Stored X credentials are invalid.", false)),
    );
  });

  const writeCredentials = (credentials: StoredXCredentials) =>
    dependencies.secretStore
      .set(X_CREDENTIAL_SECRET_NAME, new TextEncoder().encode(JSON.stringify(credentials)))
      .pipe(Effect.mapError(() => xError("storage", "X credentials could not be saved.", true)));

  const removeCredentials = dependencies.secretStore
    .remove(X_CREDENTIAL_SECRET_NAME)
    .pipe(Effect.mapError(() => xError("storage", "X credentials could not be removed.", true)));

  const configuration = () => {
    const callback = redirectUri();
    if (!clientId) {
      return {
        callback,
        error: "Set FORKARA_X_CLIENT_ID to the public client ID for an X OAuth 2.0 app.",
      } as const;
    }
    if (!callback) {
      return {
        callback,
        error: "X connection requires loopback access or an HTTPS FORKARA_PUBLIC_URL.",
      } as const;
    }
    return { callback, error: null } as const;
  };

  const getConnectionStatus: XPostServiceShape["getConnectionStatus"] = Effect.gen(function* () {
    const configured = configuration();
    if (configured.error || !configured.callback) {
      return {
        state: "unconfigured",
        redirectUri: configured.callback,
        message: configured.error ?? "X connection is not configured.",
      } satisfies XConnectionStatus;
    }

    if (pending && pending.expiresAtMs <= now()) {
      pending = null;
      lastConnectionError = "The X authorization request expired. Start a new connection.";
    }
    if (pending) {
      return {
        state: "connecting",
        redirectUri: configured.callback,
        authorizationExpiresAt: new Date(pending.expiresAtMs).toISOString(),
      } satisfies XConnectionStatus;
    }

    const credentials = yield* readCredentials;
    if (credentials) {
      if (
        credentials.accessExpiresAt !== null &&
        credentials.accessExpiresAt <= now() &&
        credentials.refreshToken === null
      ) {
        return {
          state: "needs-auth",
          redirectUri: configured.callback,
          handle: credentials.handle,
          message: "The X session expired and must be reconnected.",
        } satisfies XConnectionStatus;
      }
      return {
        state: "connected",
        redirectUri: configured.callback,
        handle: credentials.handle,
      } satisfies XConnectionStatus;
    }

    if (lastConnectionError) {
      return {
        state: "error",
        redirectUri: configured.callback,
        message: lastConnectionError,
      } satisfies XConnectionStatus;
    }
    return { state: "disconnected", redirectUri: configured.callback } satisfies XConnectionStatus;
  });

  const requestToken = (body: URLSearchParams) =>
    Effect.tryPromise({
      try: () =>
        request({
          policy: xRequestPolicy("x-oauth"),
          url: X_OAUTH_TOKEN_URL,
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        }),
      catch: () => xError("network", "X authorization could not be reached.", true),
    }).pipe(
      Effect.flatMap((response) => {
        if (response.status < 200 || response.status >= 300) {
          if (response.status === 400) {
            return Effect.fail(
              xError(
                "auth",
                "X rejected the authorization exchange. Reconnect the account.",
                false,
              ),
            );
          }
          return Effect.fail(responseError(response.status));
        }
        const body = asRecord(parseJson(response));
        const accessToken = asNonEmptyString(body?.access_token);
        if (!accessToken) {
          return Effect.fail(xError("api", "X returned an invalid authorization response.", true));
        }
        const refreshToken = asNonEmptyString(body?.refresh_token);
        const expiresIn =
          typeof body?.expires_in === "number" && Number.isFinite(body.expires_in)
            ? body.expires_in
            : null;
        return Effect.succeed({
          accessToken,
          refreshToken,
          accessExpiresAt: expiresIn === null ? null : now() + Math.max(0, expiresIn) * 1_000,
        });
      }),
    );

  const refreshCredentials = (credentials: StoredXCredentials) =>
    Effect.gen(function* () {
      if (!clientId || !credentials.refreshToken) {
        return yield* Effect.fail(
          xError("auth", "The X session expired and must be reconnected.", false),
        );
      }
      const refreshed = yield* requestToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
          client_id: clientId,
        }),
      );
      const next: StoredXCredentials = {
        ...credentials,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? credentials.refreshToken,
        accessExpiresAt: refreshed.accessExpiresAt,
      };
      yield* writeCredentials(next);
      return next;
    });

  const loadPostingCredentials = Effect.gen(function* () {
    const configured = configuration();
    if (configured.error) {
      return yield* Effect.fail(xError("unconfigured", configured.error, false));
    }
    const credentials = yield* readCredentials;
    if (!credentials) {
      return yield* Effect.fail(
        xError("not-connected", "Connect an X account before posting.", false),
      );
    }
    if (
      credentials.accessExpiresAt !== null &&
      credentials.accessExpiresAt <= now() + X_REFRESH_SKEW_MS
    ) {
      return yield* refreshCredentials(credentials);
    }
    return credentials;
  });

  const beginConnect: XPostServiceShape["beginConnect"] = Effect.gen(function* () {
    const configured = configuration();
    if (configured.error || !configured.callback || !clientId) {
      return yield* Effect.fail(
        xError("unconfigured", configured.error ?? "X connection is not configured.", false),
      );
    }
    const state = base64Url(randomBytes(32));
    const verifier = base64Url(randomBytes(32));
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const expiresAtMs = now() + X_CONNECT_TTL_MS;
    pending = { state, verifier, redirectUri: configured.callback, expiresAtMs };
    lastConnectionError = null;

    const authorizationUrl = new URL(X_OAUTH_AUTHORIZE_URL);
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: configured.callback,
      scope: X_OAUTH_SCOPES.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return {
      authorizationUrl: authorizationUrl.toString(),
      status: {
        state: "connecting",
        redirectUri: configured.callback,
        authorizationExpiresAt: new Date(expiresAtMs).toISOString(),
      },
    };
  });

  const completeConnect: XPostServiceShape["completeConnect"] = (input) =>
    Effect.gen(function* () {
      const active = pending;
      const actualState = input.state?.trim() ?? "";
      if (!active || active.expiresAtMs <= now() || !stateMatches(active.state, actualState)) {
        if (active?.expiresAtMs !== undefined && active.expiresAtMs <= now()) pending = null;
        return yield* Effect.fail(
          xError("oauth-state", "The X authorization state is invalid or expired.", false),
        );
      }
      // Consume before any network work: an authorization code/state pair is one-shot even when
      // the token endpoint fails, and retrying starts a fresh PKCE exchange.
      pending = null;
      if (input.error || !input.code?.trim()) {
        lastConnectionError = "X authorization was cancelled or denied.";
        return yield* Effect.fail(xError("oauth-state", lastConnectionError, false));
      }
      if (!clientId) {
        return yield* Effect.fail(xError("unconfigured", "X connection is not configured.", false));
      }

      const token = yield* requestToken(
        new URLSearchParams({
          code: input.code.trim(),
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: active.redirectUri,
          code_verifier: active.verifier,
        }),
      ).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            lastConnectionError = error.message;
          }),
        ),
      );
      let credentials: StoredXCredentials = {
        version: 1,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        accessExpiresAt: token.accessExpiresAt,
        userId: null,
        handle: null,
      };
      yield* writeCredentials(credentials);

      // Profile enrichment is best-effort. A valid token remains useful for posting when X's
      // profile endpoint has a transient failure, and Settings can honestly omit the handle.
      const profileResponse = yield* Effect.tryPromise({
        try: () =>
          request({
            policy: xRequestPolicy("x-profile"),
            url: X_API_ME_URL,
            method: "GET",
            headers: { Accept: "application/json", Authorization: `Bearer ${token.accessToken}` },
          }),
        catch: () => xError("network", "X profile lookup was unavailable.", true),
      }).pipe(Effect.catch(() => Effect.succeed(null)));
      if (profileResponse?.status === 401 || profileResponse?.status === 403) {
        yield* removeCredentials;
        lastConnectionError = "X rejected the new account authorization.";
        return yield* Effect.fail(xError("auth", lastConnectionError, false));
      }
      if (profileResponse && profileResponse.status >= 200 && profileResponse.status < 300) {
        const profile = asRecord(asRecord(parseJson(profileResponse))?.data);
        const userId = asNonEmptyString(profile?.id);
        const handle = asNonEmptyString(profile?.username);
        if (userId || handle) {
          credentials = { ...credentials, userId, handle };
          yield* writeCredentials(credentials);
        }
      }

      lastConnectionError = null;
      return {
        state: "connected",
        redirectUri: active.redirectUri,
        handle: credentials.handle,
      } satisfies XConnectionStatus;
    });

  const disconnect: XPostServiceShape["disconnect"] = Effect.gen(function* () {
    pending = null;
    lastConnectionError = null;
    yield* removeCredentials;
    return yield* getConnectionStatus;
  });

  const sendPost = (credentials: StoredXCredentials, text: string) =>
    Effect.tryPromise({
      try: () =>
        request({
          policy: xRequestPolicy("x-create-post"),
          url: X_API_POST_URL,
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        }),
      catch: () => xError("network", "X could not be reached. Your draft was not changed.", true),
    });

  const createPost: XPostServiceShape["createPost"] = (input) =>
    Effect.gen(function* () {
      if (input.text.trim().length === 0) {
        return yield* Effect.fail(xError("invalid-input", "Post text cannot be empty.", false));
      }
      let credentials = yield* loadPostingCredentials;
      let response = yield* sendPost(credentials, input.text);
      if (
        (response.status === 401 || response.status === 403) &&
        credentials.refreshToken !== null
      ) {
        credentials = yield* refreshCredentials(credentials);
        response = yield* sendPost(credentials, input.text);
      }
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.fail(responseError(response.status));
      }
      const data = asRecord(asRecord(parseJson(response))?.data);
      const id = asNonEmptyString(data?.id);
      const text = asNonEmptyString(data?.text);
      if (!id || !text) {
        return yield* Effect.fail(xError("api", "X returned an invalid post response.", true));
      }
      return {
        id,
        text,
        url: credentials.handle
          ? `https://x.com/${encodeURIComponent(credentials.handle)}/status/${encodeURIComponent(id)}`
          : `https://x.com/i/web/status/${encodeURIComponent(id)}`,
      } satisfies XCreatePostResult;
    });

  return {
    setListeningPort: (port) => {
      listeningPort = port;
    },
    getConnectionStatus,
    beginConnect,
    completeConnect,
    disconnect,
    createPost,
  };
}

export const XPostServiceLive = Layer.effect(
  XPostService,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const secretStore = yield* ServerSecretStore;
    return makeXPostService({ config, secretStore });
  }),
);
