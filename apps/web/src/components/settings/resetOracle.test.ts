// FILE: resetOracle.test.ts
// Purpose: Deterministic coverage for ordinary and rare Reset Oracle selections.

import { describe, expect, it, vi } from "vitest";

import {
  RESET_ORACLE_RARE_PROBABILITY,
  RESET_ORACLE_RARE_RESPONSE,
  RESET_ORACLE_RESPONSES,
  selectResetOracleResponse,
} from "./resetOracle";

describe("selectResetOracleResponse", () => {
  it("selects the rare response deterministically", () => {
    const random = vi.fn(() => RESET_ORACLE_RARE_PROBABILITY / 2);

    expect(selectResetOracleResponse(random)).toEqual({
      response: RESET_ORACLE_RARE_RESPONSE,
      rare: true,
    });
    expect(random).toHaveBeenCalledOnce();
  });

  it("maps the ordinary range across the centralized response list", () => {
    expect(selectResetOracleResponse(() => RESET_ORACLE_RARE_PROBABILITY)).toEqual({
      response: RESET_ORACLE_RESPONSES[0],
      rare: false,
    });
    expect(selectResetOracleResponse(() => 1)).toEqual({
      response: RESET_ORACLE_RESPONSES.at(-1),
      rare: false,
    });
  });
});
