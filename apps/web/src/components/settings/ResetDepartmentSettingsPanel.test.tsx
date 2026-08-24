// FILE: ResetDepartmentSettingsPanel.test.tsx
// Purpose: Static accessibility and non-operational shell coverage for Reset Department.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RESET_DEPARTMENT_ACTIONS,
  ResetDepartmentSettingsPanel,
} from "./ResetDepartmentSettingsPanel";

describe("ResetDepartmentSettingsPanel", () => {
  it("renders the Oracle and quota parody without enabling destructive tools", () => {
    const markup = renderToStaticMarkup(<ResetDepartmentSettingsPanel active />);

    for (const action of RESET_DEPARTMENT_ACTIONS) {
      expect(markup).toContain(action.title);
      expect(markup).toContain(action.risk);
      expect(markup).toContain(
        action.id === "oracle"
          ? `${action.title} — ${action.risk}`
          : action.id === "quota"
            ? `${action.title} — ${action.risk} parody`
            : `${action.title} — ${action.risk} placeholder`,
      );
    }
    expect(markup.match(/data-reset-placeholder="true"/gu)).toHaveLength(2);
    expect(markup).toContain('data-reset-oracle="true"');
    expect(markup).toContain('data-reset-quota-parody="true"');
    expect(markup).toContain("Pretend to reset");
    expect(markup).toContain("A fictional quota reset. No provider or account state is connected.");
    expect(markup).toContain('data-risk="DANGER"');
    expect(markup).toContain("border-destructive/60");
    expect(markup).toContain("The Oracle and quota parody are harmless.");
  });

  it("renders nothing while another settings section is active", () => {
    expect(renderToStaticMarkup(<ResetDepartmentSettingsPanel active={false} />)).toBe("");
  });
});
