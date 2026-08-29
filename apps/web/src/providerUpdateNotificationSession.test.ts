import { describe, expect, it } from "vitest";

import { createProviderUpdateNotificationSession } from "./providerUpdateNotificationSession";

describe("provider update notification session", () => {
  it("coalesces an identical version state across route remounts", () => {
    const session = createProviderUpdateNotificationSession();
    expect(session.claim("codex:1.2.0->1.3.0")).toBe(true);
    expect(session.claim("codex:1.2.0->1.3.0")).toBe(false);
    expect(session.hasSeen("codex:1.2.0->1.3.0")).toBe(true);
  });

  it("allows a genuinely different provider version state", () => {
    const session = createProviderUpdateNotificationSession();
    expect(session.claim("codex:1.2.0->1.3.0")).toBe(true);
    expect(session.claim("codex:1.3.0->1.4.0")).toBe(true);
  });
});
