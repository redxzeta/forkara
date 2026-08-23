import { describe, expect, it } from "vitest";

import { isLicenseChangerApproval } from "./ComposerPendingApprovalPanel";

describe("License Changer approval detection", () => {
  it("detects repository license paths and permission profiles", () => {
    expect(
      isLicenseChangerApproval({
        requestKind: "file-change",
        detail: 'apply_patch: {"file_path":"/workspace/LICENSE"}',
      }),
    ).toBe(true);
    expect(
      isLicenseChangerApproval({
        requestKind: "permissions",
        detail: "request permissions",
        permissionProfile: { writableRoots: ["/workspace/LICENSE.md"] },
      }),
    ).toBe(true);
  });

  it("does not treat ordinary approvals as license changes", () => {
    expect(
      isLicenseChangerApproval({
        requestKind: "command",
        detail: 'Bash: {"command":"cat LICENSE"}',
      }),
    ).toBe(false);
  });
});
