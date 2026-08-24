// FILE: ResetDepartmentSettingsPanel.test.tsx
// Purpose: Static accessibility and non-operational shell coverage for Reset Department.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RESET_DEPARTMENT_ACTIONS,
  ResetDepartmentSettingsPanel,
} from "./ResetDepartmentSettingsPanel";

describe("ResetDepartmentSettingsPanel", () => {
  it("renders every textual risk tier as an explicit placeholder", () => {
    const markup = renderToStaticMarkup(<ResetDepartmentSettingsPanel active />);

    for (const action of RESET_DEPARTMENT_ACTIONS) {
      expect(markup).toContain(action.title);
      expect(markup).toContain(action.risk);
      expect(markup).toContain(`${action.title} — ${action.risk} placeholder`);
    }
    expect(markup.match(/data-reset-placeholder="true"/gu)).toHaveLength(4);
    expect(markup).toContain('data-risk="DANGER"');
    expect(markup).toContain("border-destructive/60");
    expect(markup).toContain("Every control is a non-operational placeholder.");
  });

  it("renders nothing while another settings section is active", () => {
    expect(renderToStaticMarkup(<ResetDepartmentSettingsPanel active={false} />)).toBe("");
  });
});
