// FILE: CursorAdapter.test.ts
// Purpose: Characterizes Cursor's private Forkara host-policy delivery.
// Layer: Provider adapter tests

import { FORKARA_HARNESS_POLICY_MARKER } from "../../agentGateway/harnessPolicy.ts";
import { describe, expect, it } from "vitest";

import { takeCursorForkaraHarnessPolicyTextPart } from "./CursorAdapter.ts";

describe("Cursor Forkara harness policy", () => {
  it("delivers scoped MCP host context exactly once per fresh/load/fork session", () => {
    for (const lifecycle of ["fresh", "load", "fork"] as const) {
      const state: { harnessPolicyDelivered?: boolean } = {};
      const first = takeCursorForkaraHarnessPolicyTextPart(state, true);
      expect(first?.text, lifecycle).toContain(FORKARA_HARNESS_POLICY_MARKER);
      expect(first?.text, lifecycle).toContain("Use the forkara_* tools");
      expect(takeCursorForkaraHarnessPolicyTextPart(state, true), lifecycle).toBeNull();
    }
  });

  it("stays truthful without a scoped gateway connection", () => {
    expect(takeCursorForkaraHarnessPolicyTextPart({}, false)?.text).toContain(
      "Forkara MCP control is unavailable",
    );
  });
});
