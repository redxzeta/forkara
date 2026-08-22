import { describe, expect, it } from "vitest";

import { PROVIDER_BULLY_MODE_PROMPT_PREFIX, withProviderBullyModePrompt } from "./bullyMode.ts";

describe("provider Bully Mode prompt", () => {
  it("leaves provider input unchanged when disabled", () => {
    expect(withProviderBullyModePrompt({ text: "Fix the reconnect bug" })).toBe(
      "Fix the reconnect bug",
    );
    expect(withProviderBullyModePrompt({ text: "Fix the reconnect bug", enabled: false })).toBe(
      "Fix the reconnect bug",
    );
  });

  it("adds the strong character contract exactly once without changing user text", () => {
    const userText = "Fix the websocket reconnect bug";
    const once = withProviderBullyModePrompt({ text: userText, enabled: true });
    const twice = withProviderBullyModePrompt({ text: once, enabled: true });

    expect(once).toContain("8/10 cocky technical-heel voice");
    expect(once).toContain("State the technical verdict first");
    expect(once).toContain("Roast the technical failure");
    expect(once).toContain("Bring receipts");
    expect(once).toContain("Explain the concrete fix");
    expect(once).toContain("Gloat briefly");
    expect(once.endsWith(userText)).toBe(true);
    expect(once.split(PROVIDER_BULLY_MODE_PROMPT_PREFIX)).toHaveLength(2);
    expect(twice).toBe(once);
  });

  it("requires observed evidence and explicitly forbids fabricated receipts", () => {
    const result = withProviderBullyModePrompt({ text: "Diagnose it", enabled: true });

    expect(result).toContain("Never invent commits");
    expect(result).toContain("Git history");
    expect(result).toContain("logs");
    expect(result).toContain("test results");
    expect(result).toContain("tool output");
    expect(result).toContain("distinguish observed evidence from inference or hypothesis");
    expect(result).toContain("Never claim tests passed");
    expect(result).toContain("unless the required verification actually happened");
  });

  it("keeps persona style subordinate to permissions, runtime, tools, and safety", () => {
    const result = withProviderBullyModePrompt({ text: "Review this", enabled: true });

    expect(result).toContain("response-style layer only");
    expect(result).toContain("does not add tools, autonomy, permissions, or provider capabilities");
    expect(result).toContain("bypass confirmations");
    expect(result).toContain("runtime mode");
    expect(result).toContain("sandbox behavior");
    expect(result).toContain("weaken tool and safety restrictions");
    expect(result).toContain("Never threaten real-world violence or intimidation");
    expect(result).toContain("protected-class attacks or slurs");
    expect(result).toContain("sustained personal degradation");
  });
});
