import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { XConnectionStatus, XCreatePostInput, XCreatePostResult, XPostError } from "./xPost";

describe("X posting contracts", () => {
  it("allows an unavailable callback only in the unconfigured state", () => {
    expect(
      Schema.decodeUnknownSync(XConnectionStatus)({
        state: "unconfigured",
        redirectUri: null,
        message: "Set FORKARA_X_CLIENT_ID.",
      }),
    ).toMatchObject({ state: "unconfigured", redirectUri: null });
    expect(() =>
      Schema.decodeUnknownSync(XConnectionStatus)({
        state: "disconnected",
        redirectUri: null,
      }),
    ).toThrow();
  });

  it("bounds caller-provided text while leaving empty-text classification to the service", () => {
    expect(Schema.decodeUnknownSync(XCreatePostInput)({ text: "  reviewed draft  " })).toEqual({
      text: "  reviewed draft  ",
    });
    expect(() =>
      Schema.decodeUnknownSync(XCreatePostInput)({ text: "x".repeat(10_001) }),
    ).toThrow();
  });

  it("requires non-empty post receipts and safe typed errors", () => {
    expect(
      Schema.decodeUnknownSync(XCreatePostResult)({
        id: "123",
        text: "Posted",
        url: "https://x.com/i/web/status/123",
      }),
    ).toMatchObject({ id: "123", text: "Posted" });
    expect(() =>
      Schema.decodeUnknownSync(XCreatePostResult)({ id: "", text: "Posted", url: "x" }),
    ).toThrow();
    expect(
      Schema.decodeUnknownSync(XPostError)({
        _tag: "XPostError",
        reason: "rate-limit",
        message: "Try again later.",
        retryable: true,
      }),
    ).toMatchObject({ reason: "rate-limit", retryable: true });
  });
});
