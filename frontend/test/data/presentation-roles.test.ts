import { describe, expect, it } from "vitest";
import {
  addRole,
  evaluateForPerson,
  isUserInRoles,
  makeRoleId,
  normalizeRoles,
  removeRole,
  renameRole,
  roleIdsOfUser,
  roleRule,
  setRoleHidden,
  setRoleUsers,
  visibilityByRole,
} from "../../src/data/presentation-roles";
import type { VisibilityCondition } from "../../src/panels/lovelace/common/validate-condition";
import { checkConditionsMet } from "../../src/panels/lovelace/common/validate-condition";
import { isPureClientCondition } from "../../src/common/condition/translate";
import type { HomeAssistant } from "../../src/types";

const ROLES = [
  { id: "kids", name: "Kids", users: ["u-kid1", "u-kid2"] },
  { id: "family", name: "Family", users: ["u-mum", "u-kid1"] },
  { id: "sitter", name: "House sitter", users: [] },
];

describe("normalizeRoles", () => {
  it("drops malformed entries and duplicates", () => {
    expect(
      normalizeRoles([
        { id: "a", name: "A", users: ["x", "x", 3] },
        { id: "a", name: "Again", users: [] },
        { name: "No id" },
        "text",
        null,
      ])
    ).toEqual([{ id: "a", name: "A", users: ["x"] }]);
  });

  it("returns an empty list for anything that is not a list", () => {
    expect(normalizeRoles(undefined)).toEqual([]);
    expect(normalizeRoles({})).toEqual([]);
  });
});

describe("membership", () => {
  it("finds a person in any of the named roles", () => {
    expect(isUserInRoles(ROLES, "u-kid1", ["kids"])).toBe(true);
    expect(isUserInRoles(ROLES, "u-mum", ["kids"])).toBe(false);
    expect(isUserInRoles(ROLES, "u-mum", ["kids", "family"])).toBe(true);
  });

  it("is false without a person, roles or a matching role", () => {
    expect(isUserInRoles(ROLES, undefined, ["kids"])).toBe(false);
    expect(isUserInRoles(ROLES, "u-kid1", [])).toBe(false);
    expect(isUserInRoles(ROLES, "u-kid1", undefined)).toBe(false);
    expect(isUserInRoles(ROLES, "u-kid1", ["gone"])).toBe(false);
    expect(isUserInRoles(undefined, "u-kid1", ["kids"])).toBe(false);
  });

  it("lists the roles of a person", () => {
    expect(roleIdsOfUser(ROLES, "u-kid1")).toEqual(["kids", "family"]);
    expect(roleIdsOfUser(ROLES, "nobody")).toEqual([]);
  });
});

describe("editing roles", () => {
  it("makes unique ids from names", () => {
    expect(makeRoleId("House sitter", [])).toBe("house_sitter");
    expect(makeRoleId("Kids", ROLES)).toBe("kids_2");
    expect(makeRoleId("!!!", [])).toBe("role");
  });

  it("adds, renames, removes and sets people without mutating", () => {
    const added = addRole(ROLES, "  Guests ");
    expect(added).toHaveLength(4);
    expect(added[3]).toEqual({ id: "guests", name: "Guests", users: [] });
    expect(ROLES).toHaveLength(3);
    expect(addRole(ROLES, "   ")).toBe(ROLES);
    expect(renameRole(ROLES, "kids", "Children")[0].name).toBe("Children");
    expect(renameRole(ROLES, "kids", " ")).toBe(ROLES);
    expect(removeRole(ROLES, "kids").map((r) => r.id)).toEqual([
      "family",
      "sitter",
    ]);
    expect(setRoleUsers(ROLES, "sitter", ["a", "a", "b"])[2].users).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("role rules on conditions", () => {
  const screen: VisibilityCondition = {
    condition: "screen",
    media_query: "(min-width: 768px)",
  };

  it("hides for a role with a not condition and keeps the rest", () => {
    const hidden = setRoleHidden([screen], "kids", true);
    expect(hidden).toEqual([
      screen,
      {
        condition: "not",
        conditions: [{ condition: "role", roles: ["kids"] }],
      },
    ]);
    expect(roleRule(hidden, "kids")).toBe("hide");
    expect(roleRule(hidden, "family")).toBe("none");
  });

  it("does not add the same hide twice and removes it again", () => {
    const once = setRoleHidden([], "kids", true);
    expect(setRoleHidden(once, "kids", true)).toHaveLength(1);
    expect(setRoleHidden(once, "kids", false)).toEqual([]);
    expect(setRoleHidden(undefined, "kids", false)).toEqual([]);
  });

  it("reports a role used any other way as custom", () => {
    expect(
      roleRule([{ condition: "role", roles: ["kids", "family"] }], "kids")
    ).toBe("custom");
    expect(
      roleRule(
        [
          {
            condition: "or",
            conditions: [{ condition: "role", roles: ["kids"] }],
          },
        ],
        "kids"
      )
    ).toBe("custom");
  });

  it("is a client-only condition, never sent to the server", () => {
    expect(isPureClientCondition({ condition: "role", roles: ["kids"] })).toBe(
      true
    );
    expect(isPureClientCondition(setRoleHidden([], "kids", true)[0])).toBe(
      true
    );
  });
});

describe("checkConditionsMet with roles", () => {
  const hassFor = (id: string | undefined) =>
    ({
      user: id ? { id } : undefined,
      states: {},
      systemData: { presentation_roles: ROLES },
    }) as unknown as HomeAssistant;

  it("shows only to people in the role", () => {
    const cond = [{ condition: "role", roles: ["kids"] }] as any;
    expect(checkConditionsMet(cond, hassFor("u-kid2"), {})).toBe(true);
    expect(checkConditionsMet(cond, hassFor("u-mum"), {})).toBe(false);
    expect(checkConditionsMet(cond, hassFor(undefined), {})).toBe(false);
  });

  it("hides for people in the role with the one-tap rule", () => {
    const cond = setRoleHidden([], "kids", true) as any;
    expect(checkConditionsMet(cond, hassFor("u-kid1"), {})).toBe(false);
    expect(checkConditionsMet(cond, hassFor("u-mum"), {})).toBe(true);
  });

  it("treats a deleted role as having nobody in it", () => {
    const cond = setRoleHidden([], "deleted", true) as any;
    expect(checkConditionsMet(cond, hassFor("u-kid1"), {})).toBe(true);
  });
});

describe("who can see it", () => {
  it("evaluates a person from role and user conditions", () => {
    const hideKids = setRoleHidden([], "kids", true);
    expect(evaluateForPerson(hideKids, "u-kid1", ROLES)).toBe(false);
    expect(evaluateForPerson(hideKids, "u-mum", ROLES)).toBe(true);
    expect(
      evaluateForPerson(
        [{ condition: "user", users: ["u-mum"] }],
        "u-mum",
        ROLES
      )
    ).toBe(true);
    expect(evaluateForPerson([], "u-mum", ROLES)).toBe(true);
  });

  it("is unknown when the answer depends on more than the person", () => {
    const timed: VisibilityCondition[] = [
      { condition: "time", after: "08:00" },
    ];
    expect(evaluateForPerson(timed, "u-mum", ROLES)).toBeUndefined();
    // A person who is hidden anyway is a definite no, whatever the time.
    expect(
      evaluateForPerson(
        [...timed, ...setRoleHidden([], "kids", true)],
        "u-kid1",
        ROLES
      )
    ).toBe(false);
  });

  it("summarises each role", () => {
    const result = visibilityByRole(setRoleHidden([], "kids", true), ROLES);
    expect(result.map((r) => [r.role.id, r.sees])).toEqual([
      ["kids", "no"],
      // u-kid1 is hidden through the kids role, u-mum is not
      ["family", "some"],
      ["sitter", "empty"],
    ]);
    expect(
      visibilityByRole([{ condition: "time", after: "08:00" }], ROLES)[0].sees
    ).toBe("depends");
    expect(visibilityByRole([], ROLES)[0].sees).toBe("yes");
  });
});
