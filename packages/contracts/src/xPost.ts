import { Schema } from "effect";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";

const XRedirectUri = TrimmedNonEmptyString;

export const XConnectionStatus = Schema.Union([
  Schema.Struct({
    state: Schema.Literal("unconfigured"),
    redirectUri: Schema.NullOr(XRedirectUri),
    message: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    state: Schema.Literal("disconnected"),
    redirectUri: XRedirectUri,
  }),
  Schema.Struct({
    state: Schema.Literal("connecting"),
    redirectUri: XRedirectUri,
    authorizationExpiresAt: IsoDateTime,
  }),
  Schema.Struct({
    state: Schema.Literal("connected"),
    redirectUri: XRedirectUri,
    handle: Schema.NullOr(TrimmedNonEmptyString),
  }),
  Schema.Struct({
    state: Schema.Literal("needs-auth"),
    redirectUri: XRedirectUri,
    handle: Schema.NullOr(TrimmedNonEmptyString),
    message: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    state: Schema.Literal("error"),
    redirectUri: XRedirectUri,
    message: TrimmedNonEmptyString,
  }),
]);
export type XConnectionStatus = typeof XConnectionStatus.Type;

export const XBeginConnectResult = Schema.Struct({
  authorizationUrl: TrimmedNonEmptyString,
  status: XConnectionStatus,
});
export type XBeginConnectResult = typeof XBeginConnectResult.Type;

export const XCreatePostInput = Schema.Struct({
  // X applies its own weighted-length rules. Keep the RPC bounded while allowing the API to
  // return the authoritative validation result for URLs and non-BMP characters.
  text: Schema.String.check(Schema.isMaxLength(10_000)),
});
export type XCreatePostInput = typeof XCreatePostInput.Type;

export const XCreatePostResult = Schema.Struct({
  id: TrimmedNonEmptyString,
  text: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
});
export type XCreatePostResult = typeof XCreatePostResult.Type;

export class XPostError extends Schema.TaggedErrorClass<XPostError>()("XPostError", {
  reason: Schema.Literals([
    "unconfigured",
    "not-connected",
    "invalid-input",
    "oauth-state",
    "auth",
    "rate-limit",
    "api",
    "network",
    "storage",
  ]),
  message: TrimmedNonEmptyString,
  retryable: Schema.Boolean,
}) {}
