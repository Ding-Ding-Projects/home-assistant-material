import { describe, expect, it } from "vitest";
import {
  isRoleViewOnly,
  roleLevel,
  setRoleLevel,
  setRoleViewOnly,
} from "../../src/data/presentation-roles";
import type { VisibilityCondition } from "../../src/panels/lovelace/common/validate-condition";

describe("view only role levels", () => {
  it("marks and unmarks one role without touching other entries", () => {
    const other: VisibilityCondition = {
      condition: "user",
      users: ["u1"],
    };
    const on = setRoleViewOnly([other], "kids", true);
    expect(on).toHaveLength(2);
    expect(isRoleViewOnly(on, "kids")).toBe(true);
    expect(isRoleViewOnly(on, "guests")).toBe(false);
    // Marking twice never duplicates the role.
    expect(setRoleViewOnly(on, "kids", true)).toHaveLength(2);
    expect(setRoleViewOnly(on, "kids", false)).toEqual([other]);
  });

  it("reports hide, view or use for a role", () => {
    expect(roleLevel(undefined, undefined, "kids")).toBe("use");
    const view = setRoleLevel(undefined, undefined, "kids", "view");
    expect(roleLevel(view.visibility, view.view_only, "kids")).toBe("view");
    const hide = setRoleLevel(view.visibility, view.view_only, "kids", "hide");
    expect(roleLevel(hide.visibility, hide.view_only, "kids")).toBe("hide");
    expect(hide.view_only).toEqual([]);
    const use = setRoleLevel(hide.visibility, hide.view_only, "kids", "use");
    expect(use.visibility).toEqual([]);
    expect(use.view_only).toEqual([]);
  });

  it("leaves a custom role rule alone", () => {
    const custom: VisibilityCondition[] = [
      { condition: "role", roles: ["kids"] },
    ];
    expect(roleLevel(custom, undefined, "kids")).toBe("custom");
  });
});
